import assert from 'node:assert/strict';
import test from 'node:test';
import { getDigestPeriod, getDigestPeriodUtcBounds, normalizeTeamDigestConfig, renderTeamDigest } from '../utils/teamEmailDigest.js';

test('daily, weekly, and monthly reports use stable completed periods', () => {
  assert.deepEqual(getDigestPeriod('daily', '2026-10-07'), { start: '2026-10-06', end: '2026-10-06' });
  assert.deepEqual(getDigestPeriod('weekly', '2026-10-07'), { start: '2026-09-28', end: '2026-10-04' });
  assert.deepEqual(getDigestPeriod('monthly', '2026-10-07'), { start: '2026-09-01', end: '2026-09-30' });
});

test('digest configuration clamps options and requires topic content to be rendered safely', () => {
  const config = normalizeTeamDigestConfig({ enabled: true, frequencies: ['daily', 'daily', 'invalid'], sendHour: 28, topics: { financial: false } });
  assert.deepEqual(config, { enabled: true, frequencies: ['daily'], sendHour: 23, recipientStaffIds: null, topics: { financial: false, lowStock: true, kanban: true } });
  assert.deepEqual(normalizeTeamDigestConfig({ recipientStaffIds: [3, 3, -7, 'bad'] }).recipientStaffIds, [3, -7]);
  const email = renderTeamDigest({ frequency: 'daily', period: { start: '2026-10-07', end: '2026-10-07' }, topics: {}, lowStock: [{ name: '<Milk>', quantity: 2, unit: 'L', threshold: 3 }], kanban: [] });
  assert.match(email.html, /&lt;Milk&gt;/);
  assert.match(email.text, /Low stock \(1\)/);
});

test('report query boundaries use restaurant-local midnight', () => {
  assert.deepEqual(
    getDigestPeriodUtcBounds(getDigestPeriod('daily', '2026-10-10'), 'Africa/Dar_es_Salaam'),
    { start: '2026-10-08T21:00:00.000Z', end: '2026-10-09T21:00:00.000Z' }
  );
});