import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { deletionViewer, requireAdilaDeletion, recordDeletion } from '../utils/deletionPolicy.js';

const router = Router();

function ensureInventoryColumn(name, definition) {
  const existing = new Set(db.prepare('PRAGMA table_info(inventory)').all().map((column) => column.name));
  if (!existing.has(name)) db.exec(`ALTER TABLE inventory ADD COLUMN ${name} ${definition}`);
}

function mapInventory(row) {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    threshold: row.threshold,
    supplier: row.supplier,
    lastRestocked: row.last_restocked,
    imageUrl: row.image_url,
    category: row.category,
    sku: row.sku,
    unitCost: row.unit_cost || 0,
    expiryDate: row.expiry_date,
    storageLocation: row.storage_location,
    deliveryDate: row.delivery_date || '',
    backFreezerChiller: row.back_freezer_chiller || 0,
    refrigerator: row.refrigerator || 0,
    frontSandwich: row.front_sandwich || 0,
    frontPizza: row.front_pizza || 0,
    frontBurger: row.front_burger || 0,
    total: (row.back_freezer_chiller || 0) + (row.refrigerator || 0) + (row.front_sandwich || 0) + (row.front_pizza || 0) + (row.front_burger || 0),
  };
}

function auditInventoryChange(itemId, action, user, changes) {
  db.prepare(
    'INSERT INTO inventory_audit (inventory_id, action, changed_by_id, changed_by_name, changed_by_role, changes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(itemId, action, user?.id ?? null, user?.name || 'System', user?.role || 'system', JSON.stringify(changes), new Date().toISOString());
}

function getDefaultInventoryOptions() {
  return {
    categories: ['Stock items', 'Fresh ingredients', 'Bakery', 'Cold storage', 'Packaging', 'Beverages'],
    storageLocations: ['Stock sheet', 'Back freezer', 'Fridge', 'Sandwich shelf', 'Pizza shelf', 'Burger shelf'],
  };
}

function seedInventoryOptions(table, collection, defaultValues) {
  defaultValues.forEach((value) => {
    const name = String(value || '').trim();
    if (!name) return;
    try {
      db.prepare(`INSERT OR IGNORE INTO ${table} (name) VALUES (?)`).run(name);
    } catch {
      // ignore seed collisions
    }
  });
  const rows = db.prepare(`SELECT id, name FROM ${table} ORDER BY name`).all();
  return rows.length ? rows : collection;
}

router.get('/categories', authMiddleware, (req, res) => {
  const defaultValues = getDefaultInventoryOptions().categories;
  const rows = db.prepare('SELECT id, name FROM inventory_categories ORDER BY name').all();
  if (rows.length === 0) {
    seedInventoryOptions('inventory_categories', defaultValues, defaultValues);
    return res.json(db.prepare('SELECT id, name FROM inventory_categories ORDER BY name').all());
  }
  res.json(rows);
});

router.post('/categories', authMiddleware, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const row = db.prepare('INSERT INTO inventory_categories (name) VALUES (?)').run(name);
  const saved = db.prepare('SELECT id, name FROM inventory_categories WHERE id = ?').get(row.lastInsertRowid);
  res.status(201).json(saved);
});

router.put('/categories/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM inventory_categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Category not found' });
  const name = String(req.body?.name || existing.name).trim();
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  db.prepare('UPDATE inventory_categories SET name = ? WHERE id = ?').run(name, req.params.id);
  const row = db.prepare('SELECT id, name FROM inventory_categories WHERE id = ?').get(req.params.id);
  res.json(row);
});

router.delete('/categories/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM inventory_categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Category not found' });
  db.prepare('DELETE FROM inventory_categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/storage-locations', authMiddleware, (req, res) => {
  const defaultValues = getDefaultInventoryOptions().storageLocations;
  const rows = db.prepare('SELECT id, name FROM inventory_storage_locations ORDER BY name').all();
  if (rows.length === 0) {
    seedInventoryOptions('inventory_storage_locations', defaultValues, defaultValues);
    return res.json(db.prepare('SELECT id, name FROM inventory_storage_locations ORDER BY name').all());
  }
  res.json(rows);
});

router.post('/storage-locations', authMiddleware, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Storage location name is required' });
  const row = db.prepare('INSERT INTO inventory_storage_locations (name) VALUES (?)').run(name);
  const saved = db.prepare('SELECT id, name FROM inventory_storage_locations WHERE id = ?').get(row.lastInsertRowid);
  res.status(201).json(saved);
});

