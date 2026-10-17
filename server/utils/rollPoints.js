import db from '../db/database.js';

function normalizePhoneKey(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
}

function createCustomerMatcher(targetDb) {
  const customers = targetDb.prepare('SELECT id, name, phone, email, roll_points_balance FROM customers').all();
  const customersById = new Map(customers.map((customer) => [Number(customer.id), customer]));
  const phoneMatches = new Map();
  const emailMatches = new Map();
  const nameMatches = new Map();

  const addMatch = (matches, key, customer) => {
    if (!key) return;
    const ids = matches.get(key) || new Set();
    ids.add(Number(customer.id));
    matches.set(key, ids);
  };

  for (const customer of customers) {
    addMatch(phoneMatches, normalizePhoneKey(customer.phone), customer);
    addMatch(emailMatches, String(customer.email || '').trim().toLowerCase(), customer);
    addMatch(nameMatches, String(customer.name || '').trim().toLowerCase(), customer);
  }

  return (order) => {
    if (order.customer_id && customersById.has(Number(order.customer_id))) {
      return customersById.get(Number(order.customer_id));
    }

    const phone = phoneMatches.get(normalizePhoneKey(order.customer_phone));
    const emailKey = String(order.customer_email || '').trim().toLowerCase();
    const email = emailMatches.get(emailKey);
    if (phone && email) {
      const sharedIds = [...phone].filter((id) => email.has(id));
      return sharedIds.length === 1 ? customersById.get(sharedIds[0]) : null;
    }
    const contactIds = phone || email;
    if (contactIds) return contactIds.size === 1 ? customersById.get([...contactIds][0]) : null;

    const nameKey = String(order.customer_name || '').trim().toLowerCase();
    const names = nameMatches.get(nameKey);
    return names?.size === 1 ? customersById.get([...names][0]) : null;
  };
}

function awardOrder(targetDb, order, findCustomer) {
  const customer = findCustomer(order);
  if (!customer) return null;

  const existing = targetDb.prepare("SELECT id FROM customer_points_ledger WHERE order_id = ? AND reason = 'order_paid' LIMIT 1").get(order.id);
  if (existing) return { customerId: customer.id, points: 0, balance: Number(customer.roll_points_balance || 0) };

  const points = Math.max(0, Math.floor(Number(order.total || 0) / 1000));
  const now = new Date().toISOString();
  targetDb.prepare('UPDATE customers SET roll_points_balance = COALESCE(roll_points_balance, 0) + ? WHERE id = ?').run(points, customer.id);
  targetDb.prepare('INSERT INTO customer_points_ledger (customer_id, points_delta, reason, order_id, created_at) VALUES (?, ?, ?, ?, ?)').run(customer.id, points, 'order_paid', order.id, now);
  return { customerId: customer.id, points, balance: Number(customer.roll_points_balance || 0) + points };
}

export function awardRollPoints(orderId, targetDb = db) {
  const award = targetDb.transaction(() => {
    const order = targetDb.prepare("SELECT id, total, payment_status, customer_id, customer_phone, customer_email, customer_name FROM orders WHERE id = ?").get(orderId);
    if (!order || !['paid', 'completed'].includes(order.payment_status)) return null;
    return awardOrder(targetDb, order, createCustomerMatcher(targetDb));
  });
  return award.immediate();
}

export function reconcileRollPoints(targetDb = db) {
  const reconcile = targetDb.transaction(() => {
    const findCustomer = createCustomerMatcher(targetDb);
    const paidOrders = targetDb.prepare(`
      SELECT orders.id, orders.total, orders.payment_status, orders.customer_id,
             orders.customer_phone, orders.customer_email, orders.customer_name
      FROM orders
      WHERE orders.payment_status IN ('paid', 'completed')
        AND NOT EXISTS (
          SELECT 1 FROM customer_points_ledger
          WHERE customer_points_ledger.order_id = orders.id
            AND customer_points_ledger.reason = 'order_paid'
        )
    `).all();
    let processedOrders = 0;
    let pointsAwarded = 0;
    for (const order of paidOrders) {
      const result = awardOrder(targetDb, order, findCustomer);
      if (!result) continue;
      processedOrders += 1;
      pointsAwarded += result.points;
    }
    const repairedBalances = targetDb.prepare(`
      UPDATE customers SET roll_points_balance = (
        SELECT SUM(points_delta) FROM customer_points_ledger WHERE customer_id = customers.id
      )
      WHERE roll_points_balance = 0
        AND COALESCE((SELECT SUM(points_delta) FROM customer_points_ledger WHERE customer_id = customers.id), 0) > 0
    `).run().changes;
    return { processedOrders, pointsAwarded, repairedBalances };
  });
  return reconcile.immediate();
}