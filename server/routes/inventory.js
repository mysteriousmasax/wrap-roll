import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { deletionViewer, requireAdilaDeletion, recordDeletion } from '../utils/deletionPolicy.js';
import { normalizeTraReceiptUrl } from '../utils/traReceiptUrl.js';
import { getStockUnitConversionFactor } from '../../src/utils/stockUnits.js';
import { getStorageAfterConsumption } from '../utils/inventoryStorage.js';
import { recordInventoryStockAlerts } from '../utils/inventoryStockAlerts.js';

const router = Router();
const storageFields = [
  ['backFreezerChiller', 'back_freezer_chiller'],
  ['refrigerator', 'refrigerator'],
  ['frontSandwich', 'front_sandwich'],
  ['frontPizza', 'front_pizza'],
  ['frontBurger', 'front_burger'],
];

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
    purchaseUnit: row.purchase_unit || row.unit,
    purchaseUnitFactor: Number(row.purchase_unit_factor) > 0 ? Number(row.purchase_unit_factor) : 1,
    purchaseUnitCost: Number(row.purchase_unit_cost) || (Number(row.unit_cost || 0) * (Number(row.purchase_unit_factor) > 0 ? Number(row.purchase_unit_factor) : 1)),
    backFreezerChiller: row.back_freezer_chiller || 0,
    refrigerator: row.refrigerator || 0,
    frontSandwich: row.front_sandwich || 0,
    frontPizza: row.front_pizza || 0,
    frontBurger: row.front_burger || 0,
    total: storageFields.reduce((sum, [field, column]) => sum + Number(row[column] || 0), 0),
    unassigned: Math.max(0, Number(row.quantity || 0) - storageFields.reduce((sum, [field, column]) => sum + Number(row[column] || 0), 0)),
    storageOverAssigned: storageFields.reduce((sum, [field, column]) => sum + Number(row[column] || 0), 0) > Number(row.quantity || 0),
  };
}

