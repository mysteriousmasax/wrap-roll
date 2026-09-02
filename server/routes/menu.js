import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

function mapMenuItem(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    category: row.category,
    image: row.image,
    prep_time_minutes: Number(row.prep_time_minutes ?? 8),
    popular: !!row.popular,
    active: !!row.active,
  };
}

router.get('/', authMiddleware, (req, res) => {
  const { all } = req.query;
  const sql = all ? 'SELECT * FROM menu_items ORDER BY category, name' : 'SELECT * FROM menu_items WHERE active = 1 ORDER BY category, name';
  res.json(db.prepare(sql).all().map(mapMenuItem));
});

router.get('/public', (req, res) => {
  res.json(db.prepare('SELECT * FROM menu_items WHERE active = 1 ORDER BY category, name').all().map(mapMenuItem));
});

router.get('/modifiers', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM modifiers ORDER BY type, name').all());
});

router.post('/modifiers', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { name, price = 0, type = 'add' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Modifier name is required' });
  if (!['add', 'remove'].includes(type)) return res.status(400).json({ error: 'Modifier type must be add or remove' });

  const result = db.prepare('INSERT INTO modifiers (name, price, type) VALUES (?, ?, ?)')
    .run(name.trim(), Number(price) || 0, type);
  const modifier = db.prepare('SELECT * FROM modifiers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(modifier);
});

router.put('/modifiers/:id', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { name, price, type } = req.body;
  const existing = db.prepare('SELECT * FROM modifiers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Modifier not found' });

  const nextName = name?.trim() || existing.name;
  const nextType = type && ['add', 'remove'].includes(type) ? type : existing.type;
  const nextPrice = price == null ? existing.price : Number(price) || 0;

  db.prepare('UPDATE modifiers SET name = ?, price = ?, type = ? WHERE id = ?')
    .run(nextName, nextPrice, nextType, req.params.id);

  res.json(db.prepare('SELECT * FROM modifiers WHERE id = ?').get(req.params.id));
});

router.delete('/modifiers/:id', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const existing = db.prepare('SELECT * FROM modifiers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Modifier not found' });

  db.prepare('DELETE FROM modifiers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, description, price, category, image, popular, prep_time_minutes } = req.body;
  if (!name || price == null || !category) return res.status(400).json({ error: 'Name, price, and category required' });
  const prepMinutes = Number(prep_time_minutes ?? 8);
  const result = db.prepare(
    'INSERT INTO menu_items (name, description, price, category, image, prep_time_minutes, popular, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
  ).run(name, description || '', Number(price), category, image || '', Number.isFinite(prepMinutes) ? prepMinutes : 8, popular ? 1 : 0);
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(mapMenuItem(item));
});

router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, description, price, category, image, popular, active, prep_time_minutes } = req.body;
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const nextPrepMinutes = prep_time_minutes == null ? existing.prep_time_minutes ?? 8 : Number(prep_time_minutes) || 8;
  db.prepare(
    'UPDATE menu_items SET name = ?, description = ?, price = ?, category = ?, image = ?, prep_time_minutes = ?, popular = ?, active = ? WHERE id = ?'
  ).run(
    name ?? existing.name,
    description ?? existing.description,
    price ?? existing.price,
    category ?? existing.category,
    image ?? existing.image,
    nextPrepMinutes,
    popular != null ? (popular ? 1 : 0) : existing.popular,
    active != null ? (active ? 1 : 0) : existing.active,
    req.params.id
  );
  res.json(mapMenuItem(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  db.prepare('UPDATE menu_items SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
