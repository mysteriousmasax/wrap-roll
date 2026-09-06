import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { generateOperationsReport, generateStaffAssistantReply } from '../utils/gemini.js';
import { aiProvider, recordAiActivity } from '../utils/aiActivity.js';

const router = Router();
const managementRoles = ['admin', 'manager', 'executive'];

function dateIso(daysAgo = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}

function customerIdentity(row) {
  return [row.customer_name, row.customer_phone, row.customer_email].map((value) => String(value || '').trim().toLowerCase()).find(Boolean) || `order:${row.id}`;
}

function buildSnapshot() {
  const orders = db.prepare(`SELECT id, customer_name, customer_phone, customer_email, order_type, order_source, payment_method, payment_status, status, total, created_at
    FROM orders WHERE status != 'cancelled' ORDER BY created_at DESC`).all();
  const items = db.prepare(`SELECT o.id AS order_id, o.created_at, oi.name, oi.qty, oi.price, mi.category
    FROM orders o INNER JOIN order_items oi ON oi.order_id = o.id LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE o.status != 'cancelled'`).all();
  const customerRows = db.prepare('SELECT * FROM customers ORDER BY name').all();
  const byCustomer = new Map();
  orders.forEach((order) => {
    const key = customerIdentity(order);
    const current = byCustomer.get(key) || { name: order.customer_name || 'Guest customer', phone: order.customer_phone, email: order.customer_email, orders: [], spend: 0, channels: {}, types: {} };
    current.orders.push(order);
    current.spend += Number(order.total || 0);
    const channel = order.order_source || order.order_type || 'pos';
    current.channels[channel] = (current.channels[channel] || 0) + 1;
    current.types[order.order_type || 'unknown'] = (current.types[order.order_type || 'unknown'] || 0) + 1;
    byCustomer.set(key, current);
  });
  const itemByCustomer = new Map();
  items.forEach((item) => {
    const order = orders.find((candidate) => candidate.id === item.order_id);
    if (!order) return;
    const key = customerIdentity(order);
    const current = itemByCustomer.get(key) || {};
    current[item.name] = (current[item.name] || 0) + Number(item.qty || 0);
    itemByCustomer.set(key, current);
  });
  const customers = Array.from(byCustomer.values()).map((customer) => {
    const sortedOrders = customer.orders.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const favorite = Object.entries(itemByCustomer.get(customerIdentity({ customer_name: customer.name, customer_phone: customer.phone, customer_email: customer.email }) ) || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const lastOrder = sortedOrders[0]?.created_at || null;
    const daysSince = lastOrder ? Math.floor((Date.now() - new Date(lastOrder).getTime()) / 86400000) : null;
    const segment = customer.orders.length === 1 ? 'new' : daysSince >= 30 ? 'inactive' : customer.spend >= 100000 || customer.orders.length >= 8 ? 'vip' : daysSince >= 14 ? 'at-risk' : 'regular';
    return { name: customer.name, phone: customer.phone, email: customer.email, orderCount: customer.orders.length, totalSpend: customer.spend, averageOrderValue: customer.spend / customer.orders.length, favoriteItem: favorite, lastOrderAt: lastOrder, daysSinceLastOrder: daysSince, segment, preferredChannel: Object.entries(customer.channels).sort((a, b) => b[1] - a[1])[0]?.[0] || 'pos', deliveryOrders: customer.types.delivery || 0 };
  });
  const last30 = orders.filter((order) => order.created_at >= dateIso(30));
  const repeatCustomers = customers.filter((customer) => customer.orderCount > 1).length;
  const menuSales = db.prepare(`SELECT mi.category, oi.name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.price) AS revenue
    FROM order_items oi INNER JOIN orders o ON o.id = oi.order_id LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE o.status != 'cancelled' GROUP BY mi.category, oi.name ORDER BY revenue DESC LIMIT 20`).all();
  const lowStock = db.prepare('SELECT name, quantity, threshold, expiry_date FROM inventory WHERE (threshold IS NOT NULL AND quantity <= threshold) OR (expiry_date IS NOT NULL AND date(expiry_date) <= date(\'now\', \'+7 day\')) ORDER BY quantity ASC LIMIT 20').all();
  const unresolvedComplaints = db.prepare("SELECT COUNT(*) AS count FROM chat_conversations WHERE status != 'resolved'").get().count;
  const unpaidOrders = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS amount FROM orders WHERE status != 'cancelled' AND (payment_status IS NULL OR payment_status NOT IN ('paid', 'completed'))").get();
  const delayedOrders = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('pending', 'preparing') AND created_at < ?").get(dateIso(1)).count;
  const expenses = db.prepare("SELECT category, SUM(amount) AS amount FROM business_expenses WHERE status != 'rejected' GROUP BY category ORDER BY amount DESC LIMIT 10").all();
  return {
    generatedAt: new Date().toISOString(),
    customerSummary: { total: customers.length, repeatRate: customers.length ? repeatCustomers / customers.length : 0, vip: customers.filter((c) => c.segment === 'vip').length, inactive: customers.filter((c) => c.segment === 'inactive').length, atRisk: customers.filter((c) => c.segment === 'at-risk').length },
    customers: customers.sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 100),
    recentOrders: { last30Days: last30.length, revenue: last30.reduce((sum, order) => sum + Number(order.total || 0), 0) },
    menuSales,
    risks: { lowStock, unresolvedComplaints, unpaidOrders, delayedOrders, cancelledOrders: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'cancelled'").get().count },
    expenses,
    dailyBriefing: { yesterdayOrders: orders.filter((order) => order.created_at >= dateIso(1) && order.created_at < dateIso(0)).length, openTasks: db.prepare("SELECT COUNT(*) AS count FROM staff_tasks WHERE status != 'completed'").get().count },
  };
}

function offlineCrmAnswer(question, snapshot) {
  const normalized = question.toLowerCase();
  if (normalized.includes('30 days') || normalized.includes('inactive')) {
    const inactive = snapshot.customers.filter((customer) => customer.segment === 'inactive');
    return `There are ${inactive.length} inactive customers. ${inactive.slice(0, 10).map((customer) => `${customer.name} (${customer.daysSinceLastOrder} days)`).join(', ') || 'No names available.'}`;
  }
  if (normalized.includes('top 20') || normalized.includes('top customers')) {
    return `Top customers by spend: ${snapshot.customers.slice(0, 20).map((customer) => `${customer.name} (TZS ${Math.round(customer.totalSpend).toLocaleString()})`).join(', ') || 'No customer orders found.'}`;
  }
  if (normalized.includes('complaint')) return `${snapshot.risks.unresolvedComplaints} customer conversations are unresolved. Review the customer support inbox before sending a campaign.`;
  if (normalized.includes('loyalty') || normalized.includes('offer')) return `${snapshot.customerSummary.vip} VIP and ${snapshot.customerSummary.atRisk} at-risk customers are the first groups to review for a loyalty offer.`;
  return `CRM snapshot: ${snapshot.customerSummary.total} customers, ${snapshot.customerSummary.vip} VIP, ${snapshot.customerSummary.inactive} inactive, ${snapshot.risks.unpaidOrders.count} unpaid orders, and ${snapshot.risks.lowStock.length} inventory risks.`;
}

export function createApprovalAction(type, payload = {}) {
  const actionType = String(type || '').trim();
  if (!actionType) throw new Error('Action type is required');

  const normalizedPayload = payload && typeof payload === 'object' ? payload : { value: payload };
  const createdAt = new Date().toISOString();
  const taskTitleMap = {
    inactive_customer_campaign: `Inactive customer campaign approval (${Number(normalizedPayload.count || 0) || 'review'} customers)`,
    vip_loyalty_offer: `VIP loyalty offer approval (${Number(normalizedPayload.count || 0) || 'review'} priority customers)`,
    staff_follow_up: `Customer follow-up approval (${Number(normalizedPayload.complaints || 0) || 'review'} unresolved issues)`,
    default: `CRM action approval for ${actionType}`,
  };

  db.prepare('INSERT INTO notifications (type, title, message, read, created_at) VALUES (?, ?, ?, 0, ?)')
    .run('info', 'CRM action awaiting approval', `${actionType}: ${JSON.stringify(normalizedPayload)}`, createdAt);

  let staffId = db.prepare('SELECT id, user_id FROM staff WHERE status != ? ORDER BY id LIMIT 1').get('removed')?.id;
  let userId = db.prepare('SELECT id, user_id FROM staff WHERE status != ? ORDER BY id LIMIT 1').get('removed')?.user_id;
  if (!staffId) {
    const fallbackName = 'CRM Review Team';
    const existing = db.prepare('SELECT id, user_id FROM staff WHERE name = ?').get(fallbackName);
    if (existing) {
      staffId = existing.id;
      userId = existing.user_id || userId;
    } else {
      const userInsert = db.prepare('INSERT INTO users (name, role, pin, avatar) VALUES (?, ?, ?, ?)');
      userId = userInsert.run(fallbackName, 'manager', '0000', 'CR').lastInsertRowid;
      const staffInsert = db.prepare('INSERT INTO staff (user_id, name, role, shift, status, avatar, phone) VALUES (?, ?, ?, ?, ?, ?, ?)');
      staffId = staffInsert.run(userId, fallbackName, 'Manager', 'Morning', 'off-clock', 'CR', '').lastInsertRowid;
    }
  }
  if (!userId) {
    userId = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()?.id || 1;
  }

  db.prepare('INSERT INTO staff_tasks (staff_id, title, status, due_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(staffId, taskTitleMap[actionType] || taskTitleMap.default, 'open', new Date().toISOString().slice(0, 10), userId, createdAt);

  return { ok: true, status: 'pending_approval', type: actionType, payload: normalizedPayload, createdAt };
}

router.get('/snapshot', authMiddleware, requireRole(...managementRoles), (_req, res) => res.json(buildSnapshot()));

router.post('/swot', authMiddleware, requireRole(...managementRoles), async (_req, res) => {
  const snapshot = buildSnapshot();
  const startedAt = Date.now();
  try {
    const report = await generateOperationsReport({ type: 'restaurant SWOT', snapshot });
    recordAiActivity({ surface: 'crm', action: 'swot', provider: aiProvider(), userId: _req.user?.id, durationMs: Date.now() - startedAt });
    res.json({ report, snapshot });
  } catch (error) {
    recordAiActivity({ surface: 'crm', action: 'swot', provider: 'offline', status: 'failed', userId: _req.user?.id, durationMs: Date.now() - startedAt });
    console.error('CRM SWOT unavailable:', error.message);
    res.status(502).json({ error: 'Unable to generate SWOT analysis right now' });
  }
});

router.post('/briefing', authMiddleware, requireRole(...managementRoles), async (_req, res) => {
  const snapshot = buildSnapshot();
  const startedAt = Date.now();
  try {
    const report = await generateOperationsReport({ type: 'daily restaurant briefing', snapshot });
    recordAiActivity({ surface: 'crm', action: 'daily-briefing', provider: aiProvider(), userId: _req.user?.id, durationMs: Date.now() - startedAt });
    res.json({ report, snapshot });
  } catch (error) {
    recordAiActivity({ surface: 'crm', action: 'daily-briefing', provider: 'offline', status: 'failed', userId: _req.user?.id, durationMs: Date.now() - startedAt });
    console.error('CRM briefing unavailable:', error.message);
    res.status(502).json({ error: 'Unable to generate the daily briefing right now' });
  }
});

router.post('/ask', authMiddleware, requireRole(...managementRoles), async (req, res) => {
  const question = String(req.body.question || '').trim();
  if (!question || question.length > 1200) return res.status(400).json({ error: 'Ask a question between 1 and 1200 characters' });
  try {
    const snapshot = buildSnapshot();
    const startedAt = Date.now();
    const answer = await generateStaffAssistantReply(snapshot, question);
    recordAiActivity({ surface: 'crm', action: 'customer-question', provider: aiProvider(), userId: req.user?.id, durationMs: Date.now() - startedAt, inputLength: question.length });
    res.json({ answer });
  } catch (error) {
    recordAiActivity({ surface: 'crm', action: 'customer-question', provider: 'offline', status: 'failed', userId: req.user?.id, inputLength: question.length });
    console.error('CRM assistant unavailable:', error.message);
    res.json({ answer: offlineCrmAnswer(question, buildSnapshot()), provider: 'offline' });
  }
});

router.post('/actions', authMiddleware, requireRole(...managementRoles), (req, res) => {
  const type = String(req.body.type || '').trim();
  const payload = req.body.payload || {};
  try {
    const result = createApprovalAction(type, payload);
    res.status(202).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to create CRM action' });
  }
});

export default router;