router.put('/storage-locations/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM inventory_storage_locations WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Storage location not found' });
  const name = String(req.body?.name || existing.name).trim();
  if (!name) return res.status(400).json({ error: 'Storage location name is required' });
  db.prepare('UPDATE inventory_storage_locations SET name = ? WHERE id = ?').run(name, req.params.id);
  const row = db.prepare('SELECT id, name FROM inventory_storage_locations WHERE id = ?').get(req.params.id);
  res.json(row);
});

router.delete('/storage-locations/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM inventory_storage_locations WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Storage location not found' });
  db.prepare('DELETE FROM inventory_storage_locations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM inventory WHERE COALESCE(deleted_at, \'\') = \'\' ORDER BY name').all().map(mapInventory));
});

router.post('/', authMiddleware, (req, res) => {
  ensureInventoryColumn('delivery_date', "TEXT DEFAULT ''");
  ensureInventoryColumn('back_freezer_chiller', 'REAL DEFAULT 0');
  ensureInventoryColumn('refrigerator', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_sandwich', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_pizza', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_burger', 'REAL DEFAULT 0');
  const { name, quantity, unit, threshold, supplier, imageUrl, category, sku, unitCost, expiryDate, storageLocation, deliveryDate, backFreezerChiller, refrigerator, frontSandwich, frontPizza, frontBurger } = req.body;
  if (!name || quantity == null) return res.status(400).json({ error: 'Name and quantity required' });
  const today = new Date().toISOString().slice(0, 10);
  const normalizedName = String(name).trim();
  const normalizedUnit = String(unit || 'pcs').trim();
  const existing = db.prepare('SELECT * FROM inventory WHERE lower(trim(name)) = lower(?) AND lower(trim(unit)) = lower(?) ORDER BY id LIMIT 1').get(normalizedName, normalizedUnit);
  if (existing) {
    const received = Number(quantity);
    const nextQuantity = existing.quantity + received;
    db.prepare('UPDATE inventory SET quantity = ?, threshold = ?, supplier = ?, last_restocked = ?, image_url = ?, category = ?, unit_cost = ?, expiry_date = ?, storage_location = ?, delivery_date = ?, back_freezer_chiller = ?, refrigerator = ?, front_sandwich = ?, front_pizza = ?, front_burger = ? WHERE id = ?')
      .run(nextQuantity, threshold ?? existing.threshold, supplier || existing.supplier, today, imageUrl || existing.image_url, category || existing.category, Number(unitCost) || existing.unit_cost, expiryDate || existing.expiry_date, storageLocation || existing.storage_location, deliveryDate ?? existing.delivery_date, Number(backFreezerChiller) || 0, Number(refrigerator) || 0, Number(frontSandwich) || 0, Number(frontPizza) || 0, Number(frontBurger) || 0, existing.id);
    const item = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(existing.id));
    auditInventoryChange(item.id, 'updated', req.user, {
      quantity: { from: existing.quantity, to: item.quantity },
      reason: { from: null, to: 'Stock received (existing item)' },
    });
    broadcast('inventory:updated', { itemId: item.id, action: 'updated' });
    return res.status(200).json({ ...item, merged: true });
  }
  const result = db.prepare(
    'INSERT INTO inventory (name, quantity, unit, threshold, supplier, last_restocked, image_url, category, sku, unit_cost, expiry_date, storage_location, delivery_date, back_freezer_chiller, refrigerator, front_sandwich, front_pizza, front_burger) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(normalizedName, Number(quantity), normalizedUnit, threshold ?? 10, supplier || '', today, imageUrl || '', category || 'ingredients', sku || `INV-${Date.now().toString().slice(-6)}`, Number(unitCost) || 0, expiryDate || '', storageLocation || 'Main store', deliveryDate || '', Number(backFreezerChiller) || 0, Number(refrigerator) || 0, Number(frontSandwich) || 0, Number(frontPizza) || 0, Number(frontBurger) || 0);
  const item = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(result.lastInsertRowid));
  auditInventoryChange(item.id, 'created', req.user, { item: { from: null, to: item.name }, quantity: { from: null, to: item.quantity }, unit: { from: null, to: item.unit } });
  broadcast('inventory:updated', { itemId: item.id, action: 'created' });
  if (item.quantity <= item.threshold) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO notifications (type, title, message, read, created_at) VALUES (?, ?, ?, 0, ?)').run(
      'warning', 'Low Stock Alert', `${item.name} is below threshold (${item.quantity} ${item.unit})`, now
    );
    broadcast('notification:created', { type: 'warning', title: 'Low Stock Alert' });
  }
  res.status(201).json(item);
});

