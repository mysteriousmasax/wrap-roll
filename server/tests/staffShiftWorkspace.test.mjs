import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('staff workspace clocks shifts, reports assigned POS totals, and permits scoped task and HR corrections', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-staff-workspace-'));
  const previousPath = process.env.DB_PATH;
  let setupDb;
  let db;
  let server;

  try {
    process.env.DB_PATH = path.join(directory, 'staff-workspace.db');
    const database = await import(`../db/database.js?staff-workspace=${Date.now()}`);
    setupDb = database.default;
    await database.ensureDatabase();
    db = (await import('../db/database.js')).default;
    db.prepare("INSERT INTO settings (key, value) VALUES ('timezone', 'Africa/Dar_es_Salaam') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    const { restaurantDateBounds, restaurantTime } = await import('../utils/localTime.js');
    const businessDate = restaurantTime().date;
    const dayBounds = restaurantDateBounds(businessDate);
    const staffUserId = db.prepare('INSERT INTO users (name, role, pin, username) VALUES (?, ?, ?, ?)')
      .run('Shift Test Staff', 'foh', 'test-pin', 'shift.test').lastInsertRowid;
    const managerUserId = db.prepare('INSERT INTO users (name, role, pin, username) VALUES (?, ?, ?, ?)')
      .run('Shift Test Manager', 'manager', 'test-pin', 'shift.manager').lastInsertRowid;
    const adminUserId = db.prepare('INSERT INTO users (name, role, pin, username) VALUES (?, ?, ?, ?)')
      .run('Shift Test Admin', 'admin', 'test-pin', 'shift.admin').lastInsertRowid;
    const otherUserId = db.prepare('INSERT INTO users (name, role, pin, username) VALUES (?, ?, ?, ?)')
      .run('Other Staff', 'foh', 'test-pin', 'other.staff').lastInsertRowid;
    const staffId = db.prepare(`INSERT INTO staff
      (user_id, name, role, shift, status, morning_start_time, morning_end_time, evening_start_time, evening_end_time)
      VALUES (?, ?, 'FOH', 'Morning', 'off-clock', '00:00', '00:01', '00:00', '00:01')`)
      .run(staffUserId, 'Shift Test Staff').lastInsertRowid;
    db.prepare("INSERT INTO staff (user_id, name, role, shift, status) VALUES (?, 'Other Staff', 'FOH', 'Morning', 'off-clock')")
      .run(otherUserId);
    const createdAt = new Date(Date.parse(dayBounds.start) + 12 * 3600000).toISOString();
    const addOrder = (id, method, total, transactionTime = createdAt) => db.prepare(`INSERT INTO orders
      (id, order_type, subtotal, tax, total, payment_method, payment_status, order_source, status, created_at, updated_at, staff_id)
      VALUES (?, 'takeout', ?, 0, ?, ?, 'paid', 'pos', 'confirmed', ?, ?, ?)`)
      .run(id, total, total, method, transactionTime, transactionTime, staffUserId);
    addOrder('SHIFT-CASH-1', 'cash', 22000);
    addOrder('SHIFT-MOBILE-1', 'lipa_namba', 35000);
    addOrder('SHIFT-CASH-MIDNIGHT', 'cash', 5000, new Date(Date.parse(dayBounds.start) + 60000).toISOString());
    const taskId = db.prepare(`INSERT INTO staff_tasks (staff_id, title, task_type, status, created_at)
      VALUES (?, 'Prepare shift station', 'kanban', 'open', ?)`).run(staffId, createdAt).lastInsertRowid;

    const { default: staffRouter } = await import(`../routes/staff.js?staff-workspace=${Date.now()}`);
    const { default: businessRouter } = await import(`../routes/business.js?staff-workspace=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    const app = express();
    app.use(express.json());
    app.use('/api/staff', staffRouter);
    app.use('/api/business', businessRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const headersFor = (id, role, name) => ({
      Authorization: `Bearer ${signToken({ id, name, role })}`,
      'Content-Type': 'application/json',
    });
    const staffHeaders = headersFor(staffUserId, 'foh', 'Shift Test Staff');
    const managerHeaders = headersFor(managerUserId, 'manager', 'Shift Test Manager');
    const adminHeaders = headersFor(adminUserId, 'admin', 'Shift Test Admin');

    const scheduleEditResponse = await fetch(`${base}/staff/${staffId}`, {
      method: 'PUT', headers: adminHeaders,
      body: JSON.stringify({ name: 'Shift Test Staff', role: 'FOH', shift: 'Morning', morningStartTime: '00:00', morningEndTime: '00:01', eveningStartTime: '00:00', eveningEndTime: '00:01' }),
    });
    assert.equal(scheduleEditResponse.status, 200);
    assert.equal((await scheduleEditResponse.json()).eveningStartTime, '00:00');

    const kanbanEditResponse = await fetch(`${base}/staff/kanban/${taskId}`, {
      method: 'PATCH', headers: managerHeaders,
      body: JSON.stringify({ title: 'Prepare opening station', description: 'Verify sanitizer, labels, and stock.', category: 'Operations', priority: 'urgent', status: 'blocked', dueDate: businessDate }),
    });
    assert.equal(kanbanEditResponse.status, 200);
    const editedTask = db.prepare('SELECT title, description, category, priority, status, due_date FROM staff_tasks WHERE id = ?').get(taskId);
    assert.deepEqual(editedTask, { title: 'Prepare opening station', description: 'Verify sanitizer, labels, and stock.', category: 'Operations', priority: 'urgent', status: 'blocked', due_date: businessDate });

    const workspaceResponse = await fetch(`${base}/staff/me/workspace`, { headers: staffHeaders });
    assert.equal(workspaceResponse.status, 200);
    const workspace = await workspaceResponse.json();
    assert.equal(workspace.staff.id, staffId);
    assert.equal(workspace.shift.start, '00:00');
    assert.equal(workspace.metrics.shifts, 0);

    const handoverResponse = await fetch(`${base}/business/shift-handover?date=${businessDate}&shift=morning`, { headers: staffHeaders });
    assert.equal(handoverResponse.status, 200);
    const handover = await handoverResponse.json();
    assert.equal(handover.reconciliation.cashSales.expected, 27000);
    assert.equal(handover.reconciliation.mobileMoney.expected, 35000);
    assert.equal(handover.reconciliation.cashSales.expectedSource, 'transactions');

    const manualReconciliation = {
      ...handover.reconciliation,
      cashSales: { ...handover.reconciliation.cashSales, expected: 28000, expectedSource: 'manual' },
    };
    const saveHandoverResponse = await fetch(`${base}/business/shift-handover`, {
      method: 'PUT', headers: staffHeaders,
      body: JSON.stringify({ date: businessDate, shift: 'morning', reconciliation: manualReconciliation, inventoryCounts: [] }),
    });
    assert.equal(saveHandoverResponse.status, 200);
    const refreshedHandover = await fetch(`${base}/business/shift-handover?date=${businessDate}&shift=morning`, { headers: staffHeaders });
    assert.equal((await refreshedHandover.json()).reconciliation.cashSales.expected, 28000);

    const clockInResponse = await fetch(`${base}/staff/me/clock`, {
      method: 'PATCH', headers: staffHeaders,
      body: JSON.stringify({ action: 'in', shift: 'evening' }),
    });
    assert.equal(clockInResponse.status, 200);
    const clockedIn = await clockInResponse.json();
    assert.equal(clockedIn.clockEvent.action, 'clock_in');
    assert.ok(clockedIn.clockEvent.lateMinutes > 0);
    const activeLog = db.prepare("SELECT * FROM shift_logs WHERE staff_id = ? AND status = 'active'").get(staffId);
    assert.equal(activeLog.notes, 'evening');

    const taskResponse = await fetch(`${base}/staff/me/tasks/${taskId}`, {
      method: 'PATCH', headers: staffHeaders, body: JSON.stringify({ status: 'in_progress' }),
    });
    assert.equal(taskResponse.status, 200);
    assert.equal(db.prepare('SELECT status FROM staff_tasks WHERE id = ?').get(taskId).status, 'in_progress');
    const deniedTaskResponse = await fetch(`${base}/staff/me/tasks/${taskId}`, {
      method: 'PATCH', headers: headersFor(otherUserId, 'foh', 'Other Staff'), body: JSON.stringify({ status: 'completed' }),
    });
    assert.equal(deniedTaskResponse.status, 404);
    assert.equal(db.prepare('SELECT status FROM staff_tasks WHERE id = ?').get(taskId).status, 'in_progress');

    const clockOutResponse = await fetch(`${base}/staff/me/clock`, {
      method: 'PATCH', headers: staffHeaders, body: JSON.stringify({ action: 'out' }),
    });
    assert.equal(clockOutResponse.status, 200);
    const clockedOut = await clockOutResponse.json();
    assert.ok(clockedOut.clockEvent.overtimeMinutes > 0);

    const completedLog = db.prepare("SELECT * FROM shift_logs WHERE staff_id = ? AND status = 'completed' ORDER BY id DESC LIMIT 1").get(staffId);
    const correctionResponse = await fetch(`${base}/staff/attendance/${completedLog.id}`, {
      method: 'PATCH', headers: managerHeaders,
      body: JSON.stringify({ startTime: '00:10', endTime: '00:20' }),
    });
    assert.equal(correctionResponse.status, 200);
    const correction = await correctionResponse.json();
    assert.equal(correction.lateMinutes, 10);
    assert.equal(correction.overtimeMinutes, 19);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    db?.close();
    setupDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});