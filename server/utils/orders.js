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
  return {
    id: row.id,
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
    subtotal: row.subtotal,
    tax: row.tax,
    total: row.total,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    orderSource: row.order_source,
    paymentReference: row.payment_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: creator ? { userId: row.staff_id, name: creator.name, role: creator.role } : null,
    servedBy: creator ? { userId: row.staff_id, name: creator.name, role: creator.role } : null,
    events,
  };
}

export function getOrderById(id) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!row) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
  return formatOrder(row, items);
}

export function getOrders(filter = {}) {
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (filter.status) {
    const statuses = filter.status.split(',');
    sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  }

  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  return rows.map((row) => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(row.id);
    return formatOrder(row, items);
  });
}

export function nextOrderId() {
  const row = db.prepare('SELECT next_id FROM order_counter WHERE id = 1').get();
  const id = row?.next_id ?? 1001;
  db.prepare('UPDATE order_counter SET next_id = ? WHERE id = 1').run(id + 1);
  return `WR-${id}`;
}
