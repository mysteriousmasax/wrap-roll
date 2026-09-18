import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { createMenuBookExport } from '../utils/menuBookExport.js';
import { broadcast } from '../ws.js';
import { deletionViewer, requireAdilaDeletion, recordDeletion } from '../utils/deletionPolicy.js';

const router = Router();

const fallbackMenuImage = 'https://wrapandrolltz.com/uploads/photo_gallery/d706fc0ef56440dd131465fd75aae870.jpg';
const maxPublicEmbeddedImageLength = 32000;

function getMenuImage(image, isPublic = false) {
  if (typeof image !== 'string') return fallbackMenuImage;
  const value = image.trim();
  if (isPublic && value.startsWith('data:image/') && value.length > maxPublicEmbeddedImageLength) return fallbackMenuImage;
  if (/^(https?:\/\/|\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(value)) return value;
  return fallbackMenuImage;
}

function normalizeMenuCategories(categories) {
  return [...new Set((Array.isArray(categories) ? categories : [categories]).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
}

function parseIngredients(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function mapMenuItem(row, isPublic = false) {
  const categories = db.prepare('SELECT category FROM menu_item_categories WHERE menu_item_id = ? ORDER BY category').all(row.id).map((entry) => entry.category);
  const modifiers = db.prepare(`
    SELECT m.id, m.name, m.price, m.type
    FROM modifiers m
    JOIN menu_item_modifiers mim ON mim.modifier_id = m.id
    WHERE mim.menu_item_id = ?
    ORDER BY m.type, m.name
  `).all(row.id);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    category: row.category,
    categories: categories.length ? categories : [row.category].filter(Boolean),
    modifiers,
    image: getMenuImage(row.image, isPublic),
    prep_time_minutes: Number(row.prep_time_minutes ?? 8),
    popular: !!row.popular,
    active: !!row.active,
    ingredients: parseIngredients(row.ingredients),
    cooking_instructions: row.cooking_instructions || '',
  };
}

router.get('/categories', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT name, slug, active FROM menu_categories ORDER BY name').all();
  res.json(rows);
});

router.post('/categories', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';
  try {
    const result = db.prepare('INSERT INTO menu_categories (name, slug, active, created_at) VALUES (?, ?, 1, ?)').run(name, slug, new Date().toISOString());
    const row = db.prepare('SELECT name, slug, active FROM menu_categories WHERE id = ?').get(result.lastInsertRowid);
    broadcast('menu:updated', { type: 'category', action: 'created', id: row.slug });
    res.status(201).json(row);
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'Category already exists' });
    throw error;
  }
});

router.put('/categories/:slug', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const existing = db.prepare('SELECT * FROM menu_categories WHERE slug = ? OR id = ?').get(req.params.slug, Number(req.params.slug));
  if (!existing) return res.status(404).json({ error: 'Category not found' });
  const name = String(req.body?.name || existing.name).trim();
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';
  db.prepare('UPDATE menu_categories SET name = ?, slug = ? WHERE id = ?').run(name, slug, existing.id);
  db.prepare('UPDATE menu_item_categories SET category = ? WHERE category = ?').run(slug, existing.slug);
  db.prepare('UPDATE menu_items SET category = ? WHERE category = ?').run(slug, existing.slug);
  const row = db.prepare('SELECT name, slug, active FROM menu_categories WHERE id = ?').get(existing.id);
  broadcast('menu:updated', { type: 'category', action: 'updated', id: row.slug });
  res.json(row);
});

router.delete('/categories/:slug', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const existing = db.prepare('SELECT * FROM menu_categories WHERE slug = ? OR id = ?').get(req.params.slug, Number(req.params.slug));
  if (!existing) return res.status(404).json({ error: 'Category not found' });
  db.prepare('DELETE FROM menu_categories WHERE id = ?').run(existing.id);
  db.prepare('DELETE FROM menu_item_categories WHERE category = ?').run(existing.slug);
  db.prepare("UPDATE menu_items SET category = '' WHERE category = ?").run(existing.slug);
  broadcast('menu:updated', { type: 'category', action: 'deleted', id: existing.slug });
  res.json({ ok: true });
});

