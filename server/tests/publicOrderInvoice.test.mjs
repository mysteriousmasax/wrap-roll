import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('public company orders require and persist invoice TIN and queue order email', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-public-order-'));
  const previousPath = process.env.DB_PATH;
  let testDb;
  let routeDb;
  let server;
  process.env.DB_PATH = path.join(directory, 'public-order-test.db');

  try {
    const database = await import(`../db/database.js?public-order-test=${Date.now()}`);
    testDb = database.default;
    await database.ensureDatabase();
    const menuItemId = testDb.prepare('INSERT INTO menu_items (name, description, price, category, active) VALUES (?, ?, ?, ?, 1)')
      .run('Invoice Test Roll', '', 10000, 'wraps').lastInsertRowid;

    const { default: ordersRouter } = await import(`../routes/orders.js?public-order-test=${Date.now()}`);
    routeDb = (await import('../db/database.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/orders', ordersRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/orders/public`;
    const payload = {
      items: [{ menuItemId, qty: 1 }],
      customerName: 'Amina Buyer',
      customerPhone: '+255700000001',
      customerEmail: 'amina@example.com',
      customerType: 'company',
      companyName: 'Amina Foods Ltd',
      orderType: 'delivery',
      deliveryAddress: 'Dar es Salaam',
    };

    const invalidResponse = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(invalidResponse.status, 400);
    assert.match((await invalidResponse.json()).error, /TIN are required/i);

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, customerTin: '123456789' }),
    });
    assert.equal(response.status, 201);
    const order = await response.json();
    assert.equal(order.customerType, 'company');
    assert.equal(order.companyName, 'Amina Foods Ltd');
    assert.equal(order.customerTin, '123456789');
    assert.equal(routeDb.prepare('SELECT email_type FROM order_email_outbox WHERE order_id = ?').get(order.id).email_type, 'order_received');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    routeDb?.close();
    testDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});