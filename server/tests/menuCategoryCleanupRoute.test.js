import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('deleting a category also clears menu items storing its display name', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-category-cleanup-'));
  const previousPath = process.env.DB_PATH;
  const previousSecret = process.env.JWT_SECRET;
  let db;
  let server;
  process.env.DB_PATH = path.join(directory, 'menu.db');
  process.env.JWT_SECRET = 'menu-category-cleanup-test-secret';

  try {
    const database = await import('../db/database.js');
    db = database.default;
    await database.ensureDatabase();
    const { default: menuRouter } = await import('../routes/menu.js');
    const { signToken } = await import('../middleware/auth.js');

    db.prepare('INSERT INTO menu_categories (name, slug, active, created_at) VALUES (?, ?, 1, ?)')
      .run('Burger & Fries', 'burger-fries', new Date().toISOString());
    const item = db.prepare('INSERT INTO menu_items (name, price, category) VALUES (?, ?, ?)')
      .run('Classic Burger', 12000, 'Burger & Fries');
    db.prepare('INSERT INTO menu_item_categories (menu_item_id, category) VALUES (?, ?)')
      .run(item.lastInsertRowid, 'Burger & Fries');

    const app = express();
    app.use(express.json());
    app.use('/api/menu', menuRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/menu`;
    const token = signToken({ id: 1, name: 'Mina Manager', role: 'manager' });
    const headers = { Authorization: `Bearer ${token}` };

    const deleteResponse = await fetch(`${baseUrl}/categories/burger-fries`, {
      method: 'DELETE',
      headers,
    });
    assert.equal(deleteResponse.status, 200);

    const menuResponse = await fetch(`${baseUrl}?all=1`, { headers });
    assert.equal(menuResponse.status, 200);
    const [menuItem] = await menuResponse.json();
    assert.equal(menuItem.category, '');
    assert.deepEqual(menuItem.categories, []);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM menu_categories').get().count, 0);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    db?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    rmSync(directory, { recursive: true, force: true });
  }
});