function getStorageValues(body, existing = null) {
  const values = {};
  for (const [field, column] of storageFields) {
    const raw = body[field] ?? existing?.[column] ?? 0;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative number.`);
    values[column] = value;
  }
  return values;
}

function validateStorageTotal(quantity, values) {
  const assigned = Object.values(values).reduce((sum, value) => sum + value, 0);
  if (assigned > quantity + 1e-9) {
    throw new Error('Storage location counts cannot exceed total on-hand stock.');
  }
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
  const updateCategory = db.transaction(() => {
    db.prepare('UPDATE inventory_categories SET name = ? WHERE id = ?').run(name, req.params.id);
    db.prepare('UPDATE inventory SET category = ? WHERE lower(trim(category)) = lower(?)').run(name, existing.name);
  });
  updateCategory();
  const row = db.prepare('SELECT id, name FROM inventory_categories WHERE id = ?').get(req.params.id);
  broadcast('inventory:updated', { action: 'category_renamed', categoryId: Number(req.params.id) });
  res.json(row);
});

router.delete('/categories/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM inventory_categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Category not found' });
  const fallback = existing.name.toLowerCase() === 'stock items' ? 'Fresh ingredients' : 'Stock items';
  db.prepare('INSERT OR IGNORE INTO inventory_categories (name) VALUES (?)').run(fallback);
  const deleteCategory = db.transaction(() => {
    db.prepare('UPDATE inventory SET category = ? WHERE lower(trim(category)) = lower(?)').run(fallback, existing.name);
    db.prepare('DELETE FROM inventory_categories WHERE id = ?').run(existing.id);
  });
  deleteCategory();
  broadcast('inventory:updated', { action: 'category_deleted', categoryId: Number(existing.id) });
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

router.post('/receipt-qr', authMiddleware, async (req, res) => {
  let receiptUrl;
  try {
    receiptUrl = normalizeTraReceiptUrl(req.body?.url);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const response = await fetch(receiptUrl, {
      headers: { Accept: 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    if (response.status >= 300 && response.status < 400) return res.status(502).json({ error: 'TRA redirected this receipt link; open the receipt in TRA and try its current QR link.' });
    if (!response.ok) return res.status(502).json({ error: `TRA receipt verification returned HTTP ${response.status}.` });
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) {
      return res.status(502).json({ error: 'TRA did not return a readable receipt page.' });
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 1024 * 1024) return res.status(413).json({ error: 'The TRA receipt page is too large to process.' });
    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > 1024 * 1024) return res.status(413).json({ error: 'The TRA receipt page is too large to process.' });
    if (!/START OF LEGAL RECEIPT/i.test(html) || !/RECEIPT VERIFICATION CODE/i.test(html)) {
      return res.status(422).json({ error: 'That TRA page does not contain a verified EFD receipt.' });
    }
    res.set('Cache-Control', 'no-store');
    return res.json({ url: receiptUrl, html });
  } catch (error) {
    const message = error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'TRA receipt verification timed out. Try again or upload a receipt photo.'
      : 'Unable to fetch the TRA receipt. Check your connection or upload a receipt photo.';
    return res.status(502).json({ error: message });
  }
});

router.post('/receive-receipt', authMiddleware, (req, res) => {
  const { items, supplier = '', receiptRef = '', receiptDate = '' } = req.body || {};
  const expenseInput = req.body?.expense;
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) return res.status(400).json({ error: 'Add between 1 and 100 reviewed stock lines.' });
  const normalizedLines = items.map((line) => ({
    inventoryId: line.inventoryId ? Number(line.inventoryId) : null,
    name: String(line.name || '').trim(),
    sku: String(line.sku || '').trim(),
    unit: String(line.unit || 'pcs').trim(),
    quantity: Number(line.quantity),
    unitCost: Number(line.unitCost) || 0,
    threshold: Number(line.threshold) || 0,
  }));
  if (normalizedLines.some((line) => !line.name || !line.unit || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitCost) || line.unitCost < 0 || !Number.isFinite(line.threshold) || line.threshold < 0)) {
    return res.status(400).json({ error: 'Every stock line needs an item, unit, positive quantity, non-negative unit cost, and valid low-stock threshold.' });
  }
  if (expenseInput && (!String(expenseInput.category || '').trim() || !String(expenseInput.description || '').trim() || !Number.isFinite(Number(expenseInput.amount)) || Number(expenseInput.amount) <= 0)) {
    return res.status(400).json({ error: 'A category, description, and positive expense total are required to post both.' });
  }

  ensureInventoryColumn('delivery_date', "TEXT DEFAULT ''");
  ensureInventoryColumn('back_freezer_chiller', 'REAL DEFAULT 0');
  ensureInventoryColumn('refrigerator', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_sandwich', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_pizza', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_burger', 'REAL DEFAULT 0');
  ensureInventoryColumn('purchase_unit', "TEXT DEFAULT ''");
  ensureInventoryColumn('purchase_unit_factor', 'REAL DEFAULT 1');
  ensureInventoryColumn('purchase_unit_cost', 'REAL DEFAULT 0');
  const today = String(receiptDate || new Date().toISOString().slice(0, 10));
  const receiptDescription = `Receipt ${String(receiptRef || 'scanned').trim()} from ${String(supplier || 'supplier').trim()}`;
  const receivedItems = [];
  const stockNotifications = [];
  let createdExpense = null;

  try {
    const receive = db.transaction(() => {
      for (const line of normalizedLines) {
        const existing = line.inventoryId
          ? db.prepare('SELECT * FROM inventory WHERE id = ?').get(line.inventoryId)
          : line.sku
            ? db.prepare('SELECT * FROM inventory WHERE lower(trim(sku)) = lower(?) ORDER BY id LIMIT 1').get(line.sku)
            : db.prepare('SELECT * FROM inventory WHERE lower(trim(name)) = lower(?) AND lower(trim(unit)) = lower(?) ORDER BY id LIMIT 1').get(line.name, line.unit);
        if (line.inventoryId && !existing) throw new Error(`Inventory item ${line.inventoryId} was not found.`);

        if (existing) {
          const purchaseUnit = String(existing.purchase_unit || existing.unit || '').trim();
          const purchaseFactor = Number(existing.purchase_unit_factor) > 0 ? Number(existing.purchase_unit_factor) : 1;
          const conversionFactor = line.unit.toLowerCase() === purchaseUnit.toLowerCase()
            ? purchaseFactor
            : getStockUnitConversionFactor(line.unit, existing.unit);
          if (conversionFactor === null) {
            throw new Error(`${line.name} is stocked in ${existing.unit}; configure its purchase unit or receive it using a compatible unit.`);
          }
          const receivedQuantity = line.quantity * conversionFactor;
          const nextQuantity = Number(existing.quantity || 0) + receivedQuantity;
          const previousAverageCost = Number(existing.unit_cost || 0);
          const receivedUnitCost = line.unitCost / conversionFactor;
          const nextUnitCost = line.unitCost > 0 && nextQuantity > 0
            ? ((Number(existing.quantity || 0) * previousAverageCost) + (receivedQuantity * receivedUnitCost)) / nextQuantity
            : previousAverageCost;
          const nextPurchaseCost = line.unit.toLowerCase() === purchaseUnit.toLowerCase()
            ? line.unitCost
            : (nextUnitCost * purchaseFactor);
          db.prepare(`UPDATE inventory SET quantity = ?, supplier = ?, unit_cost = ?, purchase_unit_cost = ?, last_restocked = ?, delivery_date = ?
            WHERE id = ?`).run(nextQuantity, supplier || existing.supplier || '', nextUnitCost, nextPurchaseCost, today, today, existing.id);
          auditInventoryChange(existing.id, 'updated', req.user, {
            quantity: { from: existing.quantity, to: nextQuantity, received: receivedQuantity, receiptUnit: line.unit },
            supplier: { from: existing.supplier || '', to: supplier || existing.supplier || '' },
            unit_cost: { from: existing.unit_cost || 0, to: nextUnitCost },
            purchase_unit_cost: { from: existing.purchase_unit_cost || 0, to: nextPurchaseCost },
            receipt: { from: null, to: receiptDescription },
          });
          db.prepare(`INSERT INTO inventory_purchase_history
            (inventory_id, item_name, item_sku, supplier, receipt_ref, purchase_date, purchase_quantity,
             purchase_unit, unit_cost_purchase, quantity_base, base_unit, unit_cost_base, total_cost,
             previous_average_cost, new_average_cost, received_by_id, received_by_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            existing.id,
            existing.name,
            existing.sku || null,
            supplier || existing.supplier || null,
            String(receiptRef || '').trim() || null,
            today,
            line.quantity,
            line.unit,
            line.unitCost,
            receivedQuantity,
            existing.unit,
            receivedUnitCost,
            line.quantity * line.unitCost,
            previousAverageCost,
            nextUnitCost,
            req.user?.id ?? null,
            req.user?.name || 'System',
            new Date().toISOString()
          );
          const receivedItem = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(existing.id));
          stockNotifications.push(...recordInventoryStockAlerts(existing, receivedItem, 'after receiving stock'));
          receivedItems.push(receivedItem);
        } else {
          const result = db.prepare(`INSERT INTO inventory
            (name, quantity, unit, threshold, supplier, last_restocked, category, sku, unit_cost, storage_location, delivery_date, purchase_unit, purchase_unit_factor, purchase_unit_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`).run(
            line.name, line.quantity, line.unit, line.threshold, supplier || '', today, 'Stock items',
            line.sku || `INV-${Date.now().toString().slice(-6)}`, line.unitCost, 'Stock sheet', today, line.unit, line.unitCost
          );
          auditInventoryChange(result.lastInsertRowid, 'created', req.user, {
            item: { from: null, to: line.name },
            quantity: { from: null, to: line.quantity },
            supplier: { from: null, to: supplier || '' },
            unit_cost: { from: null, to: line.unitCost },
            threshold: { from: null, to: line.threshold },
            receipt: { from: null, to: receiptDescription },
          });
          db.prepare(`INSERT INTO inventory_purchase_history
            (inventory_id, item_name, item_sku, supplier, receipt_ref, purchase_date, purchase_quantity,
             purchase_unit, unit_cost_purchase, quantity_base, base_unit, unit_cost_base, total_cost,
             previous_average_cost, new_average_cost, received_by_id, received_by_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            result.lastInsertRowid,
            line.name,
            line.sku || null,
            supplier || null,
            String(receiptRef || '').trim() || null,
            today,
            line.quantity,
            line.unit,
            line.unitCost,
            line.quantity,
            line.unit,
            line.unitCost,
            line.quantity * line.unitCost,
            0,
            line.unitCost,
            req.user?.id ?? null,
            req.user?.name || 'System',
            new Date().toISOString()
          );
          const receivedItem = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(result.lastInsertRowid));
          stockNotifications.push(...recordInventoryStockAlerts(null, receivedItem, 'when stock was received'));
          receivedItems.push(receivedItem);
        }
      }
      if (expenseInput) {
        const expenseResult = db.prepare(`INSERT INTO business_expenses
          (expense_date, category, description, supplier, amount, payment_method, status, receipt_ref, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(
          today,
          String(expenseInput.category).trim(),
          String(expenseInput.description).trim(),
          supplier || null,
          Number(expenseInput.amount),
          expenseInput.paymentMethod || 'cash',
          receiptRef || null,
          req.user?.name || 'Admin',
          new Date().toISOString()
        );
        createdExpense = db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(expenseResult.lastInsertRowid);
      }
    });
    receive();
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Receipt stock could not be applied.' });
  }

  broadcast('inventory:updated', { action: 'receipt_received', items: receivedItems.map((item) => item.id), receiptRef });
  stockNotifications.forEach((notification) => broadcast('notification:created', notification));
  if (createdExpense) broadcast('business:updated', { type: 'expense_created' });
  res.status(201).json({ receiptRef, received: receivedItems, expense: createdExpense });
});

