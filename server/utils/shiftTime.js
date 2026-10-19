export function timeMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(A\.?M\.?|P\.?M\.?))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > 23) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (match[3].replace(/\./g, '').toUpperCase() === 'PM' ? 12 : 0);
  }
  return hour * 60 + minute;
}

export function getShiftSchedule(staff, shiftOverride = '') {
  const evening = shiftOverride === 'evening'
    || (!['morning', 'evening'].includes(shiftOverride) && String(staff.shift || '').toLowerCase().includes('evening'));
  return {
    label: evening ? 'evening' : 'morning',
    start: evening ? staff.evening_start_time : staff.morning_start_time,
    end: evening ? staff.evening_end_time : staff.morning_end_time,
  };
}

export function getShiftScheduleForTime(staff, time) {
  const currentMinute = timeMinutes(time);
  const schedules = ['morning', 'evening'].map((label) => getShiftSchedule(staff, label))
    .map((schedule) => ({ ...schedule, startMinute: timeMinutes(schedule.start), endMinute: timeMinutes(schedule.end) }))
    .filter((schedule) => schedule.startMinute != null && schedule.endMinute != null && schedule.startMinute !== schedule.endMinute);
  if (currentMinute == null || !schedules.length) return getShiftSchedule(staff);

  const scored = schedules.map((schedule) => {
    const wrapsMidnight = schedule.endMinute < schedule.startMinute;
    const isWithinShift = wrapsMidnight
      ? currentMinute >= schedule.startMinute || currentMinute < schedule.endMinute
      : currentMinute >= schedule.startMinute && currentMinute < schedule.endMinute;
    const untilStart = (schedule.startMinute - currentMinute + 1440) % 1440;
    const sinceEnd = (currentMinute - schedule.endMinute + 1440) % 1440;
    return { ...schedule, isWithinShift, distance: isWithinShift ? 0 : Math.min(untilStart, sinceEnd) };
  });
  const assignedLabel = getShiftSchedule(staff).label;
  scored.sort((left, right) => (
    Number(right.isWithinShift) - Number(left.isWithinShift)
    || (left.isWithinShift && right.isWithinShift ? right.startMinute - left.startMinute : left.distance - right.distance)
    || Number(right.label === assignedLabel) - Number(left.label === assignedLabel)
  ));
  return getShiftSchedule(staff, scored[0].label);
}

export function lateMinutesAt(actualTime, scheduledStart) {
  const actual = timeMinutes(actualTime);
  const planned = timeMinutes(scheduledStart);
  if (actual == null || planned == null) return 0;
  const adjustedActual = planned - actual > 720 ? actual + 1440 : actual;
  return Math.max(0, adjustedActual - planned);
}

export function overtimeMinutesAt(actualTime, scheduledStart, scheduledEnd) {
  const actual = timeMinutes(actualTime);
  const start = timeMinutes(scheduledStart);
  let end = timeMinutes(scheduledEnd);
  if (actual == null || start == null || end == null) return 0;
  if (end <= start) end += 1440;
  return Math.max(0, (actual < start ? actual + 1440 : actual) - end);
}

export function attendanceMetrics(startTime, endTime, scheduledStart, scheduledEnd) {
  const start = timeMinutes(startTime);
  const end = timeMinutes(endTime);
  const wrapsMidnight = start != null && end != null && end < start;
  const elapsed = start == null || end == null ? 0 : (wrapsMidnight ? end + 1440 - start : end - start);
  return {
    hours: Math.max(0, elapsed / 60),
    late: lateMinutesAt(startTime, scheduledStart),
    overtime: overtimeMinutesAt(endTime, scheduledStart, scheduledEnd),
  };
}