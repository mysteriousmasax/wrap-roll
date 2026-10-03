import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('email schema upgrades an existing database with consent and automation tables', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-email-db-'));
  const databasePath = path.join(directory, 'email-test.db');
  const previousPath = process.env.DB_PATH;
  process.env.DB_PATH = databasePath;

  try {
    const { default: db, ensureDatabase } = await import(`../db/database.js?email-test=${Date.now()}`);
    await ensureDatabase();
    const subscriberColumns = new Set(db.prepare('PRAGMA table_info(email_subscribers)').all().map((column) => column.name));
    const campaignColumns = new Set(db.prepare('PRAGMA table_info(email_campaigns)').all().map((column) => column.name));
    const orderColumns = new Set(db.prepare('PRAGMA table_info(orders)').all().map((column) => column.name));
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));

    assert.ok(subscriberColumns.has('consent_status'));
    assert.ok(subscriberColumns.has('consent_source'));
    assert.ok(campaignColumns.has('scheduled_at'));
    assert.ok(campaignColumns.has('html_body'));
    assert.ok(tables.has('email_templates'));
    assert.ok(tables.has('email_suppressions'));
    assert.ok(tables.has('email_automation_enrollments'));
    assert.ok(tables.has('email_automation_events'));
    assert.ok(tables.has('email_webhook_events'));
    assert.ok(orderColumns.has('customer_type'));
    assert.ok(orderColumns.has('company_name'));
    assert.ok(orderColumns.has('customer_tin'));
    assert.ok(orderColumns.has('billing_address'));
    assert.ok(tables.has('order_email_outbox'));
    db.close();
  } finally {
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});