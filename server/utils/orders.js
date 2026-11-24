import db from '../db/database.js';
import { normalizeTanzanianPhone } from '../../shared/phone.js';

export function formatOrder(row, items, { includeInvoiceEmailStatus = false } = {}) {
  const menuImages = new Map();
  db.prepare('SELECT id, name, image FROM menu_items').all().forEach((item) => {
    menuImages.set(item.id, item.image);
    menuImages.set(item.name, item.image);
  });
  const events = db.prepare(`
    SELECT events.id, events.event_type, events.status, events.occurred_at, events.metadata,
           events.actor_user_id, users.name AS actor_name, users.role AS actor_role
    FROM order_events events
    LEFT JOIN users ON users.id = events.actor_user_id
    WHERE events.order_id = ? ORDER BY events.occurred_at ASC, events.id ASC
  `).all(row.id).map((event) => ({
    id: event.id,
    type: event.event_type,
    status: event.status,
    actorUserId: event.actor_user_id,
    actorName: event.actor_name || 'System',
    actorRole: event.actor_role || 'system',
    occurredAt: event.occurred_at,
    metadata: JSON.parse(event.metadata || '{}'),
  }));
  const creator = row.staff_id ? db.prepare('SELECT name, role FROM users WHERE id = ?').get(row.staff_id) : null;
  const paymentRecord = db.prepare('SELECT * FROM payments WHERE order_id = ? OR payment_reference = ? ORDER BY created_at DESC LIMIT 1').get(row.id, row.payment_reference || '');
  const paymentRecords = db.prepare(`SELECT id, payment_reference, provider, payment_method, amount, currency,
      transaction_id, sender_name, status, paid_at, verified_by, notes, created_at
    FROM payments WHERE order_id = ? ORDER BY created_at, id`).all(row.id);
  const paidAmount = paymentRecords
    .filter((payment) => ['paid', 'completed'].includes(payment.status))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const paymentMethods = [...new Set(paymentRecords
    .filter((payment) => ['paid', 'completed'].includes(payment.status))
    .map((payment) => payment.payment_method)
    .filter((method) => method && String(method).toLowerCase() !== 'tab'))];
  const tabSummary = row.dine_in_tab_id ? db.prepare(`SELECT
      COALESCE(SUM(o.total), 0) AS total,
      COALESCE(SUM((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id AND p.status IN ('paid', 'completed'))), 0) AS paid
    FROM orders o WHERE o.dine_in_tab_id = ?`).get(row.dine_in_tab_id) : null;
  const invoiceEmail = includeInvoiceEmailStatus
    ? db.prepare("SELECT status FROM order_email_outbox WHERE order_id = ? AND email_type = 'paid_invoice' ORDER BY id DESC LIMIT 1").get(row.id)
    : null;
  const refunds = db.prepare(`SELECT r.id, r.payment_id AS paymentId, r.amount, r.reason, r.refund_reference AS refundReference,
      r.status, r.requested_at AS requestedAt, r.processed_at AS processedAt, r.payout_method AS payoutMethod,
      r.payout_reference AS payoutReference, r.approval_notes AS approvalNotes,
      requester.name AS requestedBy, approver.name AS approvedBy, processor.name AS processedBy
    FROM refunds r
    LEFT JOIN users requester ON requester.id = r.requested_by_user_id
    LEFT JOIN users approver ON approver.id = r.approved_by_user_id
    LEFT JOIN users processor ON processor.id = r.processed_by_user_id
    WHERE r.order_id = ? ORDER BY r.requested_at, r.id`).all(row.id);
  const reservedRefundAmount = refunds.filter((refund) => ['pending', 'pending_approval', 'processed'].includes(refund.status))
    .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);

  return {
    id: row.id,
    orderId: row.id,
    orderNumber: row.order_number || row.id,
    type: row.order_type === 'dine-in-postpay' ? 'dine-in' : row.order_type,
    orderType: row.order_type,
    table: row.table_number,
    tabId: row.dine_in_tab_id || null,
    paidAmount,
    balanceDue: Math.max(0, Number(row.total || 0) - paidAmount),
    tabTotal: tabSummary ? Number(tabSummary.total || 0) : null,
    tabPaid: tabSummary ? Number(tabSummary.paid || 0) : null,
    tabBalanceDue: tabSummary ? Math.max(0, Number(tabSummary.total || 0) - Number(tabSummary.paid || 0)) : null,
    payments: paymentRecords.map((payment) => ({
      id: payment.id,
      paymentReference: payment.payment_reference,
      provider: payment.provider,
      method: payment.payment_method,
      amount: Number(payment.amount),
      currency: payment.currency,
      transactionId: payment.transaction_id,
      receivedBy: payment.verified_by || payment.sender_name,
      status: payment.status,
      paidAt: payment.paid_at,
      notes: payment.notes,
      createdAt: payment.created_at,
    })),
    refunds: refunds.map((refund) => ({
      ...refund,
      amount: Number(refund.amount),
    })),
    refundableAmount: Math.max(0, paidAmount - reservedRefundAmount),
    customer: row.customer_name,
    customerPhone: normalizeTanzanianPhone(row.customer_phone),
    customerEmail: row.customer_email,
    customerType: row.customer_type || 'individual',
    companyName: row.company_name || '',
    customerTin: row.customer_tin || '',
    billingAddress: row.billing_address || '',
    deliveryAddress: row.delivery_address,
    deliveryLatitude: row.delivery_latitude,
    deliveryLongitude: row.delivery_longitude,
    scheduledFor: row.delivery_scheduled_for,
    scheduledReleaseAt: row.scheduled_release_at,
    kitchenReleasedAt: row.kitchen_released_at,
    fulfillmentMode: row.fulfillment_mode || 'standard',
    reservationStatus: row.reservation_status || 'none',
    paymentTerms: row.payment_terms || 'prepaid',
    items: items.map((i) => ({
      menuItemId: i.menu_item_id,
      name: i.name,
      qty: i.qty,
      price: i.price,
      prep_time_minutes: Number(i.prep_time_minutes ?? 8),
      image: menuImages.get(i.menu_item_id) || menuImages.get(i.name) || '',
      modifiers: JSON.parse(i.modifiers || '[]'),
      specialInstructions: i.special_instructions,
      ingredients: JSON.parse(i.ingredients || '[]'),
    })),
    status: row.status,
    orderStatus: row.status,
    subtotal: row.subtotal,
    discountAmount: Number(row.discount_amount || 0),
    manualDiscountAmount: Number(row.manual_discount_amount || 0),
    offerDiscountAmount: Number(row.offer_discount_amount || 0),
    discountLabel: row.discount_label || '',
    discountReason: row.discount_reason || '',
    discountSource: row.discount_source || '',
    discountOfferId: row.discount_offer_id || null,
    discountApprovedByUserId: row.discount_approved_by_user_id || null,
    tax: row.tax,
    total: row.total,
    paymentMethod: row.payment_method,
    paymentMethods,
    paymentStatus: row.payment_status || 'pending',
    invoiceEmailStatus: invoiceEmail
      ? (['pending', 'sending'].includes(invoiceEmail.status) ? 'queued' : invoiceEmail.status)
      : null,
    orderSource: row.order_source,
    paymentReference: row.payment_reference || (paymentRecord?.payment_reference || null),
    paidAt: row.paid_at || paymentRecord?.paid_at || null,
    paymentDetails: paymentRecord ? {
      id: paymentRecord.id,
      paymentReference: paymentRecord.payment_reference,
      provider: paymentRecord.provider,
      amount: paymentRecord.amount,
      currency: paymentRecord.currency,
      transactionId: paymentRecord.transaction_id,
      senderPhone: paymentRecord.sender_phone,
      senderName: paymentRecord.sender_name,
      status: paymentRecord.status,
      notes: paymentRecord.notes,
      verifiedBy: paymentRecord.verified_by,
      paidAt: paymentRecord.paid_at,
      createdAt: paymentRecord.created_at,
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: creator ? { userId: row.staff_id, name: creator.name, role: creator.role } : null,
    servedBy: creator ? { userId: row.staff_id, name: creator.name, role: creator.role } : null,
    events,
  };
}

