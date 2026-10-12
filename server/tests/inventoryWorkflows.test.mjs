import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('handover counts reconcile inventory and packaging is deducted only for takeout and delivery', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-inventory-workflows-'));
  const previousPath = process.env.DB_PATH;
  let setupDb;
  let db;
  let server;

  try {
    process.env.DB_PATH = path.join(directory, 'inventory-workflows.db');
    const database = await import(`../db/database.js?inventory-workflows=${Date.now()}`);
    setupDb = database.default;
    await database.ensureDatabase();
    db = (await import('../db/database.js')).default;
    const userId = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)').run('Inventory Manager', 'manager', 'test-pin').lastInsertRowid;
    const mozzarellaId = db.prepare('INSERT INTO inventory (name, quantity, unit, threshold, category) VALUES (?, ?, ?, ?, ?)').run('Test Mozzarella', 10, 'kg', 2, 'Stock items').lastInsertRowid;
    const flourId = db.prepare('INSERT INTO inventory (name, quantity, unit, threshold) VALUES (?, ?, ?, ?)').run('Test Flour', 20, 'kg', 2).lastInsertRowid;
    const boxId = db.prepare('INSERT INTO inventory (name, quantity, unit, threshold, category) VALUES (?, ?, ?, ?, ?)').run('Test Pizza Box', 10, 'pcs', 9, 'Test Packaging').lastInsertRowid;
    const menuItemId = db.prepare('INSERT INTO menu_items (name, description, price, category, active) VALUES (?, ?, ?, ?, 1)')
      .run('Packaging Test Pizza', '', 10000, 'pizza').lastInsertRowid;
    const ingredients = JSON.stringify([
      { name: 'Test Flour', inventoryId: flourId, quantity: 1, unit: 'kg' },
      { name: 'Test Pizza Box', inventoryId: boxId, quantity: 1, unit: 'pcs', takeoutOnly: true },
    ]);
    const { default: businessRouter } = await import(`../routes/business.js?inventory-workflows=${Date.now()}`);
    const { default: inventoryRouter } = await import(`../routes/inventory.js?inventory-workflows=${Date.now()}`);
    const { default: analyticsRouter } = await import(`../routes/analytics.js?inventory-workflows=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    const { applyOrderFulfillmentEffects } = await import(`../utils/orderFulfillment.js?inventory-workflows=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/business', businessRouter);
    app.use('/api/inventory', inventoryRouter);
    app.use('/api/analytics', analyticsRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const headers = {
      Authorization: `Bearer ${signToken({ id: userId, name: 'Inventory Manager', role: 'manager' })}`,
      'Content-Type': 'application/json',
    };

    const createdCategory = await fetch(`${base}/inventory/categories`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Test Packaging' }),
    });
    assert.equal(createdCategory.status, 201);
    const category = await createdCategory.json();
    const renamedCategory = await fetch(`${base}/inventory/categories/${category.id}`, {
      method: 'PUT', headers, body: JSON.stringify({ name: 'Takeout Packaging' }),
    });
    assert.equal(renamedCategory.status, 200);
    assert.equal(db.prepare('SELECT category FROM inventory WHERE id = ?').get(boxId).category, 'Takeout Packaging');
    const deletedCategory = await fetch(`${base}/inventory/categories/${category.id}`, { method: 'DELETE', headers });
    assert.equal(deletedCategory.status, 200);
    assert.equal(db.prepare('SELECT category FROM inventory WHERE id = ?').get(boxId).category, 'Stock items');

    const saveHandover = (inventoryCounts) => fetch(`${base}/business/shift-handover`, {
      method: 'PUT', headers,
      body: JSON.stringify({ date: '2026-10-10', shift: 'morning', reconciliation: {}, inventoryCounts }),
    });
    const saved = await saveHandover([{ item: 'Test Mozzarella', unit: 'kg', closing: 4 }]);
    assert.equal(saved.status, 200);
    const savedBody = await saved.json();
    assert.equal(savedBody.updatedInventoryItems, 1);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(mozzarellaId).quantity, 4);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inventory_audit WHERE inventory_id = ?').get(mozzarellaId).count, 1);

    const lowStockHandover = await saveHandover([{ item: 'Test Mozzarella', unit: 'kg', closing: 2 }]);
    assert.equal(lowStockHandover.status, 200);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(mozzarellaId).quantity, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE title = 'Low stock: Test Mozzarella'").get().count, 1);

    const failedHandover = await saveHandover([
      { item: 'Test Mozzarella', unit: 'kg', closing: 1 },
      { item: 'Missing Stock Item', unit: 'pcs', closing: 2 },
    ]);
    assert.equal(failedHandover.status, 400);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(mozzarellaId).quantity, 2);

    const addPaidOrder = (id, orderType) => {
      db.prepare(`INSERT INTO orders (id, order_type, subtotal, tax, total, payment_status, status, created_at, updated_at)
        VALUES (?, ?, 10000, 0, 10000, 'paid', 'confirmed', ?, ?)`)
        .run(id, orderType, new Date().toISOString(), new Date().toISOString());
      db.prepare(`INSERT INTO order_items (order_id, menu_item_id, name, qty, price, ingredients)
        VALUES (?, ?, ?, 1, 10000, ?)`)
        .run(id, menuItemId, 'Packaging Test Pizza', ingredients);
      applyOrderFulfillmentEffects(id);
    };

    addPaidOrder('TEST-DINE-IN', 'dine-in');
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(flourId).quantity, 19);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(boxId).quantity, 10);

    addPaidOrder('TEST-TAKEOUT', 'takeout');
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(flourId).quantity, 18);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(boxId).quantity, 9);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE title = 'Low stock: Test Pizza Box'").get().count, 1);

    addPaidOrder('TEST-DELIVERY', 'delivery');
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(boxId).quantity, 8);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE title = 'Low stock: Test Pizza Box'").get().count, 1);

    const reportDate = new Date().toISOString().slice(0, 10);
    const analyticsResponse = await fetch(`${base}/analytics/summary?date=${reportDate}`, { headers });
    assert.equal(analyticsResponse.status, 200);
    const analytics = await analyticsResponse.json();
    const usageByName = Object.fromEntries(analytics.operational.ingredientUsage.map((row) => [row.ingredient, row.quantity]));
    assert.equal(usageByName['Test Flour'], 3);
    assert.equal(usageByName['Test Pizza Box'], 2);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    db?.close();
    setupDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});