import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();
const isLocalRequest = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);

router.get('/release', authMiddleware, requireRole('admin'), (_req, res) => {
  const url = process.env.DESKTOP_POS_DOWNLOAD_URL || '';
  if (!url) return res.status(503).json({ error: 'Desktop installer is not published yet.' });
  res.json({
    name: 'Wrap & Roll Desktop POS',
    version: process.env.DESKTOP_POS_VERSION || 'latest',
    url,
    sha256: process.env.DESKTOP_POS_SHA256 || '',
    size: Number(process.env.DESKTOP_POS_SIZE || 0),
  });
});

router.get('/branch-status', (req, res) => {
  if (!isLocalRequest(req)) return res.status(403).json({ error: 'Local desktop setup only.' });
  const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('branch_code', 'branch_name')").all();
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  res.json({ configured: Boolean(settings.branch_code), ...settings });
});

router.post('/branch-enroll', (req, res) => {
  if (!isLocalRequest(req)) return res.status(403).json({ error: 'Local desktop setup only.' });
  const branchCode = String(req.body?.branchCode || '').trim().toUpperCase();
  const branchName = String(req.body?.branchName || '').trim();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(branchCode) || !branchName) return res.status(400).json({ error: 'Enter a valid branch code and branch name.' });
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => { upsert.run('branch_code', branchCode); upsert.run('branch_name', branchName); });
  tx();
  res.json({ ok: true, branchCode, branchName });
});

export default router;