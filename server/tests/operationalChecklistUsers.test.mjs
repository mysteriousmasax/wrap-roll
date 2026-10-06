import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

test('checklist completion is private and team progress includes only active HR staff', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-checklist-users-'));
  const previousPath = process.env.DB_PATH;
  const previousSecret = process.env.JWT_SECRET;
  let db;
  let server;
  process.env.DB_PATH = path.join(directory, 'checklists.db');
  process.env.JWT_SECRET = 'operational-checklist-users-test-secret';

  try {
    const database = await import('../db/database.js');
    db = database.default;
    await database.ensureDatabase();
    const { default: businessRouter } = await import('../routes/business.js');
    const { signToken } = await import('../middleware/auth.js');

    const reportDate = '2026-10-05';
    const adaId = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)').run('Ada Cook', 'kitchen', '1001').lastInsertRowid;
    const benId = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)').run('Ben Cook', 'kitchen', '1002').lastInsertRowid;
    const managerId = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)').run('Mina Manager', 'manager', '1003').lastInsertRowid;
    const orphanId = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)').run('Orphan Account', 'admin', '1004').lastInsertRowid;
    const removedId = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)').run('Former Staff', 'foh', '1005').lastInsertRowid;
    const addStaff = db.prepare('INSERT INTO staff (user_id, name, role, shift, status) VALUES (?, ?, ?, ?, ?)');
    addStaff.run(adaId, 'Ada Cook', 'kitchen', 'Morning', 'off-clock');
    addStaff.run(benId, 'Ben Cook', 'kitchen', 'Morning', 'off-clock');
    addStaff.run(managerId, 'Mina Manager', 'manager', 'Morning', 'off-clock');
    addStaff.run(removedId, 'Former Staff', 'foh', 'Morning', 'removed');
    db.prepare(`INSERT INTO operational_checklist_entries
      (business_date, phase, task_key, completed, completed_by, completed_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?)`)
      .run(reportDate, 'morning-kitchen', 'temperatures', 'Ada Cook', '2026-10-05T07:15:00.000Z', '2026-10-05T07:15:00.000Z');

    const app = express();
    app.use(express.json());
    app.use('/api/business', businessRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/business/checklists`;
    const adaToken = signToken({ id: adaId, name: 'Ada Cook', role: 'kitchen' });
    const benToken = signToken({ id: benId, name: 'Ben Cook', role: 'kitchen' });
    const managerToken = signToken({ id: managerId, name: 'Mina Manager', role: 'manager' });

    const getChecklist = async (token) => {
      const response = await fetch(`${baseUrl}?date=${reportDate}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200);
      return response.json();
    };
    const isCompleted = (checklist, taskKey) => checklist.phases
      .flatMap((phase) => phase.tasks)
      .find((task) => task.key === taskKey).completed;

    const adaChecklist = await getChecklist(adaToken);
    const benChecklist = await getChecklist(benToken);
    assert.equal(isCompleted(adaChecklist, 'temperatures'), true, 'legacy completion remains with its original user');
    assert.equal(isCompleted(benChecklist, 'temperatures'), false, 'another user starts with an independent checklist');

    const updateResponse = await fetch(`${baseUrl}/${reportDate}/morning-kitchen/bread-prep`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${benToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(updateResponse.status, 200);

    const updatedBenChecklist = await getChecklist(benToken);
    const updatedAdaChecklist = await getChecklist(adaToken);
    assert.equal(isCompleted(updatedBenChecklist, 'bread-prep'), true, "completion is saved to the acting user's account");
    assert.equal(isCompleted(updatedAdaChecklist, 'bread-prep'), false, 'the completion is not shared with another account');

    const managerChecklist = await getChecklist(managerToken);
    const teamByName = new Map(managerChecklist.teamProgress.map((person) => [person.name, person]));
    assert.equal(teamByName.get('Ben Cook').userId, benId);
    assert.equal(teamByName.get('Ben Cook').role, 'kitchen');
    assert.equal(teamByName.get('Ben Cook').completedTasks, 1);
    assert.equal(teamByName.get('Ada Cook').completedTasks, 0, 'managers see untouched user accounts at zero progress');
    assert.equal(teamByName.get('Mina Manager').touchedTasks, 0, 'accounts with no checklist activity remain visible');
    assert.equal(teamByName.has('Orphan Account'), false, 'login accounts without an HR staff record are excluded');
    assert.equal(teamByName.has('Former Staff'), false, 'removed HR staff are excluded');
    assert.equal(managerChecklist.teamProgress.length, 3);

    const createdTaskResponse = await fetch(`${baseUrl}/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phaseId: 'morning-kitchen', label: 'Wipe prep counters.' }),
    });
    assert.equal(createdTaskResponse.status, 201);
    const createdTask = await createdTaskResponse.json();
    let refreshedChecklist = await getChecklist(managerToken);
    assert.equal(refreshedChecklist.phases[0].tasks.some((task) => task.key === createdTask.task.key), true);

    const editTaskResponse = await fetch(`${baseUrl}/tasks/${createdTask.task.key}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${managerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Sanitize prep counters.' }),
    });
    assert.equal(editTaskResponse.status, 200);
    refreshedChecklist = await getChecklist(managerToken);
    assert.equal(refreshedChecklist.phases[0].tasks.some((task) => task.label === 'Sanitize prep counters.'), true);

    const completeCreatedTaskResponse = await fetch(`${baseUrl}/${reportDate}/morning-kitchen/${createdTask.task.key}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${managerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(completeCreatedTaskResponse.status, 200);

    const deleteTaskResponse = await fetch(`${baseUrl}/tasks/${createdTask.task.key}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(deleteTaskResponse.status, 200);
    refreshedChecklist = await getChecklist(managerToken);
    assert.equal(refreshedChecklist.phases[0].tasks.some((task) => task.key === createdTask.task.key), false);
    assert.equal(refreshedChecklist.totalTasks, 15);
    assert.equal(refreshedChecklist.teamProgress.find((person) => person.name === 'Mina Manager').completedTasks, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM operational_checklist_user_entries WHERE task_key = ?').get(createdTask.task.key).count, 1, 'deleted checklist completion remains in history');
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