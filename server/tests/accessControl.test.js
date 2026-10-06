import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRoleName,
  normalizePageAccess,
  getRolePageAccess,
  normalizeCustomRole,
  expandImpliedPageAccess,
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
  assert.deepEqual(
    getRolePageAccess({ role: 'foh', pageAccess: ['/analytics', '/management/menu'] }),
    ['/analytics', '/management/menu']
  );
  assert.deepEqual(getRolePageAccess({ role: 'foh', pageAccess: [] }), getRolePageAccess('foh'));
});

test('POS access implies the checkout flow pages', () => {
  // Regression: staff with a custom page-access list containing /pos (but unable
  // to contain /pos/payment, which the staff editor never offers) were redirected
  // away from checkout to the first page of their list (e.g. /management/campaigns).
  const access = getRolePageAccess({ role: 'admin', pageAccess: ['/management/campaigns', '/pos'] });
  assert.ok(access.includes('/pos/payment'));
  assert.ok(access.includes('/pos/success'));
  assert.equal(access[0], '/management/campaigns');

  assert.deepEqual(expandImpliedPageAccess(['/pos']), ['/pos', '/pos/payment', '/pos/success']);
  assert.deepEqual(expandImpliedPageAccess(['/orders']), ['/orders']);
  assert.deepEqual(expandImpliedPageAccess([]), []);
});
