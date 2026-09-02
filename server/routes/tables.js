import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

function mapTable(row) {
  return {
    id: row.id,
    number: row.number,
    seats: row.seats,
    status: row.status,
    x: row.x,
    y: row.y,
    order: row.current_order_id,
    reservation: row.reservation,
    tagId: row.tag_id,
    imageUrl: row.image_url,
    zone: row.zone,
    note: row.note,
  };
}

router.get('/', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM tables ORDER BY number').all().map(mapTable));
});

router.get('/public/:tagId', (req, res) => {
  const table = db.prepare('SELECT * FROM tables WHERE tag_id = ?').get(req.params.tagId);
  if (!table) return res.status(404).json({ error: 'Table tag not found' });
  if (['occupied', 'reserved', 'cleaning'].includes(table.status)) return res.status(409).json({ error: 'This table is not currently available' });
  res.json({ number: table.number, seats: table.seats, zone: table.zone, tagId: table.tag_id, status: table.status });
});

router.post('/', authMiddleware, (req, res) => {
  const { number, seats, x, y, tagId, imageUrl, zone, note } = req.body;
  if (!number || !seats) return res.status(400).json({ error: 'Number and seats required' });
  try {
    const result = db.prepare(
      'INSERT INTO tables (number, seats, status, x, y, tag_id, image_url, zone, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(number, seats, 'available', x ?? 0, y ?? 0, tagId ?? `T-${number}`, imageUrl ?? null, zone ?? 'Main floor', note ?? 'Tap NFC tag to check-in guest');
    res.status(201).json(mapTable(db.prepare('SELECT * FROM tables WHERE id = ?').get(result.lastInsertRowid)));
  } catch {
    res.status(409).json({ error: 'Table number already exists' });
  }
});

router.patch('/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Table not found' });
  const { status, reservation, currentOrderId, tagId, imageUrl, zone, note } = req.body;
  db.prepare(
    'UPDATE tables SET status = ?, reservation = ?, current_order_id = ?, tag_id = ?, image_url = ?, zone = ?, note = ? WHERE id = ?'
  ).run(
    status ?? existing.status,
    reservation !== undefined ? reservation : existing.reservation,
    currentOrderId !== undefined ? currentOrderId : existing.current_order_id,
    tagId !== undefined ? tagId : existing.tag_id,
    imageUrl !== undefined ? imageUrl : existing.image_url,
    zone !== undefined ? zone : existing.zone,
    note !== undefined ? note : existing.note,
    req.params.id
  );
  res.json(mapTable(db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id)));
});

export default router;
