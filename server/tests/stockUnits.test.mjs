import assert from 'node:assert/strict';
import test from 'node:test';
import { convertStockQuantity, getStockUnitConversionFactor } from '../../src/utils/stockUnits.js';

test('stock units convert compatible weight and volume quantities', () => {
  assert.equal(convertStockQuantity(1, 'kg', 'g'), 1000);
  assert.ok(Math.abs(convertStockQuantity(18, 'g', 'kg') - 0.018) < 1e-12);
  assert.equal(convertStockQuantity(1.5, 'l', 'ml'), 1500);
});

test('equivalent piece units convert and incompatible dimensions are rejected', () => {
  assert.equal(getStockUnitConversionFactor('piece', 'pcs'), 1);
  assert.equal(convertStockQuantity(1, 'bottle', 'bottle'), 1);
  assert.equal(getStockUnitConversionFactor('g', 'bottle'), null);
});
