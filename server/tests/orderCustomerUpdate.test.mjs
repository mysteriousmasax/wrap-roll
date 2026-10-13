import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('editing order customer details updates its linked customer record', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-order-customer-'));
  const previousPath = process.env.DB_PATH;
  let testDb;
  let routeDb;
  let server;
  process.env.DB_PATH = path.join(directory, 'order-customer-test.db');

  try {
    const database = await import(`../db/database.js?order-customer-test=${Date.now()}`);
    testDb = database.default;
    await database.ensureDatabase();
    const customerId = testDb.prepare('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)')
      .run('Dean Reliance', '0759929809', 'info@reliancesolutions.co.tz').lastInsertRowid;
    const userId = testDb.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)')
      .run('Test Manager', 'manager', 'test-pin').lastInsertRowid;
    const now = new Date().toISOString();
    testDb.prepare(`INSERT INTO orders (id, order_type, customer_id, customer_name, customer_phone, customer_email,
      subtotal, tax, total, created_at, updated_at) VALUES (?, 'delivery', ?, ?, ?, ?, 10000, 0, 10000, ?, ?)`)
      .run('WR-20261008-1150', customerId, 'Dean Reliance', '0759929809', 'info@reliancesolutions.co.tz', now, now);

    const { default: ordersRouter } = await import(`../routes/orders.js?order-customer-test=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    routeDb = (await import('../db/database.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/orders', ordersRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/orders/WR-20261008-1150/customer`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signToken({ id: userId, name: 'Test Manager', role: 'manager' })}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerName: 'Dean Reliance Updated',
        customerPhone: '0759000000',
        customerEmail: 'billing@reliancesolutions.co.tz',
        customerType: 'individual',
        companyName: '',
        customerTin: '',
        billingAddress: 'Dar es Salaam',
      }),
    });

    assert.equal(response.status, 200);
    const savedCustomer = routeDb.prepare('SELECT name, phone, email, billing_address FROM customers WHERE id = ?').get(customerId);
    assert.deepEqual(savedCustomer, {
      name: 'Dean Reliance Updated',
      phone: '+255759000000',
      email: 'billing@reliancesolutions.co.tz',
      billing_address: 'Dar es Salaam',
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    routeDb?.close();
    testDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});