router.post('/', authMiddleware, (req, res) => {
  ensureInventoryColumn('delivery_date', "TEXT DEFAULT ''");
  ensureInventoryColumn('back_freezer_chiller', 'REAL DEFAULT 0');
  ensureInventoryColumn('refrigerator', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_sandwich', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_pizza', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_burger', 'REAL DEFAULT 0');
  ensureInventoryColumn('purchase_unit', "TEXT DEFAULT ''");
  ensureInventoryColumn('purchase_unit_factor', 'REAL DEFAULT 1');
  ensureInventoryColumn('purchase_unit_cost', 'REAL DEFAULT 0');
  const { name, quantity, unit, threshold, supplier, imageUrl, category, sku, unitCost, purchaseUnit, purchaseUnitFactor, purchaseUnitCost, expiryDate, storageLocation, deliveryDate } = req.body;
  if (!name || quantity == null) return res.status(400).json({ error: 'Name and quantity required' });
  const baseQuantity = Number(quantity);
  if (!Number.isFinite(baseQuantity) || baseQuantity < 0) return res.status(400).json({ error: 'Stock quantity must be a non-negative number.' });
  const today = new Date().toISOString().slice(0, 10);
  const normalizedName = String(name).trim();
  const normalizedUnit = String(unit || 'pcs').trim();
  const normalizedPurchaseUnit = String(purchaseUnit || normalizedUnit).trim();
  const purchaseFactor = Number(purchaseUnitFactor ?? 1);
  const packCost = Number(purchaseUnitCost ?? 0);
  if (!normalizedUnit || !normalizedPurchaseUnit || !Number.isFinite(purchaseFactor) || purchaseFactor <= 0 || !Number.isFinite(packCost) || packCost < 0) {
    return res.status(400).json({ error: 'Choose a base unit, purchase unit, positive pack conversion, and non-negative pack cost.' });
  }
  const baseUnitCost = packCost > 0 ? packCost / purchaseFactor : Number(unitCost || 0);
  if (!Number.isFinite(baseUnitCost) || baseUnitCost < 0) return res.status(400).json({ error: 'Unit cost must be a non-negative number.' });
  const existing = db.prepare('SELECT * FROM inventory WHERE lower(trim(name)) = lower(?) AND lower(trim(unit)) = lower(?) ORDER BY id LIMIT 1').get(normalizedName, normalizedUnit);
  let item;
  try {
    if (existing) {
      const nextQuantity = Number(existing.quantity || 0) + baseQuantity;
      const storage = getStorageValues({}, existing);
      validateStorageTotal(nextQuantity, storage);
      const nextUnitCost = nextQuantity > 0
        ? ((Number(existing.quantity || 0) * Number(existing.unit_cost || 0)) + (baseQuantity * baseUnitCost)) / nextQuantity
        : baseUnitCost;
      db.prepare(`UPDATE inventory SET quantity = ?, threshold = ?, supplier = ?, last_restocked = ?, image_url = ?, category = ?, unit_cost = ?, purchase_unit = ?, purchase_unit_factor = ?, purchase_unit_cost = ?, expiry_date = ?, storage_location = ?, delivery_date = ?, back_freezer_chiller = ?, refrigerator = ?, front_sandwich = ?, front_pizza = ?, front_burger = ? WHERE id = ?`)
        .run(nextQuantity, threshold ?? existing.threshold, supplier || existing.supplier, today, imageUrl || existing.image_url, category || existing.category, nextUnitCost, normalizedPurchaseUnit, purchaseFactor, packCost || baseUnitCost * purchaseFactor, expiryDate || existing.expiry_date, storageLocation || existing.storage_location, deliveryDate ?? existing.delivery_date, storage.back_freezer_chiller, storage.refrigerator, storage.front_sandwich, storage.front_pizza, storage.front_burger, existing.id);
      item = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(existing.id));
      db.prepare(`INSERT INTO inventory_purchase_history
        (inventory_id, item_name, item_sku, supplier, purchase_date, purchase_quantity, purchase_unit,
         unit_cost_purchase, quantity_base, base_unit, unit_cost_base, total_cost, previous_average_cost,
         new_average_cost, source, received_by_id, received_by_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inventory_entry', ?, ?, ?)`).run(
        existing.id, existing.name, existing.sku || null, supplier || existing.supplier || null, today,
        baseQuantity / purchaseFactor, normalizedPurchaseUnit, packCost, baseQuantity, normalizedUnit,
        baseUnitCost, baseQuantity * baseUnitCost, Number(existing.unit_cost || 0), nextUnitCost,
        req.user?.id ?? null, req.user?.name || 'System', new Date().toISOString()
      );
      auditInventoryChange(item.id, 'updated', req.user, {
        quantity: { from: existing.quantity, to: item.quantity },
        unit_cost: { from: existing.unit_cost || 0, to: item.unitCost },
        reason: { from: null, to: 'Stock received (existing item)' },
      });
      recordInventoryStockAlerts(existing, item, 'after stock was received')
        .forEach((notification) => broadcast('notification:created', notification));
      broadcast('inventory:updated', { itemId: item.id, action: 'updated' });
      return res.status(200).json({ ...item, merged: true });
    }
    const storage = getStorageValues(req.body);
    validateStorageTotal(baseQuantity, storage);
    const result = db.prepare(
      'INSERT INTO inventory (name, quantity, unit, threshold, supplier, last_restocked, image_url, category, sku, unit_cost, expiry_date, storage_location, delivery_date, back_freezer_chiller, refrigerator, front_sandwich, front_pizza, front_burger, purchase_unit, purchase_unit_factor, purchase_unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(normalizedName, baseQuantity, normalizedUnit, threshold ?? 10, supplier || '', today, imageUrl || '', category || 'ingredients', sku || `INV-${Date.now().toString().slice(-6)}`, baseUnitCost, expiryDate || '', storageLocation || 'Main store', deliveryDate || '', storage.back_freezer_chiller, storage.refrigerator, storage.front_sandwich, storage.front_pizza, storage.front_burger, normalizedPurchaseUnit, purchaseFactor, purchaseFactor * baseUnitCost);
    item = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(result.lastInsertRowid));
    if (baseQuantity > 0) {
      db.prepare(`INSERT INTO inventory_purchase_history
        (inventory_id, item_name, item_sku, supplier, purchase_date, purchase_quantity, purchase_unit,
         unit_cost_purchase, quantity_base, base_unit, unit_cost_base, total_cost, previous_average_cost,
         new_average_cost, source, received_by_id, received_by_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'opening_stock', ?, ?, ?)`).run(
        item.id, item.name, item.sku || null, supplier || null, today, baseQuantity / purchaseFactor,
        normalizedPurchaseUnit, packCost || baseUnitCost * purchaseFactor, baseQuantity, normalizedUnit,
        baseUnitCost, baseQuantity * baseUnitCost, baseUnitCost, req.user?.id ?? null,
        req.user?.name || 'System', new Date().toISOString()
      );
    }
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Inventory item could not be saved.' });
  }
  auditInventoryChange(item.id, 'created', req.user, { item: { from: null, to: item.name }, quantity: { from: null, to: item.quantity }, unit: { from: null, to: item.unit } });
  broadcast('inventory:updated', { itemId: item.id, action: 'created' });
  recordInventoryStockAlerts(null, item, 'when stock was added')
    .forEach((notification) => broadcast('notification:created', notification));
  res.status(201).json(item);
});

