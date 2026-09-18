import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRoleName,
  normalizePageAccess,
  getRolePageAccess,
  normalizeCustomRole,
} from '../utils/roles.js';

test('normalizeRoleName handles aliases and custom labels consistently', () => {
  assert.equal(normalizeRoleName('Manager'), 'manager');
  assert.equal(normalizeRoleName('FRONT DESK'), 'foh');
  assert.equal(normalizeRoleName('Executive'), 'executive');
  assert.equal(normalizeRoleName('Head of Operations'), 'manager');
});

test('custom roles are normalized and default to their base permissions', () => {
  const role = normalizeCustomRole({ name: ' Head Chef ', label: 'Head Chef', baseRole: 'kitchen' });
  assert.deepEqual(role, { name: 'Head Chef', label: 'Head Chef', baseRole: 'kitchen' });
  assert.deepEqual(getRolePageAccess({ role: 'Head Chef', pageAccess: [] }), getRolePageAccess({ role: 'kitchen', pageAccess: [] }));
});

test('page access is normalized and preserves explicit route allow-lists', () => {
  assert.deepEqual(normalizePageAccess(['/pos', ' /management/menu ', '/unknown']), ['/pos', '/management/menu']);
  assert.ok(getRolePageAccess({ role: 'admin', pageAccess: [] }).includes('/management/settings'));
  assert.ok(getRolePageAccess({ role: 'foh', pageAccess: ['/orders'] }).includes('/orders'));
});
