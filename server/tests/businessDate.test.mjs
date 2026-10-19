import assert from 'node:assert/strict';
import test from 'node:test';
import { getBusinessDate } from '../../src/utils/businessDate.js';

test('business date follows the configured restaurant timezone around UTC midnight', () => {
  assert.equal(getBusinessDate(new Date('2026-10-19T21:30:00.000Z')), '2026-10-20');
  assert.equal(getBusinessDate(new Date('2026-10-19T20:59:00.000Z')), '2026-10-19');
});