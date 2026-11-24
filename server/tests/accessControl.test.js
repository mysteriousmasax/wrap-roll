import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTE_ACCESS as SERVER_ROUTE_ACCESS,
  normalizeRoleName,
  normalizePageAccess,
  getRolePageAccess,
  normalizeCustomRole,
  expandImpliedPageAccess,
  getApiPageAccess,
  hasDelegatedApiPageAccess,
} from '../utils/roles.js';
import { ROUTE_ACCESS as CLIENT_ROUTE_ACCESS, getUserPageAccess, isPageAllowedForUser, normalizeUserRole as normalizeClientRole } from '../../src/utils/roleAccess.js';
import { requireRole } from '../middleware/auth.js';

test('server and client role route access stay in sync', () => {
  assert.deepEqual(SERVER_ROUTE_ACCESS, CLIENT_ROUTE_ACCESS);
});

test('normalizeRoleName handles aliases and custom labels consistently', () => {
  assert.equal(normalizeRoleName('Manager'), 'manager');
  assert.equal(normalizeRoleName('FRONT DESK'), 'foh');
  assert.equal(normalizeRoleName('Executive'), 'executive');
  assert.equal(normalizeRoleName('Head of Operations'), 'manager');
  assert.equal(normalizeRoleName('Super Admin'), 'admin');
  assert.equal(normalizeClientRole('super admin'), 'admin');
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

test('explicitly unselected pages stay hidden while admins retain full access', () => {
  const staff = { role: 'foh', pageAccess: ['/pos', '/orders'] };
  assert.equal(isPageAllowedForUser(staff, '/pos'), true);
  assert.equal(isPageAllowedForUser(staff, '/customers'), false);
  assert.deepEqual(getUserPageAccess({ role: 'foh', pageAccess: [] }), []);

  const superAdmin = { role: 'Super Admin', pageAccess: ['/pos'] };
  assert.equal(isPageAllowedForUser(superAdmin, '/management/menu'), true);
  assert.ok(getUserPageAccess(superAdmin).includes('/management/menu'));
});

test('granted page access authorizes only its corresponding protected API features', () => {
  const menuStaff = { role: 'foh', pageAccess: ['/management/menu'] };
  assert.deepEqual(getApiPageAccess('/api/menu', '/categories'), ['/management/menu']);
  assert.equal(hasDelegatedApiPageAccess(menuStaff, '/api/menu', '/categories'), true);
  assert.equal(hasDelegatedApiPageAccess(menuStaff, '/api/staff', '/'), false);
  const managerMenuStaff = { role: 'manager', pageAccess: ['/management/menu'] };
  assert.equal(hasDelegatedApiPageAccess(managerMenuStaff, '/api/menu', '/menu-item-1', 'PUT'), true);

  const peopleStaff = { role: 'kitchen', pageAccess: ['/management/people'] };
  assert.equal(hasDelegatedApiPageAccess(peopleStaff, '/api/staff', '/roles'), true);
  assert.equal(hasDelegatedApiPageAccess(peopleStaff, '/api/staff', '/17', 'PUT'), true);
  assert.equal(hasDelegatedApiPageAccess(peopleStaff, '/api/settings', '/', 'PUT', { shift_types: '[]' }), true);
  assert.equal(hasDelegatedApiPageAccess(peopleStaff, '/api/settings', '/', 'PUT', { tax_rate: '18' }), false);

  const operationsStaff = { role: 'foh', pageAccess: ['/management/operations'] };
  assert.equal(hasDelegatedApiPageAccess(operationsStaff, '/api/business', '/expenses/12'), true);
  assert.equal(hasDelegatedApiPageAccess(operationsStaff, '/api/settings', '/'), false);
});

test('page grants preserve server-only refund approval restrictions', () => {
  const frontOfHouse = { role: 'foh', pageAccess: ['/orders', '/pos'] };
  assert.equal(hasDelegatedApiPageAccess(frontOfHouse, '/api/orders', '/order-1/refunds', 'POST'), true);
  assert.equal(hasDelegatedApiPageAccess(frontOfHouse, '/api/orders', '/order-1/refunds/refund-1', 'PATCH'), false);
  assert.equal(hasDelegatedApiPageAccess(frontOfHouse, '/api/orders', '/held', 'GET'), true);

  const kitchenStaff = { role: 'kitchen', pageAccess: ['/management/menu'] };
  assert.equal(hasDelegatedApiPageAccess(kitchenStaff, '/api/orders', '/order-1/refunds/refund-1', 'PATCH'), false);
});

test('requireRole accepts a delegated page grant and still rejects unrelated grants', () => {
  const guard = requireRole('admin');
  const runGuard = (apiPath, routePath) => {
    let statusCode = 200;
    let payload;
    let passed = false;
    guard({
      user: { role: 'foh', pageAccess: ['/management/menu'] },
      baseUrl: apiPath,
      path: routePath,
      method: 'POST',
      body: {},
    }, {
      status(code) { statusCode = code; return this; },
      json(value) { payload = value; return this; },
    }, () => { passed = true; });
    return { statusCode, payload, passed };
  };

  assert.deepEqual(runGuard('/api/menu', '/categories'), { statusCode: 200, payload: undefined, passed: true });
  assert.equal(runGuard('/api/settings', '/').statusCode, 403);
});
