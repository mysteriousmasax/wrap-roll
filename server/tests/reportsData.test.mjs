import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('compliance reports aggregate real paid orders and recorded audit activity', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-reports-'));
  const previousPath = process.env.DB_PATH;
  let setupDb;
  let db;
  let server;

  try {
    process.env.DB_PATH = path.join(directory, 'reports.db');
    const database = await import(`../db/database.js?reports=${Date.now()}`);
    setupDb = database.default;
    await database.ensureDatabase();
    db = (await import('../db/database.js')).default;
    const userId = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)')
      .run('Reports Test User', 'manager', 'reports-test-pin').lastInsertRowid;
    const inventoryId = db.prepare('INSERT INTO inventory (name, quantity, unit) VALUES (?, ?, ?)')
      .run('Reports Test Item', 2, 'pcs').lastInsertRowid;

    const addOrder = db.prepare(`INSERT INTO orders
      (id, order_number, customer_name, order_type, subtotal, tax, total, payment_method, payment_status, status, created_at, updated_at)
      VALUES (?, ?, ?, 'takeaway', ?, ?, ?, 'cash', ?, ?, ?, ?)`);
    addOrder.run('paid-order-1', 'R-1001', 'Actual Customer', 100, 8, 108, 'paid', 'completed', '2026-03-09T10:00:00.000Z', '2026-03-09T10:00:00.000Z');
    addOrder.run('paid-order-2', 'R-1002', 'Another Customer', 200, 16, 216, 'completed', 'completed', '2026-03-09T11:00:00.000Z', '2026-03-09T11:00:00.000Z');
    addOrder.run('unpaid-order', 'R-1003', 'Unpaid Customer', 1000, 80, 1080, 'pending', 'completed', '2026-03-09T12:00:00.000Z', '2026-03-09T12:00:00.000Z');
    db.prepare(`INSERT INTO orders
      (id, order_number, order_type, subtotal, tax, total, payment_method, payment_status, status, created_at, updated_at)
      VALUES ('legacy-mobile-order', 'R-1004', 'takeaway', 50, 0, 50, 'lipa_namba_1', 'paid', 'completed', '2026-04-10T13:00:00.000Z', '2026-04-10T13:00:00.000Z')`).run();
    const addPayment = db.prepare(`INSERT INTO payments
      (id, order_id, payment_reference, provider, payment_method, amount, status, paid_at, created_at, updated_at)
      VALUES (?, ?, ?, 'test', ?, ?, ?, ?, ?, ?)`);
    addPayment.run('payment-cash-1', 'paid-order-1', 'REF-CASH-1', 'cash', 108, 'paid', '2026-03-09T10:00:00.000Z', '2026-03-09T10:00:00.000Z', '2026-03-09T10:00:00.000Z');
    addPayment.run('payment-cash-2', 'paid-order-2', 'REF-CASH-2', 'cash', 100, 'completed', '2026-03-09T11:00:00.000Z', '2026-03-09T11:00:00.000Z', '2026-03-09T11:00:00.000Z');
    addPayment.run('payment-lipa-2', 'paid-order-2', 'REF-LIPA-2', 'lipa_namba_2', 116, 'paid', '2026-03-09T11:00:00.000Z', '2026-03-09T11:00:00.000Z', '2026-03-09T11:00:00.000Z');
    addPayment.run('payment-unpaid', 'unpaid-order', 'REF-UNPAID', 'lipa_namba', 1080, 'pending', null, '2026-03-09T12:00:00.000Z', '2026-03-09T12:00:00.000Z');
    db.prepare('INSERT INTO order_items (order_id, name, qty, price) VALUES (?, ?, ?, ?)')
      .run('paid-order-1', 'Test Item', 2, 54);
    db.prepare(`INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at)
      VALUES (?, ?, ?, ?, ?)`).run('paid-order-1', 'payment_confirmed', 'paid', userId, '2026-03-09T10:01:00.000Z');
    db.prepare(`INSERT INTO inventory_audit (inventory_id, action, changed_by_id, changed_by_name, changed_by_role, changes, created_at)
      VALUES (?, 'updated', ?, ?, 'manager', '{}', ?)`).run(inventoryId, userId, 'Reports Test User', '2026-03-09T10:02:00.000Z');

    db.exec('ALTER TABLE refunds DROP COLUMN refund_reference');
    await database.ensureDatabase();
    assert.ok(
      db.prepare('PRAGMA table_info(refunds)').all().some((column) => column.name === 'refund_reference'),
      'database startup restores refund_reference on legacy production databases',
    );

    const { default: analyticsRouter } = await import(`../routes/analytics.js?reports=${Date.now()}`);
    const { default: ordersRouter } = await import(`../routes/orders.js?reports=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    const app = express();
    app.use('/api/analytics', analyticsRouter);
    app.use('/api/orders', ordersRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const authHeaders = { Authorization: `Bearer ${signToken({ id: userId, name: 'Reports Test User', role: 'manager' })}` };
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analytics/reports/compliance/data?month=03&year=2026`, { headers: authHeaders });
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.deepEqual(report.monthSummary, { receipts: 2, gross: 324, orderTax: 24 });
    assert.equal(report.monthRows.length, 31);
    assert.deepEqual(report.monthRows[8], { date: '2026-03-09', receipts: 2, gross: 324, orderTax: 24 });
    assert.deepEqual(report.yearRows[2], {
      month: '2026-03', receipts: 2, gross: 324, orderTax: 24, daysWithSales: 1,
    });
    assert.equal(report.receipts.length, 2);
    assert.equal(report.receipts[0].customer, 'Another Customer');
    assert.equal(report.receipts[0].efdStatus, 'Not tracked');
    assert.equal(report.vatTracked, false);
    assert.equal(report.efdTracked, false);
    assert.deepEqual(report.auditRows.map((row) => row.user).sort(), ['Reports Test User', 'Reports Test User']);
    assert.deepEqual(report.auditRows.map((row) => row.userRole).sort(), ['manager', 'manager']);

    const base = `http://127.0.0.1:${server.address().port}/api/analytics`;
    const paymentReportResponse = await fetch(`${base}/reports/data?type=payments`, { headers: authHeaders });
    assert.equal(paymentReportResponse.status, 200);
    const paymentReport = await paymentReportResponse.json();
    assert.deepEqual(paymentReport.rows, [
      { method: 'cash', orders: 2, paid_orders: 2, amount: 208 },
      { method: 'lipa_namba', orders: 2, paid_orders: 2, amount: 166 },
    ], 'reconciliation groups settled tender records, including split and Lipa Namba payments, and ignores unpaid intents');

    const analyticsSummaryResponse = await fetch(`${base}/reports`, { headers: authHeaders });
    assert.equal(analyticsSummaryResponse.status, 200);
    const analyticsSummary = await analyticsSummaryResponse.json();
    assert.deepEqual(analyticsSummary.paymentMethods.map(({ method, amount }) => ({ method, amount })), [
      { method: 'cash', amount: 208 },
      { method: 'lipa_namba', amount: 166 },
    ]);

    const dashboardSummaryResponse = await fetch(`${base}/summary?date=2026-03-09`, { headers: authHeaders });
    assert.equal(dashboardSummaryResponse.status, 200, 'dashboard analytics summary works with a migrated legacy refund table');
    const dashboardSummary = await dashboardSummaryResponse.json();
    assert.ok(Number.isFinite(dashboardSummary.todayRevenue));

    const recentOrdersResponse = await fetch(`${base.replace('/analytics', '')}/orders`, { headers: authHeaders });
    assert.equal(recentOrdersResponse.status, 200, 'recent orders endpoint works with a migrated legacy refund table');
    const recentOrders = await recentOrdersResponse.json();
    assert.equal(recentOrders.length, 4);

    const dailyPreviewResponse = await fetch(`${base}/export/preview?range=day&date=2026-03-09`, { headers: authHeaders });
    assert.equal(dailyPreviewResponse.status, 200);
    const dailyPreview = await dailyPreviewResponse.json();
    assert.equal(dailyPreview.rows.length, 3);
    assert.equal(dailyPreview.rows[0].customer, 'Actual Customer');
    assert.equal(dailyPreview.rows[0].orderTax, 8);

    const weeklyPreviewResponse = await fetch(`${base}/export/preview?range=week&date=2026-03-11`, { headers: authHeaders });
    assert.equal(weeklyPreviewResponse.status, 200);
    const weeklyPreview = await weeklyPreviewResponse.json();
    assert.equal(weeklyPreview.rows.length, 8);
    assert.equal(weeklyPreview.rows[0].period, '2026-03-09');
    assert.equal(weeklyPreview.rows[0].orders, 2);
    assert.equal(weeklyPreview.rows[7].period, 'TOTAL');

    const monthlyPreviewResponse = await fetch(`${base}/export/preview?range=month&date=2026-03-09`, { headers: authHeaders });
    assert.equal(monthlyPreviewResponse.status, 200);
    const monthlyPreview = await monthlyPreviewResponse.json();
    assert.equal(monthlyPreview.rows.length, 32);
    assert.equal(monthlyPreview.rows[8].period, '2026-03-09');
    assert.equal(monthlyPreview.rows[8].revenue, 324);

    for (const [format, contentType] of [
      ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['pdf', 'application/pdf'],
    ]) {
      const exportResponse = await fetch(`${base}/export?range=day&date=2026-03-09&format=${format}`, { headers: authHeaders });
      assert.equal(exportResponse.status, 200);
      assert.match(exportResponse.headers.get('content-type'), new RegExp(contentType.replace(/[.+]/g, '\\$&')));
      assert.ok((await exportResponse.arrayBuffer()).byteLength > 100);
    }

    const invalidPeriod = await fetch(`http://127.0.0.1:${server.address().port}/api/analytics/reports/compliance/data?month=13&year=2026`, {
      headers: authHeaders,
    });
    assert.equal(invalidPeriod.status, 400);
  } finally {
    if (server) {
      server.close();
      await once(server, 'close');
    }
    db?.close();
    setupDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});
