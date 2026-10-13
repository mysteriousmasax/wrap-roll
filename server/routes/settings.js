import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { buildWifiQrPayload } from '../utils/wifiQr.js';
import { broadcast } from '../ws.js';
import { normalizeTanzanianPhone } from '../../shared/phone.js';

const router = Router();

const publicDefaults = {
  restaurant_name: 'Wrap & Roll',
  branch_location: 'Wikicha Tower, Mwai Kibaki Road, Dar es Salaam',
  google_maps_url: 'https://maps.app.goo.gl/gZqwfknocNK6FYNAA',
  google_maps_embed_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3962.0852270366922!2d39.251722599999994!3d-6.7594617!2m3!1f0!2f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x185c4d08cb7bb7f1%3A0x2fca94e306e228d4!2sWrap%20%26%20Roll!5e0!3m2!1sen!2stz!4v1787495167004!5m2!1sen!2stz',
  phone: '+255 746 222 889',
  email: 'info@wrapandrolltz.com',
  operating_hours: '7:00 AM - 11:00 PM',
  weekly_hours: '{}',
  timezone: 'Africa/Dar_es_Salaam',
  tax_rate: '8',
  vat_rate: '18',
  currency: 'TZS',
  tax_id: '',
  branch_code: '',
  branch_name: '',
  payment_card: 'true',
  payment_mobile: 'true',
  payment_cash: 'true',
  lipa_namba_number: '',
  lipa_namba_name: '',
  lipa_namba_provider: '',
  lipa_namba_accounts: '[]',
  public_animation_enabled: 'true',
  public_animation_style: 'lift',
  public_animation_duration: '650',
  public_animation_replay: 'true',
  review_whatsapp_url: '',
  review_instagram_url: '',
  review_google_url: '',
};

router.get('/public', (req, res) => {
  const publicKeys = Object.keys(publicDefaults);
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${publicKeys.map(() => '?').join(', ')})`).all(...publicKeys);
  const settings = { ...publicDefaults };
  for (const row of rows) settings[row.key] = row.key === 'phone' ? normalizeTanzanianPhone(row.value) : row.value;

  try {
    const storedAccounts = JSON.parse(settings.lipa_namba_accounts || '[]');
    if (!Array.isArray(storedAccounts)) throw new Error('Stored payment accounts are not an array');
    if (storedAccounts.length === 0 && process.env.LIPA_ACCOUNTS_JSON) settings.lipa_namba_accounts = process.env.LIPA_ACCOUNTS_JSON;
    else settings.lipa_namba_accounts = JSON.stringify(storedAccounts.map(({ qrImage, qr_image, image, ...account }) => account));
  } catch {
    try {
      const configuredAccounts = JSON.parse(process.env.LIPA_ACCOUNTS_JSON || '[]');
      settings.lipa_namba_accounts = JSON.stringify(Array.isArray(configuredAccounts) ? configuredAccounts.map(({ qrImage, qr_image, image, ...account }) => account) : []);
    } catch {
      settings.lipa_namba_accounts = '[]';
    }
  }

  res.json(settings);
});

router.get('/wifi-qr', authMiddleware, requireRole('admin', 'foh'), (req, res) => {
  const ssid = String(process.env.POS_WIFI_SSID || '').trim();
  const password = String(process.env.POS_WIFI_PASSWORD || '');
  const security = String(process.env.POS_WIFI_SECURITY || 'WPA').trim().toUpperCase();
  if (!ssid || (security !== 'NOPASS' && !password)) {
    return res.status(503).json({ error: 'Wi-Fi QR is not configured. Set POS_WIFI_SSID and POS_WIFI_PASSWORD in the server environment.' });
  }

  try {
    const payload = buildWifiQrPayload(ssid, password, security);
    res.set('Cache-Control', 'no-store, private').json({ ssid, password, payload });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key != 'printer_agent_token'").all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  broadcast('settings:updated', settings);
  res.json(settings);
});

router.put('/', authMiddleware, requireRole('admin'), (req, res) => {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      upsert.run(key, String(key === 'phone' ? normalizeTanzanianPhone(value) : value));
    }
  });
  tx();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key != 'printer_agent_token'").all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

export default router;
