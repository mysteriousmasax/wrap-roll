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
