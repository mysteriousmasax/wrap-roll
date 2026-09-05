import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcast } from '../ws.js';

const router = Router();

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
  };
}

function auditInventoryChange(itemId, action, user, changes) {
  db.prepare(
    'INSERT INTO inventory_audit (inventory_id, action, changed_by_id, changed_by_name, changed_by_role, changes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(itemId, action, user?.id ?? null, user?.name || 'System', user?.role || 'system', JSON.stringify(changes), new Date().toISOString());
}

router.get('/', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM inventory ORDER BY name').all().map(mapInventory));
});

router.post('/', authMiddleware, (req, res) => {
  const { name, quantity, unit, threshold, supplier, imageUrl, category, sku, unitCost, expiryDate, storageLocation } = req.body;
  if (!name || quantity == null) return res.status(400).json({ error: 'Name and quantity required' });
  const today = new Date().toISOString().slice(0, 10);
  const normalizedName = String(name).trim();
  const normalizedUnit = String(unit || 'pcs').trim();
  const existing = db.prepare('SELECT * FROM inventory WHERE lower(trim(name)) = lower(?) AND lower(trim(unit)) = lower(?) ORDER BY id LIMIT 1').get(normalizedName, normalizedUnit);
  if (existing) {
    const received = Number(quantity);
    const nextQuantity = existing.quantity + received;
    db.prepare('UPDATE inventory SET quantity = ?, threshold = ?, supplier = ?, last_restocked = ?, image_url = ?, category = ?, unit_cost = ?, expiry_date = ?, storage_location = ? WHERE id = ?')
      .run(nextQuantity, threshold ?? existing.threshold, supplier || existing.supplier, today, imageUrl || existing.image_url, category || existing.category, Number(unitCost) || existing.unit_cost, expiryDate || existing.expiry_date, storageLocation || existing.storage_location, existing.id);
    const item = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(existing.id));
    auditInventoryChange(item.id, 'updated', req.user, {
      quantity: { from: existing.quantity, to: item.quantity },
      reason: { from: null, to: 'Stock received (existing item)' },
    });
    return res.status(200).json({ ...item, merged: true });
  }
  const result = db.prepare(
    'INSERT INTO inventory (name, quantity, unit, threshold, supplier, last_restocked, image_url, category, sku, unit_cost, expiry_date, storage_location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(normalizedName, Number(quantity), normalizedUnit, threshold ?? 10, supplier || '', today, imageUrl || '', category || 'ingredients', sku || `INV-${Date.now().toString().slice(-6)}`, Number(unitCost) || 0, expiryDate || '', storageLocation || 'Main store');
  const item = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(result.lastInsertRowid));
  auditInventoryChange(item.id, 'created', req.user, { item: { from: null, to: item.name }, quantity: { from: null, to: item.quantity }, unit: { from: null, to: item.unit } });
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
  const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const { name, quantity, unit, threshold, supplier, lastRestocked, imageUrl, category, sku, unitCost, expiryDate, storageLocation } = req.body;
  db.prepare(
    'UPDATE inventory SET name = ?, quantity = ?, unit = ?, threshold = ?, supplier = ?, last_restocked = ?, image_url = ?, category = ?, sku = ?, unit_cost = ?, expiry_date = ?, storage_location = ? WHERE id = ?'
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
    req.params.id
  );
  const updated = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id));
  const fields = ['name', 'quantity', 'unit', 'threshold', 'supplier', 'lastRestocked', 'imageUrl', 'category', 'sku', 'unitCost', 'expiryDate', 'storageLocation'];
  const changes = Object.fromEntries(fields.filter((field) => String(existing[field === 'lastRestocked' ? 'last_restocked' : field === 'imageUrl' ? 'image_url' : field === 'unitCost' ? 'unit_cost' : field === 'expiryDate' ? 'expiry_date' : field === 'storageLocation' ? 'storage_location' : field]) !== String(updated[field])).map((field) => ({
    [field]: { from: existing[field === 'lastRestocked' ? 'last_restocked' : field === 'imageUrl' ? 'image_url' : field === 'unitCost' ? 'unit_cost' : field === 'expiryDate' ? 'expiry_date' : field === 'storageLocation' ? 'storage_location' : field], to: updated[field] }
  })));
  if (Object.keys(changes).length) auditInventoryChange(updated.id, 'updated', req.user, changes);
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
  res.json(mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id)));
});

router.get('/:id/audit', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM inventory_audit WHERE inventory_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows.map((row) => ({ ...row, changes: JSON.parse(row.changes || '{}') })));
});

export default router;
