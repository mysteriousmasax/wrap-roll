import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { printReceipt } from '../utils/escposPrinter.js';
import { sendCrmMessage } from '../utils/crmMessaging.js';
import { createCustomerAccessService } from '../utils/customerAccess.js';
import { isEmailDeliveryConfigured, resolveEmailSender, sendEmail } from '../utils/emailDelivery.js';

const router = Router();

export function normalizePublicCustomerIdentifier(value) {
  return String(value ?? '').trim();
}

export function lookupPublicCustomerProfile(targetDb = db, identifier) {
  const rawValue = normalizePublicCustomerIdentifier(identifier);
  if (!rawValue) return null;
  const customer = targetDb.prepare(`
    SELECT * FROM customers WHERE upper(trim(COALESCE(nfc_tag_code, ''))) = ? LIMIT 1
  `).get(rawValue.toUpperCase());

  if (!customer) return null;

  return {
    id: customer.id,
    name: customer.name,
    rollPoints: Number(customer.roll_points_balance || 0),
    customerSegment: customer.customer_segment || 'regular',
  };
}

function normalizePhoneForLookup(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

function findCustomerForVerification(targetDb, identifier) {
  const value = String(identifier || '').trim();
  if (value.includes('@')) {
    const matches = targetDb.prepare("SELECT * FROM customers WHERE lower(trim(COALESCE(email, ''))) = ?")
      .all(value.toLowerCase());
    return matches.length === 1 ? matches[0] : null;
  }
  const normalizedPhone = normalizePhoneForLookup(value);
  if (normalizedPhone.length < 8) return null;
  const matches = targetDb.prepare("SELECT * FROM customers WHERE COALESCE(phone, '') != ''").all()
    .filter((customer) => normalizePhoneForLookup(customer.phone) === normalizedPhone);
  return matches.length === 1 ? matches[0] : null;
}

export function getFavoriteOrders(targetDb, customerId) {
  const orders = targetDb.prepare(`
    SELECT id, created_at, total FROM orders
    WHERE customer_id = ? AND payment_status IN ('paid', 'completed')
    ORDER BY created_at DESC LIMIT 4
  `).all(customerId);
  if (!orders.length) return [];

  const orderIds = orders.map((order) => order.id);
  const items = targetDb.prepare(`
    SELECT oi.order_id, oi.menu_item_id, oi.name, oi.qty, oi.price, oi.modifiers, oi.special_instructions
    FROM order_items oi
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id IN (${orderIds.map(() => '?').join(',')}) AND (mi.id IS NULL OR mi.active = 1)
    ORDER BY oi.id
  `).all(...orderIds);
  const itemsByOrder = new Map();
  for (const item of items) {
    let modifiers = [];
    try { modifiers = JSON.parse(item.modifiers || '[]'); } catch {}
    const current = itemsByOrder.get(item.order_id) || [];
    current.push({ menuItemId: item.menu_item_id, name: item.name, qty: Number(item.qty || 1), price: Number(item.price || 0), modifiers, specialInstructions: item.special_instructions || '' });
    itemsByOrder.set(item.order_id, current);
  }
  return orders.map((order) => ({
    createdAt: order.created_at,
    total: Number(order.total || 0),
    items: itemsByOrder.get(order.id) || [],
  })).filter((order) => order.items.length > 0);
}

function mapVerifiedCustomer(targetDb, customer) {
  let favoriteItems = [];
  try { favoriteItems = JSON.parse(customer.favorite_items || '[]'); } catch {}
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email || '',
    phone: customer.phone || '',
    rollPoints: Number(customer.roll_points_balance || 0),
    favoriteItems,
    favoriteOrders: getFavoriteOrders(targetDb, customer.id),
  };
}

const customerAccess = createCustomerAccessService({
  findCustomer: (identifier) => findCustomerForVerification(db, identifier),
  deliverCode: async (email, code) => {
    if (!isEmailDeliveryConfigured()) throw new Error('Email delivery is not configured.');
    const sender = resolveEmailSender();
    await sendEmail({
      to: email,
      subject: 'Your Wrap & Roll verification code',
      text: `Your verification code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`,
      html: `<p>Hello,</p><p>Your Wrap &amp; Roll verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request it, you can ignore this email.</p><p>${sender.name}</p>`,
    });
  },
});

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

