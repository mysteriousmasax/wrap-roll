import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('handover counts update live stock immediately, confirm with a second staff count, and deduct packaging only for takeout and delivery', async () => {
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
    const confirmingUserId = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)').run('Inventory Staff', 'foh', 'test-pin').lastInsertRowid;
    const kitchenUserId = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)').run('Kitchen Staff', 'kitchen', 'test-pin').lastInsertRowid;
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
    const { default: notificationsRouter } = await import(`../routes/notifications.js?inventory-workflows=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    const { applyOrderFulfillmentEffects } = await import(`../utils/orderFulfillment.js?inventory-workflows=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/business', businessRouter);
    app.use('/api/inventory', inventoryRouter);
    app.use('/api/analytics', analyticsRouter);
    app.use('/api/notifications', notificationsRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const headers = {
      Authorization: `Bearer ${signToken({ id: userId, name: 'Inventory Manager', role: 'manager' })}`,
      'Content-Type': 'application/json',
    };
    const confirmingHeaders = {
      Authorization: `Bearer ${signToken({ id: confirmingUserId, name: 'Inventory Staff', role: 'foh' })}`,
      'Content-Type': 'application/json',
    };
    const kitchenHeaders = {
      Authorization: `Bearer ${signToken({ id: kitchenUserId, name: 'Kitchen Staff', role: 'kitchen' })}`,
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

    const saveHandover = (inventoryCounts, requestHeaders = headers) => fetch(`${base}/business/shift-handover`, {
      method: 'PUT', headers: requestHeaders,
      body: JSON.stringify({ date: '2026-10-10', shift: 'morning', reconciliation: {}, inventoryCounts }),
    });
    const saved = await saveHandover([{ item: 'Test Mozzarella', unit: 'kg', closing: 4 }]);
    assert.equal(saved.status, 200);
    const savedBody = await saved.json();
    assert.equal(savedBody.updatedInventoryItems, 1);
    assert.equal(savedBody.inventoryCounts[0].confirmationStatus, 'pending-confirmation');
    assert.equal(savedBody.inventoryCounts[0].closing, 4);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(mozzarellaId).quantity, 4);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inventory_audit WHERE inventory_id = ?').get(mozzarellaId).count, 1);

    const mismatched = await saveHandover([{ item: 'Test Mozzarella', unit: 'kg', closing: 3 }], confirmingHeaders);
    assert.equal(mismatched.status, 200);
    const mismatchedBody = await mismatched.json();
    assert.equal(mismatchedBody.inventoryCounts[0].confirmationStatus, 'mismatch');
    assert.equal(mismatchedBody.inventoryCounts[0].closing, 4, 'the saved inventory total remains the first staff count while the discrepancy is reviewed');
    assert.equal(mismatchedBody.inventoryCounts[0].currentStaffCount.closing, 3, 'the second staff member retains their independent count');
    assert.equal(mismatchedBody.updatedInventoryItems, 0);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(mozzarellaId).quantity, 4);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inventory_audit WHERE inventory_id = ?').get(mozzarellaId).count, 2);

    const confirmed = await saveHandover([{ item: 'Test Mozzarella', unit: 'kg', closing: 4 }], confirmingHeaders);
    const confirmedBody = await confirmed.json();
    assert.equal(confirmedBody.inventoryCounts[0].confirmationStatus, 'confirmed');
    assert.equal(confirmedBody.updatedInventoryItems, 0);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(mozzarellaId).quantity, 4);
    const firstCountAudit = JSON.parse(db.prepare('SELECT changes FROM inventory_audit WHERE inventory_id = ? ORDER BY id LIMIT 1').get(mozzarellaId).changes);
    assert.match(firstCountAudit.shiftCount.to, /2026-10-10 morning:.*closing 4 kg.*pending-confirmation/);

    const lowStockHandover = await saveHandover([{ item: 'Test Mozzarella', unit: 'kg', closing: 2 }]);
    assert.equal(lowStockHandover.status, 200);
    assert.equal((await lowStockHandover.json()).inventoryCounts[0].confirmationStatus, 'mismatch');
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(mozzarellaId).quantity, 4);
    const lowStockConfirmation = await saveHandover([{ item: 'Test Mozzarella', unit: 'kg', closing: 2 }], confirmingHeaders);
    assert.equal(lowStockConfirmation.status, 200);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(mozzarellaId).quantity, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE title = 'Low stock: Test Mozzarella'").get().count, 1);
    assert.equal(db.prepare("SELECT audience_role FROM notifications WHERE title = 'Low stock: Test Mozzarella'").get().audience_role, null);
    const kitchenNotificationsResponse = await fetch(`${base}/notifications`, { headers: kitchenHeaders });
    assert.equal(kitchenNotificationsResponse.status, 200);
    assert.ok((await kitchenNotificationsResponse.json()).some((notification) => notification.title === 'Low stock: Test Mozzarella'));

    const pizzaPrepId = db.prepare('INSERT INTO inventory (name, quantity, unit, threshold) VALUES (?, ?, ?, ?)').run('Test Pizza Prep', 1, 'portion', 0).lastInsertRowid;
    const countPizzaPrep = (requestHeaders) => saveHandover([
      { item: 'Test Mozzarella', unit: 'kg', closing: 2 },
      { inventoryId: pizzaPrepId, item: 'Test Pizza Prep', unit: 'portion', closing: 0 },
    ], requestHeaders);
    const firstPizzaPrepCount = await countPizzaPrep(headers);
    assert.equal(firstPizzaPrepCount.status, 200);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(pizzaPrepId).quantity, 0);
    const secondPizzaPrepCount = await countPizzaPrep(confirmingHeaders);
    assert.equal(secondPizzaPrepCount.status, 200);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(pizzaPrepId).quantity, 0);
    assert.equal(db.prepare("SELECT audience_role FROM notifications WHERE title = 'Out of stock: Test Pizza Prep'").get().audience_role, null);

    const selectedInventoryItem = await saveHandover([
      { item: 'Test Mozzarella', unit: 'kg', closing: 2 },
      { inventoryId: flourId, item: 'Test Flour', unit: 'kg', opening: '', added: '', closing: '' },
      { inventoryId: pizzaPrepId, item: 'Test Pizza Prep', unit: 'portion', closing: 0 },
    ], confirmingHeaders);
    assert.equal(selectedInventoryItem.status, 200);
    assert.ok((await selectedInventoryItem.json()).inventoryCounts.some((row) => row.inventoryId === flourId));

    const failedHandover = await saveHandover([
      { item: 'Test Mozzarella', unit: 'kg', closing: 1 },
      { inventoryId: pizzaPrepId, item: 'Test Pizza Prep', unit: 'portion', closing: 0 },
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
    assert.equal(db.prepare("SELECT audience_role FROM notifications WHERE title = 'Low stock: Test Pizza Box'").get().audience_role, null);

    addPaidOrder('TEST-DELIVERY', 'delivery');
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(boxId).quantity, 8);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE title = 'Low stock: Test Pizza Box'").get().count, 1);

    const flour = await (await fetch(`${base}/inventory`, { headers })).json();
    const flourItem = flour.find((item) => item.id === flourId);
    const stockUpdate = await fetch(`${base}/inventory/${flourId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ...flourItem, quantity: 2 }),
    });
    assert.equal(stockUpdate.status, 200);
    assert.equal(db.prepare("SELECT audience_role FROM notifications WHERE title = 'Low stock: Test Flour'").get().audience_role, null);

    const reportDate = new Date().toISOString().slice(0, 10);
    const analyticsResponse = await fetch(`${base}/analytics/summary?date=${reportDate}`, { headers });
    assert.equal(analyticsResponse.status, 200);
    const analytics = await analyticsResponse.json();
    const usageByName = Object.fromEntries(analytics.operational.ingredientUsage.map((row) => [row.ingredient, row.quantity]));
    assert.equal(usageByName['Test Flour'], 3);
    assert.equal(usageByName['Test Pizza Box'], 2);

    const coffeeCreated = await fetch(`${base}/inventory`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Test Coffee Beans',
        quantity: 0,
        unit: 'g',
        threshold: 100,
        unitCost: 0,
        purchaseUnit: 'bag',
        purchaseUnitFactor: 1000,
        purchaseUnitCost: 12000,
      }),
    });
    assert.equal(coffeeCreated.status, 201);
    const coffee = await coffeeCreated.json();
    assert.equal(coffee.unitCost, 12);
    const coffeeReceipt = await fetch(`${base}/inventory/receive-receipt`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        receiptDate: '2026-10-10',
        items: [{ inventoryId: coffee.id, name: coffee.name, quantity: 1, unit: 'bag', unitCost: 12000 }],
      }),
    });
    assert.equal(coffeeReceipt.status, 201);
    const receivedCoffee = (await coffeeReceipt.json()).received[0];
    assert.equal(receivedCoffee.quantity, 1000);
    assert.equal(receivedCoffee.unitCost, 12);
    assert.equal(receivedCoffee.unassigned, 1000);

    const assignedCoffee = await fetch(`${base}/inventory/${coffee.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ backFreezerChiller: 500, refrigerator: 300 }),
    });
    assert.equal(assignedCoffee.status, 200);
    const assignedCoffeeBody = await assignedCoffee.json();
    assert.equal(assignedCoffeeBody.total, 800);
    assert.equal(assignedCoffeeBody.unassigned, 200);
    const invalidStorageCounts = await fetch(`${base}/inventory/${coffee.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ backFreezerChiller: 900, refrigerator: 300 }),
    });
    assert.equal(invalidStorageCounts.status, 400);

    db.prepare('UPDATE inventory SET back_freezer_chiller = 900, refrigerator = 300 WHERE id = ?').run(coffee.id);
    const metadataEditWithExistingOverage = await fetch(`${base}/inventory/${coffee.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ supplier: 'Updated supplier' }),
    });
    assert.equal(metadataEditWithExistingOverage.status, 200, 'existing storage inconsistencies do not block unrelated inventory edits');
    const metadataEditBody = await metadataEditWithExistingOverage.json();
    assert.equal(metadataEditBody.supplier, 'Updated supplier');
    assert.equal(metadataEditBody.total, 1200, 'unrelated edits preserve the existing location counts for later correction');
    const correctStorageCounts = await fetch(`${base}/inventory/${coffee.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ backFreezerChiller: 500, refrigerator: 300 }),
    });
    assert.equal(correctStorageCounts.status, 200, 'stock location edits can correct the overage');

    const coffeeMenuItemId = db.prepare('INSERT INTO menu_items (name, description, price, category, active) VALUES (?, ?, ?, ?, 1)')
      .run('Test Coffee Drink', '', 5000, 'drinks').lastInsertRowid;
    db.prepare(`INSERT INTO orders (id, order_type, subtotal, tax, total, payment_status, status, created_at, updated_at)
      VALUES ('TEST-COFFEE-USAGE', 'dine-in', 5000, 0, 5000, 'paid', 'confirmed', ?, ?)`)
      .run(new Date().toISOString(), new Date().toISOString());
    db.prepare(`INSERT INTO order_items (order_id, menu_item_id, name, qty, price, ingredients)
      VALUES ('TEST-COFFEE-USAGE', ?, 'Test Coffee Drink', 1, 5000, ?)`)
      .run(coffeeMenuItemId, JSON.stringify([{ name: coffee.name, inventoryId: coffee.id, quantity: 18, unit: 'g' }]));
    applyOrderFulfillmentEffects('TEST-COFFEE-USAGE');
    const coffeeAfterSale = db.prepare('SELECT quantity, back_freezer_chiller, refrigerator, unit_cost FROM inventory WHERE id = ?').get(coffee.id);
    assert.equal(coffeeAfterSale.quantity, 982);
    assert.equal(coffeeAfterSale.back_freezer_chiller + coffeeAfterSale.refrigerator, 782);
    assert.equal(coffeeAfterSale.unit_cost, 12);

    const sodaCreated = await fetch(`${base}/inventory`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Test Soda 300ml',
        quantity: 5,
        unit: 'bottle',
        threshold: 1,
        purchaseUnit: 'bottle',
        purchaseUnitFactor: 1,
        purchaseUnitCost: 500,
      }),
    });
    assert.equal(sodaCreated.status, 201);
    const soda = await sodaCreated.json();
    const sodaMenuItemId = db.prepare('INSERT INTO menu_items (name, description, price, category, active) VALUES (?, ?, ?, ?, 1)')
      .run('Test Soda Meal', '', 3000, 'drinks').lastInsertRowid;
    db.prepare(`INSERT INTO orders (id, order_type, subtotal, tax, total, payment_status, status, created_at, updated_at)
      VALUES ('TEST-SODA-USAGE', 'dine-in', 3000, 0, 3000, 'paid', 'confirmed', ?, ?)`)
      .run(new Date().toISOString(), new Date().toISOString());
    db.prepare(`INSERT INTO order_items (order_id, menu_item_id, name, qty, price, ingredients)
      VALUES ('TEST-SODA-USAGE', ?, 'Test Soda Meal', 1, 3000, ?)`)
      .run(sodaMenuItemId, JSON.stringify([{ name: soda.name, inventoryId: soda.id, quantity: 1, unit: 'bottle' }]));
    applyOrderFulfillmentEffects('TEST-SODA-USAGE');
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(soda.id).quantity, 4);

    const breadId = db.prepare('INSERT INTO inventory (name, quantity, unit, threshold) VALUES (?, ?, ?, ?)')
      .run('Test White Bread', 12, 'loaves', 2).lastInsertRowid;
    const breadMenuItemId = db.prepare('INSERT INTO menu_items (name, description, price, category, active) VALUES (?, ?, ?, ?, 1)')
      .run('Test Bread Recipe', '', 2500, 'sandwich').lastInsertRowid;
    db.prepare(`INSERT INTO orders (id, order_type, subtotal, tax, total, payment_status, status, created_at, updated_at)
      VALUES ('TEST-MISMATCHED-RECIPE-UNIT', 'dine-in', 2500, 0, 2500, 'paid', 'confirmed', ?, ?)`)
      .run(new Date().toISOString(), new Date().toISOString());
    db.prepare(`INSERT INTO order_items (order_id, menu_item_id, name, qty, price, ingredients)
      VALUES ('TEST-MISMATCHED-RECIPE-UNIT', ?, 'Test Bread Recipe', 1, 2500, ?)`)
      .run(breadMenuItemId, JSON.stringify([{ name: 'Test White Bread', inventoryId: breadId, quantity: 0.2, unit: 'kg' }]));
    assert.doesNotThrow(() => applyOrderFulfillmentEffects('TEST-MISMATCHED-RECIPE-UNIT'));
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(breadId).quantity, 12);
    assert.ok(db.prepare("SELECT fulfillment_effects_applied_at FROM orders WHERE id = 'TEST-MISMATCHED-RECIPE-UNIT'").get().fulfillment_effects_applied_at);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE title = 'Recipe unit mismatch: Test White Bread' AND read = 0").get().count, 1);

    const updatedAnalyticsResponse = await fetch(`${base}/analytics/summary?date=${reportDate}`, { headers });
    assert.equal(updatedAnalyticsResponse.status, 200);
    const updatedAnalytics = await updatedAnalyticsResponse.json();
    const updatedUsageByName = Object.fromEntries(updatedAnalytics.operational.ingredientUsage.map((row) => [row.ingredient, row.quantity]));
    assert.equal(updatedUsageByName['Test Coffee Beans'], 18);
    assert.equal(updatedUsageByName['Test Soda 300ml'], 1);
    assert.deepEqual(updatedAnalytics.operational.ingredientUsageWarnings.map((warning) => ({
      ingredient: warning.ingredient, menuItem: warning.menuItem, recipeUnit: warning.recipeUnit, stockUnit: warning.stockUnit,
    })), [{ ingredient: 'Test White Bread', menuItem: 'Test Bread Recipe', recipeUnit: 'kg', stockUnit: 'loaves' }]);

    const variableCostItemId = db.prepare(`INSERT INTO inventory
      (name, quantity, unit, threshold, supplier, unit_cost, purchase_unit, purchase_unit_factor, purchase_unit_cost)
      VALUES ('Test Variable Cost Item', 0, 'pcs', 0, '', 0, 'pcs', 1, 0)`).run().lastInsertRowid;
    const receiveVariableCost = (supplier, unitCost) => fetch(`${base}/inventory/receive-receipt`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        receiptDate: '2026-10-11',
        receiptRef: `INV-${supplier}`,
        supplier,
        items: [{ inventoryId: variableCostItemId, name: 'Test Variable Cost Item', quantity: 10, unit: 'pcs', unitCost }],
      }),
    });
    assert.equal((await receiveVariableCost('Supplier A', 4500)).status, 201);
    assert.equal((await receiveVariableCost('Supplier B', 4200)).status, 201);
    const variableCostStock = db.prepare('SELECT quantity, unit_cost FROM inventory WHERE id = ?').get(variableCostItemId);
    assert.equal(variableCostStock.quantity, 20);
    assert.equal(variableCostStock.unit_cost, 4350);
    const purchaseHistoryResponse = await fetch(`${base}/inventory/${variableCostItemId}/purchase-history`, { headers });
    assert.equal(purchaseHistoryResponse.status, 200);
    const purchaseHistory = await purchaseHistoryResponse.json();
    assert.equal(purchaseHistory.length, 2);
    assert.deepEqual(purchaseHistory.map((row) => row.supplier).sort(), ['Supplier A', 'Supplier B']);
    assert.deepEqual(purchaseHistory.map((row) => row.purchaseUnitCost).sort((a, b) => a - b), [4200, 4500]);
    assert.equal(purchaseHistory[0].previousAverageCost, 4500);
    assert.equal(purchaseHistory[0].newAverageCost, 4350);
    const editVariableCostItem = await fetch(`${base}/inventory/${variableCostItemId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        name: 'Test Variable Cost Item',
        quantity: 20,
        unit: 'pcs',
        purchaseUnit: 'pcs',
        purchaseUnitFactor: 1,
        purchaseUnitCost: 4200,
        unitCost: 4200,
      }),
    });
    assert.equal(editVariableCostItem.status, 200);
    const editedVariableCostItem = await editVariableCostItem.json();
    assert.equal(editedVariableCostItem.unitCost, 4350);
    assert.equal(editedVariableCostItem.purchaseUnitCost, 4200);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    db?.close();
    setupDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});