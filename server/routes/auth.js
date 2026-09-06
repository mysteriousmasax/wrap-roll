import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import db from '../db/database.js';
import { signToken, authMiddleware, JWT_SECRET } from '../middleware/auth.js';
import { verifyPin } from '../utils/pins.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, pin } = req.body;
  const suppliedSecret = (password ?? pin ?? '').toString();
  const suppliedIdentifier = (username ?? '').toString();

  if (!suppliedIdentifier || !suppliedSecret) {
    return res.status(400).json({ error: 'Username and PIN/password are required' });
  }

  const normalize = (value) => String(value ?? '').trim().toLowerCase();
  const loginName = normalize(suppliedIdentifier);
  const nameAliases = new Set([
    loginName,
    loginName.replace(/\s+/g, '.'),
    loginName.replace(/[^a-z0-9]+/g, '.'),
  ]);

  const users = db.prepare('SELECT id, name, role, avatar, username, email, password, pin FROM users').all();
  let user = null;

  for (const candidate of users) {
    const fieldValues = [
      normalize(candidate.username),
      normalize(candidate.email),
      normalize(candidate.name),
      normalize(candidate.name).replace(/\s+/g, '.'),
      normalize(candidate.name).replace(/[^a-z0-9]+/g, '.'),
    ];

    if (!fieldValues.some((value) => value && nameAliases.has(value))) continue;

    if (await verifyPin(suppliedSecret, candidate.password || candidate.pin)) {
      user = candidate;
      break;
    }
  }

  if (!user) return res.status(401).json({ error: 'Invalid username or PIN/password' });

  const staff = db.prepare('SELECT id, name, shift, status FROM staff WHERE user_id = ?').get(user.id);
  if (staff?.status === 'removed') return res.status(403).json({ error: 'This staff account has been removed.' });
  if (staff && staff.status !== 'on-clock') {
    const now = new Date();
    const loginTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const shiftDate = now.toISOString().slice(0, 10);
    db.prepare('UPDATE staff SET status = ?, clock_in = ? WHERE id = ?').run('on-clock', loginTime, staff.id);
    const activeShift = db.prepare("SELECT id FROM shift_logs WHERE staff_id = ? AND shift_date = ? AND status = 'active'").get(staff.id, shiftDate);
    if (!activeShift) db.prepare('INSERT INTO shift_logs (staff_id, staff_name, shift_date, start_time, status, notes) VALUES (?, ?, ?, ?, ?, ?)').run(staff.id, staff.name, shiftDate, loginTime, 'active', staff.shift || 'Assigned shift');
  }

  const { pin: _, password: __, ...safeUser } = user;
  const token = signToken(safeUser);
  res.json({ user: safeUser, token });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, role, avatar FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user });
});

router.post('/logout', authMiddleware, (req, res) => {
  const staff = db.prepare('SELECT id FROM staff WHERE user_id = ?').get(req.user.id);
  if (staff) {
    const now = new Date();
    const shiftDate = now.toISOString().slice(0, 10);
    const activeShift = db.prepare("SELECT id, start_time FROM shift_logs WHERE staff_id = ? AND shift_date = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(staff.id, shiftDate);
    db.prepare('UPDATE staff SET status = ?, clock_in = NULL WHERE id = ?').run('off-clock', staff.id);
    if (activeShift) {
      const loginAt = new Date(`${shiftDate} ${activeShift.start_time}`);
      const hours = Number.isNaN(loginAt.getTime()) ? 0 : Math.max(0, (now.getTime() - loginAt.getTime()) / 3600000);
      db.prepare('UPDATE shift_logs SET end_time = ?, hours_worked = ?, status = ? WHERE id = ?').run(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), hours, 'completed', activeShift.id);
    }
  }
  res.json({ ok: true });
});

router.patch('/me', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT id, name, role, avatar FROM users WHERE id = ?').get(req.user.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { name, avatar } = req.body;
  if (avatar !== undefined && avatar !== null && avatar !== '' && !/^data:image\/(png|jpe?g|webp);base64,/.test(avatar)) {
    return res.status(400).json({ error: 'Avatar must be a PNG, JPEG, or WEBP image' });
  }

  const nextName = typeof name === 'string' && name.trim() ? name.trim() : existing.name;
  const nextAvatar = typeof avatar === 'string' && avatar ? avatar : existing.avatar;
  db.prepare('UPDATE users SET name = ?, avatar = ? WHERE id = ?').run(nextName, nextAvatar, req.user.id);

  const user = db.prepare('SELECT id, name, role, avatar FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

export default router;
