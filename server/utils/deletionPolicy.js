import db from '../db/database.js';
import { requireRole } from '../middleware/auth.js';

export const deletionViewer = requireRole('admin', 'executive', 'manager');

export function isAdilaIsmail(user) {
  return String(user?.name || '').trim().toLowerCase() === 'adila ismail';
}

export function requireAdilaDeletion(req, res, next) {
  if (!isAdilaIsmail(req.user)) return res.status(403).json({ error: 'Only Adila Ismail can execute deletions.' });
  next();
}

export function recordDeletion({ resourceType, resourceId, snapshot, reason, user }) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO deletion_audit (resource_type, resource_id, deleted_snapshot, reason, requested_by_id, requested_by_name, executed_by_id, executed_by_name, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(resourceType, String(resourceId), JSON.stringify(snapshot || {}), reason || null, user?.id || null, user?.name || 'Unknown', user?.id || null, user?.name || 'Unknown', now);
  return now;
}