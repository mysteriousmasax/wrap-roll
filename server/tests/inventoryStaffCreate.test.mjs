import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('authenticated staff can create an inventory item for their shift stock count', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-inventory-staff-'));
  const previousPath = process.env.DB_PATH;
  let testDb;
  let routeDb;
  let server;
  process.env.DB_PATH = path.join(directory, 'inventory-staff-test.db');

  try {
    const database = await import(`../db/database.js?inventory-staff-test=${Date.now()}`);
    testDb = database.default;
    await database.ensureDatabase();
    const userId = testDb.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)')
      .run('Stock Count Staff', 'foh', 'test-pin').lastInsertRowid;
    const { default: inventoryRouter } = await import(`../routes/inventory.js?inventory-staff-test=${Date.now()}`);
    const { signToken } = await import('../middleware/auth.js');
    routeDb = (await import('../db/database.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/inventory', inventoryRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/inventory`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signToken({ id: userId, name: 'Stock Count Staff', role: 'foh' })}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'New Shift Stock', quantity: 0, unit: 'units' }),
    });

    assert.equal(response.status, 201);
    const item = await response.json();
    assert.equal(item.name, 'New Shift Stock');
    assert.equal(routeDb.prepare('SELECT quantity FROM inventory WHERE id = ?').get(item.id).quantity, 0);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    routeDb?.close();
    testDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});