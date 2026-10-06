import assert from 'node:assert/strict';
import { calculateDailyStockSummary } from '../utils/dailyStockReport.js';

const rows = [
  { item: 'White Bread Rolls', unit: 'loaves', opening: 80, added: 20, closing: 90, status: 'ok' },
  { item: 'Chicken Tandoori Prep', unit: 'kg', opening: 25, added: 5, closing: 18, status: 'restock' },
  { item: 'NFC Loyalty Tags / Cards', unit: 'cards', opening: 200, added: 0, closing: 198, status: 'ok' },
];

const summary = calculateDailyStockSummary(rows, { currency: 'TZS' });

assert.equal(summary.totalItems, 3, 'Counts all stock rows');
assert.equal(summary.lowStockItems.length, 1, 'Flags the only restock item');
assert.equal(summary.totalOpeningStock, 305, 'Sums opening stock');
assert.equal(summary.totalClosingStock, 306, 'Sums closing stock');
assert.equal(summary.financialSummary.stockVariance, 1, 'Shows net variance between opening and closing stock');
assert.equal(summary.financialSummary.lowStockCount, 1, 'Summarizes low-stock alerts');
assert.ok(summary.financialSummary.totalValue > 0, 'Generates a positive stock value summary');

console.log('daily stock report summary tests passed');
