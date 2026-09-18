import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { deleteCustomerCascade, lookupPublicCustomerProfile } from '../routes/customers.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      nfc_tag_code TEXT,
      roll_points_balance INTEGER NOT NULL DEFAULT 0,
      lifetime_value REAL DEFAULT 0,
      birthday TEXT,
      anniversary TEXT,
      customer_segment TEXT DEFAULT 'regular',
      preferred_channel TEXT DEFAULT 'pos',
      social_links TEXT DEFAULT '{}'
    );

    CREATE TABLE loyalty_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'key_holder',
      item_code TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      issue_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE customer_points_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      points_delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      order_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL,
      customer_id INTEGER NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);
  return db;
}

test('deleteCustomerCascade removes customer loyalty records and point ledger data', () => {
  const db = createTestDb();
  const customerId = db.prepare('INSERT INTO customers (name, phone, email, nfc_tag_code, roll_points_balance) VALUES (?, ?, ?, ?, ?)')
    .run('Test Customer', '+255 712 345 678', 'test@example.com', 'WR-1001', 240).lastInsertRowid;

  db.prepare('INSERT INTO loyalty_items (customer_id, item_name, item_type, item_code, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(customerId, 'Birthday Treat', 'premium_kit', 'KIT-100', 'active', new Date().toISOString());

  db.prepare('INSERT INTO customer_points_ledger (customer_id, points_delta, reason, order_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(customerId, 240, 'order_paid', 'ORD-42', new Date().toISOString());

  db.prepare('INSERT INTO invoices (invoice_number, customer_id, total, created_at) VALUES (?, ?, ?, ?)')
    .run('INV-001', customerId, 25000, new Date().toISOString());

  const deleted = deleteCustomerCascade(db, customerId);

  assert.equal(deleted.deletedCustomerId, customerId);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM customers').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM loyalty_items').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM customer_points_ledger').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM invoices').get().c, 0);
});

test('lookupPublicCustomerProfile resolves a customer by phone or NFC tag without login', () => {
  const db = createTestDb();
  const customerId = db.prepare('INSERT INTO customers (name, phone, email, nfc_tag_code, roll_points_balance, lifetime_value, preferred_channel) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('Alice Jones', '+255 712 345 678', 'alice@example.com', 'WR-9001', 320, 125000, 'website').lastInsertRowid;

  const byPhone = lookupPublicCustomerProfile(db, '+255712345678');
  const byNfc = lookupPublicCustomerProfile(db, 'WR-9001');

  assert.ok(byPhone);
  assert.equal(byPhone.id, customerId);
  assert.equal(byPhone.rollPoints, 320);
  assert.equal(byPhone.name, 'Alice Jones');
  assert.ok(byNfc);
  assert.equal(byNfc.rollPoints, 320);
});
