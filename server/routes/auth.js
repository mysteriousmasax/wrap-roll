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

  const { pin: _, password: __, ...safeUser } = user;
  const token = signToken(safeUser);
  res.json({ user: safeUser, token });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, role, avatar FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user });
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
