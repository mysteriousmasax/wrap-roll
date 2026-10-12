import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('team report recipients can target admins or a selected staff list', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-team-digest-'));
  const previousPath = process.env.DB_PATH;
  let setupDb;
  let db;

  try {
    process.env.DB_PATH = path.join(directory, 'team-digest.db');
    const database = await import(`../db/database.js?team-digest-recipients=${Date.now()}`);
    setupDb = database.default;
    await database.ensureDatabase();
    db = (await import('../db/database.js')).default;

    const managerUserId = db.prepare('INSERT INTO users (name, role, pin, email) VALUES (?, ?, ?, ?)')
      .run('Report Manager', 'manager', 'manager-pin', 'manager@example.com').lastInsertRowid;
    db.prepare('INSERT INTO staff (user_id, name, role, status) VALUES (?, ?, ?, ?)')
      .run(managerUserId, 'Report Manager', 'manager', 'active');
    db.prepare('INSERT INTO users (name, role, pin, email) VALUES (?, ?, ?, ?)')
      .run('Standalone Admin', 'admin', 'admin-pin', 'admin@example.com');

    const { getTeamDigestRecipients, saveTeamDigestConfig } = await import(`../utils/teamEmailDigest.js?team-digest-recipients=${Date.now()}`);
    const allRecipients = getTeamDigestRecipients({ recipientStaffIds: null });
    assert.deepEqual(allRecipients.map((recipient) => recipient.email).sort(), ['admin@example.com', 'manager@example.com']);

    const admin = allRecipients.find((recipient) => recipient.role === 'admin');
    const saved = saveTeamDigestConfig({
      enabled: true,
      frequencies: ['daily'],
      recipientStaffIds: [admin.id],
      topics: { financial: true, lowStock: true, kanban: true },
    });
    assert.deepEqual(saved.recipientStaffIds, [admin.id]);
    assert.deepEqual(getTeamDigestRecipients(saved).map((recipient) => recipient.email), ['admin@example.com']);
  } finally {
    db?.close();
    setupDb?.close();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});