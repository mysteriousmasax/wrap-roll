import db from '../db/database.js';

export function awardRollPoints(orderId) {
  const order = db.prepare('SELECT id, total, customer_phone, customer_email, customer_name FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  const customer = db.prepare('SELECT * FROM customers WHERE (phone = ? AND phone != \'\') OR (email = ? AND email != \'\') OR name = ? ORDER BY id DESC LIMIT 1').get(order.customer_phone || '', order.customer_email || '', order.customer_name || '');
  if (!customer) return null;
  const points = Math.max(0, Math.floor(Number(order.total || 0) / 1000));
  const existing = db.prepare("SELECT id FROM customer_points_ledger WHERE customer_id = ? AND order_id = ? AND reason = 'order_paid'").get(customer.id, order.id);
  if (existing) return { customerId: customer.id, points: 0, balance: Number(customer.roll_points_balance || 0) };
  const now = new Date().toISOString();
  db.prepare('UPDATE customers SET roll_points_balance = COALESCE(roll_points_balance, 0) + ? WHERE id = ?').run(points, customer.id);
  db.prepare('INSERT INTO customer_points_ledger (customer_id, points_delta, reason, order_id, created_at) VALUES (?, ?, ?, ?, ?)').run(customer.id, points, 'order_paid', order.id, now);
  return { customerId: customer.id, points, balance: Number(customer.roll_points_balance || 0) + points };
}