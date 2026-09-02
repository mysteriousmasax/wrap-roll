/**
 * Payment Routes - Secure payment processing endpoints
 */

import express from 'express';
import crypto from 'crypto';
import {
  createPesapalOrder,
  checkPaymentStatus,
  validatePaymentWebhook,
  refundPayment,
  PESAPAL_PAYMENT_METHODS,
} from '../utils/payment.js';
import { authMiddleware } from '../middleware/auth.js';
import db from '../db/database.js';

const router = express.Router();

/**
 * Get available payment methods
 * GET /api/payments/methods
 */
router.get('/methods', (req, res) => {
  try {
    res.json({
      success: true,
      methods: PESAPAL_PAYMENT_METHODS,
      supportedCurrencies: ['TZS', 'USD', 'KES'],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Initiate payment for an order
 * POST /api/payments/initiate
 * Body: { orderId, amount, currency, customerEmail, customerPhone, paymentMethod }
 */
router.post('/initiate', async (req, res) => {
  const { orderId, amount, currency = 'TZS', customerEmail, customerPhone, paymentMethod } = req.body;

  // Input validation
  if (!orderId || !amount || !customerEmail || !paymentMethod) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: orderId, amount, customerEmail, paymentMethod',
    });
  }

  // Validate payment method
  const validMethod = PESAPAL_PAYMENT_METHODS.find((m) => m.id === paymentMethod);
  if (!validMethod) {
    return res.status(400).json({
      success: false,
      error: 'Invalid payment method',
      availableMethods: PESAPAL_PAYMENT_METHODS.map((m) => m.id),
    });
  }

  // Validate amount
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid amount' });
  }

  try {
    // Verify order exists in database
    const orderExists = db.prepare('SELECT id, total FROM orders WHERE id = ?').get(orderId);
    if (!orderExists) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Get callback URLs from environment or request
    const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const callbackUrl = `${baseUrl}/api/payments/webhook`;
    const redirectUrl = `${baseUrl}/pos/success?orderId=${orderId}`;

    // Initiate Pesapal order
    const paymentOrder = await createPesapalOrder({
      orderId,
      amount,
      currency,
      description: `Wrap & Roll Order - ${orderId}`,
      customerEmail,
      customerPhone,
      paymentMethod,
      callbackUrl,
      redirectUrl,
    });

    // Store payment record in database
    const paymentId = `PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(
      `
      INSERT INTO payments (
        id, order_id, amount, currency, payment_method, 
        pesapal_order_id, status, initiated_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      paymentId,
      orderId,
      amount,
      currency,
      paymentMethod,
      paymentOrder.orderTrackingId,
      'initiated',
      new Date().toISOString(),
      new Date().toISOString()
    );

    res.json({
      success: true,
      paymentId,
      orderTrackingId: paymentOrder.orderTrackingId,
      redirectUrl: paymentOrder.redirectUrl,
      amount,
      currency,
      paymentMethod: validMethod.label,
    });
  } catch (error) {
    console.error('Payment initiation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate payment',
      details: error.message,
    });
  }
});

/**
 * Check payment status
 * GET /api/payments/:paymentId/status
 */
router.get('/:paymentId/status', async (req, res) => {
  const { paymentId } = req.params;

  try {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    // Check status with Pesapal
    const statusResult = await checkPaymentStatus(payment.pesapal_order_id);

    // Update payment status in database
    db.prepare(
      'UPDATE payments SET status = ?, updated_at = ? WHERE id = ?'
    ).run(statusResult.statusCode === 1 ? 'completed' : 'pending', new Date().toISOString(), paymentId);

    res.json({
      success: true,
      paymentId,
      orderId: payment.order_id,
      status: statusResult.status,
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.payment_method,
      updatedAt: statusResult.lastUpdated,
    });
  } catch (error) {
    console.error('Status check failed:', error);
    res.status(500).json({ success: false, error: 'Failed to check payment status' });
  }
});

/**
 * Webhook endpoint for Pesapal payment notifications
 * POST /api/payments/webhook
 */
router.post('/webhook', async (req, res) => {
  const { order_tracking_id, status } = req.body;

  // Validate webhook signature (important for security)
  const signature = req.headers['x-pesapal-signature'];
  if (!signature) {
    console.warn('Webhook received without signature');
    // For production, this should reject the request
  }

  try {
    // Find payment by Pesapal order ID
    const payment = db.prepare('SELECT * FROM payments WHERE pesapal_order_id = ?').get(order_tracking_id);

    if (!payment) {
      console.warn(`Webhook received for unknown order: ${order_tracking_id}`);
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Validate webhook with Pesapal
    const validation = await validatePaymentWebhook(order_tracking_id, req.body);

    if (!validation.valid) {
      console.error(`Webhook validation failed: ${validation.reason}`);
      return res.status(400).json({ success: false, error: 'Webhook validation failed' });
    }

    // Determine payment status
    let newStatus = 'pending';
    if (validation.statusCode === 1) {
      newStatus = 'completed';

      // Update order status in database
      db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run('paid', payment.order_id);

      console.log(`✓ Payment confirmed for order: ${payment.order_id}`);
    } else if (validation.statusCode === 2) {
      newStatus = 'pending';
    } else {
      newStatus = 'failed';
      db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run('failed', payment.order_id);
    }

    // Update payment record
    db.prepare('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?').run(
      newStatus,
      new Date().toISOString(),
      payment.id
    );

    res.json({
      success: true,
      orderId: payment.order_id,
      status: newStatus,
    });
  } catch (error) {
    console.error('Webhook processing failed:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * Refund payment
 * POST /api/payments/:paymentId/refund
 */
router.post('/:paymentId/refund', authMiddleware, async (req, res) => {
  const { paymentId } = req.params;
  const { reason, amount } = req.body;

  // Only admin or manager can process refunds
  if (!['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Insufficient permissions' });
  }

  try {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({ success: false, error: 'Only completed payments can be refunded' });
    }

    // Process refund
    const refundResult = await refundPayment(payment.pesapal_order_id, amount);

    // Record refund in database
    const refundId = `REF-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(
      `
      INSERT INTO refunds (
        id, payment_id, order_id, amount, reason, pesapal_refund_id, 
        status, requested_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      refundId,
      paymentId,
      payment.order_id,
      amount || payment.amount,
      reason || 'Customer requested',
      refundResult.refundId,
      'processed',
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Update order status
    db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run('refunded', payment.order_id);

    res.json({
      success: true,
      refundId,
      amount: refundResult.amount,
      status: refundResult.status,
    });
  } catch (error) {
    console.error('Refund processing failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process refund',
      details: error.message,
    });
  }
});

export default router;
