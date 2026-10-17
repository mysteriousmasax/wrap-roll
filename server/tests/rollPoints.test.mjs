import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import test from 'node:test';
import { awardRollPoints, reconcileRollPoints } from '../utils/rollPoints.js';

function createTestDb() {
  const targetDb = new Database(':memory:');
  targetDb.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      roll_points_balance INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      total REAL NOT NULL,
      payment_status TEXT NOT NULL,
      customer_id INTEGER,
      customer_phone TEXT,
      customer_email TEXT,
      customer_name TEXT
    );
    CREATE TABLE customer_points_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      points_delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      order_id TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return targetDb;
}

test('paid order awards points to its linked customer exactly once', () => {
  const targetDb = createTestDb();
  try {
    const correctCustomerId = targetDb.prepare('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)')
      .run('Alice Jones', '+255712345678', 'alice@example.com').lastInsertRowid;
    const previousCustomerId = targetDb.prepare('INSERT INTO customers (name, phone, email, roll_points_balance) VALUES (?, ?, ?, ?)')
      .run('Different Customer', '+255713456789', 'different@example.com', 19).lastInsertRowid;
    targetDb.prepare(`INSERT INTO orders (id, total, payment_status, customer_id, customer_phone, customer_email, customer_name)
      VALUES ('paid-1', 19500, 'paid', ?, '+255713456789', 'different@example.com', 'Different Customer')`)
      .run(correctCustomerId);
    targetDb.prepare(`INSERT INTO orders (id, total, payment_status, customer_id)
      VALUES ('pending-1', 30000, 'pending', ?)`)
      .run(correctCustomerId);
    targetDb.prepare(`INSERT INTO orders (id, total, payment_status, customer_id)
      VALUES ('paid-2', 10000, 'paid', ?)`)
      .run(correctCustomerId);
    targetDb.prepare(`INSERT INTO customer_points_ledger (customer_id, points_delta, reason, order_id, created_at)
      VALUES (?, 19, 'order_paid', 'paid-1', ?)`)
      .run(previousCustomerId, new Date().toISOString());

    assert.deepEqual(awardRollPoints('paid-1', targetDb), { customerId: correctCustomerId, points: 19, balance: 19, changed: true });
    assert.equal(targetDb.prepare('SELECT roll_points_balance FROM customers WHERE id = ?').get(previousCustomerId).roll_points_balance, 0);
    assert.equal(targetDb.prepare('SELECT customer_id FROM customer_points_ledger WHERE order_id = ?').get('paid-1').customer_id, correctCustomerId);
    assert.deepEqual(awardRollPoints('paid-2', targetDb), { customerId: correctCustomerId, points: 10, balance: 29, changed: true });
    assert.deepEqual(awardRollPoints('paid-1', targetDb), { customerId: correctCustomerId, points: 0, balance: 29, changed: false });
    assert.equal(awardRollPoints('pending-1', targetDb), null);
    assert.equal(targetDb.prepare('SELECT roll_points_balance FROM customers WHERE id = ?').get(correctCustomerId).roll_points_balance, 29);
    assert.equal(targetDb.prepare('SELECT COUNT(*) AS count FROM customer_points_ledger').get().count, 2);
  } finally {
    targetDb.close();
  }
});

test('reconciliation credits historical paid orders by unique normalized contacts and is idempotent', () => {
  const targetDb = createTestDb();
  try {
    const phoneCustomerId = targetDb.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)')
      .run('Phone Customer', '0712345678').lastInsertRowid;
    const emailCustomerId = targetDb.prepare('INSERT INTO customers (name, email) VALUES (?, ?)')
      .run('Email Customer', 'email@example.com').lastInsertRowid;
    const balanceRepairCustomerId = targetDb.prepare('INSERT INTO customers (name) VALUES (?)')
      .run('Balance Repair Customer').lastInsertRowid;
    targetDb.prepare('INSERT INTO customers (name) VALUES (?)').run('Shared Name');
    targetDb.prepare('INSERT INTO customers (name) VALUES (?)').run('Shared Name');

    targetDb.prepare(`INSERT INTO orders (id, total, payment_status, customer_phone)
      VALUES ('legacy-phone', 20500, 'paid', '+255 712 345 678')`).run();
    targetDb.prepare(`INSERT INTO orders (id, total, payment_status, customer_email)
      VALUES ('legacy-email', 30900, 'completed', ' EMAIL@example.com ')`).run();
    targetDb.prepare(`INSERT INTO orders (id, total, payment_status, customer_name)
      VALUES ('ambiguous-name', 12000, 'paid', 'Shared Name')`).run();
    targetDb.prepare(`INSERT INTO customer_points_ledger (customer_id, points_delta, reason, order_id, created_at)
      VALUES (?, 45, 'order_paid', 'legacy-ledger', ?)`)
      .run(balanceRepairCustomerId, new Date().toISOString());

    assert.deepEqual(reconcileRollPoints(targetDb), { processedOrders: 2, pointsAwarded: 50, repairedBalances: 1 });
    assert.equal(targetDb.prepare('SELECT roll_points_balance FROM customers WHERE id = ?').get(phoneCustomerId).roll_points_balance, 20);
    assert.equal(targetDb.prepare('SELECT roll_points_balance FROM customers WHERE id = ?').get(emailCustomerId).roll_points_balance, 30);
    assert.equal(targetDb.prepare('SELECT roll_points_balance FROM customers WHERE id = ?').get(balanceRepairCustomerId).roll_points_balance, 45);
    assert.equal(targetDb.prepare('SELECT COUNT(*) AS count FROM customer_points_ledger').get().count, 3);
    assert.deepEqual(reconcileRollPoints(targetDb), { processedOrders: 0, pointsAwarded: 0, repairedBalances: 0 });
  } finally {
    targetDb.close();
  }
});