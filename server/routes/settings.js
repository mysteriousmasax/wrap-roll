import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

const publicDefaults = {
  lipa_namba_number: '123456',
  lipa_namba_accounts: '[]',
  public_animation_enabled: 'true',
  public_animation_style: 'lift',
  public_animation_duration: '650',
  public_animation_replay: 'true',
};

router.get('/public', (req, res) => {
  const publicKeys = Object.keys(publicDefaults);
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${publicKeys.map(() => '?').join(', ')})`).all(...publicKeys);
  const settings = { ...publicDefaults };
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

router.put('/', authMiddleware, requireRole('admin'), (req, res) => {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      upsert.run(key, String(value));
    }
  });
  tx();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

export default router;