router.put('/:id', authMiddleware, (req, res) => {
  ensureInventoryColumn('delivery_date', "TEXT DEFAULT ''");
  ensureInventoryColumn('back_freezer_chiller', 'REAL DEFAULT 0');
  ensureInventoryColumn('refrigerator', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_sandwich', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_pizza', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_burger', 'REAL DEFAULT 0');
  const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const { name, quantity, unit, threshold, supplier, lastRestocked, imageUrl, category, sku, unitCost, expiryDate, storageLocation, deliveryDate, backFreezerChiller, refrigerator, frontSandwich, frontPizza, frontBurger } = req.body;
  db.prepare(
    'UPDATE inventory SET name = ?, quantity = ?, unit = ?, threshold = ?, supplier = ?, last_restocked = ?, image_url = ?, category = ?, sku = ?, unit_cost = ?, expiry_date = ?, storage_location = ?, delivery_date = ?, back_freezer_chiller = ?, refrigerator = ?, front_sandwich = ?, front_pizza = ?, front_burger = ? WHERE id = ?'
  ).run(
    name ?? existing.name,
    quantity ?? existing.quantity,
    unit ?? existing.unit,
    threshold ?? existing.threshold,
    supplier ?? existing.supplier,
    lastRestocked ?? existing.last_restocked,
    imageUrl ?? existing.image_url,
    category ?? existing.category,
    sku ?? existing.sku,
    unitCost ?? existing.unit_cost,
    expiryDate ?? existing.expiry_date,
    storageLocation ?? existing.storage_location,
    deliveryDate ?? existing.delivery_date,
    backFreezerChiller ?? existing.back_freezer_chiller,
    refrigerator ?? existing.refrigerator,
    frontSandwich ?? existing.front_sandwich,
    frontPizza ?? existing.front_pizza,
    frontBurger ?? existing.front_burger,
    req.params.id
  );
  const updated = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id));
  const fields = ['name', 'quantity', 'unit', 'threshold', 'supplier', 'lastRestocked', 'imageUrl', 'category', 'sku', 'unitCost', 'expiryDate', 'storageLocation'];
  const changes = Object.fromEntries(fields.filter((field) => String(existing[field === 'lastRestocked' ? 'last_restocked' : field === 'imageUrl' ? 'image_url' : field === 'unitCost' ? 'unit_cost' : field === 'expiryDate' ? 'expiry_date' : field === 'storageLocation' ? 'storage_location' : field]) !== String(updated[field])).map((field) => ({
    [field]: { from: existing[field === 'lastRestocked' ? 'last_restocked' : field === 'imageUrl' ? 'image_url' : field === 'unitCost' ? 'unit_cost' : field === 'expiryDate' ? 'expiry_date' : field === 'storageLocation' ? 'storage_location' : field], to: updated[field] }
  })));
  if (Object.keys(changes).length) auditInventoryChange(updated.id, 'updated', req.user, changes);
  if (Object.keys(changes).length) broadcast('inventory:updated', { itemId: updated.id, action: 'updated' });
  res.json(updated);
});

router.post('/:id/adjust', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
  const amount = Number(req.body.amount);
  const reason = String(req.body.reason || '').trim();
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'A non-zero adjustment is required' });
  if (!reason) return res.status(400).json({ error: 'Adjustment reason required' });
  const quantity = existing.quantity + amount;
  if (quantity < 0) return res.status(400).json({ error: 'Stock cannot be negative' });
  db.prepare('UPDATE inventory SET quantity = ? WHERE id = ?').run(quantity, req.params.id);
  auditInventoryChange(existing.id, 'updated', req.user, { quantity: { from: existing.quantity, to: quantity }, reason: { from: null, to: reason } });
  broadcast('inventory:updated', { itemId: existing.id, action: 'adjusted' });
  res.json(mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id)));
});

router.get('/:id/audit', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM inventory_audit WHERE inventory_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows.map((row) => ({ ...row, changes: JSON.parse(row.changes || '{}') })));
});

router.delete('/:id', authMiddleware, deletionViewer, requireAdilaDeletion, (req, res) => {
  const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  recordDeletion({ resourceType: 'inventory', resourceId: existing.id, snapshot: existing, reason: req.body?.reason, user: req.user });
  db.prepare('DELETE FROM inventory_audit WHERE inventory_id = ?').run(existing.id);
  db.prepare('DELETE FROM inventory WHERE id = ?').run(existing.id);
  broadcast('inventory:updated', { itemId: existing.id, action: 'deleted' });
  res.json({ ok: true, deleted: true, id: existing.id });
});

export default router;
