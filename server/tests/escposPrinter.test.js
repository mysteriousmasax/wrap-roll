import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReceipt } from '../utils/escposPrinter.js';

function printableLines(buffer) {
  return buffer.toString('ascii')
    .split('\n')
    .map((line) => line.replace(/[\x00-\x1f\x7f]/g, ''))
    .filter(Boolean);
}

test('KP58ZJ 58 mm receipt profile wraps to 32 columns', () => {
  const receipt = buildReceipt({
    id: 'ORDER-123456',
    items: [{ qty: 2, name: 'A very long customized chicken wrap with extra ingredients', price: 14000 }],
    subtotal: 28000,
    tax: 2240,
    total: 30240,
  }, { printer_model: 'Romeson KP58ZJ', printer_paper_width_mm: '58' });

  assert.ok(printableLines(receipt).every((line) => line.length <= 32));
});

test('80 mm receipt profile wraps to 48 columns', () => {
  const receipt = buildReceipt({
    items: [{ qty: 1, name: 'A very long customized chicken wrap with extra ingredients and a special sauce', price: 14000 }],
    subtotal: 14000,
    tax: 1120,
    total: 15120,
  }, { printer_paper_width_mm: '80' });

  assert.ok(printableLines(receipt).every((line) => line.length <= 48));
});
