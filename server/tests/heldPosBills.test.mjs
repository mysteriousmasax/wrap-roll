import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('held POS bills persist in the database and are scoped to the signed-in user', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-held-bills-'));
  const previousPath = process.env.DB_PATH;
  let setupDb;
  let db;
  let server;

  try {
    process.env.DB_PATH = path.join(directory, 'held-bills.db');
    const database = await import(`../db/database.js?held-bills=${Date.now()}`);
    setupDb = database.default;
    await database.ensureDatabase();
    db = (await import('../db/database.js')).default;
    const ownerId = db.prepare('INSERT INTO users (name, role, pin, username) VALUES (?, ?, ?, ?)')
      .run('Held Bill Owner', 'foh', 'test-pin', 'held.owner').lastInsertRowid;
    const otherId = db.prepare('INSERT INTO users (name, role, pin, username) VALUES (?, ?, ?, ?)')
      .run('Other Cashier', 'foh', 'test-pin', 'held.other').lastInsertRowid;
    const { default: ordersRouter } = await import(`../routes/orders.js?held-bills=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    const app = express();
    app.use(express.json());
    app.use('/api/orders', ordersRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/orders/held`;
    const headersFor = (id, name) => ({
      Authorization: `Bearer ${signToken({ id, name, role: 'foh' })}`,
      'Content-Type': 'application/json',
    });
    const ownerHeaders = headersFor(ownerId, 'Held Bill Owner');
    const otherHeaders = headersFor(otherId, 'Other Cashier');
    const cart = {
      items: [{ id: 5, cartId: 'cart-5', name: 'Chicken Wrap', price: 9000, quantity: 2, modifiers: ['Extra cheese'] }],
      orderType: 'takeout',
      customerName: 'Amina',
      fulfillmentMode: 'standard',
      discountPercent: 0,
    };

    const createResponse = await fetch(base, {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ label: 'Amina · counter', cart, total: 18000 }),
    });
    assert.equal(createResponse.status, 201);
    const heldBill = await createResponse.json();
    assert.equal(heldBill.itemCount, 2);

    const ownerListResponse = await fetch(base, { headers: ownerHeaders });
    assert.equal(ownerListResponse.status, 200);
    const ownerBills = await ownerListResponse.json();
    assert.equal(ownerBills.length, 1);
    assert.deepEqual(ownerBills[0].cart, cart);
    assert.equal(ownerBills[0].total, 18000);

    const otherListResponse = await fetch(base, { headers: otherHeaders });
    assert.deepEqual(await otherListResponse.json(), []);
    const deniedDelete = await fetch(`${base}/${encodeURIComponent(heldBill.id)}`, { method: 'DELETE', headers: otherHeaders });
    assert.equal(deniedDelete.status, 404);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM held_pos_bills').get().count, 1);

    const deleteResponse = await fetch(`${base}/${encodeURIComponent(heldBill.id)}`, { method: 'DELETE', headers: ownerHeaders });
    assert.equal(deleteResponse.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM held_pos_bills').get().count, 0);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    db?.close();
    setupDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});