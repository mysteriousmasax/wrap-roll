import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('notification read endpoints only update notifications visible to the signed-in user', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-notification-scope-'));
  const previousPath = process.env.DB_PATH;
  const previousSecret = process.env.JWT_SECRET;
  let db;
  let server;
  process.env.DB_PATH = path.join(directory, 'notifications.db');
  process.env.JWT_SECRET = 'notification-read-scope-test-secret';

  try {
    const database = await import('../db/database.js');
    db = database.default;
    await database.ensureDatabase();
    const { default: notificationRouter } = await import('../routes/notifications.js');
    const { signToken } = await import('../middleware/auth.js');
    const userId = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)')
      .run('FOH User', 'foh', '1001').lastInsertRowid;
    const insert = db.prepare(`INSERT INTO notifications
      (type, title, message, read, created_at, audience_user_id, audience_role)
      VALUES ('info', ?, ?, 0, ?, ?, ?)`);
    const now = new Date().toISOString();
    const publicId = insert.run('Everyone', 'Public notification', now, null, null).lastInsertRowid;
    const ownId = insert.run('Own', 'Private notification', now, userId, 'foh').lastInsertRowid;
    const hiddenId = insert.run('Hidden', 'Other user notification', now, userId + 1, 'manager').lastInsertRowid;

    const app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/notifications`;
    const headers = { Authorization: `Bearer ${signToken({ id: userId, name: 'FOH User', role: 'foh' })}` };

    const markHiddenRead = await fetch(`${base}/${hiddenId}/read`, { method: 'PATCH', headers });
    assert.equal(markHiddenRead.status, 200);
    assert.equal(db.prepare('SELECT read FROM notifications WHERE id = ?').get(hiddenId).read, 0);

    const markAllRead = await fetch(`${base}/read-all`, { method: 'PATCH', headers });
    assert.equal(markAllRead.status, 200);
    assert.equal(db.prepare('SELECT read FROM notifications WHERE id = ?').get(publicId).read, 1);
    assert.equal(db.prepare('SELECT read FROM notifications WHERE id = ?').get(ownId).read, 1);
    assert.equal(db.prepare('SELECT read FROM notifications WHERE id = ?').get(hiddenId).read, 0);
  } finally {
    if (server) {
      server.close();
      await once(server, 'close');
    }
    db?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    rmSync(directory, { recursive: true, force: true });
  }
});
