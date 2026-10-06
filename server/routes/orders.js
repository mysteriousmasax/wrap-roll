import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { deletionViewer, recordDeletion } from '../utils/deletionPolicy.js';
import { broadcast } from '../ws.js';
import { getOrderById, getOrders, nextOrderId, nextPaymentReference } from '../utils/orders.js';
import { buildOrderConfirmationMessage, getCustomerNotificationChannels } from '../utils/orderNotifications.js';
import { PAYMENT_STATUSES, ORDER_STATUSES } from '../utils/paymentProviders.js';
import { enqueueOrderEmail } from '../utils/orderEmailService.js';
import { releaseExpiredCleaningTables } from '../utils/tableAvailability.js';
import { parseMenuVariants } from '../utils/menuVariants.js';
import { applyOrderFulfillmentEffects } from '../utils/orderFulfillment.js';
import { createRoadsideAccessToken, hashRoadsideAccessToken } from '../utils/roadsideAccess.js';

const router = Router();

function parseMenuIngredients(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [];
}

function priceOrderItems(items, { allowCustom = false } = {}) {
  const findMenuItem = db.prepare('SELECT id, name, price, variants, prep_time_minutes, ingredients FROM menu_items WHERE id = ? AND active = 1');
  const findModifier = db.prepare('SELECT name, price, type FROM modifiers WHERE name = ?');
  const pricedItems = items.map((item) => {
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Each order item must have a valid menu item and quantity');

    if (item.isCustom === true && allowCustom) {
      const name = String(item.name || '').trim();
      const price = Number(item.price);
      if (!name || !Number.isFinite(price) || price <= 0) throw new Error('Each custom order item must have a name and valid price');
      return {
        menuItemId: null,
        name,
        qty,
        price,
        prepTimeMinutes: 8,
        modifiers: [],
        specialInstructions: item.specialInstructions || null,
        ingredients: [],
      };
    }

    const menuItem = findMenuItem.get(Number(item.menuItemId));
    if (!menuItem) throw new Error('Each order item must have a valid menu item and quantity');
    const variants = parseMenuVariants(menuItem.variants);
    let variant = null;
    if (variants.length) {
      variant = variants.find((option) => option.name === String(item.variantName || '').trim());
      if (!variant) throw new Error(`Choose an available size for ${menuItem.name}`);
    } else if (item.variantName) {
      throw new Error(`The selected size is no longer available for ${menuItem.name}`);
    }
    const modifierNames = Array.isArray(item.modifiers) ? item.modifiers.map((modifier) => typeof modifier === 'string' ? modifier : modifier.name) : [];
    const modifiers = modifierNames.map((name) => findModifier.get(name)).filter(Boolean);
    if (modifiers.length !== modifierNames.length) throw new Error('One or more modifiers are unavailable');
    const price = (variant?.price ?? menuItem.price) + modifiers.reduce((sum, modifier) => sum + (modifier.type === 'add' ? modifier.price : 0), 0);
    return {
      menuItemId: menuItem.id,
      name: variant ? `${menuItem.name} (${variant.name})` : menuItem.name,
      qty,
      price,
      prepTimeMinutes: Number(menuItem.prep_time_minutes ?? 8),
      variantName: variant?.name || null,
      modifiers: modifierNames,
      specialInstructions: item.specialInstructions || null,
      ingredients: parseMenuIngredients(menuItem.ingredients),
    };
  });
  return { items: pricedItems, subtotal: pricedItems.reduce((sum, item) => sum + item.price * item.qty, 0) };
}

