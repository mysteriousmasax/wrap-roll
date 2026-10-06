import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createCustomerContact, deleteCustomerCascade, getFavoriteOrders, lookupPublicCustomerProfile, updateCustomerContact } from '../routes/customers.js';

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

test('lookupPublicCustomerProfile only resolves a customer by physical NFC tag', () => {
  const db = createTestDb();
  const customerId = db.prepare('INSERT INTO customers (name, phone, email, nfc_tag_code, roll_points_balance, lifetime_value, preferred_channel) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('Alice Jones', '+255 712 345 678', 'alice@example.com', 'WR-9001', 320, 125000, 'website').lastInsertRowid;

  const byPhone = lookupPublicCustomerProfile(db, '+255712345678');
  const byNfc = lookupPublicCustomerProfile(db, 'WR-9001');

  assert.equal(byPhone, null);
  assert.ok(byNfc);
  assert.equal(byNfc.id, customerId);
  assert.equal(byNfc.rollPoints, 320);
  assert.equal(byNfc.email, undefined);
  assert.equal(byNfc.phone, undefined);
});

test('updateCustomerContact updates saved contact details and rejects duplicates', () => {
  const db = createTestDb();
  const firstId = db.prepare('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)')
    .run('Alice Jones', '+255 712 345 678', 'alice@example.com').lastInsertRowid;
  const secondId = db.prepare('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)')
    .run('Benson Peter', '+255 713 456 789', 'benson@example.com').lastInsertRowid;

  const updated = updateCustomerContact(db, firstId, { name: 'Alice M. Jones', phone: '+255 710 111 222', email: 'ALICE@EXAMPLE.COM' });
  assert.equal(updated.ok, true);
  assert.deepEqual(updated.customer, { id: firstId, name: 'Alice M. Jones', phone: '+255 710 111 222', email: 'alice@example.com' });

  const duplicate = updateCustomerContact(db, firstId, { phone: '0713 456 789' });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /already uses/);
  assert.equal(updateCustomerContact(db, 999, { name: 'Missing' }).ok, false);
  assert.equal(db.prepare('SELECT name FROM customers WHERE id = ?').get(secondId).name, 'Benson Peter');
});

test('createCustomerContact normalizes fields and rejects duplicate contacts', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tier TEXT,
    phone TEXT,
    email TEXT,
    social_links TEXT,
    favorite_items TEXT,
    last_visit TEXT
  )`);
  const created = createCustomerContact(db, { name: 'Alice Jones', phone: '+255 712 345 678', email: 'ALICE@EXAMPLE.COM' });
  assert.equal(created.ok, true);
  const saved = db.prepare('SELECT name, phone, email FROM customers WHERE id = ?').get(created.customerId);
  assert.deepEqual(saved, { name: 'Alice Jones', phone: '+255 712 345 678', email: 'alice@example.com' });
  assert.equal(createCustomerContact(db, { name: 'Duplicate', phone: '0712 345 678' }).status, 409);
  assert.equal(createCustomerContact(db, { name: 'Invalid', email: 'not-an-email' }).status, 400);
  db.close();
});

test('verified customer favorites contain only their recent paid menu orders', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE orders (id TEXT, customer_id INTEGER, created_at TEXT, total REAL, payment_status TEXT);
    CREATE TABLE order_items (order_id TEXT, menu_item_id INTEGER, name TEXT, qty INTEGER, price REAL, modifiers TEXT, special_instructions TEXT, id INTEGER);
    CREATE TABLE menu_items (id INTEGER, active INTEGER);
  `);
  db.prepare('INSERT INTO menu_items (id, active) VALUES (?, ?)').run(8, 1);
  db.prepare('INSERT INTO orders (id, customer_id, created_at, total, payment_status) VALUES (?, ?, ?, ?, ?)')
    .run('ORDER-A', 12, '2026-10-01T10:00:00Z', 18000, 'paid');
  db.prepare('INSERT INTO orders (id, customer_id, created_at, total, payment_status) VALUES (?, ?, ?, ?, ?)')
    .run('ORDER-B', 13, '2026-10-02T10:00:00Z', 9000, 'paid');
  db.prepare('INSERT INTO order_items (order_id, menu_item_id, name, qty, price, modifiers, special_instructions, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('ORDER-A', 8, 'Chicken Wrap', 2, 9000, '[]', '', 1);
  db.prepare('INSERT INTO order_items (order_id, menu_item_id, name, qty, price, modifiers, special_instructions, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('ORDER-B', 8, 'Chicken Wrap', 1, 9000, '[]', '', 2);

  assert.deepEqual(getFavoriteOrders(db, 12), [{
    createdAt: '2026-10-01T10:00:00Z',
    total: 18000,
    items: [{ menuItemId: 8, name: 'Chicken Wrap', qty: 2, price: 9000, modifiers: [], specialInstructions: '' }],
  }]);
  db.close();
});