router.put('/:id', authMiddleware, (req, res) => {
  ensureInventoryColumn('delivery_date', "TEXT DEFAULT ''");
  ensureInventoryColumn('back_freezer_chiller', 'REAL DEFAULT 0');
  ensureInventoryColumn('refrigerator', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_sandwich', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_pizza', 'REAL DEFAULT 0');
  ensureInventoryColumn('front_burger', 'REAL DEFAULT 0');
  ensureInventoryColumn('purchase_unit', "TEXT DEFAULT ''");
  ensureInventoryColumn('purchase_unit_factor', 'REAL DEFAULT 1');
  ensureInventoryColumn('purchase_unit_cost', 'REAL DEFAULT 0');
  const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const { name, quantity, unit, threshold, supplier, lastRestocked, imageUrl, category, sku, purchaseUnit, purchaseUnitFactor, expiryDate, storageLocation, deliveryDate } = req.body;
  const nextQuantity = Number(quantity ?? existing.quantity);
  const nextUnit = String(unit ?? existing.unit ?? 'pcs').trim();
  const unitChanged = nextUnit.toLowerCase() !== String(existing.unit || '').toLowerCase();
  if (!Number.isFinite(nextQuantity) || nextQuantity < 0) return res.status(400).json({ error: 'Stock quantity must be a non-negative number.' });
  if (unitChanged && Number(existing.quantity) > 0) {
    return res.status(400).json({ error: 'Cannot change the stock unit while quantity is on hand. Adjust stock to zero first.' });
  }
  const baseUnitConversion = unitChanged ? getStockUnitConversionFactor(existing.unit, nextUnit) : 1;
  if (baseUnitConversion === null) return res.status(400).json({ error: `Cannot convert ${existing.unit} to ${nextUnit}; use compatible units.` });
  const nextPurchaseUnit = String(purchaseUnit ?? existing.purchase_unit ?? nextUnit).trim() || nextUnit;
  const nextPurchaseFactor = Number(purchaseUnitFactor ?? (Number(existing.purchase_unit_factor || 1) * baseUnitConversion));
  const nextPackCost = Number(existing.purchase_unit_cost || 0);
  if (!Number.isFinite(nextPurchaseFactor) || nextPurchaseFactor <= 0 || !Number.isFinite(nextPackCost) || nextPackCost < 0) {
    return res.status(400).json({ error: 'Purchase-unit conversion must be positive and purchase cost cannot be negative.' });
  }
  const nextUnitCost = Number(existing.unit_cost || 0) / baseUnitConversion;
  if (!Number.isFinite(nextUnitCost) || nextUnitCost < 0) return res.status(400).json({ error: 'Unit cost must be a non-negative number.' });
  let storage;
  try {
    storage = getStorageValues(req.body, existing);
    const stockChanged = nextQuantity !== Number(existing.quantity)
      || storageFields.some(([, column]) => Number(storage[column]) !== Number(existing[column] || 0));
    if (stockChanged) validateStorageTotal(nextQuantity, storage);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  db.prepare(
    'UPDATE inventory SET name = ?, quantity = ?, unit = ?, threshold = ?, supplier = ?, last_restocked = ?, image_url = ?, category = ?, sku = ?, unit_cost = ?, purchase_unit = ?, purchase_unit_factor = ?, purchase_unit_cost = ?, expiry_date = ?, storage_location = ?, delivery_date = ?, back_freezer_chiller = ?, refrigerator = ?, front_sandwich = ?, front_pizza = ?, front_burger = ? WHERE id = ?'
  ).run(
    name ?? existing.name, nextQuantity, nextUnit, threshold ?? existing.threshold, supplier ?? existing.supplier,
    lastRestocked ?? existing.last_restocked, imageUrl ?? existing.image_url, category ?? existing.category,
    sku ?? existing.sku, nextUnitCost, nextPurchaseUnit, nextPurchaseFactor, nextPackCost,
    expiryDate ?? existing.expiry_date, storageLocation ?? existing.storage_location, deliveryDate ?? existing.delivery_date,
    storage.back_freezer_chiller, storage.refrigerator, storage.front_sandwich, storage.front_pizza, storage.front_burger,
    req.params.id
  );
  const updated = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id));
  const fields = ['name', 'quantity', 'unit', 'threshold', 'supplier', 'lastRestocked', 'imageUrl', 'category', 'sku', 'unitCost', 'purchaseUnit', 'purchaseUnitFactor', 'purchaseUnitCost', 'expiryDate', 'storageLocation', ...storageFields.map(([field]) => field)];
  const columnForField = {
    lastRestocked: 'last_restocked',
    imageUrl: 'image_url',
    unitCost: 'unit_cost',
    purchaseUnit: 'purchase_unit',
    purchaseUnitFactor: 'purchase_unit_factor',
    purchaseUnitCost: 'purchase_unit_cost',
    expiryDate: 'expiry_date',
    storageLocation: 'storage_location',
    ...Object.fromEntries(storageFields),
  };
  const changes = Object.fromEntries(fields
    .filter((field) => String(existing[columnForField[field] || field]) !== String(updated[field]))
    .map((field) => [field, { from: existing[columnForField[field] || field], to: updated[field] }]));
  if (Object.keys(changes).length) auditInventoryChange(updated.id, 'updated', req.user, changes);
  recordInventoryStockAlerts(existing, updated, 'after an inventory update')
    .forEach((notification) => broadcast('notification:created', notification));
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
  const storage = getStorageAfterConsumption(existing, Math.max(0, -amount), quantity);
  db.prepare('UPDATE inventory SET quantity = ?, back_freezer_chiller = ?, refrigerator = ?, front_sandwich = ?, front_pizza = ?, front_burger = ? WHERE id = ?')
    .run(quantity, storage.back_freezer_chiller, storage.refrigerator, storage.front_sandwich, storage.front_pizza, storage.front_burger, req.params.id);
  auditInventoryChange(existing.id, 'updated', req.user, { quantity: { from: existing.quantity, to: quantity }, storage, reason: { from: null, to: reason } });
  recordInventoryStockAlerts(existing, { ...existing, quantity }, reason)
    .forEach((notification) => broadcast('notification:created', notification));
  broadcast('inventory:updated', { itemId: existing.id, action: 'adjusted' });
  res.json(mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id)));
});

router.get('/:id/audit', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM inventory_audit WHERE inventory_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows.map((row) => ({ ...row, changes: JSON.parse(row.changes || '{}') })));
});

router.get('/:id/purchase-history', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT id, item_name AS itemName, item_sku AS itemSku, supplier, receipt_ref AS receiptRef,
                                  purchase_date AS purchaseDate, purchase_quantity AS purchaseQuantity,
                                  purchase_unit AS purchaseUnit, unit_cost_purchase AS purchaseUnitCost,
                                  quantity_base AS baseQuantity, base_unit AS baseUnit, unit_cost_base AS baseUnitCost,
                                  total_cost AS totalCost, previous_average_cost AS previousAverageCost,
                                  new_average_cost AS newAverageCost, received_by_name AS receivedByName,
                                  created_at AS createdAt, source
                           FROM inventory_purchase_history
                           WHERE inventory_id = ?
                           ORDER BY purchase_date DESC, id DESC
                           LIMIT 200`).all(req.params.id);
  res.json(rows);
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
