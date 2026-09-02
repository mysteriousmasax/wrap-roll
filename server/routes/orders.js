import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { getOrderById, getOrders, nextOrderId } from '../utils/orders.js';
import { buildOrderConfirmationMessage, getCustomerNotificationChannels } from '../utils/orderNotifications.js';

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

function createOrderRecord({ items, orderType, tableNumber, customerName, customerPhone, customerEmail, deliveryAddress, paymentMethod, scheduledFor, paymentTiming, orderSource, paymentReference }, staffId = null) {
  const priced = priceOrderItems(items);
  const subtotal = priced.subtotal;
  const taxRate = Number(db.prepare("SELECT value FROM settings WHERE key = 'tax_rate'").get()?.value || 8) / 100;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  if (orderType === 'dine-in') {
    if (!tableNumber) throw new Error('A table number is required for dine-in orders');
    const table = db.prepare('SELECT status FROM tables WHERE number = ?').get(Number(tableNumber));
    if (!table) throw new Error('Table not found');
    if (table.status !== 'available') throw new Error('Table is not available');
  }
  const id = nextOrderId();
  const now = new Date().toISOString();
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, order_type, table_number, customer_name, customer_phone, customer_email, delivery_address, delivery_scheduled_for, subtotal, tax, total, payment_method, payment_status, order_source, payment_reference, status, created_at, updated_at, staff_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, menu_item_id, name, qty, price, prep_time_minutes, modifiers, special_instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    if (customerName?.trim()) {
      const existingCustomer = customerPhone ? db.prepare('SELECT * FROM customers WHERE phone = ?').get(customerPhone.trim()) : null;
      if (existingCustomer) {
        db.prepare('UPDATE customers SET name = ?, email = ?, last_visit = ?, visits = visits + 1, lifetime_value = lifetime_value + ?, favorite_items = ? WHERE id = ?').run(customerName.trim(), customerEmail || '', now.slice(0, 10), total, JSON.stringify(priced.items.map((item) => item.name)), existingCustomer.id);

        const customerHasTag = db.prepare('SELECT id FROM loyalty_items WHERE customer_id = ? AND item_type = ?').get(existingCustomer.id, 'nfc_tag');
        if (!customerHasTag) {
          const tagCode = `WR-${String(existingCustomer.id).padStart(4, '0')}-${Date.now().toString().slice(-6)}`;
          db.prepare('INSERT INTO loyalty_items (customer_id, item_name, item_type, item_code, status, issue_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(existingCustomer.id, 'First Order NFC Tag', 'nfc_tag', tagCode, 'active', now.slice(0, 10), 'Issued automatically on first order', now);
          db.prepare('UPDATE customers SET nfc_tag_code = ?, nfc_tag_type = ?, preferred_channel = COALESCE(?, preferred_channel), customer_segment = COALESCE(?, customer_segment) WHERE id = ?')
            .run(tagCode, 'key_holder', orderSource || 'pos', 'first_order', existingCustomer.id);
        }
      } else {
        const createdCustomer = db.prepare('INSERT INTO customers (name, phone, email, favorite_items, lifetime_value, last_visit, visits, customer_segment, nfc_tag_type, preferred_channel) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)')
          .run(customerName.trim(), customerPhone || '', customerEmail || '', JSON.stringify(priced.items.map((item) => item.name)), total, now.slice(0, 10), 'first_order', 'key_holder', orderSource || 'pos');
        const tagCode = `WR-${String(createdCustomer.lastInsertRowid).padStart(4, '0')}-${Date.now().toString().slice(-6)}`;
        db.prepare('INSERT INTO loyalty_items (customer_id, item_name, item_type, item_code, status, issue_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(createdCustomer.lastInsertRowid, 'First Order NFC Tag', 'nfc_tag', tagCode, 'active', now.slice(0, 10), 'Issued automatically on first order', now);
        db.prepare('UPDATE customers SET nfc_tag_code = ?, customer_segment = ? WHERE id = ?').run(tagCode, 'first_order', createdCustomer.lastInsertRowid);
      }
    }
    insertOrder.run(id, orderType || 'delivery', tableNumber || null, customerName || null, customerPhone || null, customerEmail || null, deliveryAddress || null, scheduledFor || null, subtotal, tax, total, paymentMethod || 'lipa_namba', paymentTiming === 'pay-later' ? 'unpaid' : 'paid', orderSource || 'foh', paymentReference || null, now, now, staffId);
    for (const item of priced.items) insertItem.run(id, item.menuItemId, item.name, item.qty, item.price, item.prepTimeMinutes || 8, JSON.stringify(item.modifiers), item.specialInstructions);
    if (tableNumber) db.prepare('UPDATE tables SET status = ?, current_order_id = ? WHERE number = ?').run('occupied', id, tableNumber);
  });
  tx();
  const order = getOrderById(id);
  broadcast('order:created', order);

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

  return order;
}

router.post('/public', (req, res) => {
  const { items, customerName, customerPhone, customerEmail, deliveryAddress, orderType, tableNumber, scheduledFor, paymentTiming, orderSource, paymentReference } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Order must have items' });
  if (!customerName?.trim()) return res.status(400).json({ error: 'Customer name is required' });
  if (orderType === 'dine-in' && !tableNumber) return res.status(400).json({ error: 'A table number is required' });
  if (orderType !== 'dine-in' && !deliveryAddress?.trim()) return res.status(400).json({ error: 'Delivery address is required' });
  if (orderType !== 'dine-in' && scheduledFor && new Date(scheduledFor).getTime() <= Date.now()) return res.status(400).json({ error: 'Scheduled delivery must be in the future' });
  if (!paymentReference?.trim()) return res.status(400).json({ error: 'Lipa Namba payment reference is required' });
  try {
    const order = createOrderRecord({ items, orderType: orderType || 'delivery', tableNumber, customerName, customerPhone, customerEmail, deliveryAddress, scheduledFor, paymentTiming: 'pay-now', orderSource: orderSource || (tableNumber ? 'nfc' : 'website'), paymentReference, paymentMethod: 'lipa_namba' });
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/', authMiddleware, (req, res) => {
  res.json(getOrders({ status: req.query.status }));
});

router.get('/:id', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

router.post('/', authMiddleware, (req, res) => {
  const {
    items, subtotal, tax, total, orderType, tableNumber, customerName,
    deliveryAddress, paymentMethod,
  } = req.body;

  if (!items?.length) return res.status(400).json({ error: 'Order must have items' });

  try {
    const order = createOrderRecord(req.body, req.user.id);
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status required' });

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, req.params.id);

  if (status === 'completed' && existing.table_number) {
    db.prepare('UPDATE tables SET status = ?, current_order_id = NULL WHERE number = ?').run('cleaning', existing.table_number);
  }

  const order = getOrderById(req.params.id);
  broadcast('order:updated', order);
  res.json(order);
});

export default router;
