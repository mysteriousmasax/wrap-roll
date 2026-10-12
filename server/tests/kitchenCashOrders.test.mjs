import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('staff cash checkout appears in the KDS confirmed-order query', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-kds-cash-'));
  const previousPath = process.env.DB_PATH;
  let setupDb;
  let db;
  let server;

  try {
    process.env.DB_PATH = path.join(directory, 'kds-cash.db');
    const database = await import(`../db/database.js?kds-cash=${Date.now()}`);
    setupDb = database.default;
    await database.ensureDatabase();
    db = (await import('../db/database.js')).default;
    const staffId = db.prepare('INSERT INTO users (name, role, pin, username) VALUES (?, ?, ?, ?)')
      .run('Cashier Test', 'foh', 'test-pin', 'cashier.test').lastInsertRowid;
    const menuItemId = db.prepare('INSERT INTO menu_items (name, description, price, category, active) VALUES (?, ?, ?, ?, 1)')
      .run('KDS Cash Test Wrap', '', 9000, 'wraps').lastInsertRowid;
    const { default: ordersRouter } = await import(`../routes/orders.js?kds-cash=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    const app = express();
    app.use(express.json());
    app.use('/api/orders', ordersRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/orders`;
    const headers = {
      Authorization: `Bearer ${signToken({ id: staffId, role: 'foh', name: 'Cashier Test' })}`,
      'Content-Type': 'application/json',
    };

    const createResponse = await fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        items: [{ menuItemId, qty: 1 }],
        orderType: 'takeout',
        customerName: 'Walk-in',
        paymentMethod: 'cash',
        paymentTiming: 'paid-cash',
        orderSource: 'foh',
      }),
    });
    assert.equal(createResponse.status, 201);
    const createdOrder = await createResponse.json();
    assert.equal(createdOrder.paymentStatus, 'paid');
    assert.equal(createdOrder.status, 'confirmed');
    assert.equal(createdOrder.orderSource, 'foh');

    const kdsResponse = await fetch(`${base}?status=confirmed,pending,pending_payment,preparing,ready`, { headers });
    assert.equal(kdsResponse.status, 200);
    const kdsOrders = await kdsResponse.json();
    const visibleOrder = kdsOrders.find((order) => order.id === createdOrder.id);
    assert.ok(visibleOrder, 'KDS order query should include the new cash order');
    assert.equal(visibleOrder.paymentStatus, 'paid');
    assert.equal(visibleOrder.status, 'confirmed');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    db?.close();
    setupDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});