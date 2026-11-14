import { randomUUID } from 'node:crypto';
import { applyOrderFulfillmentEffects } from './orderFulfillment.js';

const ACCEPTED_TAB_PAYMENT_METHODS = new Set(['cash', 'lipa_namba', 'card', 'bank_transfer', 'other']);

function getOrderPaidAmount(db, orderId) {
  const row = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS amount FROM payments
    WHERE order_id = ? AND status IN ('paid', 'completed')`).get(orderId);
  return Number(row?.amount || 0);
}

function getOrderBalance(db, order) {
  return Math.max(0, Math.round((Number(order.total || 0) - getOrderPaidAmount(db, order.id)) * 100) / 100);
}

export function getOpenDineInTab(db, tableNumber) {
  return db.prepare("SELECT * FROM dine_in_tabs WHERE table_number = ? AND status = 'open'").get(Number(tableNumber)) || null;
}

export function getDineInTabSummary(db, tabId) {
  const tab = db.prepare('SELECT * FROM dine_in_tabs WHERE id = ?').get(tabId);
  if (!tab) return null;
  const orders = db.prepare('SELECT id, order_number, status, payment_status, total, created_at FROM orders WHERE dine_in_tab_id = ? ORDER BY created_at, id')
    .all(tabId);
  const tickets = orders.map((order) => {
    const paidAmount = Math.min(Number(order.total || 0), Number(order.total || 0) - getOrderBalance(db, order));
    return {
      id: order.id,
      orderNumber: order.order_number || order.id,
      status: order.status,
      paymentStatus: order.payment_status,
      total: Number(order.total || 0),
      paid: Math.max(0, paidAmount),
      balanceDue: getOrderBalance(db, order),
      createdAt: order.created_at,
    };
  });
  const total = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
  const paid = tickets.reduce((sum, ticket) => sum + ticket.paid, 0);
  const payments = db.prepare(`SELECT p.id, p.order_id AS orderId, p.payment_reference AS paymentReference,
      p.payment_method AS method, p.amount, p.currency, p.transaction_id AS transactionId,
      p.sender_name AS receivedBy, p.status, p.paid_at AS paidAt, p.notes
    FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE o.dine_in_tab_id = ? AND p.status IN ('paid', 'completed')
    ORDER BY p.created_at, p.id`).all(tabId);
  return {
    id: tab.id,
    tableNumber: tab.table_number,
    status: tab.status,
    customerName: tab.customer_name || '',
    customerPhone: tab.customer_phone || '',
    customerEmail: tab.customer_email || '',
    openedAt: tab.opened_at,
    closedAt: tab.closed_at,
    total,
    paid,
    balanceDue: Math.max(0, Math.round((total - paid) * 100) / 100),
    tickets,
    payments,
  };
}

export function closeSettledDineInTab(db, tabId, closedBy = null, now = new Date().toISOString()) {
  const tab = db.prepare("SELECT * FROM dine_in_tabs WHERE id = ? AND status = 'open'").get(tabId);
  if (!tab) return false;
  const summary = getDineInTabSummary(db, tabId);
  if (!summary || summary.balanceDue > 0 || !summary.tickets.length || summary.tickets.some((ticket) => ticket.status !== 'completed')) {
    return false;
  }
  const close = db.transaction(() => {
    const result = db.prepare("UPDATE dine_in_tabs SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ? AND status = 'open'")
      .run(now, closedBy, tabId);
    if (!result.changes) return false;
    db.prepare(`UPDATE tables SET status = 'cleaning', current_order_id = NULL, current_tab_id = NULL,
      cleaning_started_at = ? WHERE number = ? AND current_tab_id = ?`)
      .run(now, tab.table_number, tabId);
    return true;
  });
  return close();
}

export function recordDineInTabPayments(db, { tableId, payments, receivedBy, receivedByUserId = null, now = new Date().toISOString() }, { applyFulfillment = applyOrderFulfillmentEffects } = {}) {
  if (!Array.isArray(payments) || payments.length < 1 || payments.length > 10) {
    throw new Error('Add between 1 and 10 payment parts.');
  }
  const normalizedPayments = payments.map((payment) => {
    const amount = Number(payment?.amount);
    const method = String(payment?.method || '').trim().toLowerCase();
    const transactionId = String(payment?.transactionId || '').trim().slice(0, 120);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Each payment amount must be a positive whole number of TZS.');
    if (!ACCEPTED_TAB_PAYMENT_METHODS.has(method)) throw new Error('Choose a supported payment method for each part.');
    if (method === 'lipa_namba' && !transactionId) throw new Error('Enter the verified mobile-money transaction reference.');
    return { amount, method, transactionId };
  });

  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(Number(tableId));
  if (!table) throw new Error('Table not found.');
  const tab = getOpenDineInTab(db, table.number);
  if (!tab || table.status !== 'occupied') throw new Error('This table has no active dine-in tab.');

  const totalReceived = normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const paidOrderIds = new Set();
  const applyPayments = db.transaction(() => {
    const summary = getDineInTabSummary(db, tab.id);
    if (!summary || summary.status !== 'open') throw new Error('This tab is already closed.');
    if (totalReceived > summary.balanceDue) throw new Error(`Payment exceeds the balance due of ${summary.balanceDue} TZS.`);

    const orders = db.prepare(`SELECT id, total, payment_status FROM orders WHERE dine_in_tab_id = ?
      ORDER BY created_at, id`).all(tab.id);
    const balances = orders.map((order) => ({ order, due: getOrderBalance(db, order) }));
    const insertPayment = db.prepare(`INSERT INTO payments (
      id, order_id, payment_reference, provider, payment_method, amount, currency, transaction_id,
      received_by_user_id, sender_name, status, notes, verified_by, paid_at, initiated_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'pos_tab', ?, ?, 'TZS', ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?)`);
    const updateOrder = db.prepare(`UPDATE orders SET payment_status = ?, paid_at = CASE WHEN ? = 1 THEN ? ELSE paid_at END,
      updated_at = ? WHERE id = ?`);
    const insertEvent = db.prepare(`INSERT INTO order_events
      (order_id, event_type, status, actor_user_id, occurred_at, metadata)
      VALUES (?, 'payment_received', ?, NULL, ?, ?)`);
    let orderIndex = 0;
    for (const payment of normalizedPayments) {
      let remaining = payment.amount;
      while (remaining > 0) {
        while (orderIndex < balances.length && balances[orderIndex].due <= 0) orderIndex += 1;
        if (orderIndex >= balances.length) throw new Error('The remaining tab balance could not be allocated.');
        const allocation = Math.min(remaining, balances[orderIndex].due);
        const order = balances[orderIndex].order;
        const reference = `WR-TAB-${randomUUID().replaceAll('-', '').toUpperCase()}`;
        insertPayment.run(
          `PAY-${randomUUID()}`,
          order.id,
          reference,
          payment.method,
          allocation,
          payment.transactionId || null,
          receivedByUserId,
          receivedBy || 'Staff',
          `Table ${table.number} tab payment`,
          receivedBy || 'Staff',
          now,
          now,
          now,
          now
        );
        remaining -= allocation;
        balances[orderIndex].due -= allocation;
        const orderIsPaid = balances[orderIndex].due <= 0;
        updateOrder.run(orderIsPaid ? 'paid' : 'partially_paid', orderIsPaid ? 1 : 0, now, now, order.id);
        insertEvent.run(order.id, 'paid', now, JSON.stringify({
          source: 'dine_in_tab',
          tableNumber: table.number,
          amount: allocation,
          method: payment.method,
          paymentReference: reference,
        }));
        if (orderIsPaid) paidOrderIds.add(order.id);
      }
    }
  });
  applyPayments();
  paidOrderIds.forEach((orderId) => applyFulfillment(orderId));
  closeSettledDineInTab(db, tab.id, receivedBy, now);
  return getDineInTabSummary(db, tab.id);
}
