import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { hashPin } from '../utils/pins.js';

const router = Router();

function mapStaff(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    shift: row.shift,
    status: row.status,
    clockIn: row.clock_in,
    avatar: row.avatar,
    phone: row.phone,
  };
}

router.get('/', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM staff ORDER BY name').all().map(mapStaff));
});

router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name, role, shift, phone, avatar, username, email, password } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'A password of at least 8 characters is required' });
  const userRole = ['admin', 'foh', 'kitchen', 'manager', 'executive'].includes(role) ? role : 'foh';
  const initials = avatar || name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const accountName = String(username || name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, ''));
  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(accountName.toLowerCase(), email?.trim().toLowerCase() || '');
  if (existingUsername) return res.status(409).json({ error: 'That username or email is already in use' });
  const hashedPassword = await hashPin(password);
  const createRecords = db.transaction(() => {
    const userResult = db.prepare('INSERT INTO users (name, role, pin, avatar, username, email, password) VALUES (?, ?, ?, ?, ?, ?, ?)').run(name, userRole, '', initials, accountName.toLowerCase(), email?.trim().toLowerCase() || '', hashedPassword);
    const result = db.prepare('INSERT INTO staff (name, role, shift, status, avatar, phone) VALUES (?, ?, ?, ?, ?, ?)').run(name, userRole, shift || 'Morning', 'off-clock', initials, phone || '');
    return { staffId: result.lastInsertRowid, userId: userResult.lastInsertRowid };
  });
  const { staffId } = createRecords();
  res.status(201).json(mapStaff(db.prepare('SELECT * FROM staff WHERE id = ?').get(staffId)));
});

router.put('/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Staff not found' });
  const { name, role, shift, status, clockIn, phone, avatar } = req.body;
  db.prepare(
    'UPDATE staff SET name = ?, role = ?, shift = ?, status = ?, clock_in = ?, phone = ?, avatar = ? WHERE id = ?'
  ).run(
    name ?? existing.name,
    role ?? existing.role,
    shift ?? existing.shift,
    status ?? existing.status,
    clockIn !== undefined ? clockIn : existing.clock_in,
    phone ?? existing.phone,
    avatar ?? existing.avatar,
    req.params.id
  );
  res.json(mapStaff(db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id)));
});

router.patch('/:id/credentials', authMiddleware, requireRole('admin'), async (req, res) => {
  const staff = db.prepare('SELECT name FROM staff WHERE id = ?').get(req.params.id);
  if (!staff) return res.status(404).json({ error: 'Staff not found' });
  const { username, email, password } = req.body;
  if (password && String(password).length < 8) return res.status(400).json({ error: 'A password of at least 8 characters is required' });
  const user = db.prepare('SELECT id FROM users WHERE name = ?').get(staff.name);
  if (!user) return res.status(404).json({ error: 'Login account not found' });
  const updates = { username: username?.trim().toLowerCase(), email: email?.trim().toLowerCase(), password: password ? await hashPin(password) : undefined };
  db.prepare('UPDATE users SET username = COALESCE(?, username), email = COALESCE(?, email), password = COALESCE(?, password) WHERE id = ?').run(updates.username || null, updates.email || null, updates.password || null, user.id);
  res.json({ ok: true });
});

router.patch('/:id/clock', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Staff not found' });
  const { action } = req.body;
  if (action === 'in') {
    db.prepare('UPDATE staff SET status = ?, clock_in = ? WHERE id = ?').run(
      'on-clock',
      new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      req.params.id
    );
  } else {
    db.prepare('UPDATE staff SET status = ?, clock_in = NULL WHERE id = ?').run('off-clock', req.params.id);
  }
  res.json(mapStaff(db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id)));
});

export default router;
