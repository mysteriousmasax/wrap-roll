import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('expense edits persist and rejected expenses return to pending approval', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-business-expenses-'));
  const previousPath = process.env.DB_PATH;
  let setupDb;
  let db;
  let server;

  try {
    process.env.DB_PATH = path.join(directory, 'business-expenses.db');
    const database = await import(`../db/database.js?business-expenses=${Date.now()}`);
    setupDb = database.default;
    await database.ensureDatabase();
    db = (await import('../db/database.js')).default;

    const { default: businessRouter } = await import(`../routes/business.js?business-expenses=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    const userId = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)').run('Expense Manager', 'manager', 'test-pin').lastInsertRowid;
    const addExpense = db.prepare(`INSERT INTO business_expenses
      (expense_date, category, description, supplier, amount, payment_method, status, receipt_ref, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const pendingExpenseId = addExpense.run('2026-11-01', 'Utilities', 'Original pending expense', null, 1000, 'bank', 'pending', null, 'Expense Manager', new Date().toISOString()).lastInsertRowid;
    const rejectedExpenseId = addExpense.run('2026-11-02', 'Repairs', 'Original rejected expense', null, 2000, 'cash', 'rejected', null, 'Expense Manager', new Date().toISOString()).lastInsertRowid;

    const app = express();
    app.use(express.json());
    app.use('/api/business', businessRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const token = signToken({ id: userId, name: 'Expense Manager', role: 'manager' });
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const updateExpense = async (id, description, amount) => fetch(
      `http://127.0.0.1:${server.address().port}/api/business/expenses/${id}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          expenseDate: '2026-11-03',
          category: 'Other',
          description,
          supplier: 'Updated supplier',
          amount,
          paymentMethod: 'mobile_money',
          receiptRef: 'UPDATED-REF',
        }),
      }
    );

    const pendingResponse = await updateExpense(pendingExpenseId, 'Updated pending expense', 1500);
    assert.equal(pendingResponse.status, 200);
    const pendingExpense = await pendingResponse.json();
    assert.equal(pendingExpense.description, 'Updated pending expense');
    assert.equal(pendingExpense.amount, 1500);
    assert.equal(pendingExpense.status, 'pending');

    const rejectedResponse = await updateExpense(rejectedExpenseId, 'Corrected rejected expense', 2500);
    assert.equal(rejectedResponse.status, 200);
    const resubmittedExpense = await rejectedResponse.json();
    assert.equal(resubmittedExpense.description, 'Corrected rejected expense');
    assert.equal(resubmittedExpense.amount, 2500);
    assert.equal(resubmittedExpense.status, 'pending');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    db?.close();
    setupDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});
