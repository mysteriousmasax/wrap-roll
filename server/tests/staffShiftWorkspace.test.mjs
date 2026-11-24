import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';
import { timeMinutes } from '../utils/shiftTime.js';

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
    const browserUserId = db.prepare('INSERT INTO users (name, role, pin, username) VALUES (?, ?, ?, ?)')
      .run('Browser Clock Staff', 'foh', 'test-pin', 'browser.clock').lastInsertRowid;
    const staffId = db.prepare(`INSERT INTO staff
      (user_id, name, role, shift, status, morning_start_time, morning_end_time, evening_start_time, evening_end_time)
      VALUES (?, ?, 'FOH', 'Morning', 'off-clock', '00:00', '00:01', '00:00', '00:01')`)
      .run(staffUserId, 'Shift Test Staff').lastInsertRowid;
    db.prepare("INSERT INTO staff (user_id, name, role, shift, status) VALUES (?, 'Other Staff', 'FOH', 'Evening', 'off-clock')")
      .run(otherUserId);
    const browserStaffId = db.prepare(`INSERT INTO staff
      (user_id, name, role, shift, status, morning_start_time, morning_end_time)
      VALUES (?, 'Browser Clock Staff', 'FOH', 'Morning', 'off-clock', '00:00', '00:01')`)
      .run(browserUserId).lastInsertRowid;
    const legacyBrowserSessionLogId = db.prepare(`INSERT INTO shift_logs
      (staff_id, staff_name, shift_date, start_time, end_time, status, notes)
      VALUES (?, 'Browser Clock Staff', ?, '09:00', '17:00', 'completed', 'morning')`)
      .run(browserStaffId, businessDate).lastInsertRowid;
    const createdAt = new Date(Date.parse(dayBounds.start) + 12 * 3600000).toISOString();
    const addOrder = (id, method, total, transactionTime = createdAt, options = {}) => {
      const {
        orderSource = 'pos',
        orderStatus = 'confirmed',
        paymentStatus = 'paid',
        paidAt = transactionTime,
        tenderMethod = method,
        receivedByUserId = null,
        addPayment = true,
      } = options;
      db.prepare(`INSERT INTO orders
        (id, order_type, subtotal, tax, total, payment_method, payment_status, order_source, status, paid_at, created_at, updated_at, staff_id)
        VALUES (?, 'takeout', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, total, total, method, paymentStatus, orderSource, orderStatus, paidAt, transactionTime, transactionTime, staffUserId);
      if (addPayment) {
        db.prepare(`INSERT INTO payments
          (id, order_id, payment_reference, provider, payment_method, amount, received_by_user_id, status, paid_at, created_at, updated_at)
          VALUES (?, ?, ?, 'test', ?, ?, ?, ?, ?, ?, ?)`)
          .run(`PAY-${id}`, id, `REF-${id}`, tenderMethod, total, receivedByUserId, paymentStatus, paidAt, transactionTime, transactionTime);
      }
    };
    addOrder('SHIFT-CASH-1', 'cash', 22000);
    addOrder('SHIFT-MOBILE-1', 'lipa_namba', 35000, new Date(Date.parse(dayBounds.start) - 3600000).toISOString(), { paidAt: createdAt, orderSource: 'website' });
    addOrder('SHIFT-CASH-MIDNIGHT', 'cash', 5000, new Date(Date.parse(dayBounds.start) + 60000).toISOString());
    addOrder('SHIFT-CASH-OTHER-SOURCE', 'cash', 8000, createdAt, { orderSource: 'whatsapp', orderStatus: 'completed' });
    addOrder('SHIFT-TAB-CASH-PART', 'tab', 6000, createdAt, { tenderMethod: 'cash' });
    addOrder('SHIFT-TAB-LIPA-PART', 'tab', 7000, createdAt, { tenderMethod: 'lipa_namba' });
    addOrder('SHIFT-UNPAID-CASH', 'cash', 99000, createdAt, { paymentStatus: 'pending', paidAt: null });
    addOrder('SHIFT-PAID-INVOICE', 'invoice', 88000);
    addOrder('SHIFT-EVENING-COLLECTED-CASH', 'cash', 3000, createdAt, { receivedByUserId: otherUserId });
    addOrder('SHIFT-MOBILE-OTHER-RECEIVER', 'lipa_namba', 16000, createdAt, { receivedByUserId: managerUserId });
    addOrder('SHIFT-CARD', 'tab', 2500, createdAt, { tenderMethod: 'card' });
    addOrder('SHIFT-BANK-TRANSFER', 'tab', 1500, createdAt, { tenderMethod: 'bank_transfer' });
    addOrder('SHIFT-OTHER-TENDER', 'tab', 500, createdAt, { tenderMethod: 'other' });
    const taskId = db.prepare(`INSERT INTO staff_tasks (staff_id, title, task_type, status, created_at)
      VALUES (?, 'Prepare shift station', 'kanban', 'open', ?)`).run(staffId, createdAt).lastInsertRowid;

    const { default: staffRouter } = await import(`../routes/staff.js?staff-workspace=${Date.now()}`);
    const { default: businessRouter } = await import(`../routes/business.js?staff-workspace=${Date.now()}`);
    const { default: authRouter } = await import(`../routes/auth.js?staff-workspace=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    const app = express();
    app.use(express.json());
    app.use('/api/staff', staffRouter);
    app.use('/api/business', businessRouter);
    app.use('/api/auth', authRouter);
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

    const browserLoginResponse = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'browser.clock', pin: 'test-pin' }),
    });
    assert.equal(browserLoginResponse.status, 200);
    const browserLogin = await browserLoginResponse.json();
    assert.deepEqual(
      db.prepare('SELECT id, attendance_source FROM shift_logs WHERE staff_id = (SELECT id FROM staff WHERE user_id = ?)').all(browserUserId),
      [{ id: legacyBrowserSessionLogId, attendance_source: null }],
      'logging in must not create attendance rows alongside legacy browser session activity',
    );
    assert.deepEqual(
      db.prepare('SELECT status, clock_in FROM staff WHERE user_id = ?').get(browserUserId),
      { status: 'off-clock', clock_in: null },
    );
    const browserWorkspaceResponse = await fetch(`${base}/staff/me/workspace`, {
      headers: { Authorization: `Bearer ${browserLogin.token}` },
    });
    assert.equal(browserWorkspaceResponse.status, 200);
    const browserWorkspace = await browserWorkspaceResponse.json();
    assert.equal(browserWorkspace.attendance.length, 0, 'legacy browser session activity is not a clock event');
    assert.equal(browserWorkspace.metrics.shifts, 0);

    const browserClockInResponse = await fetch(`${base}/staff/me/clock`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${browserLogin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'in', shift: 'morning' }),
    });
    assert.equal(browserClockInResponse.status, 200);
    const browserShift = db.prepare("SELECT * FROM shift_logs WHERE staff_id = (SELECT id FROM staff WHERE user_id = ?) AND status = 'active'")
      .get(browserUserId);
    assert.equal(browserShift.scheduled_start_time, '00:00');
    assert.equal(browserShift.scheduled_end_time, '00:01');
    const minutesOfDay = (value) => {
      const minutes = timeMinutes(value);
      assert.notEqual(minutes, null, `Expected a valid restaurant clock time, got ${value}`);
      return minutes;
    };
    assert.equal(browserShift.late_minutes, Math.max(0, minutesOfDay(browserShift.start_time)));

    const browserLogoutResponse = await fetch(`${base}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${browserLogin.token}` },
    });
    assert.equal(browserLogoutResponse.status, 200);
    const secondBrowserLoginResponse = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'browser.clock', pin: 'test-pin' }),
    });
    assert.equal(secondBrowserLoginResponse.status, 200);
    const secondBrowserLogin = await secondBrowserLoginResponse.json();
    const secondBrowserLogoutResponse = await fetch(`${base}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${secondBrowserLogin.token}` },
    });
    assert.equal(secondBrowserLogoutResponse.status, 200);
    assert.deepEqual(
      db.prepare("SELECT * FROM shift_logs WHERE staff_id = ? AND status = 'active'").get(browserShift.staff_id),
      browserShift,
    );

    const browserClockOutResponse = await fetch(`${base}/staff/me/clock`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${secondBrowserLogin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'out' }),
    });
    assert.equal(browserClockOutResponse.status, 200);
    const completedBrowserShift = db.prepare("SELECT * FROM shift_logs WHERE staff_id = (SELECT id FROM staff WHERE user_id = ?) AND status = 'completed' AND attendance_source = 'clock'")
      .get(browserUserId);
    assert.ok(completedBrowserShift.ended_at);
    assert.equal(completedBrowserShift.overtime_minutes, Math.max(0, minutesOfDay(completedBrowserShift.end_time) - 1));
    db.prepare('UPDATE shift_logs SET start_time = NULL WHERE id = ?').run(completedBrowserShift.id);
    const expectedClockIn = restaurantTime(new Date(completedBrowserShift.started_at)).time;

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

    const trackingResponse = await fetch(`${base}/staff/tracking`, { headers: managerHeaders });
    assert.equal(trackingResponse.status, 200);
    const tracking = await trackingResponse.json();
    assert.equal(tracking.serverDate, businessDate);
    assert.ok(Number.isInteger(tracking.serverMinuteOfDay));
    assert.equal(tracking.staff.find((staff) => staff.id === staffId).activity.openTasks, 1);
    assert.equal(tracking.staff.find((staff) => staff.id === browserStaffId).attendance.login, expectedClockIn);
    assert.equal(tracking.staff.find((staff) => staff.id === browserStaffId).attendance.scheduledStart, '00:00');
    assert.equal('inventoryChanges' in tracking.staff.find((staff) => staff.id === staffId).activity, false);
    assert.ok(tracking.attendance.some((entry) => entry.id === completedBrowserShift.id), 'explicit clock events appear in attendance');
    assert.equal(tracking.attendance.find((entry) => entry.id === completedBrowserShift.id).login, expectedClockIn, 'attendance log falls back to actual clock timestamp when stored time is absent');
    assert.ok(!tracking.attendance.some((entry) => entry.id === legacyBrowserSessionLogId), 'legacy browser session logs are not attendance');

    const handoverResponse = await fetch(`${base}/business/shift-handover?date=${businessDate}&shift=morning`, { headers: staffHeaders });
    assert.equal(handoverResponse.status, 200);
    const handover = await handoverResponse.json();
    assert.deepEqual({
      expectedCashTakings: handover.reconciliation.cashSales.expected,
      expectedLipaNamba: handover.reconciliation.mobileMoney.expected,
      expectedNfc: handover.reconciliation.nfc.expected,
      expectedCard: handover.reconciliation.card.expected,
      expectedBankTransfer: handover.reconciliation.bankTransfer.expected,
      expectedOther: handover.reconciliation.other.expected,
    }, { expectedCashTakings: 44000, expectedLipaNamba: 58000, expectedNfc: 0, expectedCard: 2500, expectedBankTransfer: 1500, expectedOther: 88500 });
    const settledTenderTotal = ['cashSales', 'mobileMoney', 'nfc', 'card', 'bankTransfer', 'other']
      .reduce((total, channel) => total + handover.reconciliation[channel].expected, 0);
    assert.equal(settledTenderTotal, 194500, 'all settled tender methods contribute to the shift expected total');
    assert.equal(handover.reconciliation.cashSales.expectedSource, 'transactions');
    const eveningHandoverResponse = await fetch(`${base}/business/shift-handover?date=${businessDate}&shift=evening`, { headers: staffHeaders });
    assert.equal(eveningHandoverResponse.status, 200);
    assert.equal((await eveningHandoverResponse.json()).reconciliation.cashSales.expected, 0, 'sales stay with the order staff when another shift member confirms payment');

    const alteredRosterResponse = await fetch(`${base}/business/shift-handover`, {
      method: 'PUT', headers: staffHeaders,
      body: JSON.stringify({ date: businessDate, shift: 'morning', reconciliation: handover.reconciliation, inventoryCounts: [...handover.inventoryCounts, { item: 'Unapproved stock row', unit: 'units', opening: '', added: '', closing: '', status: 'ok' }] }),
    });
    assert.equal(alteredRosterResponse.status, 403);

    const staffCountEdits = handover.inventoryCounts.map((row, index) => index === 0 ? { ...row, added: '4' } : row);
    const staffCountResponse = await fetch(`${base}/business/shift-handover`, {
      method: 'PUT', headers: staffHeaders,
      body: JSON.stringify({ date: businessDate, shift: 'morning', reconciliation: handover.reconciliation, inventoryCounts: staffCountEdits }),
    });
    assert.equal(staffCountResponse.status, 200);

    const manualReconciliation = {
      ...handover.reconciliation,
      cashFloat: { ...handover.reconciliation.cashFloat, actual: '100000' },
      cashSales: { ...handover.reconciliation.cashSales, expected: 28000, expectedSource: 'manual', actual: '41000' },
      mobileMoney: { ...handover.reconciliation.mobileMoney, actual: '42000' },
    };
    const saveHandoverResponse = await fetch(`${base}/business/shift-handover`, {
      method: 'PUT', headers: staffHeaders,
      body: JSON.stringify({ date: businessDate, shift: 'morning', reconciliation: manualReconciliation, inventoryCounts: staffCountEdits }),
    });
    assert.equal(saveHandoverResponse.status, 200);
    const refreshedHandover = await fetch(`${base}/business/shift-handover?date=${businessDate}&shift=morning`, { headers: staffHeaders });
    const refreshedReconciliation = (await refreshedHandover.json()).reconciliation;
    assert.equal(refreshedReconciliation.cashSales.expected, 44000, 'expected totals remain derived from settled transactions');
    assert.equal(refreshedReconciliation.cashSales.expectedSource, 'transactions');
    assert.equal(refreshedReconciliation.cashSales.actual, '41000', 'the submitting staff member can see their own saved count');
    assert.equal(refreshedReconciliation.cashSales.countStatus, 'awaiting-second-staff');
    assert.equal(refreshedReconciliation.cashSales.canSubmitCount, false, 'a submitted count is immutable');

    const otherStaffHeaders = headersFor(otherUserId, 'foh', 'Other Staff');
    const blindViewResponse = await fetch(`${base}/business/shift-handover?date=${businessDate}&shift=morning`, { headers: otherStaffHeaders });
    const blindView = await blindViewResponse.json();
    assert.equal(blindView.reconciliation.cashSales.actual, '', 'the second staff member cannot see the first count');
    assert.deepEqual(blindView.reconciliation.cashSales.countEntries, [], 'count details stay hidden until both staff submit');
    assert.equal(blindView.reconciliation.cashSales.canSubmitCount, true);
    const secondStaffReconciliation = {
      ...blindView.reconciliation,
      cashFloat: { ...blindView.reconciliation.cashFloat, actual: '100000' },
      cashSales: { ...blindView.reconciliation.cashSales, actual: '40000', notes: 'Till count differs' },
      mobileMoney: { ...blindView.reconciliation.mobileMoney, actual: '42000' },
    };
    const secondStaffSaveResponse = await fetch(`${base}/business/shift-handover`, {
      method: 'PUT', headers: otherStaffHeaders,
      body: JSON.stringify({ date: businessDate, shift: 'morning', reconciliation: secondStaffReconciliation, inventoryCounts: blindView.inventoryCounts }),
    });
    assert.equal(secondStaffSaveResponse.status, 200, 'a discrepancy does not block the next shift handover');
    const secondStaffSave = await secondStaffSaveResponse.json();
    assert.equal(secondStaffSave.reconciliation.cashSales.countStatus, 'pending-discrepancy');
    assert.equal(secondStaffSave.reconciliation.cashSales.countEntries.length, 2);
    assert.equal(secondStaffSave.reconciliation.cashSales.countEntries[0].staffName, 'Shift Test Staff');
    assert.equal(secondStaffSave.reconciliation.cashSales.countEntries[1].staffName, 'Other Staff');
    assert.equal(secondStaffSave.reconciliation.mobileMoney.countStatus, 'matched');
    assert.equal(secondStaffSave.reconciliation.cashFloat.countStatus, 'matched');

    const thirdStaffHeaders = headersFor(browserUserId, 'foh', 'Browser Clock Staff');
    const thirdStaffResponse = await fetch(`${base}/business/shift-handover`, {
      method: 'PUT', headers: thirdStaffHeaders,
      body: JSON.stringify({ date: businessDate, shift: 'morning', reconciliation: secondStaffReconciliation, inventoryCounts: blindView.inventoryCounts }),
    });
    assert.equal(thirdStaffResponse.status, 409, 'only two independent counts are accepted per channel');
    const nextShiftAfterDiscrepancy = await fetch(`${base}/business/shift-handover?date=${businessDate}&shift=evening`, { headers: otherStaffHeaders });
    assert.equal(nextShiftAfterDiscrepancy.status, 200);

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

    const completedLog = db.prepare("SELECT * FROM shift_logs WHERE staff_id = ? AND status = 'completed' AND attendance_source = 'clock' ORDER BY id DESC LIMIT 1").get(staffId);
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