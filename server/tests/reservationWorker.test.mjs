import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('scheduled reservations release at due time and notify staff once', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-reservation-worker-'));
  const previousPath = process.env.DB_PATH;
  let workerDb;
  let testDb;
  process.env.DB_PATH = path.join(directory, 'reservation-worker-test.db');

  try {
    const database = await import(`../db/database.js?reservation-worker-test=${Date.now()}`);
    testDb = database.default;
    await database.initDatabase();
    const workerModule = await import(`../utils/reservationWorker.js?reservation-worker-test=${Date.now()}`);
    workerDb = (await import('../db/database.js')).default;
    const now = new Date('2026-10-19T12:00:00.000Z');
    const insertOrder = testDb.prepare(`INSERT INTO orders
      (id, order_number, order_type, customer_name, subtotal, tax, total, payment_status, reservation_status,
       payment_terms, scheduled_release_at, delivery_scheduled_for, status, created_at, updated_at)
      VALUES (?, ?, 'takeout', ?, 1000, 0, 1000, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insert = (id, values = {}) => insertOrder.run(
      id,
      id,
      'Test Customer',
      values.paymentStatus || 'paid',
      values.reservationStatus || 'confirmed',
      values.paymentTerms || 'prepaid',
      values.releaseAt || '2026-10-19T11:59:00.000Z',
      values.scheduledFor || '2026-10-19T12:30:00.000Z',
      values.status || 'confirmed',
      now.toISOString(),
      now.toISOString(),
    );
    insert('due-order');
    insert('future-order', { releaseAt: '2026-10-19T12:15:00.000Z', scheduledFor: '2026-10-19T12:45:00.000Z' });
    insert('unpaid-order', { paymentStatus: 'pending', reservationStatus: 'awaiting_payment' });
    insert('cancelled-order', { status: 'cancelled' });

    const released = workerModule.processDueReservations(now);
    assert.deepEqual(released.map((order) => order.id), ['due-order']);
    assert.equal(testDb.prepare('SELECT reservation_status FROM orders WHERE id = ?').get('due-order').reservation_status, 'released');
    assert.equal(testDb.prepare('SELECT COUNT(*) AS count FROM notifications WHERE title LIKE ?').get('%due-order').count, 3);
    assert.equal(testDb.prepare('SELECT COUNT(*) AS count FROM order_events WHERE order_id = ?').get('due-order').count, 1);
    assert.deepEqual(workerModule.processDueReservations(now), []);
  } finally {
    workerDb?.close();
    testDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});