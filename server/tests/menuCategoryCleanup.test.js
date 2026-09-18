import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategoryMatchValues, normalizeMenuCategoryValue } from '../routes/menu.js';

test('normalizeMenuCategoryValue keeps a category slug stable', () => {
  assert.equal(normalizeMenuCategoryValue('Burger & Fries'), 'burger-fries');
  assert.equal(normalizeMenuCategoryValue('  WRAPS  '), 'wraps');
});

test('getCategoryMatchValues includes both slug and legacy raw values for rename/delete cleanup', () => {
  const values = getCategoryMatchValues('burger-fries', 'Burger & Fries');
  assert.deepEqual(values, ['burger-fries', 'Burger & Fries', 'burger & fries']);
});
