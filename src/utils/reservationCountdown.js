export function formatReservationCountdown(target, now = Date.now()) {
  const targetTime = new Date(target).getTime();
  if (!Number.isFinite(targetTime)) return '';
  const remainingMinutes = Math.ceil(Math.max(0, targetTime - now) / 60000);
  if (remainingMinutes === 0) return 'now';

  const totalDays = Math.floor(remainingMinutes / 1440);
  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  const hours = Math.floor((remainingMinutes % 1440) / 60);
  const minutes = remainingMinutes % 60;
  return [
    months ? `${months}mo` : '',
    days || months ? `${days}d` : '',
    `${hours}h`,
    `${minutes}m`,
  ].filter(Boolean).join(' ');
}