function createOrderRecord(
  {
    items,
    orderType,
    tableNumber,
    customerName,
    customerPhone,
    customerEmail,
    customerType = 'individual',
    companyName = '',
    customerTin = '',
    billingAddress = '',
    deliveryAddress,
    deliveryLatitude,
    deliveryLongitude,
    paymentMethod = 'lipa_namba',
    scheduledFor,
    fulfillmentMode = 'standard',
    paymentTerms = 'prepaid',
    paymentTiming = 'pay-now',
    orderSource = 'website',
    paymentReference = null,
  },
  staffId = null
) {
  const normalizedCustomerType = String(customerType || 'individual').trim().toLowerCase();
  const normalizedCompanyName = String(companyName || '').trim();
  const normalizedCustomerTin = String(customerTin || '').trim();
  if (!['individual', 'company'].includes(normalizedCustomerType)) throw new Error('Customer type must be individual or company');
  if (normalizedCustomerType === 'company' && (!normalizedCompanyName || !normalizedCustomerTin)) {
    throw new Error('Company name and TIN are required for company invoices');
  }

  const priced = priceOrderItems(items, { allowCustom: Boolean(staffId) });
  const subtotal = priced.subtotal;
  const taxRateValue = Number(db.prepare("SELECT value FROM settings WHERE key = 'tax_rate'").get()?.value ?? 8);
  const taxRate = Number.isFinite(taxRateValue) && taxRateValue > 0 ? taxRateValue / 100 : 0;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  const normalizedFulfillmentMode = String(fulfillmentMode || 'standard');
  if (!['standard', 'roadside_handoff'].includes(normalizedFulfillmentMode)) throw new Error('Choose a valid fulfillment option');
  const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
  if (scheduledFor && (!scheduledDate || Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date())) {
    throw new Error('Choose a future pickup or delivery time');
  }
  if (scheduledDate && scheduledDate.getTime() > Date.now() + 14 * 24 * 60 * 60 * 1000) {
    throw new Error('Orders can only be scheduled up to 14 days ahead');
  }
  const normalizedPaymentTerms = String(paymentTerms || 'prepaid');
  if (!['prepaid', 'invoice'].includes(normalizedPaymentTerms)) throw new Error('Choose valid payment terms');
  let approvedInvoiceTerms = null;
  if (normalizedPaymentTerms === 'invoice') {
    if (normalizedCustomerType !== 'company') throw new Error('Invoice terms are available only to approved company accounts');
    approvedInvoiceTerms = db.prepare(`SELECT t.customer_id FROM company_order_terms t
      JOIN customers c ON c.id = t.customer_id
      WHERE t.status = 'approved' AND lower(trim(c.tin)) = lower(trim(?))
        AND lower(trim(c.company_name)) = lower(trim(?)) AND t.credit_limit >= ?`)
      .get(normalizedCustomerTin, normalizedCompanyName, total);
    if (!approvedInvoiceTerms) throw new Error('This company account is not approved for invoice terms or the order exceeds its credit limit');
    const outstanding = Number(db.prepare(`SELECT COALESCE(SUM(total), 0) AS amount FROM orders
      WHERE customer_id = ? AND payment_terms = 'invoice' AND payment_status NOT IN ('paid', 'completed') AND status != 'cancelled'`)
      .get(approvedInvoiceTerms.customer_id)?.amount || 0);
    const creditLimit = Number(db.prepare('SELECT credit_limit FROM company_order_terms WHERE customer_id = ?').get(approvedInvoiceTerms.customer_id)?.credit_limit || 0);
    if (outstanding + total > creditLimit) throw new Error('This order exceeds the company account’s remaining credit limit');
  }
  if (orderType === 'dine-in') {
    if (!tableNumber) throw new Error('A table number is required for dine-in orders');
    releaseExpiredCleaningTables(db);
    const table = db.prepare('SELECT status FROM tables WHERE number = ?').get(Number(tableNumber));
    if (!table) throw new Error('Table not found');
    if (table.status !== 'available') throw new Error('Table is not available');
  }

  const id = nextOrderId();
  const paymentRef = (paymentReference?.trim()) || nextPaymentReference(id);
  const now = new Date().toISOString();

  // Determine initial status based on payment and source
  const isStaffCashImmediate = staffId && (paymentMethod === 'cash' || paymentTiming === 'paid-cash');
  const initialPaymentStatus = isStaffCashImmediate ? PAYMENT_STATUSES.PAID : PAYMENT_STATUSES.PENDING;
  const isInvoiceTerms = Boolean(approvedInvoiceTerms);
  const initialOrderStatus = isStaffCashImmediate || isInvoiceTerms ? ORDER_STATUSES.CONFIRMED : ORDER_STATUSES.PENDING_PAYMENT;
  const paidAt = isStaffCashImmediate ? now : null;
  const reservationStatus = scheduledDate || normalizedFulfillmentMode === 'roadside_handoff'
    ? (isStaffCashImmediate || isInvoiceTerms ? 'confirmed' : 'awaiting_payment')
    : 'none';
  const maxPrepMinutes = Math.max(...priced.items.map((item) => item.prepTimeMinutes || 8));
  const scheduledReleaseAt = scheduledDate
    ? new Date(scheduledDate.getTime() - (maxPrepMinutes + 5) * 60 * 1000).toISOString()
    : null;
  const roadsideAccessToken = normalizedFulfillmentMode === 'roadside_handoff' ? createRoadsideAccessToken(id) : null;

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, order_number, order_type, table_number, customer_id, customer_name, customer_phone, customer_email,
      customer_type, company_name, customer_tin, billing_address,
      delivery_address, delivery_latitude, delivery_longitude, delivery_scheduled_for,
      subtotal, tax, total, payment_method, payment_status, order_source, payment_reference,
      fulfillment_mode, reservation_status, payment_terms, scheduled_release_at,
      status, paid_at, created_at, updated_at, staff_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, menu_item_id, name, qty, price, prep_time_minutes, modifiers, special_instructions, ingredients)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPayment = db.prepare(`
    INSERT INTO payments (
      id, order_id, payment_reference, provider, payment_method, amount, currency,
      sender_phone, sender_name, status, paid_at, initiated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'TZS', ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    // Customer identity: match by phone, email, or company TIN so each real
    // customer maps to exactly one record (never grouped under a shared "Guest").
    const normalizedEmail = String(customerEmail || '').trim().toLowerCase();
    const normalizedPhone = String(customerPhone || '').trim();
    const normalizedName = String(customerName || '').trim().toLowerCase();
    const hasIdentity = Boolean(normalizedPhone || normalizedEmail || (normalizedCustomerType === 'company' && normalizedCustomerTin) || customerName?.trim());
    let resolvedCustomerId = null;
    if (hasIdentity) {
      const contactMatches = db.prepare(
        "SELECT * FROM customers WHERE (? <> '' AND phone = ?) OR (? <> '' AND lower(email) = ?) OR (? <> '' AND tin = ?) ORDER BY id DESC"
      ).all(normalizedPhone, normalizedPhone, normalizedEmail, normalizedEmail, normalizedCustomerTin, normalizedCustomerTin);
      const nameMatches = db.prepare("SELECT * FROM customers WHERE ? <> '' AND lower(name) = ? ORDER BY id DESC").all(normalizedName, normalizedName);
      const existingCustomer = contactMatches[0] || (nameMatches.length === 1 ? nameMatches[0] : null);
      if (existingCustomer) {
        resolvedCustomerId = existingCustomer.id;
        db.prepare(
          'UPDATE customers SET name = ?, phone = COALESCE(NULLIF(?, \'\'), phone), email = COALESCE(NULLIF(?, \'\'), email), customer_type = ?, company_name = ?, tin = COALESCE(NULLIF(?, \'\'), tin), billing_address = ? WHERE id = ?'
        ).run(
          (customerName || existingCustomer.name || 'Customer').trim(),
          normalizedPhone,
          normalizedEmail,
          normalizedCustomerType,
          normalizedCustomerType === 'company' ? normalizedCompanyName : (existingCustomer.company_name || ''),
          normalizedCustomerTin,
          String(billingAddress || '').trim(),
          existingCustomer.id
        );
      } else {
        const result = db.prepare(
          'INSERT INTO customers (name, phone, email, favorite_items, lifetime_value, last_visit, visits, customer_segment, preferred_channel, customer_type, company_name, tin, billing_address) VALUES (?, ?, ?, \'[]\', 0, NULL, 0, ?, ?, ?, ?, ?, ?)'
        ).run(
          (customerName || 'Customer').trim(),
          normalizedPhone,
          normalizedEmail,
          'first_order',
          orderSource || 'pos',
          normalizedCustomerType,
          normalizedCustomerType === 'company' ? normalizedCompanyName : '',
          normalizedCustomerTin,
          String(billingAddress || '').trim()
        );
        resolvedCustomerId = result.lastInsertRowid;
      }
    }

    insertOrder.run(
      id,
      id,
      orderType || 'delivery',
      tableNumber || null,
      resolvedCustomerId,
      customerName || null,
      customerPhone || null,
      customerEmail || null,
      normalizedCustomerType,
      normalizedCustomerType === 'company' ? normalizedCompanyName : null,
      normalizedCustomerTin || null,
      String(billingAddress || '').trim() || null,
      deliveryAddress || null,
      deliveryLatitude || null,
      deliveryLongitude || null,
      scheduledFor || null,
      subtotal,
      tax,
      total,
      paymentMethod,
      initialPaymentStatus,
      orderSource,
      paymentRef,
      normalizedFulfillmentMode,
      reservationStatus,
      normalizedPaymentTerms,
      scheduledReleaseAt,
      initialOrderStatus,
      paidAt,
      now,
      now,
      staffId
    );

    for (const item of priced.items) {
      insertItem.run(
        id,
        item.menuItemId,
        item.name,
        item.qty,
        item.price,
        item.prepTimeMinutes || 8,
        JSON.stringify(item.modifiers),
        item.specialInstructions,
        JSON.stringify(item.ingredients || [])
      );
    }

    if (roadsideAccessToken) {
      db.prepare(`INSERT INTO roadside_trips (order_id, access_token_hash, status, created_at, updated_at)
        VALUES (?, ?, 'awaiting_customer', ?, ?)`)
        .run(id, hashRoadsideAccessToken(roadsideAccessToken), now, now);
    }

    const autoPrint = db.prepare("SELECT value FROM settings WHERE key = 'printer_auto_print'").get()?.value !== 'false';
    if (staffId && autoPrint && initialPaymentStatus === PAYMENT_STATUSES.PAID && !scheduledDate) {
      const branchCode = db.prepare("SELECT value FROM settings WHERE key = 'branch_code'").get()?.value || 'MAIN';
      db.prepare('INSERT OR IGNORE INTO printer_jobs (order_id, branch_code, created_at) VALUES (?, ?, ?)')
        .run(id, branchCode, now);
    }

    // Create payment tracking record
    insertPayment.run(
      `PAY-${Date.now()}-${id}`,
      id,
      paymentRef,
      paymentMethod || 'lipa_namba',
      paymentMethod || 'lipa_namba',
      total,
      customerPhone || null,
      customerName || null,
      initialPaymentStatus,
      paidAt,
      now,
      now,
      now
    );

    insertEvent.run(
      id,
      'created',
      initialOrderStatus,
      staffId,
      now,
      JSON.stringify({
        source: orderSource,
        paymentReference: paymentRef,
        paymentStatus: initialPaymentStatus,
      })
    );

    if (tableNumber && !scheduledDate) {
      db.prepare('UPDATE tables SET status = ?, current_order_id = ?, cleaning_started_at = NULL WHERE number = ?').run('occupied', id, tableNumber);
    }
  });

  tx();
  if (initialPaymentStatus === PAYMENT_STATUSES.PAID) applyOrderFulfillmentEffects(id);
  const order = getOrderById(id);
  if (order?.customerEmail) {
    try {
      const emailType = order.paymentTerms === 'invoice'
        ? 'company_invoice'
        : order.paymentStatus === PAYMENT_STATUSES.PAID ? 'paid_invoice' : 'order_received';
      enqueueOrderEmail(order.id, emailType);
    } catch (error) {
      console.error(`Could not queue customer email for order ${order.id}:`, error.message);
    }
    // Automatically add every order email to the email-marketing list.
    // New addresses enter as 'pending' (double opt-in); existing suppressed/unsubscribed
    // addresses are left untouched so we never re-add someone who opted out.
    try {
      const normalizedEmail = String(order.customerEmail).trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        const existing = db.prepare('SELECT id, consent_status, active FROM email_subscribers WHERE lower(email) = ?').get(normalizedEmail);
        const suppressed = db.prepare('SELECT email FROM email_suppressions WHERE email = ?').get(normalizedEmail);
        if (!existing && !suppressed) {
          const firstName = String(order.customer_name || order.customerName || '').trim().split(/\s+/)[0] || '';
          const lastName = String(order.customer_name || order.customerName || '').trim().split(/\s+/).slice(1).join(' ');
          db.prepare(`INSERT INTO email_subscribers (email, first_name, last_name, segment, source, preferred_channel, active, verified,
            consent_status, consent_source, created_at, updated_at) VALUES (?, ?, ?, ?, 'order', 'email', 0, 0, 'pending', 'order_checkout', ?, ?)`)
            .run(normalizedEmail, firstName, lastName, 'regular', now, now);
        }
      }
    } catch (error) {
      console.error(`Could not auto-enroll order email ${order.customerEmail}:`, error.message);
    }
  }

  broadcast('order:created', order);
  if (initialOrderStatus === ORDER_STATUSES.CONFIRMED) {
    broadcast('order:confirmed', order);
  }
  const orderNotification = { type: 'info', title: `New order ${order.id}`, message: `${order.customer || 'A customer'} placed a new ${order.type} order.`, audienceRoles: ['admin', 'manager', 'kitchen', 'foh'] };
  const notificationCreatedAt = new Date().toISOString();
  for (const role of ['manager', 'kitchen', 'foh']) {
    db.prepare('INSERT INTO notifications (type, title, message, read, created_at, audience_role) VALUES (?, ?, ?, 0, ?, ?)').run(orderNotification.type, orderNotification.title, orderNotification.message, notificationCreatedAt, role);
  }
  broadcast('notification:created', orderNotification);

  if (order?.customer_phone || order?.customer_email) {
    const customerRow = db.prepare('SELECT * FROM customers WHERE phone = ? OR email = ? ORDER BY id DESC LIMIT 1').get(order.customer_phone || '', order.customer_email || '');
    const preferredChannels = getCustomerNotificationChannels(customerRow || {
      email: order.customer_email,
      phone: order.customer_phone,
      preferred_channel: order.order_source || 'pos',
      channel: order.order_source || 'pos',
    });

    const announcementChannels = [
      preferredChannels.whatsapp ? 'WhatsApp' : null,
      preferredChannels.sms ? 'SMS' : null,
      preferredChannels.email ? 'Email' : null,
    ].filter(Boolean);

    const notifyChannel = announcementChannels[0] || 'WhatsApp';
    const message = buildOrderConfirmationMessage(order.id, notifyChannel, order.customer_name || 'Customer');

    db.prepare('INSERT INTO notifications (type, title, message, read, created_at) VALUES (?, ?, ?, 0, ?)')
      .run('success', `Order confirmed (${notifyChannel})`, message, new Date().toISOString());
    broadcast('notification:created', { type: 'success', title: `Order confirmed (${notifyChannel})` });
  }

  return roadsideAccessToken ? { ...order, roadsideAccessToken } : order;
}

/**
 * Public Order Placement (Customers from website / table QR)
 * POST /api/orders/public
 */
router.post('/public', (req, res) => {
  const {
    items,
    customerName,
    customerPhone,
    customerEmail,
    customerType,
    companyName,
    customerTin,
    billingAddress,
    deliveryAddress,
    deliveryLatitude,
    deliveryLongitude,
    orderType,
    tableNumber,
    scheduledFor,
    fulfillmentMode,
    paymentTerms,
    orderSource,
    paymentReference,
    paymentMethod = 'lipa_namba',
  } = req.body;

  if (!items?.length) return res.status(400).json({ error: 'Order must have items' });
  if (!customerName?.trim()) return res.status(400).json({ error: 'Customer name is required' });
  if (orderType === 'dine-in' && !tableNumber) return res.status(400).json({ error: 'A table number is required' });
  if (orderType !== 'dine-in' && fulfillmentMode !== 'roadside_handoff' && !deliveryAddress?.trim()) return res.status(400).json({ error: 'Delivery address is required' });

  try {
    const order = createOrderRecord({
      items,
      orderType: orderType || 'delivery',
      tableNumber,
      customerName,
      customerPhone,
      customerEmail,
      customerType,
      companyName,
      customerTin,
      billingAddress,
      deliveryAddress,
      deliveryLatitude,
      deliveryLongitude,
      scheduledFor,
      fulfillmentMode,
      paymentTerms,
      paymentTiming: 'pay-now',
      orderSource: orderSource || (tableNumber ? 'nfc' : 'website'),
      paymentReference,
      paymentMethod,
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Public order placement failed:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Public Order Status Lookup (Customers tracking their order by ID or Ref)
 * GET /api/orders/public/:idOrRef
 */
router.get('/public/:idOrRef', (req, res) => {
  const order = getOrderById(req.params.idOrRef);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const suppliedPhone = String(req.query.phone || '').replace(/\D/g, '');
  const orderPhone = String(order.customerPhone || '').replace(/\D/g, '');
  if (!suppliedPhone || suppliedPhone !== orderPhone) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

router.get('/reservations', authMiddleware, requireRole('admin', 'manager', 'foh'), (_req, res) => {
  res.json(getOrders({}, { includeInvoiceEmailStatus: true }).filter((order) => order.reservationStatus !== 'none'));
});

router.get('/company-terms', authMiddleware, requireRole('admin', 'manager'), (_req, res) => {
  const rows = db.prepare(`SELECT c.id AS customer_id, c.name, c.phone, c.email, c.company_name, c.tin,
      COALESCE(t.status, 'pending') AS status, COALESCE(t.credit_limit, 0) AS credit_limit,
      t.approved_at, u.name AS approved_by_name
    FROM customers c LEFT JOIN company_order_terms t ON t.customer_id = c.id
    LEFT JOIN users u ON u.id = t.approved_by
    WHERE c.customer_type = 'company' ORDER BY c.company_name, c.name`).all();
  res.json(rows.map((row) => ({
    customerId: row.customer_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    companyName: row.company_name,
    tin: row.tin,
    status: row.status,
    creditLimit: Number(row.credit_limit),
    approvedAt: row.approved_at,
    approvedBy: row.approved_by_name,
  })));
});

router.patch('/company-terms/:customerId', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const customerId = Number(req.params.customerId);
  const customer = db.prepare("SELECT id FROM customers WHERE id = ? AND customer_type = 'company'").get(customerId);
  if (!customer) return res.status(404).json({ error: 'Company customer not found.' });
  const status = String(req.body?.status || '');
  const creditLimit = Number(req.body?.creditLimit);
  if (!['approved', 'revoked', 'pending'].includes(status)) return res.status(400).json({ error: 'Choose approved, revoked, or pending.' });
  if (status === 'approved' && (!Number.isFinite(creditLimit) || creditLimit <= 0)) return res.status(400).json({ error: 'Approved invoice terms require a positive credit limit.' });
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO company_order_terms (customer_id, status, credit_limit, approved_by, approved_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(customer_id) DO UPDATE SET status = excluded.status, credit_limit = excluded.credit_limit,
      approved_by = excluded.approved_by, approved_at = excluded.approved_at, updated_at = excluded.updated_at`)
    .run(customerId, status, status === 'approved' ? creditLimit : 0,
      status === 'approved' ? req.user.id : null, status === 'approved' ? now : null, now, now);
  res.json({ ok: true, customerId, status, creditLimit: status === 'approved' ? creditLimit : 0 });
});

