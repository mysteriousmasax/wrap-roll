import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeStockCounts } from '../../src/utils/stockCountSummary.js';

test('analytics counts staff-entered stock before two-person confirmation', () => {
  assert.deepEqual(summarizeStockCounts([{
    inventoryId: 12,
    item: 'Water 500ml',
    opening: '',
    added: '',
    closing: '',
    status: 'ok',
    staffCounts: [{ userId: 4, opening: '', added: '', closing: '8', status: 'ok' }],
  }]), { itemsCounted: 1, attentionCount: 0 });
});

test('analytics detects attention in individual counts and deduplicates an item', () => {
  assert.deepEqual(summarizeStockCounts([
    { inventoryId: 12, item: 'Water 500ml', staffCounts: [{ closing: '0', status: 'restock' }] },
    { inventoryId: 12, item: 'Water 500ml', closing: '', status: 'ok' },
  ]), { itemsCounted: 1, attentionCount: 1 });
});

test('blank stock entries are not counted', () => {
  assert.deepEqual(summarizeStockCounts([{ item: 'Water 500ml', opening: '', added: null, closing: undefined }]), {
    itemsCounted: 0,
    attentionCount: 0,
  });
});