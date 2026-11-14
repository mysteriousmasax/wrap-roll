function parseMinute(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > 23) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  }
  return hour * 60 + minute;
}

export function getShiftProgress(staff, currentMinute, currentDate) {
  const attendance = staff.attendance;
  const shift = String(attendance?.shift || staff.shift || '').toLowerCase();
  const start = parseMinute(attendance?.scheduledStart
    || (shift.includes('evening') ? staff.eveningStartTime : staff.morningStartTime));
  const end = parseMinute(attendance?.scheduledEnd
    || (shift.includes('evening') ? staff.eveningEndTime : staff.morningEndTime));

  if (start == null || end == null || start === end || !Number.isFinite(currentMinute)) {
    return { progress: 0, ringProgress: 0, color: '#d6d3d1', label: 'Shift schedule not set' };
  }

  if (staff.status === 'no-show') {
    return { progress: 100, ringProgress: 100, color: '#dc2626', label: 'No show' };
  }
  if (attendance?.status === 'completed') {
    return { progress: 100, ringProgress: 100, color: '#2563eb', label: 'Shift completed' };
  }

  const duration = (end - start + 1440) % 1440;
  const elapsed = (currentMinute - start + 1440) % 1440;
  const onClock = staff.status === 'on-clock' || attendance?.status === 'active';

  if (onClock) {
    const wrapsMidnight = end < start;
    const betweenEndAndStart = wrapsMidnight && currentMinute > end && currentMinute < start;
    const afterOvernightShift = betweenEndAndStart && attendance?.date && currentDate > attendance.date;
    const beforeStart = wrapsMidnight ? betweenEndAndStart && !afterOvernightShift : currentMinute < start;
    const overtime = wrapsMidnight ? Boolean(afterOvernightShift) : currentMinute > end;
    const progress = beforeStart ? 0 : overtime ? 100 : Math.min(100, Math.round((elapsed / duration) * 100));
    const late = Number(attendance?.lateMinutes || attendance?.late_minutes || 0) > 0;
    return {
      progress,
      ringProgress: progress,
      color: overtime ? '#7c3aed' : late ? '#d97706' : '#16a34a',
      label: overtime ? 'Overtime' : late ? `Late clock-in · ${attendance?.login || ''}` : `On shift · ${progress}%`,
    };
  }

  const beforeStart = end > start
    ? currentMinute < start
    : currentMinute >= end && currentMinute < start;
  if (beforeStart) {
    return { progress: 0, ringProgress: 0, color: '#d6d3d1', label: 'Shift not started' };
  }
  return { progress: 0, ringProgress: 12, color: '#d97706', label: 'Scheduled shift · not clocked in' };
}