/**
 * Authenticated Orders Listing (Staff POS / Admin)
 * GET /api/orders
 */
router.get('/', authMiddleware, (req, res) => {
  const { status, paymentStatus } = req.query;
  res.json(getOrders({ status, paymentStatus }, { includeInvoiceEmailStatus: true }));
});

/**
 * Authenticated Single Order Lookup
 * GET /api/orders/:id
 */
router.get('/:id', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id, { includeInvoiceEmailStatus: true });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

/**
 * Authenticated POS Order Creation (Staff Counter)
 * POST /api/orders
 */
router.post('/', authMiddleware, (req, res) => {
  const { items } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Order must have items' });

  try {
    const order = createOrderRecord(req.body, req.user.id);
    res.status(201).json(order);
  } catch (error) {
    console.error('POS order placement failed:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Update Kitchen / Fulfillment Order Status
 * PATCH /api/orders/:id/status
 */
router.patch('/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  // Guard: Kitchen cannot accept or prepare an unpaid order
  if (
    ['preparing', 'ready'].includes(status) &&
    existing.payment_status !== PAYMENT_STATUSES.PAID &&
    existing.order_type !== 'dine-in-postpay' &&
    !(existing.payment_terms === 'invoice' && ['confirmed', 'released'].includes(existing.reservation_status))
  ) {
    return res.status(409).json({
      error: 'Cannot prepare order: Payment must be verified (PAID) before kitchen starts cooking.',
    });
  }

  if (status === 'preparing' && existing.scheduled_release_at && new Date(existing.scheduled_release_at) > new Date()) {
    return res.status(409).json({ error: 'This scheduled order is not due for kitchen preparation yet.' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, req.params.id);
  if (status === 'preparing') applyOrderFulfillmentEffects(req.params.id, { allowInvoiceTerms: true });
  db.prepare('INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.params.id, 'status_changed', status, req.user.id, now, JSON.stringify({ previousStatus: existing.status }));

  if (status === 'completed' && existing.status !== 'completed' && existing.table_number) {
    db.prepare('UPDATE tables SET status = ?, current_order_id = NULL, cleaning_started_at = ? WHERE number = ? AND current_order_id = ?')
      .run('cleaning', now, existing.table_number, existing.id);
  }

  const order = getOrderById(req.params.id);
  broadcast('order:updated', order);
  res.json(order);
});

router.patch('/:id/reservation', authMiddleware, requireRole('admin', 'manager', 'foh'), (req, res) => {
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing || existing.reservation_status === 'none') return res.status(404).json({ error: 'Reservation not found.' });
  const action = String(req.body?.action || '');
  const now = new Date().toISOString();
  let nextStatus = existing.reservation_status;
  let scheduledFor = existing.delivery_scheduled_for;
  if (action === 'confirm') {
    if (existing.payment_status !== PAYMENT_STATUSES.PAID && !(existing.payment_terms === 'invoice' && existing.reservation_status === 'confirmed')) {
      return res.status(409).json({ error: 'Verify payment before confirming this reservation.' });
    }
    nextStatus = 'confirmed';
  } else if (action === 'cancel') {
    nextStatus = 'cancelled';
  } else if (action === 'reschedule') {
    const date = new Date(req.body?.scheduledFor);
    if (!req.body?.scheduledFor || Number.isNaN(date.getTime()) || date <= new Date()) {
      return res.status(400).json({ error: 'Choose a future time.' });
    }
    scheduledFor = date.toISOString();
  } else {
    return res.status(400).json({ error: 'Choose confirm, cancel, or reschedule.' });
  }
  let releaseAt = existing.scheduled_release_at;
  if (action === 'reschedule') {
    const prepTime = Number(db.prepare('SELECT COALESCE(MAX(prep_time_minutes), 8) AS minutes FROM order_items WHERE order_id = ?').get(existing.id)?.minutes || 8);
    releaseAt = new Date(new Date(scheduledFor).getTime() - (prepTime + 5) * 60000).toISOString();
  }
  db.prepare(`UPDATE orders SET reservation_status = ?, delivery_scheduled_for = ?, scheduled_release_at = ?,
    status = CASE WHEN ? = 'cancel' THEN 'cancelled' ELSE status END, updated_at = ? WHERE id = ?`)
    .run(nextStatus, scheduledFor, releaseAt, action, now, existing.id);
  if (action === 'cancel') {
    db.prepare(`UPDATE roadside_trips SET status = 'cancelled', ended_at = COALESCE(ended_at, ?), updated_at = ?
      WHERE order_id = ? AND status NOT IN ('completed', 'cancelled')`).run(now, now, existing.id);
  }
  db.prepare(`INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata)
    VALUES (?, 'reservation_changed', ?, ?, ?, ?)`)
    .run(existing.id, nextStatus, req.user.id, now, JSON.stringify({
      action,
      scheduledFor,
      refundFollowUpRequired: action === 'cancel' && ['paid', 'completed'].includes(existing.payment_status),
    }));
  if (action === 'cancel' && ['paid', 'completed'].includes(existing.payment_status)) {
    db.prepare(`INSERT INTO notifications (type, title, message, read, created_at, audience_role)
      VALUES ('warning', ?, ?, 0, ?, 'manager')`)
      .run(`Refund follow-up: ${existing.order_number || existing.id}`, `Paid order ${existing.order_number || existing.id} was cancelled. Arrange and record any agreed refund separately.`, now);
  }
  const order = getOrderById(existing.id, { includeInvoiceEmailStatus: true });
  if (order.customerEmail) {
    try {
      enqueueOrderEmail(order.id, `reservation_update:${Date.now()}`);
    } catch (error) {
      console.error(`Could not queue reservation update email for ${order.id}:`, error.message);
    }
  }
  if (action === 'cancel') broadcast('roadside:updated', { orderId: existing.id, status: 'cancelled' });
  broadcast('order:updated', order);
  res.json(order);
});

/**
 * Update Payment Status
 * PATCH /api/orders/:id/payment-status
 */
router.patch('/:id/customer', authMiddleware, (req, res) => {
  const { customerName, customerPhone, customerEmail, customerType, companyName, customerTin, billingAddress } = req.body || {};
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  const payload = {
    customerName: String(customerName ?? existing.customer_name ?? '').trim(),
    customerPhone: String(customerPhone ?? existing.customer_phone ?? '').trim(),
    customerEmail: String(customerEmail ?? existing.customer_email ?? '').trim().toLowerCase(),
    customerType: ['individual', 'company'].includes(String(customerType || existing.customer_type || 'individual'))
      ? String(customerType || existing.customer_type || 'individual')
      : 'individual',
    companyName: String(companyName ?? existing.company_name ?? '').trim(),
    customerTin: String(customerTin ?? existing.customer_tin ?? '').trim(),
    billingAddress: String(billingAddress ?? existing.billing_address ?? '').trim(),
  };

  if (payload.customerType === 'company' && (!payload.companyName || !payload.customerTin)) {
    return res.status(400).json({ error: 'Company name and TIN are required for company invoices.' });
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE orders SET customer_name = ?, customer_phone = ?, customer_email = ?, customer_type = ?, company_name = ?, customer_tin = ?, billing_address = ?, updated_at = ? WHERE id = ?`)
    .run(payload.customerName || null, payload.customerPhone || null, payload.customerEmail || null, payload.customerType, payload.companyName || null, payload.customerTin || null, payload.billingAddress || null, now, req.params.id);

  const customerMatch = db.prepare('SELECT * FROM customers WHERE phone = ? OR lower(email) = ? OR lower(name) = ? ORDER BY id DESC LIMIT 1').get(payload.customerPhone || '', payload.customerEmail || '', payload.customerName || '');
  if (customerMatch) {
    db.prepare('UPDATE customers SET name = ?, phone = ?, email = ?, customer_type = ?, company_name = ?, tin = ?, billing_address = ?, updated_at = ? WHERE id = ?')
      .run(payload.customerName || customerMatch.name || 'Customer', payload.customerPhone || customerMatch.phone || '', payload.customerEmail || customerMatch.email || '', payload.customerType, payload.companyName || customerMatch.company_name || '', payload.customerTin || customerMatch.tin || '', payload.billingAddress || customerMatch.billing_address || '', now, customerMatch.id);
  }

  const order = getOrderById(req.params.id, { includeInvoiceEmailStatus: true });
  broadcast('order:updated', order);
  res.json(order);
});

router.patch('/:id/payment-status', authMiddleware, (req, res) => {
  const { paymentStatus, notes } = req.body || {};
  const validStatuses = Object.values(PAYMENT_STATUSES);

  if (!validStatuses.includes(paymentStatus)) {
    return res.status(400).json({ error: `Invalid payment status. Allowed: ${validStatuses.join(', ')}` });
  }

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  const now = new Date().toISOString();
  const staffName = req.user?.name || 'Staff';

  const newOrderStatus = paymentStatus === PAYMENT_STATUSES.PAID ? ORDER_STATUSES.CONFIRMED : existing.status;
  const paidAt = paymentStatus === PAYMENT_STATUSES.PAID ? now : existing.paid_at;

  db.prepare(`UPDATE orders SET payment_status = ?, status = ?,
    reservation_status = CASE WHEN ? = 'paid' AND reservation_status = 'awaiting_payment' THEN 'confirmed' ELSE reservation_status END,
    paid_at = ?, updated_at = ? WHERE id = ?`)
    .run(paymentStatus, newOrderStatus, paymentStatus, paidAt, now, req.params.id);
  if (paymentStatus === PAYMENT_STATUSES.PAID) applyOrderFulfillmentEffects(req.params.id);

  db.prepare(`
    UPDATE payments SET
      status = ?,
      notes = COALESCE(?, notes),
      verified_by = ?,
      paid_at = ?,
      updated_at = ?
    WHERE order_id = ?
  `).run(paymentStatus, notes || null, staffName, paidAt, now, req.params.id);

  db.prepare('INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.params.id, 'payment_status_changed', paymentStatus, req.user.id, now, JSON.stringify({ staffName, notes }));

  const order = getOrderById(req.params.id);
  if (paymentStatus === PAYMENT_STATUSES.PAID && order?.customerEmail) {
    try { enqueueOrderEmail(order.id, 'paid_invoice'); }
    catch (error) { console.error(`Could not queue paid invoice for order ${order.id}:`, error.message); }
  }
  broadcast('order:updated', order);
  if (paymentStatus === PAYMENT_STATUSES.PAID) {
    broadcast('order:confirmed', order);
    broadcast('payment:confirmed', { orderId: order.id, paymentReference: order.paymentReference });
  }

  res.json(order);
});

router.delete('/:id', authMiddleware, deletionViewer, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  recordDeletion({ resourceType: 'order', resourceId: order.id, snapshot: order, reason: req.body?.reason, user: req.user });
  const now = new Date().toISOString();
  const deleteOrder = db.transaction(() => {
    db.prepare('UPDATE tables SET current_order_id = NULL, status = CASE WHEN status = \'occupied\' THEN \'available\' ELSE status END WHERE current_order_id = ?').run(order.id);
    db.prepare('DELETE FROM refunds WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM payments WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM order_events WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM orders WHERE id = ?').run(order.id);
  });
  deleteOrder();
  broadcast('order:deleted', { orderId: order.id, deletedAt: now });
  res.json({ ok: true, orderId: order.id, permanentlyDeleted: true });
});

// Email the paid invoice for an order to the customer (or an address supplied on the spot).
router.post('/:id/send-invoice', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const requestedEmail = String(req.body?.email || '').trim().toLowerCase();
  const recipient = requestedEmail || String(order.customerEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return res.status(400).json({ error: 'Add an email address to send the invoice to.' });
  }
  if (!['paid', 'completed'].includes(order.paymentStatus)) {
    return res.status(409).json({ error: 'The invoice can only be emailed once the order is paid.' });
  }

  // If a new email was supplied, persist it on the order and customer so future
  // invoices and marketing reach the same address.
  if (requestedEmail && requestedEmail !== String(order.customerEmail || '').trim().toLowerCase()) {
    db.prepare('UPDATE orders SET customer_email = ?, updated_at = ? WHERE id = ?').run(requestedEmail, new Date().toISOString(), order.id);
    const phone = String(order.customerPhone || '').trim();
    const existingCustomer = db.prepare('SELECT id FROM customers WHERE lower(email) = ? OR (? <> \'\' AND phone = ?) LIMIT 1')
      .get(requestedEmail, phone, phone);
    if (existingCustomer) {
      db.prepare("UPDATE customers SET email = ? WHERE id = ? AND (email IS NULL OR email = '')").run(requestedEmail, existingCustomer.id);
    }
  }

  // Reuse the outbox so delivery is retried/tracked. Clear a prior failed/sent row so re-sends work.
  db.prepare("DELETE FROM order_email_outbox WHERE order_id = ? AND email_type = 'paid_invoice'").run(order.id);
  const queued = enqueueOrderEmail(order.id, 'paid_invoice');
  if (!queued) return res.status(409).json({ error: 'An invoice email for this order is already queued or sent.' });
  res.json({ ok: true, queued: true, recipient });
});

export default router;
