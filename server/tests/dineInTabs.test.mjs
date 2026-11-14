import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  closeSettledDineInTab,
  getDineInTabSummary,
  recordDineInTabPayments,
} from '../utils/dineInTabs.js';

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tables (
      id INTEGER PRIMARY KEY,
      number INTEGER UNIQUE,
      status TEXT,
      current_order_id TEXT,
      current_tab_id TEXT,
      cleaning_started_at TEXT
    );
    CREATE TABLE dine_in_tabs (
      id TEXT PRIMARY KEY,
      table_number INTEGER,
      status TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      customer_email TEXT,
      opened_at TEXT,
      closed_at TEXT,
      closed_by TEXT
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      order_number TEXT,
      dine_in_tab_id TEXT,
      status TEXT,
      payment_status TEXT,
      total REAL,
      created_at TEXT,
      updated_at TEXT,
      paid_at TEXT
    );
    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      payment_reference TEXT UNIQUE,
      provider TEXT,
      payment_method TEXT,
      amount REAL,
      currency TEXT,
      received_by_user_id INTEGER,
      transaction_id TEXT,
      sender_name TEXT,
      status TEXT,
      notes TEXT,
      verified_by TEXT,
      paid_at TEXT,
      initiated_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT,
      event_type TEXT,
      status TEXT,
      actor_user_id INTEGER,
      occurred_at TEXT,
      metadata TEXT
    );
    INSERT INTO tables (id, number, status, current_order_id, current_tab_id)
      VALUES (1, 5, 'occupied', 'ORDER-2', 'TAB-1');
    INSERT INTO dine_in_tabs (id, table_number, status, customer_name, opened_at)
      VALUES ('TAB-1', 5, 'open', 'Guest', '2026-11-14T10:00:00.000Z');
    INSERT INTO orders (id, order_number, dine_in_tab_id, status, payment_status, total, created_at)
      VALUES
        ('ORDER-1', 'ORDER-1', 'TAB-1', 'completed', 'pending', 10000, '2026-11-14T10:01:00.000Z'),
        ('ORDER-2', 'ORDER-2', 'TAB-1', 'preparing', 'pending', 5000, '2026-11-14T10:02:00.000Z');
  `);
  return db;
}

test('split tab payments allocate across tickets and retain an occupied balance until settled', () => {
  const db = createDb();
  const summary = recordDineInTabPayments(db, {
    tableId: 1,
    receivedBy: 'Amina',
    receivedByUserId: 27,
    now: '2026-11-14T10:10:00.000Z',
    payments: [
      { amount: 10000, method: 'cash' },
      { amount: 2000, method: 'card' },
    ],
  }, { applyFulfillment: () => {} });

  assert.equal(summary.total, 15000);
  assert.equal(summary.paid, 12000);
  assert.equal(summary.balanceDue, 3000);
  assert.equal(summary.status, 'open');
  assert.equal(summary.payments.length, 2);
  assert.equal(summary.tickets[0].paymentStatus, 'paid');
  assert.equal(summary.tickets[1].paymentStatus, 'partially_paid');
  assert.equal(db.prepare('SELECT status FROM tables WHERE id = 1').get().status, 'occupied');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM payments WHERE status = ?').get('paid').count, 2);
  assert.equal(db.prepare('SELECT DISTINCT received_by_user_id AS id FROM payments').get().id, 27);
  db.close();
});

test('rejects overpayment and mobile-money entries without a verified transaction reference', () => {
  const db = createDb();
  assert.throws(() => recordDineInTabPayments(db, {
    tableId: 1, receivedBy: 'Amina', payments: [{ amount: 15001, method: 'cash' }],
  }, { applyFulfillment: () => {} }), /exceeds the balance/);
  assert.throws(() => recordDineInTabPayments(db, {
    tableId: 1, receivedBy: 'Amina', payments: [{ amount: 500, method: 'lipa_namba' }],
  }, { applyFulfillment: () => {} }), /verified mobile-money transaction reference/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM payments').get().count, 0);
  db.close();
});

test('settling a tab does not release a table until all tickets are completed', () => {
  const db = createDb();
  let summary = recordDineInTabPayments(db, {
    tableId: 1,
    receivedBy: 'Amina',
    now: '2026-11-14T10:10:00.000Z',
    payments: [{ amount: 15000, method: 'cash' }],
  }, { applyFulfillment: () => {} });
  assert.equal(summary.balanceDue, 0);
  assert.equal(summary.status, 'open');
  assert.equal(db.prepare('SELECT status FROM tables WHERE id = 1').get().status, 'occupied');

  db.prepare("UPDATE orders SET status = 'completed' WHERE id = 'ORDER-2'").run();
  assert.equal(closeSettledDineInTab(db, 'TAB-1', 'Amina', '2026-11-14T10:15:00.000Z'), true);
  summary = getDineInTabSummary(db, 'TAB-1');
  assert.equal(summary.status, 'closed');
  assert.equal(summary.closedAt, '2026-11-14T10:15:00.000Z');
  assert.equal(summary.paid, 15000);
  assert.equal(db.prepare('SELECT status FROM tables WHERE id = 1').get().status, 'cleaning');
  assert.equal(db.prepare('SELECT current_tab_id FROM tables WHERE id = 1').get().current_tab_id, null);
  db.close();
});
