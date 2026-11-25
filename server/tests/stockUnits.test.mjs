import assert from 'node:assert/strict';
import test from 'node:test';
import { convertStockQuantity, getStockUnitConversionFactor } from '../../src/utils/stockUnits.js';
import { convertInventoryFormBaseUnit } from '../../src/utils/inventoryFormUnits.js';

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

test('changing a new inventory item from kilograms to grams preserves pack pricing', () => {
  const form = convertInventoryFormBaseUnit({
    unit: 'kg',
    quantity: '25',
    threshold: '0.5',
    purchaseUnit: 'kg',
    purchaseUnitFactor: '1',
    purchaseUnitCost: '10000',
    unitCost: '',
    backFreezerChiller: '2',
  }, 'g');

  assert.deepEqual({
    unit: form.unit,
    quantity: form.quantity,
    threshold: form.threshold,
    purchaseUnit: form.purchaseUnit,
    purchaseUnitFactor: form.purchaseUnitFactor,
    purchaseUnitCost: form.purchaseUnitCost,
    unitCost: form.unitCost,
    backFreezerChiller: form.backFreezerChiller,
  }, {
    unit: 'g',
    quantity: '25000',
    threshold: '500',
    purchaseUnit: 'kg',
    purchaseUnitFactor: '1000',
    purchaseUnitCost: '10000',
    unitCost: '',
    backFreezerChiller: '2000',
  });
  assert.equal(Number(form.purchaseUnitCost) / Number(form.purchaseUnitFactor), 10);
  assert.equal(Number(form.quantity) * (Number(form.purchaseUnitCost) / Number(form.purchaseUnitFactor)), 250000);
});

test('inventory form unit changes reject incompatible unit conversions', () => {
  assert.equal(convertInventoryFormBaseUnit({ unit: 'kg' }, 'pcs'), null);
});
