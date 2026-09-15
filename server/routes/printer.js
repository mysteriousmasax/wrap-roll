import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { printReceipt } from '../utils/escposPrinter.js';

const router = Router();

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

router.post('/receipt', authMiddleware, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Receipt data is required' });
    const result = await printReceipt(req.body, getSettings());
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to print receipt' });
  }
});

router.post('/test', authMiddleware, async (req, res) => {
  try {
    const result = await printReceipt({ id: 'TEST', items: [], subtotal: 0, tax: 0, total: 0, paymentMethod: 'test' }, getSettings());
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to print test receipt' });
  }
});

export default router;