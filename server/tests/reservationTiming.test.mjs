import assert from 'node:assert/strict';
import test from 'node:test';
import { formatReservationCountdown } from '../../src/utils/reservationCountdown.js';
import { getReservationReleaseTime } from '../utils/reservationTiming.js';

test('reservation kitchen release is exactly 30 minutes before scheduled handoff', () => {
  assert.equal(
    getReservationReleaseTime('2026-10-19T12:30:00.000Z'),
    '2026-10-19T12:00:00.000Z',
  );
});

test('shared order countdown displays months and remaining days', () => {
  const now = Date.parse('2026-10-19T12:00:00.000Z');
  const target = new Date(now + 45 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(formatReservationCountdown(target, now), '1mo 15d 0h 0m');
});