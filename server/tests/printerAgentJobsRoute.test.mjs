import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('printer agent can poll the job queue without an uninitialized timestamp error', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-printer-jobs-'));
  const previousPath = process.env.DB_PATH;
  const token = 'printer-agent-test-token';
  let db;
  let server;
  process.env.DB_PATH = path.join(directory, 'printer.db');

  try {
    const database = await import('../db/database.js');
    db = database.default;
    await database.ensureDatabase();
    const { default: printerRouter } = await import('../routes/printer.js');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    db.prepare(`INSERT INTO printer_agents (id, token_hash, branch_code, branch_name, created_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run('agent-test', tokenHash, 'MAIN', 'Main Branch', new Date().toISOString());

    const app = express();
    app.use(express.json());
    app.use('/api/printer', printerRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/printer/agent/jobs/next`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { job: null });
    assert.ok(db.prepare('SELECT last_seen_at FROM printer_agents WHERE id = ?').get('agent-test').last_seen_at);
  } finally {
    if (server) {
      server.close();
      await once(server, 'close');
    }
    db?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});
