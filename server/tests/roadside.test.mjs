import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

 test('roadside tracking requires verified payment and order token, then records trail and rating', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-roadside-'));
  const previousPath = process.env.DB_PATH;
  let testDb;
  let routeDb;
  let server;
  process.env.DB_PATH = path.join(directory, 'roadside-test.db');

  try {
    const database = await import(`../db/database.js?roadside-test=${Date.now()}`);
    testDb = database.default;
    await database.ensureDatabase();
    const menuItemId = testDb.prepare('INSERT INTO menu_items (name, description, price, category, active) VALUES (?, ?, ?, ?, 1)')
      .run('Roadside Test Roll', '', 10000, 'wraps').lastInsertRowid;
    const userId = testDb.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)').run('Roadside Manager', 'manager', 'test-pin').lastInsertRowid;
    const { default: ordersRouter } = await import(`../routes/orders.js?roadside-test=${Date.now()}`);
    const { default: roadsideRouter } = await import(`../routes/roadside.js?roadside-test=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    routeDb = (await import('../db/database.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/orders', ordersRouter);
    app.use('/api/roadside', roadsideRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const staffHeaders = { Authorization: `Bearer ${signToken({ id: userId, name: 'Roadside Manager', role: 'manager' })}` };
    const createResponse = await fetch(`${base}/orders/public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ menuItemId, qty: 1 }],
        customerName: 'Roadside Customer',
        customerPhone: '+255700000009',
        customerEmail: 'roadside@example.com',
        orderType: 'takeout',
        fulfillmentMode: 'roadside_handoff',
        orderSource: 'website',
      }),
    });
    assert.equal(createResponse.status, 201);
    const order = await createResponse.json();
    assert.equal(order.paymentStatus, 'pending');
    assert.equal(order.reservationStatus, 'awaiting_payment');
    assert.ok(order.roadsideAccessToken);

    const staffEndpoint = await fetch(`${base}/roadside/active`);
    assert.equal(staffEndpoint.status, 401);

    const trackingUrl = `${base}/roadside/${encodeURIComponent(order.id)}`;
    const headers = { 'Content-Type': 'application/json', 'X-Roadside-Token': order.roadsideAccessToken };
    const unpaidStart = await fetch(`${trackingUrl}/start`, { method: 'POST', headers, body: '{}' });
    assert.equal(unpaidStart.status, 409);

    routeDb.prepare(`UPDATE orders SET payment_status = 'paid', status = 'confirmed', reservation_status = 'confirmed', paid_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), order.id);
    const shareLinkResponse = await fetch(`${base}/roadside/${encodeURIComponent(order.id)}/share-link`, { method: 'POST', headers: staffHeaders });
    assert.equal(shareLinkResponse.status, 200);
    assert.match((await shareLinkResponse.json()).url, new RegExp(`/roadside-track/${order.id}#`));
    const started = await fetch(`${trackingUrl}/start`, { method: 'POST', headers, body: '{}' });
    assert.equal(started.status, 200);

    const locationResponse = await fetch(`${trackingUrl}/location`, {
      method: 'POST', headers,
      body: JSON.stringify({ latitude: -6.7594617, longitude: 39.2517226, accuracy: 15, heading: 90, speed: 4 }),
    });
    assert.equal(locationResponse.status, 200);
    assert.equal(routeDb.prepare('SELECT COUNT(*) AS count FROM roadside_location_points').get().count, 1);
    const releasedOrder = routeDb.prepare('SELECT reservation_status, kitchen_released_at FROM orders WHERE id = ?').get(order.id);
    assert.equal(releasedOrder.reservation_status, 'released');
    assert.ok(releasedOrder.kitchen_released_at);

    const stopResponse = await fetch(`${trackingUrl}/stop`, { method: 'POST', headers, body: '{}' });
    assert.equal(stopResponse.status, 200);
    const handoffResponse = await fetch(`${base}/roadside/${encodeURIComponent(order.id)}/handoff`, { method: 'POST', headers: staffHeaders });
    assert.equal(handoffResponse.status, 200);
    assert.equal(routeDb.prepare('SELECT status FROM orders WHERE id = ?').get(order.id).status, 'completed');
    assert.equal(routeDb.prepare("SELECT COUNT(*) AS count FROM order_email_outbox WHERE order_id = ? AND email_type LIKE 'roadside_handoff:%'").get(order.id).count, 1);
    const ratingResponse = await fetch(`${trackingUrl}/rating`, {
      method: 'POST', headers,
      body: JSON.stringify({ rating: 5, comment: 'Fast service' }),
    });
    assert.equal(ratingResponse.status, 200);
    assert.equal(routeDb.prepare('SELECT rating, rating_comment FROM roadside_trips WHERE order_id = ?').get(order.id).rating, 5);

    const invalidTokenResponse = await fetch(`${trackingUrl}/location`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Roadside-Token': 'invalid' },
      body: JSON.stringify({ latitude: -6.7924, longitude: 39.2083 }),
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
