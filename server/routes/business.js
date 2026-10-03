import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { deletionViewer, requireAdilaDeletion, recordDeletion } from '../utils/deletionPolicy.js';
import { restaurantTime } from '../utils/localTime.js';

const router = Router();

const operationalChecklists = [
  {
    id: 'morning-kitchen', time: '07:00-09:30', title: 'Kitchen prep & sanitation', lead: 'Head Chef', tasks: [
      ['temperatures', 'Calibrate warmers and refrigerators; record temperature checks.'],
      ['bread-prep', 'Bake fresh White and Cheese & Herbs bread batches.'],
      ['ingredient-prep', 'Slice vegetables and prepare Chicken Tandoori, Steak, and Tuna fillings.'],
    ],
  },
  {
    id: 'foh-digital', time: '09:00-10:00', title: 'FOH & digital setup', lead: 'Shift Supervisor', tasks: [
      ['pos-float', 'Turn on POS and sync the register float.'],
      ['channels-nfc', 'Enable WhatsApp Business replies and test the NFC reader.'],
      ['counter-stock', 'Restock Jute Pouches and Seed Paper Coasters at the counter.'],
    ],
  },
  {
    id: 'lunch-rush', time: '11:30-14:30', title: 'Peak lunch rush', lead: 'Expeditor / Cashier', tasks: [
      ['wrap-quality', 'Check rapid wrap/roll assembly and tight foil wrapping.'],
      ['bread-upsell', 'Ask each customer for bread choice and offer Make It a Meal.'],
      ['delivery-dispatch', 'Dispatch Bolt drivers and log order completion in POS.'],
    ],
  },
  {
    id: 'midday-handover', time: '15:00-16:00', title: 'Mid-day handover', lead: 'Managers out / in', tasks: [
      ['stock-count', 'Count bread and meat stock.'],
      ['cash-reconcile', 'Reconcile cash float and mobile money transactions.'],
      ['handover-brief', 'Complete the handover sheet and brief the incoming team.'],
    ],
  },
  {
    id: 'evening-close', time: '17:00-22:00', title: 'Evening rush & close', lead: 'Closing Supervisor', tasks: [
      ['hourly-temperature', 'Manage the rush and complete hourly temperature checks.'],
      ['clean-assembly', 'Turn off ovens, deep clean assembly lines, and sanitize surfaces.'],
      ['final-reconcile', 'Reconcile cash/NFC and lock the premises securely.'],
    ],
  },
];

const checklistTaskKeys = new Set(operationalChecklists.flatMap((phase) => phase.tasks.map(([key]) => `${phase.id}:${key}`)));

function businessDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return '';
  return date;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function monthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  return { start, end, period: start.slice(0, 7) };
}

router.get('/overview', authMiddleware, (_req, res) => {
  const { start, end, period } = monthBounds();
  const sales = db.prepare("SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders FROM orders WHERE created_at >= ? AND created_at < ? AND status = 'completed' AND payment_status IN ('paid', 'completed')").get(start, end);
  const expenses = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM business_expenses WHERE expense_date >= ? AND expense_date < ? AND status NOT IN ('rejected', 'deleted')").get(start.slice(0, 10), end.slice(0, 10));
  const payroll = db.prepare('SELECT COALESCE(SUM(net_pay), 0) AS total FROM payroll_records WHERE pay_period = ?').get(period);
  const tax = db.prepare("SELECT COALESCE(SUM(tax), 0) AS total FROM orders WHERE created_at >= ? AND created_at < ? AND status = 'completed' AND payment_status IN ('paid', 'completed')").get(start, end);
  const lowStock = db.prepare('SELECT id, name, quantity, unit, threshold, supplier FROM inventory WHERE quantity <= threshold ORDER BY quantity ASC LIMIT 8').all();
  const cash = db.prepare("SELECT payment_method AS method, COALESCE(SUM(total), 0) AS amount, COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < ? AND status = 'completed' AND payment_status IN ('paid', 'completed') AND payment_method IS NOT NULL GROUP BY payment_method ORDER BY amount DESC").all(start, end);
  const pendingExpenses = db.prepare("SELECT COUNT(*) AS count FROM business_expenses WHERE status = 'pending'").get();

  res.json({
    period,
    revenue: Number(sales.revenue || 0),
    orders: Number(sales.orders || 0),
    expenses: Number(expenses.total || 0),
    expenseCount: Number(expenses.count || 0),
    payroll: Number(payroll.total || 0),
    tax: Number(tax.total || 0),
    operatingProfit: Number(sales.revenue || 0) - Number(expenses.total || 0) - Number(payroll.total || 0),
    pendingExpenses: Number(pendingExpenses.count || 0),
    lowStock,
    cash,
  });
});

