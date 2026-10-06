import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { releaseExpiredCleaningTables } from '../utils/tableAvailability.js';

test('cleaning tables become available at ten minutes without changing busy or recent tables', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE tables (
    id INTEGER PRIMARY KEY,
    number INTEGER NOT NULL,
    status TEXT NOT NULL,
    current_order_id TEXT,
    cleaning_started_at TEXT
  )`);
  const insert = db.prepare('INSERT INTO tables (id, number, status, current_order_id, cleaning_started_at) VALUES (?, ?, ?, ?, ?)');
  insert.run(1, 1, 'cleaning', null, '2026-10-06T11:59:59.999Z');
  insert.run(2, 2, 'cleaning', null, '2026-10-06T12:00:00.000Z');
  insert.run(3, 3, 'cleaning', null, '2026-10-06T12:00:00.001Z');
  insert.run(4, 4, 'occupied', 'ORDER-4', '2026-10-06T11:00:00.000Z');
  insert.run(5, 5, 'cleaning', null, null);

  const released = releaseExpiredCleaningTables(db, new Date('2026-10-06T12:10:00.000Z'));

  assert.deepEqual(released.map((table) => table.number), [1, 2]);
  assert.equal(db.prepare('SELECT status FROM tables WHERE number = 3').get().status, 'cleaning');
  assert.equal(db.prepare('SELECT status FROM tables WHERE number = 4').get().status, 'occupied');
  assert.equal(db.prepare('SELECT status FROM tables WHERE number = 5').get().status, 'cleaning');
  assert.equal(db.prepare('SELECT cleaning_started_at FROM tables WHERE number = 1').get().cleaning_started_at, null);

  db.close();
});