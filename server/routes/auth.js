import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import db from '../db/database.js';
import { signToken, authMiddleware, JWT_SECRET } from '../middleware/auth.js';
import { hashPin, verifyPin } from '../utils/pins.js';
import { broadcast } from '../ws.js';
import { restaurantTime } from '../utils/localTime.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, pin, location } = req.body;
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

  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Location access is required before signing in.' });
  }

  const staff = db.prepare('SELECT id, name, shift, status FROM staff WHERE user_id = ?').get(user.id);
  if (staff?.status === 'removed') return res.status(403).json({ error: 'This staff account has been removed.' });
  if (staff && staff.status !== 'on-clock') {
    const now = new Date();
    const local = restaurantTime(now);
    const loginTime = local.time;
    const shiftDate = local.date;
    db.prepare('UPDATE staff SET status = ?, clock_in = ? WHERE id = ?').run('on-clock', loginTime, staff.id);
    const activeShift = db.prepare("SELECT id FROM shift_logs WHERE staff_id = ? AND shift_date = ? AND status = 'active'").get(staff.id, shiftDate);
    if (!activeShift) db.prepare('INSERT INTO shift_logs (staff_id, staff_name, shift_date, start_time, status, notes, clock_in_latitude, clock_in_longitude, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(staff.id, staff.name, shiftDate, loginTime, 'active', staff.shift || 'Assigned shift', latitude, longitude, now.toISOString());
  } else {
    db.prepare('UPDATE shift_logs SET clock_in_latitude = ?, clock_in_longitude = ? WHERE staff_id = ? AND status = \'active\' AND shift_date = ?').run(latitude, longitude, staff.id, restaurantTime().date);
  }

  const { pin: _, password: __, ...safeUser } = user;
  const token = signToken(safeUser);
  const loginNotification = { type: 'info', title: 'Staff login', message: `${safeUser.name} signed in as ${safeUser.role}.`, audienceRole: 'manager' };
  db.prepare('INSERT INTO notifications (type, title, message, read, created_at, audience_role) VALUES (?, ?, ?, 0, ?, ?)').run(loginNotification.type, loginNotification.title, loginNotification.message, new Date().toISOString(), loginNotification.audienceRole);
  broadcast('notification:created', loginNotification);
  res.json({ user: safeUser, token });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, role, avatar, username, email FROM users WHERE id = ?').get(req.user.id);
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

router.patch('/me', authMiddleware, async (req, res) => {
  const existing = db.prepare('SELECT id, name, role, avatar, username, email FROM users WHERE id = ?').get(req.user.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { name, avatar, username, email, password } = req.body;
  if (avatar !== undefined && avatar !== null && avatar !== '' && !/^data:image\/(png|jpe?g|webp);base64,/.test(avatar)) {
    return res.status(400).json({ error: 'Avatar must be a PNG, JPEG, or WEBP image' });
  }
  if (password !== undefined && password !== '' && String(password).length < 8) {
    return res.status(400).json({ error: 'A password of at least 8 characters is required' });
  }

  const nextUsername = typeof username === 'string' && username.trim() ? username.trim().toLowerCase() : existing.username;
  const nextEmail = typeof email === 'string' ? email.trim().toLowerCase() : (existing.email || '');
  if (!/^[a-z0-9][a-z0-9._-]{2,50}$/.test(nextUsername)) {
    return res.status(400).json({ error: 'Username must be 3-51 characters using letters, numbers, dots, underscores, or hyphens' });
  }
  if (nextEmail && !/^\S+@\S+\.\S+$/.test(nextEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
  const conflict = db.prepare('SELECT id FROM users WHERE id != ? AND (username = ? OR (email != \'\' AND email = ?))').get(req.user.id, nextUsername, nextEmail);
  if (conflict) return res.status(409).json({ error: 'That username or email is already in use' });

  const nextName = typeof name === 'string' && name.trim() ? name.trim() : existing.name;
  const nextAvatar = typeof avatar === 'string' && avatar ? avatar : existing.avatar;
  const nextPassword = password ? await hashPin(password) : null;
  db.prepare('UPDATE users SET name = ?, avatar = ?, username = ?, email = ?, password = COALESCE(?, password), pin = COALESCE(?, pin) WHERE id = ?')
    .run(nextName, nextAvatar, nextUsername, nextEmail, nextPassword, nextPassword, req.user.id);

  const user = db.prepare('SELECT id, name, role, avatar, username, email FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

export default router;
