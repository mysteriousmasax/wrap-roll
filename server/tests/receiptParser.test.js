import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText } from '../../src/utils/receiptParser.js';

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
  assert.match(parsed.rawText, /TOTAL TZS/);
});

test('receipt OCR parser leaves uncertain fields blank for manual review', () => {
  const parsed = parseReceiptText('Receipt\nVegetables purchased');
  assert.equal(parsed.amount, '');
  assert.equal(parsed.receiptRef, '');
  assert.equal(parsed.expenseDate, '');
});