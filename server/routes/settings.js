import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

const publicDefaults = {
  restaurant_name: 'Wrap & Roll',
  branch_location: 'Wikicha Tower, Mwai Kibaki Road, Dar es Salaam',
  google_maps_url: 'https://maps.app.goo.gl/gZqwfknocNK6FYNAA',
  phone: '+255 746 222 889',
  email: 'info@wrapandrolltz.com',
  operating_hours: '7:00 AM - 11:00 PM',
  weekly_hours: '{}',
  timezone: 'Africa/Dar_es_Salaam',
  tax_rate: '8',
  vat_rate: '18',
  currency: 'TZS',
  payment_card: 'true',
  payment_mobile: 'true',
  payment_cash: 'true',
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
