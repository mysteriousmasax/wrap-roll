import assert from 'node:assert/strict';
import test from 'node:test';
import { getShiftProgress } from '../../src/utils/shiftProgress.js';

const staff = (overrides = {}) => ({
  name: 'Test Staff',
  shift: 'Morning',
  status: 'on-clock',
  morningStartTime: '09:00',
  morningEndTime: '17:00',
  attendance: {
    date: '2026-11-14',
    shift: 'morning',
    status: 'active',
    scheduledStart: '09:00',
    scheduledEnd: '17:00',
    lateMinutes: 0,
    login: '09:00 AM',
  },
  ...overrides,
});

test('active shift ring follows scheduled time and shows late and overtime colors', () => {
  assert.deepEqual(getShiftProgress(staff(), 13 * 60, '2026-11-14'), {
    progress: 50, ringProgress: 50, color: '#16a34a', label: 'On shift · 50%',
  });
  assert.equal(getShiftProgress(staff({ attendance: { ...staff().attendance, lateMinutes: 4 } }), 10 * 60, '2026-11-14').color, '#d97706');
  assert.equal(getShiftProgress(staff(), 17 * 60, '2026-11-14').color, '#16a34a');
  assert.equal(getShiftProgress(staff(), 17 * 60 + 30, '2026-11-14').color, '#7c3aed');
});

test('off-clock states distinguish upcoming, missed clock-in, no-show, and completed shifts', () => {
  const offClock = staff({ status: 'off-clock', attendance: null });
  assert.equal(getShiftProgress(offClock, 8 * 60, '2026-11-14').ringProgress, 0);
  assert.equal(getShiftProgress(offClock, 10 * 60, '2026-11-14').color, '#d97706');
  assert.equal(getShiftProgress(staff({ status: 'no-show' }), 10 * 60, '2026-11-14').color, '#dc2626');
  assert.equal(getShiftProgress(staff({ status: 'off-clock', attendance: { ...staff().attendance, status: 'completed' } }), 18 * 60, '2026-11-14').color, '#2563eb');
});

test('overnight shift ring recognizes next-day overtime using the recorded shift date', () => {
  const overnight = staff({
    shift: 'Evening',
    eveningStartTime: '22:00',
    eveningEndTime: '06:00',
    attendance: {
      date: '2026-11-13',
      shift: 'evening',
      status: 'active',
      scheduledStart: '22:00',
      scheduledEnd: '06:00',
      login: '10:00 PM',
    },
  });
  assert.equal(getShiftProgress(overnight, 2 * 60, '2026-11-14').progress, 50);
  assert.equal(getShiftProgress(overnight, 6 * 60, '2026-11-14').color, '#16a34a');
  assert.equal(getShiftProgress(overnight, 7 * 60, '2026-11-14').color, '#7c3aed');
});
