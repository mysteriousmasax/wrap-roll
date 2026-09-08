/**
 * Payment Provider Abstraction Layer for Wrap & Roll Tanzania
 * Supports:
 * 1. Lipa Namba / TIPS QR / Manual SMS reference verification
 * 2. Automated Webhook-based mobile money & gateway verifications (M-Pesa, Mixx, Airtel, Halopesa)
 */

import crypto from 'crypto';
import db from '../db/database.js';

export const PAYMENT_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  MANUAL_REVIEW: 'manual_review',
  PAID: 'paid',
  FAILED: 'failed',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
};

export const ORDER_STATUSES = {
  PENDING_PAYMENT: 'pending_payment',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const MOBILE_NETWORKS = {
  MIXX: {
    id: 'mixx',
    name: 'Mixx by Yas / TIPS',
    ussd: '*150*01#',
    steps: [
      'Piga *150*01#',
      'Chagua 4 (Lipa kwa Simu / TIPS)',
      'Chagua 1 (Lipa Namba)',
      'Weka Lipa Namba: 45342017 (PETER JOSEPH MSIRA)',
      'Weka Kiasi cha Kulipa',
      'Weka Kumbukumbu Namba: [WRPAY_REF]',
      'Weka PIN yako kukamilisha malipo',
    ],
  },
  MPESA: {
    id: 'mpesa',
    name: 'Vodacom M-Pesa',
    ussd: '*150*00#',
    steps: [
      'Piga *150*00#',
      'Chagua 4 (Lipa kwa M-Pesa)',
      'Chagua 1 (Lipa kwa Simu / Mitandao Yote - TIPS)',
      'Weka Lipa Namba: 45342017 (PETER JOSEPH MSIRA)',
      'Weka Kiasi cha Kulipa',
      'Weka Namba ya Kumbukumbu: [WRPAY_REF]',
      'Weka PIN yako kuthibitisha',
    ],
  },
  AIRTEL: {
    id: 'airtel',
    name: 'Airtel Money',
    ussd: '*150*60#',
    steps: [
      'Piga *150*60#',
      'Chagua 5 (Lipa Bili / Lipa kwa Simu)',
      'Chagua 1 (Mitandao Mingine / TIPS)',
      'Weka Lipa Namba: 45342017 (PETER JOSEPH MSIRA)',
      'Weka Kiasi cha Kulipa',
      'Weka Kumbukumbu Namba: [WRPAY_REF]',
      'Weka PIN yako kuthibitisha',
    ],
  },
  HALOPESA: {
    id: 'halopesa',
    name: 'Halopesa',
    ussd: '*150*88#',
    steps: [
      'Piga *150*88#',
      'Chagua 5 (Lipa kwa Halopesa / TIPS)',
      'Weka Lipa Namba: 45342017 (PETER JOSEPH MSIRA)',
      'Weka Kiasi cha Kulipa',
      'Weka Kumbukumbu: [WRPAY_REF]',
      'Weka PIN yako kuthibitisha',
    ],
  },
};

/**
 * Base Payment Provider Interface
 */
export class BasePaymentProvider {
  constructor(name) {
    this.name = name;
  }

  async createPaymentIntent({ order, paymentReference, provider = 'lipa_namba' }) {
    throw new Error('createPaymentIntent must be implemented');
  }

  async handleWebhook({ payload, headers }) {
    throw new Error('handleWebhook must be implemented');
  }
}

/**
 * Manual Lipa Namba / TIPS Provider
 * Handles merchant Lipa Namba (45342017 - PETER JOSEPH MSIRA) with TIPS QR code and SMS verification
 */
export class ManualLipaProvider extends BasePaymentProvider {
  constructor() {
    super('lipa_namba');
  }

  async createPaymentIntent({ order, paymentReference, provider = 'lipa_namba', senderPhone = '' }) {
    const lipaNumber = process.env.LIPA_NUMBER || '45342017';
    const merchantName = process.env.MERCHANT_NAME || 'PETER JOSEPH MSIRA';
    const paymentId = `PAY-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();

    // Generate TIPS standardized QR payload format
    const qrPayload = `TIPS|MERCHANT|${lipaNumber}|${merchantName}|AMOUNT|${order.total}|REF|${paymentReference}|CURRENCY|TZS`;

    // Record in payments table
    db.prepare(`
      INSERT INTO payments (
        id, order_id, payment_reference, provider, payment_method, amount, currency,
        sender_phone, status, provider_response, initiated_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(payment_reference) DO UPDATE SET
        amount = excluded.amount,
        sender_phone = COALESCE(excluded.sender_phone, sender_phone),
        updated_at = excluded.updated_at
    `).run(
      paymentId,
      order.id,
      paymentReference,
      provider,
      provider,
      order.total,
      'TZS',
      senderPhone || order.customerPhone || null,
      PAYMENT_STATUSES.PENDING,
      JSON.stringify({ lipaNumber, merchantName, qrPayload }),
      now,
      now,
      now
    );

    return {
      paymentId,
      orderId: order.id,
      orderNumber: order.orderNumber || order.id,
      paymentReference,
      amount: order.total,
      currency: 'TZS',
      lipaNumber,
      merchantName,
      qrPayload,
      status: PAYMENT_STATUSES.PENDING,
      networks: MOBILE_NETWORKS,
    };
  }

  async submitManualPayment(referenceOrData, maybeDetails = {}) {
    const data = typeof referenceOrData === 'object' && referenceOrData !== null
      ? referenceOrData
      : { paymentReference: referenceOrData, ...maybeDetails };
    const { paymentReference, transactionId, senderPhone, senderName, notes } = data;

    const payment = db.prepare('SELECT * FROM payments WHERE payment_reference = ?').get(paymentReference);
    if (!payment) {
      throw new Error(`Payment reference '${paymentReference}' not found.`);
    }

    const now = new Date().toISOString();
    const cleanTxnId = String(transactionId || '').trim();

    // Check if this transaction ID was already used for a different verified payment
    if (cleanTxnId) {
      const existingTxn = db.prepare(
        "SELECT id, order_id, status FROM payments WHERE transaction_id = ? AND payment_reference != ? AND status = 'paid'"
      ).get(cleanTxnId, paymentReference);
      if (existingTxn) {
        throw new Error(`Transaction ID '${cleanTxnId}' has already been verified for order ${existingTxn.order_id}.`);
      }
    }

    // Update payment record to MANUAL_REVIEW
    db.prepare(`
      UPDATE payments SET
        transaction_id = COALESCE(?, transaction_id),
        sender_phone = COALESCE(?, sender_phone),
        sender_name = COALESCE(?, sender_name),
        notes = COALESCE(?, notes),
        status = ?,
        updated_at = ?
      WHERE payment_reference = ?
    `).run(
      cleanTxnId || null,
      senderPhone || null,
      senderName || null,
      notes || null,
      PAYMENT_STATUSES.MANUAL_REVIEW,
      now,
      paymentReference
    );

    // Keep order status as PENDING_PAYMENT, set payment_status to MANUAL_REVIEW
    db.prepare(`
      UPDATE orders SET
        payment_status = ?,
        status = ?,
        updated_at = ?
      WHERE id = ? OR payment_reference = ?
    `).run(PAYMENT_STATUSES.MANUAL_REVIEW, ORDER_STATUSES.PENDING_PAYMENT, now, payment.order_id, paymentReference);

    // Record order event
    db.prepare(`
      INSERT INTO order_events (order_id, event_type, status, occurred_at, metadata)
      VALUES (?, 'payment_submitted', ?, ?, ?)
    `).run(
      payment.order_id,
      ORDER_STATUSES.PENDING_PAYMENT,
      now,
      JSON.stringify({
        paymentReference,
        transactionId: cleanTxnId,
        senderPhone,
        senderName,
        status: PAYMENT_STATUSES.MANUAL_REVIEW,
      })
    );

    // Create staff notification
    db.prepare(`
      INSERT INTO notifications (type, title, message, read, created_at)
      VALUES ('info', 'New Payment Claim Submitted', ?, 0, ?)
    `).run(
      `Customer submitted claim for Order ${payment.order_id} (Ref: ${paymentReference}, Txn: ${cleanTxnId || 'N/A'}). Verification required.`,
      now
    );

    const updatedPayment = db.prepare('SELECT * FROM payments WHERE payment_reference = ?').get(paymentReference);

    return {
      success: true,
      paymentReference,
      payment: updatedPayment,
      orderId: payment.order_id,
      status: PAYMENT_STATUSES.MANUAL_REVIEW,
      message: 'Payment details submitted for manual review. Order will be confirmed once verified by staff.',
    };
  }

  async verifyManualPayment(referenceOrData, maybeDetails = {}) {
    const data = typeof referenceOrData === 'object' && referenceOrData !== null
      ? referenceOrData
      : { paymentReference: referenceOrData, ...maybeDetails };
    const { paymentReference, verifiedBy, notes } = data;

    const payment = db.prepare('SELECT * FROM payments WHERE payment_reference = ?').get(paymentReference);
    if (!payment) throw new Error(`Payment reference '${paymentReference}' not found.`);

    const now = new Date().toISOString();

    // Mark payment as PAID
    db.prepare(`
      UPDATE payments SET
        status = ?,
        verified_by = ?,
        notes = COALESCE(?, notes),
        paid_at = ?,
        updated_at = ?
      WHERE payment_reference = ?
    `).run(PAYMENT_STATUSES.PAID, verifiedBy || 'Staff', notes || null, now, now, paymentReference);

    // Mark order as CONFIRMED (releases to Kitchen)
    db.prepare(`
      UPDATE orders SET
        payment_status = ?,
        status = ?,
        paid_at = ?,
        updated_at = ?
      WHERE id = ? OR payment_reference = ?
    `).run(PAYMENT_STATUSES.PAID, ORDER_STATUSES.CONFIRMED, now, now, payment.order_id, paymentReference);

    // Add order audit event
    db.prepare(`
      INSERT INTO order_events (order_id, event_type, status, occurred_at, metadata)
      VALUES (?, 'payment_verified', ?, ?, ?)
    `).run(
      payment.order_id,
      ORDER_STATUSES.CONFIRMED,
      now,
      JSON.stringify({
        paymentReference,
        verifiedBy: verifiedBy || 'Staff',
        status: PAYMENT_STATUSES.PAID,
      })
    );

    // Notification
    db.prepare(`
      INSERT INTO notifications (type, title, message, read, created_at)
      VALUES ('success', 'Payment Confirmed', ?, 0, ?)
    `).run(
      `Payment of TZS ${payment.amount.toLocaleString()} for Order ${payment.order_id} verified by ${verifiedBy || 'Staff'}. Order sent to kitchen.`,
      now
    );

    const updatedPayment = db.prepare('SELECT * FROM payments WHERE payment_reference = ?').get(paymentReference);

    return {
      success: true,
      paymentReference,
      payment: updatedPayment,
      orderId: payment.order_id,
      paymentStatus: PAYMENT_STATUSES.PAID,
      orderStatus: ORDER_STATUSES.CONFIRMED,
    };
  }

  async rejectManualPayment(referenceOrData, maybeDetails = {}) {
    const data = typeof referenceOrData === 'object' && referenceOrData !== null
      ? referenceOrData
      : { paymentReference: referenceOrData, ...maybeDetails };
    const { paymentReference, verifiedBy, reason, notes } = data;

    const payment = db.prepare('SELECT * FROM payments WHERE payment_reference = ?').get(paymentReference);
    if (!payment) throw new Error(`Payment reference '${paymentReference}' not found.`);

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE payments SET
        status = ?,
        verified_by = ?,
        notes = ?,
        updated_at = ?
      WHERE payment_reference = ?
    `).run(PAYMENT_STATUSES.FAILED, verifiedBy || 'Staff', reason || notes || 'Payment rejected by staff', now, paymentReference);

    db.prepare(`
      UPDATE orders SET
        payment_status = ?,
        status = ?,
        updated_at = ?
      WHERE id = ? OR payment_reference = ?
    `).run(PAYMENT_STATUSES.FAILED, ORDER_STATUSES.PENDING_PAYMENT, now, payment.order_id, paymentReference);

    db.prepare(`
      INSERT INTO order_events (order_id, event_type, status, occurred_at, metadata)
      VALUES (?, 'payment_rejected', ?, ?, ?)
    `).run(
      payment.order_id,
      ORDER_STATUSES.PENDING_PAYMENT,
      now,
      JSON.stringify({
        paymentReference,
        verifiedBy: verifiedBy || 'Staff',
        reason: reason || notes || 'Rejected by staff',
        status: PAYMENT_STATUSES.FAILED,
      })
    );

    const updatedPayment = db.prepare('SELECT * FROM payments WHERE payment_reference = ?').get(paymentReference);

    return {
      success: true,
      paymentReference,
      payment: updatedPayment,
      orderId: payment.order_id,
      paymentStatus: PAYMENT_STATUSES.FAILED,
      orderStatus: ORDER_STATUSES.PENDING_PAYMENT,
    };
  }
}

/**
 * Generic Automated Webhook Provider
 * Supports automated mobile money / payment gateway webhooks (M-Pesa, Mixx, Airtel, AzamPay, Pesapal)
 * Features:
 * - Signature validation
 * - Idempotency protection (checks transaction_id)
 * - Amount verification (prevents underpayment fraud)
 * - Automatic order release to kitchen upon valid confirmation
 */
export class GenericWebhookProvider extends BasePaymentProvider {
  constructor() {
    super('automated_webhook');
  }

  async handleWebhook({ payload, headers = {} }) {
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;

    // Optional webhook signature verification
    if (webhookSecret && headers['x-payment-signature']) {
      const computedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
        .digest('hex');
      if (computedSig !== headers['x-payment-signature']) {
        throw new Error('Invalid webhook signature');
      }
    }

    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

    // Extract standardized fields from incoming provider payload
    const paymentReference = String(
      data.payment_reference || data.paymentReference || data.reference || data.order_id || data.orderId || ''
    ).trim();
    const transactionId = String(
      data.transaction_id || data.transactionId || data.mpesa_receipt || data.receipt || data.trans_id || ''
    ).trim();
    const amountReceived = Number(data.amount || data.amount_paid || data.trans_amount || 0);
    const senderPhone = String(data.sender_phone || data.msisdn || data.phone || '').trim();
    const senderName = String(data.sender_name || data.customer_name || '').trim();
    const providerStatus = String(data.status || data.result_code || data.result || 'success').toLowerCase();

    if (!paymentReference) {
      throw new Error('Missing payment_reference in webhook payload');
    }

    // Locate matching payment record
    const payment = db.prepare(
      'SELECT * FROM payments WHERE payment_reference = ? OR order_id = ?'
    ).get(paymentReference, paymentReference);

    if (!payment) {
      throw new Error(`No payment record found matching reference '${paymentReference}'`);
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id);
    if (!order) {
      throw new Error(`Order ${payment.order_id} not found.`);
    }

    const now = new Date().toISOString();

    // Idempotency check: Has this transaction ID already been processed and marked paid?
    if (transactionId) {
      const existingPaidTxn = db.prepare(
        "SELECT id, status FROM payments WHERE transaction_id = ? AND status = 'paid'"
      ).get(transactionId);
      if (existingPaidTxn) {
        return {
          success: true,
          duplicate: true,
          message: `Transaction ${transactionId} was already processed as paid.`,
          orderId: payment.order_id,
          paymentReference,
        };
      }
    }

    // Determine success vs failure from provider status
    const isSuccess = ['success', 'paid', 'completed', '0', '00'].includes(providerStatus);

    if (!isSuccess) {
      // Mark as FAILED
      db.prepare(`
        UPDATE payments SET
          status = ?,
          transaction_id = COALESCE(?, transaction_id),
          provider_response = ?,
          updated_at = ?
        WHERE id = ?
      `).run(PAYMENT_STATUSES.FAILED, transactionId || null, JSON.stringify(data), now, payment.id);

      db.prepare(`
        UPDATE orders SET
          payment_status = ?,
          updated_at = ?
        WHERE id = ?
      `).run(PAYMENT_STATUSES.FAILED, now, payment.order_id);

      return {
        success: true,
        orderId: payment.order_id,
        status: PAYMENT_STATUSES.FAILED,
      };
    }

    // Amount Verification: Fraud / Underpayment Prevention
    const expectedAmount = Number(order.total || payment.amount);
    if (amountReceived < expectedAmount) {
      // Underpayment detected -> Do NOT confirm order. Set to MANUAL_REVIEW with security notice.
      const mismatchNote = `Security Alert: Underpayment detected. Expected TZS ${expectedAmount}, received TZS ${amountReceived}. Transaction ID: ${transactionId}`;
      console.warn(mismatchNote);

      db.prepare(`
        UPDATE payments SET
          status = ?,
          amount = ?,
          transaction_id = ?,
          sender_phone = COALESCE(?, sender_phone),
          notes = ?,
          provider_response = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        PAYMENT_STATUSES.MANUAL_REVIEW,
        amountReceived,
        transactionId || null,
        senderPhone || null,
        mismatchNote,
        JSON.stringify(data),
        now,
        payment.id
      );

      db.prepare(`
        UPDATE orders SET
          payment_status = ?,
          status = ?,
          updated_at = ?
        WHERE id = ?
      `).run(PAYMENT_STATUSES.MANUAL_REVIEW, ORDER_STATUSES.PENDING_PAYMENT, now, payment.order_id);

      db.prepare(`
        INSERT INTO notifications (type, title, message, read, created_at)
        VALUES ('error', 'Payment Amount Mismatch', ?, 0, ?)
      `).run(mismatchNote, now);

      return {
        success: false,
        fraudAlert: true,
        orderId: payment.order_id,
        status: PAYMENT_STATUSES.MANUAL_REVIEW,
        message: 'Payment received is less than order total. Held for manual review.',
      };
    }

    // Exact or Full Amount Verified -> Set PAID and CONFIRMED (Release to Kitchen)
    db.prepare(`
      UPDATE payments SET
        status = ?,
        amount = ?,
        transaction_id = ?,
        sender_phone = COALESCE(?, sender_phone),
        sender_name = COALESCE(?, sender_name),
        provider_response = ?,
        paid_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      PAYMENT_STATUSES.PAID,
      amountReceived,
      transactionId || null,
      senderPhone || null,
      senderName || null,
      JSON.stringify(data),
      now,
      now,
      payment.id
    );

    db.prepare(`
      UPDATE orders SET
        payment_status = ?,
        status = ?,
        paid_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(PAYMENT_STATUSES.PAID, ORDER_STATUSES.CONFIRMED, now, now, payment.order_id);

    db.prepare(`
      INSERT INTO order_events (order_id, event_type, status, occurred_at, metadata)
      VALUES (?, 'payment_received', ?, ?, ?)
    `).run(
      payment.order_id,
      ORDER_STATUSES.CONFIRMED,
      now,
      JSON.stringify({
        paymentReference,
        transactionId,
        amount: amountReceived,
        senderPhone,
        status: PAYMENT_STATUSES.PAID,
      })
    );

    db.prepare(`
      INSERT INTO notifications (type, title, message, read, created_at)
      VALUES ('success', 'Automatic Payment Verified', ?, 0, ?)
    `).run(
      `Order ${payment.order_id} - TZS ${amountReceived.toLocaleString()} received via ${payment.provider}. Order sent to kitchen.`,
      now
    );

    return {
      success: true,
      orderId: payment.order_id,
      paymentReference,
      status: PAYMENT_STATUSES.PAID,
      orderStatus: ORDER_STATUSES.CONFIRMED,
      amount: amountReceived,
      transactionId,
    };
  }
}

export const manualLipaProvider = new ManualLipaProvider();
export const genericWebhookProvider = new GenericWebhookProvider();

export function getPaymentProvider(providerName = 'lipa_namba') {
  if (providerName === 'lipa_namba' || providerName === 'manual') {
    return manualLipaProvider;
  }
  return genericWebhookProvider;
}