router.get('/', authMiddleware, (req, res) => {
  const { all } = req.query;
  const sql = all ? 'SELECT * FROM menu_items ORDER BY category, name' : 'SELECT * FROM menu_items WHERE active = 1 ORDER BY category, name';
  res.json(db.prepare(sql).all().map(mapMenuItem));
});

router.get('/public', (req, res) => {
  res.json(db.prepare('SELECT * FROM menu_items WHERE active = 1 ORDER BY category, name').all().map((row) => mapMenuItem(row, true)));
});

router.get('/modifiers/public', (req, res) => {
  res.json(db.prepare('SELECT id, name, price, type FROM modifiers ORDER BY type, name').all());
});

router.get('/modifiers', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM modifiers ORDER BY type, name').all());
});

router.get('/export', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const format = String(req.query.format || '').toLowerCase();
  if (!['pdf', 'xlsx', 'docx', 'pptx'].includes(format)) return res.status(400).json({ error: 'Menu book format must be PDF, Excel, Word, or PowerPoint' });
  try {
    const items = db.prepare('SELECT * FROM menu_items WHERE active = 1 ORDER BY category, name').all().map(mapMenuItem);
    const modifiers = db.prepare('SELECT * FROM modifiers ORDER BY type, name').all();
    const result = await createMenuBookExport(format, items, modifiers);
    res.type(result.contentType).set('Content-Disposition', `attachment; filename="wrap-roll-menu-book.${result.extension}"`).send(result.buffer);
  } catch (error) {
    console.error('Menu book export failed:', error.message);
    res.status(500).json({ error: 'Unable to create the menu book export' });
  }
});

router.post('/modifiers', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { name, price = 0, type = 'add' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Modifier name is required' });
  if (!['add', 'remove'].includes(type)) return res.status(400).json({ error: 'Modifier type must be add or remove' });

  const result = db.prepare('INSERT INTO modifiers (name, price, type) VALUES (?, ?, ?)')
    .run(name.trim(), Number(price) || 0, type);
  const modifier = db.prepare('SELECT * FROM modifiers WHERE id = ?').get(result.lastInsertRowid);
  broadcast('menu:updated', { type: 'modifier', action: 'created', id: modifier.id });
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

  const modifier = db.prepare('SELECT * FROM modifiers WHERE id = ?').get(req.params.id);
  broadcast('menu:updated', { type: 'modifier', action: 'updated', id: modifier.id });
  res.json(modifier);
});

router.delete('/modifiers/:id', authMiddleware, deletionViewer, requireAdilaDeletion, (req, res) => {
  const existing = db.prepare('SELECT * FROM modifiers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Modifier not found' });

  recordDeletion({ resourceType: 'modifier', resourceId: existing.id, snapshot: existing, reason: req.body?.reason, user: req.user });
  db.prepare('DELETE FROM modifiers WHERE id = ?').run(req.params.id);
  broadcast('menu:updated', { type: 'modifier', action: 'deleted', id: Number(req.params.id) });
  res.json({ ok: true });
});

