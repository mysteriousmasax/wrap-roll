import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { printReceipt } from '../utils/escposPrinter.js';

const router = Router();

export function normalizePublicCustomerIdentifier(value) {
  return String(value ?? '').trim();
}

export function lookupPublicCustomerProfile(targetDb = db, identifier) {
  const rawValue = normalizePublicCustomerIdentifier(identifier);
  if (!rawValue) return null;

  const normalizedPhone = rawValue.replace(/\D/g, '');
  const normalizedEmail = rawValue.toLowerCase();
  const normalizedNfc = rawValue.toUpperCase();

  const customer = targetDb.prepare(`
    SELECT * FROM customers
    WHERE (
      (? <> '' AND replace(replace(replace(replace(lower(COALESCE(phone, '')), ' ', ''), '+', ''), '-', ''), '(', '') LIKE '%' || ?)
      OR (? <> '' AND lower(trim(COALESCE(email, ''))) = ?)
      OR (? <> '' AND upper(trim(COALESCE(nfc_tag_code, ''))) = ?)
      OR (? <> '' AND lower(trim(name)) = ?)
    )
    ORDER BY id DESC
    LIMIT 1
  `).get(
    normalizedPhone,
    normalizedPhone,
    normalizedPhone,
    normalizedEmail,
    normalizedNfc,
    normalizedNfc,
    rawValue.toLowerCase(),
    rawValue.toLowerCase()
  );

  if (!customer) return null;

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    nfcTagCode: customer.nfc_tag_code,
    rollPoints: Number(customer.roll_points_balance || 0),
    lifetimeValue: Number(customer.lifetime_value || 0),
    customerSegment: customer.customer_segment || 'regular',
    preferredChannel: customer.preferred_channel || 'pos',
  };
}

export function deleteCustomerCascade(targetDb = db, customerId) {
  const target = targetDb.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!target) return { ok: false, deletedCustomerId: Number(customerId), error: 'Customer not found' };

  const snapshot = { ...target, favoriteItems: (() => {
    try { return JSON.parse(target.favorite_items || '[]'); } catch { return []; }
  })() };

  const transaction = targetDb.transaction(() => {
    targetDb.prepare('DELETE FROM invoices WHERE customer_id = ?').run(customerId);
    targetDb.prepare('DELETE FROM customer_points_ledger WHERE customer_id = ?').run(customerId);
    targetDb.prepare('DELETE FROM loyalty_items WHERE customer_id = ?').run(customerId);
    targetDb.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
  });

  transaction();

  return {
    ok: true,
    deletedCustomerId: Number(customerId),
    customer: snapshot,
  };
}

function normalizeChannel(value) {
  const raw = (value || 'pos').toString().trim().toLowerCase();
  if (!raw) return 'pos';
  if (raw.includes('whatsapp')) return 'whatsapp';
  if (raw.includes('sms') || raw.includes('text') || raw.includes('txt')) return 'sms';
  if (raw.includes('email')) return 'email';
  if (raw.includes('instagram')) return 'instagram';
  if (raw.includes('facebook') || raw.includes('fb')) return 'facebook';
  if (raw.includes('delivery')) return 'delivery';
  if (raw.includes('dine')) return 'dine-in';
  if (raw.includes('online') || raw.includes('web')) return 'website';
  return raw;
}

function mapCustomer(row, extra = {}) {
  let socialLinks = {};
  try { socialLinks = JSON.parse(row.social_links || '{}'); } catch { socialLinks = {}; }
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    lifetimeValue: Number(row.lifetime_value || 0),
    favoriteItems: JSON.parse(row.favorite_items || '[]'),
    lastVisit: row.last_visit,
    phone: row.phone,
    email: row.email,
    socialLinks,
    customerType: row.customer_type || 'individual',
    companyName: row.company_name || '',
    tin: row.tin || '',
    billingAddress: row.billing_address || '',
    visits: Number(row.visits || 0),
    rollPoints: Number(row.roll_points_balance || 0),
    rollPoints: Number(row.roll_points_balance || 0),
    atRisk: !!row.at_risk,
    totalOrders: Number(extra.totalOrders || 0),
    tableVisits: Number(extra.tableVisits || 0),
    dineInVisits: Number(extra.dineInVisits || 0),
    preferredCategory: extra.preferredCategory || 'General',
    favoriteCategories: extra.favoriteCategories || [],
    channel: extra.channel || 'pos',
    lastOrderSource: extra.lastOrderSource || 'pos',
    channels: extra.channels || {
      whatsapp: false,
      sms: false,
      email: false,
      instagram: false,
      facebook: false,
      pos: true,
    },
    orderTypeBreakdown: extra.orderTypeBreakdown || { dineIn: 0, delivery: 0, pickup: 0 },
    loyaltyScore: Number(extra.loyaltyScore || 0),
  };
}

