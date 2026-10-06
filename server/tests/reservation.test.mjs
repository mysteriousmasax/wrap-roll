import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

 test('reservations require payment and company invoice terms enforce approval and cumulative credit', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-reservation-'));
  const previousPath = process.env.DB_PATH;
  let testDb;
  let routeDb;
  let server;
  process.env.DB_PATH = path.join(directory, 'reservation-test.db');

  try {
    const database = await import(`../db/database.js?reservation-test=${Date.now()}`);
    testDb = database.default;
    await database.ensureDatabase();
    const menuItemId = testDb.prepare('INSERT INTO menu_items (name, description, price, category, active) VALUES (?, ?, ?, ?, 1)')
      .run('Scheduled Test Roll', '', 10000, 'wraps').lastInsertRowid;
    const userId = testDb.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)').run('Reservation Manager', 'manager', 'test-pin').lastInsertRowid;
    const { default: ordersRouter } = await import(`../routes/orders.js?reservation-test=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    routeDb = (await import('../db/database.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/orders', ordersRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/orders`;
    const auth = { Authorization: `Bearer ${signToken({ id: userId, name: 'Reservation Manager', role: 'manager' })}` };
    const scheduledFor = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const createPublic = (extra = {}) => fetch(`${base}/public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ menuItemId, qty: 1 }], customerName: 'Amina Buyer', customerPhone: '+255700000001',
        customerEmail: 'amina@example.com', orderType: 'delivery', deliveryAddress: 'Wikicha Tower',
        scheduledFor, ...extra,
      }),
    });

    const request = await createPublic();
    assert.equal(request.status, 201);
    const order = await request.json();
    assert.equal(order.reservationStatus, 'awaiting_payment');
    assert.equal(routeDb.prepare('SELECT visits FROM customers WHERE phone = ?').get('+255700000001').visits, 0);
    assert.equal(routeDb.prepare('SELECT quantity FROM inventory WHERE id = -1').get(), undefined);

    const confirmBeforePayment = await fetch(`${base}/${order.id}/reservation`, {
      method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }),
    });
    assert.equal(confirmBeforePayment.status, 409);

    const companySetup = await createPublic({ customerType: 'company', companyName: 'Amina Foods Ltd', customerTin: '123456789' });
    assert.equal(companySetup.status, 201);
    const customerId = routeDb.prepare('SELECT id FROM customers WHERE phone = ? AND customer_type = ?').get('+255700000001', 'company').id;
    await fetch(`${base}/company-terms/${customerId}`, {
      method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', creditLimit: 25000 }),
    }).then(async (response) => assert.equal(response.status, 200));

    const companyRequest = await createPublic({ customerType: 'company', companyName: 'Amina Foods Ltd', customerTin: '123456789', paymentTerms: 'invoice' });
    assert.equal(companyRequest.status, 201);
    const companyOrder = await companyRequest.json();
    assert.equal(companyOrder.paymentTerms, 'invoice');
    assert.equal(companyOrder.reservationStatus, 'confirmed');
    assert.equal(companyOrder.paymentStatus, 'pending');
    assert.equal(routeDb.prepare("SELECT email_type FROM order_email_outbox WHERE order_id = ?").get(companyOrder.id).email_type, 'company_invoice');

    const overLimit = await createPublic({ customerType: 'company', companyName: 'Amina Foods Ltd', customerTin: '123456789', paymentTerms: 'invoice', items: [{ menuItemId, qty: 2 }] });
    assert.equal(overLimit.status, 400);
    assert.match((await overLimit.json()).error, /remaining credit limit/i);

    routeDb.prepare(`UPDATE orders SET payment_status = 'paid', reservation_status = 'confirmed' WHERE id = ?`).run(order.id);
    const nextTime = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    const reschedule = await fetch(`${base}/${order.id}/reservation`, {
      method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reschedule', scheduledFor: nextTime }),
    });
    assert.equal(reschedule.status, 200);
    const rescheduled = await reschedule.json();
    assert.equal(rescheduled.scheduledFor, nextTime);
    assert.ok(new Date(rescheduled.scheduledReleaseAt) < new Date(nextTime));

    const cancel = await fetch(`${base}/${order.id}/reservation`, {
      method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }),
    });
    assert.equal(cancel.status, 200);
    const cancelled = await cancel.json();
    assert.equal(cancelled.reservationStatus, 'cancelled');
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(routeDb.prepare("SELECT COUNT(*) AS count FROM order_email_outbox WHERE order_id = ? AND email_type LIKE 'reservation_update:%'").get(order.id).count, 2);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    routeDb?.close();
    testDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});
