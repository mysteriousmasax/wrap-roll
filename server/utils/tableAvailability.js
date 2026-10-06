export const TABLE_CLEANING_DURATION_MS = 10 * 60 * 1000;

export function releaseExpiredCleaningTables(db, now = new Date()) {
  const cutoff = new Date(now.getTime() - TABLE_CLEANING_DURATION_MS).toISOString();
  const expiredTables = db.prepare(
    "SELECT id FROM tables WHERE status = 'cleaning' AND cleaning_started_at IS NOT NULL AND julianday(cleaning_started_at) <= julianday(?)"
  ).all(cutoff);
  if (!expiredTables.length) return [];

  const updateTable = db.prepare(
    "UPDATE tables SET status = 'available', current_order_id = NULL, cleaning_started_at = NULL WHERE id = ? AND status = 'cleaning' AND julianday(cleaning_started_at) <= julianday(?)"
  );
  const getTable = db.prepare('SELECT * FROM tables WHERE id = ?');
  const released = [];

  for (const { id } of expiredTables) {
    if (updateTable.run(id, cutoff).changes) released.push(getTable.get(id));
  }

  return released;
}