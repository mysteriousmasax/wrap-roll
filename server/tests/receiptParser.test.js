import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText } from '../../src/utils/receiptParser.js';
import { createReceiptStockLine } from '../../src/utils/receiptIntake.js';

test('receipt OCR parser extracts reviewable supplier, date, reference, total, and lines', () => {
  const parsed = parseReceiptText(`Mikocheni Produce Market
Invoice No: INV-88421
Date: 03/10/2026
Tomatoes 2kg 8,000
Onions 1kg 3,000
TOTAL TZS 11,000`);

  assert.equal(parsed.supplier, 'Mikocheni Produce Market');
  assert.equal(parsed.expenseDate, '2026-10-03');
  assert.equal(parsed.receiptRef, 'INV-88421');
  assert.equal(parsed.amount, 11000);
  assert.match(parsed.description, /Tomatoes 2kg/);
  assert.deepEqual(parsed.items, [
    { name: 'Tomatoes', quantity: 2, unit: 'kg', unitCost: 4000 },
    { name: 'Onions', quantity: 1, unit: 'kg', unitCost: 3000 },
  ]);
  assert.match(parsed.rawText, /TOTAL TZS/);
});

test('receipt OCR parser leaves uncertain fields blank for manual review', () => {
  const parsed = parseReceiptText('Receipt\nVegetables purchased');
  assert.equal(parsed.amount, '');
  assert.equal(parsed.receiptRef, '');
  assert.equal(parsed.expenseDate, '');
  assert.deepEqual(parsed.items, []);
});

test('matched OCR lines retain receipt units and per-unit costs for server conversion', () => {
  const line = createReceiptStockLine(
    { name: 'Sausages', quantity: 2.5, unit: 'kg', unitCost: 10000 },
    { id: 12, name: 'Sausages', unit: 'g', purchaseUnit: 'kg', sku: 'SAUS-12', threshold: 500 },
    { inventoryId: '', sku: '', name: '', quantity: '', unit: 'pcs', unitCost: '', threshold: '' },
  );

  assert.deepEqual(line, {
    inventoryId: '12',
    sku: 'SAUS-12',
    name: 'Sausages',
    quantity: '2.5',
    unit: 'kg',
    unitCost: '10000',
    threshold: '500',
  });
});