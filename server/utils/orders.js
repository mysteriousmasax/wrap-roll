import db from '../db/database.js';

export function formatOrder(row, items) {
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

  return {
    id: row.id,
    orderId: row.id,
    orderNumber: row.order_number || row.id,
    type: row.order_type,
    table: row.table_number,
    customer: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    deliveryAddress: row.delivery_address,
    deliveryLatitude: row.delivery_latitude,
    deliveryLongitude: row.delivery_longitude,
    scheduledFor: row.delivery_scheduled_for,
    items: items.map((i) => ({
      menuItemId: i.menu_item_id,
      name: i.name,
      qty: i.qty,
      price: i.price,
      prep_time_minutes: Number(i.prep_time_minutes ?? 8),
      image: menuImages.get(i.menu_item_id) || menuImages.get(i.name) || '',
      modifiers: JSON.parse(i.modifiers || '[]'),
      specialInstructions: i.special_instructions,
    })),
    status: row.status,
    orderStatus: row.status,
    subtotal: row.subtotal,
    tax: row.tax,
    total: row.total,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status || 'pending',
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

export function getOrderById(id) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ? OR order_number = ? OR payment_reference = ?').get(id, id, id);
  if (!row) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(row.id);
  return formatOrder(row, items);
}

export function getOrders(filter = {}) {
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
    return formatOrder(row, items);
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
