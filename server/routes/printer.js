import { Router } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { discoverWindowsSerialPorts, printReceipt } from '../utils/escposPrinter.js';
import { getOrderById } from '../utils/orders.js';

const router = Router();

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const isLoopbackRequest = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);

function getPrinterAgent(req) {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : '';
  if (!token) return null;
  return db.prepare('SELECT id, branch_code FROM printer_agents WHERE token_hash = ?').get(hashToken(token));
}

router.post('/agent/pairing-code', authMiddleware, requireRole('admin'), (req, res) => {
  const settings = getSettings();
  const code = randomBytes(24).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM printer_pairing_codes WHERE expires_at <= ?').run(now.toISOString());
  db.prepare('INSERT INTO printer_pairing_codes (code_hash, branch_code, branch_name, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(hashToken(code), settings.branch_code || 'MAIN', settings.branch_name || 'Main Branch', expiresAt, now.toISOString());
  res.json({ code, expiresAt });
});

router.post('/agent/enroll', (req, res) => {
  const code = String(req.body?.pairingCode || '').trim();
  const newAgentId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  const enroll = db.transaction(() => {
    const pairing = db.prepare('SELECT * FROM printer_pairing_codes WHERE code_hash = ? AND expires_at > ?').get(hashToken(code), now);
    if (!pairing) return null;
    const consumed = db.prepare('DELETE FROM printer_pairing_codes WHERE code_hash = ? AND expires_at > ?').run(pairing.code_hash, now);
    if (!consumed.changes) return null;
    const existing = db.prepare('SELECT id FROM printer_agents WHERE branch_code = ?').get(pairing.branch_code);
    const agentId = existing?.id || newAgentId;
    if (existing) {
      db.prepare('UPDATE printer_agents SET token_hash = ?, branch_name = ?, last_seen_at = NULL WHERE id = ?')
        .run(hashToken(token), pairing.branch_name, agentId);
    } else {
      db.prepare('INSERT INTO printer_agents (id, token_hash, branch_code, branch_name, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(agentId, hashToken(token), pairing.branch_code, pairing.branch_name, now);
    }
    return { ...pairing, agent_id: agentId };
  });
  const pairing = enroll();
  if (!pairing) return res.status(401).json({ error: 'Pairing code is invalid or expired.' });
  res.json({ agentId: pairing.agent_id, token, branchCode: pairing.branch_code, branchName: pairing.branch_name });
});

router.get('/agent/status', authMiddleware, requireRole('admin'), (_req, res) => {
  const agents = db.prepare(`
    SELECT id, branch_code AS branchCode, branch_name AS branchName, last_seen_at AS lastSeenAt,
      created_at AS createdAt
    FROM printer_agents ORDER BY branch_name
  `).all().map((agent) => ({
    ...agent,
    online: Boolean(agent.lastSeenAt && Date.now() - Date.parse(agent.lastSeenAt) < 60000),
    queuedJobs: db.prepare("SELECT COUNT(*) AS count FROM printer_jobs WHERE branch_code = ? AND status = 'queued'").get(agent.branchCode).count,
    failedJobs: db.prepare("SELECT COUNT(*) AS count FROM printer_jobs WHERE branch_code = ? AND status = 'failed'").get(agent.branchCode).count,
  }));
  res.json({ agents });
});

router.get('/agent/jobs/next', (req, res) => {
  const agent = getPrinterAgent(req);
  if (!agent) return res.status(401).json({ error: 'Invalid printer agent token.' });

  const staleClaim = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const ready = req.query.ready !== 'false';
  const claimNextJob = db.transaction(() => {
    db.prepare("UPDATE printer_jobs SET status = 'queued', claimed_agent_id = NULL, claimed_at = NULL WHERE branch_code = ? AND status = 'claimed' AND claimed_at < ?")
      .run(agent.branch_code, staleClaim);
    db.prepare("UPDATE printer_jobs SET status = 'failed', last_error = 'Print job expired after 24 hours offline' WHERE branch_code = ? AND status = 'queued' AND created_at < ?")
      .run(agent.branch_code, cutoff);
    db.prepare('UPDATE printer_agents SET last_seen_at = ? WHERE id = ?').run(now.toISOString(), agent.id);
    if (!ready) return null;
    const job = db.prepare("SELECT id, order_id FROM printer_jobs WHERE branch_code = ? AND status = 'queued' ORDER BY id LIMIT 1")
      .get(agent.branch_code);
    if (!job) return null;
    db.prepare("UPDATE printer_jobs SET status = 'claimed', claimed_agent_id = ?, claimed_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'queued'")
      .run(agent.id, now.toISOString(), job.id);
    return job;
  });

  const job = claimNextJob();
  const settings = getSettings();
  const receiptSettings = Object.fromEntries([
    'restaurant_name', 'branch_location', 'phone', 'tax_id', 'currency', 'printer_paper_width_mm',
  ].filter((key) => settings[key] !== undefined).map((key) => [key, settings[key]]));
  if (job) return res.json({ job: { id: job.id, type: 'order', order: getOrderById(job.order_id), settings: receiptSettings } });
  if (!ready) return res.json({ job: null });

  const now = new Date();
  const claimDocumentJob = db.transaction(() => {
    db.prepare("UPDATE printer_document_jobs SET status = 'queued', claimed_agent_id = NULL, claimed_at = NULL WHERE branch_code = ? AND status = 'claimed' AND claimed_at < ?")
      .run(agent.branch_code, staleClaim);
    db.prepare("UPDATE printer_document_jobs SET status = 'failed', last_error = 'Print job expired after 24 hours offline' WHERE branch_code = ? AND status = 'queued' AND created_at < ?")
      .run(agent.branch_code, cutoff);
    const documentJob = db.prepare("SELECT id, payload FROM printer_document_jobs WHERE branch_code = ? AND status = 'queued' ORDER BY id LIMIT 1")
      .get(agent.branch_code);
    if (!documentJob) return null;
    db.prepare("UPDATE printer_document_jobs SET status = 'claimed', claimed_agent_id = ?, claimed_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'queued'")
      .run(agent.id, now.toISOString(), documentJob.id);
    return documentJob;
  });
  const documentJob = claimDocumentJob();
  if (!documentJob) return res.json({ job: null });
  res.json({ job: { id: -documentJob.id, type: 'document', order: JSON.parse(documentJob.payload), settings: receiptSettings } });
});

router.post('/agent/jobs/:id/result', (req, res) => {
  const agent = getPrinterAgent(req);
  if (!agent) return res.status(401).json({ error: 'Invalid printer agent token.' });
  const printed = req.body?.printed === true;
  const requestedJobId = Number(req.params.id);
  const isDocumentJob = req.body?.jobType === 'document' || requestedJobId < 0;
  const table = isDocumentJob ? 'printer_document_jobs' : 'printer_jobs';
  const result = db.prepare(`
    UPDATE ${table}
    SET status = CASE WHEN ? = 1 THEN 'printed' WHEN attempts < 5 THEN 'queued' ELSE 'failed' END,
      claimed_agent_id = NULL, claimed_at = NULL, printed_at = ?, last_error = ?
    WHERE id = ? AND branch_code = ? AND claimed_agent_id = ? AND status = 'claimed'
  `).run(printed ? 1 : 0, printed ? new Date().toISOString() : null, printed ? null : String(req.body?.error || 'Print failed').slice(0, 500), Math.abs(requestedJobId), agent.branch_code, agent.id);
  if (!result.changes) return res.status(409).json({ error: 'Print job is no longer assigned to this agent.' });
  const status = db.prepare(`SELECT status FROM ${table} WHERE id = ?`).get(Math.abs(requestedJobId)).status;
  res.json({ ok: true, status });
});

router.get('/devices', authMiddleware, async (_req, res) => {
  if (process.platform !== 'win32') return res.json({ supported: false, devices: [] });
  try {
    res.json({ supported: true, devices: await discoverWindowsSerialPorts() });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to scan Windows serial ports.' });
  }
});

router.put('/devices/serial', authMiddleware, async (req, res) => {
  if (process.platform !== 'win32' || !isLoopbackRequest(req)) return res.status(403).json({ error: 'Printer auto-configuration is available on the local Windows till only.' });
  const port = String(req.body?.port || '').toUpperCase();
  const devices = await discoverWindowsSerialPorts().catch(() => []);
  const device = devices.find((entry) => entry.port === port);
  if (!device) return res.status(400).json({ error: 'Select a currently detected COM port.' });
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  upsert.run('printer_transport', 'serial');
  upsert.run('printer_path', device.port);
  upsert.run('printer_device_name', device.name);
  res.json({ ok: true, port: device.port, name: device.name });
});

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