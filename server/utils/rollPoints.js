import db from '../db/database.js';
import { createCustomerOrderMatcher } from './customerOrderMatching.js';

function awardOrder(targetDb, order, findCustomer) {
  const customer = findCustomer(order);
  if (!customer) return null;

  const points = Math.max(0, Math.floor(Number(order.total || 0) / 1000));
  const now = new Date().toISOString();
  const existing = targetDb.prepare("SELECT id, customer_id, points_delta, created_at FROM customer_points_ledger WHERE order_id = ? AND reason = 'order_paid'").all(order.id);
  if (existing.length === 1 && Number(existing[0].customer_id) === Number(customer.id) && Number(existing[0].points_delta) === points) {
    return { customerId: customer.id, points: 0, balance: Number(customer.roll_points_balance || 0), changed: false };
  }

  const affectedCustomerIds = new Set(existing.map((entry) => Number(entry.customer_id)));
  affectedCustomerIds.add(Number(customer.id));
  if (existing.length) targetDb.prepare("DELETE FROM customer_points_ledger WHERE order_id = ? AND reason = 'order_paid'").run(order.id);
  targetDb.prepare('INSERT INTO customer_points_ledger (customer_id, points_delta, reason, order_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(customer.id, points, 'order_paid', order.id, existing[0]?.created_at || now);
  for (const customerId of affectedCustomerIds) {
    targetDb.prepare(`UPDATE customers SET roll_points_balance = COALESCE((
      SELECT SUM(points_delta) FROM customer_points_ledger WHERE customer_id = ?
    ), 0) WHERE id = ?`).run(customerId, customerId);
  }
  const balance = targetDb.prepare('SELECT roll_points_balance FROM customers WHERE id = ?').get(customer.id)?.roll_points_balance || 0;
  return { customerId: customer.id, points, balance: Number(balance), changed: true };
}

export function awardRollPoints(orderId, targetDb = db) {
  const award = targetDb.transaction(() => {
    const order = targetDb.prepare("SELECT id, total, payment_status, customer_id, customer_phone, customer_email, customer_name FROM orders WHERE id = ?").get(orderId);
    if (!order || !['paid', 'completed'].includes(order.payment_status)) return null;
    const customers = targetDb.prepare('SELECT id, name, phone, email, roll_points_balance FROM customers').all();
    return awardOrder(targetDb, order, createCustomerOrderMatcher(customers));
  });
  return award.immediate();
}

export function reconcileRollPoints(targetDb = db) {
  const reconcile = targetDb.transaction(() => {
    const customers = targetDb.prepare('SELECT id, name, phone, email, roll_points_balance FROM customers').all();
    const findCustomer = createCustomerOrderMatcher(customers);
    const paidOrders = targetDb.prepare(`
      SELECT orders.id, orders.total, orders.payment_status, orders.customer_id,
             orders.customer_phone, orders.customer_email, orders.customer_name
      FROM orders
      WHERE orders.payment_status IN ('paid', 'completed')
    `).all();
    let processedOrders = 0;
    let pointsAwarded = 0;
    for (const order of paidOrders) {
      const result = awardOrder(targetDb, order, findCustomer);
      if (!result?.changed) continue;
      processedOrders += 1;
      pointsAwarded += result.points;
    }
    const repairedBalances = targetDb.prepare(`
      UPDATE customers SET roll_points_balance = COALESCE((
        SELECT SUM(points_delta) FROM customer_points_ledger WHERE customer_id = customers.id
      ), 0)
      WHERE EXISTS (SELECT 1 FROM customer_points_ledger WHERE customer_id = customers.id)
        AND roll_points_balance != COALESCE((SELECT SUM(points_delta) FROM customer_points_ledger WHERE customer_id = customers.id), 0)
    `).run().changes;
    return { processedOrders, pointsAwarded, repairedBalances };
  });
  return reconcile.immediate();
}