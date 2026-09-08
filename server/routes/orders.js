import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { getOrderById, getOrders, nextOrderId, nextPaymentReference } from '../utils/orders.js';
import { buildOrderConfirmationMessage, getCustomerNotificationChannels } from '../utils/orderNotifications.js';
import { PAYMENT_STATUSES, ORDER_STATUSES } from '../utils/paymentProviders.js';

const router = Router();

function priceOrderItems(items) {
  const findMenuItem = db.prepare('SELECT id, name, price, prep_time_minutes FROM menu_items WHERE id = ? AND active = 1');
  const findModifier = db.prepare('SELECT name, price, type FROM modifiers WHERE name = ?');
  const pricedItems = items.map((item) => {
    const menuItem = findMenuItem.get(Number(item.menuItemId));
    const qty = Number(item.qty);
    if (!menuItem || !Number.isInteger(qty) || qty < 1) throw new Error('Each order item must have a valid menu item and quantity');
    const modifierNames = Array.isArray(item.modifiers) ? item.modifiers.map((modifier) => typeof modifier === 'string' ? modifier : modifier.name) : [];
    const modifiers = modifierNames.map((name) => findModifier.get(name)).filter(Boolean);
    if (modifiers.length !== modifierNames.length) throw new Error('One or more modifiers are unavailable');
    const price = menuItem.price + modifiers.reduce((sum, modifier) => sum + (modifier.type === 'add' ? modifier.price : 0), 0);
    return {
      menuItemId: menuItem.id,
      name: menuItem.name,
      qty,
      price,
      prepTimeMinutes: Number(menuItem.prep_time_minutes ?? 8),
      modifiers: modifierNames,
      specialInstructions: item.specialInstructions || null,
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
    deliveryAddress,
    deliveryLatitude,
    deliveryLongitude,
    paymentMethod = 'lipa_namba',
    scheduledFor,
    paymentTiming = 'pay-now',
    orderSource = 'website',
    paymentReference = null,
  },
  staffId = null
) {
  const priced = priceOrderItems(items);
  const subtotal = priced.subtotal;
  const taxRate = Number(db.prepare("SELECT value FROM settings WHERE key = 'tax_rate'").get()?.value || 8) / 100;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  if (orderType === 'dine-in') {
    if (!tableNumber) throw new Error('A table number is required for dine-in orders');
    const table = db.prepare('SELECT status FROM tables WHERE number = ?').get(Number(tableNumber));
    if (!table) throw new Error('Table not found');
    if (table.status !== 'available' && table.status !== 'occupied') throw new Error('Table is not available');
  }

  const id = nextOrderId();
  const paymentRef = (paymentReference?.trim()) || nextPaymentReference(id);
  const now = new Date().toISOString();

  // Determine initial status based on payment and source
  const isStaffCashImmediate = staffId && (paymentMethod === 'cash' || paymentTiming === 'paid-cash');
  const initialPaymentStatus = isStaffCashImmediate ? PAYMENT_STATUSES.PAID : PAYMENT_STATUSES.PENDING;
  const initialOrderStatus = isStaffCashImmediate ? ORDER_STATUSES.CONFIRMED : ORDER_STATUSES.PENDING_PAYMENT;
  const paidAt = isStaffCashImmediate ? now : null;

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, order_number, order_type, table_number, customer_name, customer_phone, customer_email,
      delivery_address, delivery_latitude, delivery_longitude, delivery_scheduled_for,
      subtotal, tax, total, payment_method, payment_status, order_source, payment_reference,
      status, paid_at, created_at, updated_at, staff_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, menu_item_id, name, qty, price, prep_time_minutes, modifiers, special_instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
    // Customer loyalty & record sync
    if (customerName?.trim()) {
      const existingCustomer = customerPhone ? db.prepare('SELECT * FROM customers WHERE phone = ?').get(customerPhone.trim()) : null;
      if (existingCustomer) {
        db.prepare(
          'UPDATE customers SET name = ?, email = ?, last_visit = ?, visits = visits + 1, lifetime_value = lifetime_value + ?, favorite_items = ? WHERE id = ?'
        ).run(
          customerName.trim(),
          customerEmail || '',
          now.slice(0, 10),
          total,
          JSON.stringify(priced.items.map((item) => item.name)),
          existingCustomer.id
        );
      } else {
        db.prepare(
          'INSERT INTO customers (name, phone, email, favorite_items, lifetime_value, last_visit, visits, customer_segment, preferred_channel) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
        ).run(
          customerName.trim(),
          customerPhone || '',
          customerEmail || '',
          JSON.stringify(priced.items.map((item) => item.name)),
          total,
          now.slice(0, 10),
          'first_order',
          orderSource || 'pos'
        );
      }
    }

    insertOrder.run(
      id,
      id,
      orderType || 'delivery',
      tableNumber || null,
      customerName || null,
      customerPhone || null,
      customerEmail || null,
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
        item.specialInstructions
      );
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

    if (tableNumber) {
      db.prepare('UPDATE tables SET status = ?, current_order_id = ? WHERE number = ?').run('occupied', id, tableNumber);
    }
  });

  tx();
  const order = getOrderById(id);

  broadcast('order:created', order);
  if (initialOrderStatus === ORDER_STATUSES.CONFIRMED) {
    broadcast('order:confirmed', order);
  }

  return order;
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
    deliveryAddress,
    orderType,
    tableNumber,
    scheduledFor,
    orderSource,
    paymentReference,
    paymentMethod = 'lipa_namba',
  } = req.body;

  if (!items?.length) return res.status(400).json({ error: 'Order must have items' });
  if (!customerName?.trim()) return res.status(400).json({ error: 'Customer name is required' });
  if (orderType === 'dine-in' && !tableNumber) return res.status(400).json({ error: 'A table number is required' });
  if (orderType !== 'dine-in' && !deliveryAddress?.trim()) return res.status(400).json({ error: 'Delivery address is required' });

  try {
    const order = createOrderRecord({
      items,
      orderType: orderType || 'delivery',
      tableNumber,
      customerName,
      customerPhone,
      customerEmail,
      deliveryAddress,
      scheduledFor,
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
  res.json(order);
});

/**
 * Authenticated Orders Listing (Staff POS / Admin)
 * GET /api/orders
 */
router.get('/', authMiddleware, (req, res) => {
  const { status, paymentStatus } = req.query;
  res.json(getOrders({ status, paymentStatus }));
});

/**
 * Authenticated Single Order Lookup
 * GET /api/orders/:id
 */
router.get('/:id', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id);
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
    existing.order_type !== 'dine-in-postpay'
  ) {
    return res.status(409).json({
      error: 'Cannot prepare order: Payment must be verified (PAID) before kitchen starts cooking.',
    });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, req.params.id);
  db.prepare('INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.params.id, 'status_changed', status, req.user.id, now, JSON.stringify({ previousStatus: existing.status }));

  if (status === 'completed' && existing.table_number) {
    db.prepare('UPDATE tables SET status = ?, current_order_id = NULL WHERE number = ?').run('cleaning', existing.table_number);
  }

  const order = getOrderById(req.params.id);
  broadcast('order:updated', order);
  res.json(order);
});

/**
 * Update Payment Status
 * PATCH /api/orders/:id/payment-status
 */
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

  db.prepare('UPDATE orders SET payment_status = ?, status = ?, paid_at = ?, updated_at = ? WHERE id = ?')
    .run(paymentStatus, newOrderStatus, paidAt, now, req.params.id);

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
  broadcast('order:updated', order);
  if (paymentStatus === PAYMENT_STATUSES.PAID) {
    broadcast('order:confirmed', order);
    broadcast('payment:confirmed', { orderId: order.id, paymentReference: order.paymentReference });
  }

  res.json(order);
});

export default router;
