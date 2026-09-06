import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

function monthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  return { start, end, period: start.slice(0, 7) };
}

router.get('/overview', authMiddleware, (_req, res) => {
  const { start, end, period } = monthBounds();
  const sales = db.prepare("SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'cancelled'").get(start, end);
  const expenses = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM business_expenses WHERE expense_date >= ? AND expense_date < ? AND status != 'rejected'").get(start.slice(0, 10), end.slice(0, 10));
  const payroll = db.prepare('SELECT COALESCE(SUM(net_pay), 0) AS total FROM payroll_records WHERE pay_period = ?').get(period);
  const tax = db.prepare("SELECT COALESCE(SUM(tax), 0) AS total FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'cancelled'").get(start, end);
  const lowStock = db.prepare('SELECT id, name, quantity, unit, threshold, supplier FROM inventory WHERE quantity <= threshold ORDER BY quantity ASC LIMIT 8').all();
  const cash = db.prepare("SELECT payment_method AS method, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count FROM sales_transactions WHERE created_at >= ? AND created_at < ? AND status = 'completed' GROUP BY payment_method ORDER BY amount DESC").all(start, end);
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

router.get('/expenses', authMiddleware, (_req, res) => {
  res.json(db.prepare('SELECT * FROM business_expenses ORDER BY expense_date DESC, id DESC LIMIT 100').all());
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
  res.status(201).json(db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(result.lastInsertRowid));
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
  res.json(db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(req.params.id));
});

router.delete('/expenses/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM business_expenses WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Expense not found.' });
  res.status(204).end();
});

router.patch('/expenses/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid expense status.' });
  db.prepare('UPDATE business_expenses SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(req.params.id));
});

export default router;