function aggregateCustomerData(customerRows, orderRows, orderItemsByOrder) {
  const customerMap = new Map();

  customerRows.forEach((customer) => {
    const orders = orderRows.filter((order) => {
      const customerName = (customer.name || '').trim().toLowerCase();
      const orderName = (order.customer_name || '').trim().toLowerCase();
      const customerPhone = (customer.phone || '').replace(/\D/g, '');
      const orderPhone = (order.customer_phone || '').replace(/\D/g, '');
      const customerEmail = (customer.email || '').trim().toLowerCase();
      const orderEmail = (order.customer_email || '').trim().toLowerCase();

      return (
        (customerName && orderName && customerName === orderName) ||
        (customerPhone && orderPhone && customerPhone === orderPhone) ||
        (customerEmail && orderEmail && customerEmail === orderEmail)
      );
    });

    const channelCounts = { whatsapp: 0, sms: 0, email: 0, instagram: 0, facebook: 0, pos: 0, website: 0, 'dine-in': 0 };
    const orderTypeBreakdown = { dineIn: 0, delivery: 0, pickup: 0 };
    const categoryCounts = {};

    orders.forEach((order) => {
      const channel = normalizeChannel(order.order_source || (order.order_type === 'dine-in' ? 'dine-in' : 'pos'));
      channelCounts[channel] = (channelCounts[channel] || 0) + 1;

      if (order.order_type === 'dine-in') orderTypeBreakdown.dineIn += 1;
      else if (order.order_type === 'delivery') orderTypeBreakdown.delivery += 1;
      else if (order.order_type === 'pickup') orderTypeBreakdown.pickup += 1;

      const orderCategories = orderItemsByOrder.get(order.id) || [];
      orderCategories.forEach((category) => {
        if (!category) return;
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      });
    });

    const preferredCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'General';
    const favoriteCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);
    const topChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'pos';

    customerMap.set(customer.id, mapCustomer(customer, {
      totalOrders: orders.length,
      tableVisits: orders.filter((order) => order.order_type === 'dine-in' && order.table_number).length,
      dineInVisits: orders.filter((order) => order.order_type === 'dine-in').length,
      preferredCategory,
      favoriteCategories,
      channel: topChannel,
      lastOrderSource: orders[0]?.order_source || 'pos',
      channels: {
        whatsapp: !!channelCounts.whatsapp,
        sms: !!channelCounts.sms,
        email: !!(customer.email || channelCounts.email),
        instagram: !!channelCounts.instagram,
        facebook: !!channelCounts.facebook,
        pos: !!channelCounts.pos || orders.length === 0,
      },
      orderTypeBreakdown,
      loyaltyScore: Math.min(100, Math.round((Number(customer.lifetime_value || 0) / 200) + (orders.length * 8) + (customer.visits || 0))),
    }));
  });

  return Array.from(customerMap.values());
}

router.get('/', authMiddleware, (req, res) => {
  const customerRows = db.prepare('SELECT * FROM customers ORDER BY name').all();
  const orderRows = db.prepare(
    'SELECT id, customer_name, customer_phone, customer_email, order_type, table_number, order_source, created_at, total FROM orders WHERE customer_name IS NOT NULL OR customer_phone IS NOT NULL OR customer_email IS NOT NULL ORDER BY created_at DESC'
  ).all();
  const orderItems = db.prepare(
    `SELECT oi.order_id, mi.category AS category
     FROM order_items oi
     LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id`
  ).all();

  const orderItemsByOrder = new Map();
  orderItems.forEach((item) => {
    if (!item.order_id) return;
    const key = item.order_id;
    const list = orderItemsByOrder.get(key) || [];
    list.push(item.category || 'General');
    orderItemsByOrder.set(key, list);
  });

  res.json(aggregateCustomerData(customerRows, orderRows, orderItemsByOrder));
});

router.get('/public/lookup', (req, res) => {
  const identifier = req.query.identifier || req.query.phone || req.query.nfc || req.query.email || '';
  const customer = lookupPublicCustomerProfile(db, identifier);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
});

router.get('/public/:identifier', (req, res) => {
  const customer = lookupPublicCustomerProfile(db, req.params.identifier);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
});

