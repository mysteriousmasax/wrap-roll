import test from 'node:test';
import assert from 'node:assert/strict';
import { getStockUnitConversionFactor, stockUnitGroups, stockUnitOptions } from './stockUnits.js';

test('stock unit selector exposes all common units by measurement type', () => {
  assert.deepEqual(stockUnitGroups.map((group) => group.label), ['Weight', 'Volume', 'Count and packaging']);
  for (const unit of ['mg', 'g', 'kg', 'litre', 'ml', 'pcs', 'pieces (half)', 'pieces (full)', 'loaves', 'bottle', 'box', 'pack', 'cards']) {
    assert.ok(stockUnitOptions.includes(unit), `${unit} should be available for every inventory item`);
  }
});

test('compatible stock units convert accurately', () => {
  assert.equal(getStockUnitConversionFactor('kg', 'g'), 1000);
  assert.equal(getStockUnitConversionFactor('litre', 'ml'), 1000);
  assert.equal(getStockUnitConversionFactor('dozen', 'pcs'), 12);
  assert.equal(getStockUnitConversionFactor('pieces (half)', 'pieces (full)'), 0.5);
  assert.equal(getStockUnitConversionFactor('cup', 'ml'), 250);
});

test('unrelated package units are not treated as interchangeable', () => {
  assert.equal(getStockUnitConversionFactor('box', 'pcs'), null);
  assert.equal(getStockUnitConversionFactor('bottle', 'can'), null);
  assert.equal(getStockUnitConversionFactor('kg', 'litre'), null);
});