router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, description, price, category, categories, modifier_ids: modifierIds = [], image, popular, prep_time_minutes, ingredients, cooking_instructions } = req.body;
  const nextCategories = normalizeMenuCategories(categories ?? category);
  if (!name || price == null || nextCategories.length === 0) return res.status(400).json({ error: 'Name, price, and at least one category required' });
  const prepMinutes = Number(prep_time_minutes ?? 8);
  const normalizedIngredients = JSON.stringify(Array.isArray(ingredients) ? ingredients : []);
  const result = db.prepare(
    'INSERT INTO menu_items (name, description, price, category, image, prep_time_minutes, popular, active, ingredients, cooking_instructions) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
  ).run(name, description || '', Number(price), nextCategories[0], image || '', Number.isFinite(prepMinutes) ? prepMinutes : 8, popular ? 1 : 0, normalizedIngredients, String(cooking_instructions || ''));
  const linkCategory = db.prepare('INSERT OR IGNORE INTO menu_item_categories (menu_item_id, category) VALUES (?, ?)');
  nextCategories.forEach((value) => linkCategory.run(result.lastInsertRowid, value));
  const linkModifier = db.prepare('INSERT OR IGNORE INTO menu_item_modifiers (menu_item_id, modifier_id) VALUES (?, ?)');
  (Array.isArray(modifierIds) ? modifierIds : []).map(Number).filter(Number.isInteger).forEach((modifierId) => linkModifier.run(result.lastInsertRowid, modifierId));
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(result.lastInsertRowid);
  broadcast('menu:updated', { type: 'item', action: 'created', id: item.id });
  res.status(201).json(mapMenuItem(item));
});

router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, description, price, category, categories, modifier_ids: modifierIds, image, popular, active, prep_time_minutes, ingredients, cooking_instructions } = req.body;
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const nextCategories = categories === undefined ? null : normalizeMenuCategories(categories ?? category);
  if (nextCategories && nextCategories.length === 0) return res.status(400).json({ error: 'At least one category is required' });
  const nextPrepMinutes = prep_time_minutes == null ? existing.prep_time_minutes ?? 8 : Number(prep_time_minutes) || 8;
  const normalizedIngredients = ingredients === undefined ? existing.ingredients || '[]' : JSON.stringify(Array.isArray(ingredients) ? ingredients : []);
  db.prepare(
    'UPDATE menu_items SET name = ?, description = ?, price = ?, category = ?, image = ?, prep_time_minutes = ?, popular = ?, active = ?, ingredients = ?, cooking_instructions = ? WHERE id = ?'
  ).run(
    name ?? existing.name,
    description ?? existing.description,
    price ?? existing.price,
    nextCategories?.[0] ?? category ?? existing.category,
    image ?? existing.image,
    nextPrepMinutes,
    popular != null ? (popular ? 1 : 0) : existing.popular,
    active != null ? (active ? 1 : 0) : existing.active,
    normalizedIngredients,
    cooking_instructions == null ? (existing.cooking_instructions || '') : String(cooking_instructions),
    req.params.id
  );
  if (nextCategories) {
    db.prepare('DELETE FROM menu_item_categories WHERE menu_item_id = ?').run(req.params.id);
    const linkCategory = db.prepare('INSERT INTO menu_item_categories (menu_item_id, category) VALUES (?, ?)');
    nextCategories.forEach((value) => linkCategory.run(req.params.id, value));
  }
  if (modifierIds !== undefined) {
    db.prepare('DELETE FROM menu_item_modifiers WHERE menu_item_id = ?').run(req.params.id);
    const linkModifier = db.prepare('INSERT OR IGNORE INTO menu_item_modifiers (menu_item_id, modifier_id) VALUES (?, ?)');
    (Array.isArray(modifierIds) ? modifierIds : []).map(Number).filter(Number.isInteger).forEach((modifierId) => linkModifier.run(req.params.id, modifierId));
  }
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  broadcast('menu:updated', { type: 'item', action: 'updated', id: item.id });
  res.json(mapMenuItem(item));
});

router.delete('/:id', authMiddleware, deletionViewer, requireAdilaDeletion, (req, res) => {
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  recordDeletion({ resourceType: 'menu_item', resourceId: existing.id, snapshot: existing, reason: req.body?.reason, user: req.user });
  db.prepare('DELETE FROM menu_item_categories WHERE menu_item_id = ?').run(req.params.id);
  db.prepare('DELETE FROM menu_item_modifiers WHERE menu_item_id = ?').run(req.params.id);
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  broadcast('menu:updated', { type: 'item', action: 'deleted', id: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
