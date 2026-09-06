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
    userId: row.user_id,
    username: row.username,
    email: row.email,
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function customRoles() {
  try {
    const value = db.prepare("SELECT value FROM settings WHERE key = 'custom_staff_roles'").get()?.value;
    const roles = JSON.parse(value || '[]');
    return Array.isArray(roles) ? roles : [];
  } catch {
    return [];
  }
}

function resolveRole(role) {
  const builtIn = ['admin', 'foh', 'kitchen', 'manager', 'executive'];
  if (builtIn.includes(role)) return { label: role, baseRole: role };
  const custom = customRoles().find((item) => item.name === role);
  return custom ? { label: custom.name, baseRole: custom.baseRole || 'foh' } : { label: 'foh', baseRole: 'foh' };
}

function activityForStaff(staffId, userId) {
  const orderActivity = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS value FROM orders WHERE staff_id = ? AND date(created_at) = date('now')").get(userId || -1);
  const inventoryActivity = db.prepare("SELECT COUNT(*) AS count FROM inventory_audit WHERE changed_by_id = ? AND date(created_at) = date('now')").get(userId || -1);
  const taskActivity = db.prepare("SELECT COUNT(*) AS count FROM staff_tasks WHERE staff_id = ? AND status != 'completed'").get(staffId);
  return {
    orders: Number(orderActivity.count || 0),
    orderValue: Number(orderActivity.value || 0),
    inventoryChanges: Number(inventoryActivity.count || 0),
    openTasks: Number(taskActivity.count || 0),
  };
}

function mapTrackingStaff(row) {
  const mapped = mapStaff(row);
  const shift = db.prepare("SELECT * FROM shift_logs WHERE staff_id = ? AND shift_date = ? ORDER BY id DESC LIMIT 1").get(row.id, today());
  return {
    ...mapped,
    attendance: shift ? { id: shift.id, shift: shift.notes || row.shift, date: shift.shift_date, login: shift.start_time, logout: shift.end_time, hours: shift.hours_worked, status: shift.status } : null,
    activity: activityForStaff(row.id, row.user_id),
  };
}

router.get('/', authMiddleware, (req, res) => {
  res.json(db.prepare("SELECT staff.*, users.username, users.email FROM staff LEFT JOIN users ON users.id = staff.user_id WHERE staff.status != 'removed' ORDER BY staff.name").all().map(mapStaff));
});

router.get('/roles', authMiddleware, requireRole('admin'), (_req, res) => {
  res.json(customRoles());
});

router.get('/tracking', authMiddleware, (req, res) => {
  const staff = db.prepare('SELECT staff.*, users.username, users.email FROM staff LEFT JOIN users ON users.id = staff.user_id ORDER BY CASE WHEN lower(staff.shift) LIKE \'%morning%\' THEN 0 ELSE 1 END, staff.name').all();
  const attendance = db.prepare('SELECT shift_logs.*, staff.shift AS assigned_shift FROM shift_logs INNER JOIN staff ON staff.id = shift_logs.staff_id WHERE shift_logs.shift_date >= date(\'now\', \'-14 days\') ORDER BY shift_logs.shift_date DESC, shift_logs.start_time DESC').all();
  res.json({
    staff: staff.map(mapTrackingStaff),
    attendance: attendance.map((row) => ({ id: row.id, staffId: row.staff_id, staffName: row.staff_name, assignedShift: row.assigned_shift, date: row.shift_date, login: row.start_time, logout: row.end_time, hours: row.hours_worked, status: row.status })),
    tasks: db.prepare("SELECT staff_tasks.*, staff.name AS staff_name FROM staff_tasks INNER JOIN staff ON staff.id = staff_tasks.staff_id WHERE staff_tasks.status != 'completed' ORDER BY due_date IS NULL, due_date ASC").all().map((row) => ({ id: row.id, staffId: row.staff_id, staffName: row.staff_name, title: row.title, status: row.status, dueDate: row.due_date })),
  });
});

router.post('/tasks', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { staffId, title, dueDate } = req.body || {};
  const staff = db.prepare('SELECT id FROM staff WHERE id = ?').get(Number(staffId));
  if (!staff || !String(title || '').trim()) return res.status(400).json({ error: 'Staff member and task title are required.' });
  const result = db.prepare('INSERT INTO staff_tasks (staff_id, title, due_date, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(staff.id, String(title).trim(), dueDate || null, req.user.id, new Date().toISOString());
  res.status(201).json(db.prepare('SELECT staff_tasks.*, staff.name AS staff_name FROM staff_tasks INNER JOIN staff ON staff.id = staff_tasks.staff_id WHERE staff_tasks.id = ?').get(result.lastInsertRowid));
});

router.patch('/tasks/:id', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const task = db.prepare('SELECT id, title, status FROM staff_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const nextStatus = req.body?.status;
  const allowedStatus = ['open', 'completed', 'approved', 'rejected'];
  const resolvedStatus = allowedStatus.includes(nextStatus) ? nextStatus : 'open';
  const completedAt = ['completed', 'approved', 'rejected'].includes(resolvedStatus) ? new Date().toISOString() : null;
  db.prepare('UPDATE staff_tasks SET status = ?, completed_at = ? WHERE id = ?').run(resolvedStatus, completedAt, req.params.id);

  if (resolvedStatus === 'approved' || resolvedStatus === 'rejected') {
    const prefix = resolvedStatus === 'approved' ? 'approved' : 'rejected';
    db.prepare('INSERT INTO notifications (type, title, message, read, created_at) VALUES (?, ?, ?, 0, ?)')
      .run('info', `CRM action ${prefix}`, `${task.title} was ${prefix}.`, new Date().toISOString());
  }

  res.json({ ok: true, status: resolvedStatus });
});

