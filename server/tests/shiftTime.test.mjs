import assert from 'node:assert/strict';
import test from 'node:test';
import { getShiftScheduleForTime, lateMinutesAt, overtimeMinutesAt } from '../utils/shiftTime.js';

const staff = {
  shift: 'Morning',
  morning_start_time: '08:00',
  morning_end_time: '16:00',
  evening_start_time: '14:30',
  evening_end_time: '21:00',
};

test('current restaurant time selects the matching shift, including overlapping hours', () => {
  assert.equal(getShiftScheduleForTime(staff, '9:02 p.m.').label, 'evening');
  assert.equal(getShiftScheduleForTime(staff, '12:00 PM').label, 'morning');
  assert.equal(getShiftScheduleForTime(staff, '3:00 PM').label, 'evening');
});

test('late and overtime use the selected shift schedule and real clock time', () => {
  assert.equal(lateMinutesAt('9:02 p.m.', '14:30'), 392);
  assert.equal(overtimeMinutesAt('9:02 p.m.', '14:30', '21:00'), 2);
});

test('lateness is measured from the scheduled start and overtime starts only after scheduled end', () => {
  assert.equal(lateMinutesAt('09:04', '09:00'), 4);
  assert.equal(lateMinutesAt('09:00', '09:00'), 0);
  assert.equal(overtimeMinutesAt('16:59', '09:00', '17:00'), 0);
  assert.equal(overtimeMinutesAt('17:00', '09:00', '17:00'), 0);
  assert.equal(overtimeMinutesAt('17:01', '09:00', '17:00'), 1);
});