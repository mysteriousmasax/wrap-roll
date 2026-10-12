import db from '../db/database.js';

export function restaurantTime(date = new Date()) {
  const timezone = db.prepare("SELECT value FROM settings WHERE key = 'timezone'").get()?.value || 'Africa/Dar_es_Salaam';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute} ${parts.dayPeriod}`,
  };
}

export function restaurantDateBounds(dateValue) {
  const timezone = db.prepare("SELECT value FROM settings WHERE key = 'timezone'").get()?.value || 'Africa/Dar_es_Salaam';
  const [year, month, day] = String(dateValue).split('-').map(Number);
  if (!year || !month || !day) throw new Error('A valid restaurant date is required.');
  const resolveMidnight = (targetYear, targetMonth, targetDay) => {
    const target = Date.UTC(targetYear, targetMonth - 1, targetDay);
    let resolved = target;
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(resolved)).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
      const displayed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
      resolved += target - displayed;
    }
    return resolved;
  };
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: new Date(resolveMidnight(year, month, day)).toISOString(),
    end: new Date(resolveMidnight(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate())).toISOString(),
  };
}