export function updateCustomerContact(targetDb = db, customerId, input = {}) {
  const current = targetDb.prepare('SELECT id, name, phone, email FROM customers WHERE id = ?').get(customerId);
  if (!current) return { ok: false, error: 'Customer not found' };

  const name = String(input.name ?? current.name).trim();
  const phone = String(input.phone ?? current.phone ?? '').trim();
  const email = String(input.email ?? current.email ?? '').trim().toLowerCase();
  if (!name) return { ok: false, error: 'Customer name is required' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address' };

  const duplicate = findDuplicateCustomerContact(targetDb, current.id, email, phone);
  if (duplicate) return { ok: false, error: 'Another customer already uses that email or phone number' };

  targetDb.prepare('UPDATE customers SET name = ?, phone = ?, email = ? WHERE id = ?').run(name, phone, email, customerId);
  return { ok: true, customer: { id: Number(current.id), name, phone, email } };
}

function findDuplicateCustomerContact(targetDb, excludedId, email, phone) {
  const normalizedPhone = normalizePhoneForLookup(phone);
  return targetDb.prepare('SELECT id, email, phone FROM customers').all().find((customer) =>
    Number(customer.id) !== Number(excludedId)
    && ((email && String(customer.email || '').trim().toLowerCase() === email)
      || (normalizedPhone.length >= 8 && normalizePhoneForLookup(customer.phone) === normalizedPhone))
  ) || null;
}

export function createCustomerContact(targetDb = db, input = {}) {
  const name = String(input.name || '').trim();
  const phone = String(input.phone || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  if (!name) return { ok: false, status: 400, error: 'Name required' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, status: 400, error: 'Enter a valid email address' };
  if (findDuplicateCustomerContact(targetDb, null, email, phone)) {
    return { ok: false, status: 409, error: 'A customer already uses that email or phone number' };
  }
  const result = targetDb.prepare(
    'INSERT INTO customers (name, tier, phone, email, social_links, favorite_items, last_visit) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, input.tier || 'Regular', phone, email, JSON.stringify(input.socialLinks || {}), '[]', new Date().toISOString().slice(0, 10));
  return { ok: true, customerId: Number(result.lastInsertRowid) };
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
      if (Number(order.customer_id) === Number(customer.id)) return true;
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
    'SELECT id, customer_id, customer_name, customer_phone, customer_email, order_type, table_number, order_source, created_at, total FROM orders WHERE customer_name IS NOT NULL OR customer_phone IS NOT NULL OR customer_email IS NOT NULL ORDER BY created_at DESC'
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

router.post('/public/session/request-code', async (req, res) => {
  try {
    res.json(await customerAccess.requestCode(req.body?.identifier, req.ip));
  } catch (error) {
    console.error('Customer verification email failed:', error.message);
    res.status(503).json({ error: 'Verification email could not be sent right now. Please try again later.' });
  }
});

router.post('/public/session/verify-code', (req, res) => {
  const result = customerAccess.verifyCode(req.body?.identifier, req.body?.code);
  if (!result.ok) return res.status(400).json({ error: result.error });
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.customerId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json({ token: result.token, customer: mapVerifiedCustomer(db, customer) });
});

router.get('/public/session', (req, res) => {
  const customerId = customerAccess.customerIdFromSession(req.get('X-Customer-Session'));
  if (!customerId) return res.status(401).json({ error: 'Customer session expired. Verify your contact again.' });
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(mapVerifiedCustomer(db, customer));
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
     WHERE customer_id = ?
       OR (? <> '' AND replace(replace(replace(replace(customer_phone, ' ', ''), '+', ''), '-', ''), '(', '') LIKE '%' || ?)
       OR (? <> '' AND lower(trim(customer_email)) = ?)
       OR (? <> '' AND lower(trim(customer_name)) = ?)
    ORDER BY created_at DESC
    `).all(customer.id, phone, phone, email, email, name, name);
  const items = orders.length
    ? db.prepare('SELECT * FROM order_items WHERE order_id IN (' + orders.map(() => '?').join(',') + ') ORDER BY id').all(...orders.map((order) => order.id))
    : [];
  const itemsByOrder = new Map();
  items.forEach((item) => itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) || []), item]));
  res.json(orders.map((order) => ({ ...order, items: itemsByOrder.get(order.id) || [] })));
});

router.post('/', authMiddleware, (req, res) => {
  const result = createCustomerContact(db, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(201).json(mapCustomer(db.prepare('SELECT * FROM customers WHERE id = ?').get(result.customerId)));
});

router.patch('/:id', authMiddleware, (req, res) => {
  const updated = updateCustomerContact(db, req.params.id, req.body);
  if (!updated.ok) return res.status(updated.error === 'Customer not found' ? 404 : 400).json({ error: updated.error });
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  broadcast('customer:updated', { customerId: customer.id, customer: mapCustomer(customer) });
  res.json(mapCustomer(customer));
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
  let printStatus = req.body?.printLocally === true ? 'native' : 'failed';
  if (req.body?.printLocally !== true) {
    try {
      const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value]));
      const invoice = { ...order, items, invoiceNumber, customer: mapCustomer(customer) };
      await printReceipt(invoice, settings);
      printStatus = 'printed';
    } catch (error) {
      console.warn('Invoice printer unavailable:', error.message);
      const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value]));
      const branchCode = settings.branch_code || 'MAIN';
      const pairedAgent = db.prepare('SELECT id FROM printer_agents WHERE branch_code = ? LIMIT 1').get(branchCode);
      if (process.platform !== 'win32' && pairedAgent) {
        const invoice = { ...order, items, invoiceNumber, customer: mapCustomer(customer) };
        db.prepare(`INSERT INTO printer_document_jobs (document_type, document_id, payload, branch_code, created_at)
          VALUES ('invoice', ?, ?, ?, ?)`)
          .run(invoiceNumber, JSON.stringify(invoice), branchCode, new Date().toISOString());
        printStatus = 'queued';
      }
    }
  }
  res.status(201).json({ invoiceNumber, customer: mapCustomer(customer), order, items, createdAt: now, printStatus });
});

router.post('/:id/message', authMiddleware, async (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  try {
    const result = await sendCrmMessage({ customer, channel: req.body?.channel, message: req.body?.message });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(error.statusCode || 502).json({ error: error.message || 'Unable to send customer message.' });
  }
});

router.post('/whatsapp', authMiddleware, async (req, res) => {
  const { customerId, message, templateName } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  try {
    const result = await sendCrmMessage({ customer, channel: 'whatsapp', message: message || templateName });
    res.json({ ok: true, customer: mapCustomer(customer), ...result });
  } catch (error) {
    res.status(error.statusCode || 502).json({ error: error.message || 'Unable to send WhatsApp message.' });
  }
});

export default router;
