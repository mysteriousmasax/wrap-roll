export function formatReservationCountdown(target, now = Date.now()) {
  const targetTime = new Date(target).getTime();
  if (!Number.isFinite(targetTime)) return '';
  const remainingMinutes = Math.ceil(Math.max(0, targetTime - now) / 60000);
  if (remainingMinutes === 0) return 'now';

  const totalDays = Math.floor(remainingMinutes / 1440);
  const years = Math.floor(totalDays / 365);
  const daysAfterYears = totalDays % 365;
  const months = Math.floor(daysAfterYears / 30);
  const days = daysAfterYears % 30;
  const hours = Math.floor((remainingMinutes % 1440) / 60);
  const minutes = remainingMinutes % 60;
  return [
    years ? `${years}y` : '',
    months ? `${months}mo` : '',
    days || months ? `${days}d` : '',
    `${hours}h`,
    `${minutes}m`,
  ].filter(Boolean).join(' ');
}