export function getOrderById(id, options = {}) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ? OR order_number = ? OR payment_reference = ?').get(id, id, id);
  if (!row) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(row.id);
  return formatOrder(row, items, options);
}

export function getOrders(filter = {}, options = {}) {
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (filter.status) {
    const statuses = filter.status.split(',').map((s) => s.trim());
    sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  }

  if (filter.paymentStatus) {
    const pStatuses = filter.paymentStatus.split(',').map((s) => s.trim());
    sql += ` AND payment_status IN (${pStatuses.map(() => '?').join(',')})`;
    params.push(...pStatuses);
  }

  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  return rows.map((row) => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(row.id);
    return formatOrder(row, items, options);
  });
}

export function nextOrderId() {
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dar_es_Salaam' })
    .format(new Date())
    .replace(/-/g, '');
  const row = db.prepare('SELECT next_id FROM order_counter WHERE id = 1').get();
  const nextNum = row?.next_id ?? 1001;
  db.prepare('UPDATE order_counter SET next_id = ? WHERE id = 1').run(nextNum + 1);
  return `WR-${dateStr}-${String(nextNum).slice(-4).padStart(4, '0')}`;
}

export function nextPaymentReference(orderNumber) {
  const cleanNum = String(orderNumber || '').replace(/^WR-/, '');
  return `WRPAY-${cleanNum || Date.now().toString().slice(-6)}`;
}
