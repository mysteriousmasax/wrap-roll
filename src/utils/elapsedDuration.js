const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (value == null || value === '') return Number.NaN;
  return new Date(value).getTime();
}

function addCalendarMonths(date, months) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function completedCalendarMonths(start, end) {
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
    + end.getUTCMonth() - start.getUTCMonth();
  if (addCalendarMonths(start, months) > end) months -= 1;
  return Math.max(0, months);
}

function compact(parts) {
  return parts.filter(Boolean).join(' ');
}

export function formatElapsedDuration(startValue, endValue = Date.now()) {
  const startTime = timestamp(startValue);
  const endTime = timestamp(endValue);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return '—';

  const duration = Math.max(0, endTime - startTime);
  if (duration < MINUTE) return `${Math.floor(duration / SECOND)}s`;
  if (duration < HOUR) {
    const minutes = Math.floor(duration / MINUTE);
    const seconds = Math.floor((duration % MINUTE) / SECOND);
    return `${minutes}m ${seconds}s`;
  }
  if (duration < DAY) {
    const hours = Math.floor(duration / HOUR);
    const minutes = Math.floor((duration % HOUR) / MINUTE);
    return compact([`${hours}h`, minutes ? `${minutes}m` : '']);
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  const months = completedCalendarMonths(start, end);
  if (months > 0) {
    const anchor = addCalendarMonths(start, months);
    const remaining = endTime - anchor.getTime();
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    const days = Math.floor(remaining / DAY);
    return compact([
      years ? `${years}y` : '',
      remainingMonths ? `${remainingMonths}mo` : '',
      days ? `${days}d` : '',
    ]);
  }

  const days = Math.floor(duration / DAY);
  const hours = Math.floor((duration % DAY) / HOUR);
  return compact([`${days}d`, hours ? `${hours}h` : '']);
}