router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name, role, shift, phone, avatar, username, email, password } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'A password of at least 8 characters is required' });
  const resolvedRole = resolveRole(role);
  const initials = avatar || name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const accountName = String(username || name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, ''));
  const normalizedUsername = accountName.toLowerCase();
  const normalizedEmail = email?.trim().toLowerCase() || '';
  const existingUsername = normalizedEmail
    ? db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(normalizedUsername, normalizedEmail)
    : db.prepare('SELECT id FROM users WHERE username = ?').get(normalizedUsername);
  if (existingUsername) return res.status(409).json({ error: 'That username or email is already in use' });
  const hashedPassword = await hashPin(password);
  const createRecords = db.transaction(() => {
    const userResult = db.prepare('INSERT INTO users (name, role, pin, avatar, username, email, password) VALUES (?, ?, ?, ?, ?, ?, ?)').run(name, resolvedRole.baseRole, '', initials, normalizedUsername, normalizedEmail, hashedPassword);
    const result = db.prepare('INSERT INTO staff (user_id, name, role, shift, status, avatar, phone) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userResult.lastInsertRowid, name, resolvedRole.label, shift || 'Morning', 'off-clock', initials, phone || '');
    return { staffId: result.lastInsertRowid, userId: userResult.lastInsertRowid };
  });
  const { staffId } = createRecords();
  res.status(201).json(mapStaff(db.prepare('SELECT staff.*, users.username, users.email FROM staff LEFT JOIN users ON users.id = staff.user_id WHERE staff.id = ?').get(staffId)));
});

router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Staff not found' });
  const { name, role, shift, status, clockIn, phone, avatar } = req.body;
  const resolvedRole = role ? resolveRole(role) : resolveRole(existing.role);
  db.prepare(
    'UPDATE staff SET name = ?, role = ?, shift = ?, status = ?, clock_in = ?, phone = ?, avatar = ? WHERE id = ?'
  ).run(
    name ?? existing.name,
    resolvedRole.label,
    shift ?? existing.shift,
    status ?? existing.status,
    clockIn !== undefined ? clockIn : existing.clock_in,
    phone ?? existing.phone,
    avatar ?? existing.avatar,
    req.params.id
  );
  if (existing.user_id) {
    db.prepare('UPDATE users SET name = ?, role = ?, avatar = ? WHERE id = ?')
      .run(name ?? existing.name, resolvedRole.baseRole, avatar ?? existing.avatar, existing.user_id);
  }
  res.json(mapStaff(db.prepare('SELECT staff.*, users.username, users.email FROM staff LEFT JOIN users ON users.id = staff.user_id WHERE staff.id = ?').get(req.params.id)));
});

router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const staff = db.prepare('SELECT id, user_id FROM staff WHERE id = ?').get(req.params.id);
  if (!staff) return res.status(404).json({ error: 'Staff not found' });
  db.prepare("UPDATE staff SET status = 'removed', clock_in = NULL WHERE id = ?").run(staff.id);
  res.json({ ok: true });
});

router.patch('/:id/credentials', authMiddleware, requireRole('admin'), async (req, res) => {
  const staff = db.prepare('SELECT user_id, name FROM staff WHERE id = ?').get(req.params.id);
  if (!staff) return res.status(404).json({ error: 'Staff not found' });
  const { username, email, password } = req.body;
  if (password && String(password).length < 8) return res.status(400).json({ error: 'A password of at least 8 characters is required' });
  const user = staff.user_id ? db.prepare('SELECT id FROM users WHERE id = ?').get(staff.user_id) : db.prepare('SELECT id FROM users WHERE name = ?').get(staff.name);
  if (!user) return res.status(404).json({ error: 'Login account not found' });
  const updates = { username: username?.trim().toLowerCase(), email: email?.trim().toLowerCase(), password: password ? await hashPin(password) : undefined };
  db.prepare('UPDATE users SET username = COALESCE(?, username), email = COALESCE(?, email), password = COALESCE(?, password) WHERE id = ?').run(updates.username || null, updates.email || null, updates.password || null, user.id);
  db.prepare('UPDATE staff SET user_id = ? WHERE id = ?').run(user.id, req.params.id);
  res.json({ ok: true });
});

router.patch('/:id/clock', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const existing = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Staff not found' });
  const { action } = req.body;
  if (action === 'in') {
    const now = new Date();
    db.prepare('UPDATE staff SET status = ?, clock_in = ? WHERE id = ?').run(
      'on-clock',
      now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      req.params.id
    );
    db.prepare('INSERT INTO shift_logs (staff_id, staff_name, shift_date, start_time, status, notes) VALUES (?, ?, ?, ?, ?, ?)').run(existing.id, existing.name, today(), now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), 'active', existing.shift || 'Shift');
  } else {
    const now = new Date();
    db.prepare('UPDATE staff SET status = ?, clock_in = NULL WHERE id = ?').run('off-clock', req.params.id);
    const openShift = db.prepare("SELECT * FROM shift_logs WHERE staff_id = ? AND shift_date = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(existing.id, today());
    if (openShift) {
      const loginAt = new Date(`${today()} ${openShift.start_time}`);
      const hours = Number.isNaN(loginAt.getTime()) ? 0 : Math.max(0, (now.getTime() - loginAt.getTime()) / 3600000);
      db.prepare('UPDATE shift_logs SET end_time = ?, hours_worked = ?, status = ? WHERE id = ?').run(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), Number.isFinite(hours) ? hours : 0, 'completed', openShift.id);
    }
  }
  res.json(mapStaff(db.prepare('SELECT staff.*, users.username, users.email FROM staff LEFT JOIN users ON users.id = staff.user_id WHERE staff.id = ?').get(req.params.id)));
});

export default router;
