import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('paid company order creates one invoice record and sends one branded invoice email', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-order-email-'));
  const previousPath = process.env.DB_PATH;
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM_ADDRESS;
  const originalFetch = globalThis.fetch;
  let testDb;
  let serviceDb;
  process.env.DB_PATH = path.join(directory, 'order-email-test.db');
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.EMAIL_FROM_ADDRESS = 'receipts@example.com';
  let fetchCount = 0;

  try {
    const database = await import(`../db/database.js?order-email-test=${Date.now()}`);
    testDb = database.default;
    await database.ensureDatabase();
    serviceDb = (await import('../db/database.js')).default;
    const now = new Date().toISOString();
    testDb.prepare(`INSERT INTO customers (name, phone, email, customer_type, company_name, tin, billing_address)
      VALUES (?, ?, ?, 'company', ?, ?, ?)`).run('Amina Buyer', '+255700000001', 'amina@example.com', 'Amina Foods Ltd', '123456789', 'Dar es Salaam').lastInsertRowid;
    testDb.prepare(`INSERT INTO orders (id, order_number, order_type, customer_name, customer_phone, customer_email, customer_type,
      company_name, customer_tin, billing_address, subtotal, tax, total, payment_method, payment_status, order_source, status,
      paid_at, created_at, updated_at) VALUES (?, ?, 'delivery', ?, ?, ?, 'company', ?, ?, ?, 10000, 800, 10800,
      'lipa_namba', 'paid', 'website', 'confirmed', ?, ?, ?)`)
      .run('WR-20261003-1001', 'WR-20261003-1001', 'Amina Buyer', '+255700000001', 'amina@example.com', 'Amina Foods Ltd', '123456789', 'Dar es Salaam', now, now, now);
    testDb.prepare(`INSERT INTO order_items (order_id, menu_item_id, name, qty, price, modifiers, special_instructions)
      VALUES (?, NULL, ?, 2, 5000, '[]', NULL)`).run('WR-20261003-1001', 'Chicken Roll');
    globalThis.fetch = async (_url, options) => {
      fetchCount += 1;
      const payload = JSON.parse(options.body);
      assert.match(payload.html, /wrap-roll-logo-lockup-transparent\.png/);
      assert.match(payload.html, /Customer TIN:<\/strong> 123456789/);
      return { ok: true, json: async () => ({ id: 'resend-email-123' }) };
    };

    const { enqueueOrderEmail, processOrderEmailOutbox } = await import(`../utils/orderEmailService.js?order-email-test=${Date.now()}`);
    const { getOrderById } = await import('../utils/orders.js');
    assert.equal(enqueueOrderEmail('WR-20261003-1001', 'paid_invoice'), true);
    assert.equal(enqueueOrderEmail('WR-20261003-1001', 'paid_invoice'), false);
    assert.equal(getOrderById('WR-20261003-1001', { includeInvoiceEmailStatus: true }).invoiceEmailStatus, 'queued');
    assert.equal(await processOrderEmailOutbox(), 1);
    assert.equal(await processOrderEmailOutbox(), 0);
    assert.equal(fetchCount, 1);
    assert.equal(getOrderById('WR-20261003-1001', { includeInvoiceEmailStatus: true }).invoiceEmailStatus, 'sent');
    assert.equal(testDb.prepare('SELECT status FROM order_email_outbox').get().status, 'sent');
    testDb.prepare("UPDATE order_email_outbox SET status = 'failed' WHERE order_id = ? AND email_type = 'paid_invoice'").run('WR-20261003-1001');
    assert.equal(getOrderById('WR-20261003-1001', { includeInvoiceEmailStatus: true }).invoiceEmailStatus, 'failed');
    assert.equal(testDb.prepare('SELECT invoice_number FROM invoices WHERE order_id = ?').get('WR-20261003-1001').invoice_number, 'INV-20261003-031001');
  } finally {
    globalThis.fetch = originalFetch;
    serviceDb?.close();
    testDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM_ADDRESS;
    else process.env.EMAIL_FROM_ADDRESS = previousFrom;
    rmSync(directory, { recursive: true, force: true });
  }
});