router.get('/:id/orders', authMiddleware, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const phone = String(customer.phone || '').replace(/\D/g, '');
  const email = String(customer.email || '').trim().toLowerCase();
  const name = String(customer.name || '').trim().toLowerCase();
  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE (? <> '' AND replace(replace(replace(replace(customer_phone, ' ', ''), '+', ''), '-', ''), '(', '') LIKE '%' || ?)
       OR (? <> '' AND lower(trim(customer_email)) = ?)
       OR (? <> '' AND lower(trim(customer_name)) = ?)
    ORDER BY created_at DESC
  `).all(phone, phone, email, email, name, name);
  const items = orders.length
    ? db.prepare('SELECT * FROM order_items WHERE order_id IN (' + orders.map(() => '?').join(',') + ') ORDER BY id').all(...orders.map((order) => order.id))
    : [];
  const itemsByOrder = new Map();
  items.forEach((item) => itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) || []), item]));
  res.json(orders.map((order) => ({ ...order, items: itemsByOrder.get(order.id) || [] })));
});

router.post('/', authMiddleware, (req, res) => {
  const { name, tier, phone, email, socialLinks = {} } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare(
    'INSERT INTO customers (name, tier, phone, email, social_links, favorite_items, last_visit) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, tier || 'Regular', phone || '', email || '', JSON.stringify(socialLinks || {}), '[]', new Date().toISOString().slice(0, 10));
  res.status(201).json(mapCustomer(db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid)));
});

router.delete('/:id', authMiddleware, (req, res) => {
  const deleted = deleteCustomerCascade(db, req.params.id);
  if (!deleted.ok) return res.status(404).json({ error: 'Customer not found' });

  broadcast('customer:deleted', { customerId: Number(req.params.id), customer: deleted.customer });
  res.json({ ok: true, deletedCustomerId: Number(req.params.id) });
});

router.patch('/:id/loyalty', authMiddleware, (req, res) => {
  const { tier, birthday, anniversary, customerSegment, nfcTagCode, nfcTagType, loyaltyNotes, preferredChannel, customerType, companyName, tin, billingAddress, socialLinks, itemType, itemName, itemCode, status } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  db.prepare(
    `UPDATE customers SET
      tier = COALESCE(?, tier),
      birthday = COALESCE(?, birthday),
      anniversary = COALESCE(?, anniversary),
      customer_segment = COALESCE(?, customer_segment),
      nfc_tag_code = COALESCE(?, nfc_tag_code),
      nfc_tag_type = COALESCE(?, nfc_tag_type),
      loyalty_notes = COALESCE(?, loyalty_notes),
      preferred_channel = COALESCE(?, preferred_channel),
      customer_type = COALESCE(?, customer_type),
      company_name = COALESCE(?, company_name),
      tin = COALESCE(?, tin),
      billing_address = COALESCE(?, billing_address)
      ,social_links = COALESCE(?, social_links)
    WHERE id = ?`
  ).run(tier ?? null, birthday ?? null, anniversary ?? null, customerSegment ?? null, nfcTagCode ?? null, nfcTagType ?? null, loyaltyNotes ?? null, preferredChannel ?? null, customerType ?? null, companyName ?? null, tin ?? null, billingAddress ?? null, socialLinks === undefined ? null : JSON.stringify(socialLinks || {}), req.params.id);

  if (itemName || itemType || itemCode) {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO loyalty_items (customer_id, item_name, item_type, item_code, status, issue_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.params.id, itemName || 'Key Holder', itemType || 'key_holder', itemCode || null, status || 'active', new Date().toISOString().slice(0, 10), loyaltyNotes || '', now);
  }

  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  broadcast('customer:updated', { customerId: updated.id, customer: mapCustomer(updated) });
  res.json(mapCustomer(updated));
});

router.post('/:id/invoices', authMiddleware, async (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const order = db.prepare(`SELECT * FROM orders WHERE (customer_phone = ? OR customer_email = ? OR customer_name = ?)
    AND payment_status IN ('paid', 'completed') ORDER BY created_at DESC LIMIT 1`).get(customer.phone || '', customer.email || '', customer.name);
  if (!order) return res.status(400).json({ error: 'No paid order found for this customer' });
  const items = db.prepare('SELECT name, qty, price, modifiers, special_instructions FROM order_items WHERE order_id = ?').all(order.id);
  const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(order.id).replace(/\D/g, '').slice(-6)}`;
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO invoices (invoice_number, customer_id, order_id, customer_type, company_name, tin, billing_address, subtotal, tax, total, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(invoiceNumber, customer.id, order.id, customer.customer_type || 'individual', customer.company_name || null, customer.tin || null, customer.billing_address || null, order.subtotal, order.tax, order.total, now);
  let printStatus = 'failed';
  try {
    const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value]));
    await printReceipt({ ...order, items, invoiceNumber, customer: mapCustomer(customer) }, settings);
    printStatus = 'printed';
  } catch (error) {
    console.warn('Invoice printer unavailable:', error.message);
  }
  res.status(201).json({ invoiceNumber, customer: mapCustomer(customer), order, items, createdAt: now, printStatus });
});

router.post('/whatsapp', authMiddleware, (req, res) => {
  const { customerId, message, templateName } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO notifications (type, title, message, read, created_at) VALUES (?, ?, ?, 0, ?)'
  ).run('success', 'WhatsApp Sent', `Message sent to ${customer.name}: ${message || templateName}`, now);

  res.json({ ok: true, customer: mapCustomer(customer), message: message || templateName });
});

export default router;
