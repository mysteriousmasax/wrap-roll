import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff} min ago`;
  return `${Math.floor(diff / 60)} hr ago`;
}

function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    read: !!row.read,
    time: timeAgo(row.created_at),
    createdAt: row.created_at,
  };
}

router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT * FROM notifications
    WHERE (audience_user_id IS NULL OR audience_user_id = ?)
      AND (audience_role IS NULL OR audience_role = ? OR ? = 'admin')
    ORDER BY created_at DESC`).all(req.user.id, req.user.role, req.user.role);
  res.json(
    rows.map(mapNotification)
  );
});

router.patch('/:id/read', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.patch('/read-all', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1').run();
  res.json({ ok: true });
});

export default router;
