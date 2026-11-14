import assert from 'node:assert/strict';
import test from 'node:test';
import { formatElapsedDuration } from '../../src/utils/elapsedDuration.js';

test('elapsed timer displays seconds, minutes, hours, and days at useful ranges', () => {
  const start = Date.parse('2026-01-01T00:00:00.000Z');
  assert.equal(formatElapsedDuration(start, start + 45_000), '45s');
  assert.equal(formatElapsedDuration(start, start + 65_000), '1m 5s');
  assert.equal(formatElapsedDuration(start, start + 3_720_000), '1h 2m');
  assert.equal(formatElapsedDuration(start, start + 176_400_000), '2d 1h');
});

test('elapsed timer uses calendar months and years for long durations', () => {
  assert.equal(
    formatElapsedDuration('2025-01-31T12:00:00.000Z', '2025-03-02T12:00:00.000Z'),
    '1mo 2d',
  );
  assert.equal(
    formatElapsedDuration('2024-02-29T12:00:00.000Z', '2025-02-28T12:00:00.000Z'),
    '1y',
  );
  assert.equal(
    formatElapsedDuration('2020-01-01T00:00:00.000Z', '2023-03-05T00:00:00.000Z'),
    '3y 2mo 4d',
  );
});

test('elapsed timer handles invalid and reversed timestamps', () => {
  assert.equal(formatElapsedDuration('not-a-date', Date.now()), '—');
  assert.equal(
    formatElapsedDuration('2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    '0s',
  );
});