router.get('/checklists', authMiddleware, (req, res) => {
  const date = businessDate(req.query.date) || restaurantTime().date;
  const completedRows = db.prepare('SELECT * FROM operational_checklist_entries WHERE business_date = ?').all(date);
  const completed = new Map(completedRows.map((row) => [`${row.phase}:${row.task_key}`, row]));
  res.json({
    date,
    phases: operationalChecklists.map((phase) => ({
      id: phase.id,
      time: phase.time,
      title: phase.title,
      lead: phase.lead,
      tasks: phase.tasks.map(([key, label]) => {
        const row = completed.get(`${phase.id}:${key}`);
        return { key, label, completed: Boolean(row?.completed), completedBy: row?.completed_by || '', completedAt: row?.completed_at || null };
      }),
    })),
  });
});

router.put('/checklists/:date/:phase/:taskKey', authMiddleware, (req, res) => {
  const date = businessDate(req.params.date);
  const phase = operationalChecklists.find((item) => item.id === req.params.phase);
  const taskKey = `${req.params.phase}:${req.params.taskKey}`;
  if (!date || !phase || !checklistTaskKeys.has(taskKey)) return res.status(404).json({ error: 'Checklist task not found.' });
  if (typeof req.body?.completed !== 'boolean') return res.status(400).json({ error: 'A completion state is required.' });

  const completed = req.body.completed;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO operational_checklist_entries (business_date, phase, task_key, completed, completed_by, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(business_date, phase, task_key) DO UPDATE SET
      completed = excluded.completed, completed_by = excluded.completed_by, completed_at = excluded.completed_at, updated_at = excluded.updated_at`)
    .run(date, phase.id, req.params.taskKey, completed ? 1 : 0, completed ? (req.user?.name || req.user?.username || 'Staff') : '', completed ? now : null, now);
  broadcast('business:updated', { type: 'checklist_updated', date, phase: phase.id });
  res.json({ date, phase: phase.id, taskKey: req.params.taskKey, completed, completedAt: completed ? now : null });
});

router.get('/shift-handover', authMiddleware, (req, res) => {
  const date = businessDate(req.query.date) || restaurantTime().date;
  const shift = ['morning', 'evening'].includes(req.query.shift) ? req.query.shift : 'morning';
  const row = db.prepare('SELECT * FROM shift_handover_records WHERE shift_date = ? AND shift = ?').get(date, shift);
  res.json(row ? {
    ...row,
    reconciliation: parseJson(row.reconciliation_json, {}),
    inventoryCounts: parseJson(row.inventory_counts_json, []),
  } : {
    shift_date: date,
    shift,
    manager_out: '',
    manager_in: '',
    reconciliation: {
      cashFloat: { expected: 100000, actual: '' },
      cashSales: { expected: '', actual: '' },
      mobileMoney: { expected: '', actual: '' },
      nfc: { expected: '', actual: '' },
    },
    inventoryCounts: [
      { item: 'White Bread Rolls', unit: 'loaves', opening: '', added: '', closing: '', status: 'ok' },
      { item: 'Cheese & Herbs Rolls', unit: 'loaves', opening: '', added: '', closing: '', status: 'ok' },
      { item: 'Chicken Tandoori Prep', unit: 'kg', opening: '', added: '', closing: '', status: 'ok' },
      { item: 'House Steak Prep', unit: 'kg', opening: '', added: '', closing: '', status: 'ok' },
      { item: 'Jute Pouches & Coasters', unit: 'units', opening: '', added: '', closing: '', status: 'ok' },
      { item: 'NFC Loyalty Tags / Cards', unit: 'cards', opening: '', added: '', closing: '', status: 'ok' },
    ],
    notes: '',
  });
});

router.put('/shift-handover', authMiddleware, (req, res) => {
  const date = businessDate(req.body?.date);
  const shift = String(req.body?.shift || '').toLowerCase();
  if (!date || !['morning', 'evening'].includes(shift)) return res.status(400).json({ error: 'A valid date and shift are required.' });
  if (!req.body?.reconciliation || typeof req.body.reconciliation !== 'object' || !Array.isArray(req.body.inventoryCounts)) {
    return res.status(400).json({ error: 'Payment reconciliation and inventory counts are required.' });
  }

  const now = new Date().toISOString();
  const managerOut = String(req.body?.managerOut || '').trim();
  const managerIn = String(req.body?.managerIn || '').trim();
  const reconciliation = JSON.stringify(req.body.reconciliation);
  const inventoryCounts = JSON.stringify(req.body.inventoryCounts);
  const notes = String(req.body?.notes || '').trim();
  db.prepare(`INSERT INTO shift_handover_records
    (shift_date, shift, manager_out, manager_in, reconciliation_json, inventory_counts_json, notes, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(shift_date, shift) DO UPDATE SET
      manager_out = excluded.manager_out, manager_in = excluded.manager_in,
      reconciliation_json = excluded.reconciliation_json, inventory_counts_json = excluded.inventory_counts_json,
      notes = excluded.notes, created_by = excluded.created_by, updated_at = excluded.updated_at`)
    .run(date, shift, managerOut, managerIn, reconciliation, inventoryCounts, notes, req.user?.name || req.user?.username || 'Staff', now, now);
  broadcast('business:updated', { type: 'shift_handover_saved', date, shift });
  res.json({ date, shift, managerOut, managerIn, reconciliation: req.body.reconciliation, inventoryCounts: req.body.inventoryCounts, notes, updatedAt: now });
});

router.get('/expenses', authMiddleware, (_req, res) => {
  res.json(db.prepare('SELECT * FROM business_expenses ORDER BY expense_date DESC, id DESC LIMIT 100').all());
});

router.get('/deletion-audit', authMiddleware, deletionViewer, (req, res) => {
  const rows = db.prepare('SELECT * FROM deletion_audit ORDER BY deleted_at DESC LIMIT 500').all();
  res.json(rows.map((row) => ({ ...row, deletedSnapshot: JSON.parse(row.deleted_snapshot || '{}') })));
});

router.post('/expenses', authMiddleware, (req, res) => {
  const { expenseDate, category, description, supplier, amount, paymentMethod, receiptRef } = req.body || {};
  if (!expenseDate || !category || !description || !Number(amount) || Number(amount) < 0) {
    return res.status(400).json({ error: 'Date, category, description, and a positive amount are required.' });
  }
  const result = db.prepare(`INSERT INTO business_expenses
    (expense_date, category, description, supplier, amount, payment_method, status, receipt_ref, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(
    expenseDate, category, description, supplier || null, Number(amount), paymentMethod || 'bank', receiptRef || null,
    req.user?.name || 'Admin', new Date().toISOString()
  );
  const expense = db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(result.lastInsertRowid);
  broadcast('business:updated', { type: 'expense_created' });
  res.status(201).json(expense);
});

router.put('/expenses/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { expenseDate, category, description, supplier, amount, paymentMethod, receiptRef } = req.body || {};
  if (!expenseDate || !category || !description || !Number(amount) || Number(amount) < 0) {
    return res.status(400).json({ error: 'Date, category, description, and a positive amount are required.' });
  }
  const result = db.prepare(`UPDATE business_expenses
    SET expense_date = ?, category = ?, description = ?, supplier = ?, amount = ?, payment_method = ?, receipt_ref = ?
    WHERE id = ?`).run(
    expenseDate, category, description, supplier || null, Number(amount), paymentMethod || 'bank', receiptRef || null, req.params.id
  );
  if (!result.changes) return res.status(404).json({ error: 'Expense not found.' });
  broadcast('business:updated', { type: 'expense_updated' });
  res.json(db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(req.params.id));
});

router.delete('/expenses/:id', authMiddleware, deletionViewer, requireAdilaDeletion, (req, res) => {
  const existing = db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Expense not found.' });
  recordDeletion({ resourceType: 'business_expense', resourceId: existing.id, snapshot: existing, reason: req.body?.reason, user: req.user });
  db.prepare('DELETE FROM business_expenses WHERE id = ?').run(existing.id);
  broadcast('business:updated', { type: 'expense_deleted' });
  res.json({ ok: true, deleted: true, id: existing.id });
});

router.patch('/expenses/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid expense status.' });
  db.prepare('UPDATE business_expenses SET status = ? WHERE id = ?').run(status, req.params.id);
  broadcast('business:updated', { type: 'expense_status' });
  res.json(db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(req.params.id));
});

export default router;
