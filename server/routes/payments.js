/**
 * Payment Routes - Wrap & Roll Tanzania
 * Endpoints for:
 * - Payment intent creation (Lipa Namba, TIPS QR, M-Pesa, Mixx, Airtel, Halopesa)
 * - Customer manual payment reference submission (I Have Paid -> MANUAL_REVIEW)
 * - Automated Webhook processing (Signature, amount verification, idempotency)
 * - Admin manual verification and rejection
 * - Real-time customer payment status checking
 * - Admin payment dashboard listing & filters
 */

import express from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { getOrderById } from '../utils/orders.js';
import {
  manualLipaProvider,
  genericWebhookProvider,
  MOBILE_NETWORKS,
  PAYMENT_STATUSES,
  ORDER_STATUSES,
} from '../utils/paymentProviders.js';

const router = express.Router();

/**
 * Get available payment methods & Lipa Namba info
 * GET /api/payments/methods
 */
router.get('/methods', (req, res) => {
  try {
    const lipaNumber = process.env.LIPA_NUMBER || '45342017';
    const merchantName = process.env.MERCHANT_NAME || 'PETER JOSEPH MSIRA';
    const provider = process.env.LIPA_PROVIDER || 'TIPS / Mixx by Yas';

    res.json({
      success: true,
      lipaNumber,
      merchantName,
      provider,
      supportedCurrencies: ['TZS', 'USD', 'KES'],
      methods: [
        {
          id: 'lipa_namba',
          label: 'Lipa Namba (TIPS)',
          description: 'Lipa kutoka mitandao yote ya simu (Mixx, M-Pesa, Airtel, Halopesa) na Benki',
          number: lipaNumber,
          name: merchantName,
        },
      ],
      networks: MOBILE_NETWORKS,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create payment intent for an order
 * POST /api/payments/create-intent
 * Body: { orderId, provider, senderPhone }
 */
router.post('/create-intent', async (req, res) => {
  const { orderId, provider = 'lipa_namba', senderPhone = '' } = req.body;

  if (!orderId) {
    return res.status(400).json({ success: false, error: 'orderId is required' });
  }

  try {
    const order = getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: `Order ${orderId} not found` });
    }

    const paymentRef = order.paymentReference || `WRPAY-${order.id.replace(/^WR-/, '')}`;
    
    // Ensure order record has payment reference stored
    db.prepare('UPDATE orders SET payment_reference = ? WHERE id = ?').run(paymentRef, order.id);

    const intent = await manualLipaProvider.createPaymentIntent({
      order,
      paymentReference: paymentRef,
      provider,
      senderPhone: senderPhone || order.customerPhone,
    });

    res.json({
      success: true,
      ...intent,
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Customer submits manual transaction code / clicks "I Have Paid"
 * POST /api/payments/submit-manual
 * Body: { paymentReference, transactionId, senderPhone, senderName, notes }
 * RESULT: Sets payment_status = 'manual_review', order_status remains 'pending_payment'
 */
router.post('/submit-manual', async (req, res) => {
  const { paymentReference, transactionId, senderPhone, senderName, notes } = req.body;

  if (!paymentReference) {
    return res.status(400).json({ success: false, error: 'paymentReference is required' });
  }

  try {
    const result = await manualLipaProvider.submitManualPayment({
      paymentReference: paymentReference.trim(),
      transactionId: transactionId?.trim(),
      senderPhone: senderPhone?.trim(),
      senderName: senderName?.trim(),
      notes: notes?.trim(),
    });

    const updatedOrder = getOrderById(result.orderId);
    if (updatedOrder) {
      broadcast('order:updated', updatedOrder);
      broadcast('payment:manual_review', {
        orderId: result.orderId,
        paymentReference,
        transactionId: transactionId?.trim(),
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Submit manual payment error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Public payment status check endpoint for customer tracking
 * GET /api/payments/:paymentReference/status
 */
router.get('/:paymentReference/status', (req, res) => {
  const { paymentReference } = req.params;

  try {
    const payment = db.prepare(
      'SELECT * FROM payments WHERE payment_reference = ? OR order_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(paymentReference, paymentReference);

    if (!payment) {
      // If no payment record yet, check order directly
      const order = db.prepare('SELECT id, status, payment_status, total, payment_reference FROM orders WHERE id = ? OR payment_reference = ?').get(paymentReference, paymentReference);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Payment or order reference not found' });
      }
      return res.json({
        success: true,
        orderId: order.id,
        paymentReference: order.payment_reference || paymentReference,
        status: order.payment_status || 'pending',
        orderStatus: order.status || 'pending_payment',
        amount: order.total,
        paidAt: null,
      });
    }

    const order = db.prepare('SELECT status, payment_status FROM orders WHERE id = ?').get(payment.order_id);

    res.json({
      success: true,
      paymentId: payment.id,
      orderId: payment.order_id,
      paymentReference: payment.payment_reference,
      status: payment.status,
      orderStatus: order?.status || 'pending_payment',
      amount: payment.amount,
      currency: payment.currency,
      provider: payment.provider,
      transactionId: payment.transaction_id,
      notes: payment.notes,
      paidAt: payment.paid_at,
      verifiedBy: payment.verified_by,
      updatedAt: payment.updated_at,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Automated Webhook endpoint for Mobile Money / Payment Gateway notifications
 * POST /api/payments/webhook
 */
router.post('/webhook', async (req, res) => {
  try {
    const result = await genericWebhookProvider.handleWebhook({
      payload: req.body,
      headers: req.headers,
    });

    if (result.orderId) {
      const updatedOrder = getOrderById(result.orderId);
      if (updatedOrder) {
        broadcast('order:updated', updatedOrder);
        if (result.status === PAYMENT_STATUSES.PAID) {
          broadcast('order:confirmed', updatedOrder);
          broadcast('payment:confirmed', {
            orderId: result.orderId,
            paymentReference: result.paymentReference,
            amount: result.amount,
            transactionId: result.transactionId,
          });
        }
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Payment webhook error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Admin manual payment verification
 * POST /api/payments/:paymentReference/verify-manual
 */
router.post('/:paymentReference/verify-manual', authMiddleware, async (req, res) => {
  const { paymentReference } = req.params;
  const { notes } = req.body || {};
  const staffName = req.user?.name || req.user?.username || 'Admin';

  try {
    const result = await manualLipaProvider.verifyManualPayment({
      paymentReference,
      verifiedBy: staffName,
      notes,
    });

    const updatedOrder = getOrderById(result.orderId);
    if (updatedOrder) {
      broadcast('order:updated', updatedOrder);
      broadcast('order:confirmed', updatedOrder);
      broadcast('payment:confirmed', {
        orderId: result.orderId,
        paymentReference,
        verifiedBy: staffName,
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Verify manual payment error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Admin manual payment rejection
 * POST /api/payments/:paymentReference/reject-manual
 */
router.post('/:paymentReference/reject-manual', authMiddleware, async (req, res) => {
  const { paymentReference } = req.params;
  const { reason = 'Payment rejected by staff' } = req.body || {};
  const staffName = req.user?.name || req.user?.username || 'Admin';

  try {
    const result = await manualLipaProvider.rejectManualPayment({
      paymentReference,
      verifiedBy: staffName,
      reason,
    });

    const updatedOrder = getOrderById(result.orderId);
    if (updatedOrder) {
      broadcast('order:updated', updatedOrder);
      broadcast('payment:rejected', {
        orderId: result.orderId,
        paymentReference,
        reason,
        verifiedBy: staffName,
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Reject manual payment error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Admin payments list with search and filters
 * GET /api/payments/list
 */
router.get('/list', authMiddleware, (req, res) => {
  const { status, search, limit = 50, offset = 0 } = req.query;

  try {
    let sql = `
      SELECT p.*, o.order_number, o.customer_name, o.customer_phone, o.total AS order_total, o.status AS order_status
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      const statuses = status.split(',').map((s) => s.trim().toLowerCase());
      sql += ` AND lower(p.status) IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }

    if (search) {
      const term = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (
        lower(p.payment_reference) LIKE ? OR
        lower(p.order_id) LIKE ? OR
        lower(COALESCE(o.order_number, '')) LIKE ? OR
        lower(COALESCE(p.transaction_id, '')) LIKE ? OR
        lower(COALESCE(p.sender_phone, '')) LIKE ? OR
        lower(COALESCE(o.customer_phone, '')) LIKE ? OR
        lower(COALESCE(p.sender_name, '')) LIKE ? OR
        lower(COALESCE(o.customer_name, '')) LIKE ?
      )`;
      params.push(term, term, term, term, term, term, term, term);
    }

    sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const rows = db.prepare(sql).all(...params);

    const counts = {
      all: db.prepare('SELECT COUNT(*) as count FROM payments').get().count,
      manual_review: db.prepare("SELECT COUNT(*) as count FROM payments WHERE status = 'manual_review'").get().count,
      paid: db.prepare("SELECT COUNT(*) as count FROM payments WHERE status = 'paid'").get().count,
      pending: db.prepare("SELECT COUNT(*) as count FROM payments WHERE status = 'pending'").get().count,
      failed: db.prepare("SELECT COUNT(*) as count FROM payments WHERE status = 'failed'").get().count,
    };

    res.json({
      success: true,
      payments: rows.map((r) => ({
        id: r.id,
        orderId: r.order_id,
        orderNumber: r.order_number || r.order_id,
        paymentReference: r.payment_reference,
        provider: r.provider,
        amount: r.amount,
        currency: r.currency,
        transactionId: r.transaction_id,
        senderPhone: r.sender_phone || r.customer_phone,
        senderName: r.sender_name || r.customer_name,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        status: r.status,
        orderStatus: r.order_status,
        notes: r.notes,
        verifiedBy: r.verified_by,
        paidAt: r.paid_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      counts,
    });
  } catch (error) {
    console.error('List payments error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
