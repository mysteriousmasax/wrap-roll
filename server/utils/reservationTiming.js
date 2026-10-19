export const RESERVATION_PREPARATION_LEAD_MS = 30 * 60 * 1000;

export function getReservationReleaseTime(scheduledFor) {
  return new Date(new Date(scheduledFor).getTime() - RESERVATION_PREPARATION_LEAD_MS).toISOString();
}