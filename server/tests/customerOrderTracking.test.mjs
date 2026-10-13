import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';
import { hashRoadsideAccessToken } from '../utils/roadsideAccess.js';

test('shared order link returns timer and contact data and securely updates contact details', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-customer-tracking-'));
  const previousPath = process.env.DB_PATH;
  let testDb;
  let routeDb;
  let server;
  process.env.DB_PATH = path.join(directory, 'customer-tracking-test.db');

  try {
    const database = await import(`../db/database.js?customer-tracking-test=${Date.now()}`);
    testDb = database.default;
    await database.ensureDatabase();
    const now = new Date().toISOString();
    const customerId = testDb.prepare('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)')
      .run('Test Customer', '0712345678', '').lastInsertRowid;
    testDb.prepare(`INSERT INTO orders (id, order_number, order_type, customer_id, customer_name, customer_phone,
      customer_email, subtotal, tax, total, created_at, updated_at) VALUES (?, ?, 'takeout', ?, ?, ?, ?, 10000, 0, 10000, ?, ?)`)
      .run('WR-20261013-1001', 'WR-20261013-1001', customerId, 'Test Customer', '0712345678', '', now, now);
    testDb.prepare(`INSERT INTO order_items (order_id, menu_item_id, name, qty, price, prep_time_minutes, modifiers, special_instructions)
      VALUES (?, NULL, ?, 1, 10000, 12, '[]', NULL)`).run('WR-20261013-1001', 'Chicken Wrap');
    const token = 'customer-tracking-test-token';
    testDb.prepare('INSERT INTO customer_order_tracking_links (order_id, access_token_hash, created_at) VALUES (?, ?, ?)')
      .run('WR-20261013-1001', hashRoadsideAccessToken(token), now);

    const { default: ordersRouter } = await import(`../routes/orders.js?customer-tracking-test=${Date.now()}`);
    routeDb = (await import('../db/database.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/orders', ordersRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/api/orders/tracking/WR-20261013-1001`;

    const trackingResponse = await fetch(url, { headers: { 'X-Order-Tracking-Token': token } });
    assert.equal(trackingResponse.status, 200);
    const trackingOrder = await trackingResponse.json();
    assert.equal(trackingOrder.createdAt, now);
    assert.equal(trackingOrder.customerPhone, '+255712345678');
    assert.equal(trackingOrder.items[0].prepTimeMinutes, 12);

    const invalidEmailResponse = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Order-Tracking-Token': token },
      body: JSON.stringify({ customerEmail: 'not-an-email' }),
    });
    assert.equal(invalidEmailResponse.status, 400);

    const updateResponse = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Order-Tracking-Token': token },
      body: JSON.stringify({ customerEmail: 'buyer@example.com', customerPhone: '0623456789' }),
    });
    assert.equal(updateResponse.status, 200);
    assert.deepEqual(await updateResponse.json(), {
      customerName: 'Test Customer',
      customerPhone: '+255623456789',
      customerEmail: 'buyer@example.com',
    });
    assert.deepEqual(routeDb.prepare('SELECT name, phone, email FROM customers WHERE id = ?').get(customerId), {
      name: 'Test Customer',
      phone: '+255623456789',
      email: 'buyer@example.com',
    });

    const invalidTokenResponse = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Order-Tracking-Token': 'wrong-token' },
      body: JSON.stringify({ customerEmail: 'attacker@example.com' }),
    });
    assert.equal(invalidTokenResponse.status, 404);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    routeDb?.close();
    testDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});