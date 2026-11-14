import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { releaseExpiredCleaningTables } from '../utils/tableAvailability.js';
import { getDineInTabSummary, getOpenDineInTab, recordDineInTabPayments } from '../utils/dineInTabs.js';
import { getOrderById } from '../utils/orders.js';
import { normalizeTanzanianPhone } from '../../shared/phone.js';

const router = Router();

function mapTable(row) {
  const tagId = row.tag_id;
  return {
    id: row.id,
    number: row.number,
    seats: row.seats,
    status: row.status,
    tabId: row.open_tab_id || null,
    customerName: row.tab_customer_name || '',
    tabOrderCount: Number(row.tab_order_count || 0),
    tabTotal: Number(row.tab_total || 0),
    paidAmount: Number(row.tab_paid || 0),
    balanceDue: Math.max(0, Number(row.tab_total || 0) - Number(row.tab_paid || 0)),
    x: row.x,
    y: row.y,
    order: row.current_order_id,
    reservation: row.reservation,
    tagId,
    nfcUrl: tagId ? `${process.env.PUBLIC_APP_URL || 'https://wrapandrolltz.com'}/table/${encodeURIComponent(tagId)}` : null,
    imageUrl: row.image_url,
    zone: row.zone,
    note: row.note,
  };
}

function getTableRows() {
  return db.prepare(`SELECT t.*, tab.id AS open_tab_id, tab.customer_name AS tab_customer_name,
      (SELECT COUNT(*) FROM orders o WHERE o.dine_in_tab_id = tab.id) AS tab_order_count,
      (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.dine_in_tab_id = tab.id) AS tab_total,
      (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE o.dine_in_tab_id = tab.id AND p.status IN ('paid', 'completed')) AS tab_paid
    FROM tables t LEFT JOIN dine_in_tabs tab ON tab.table_number = t.number AND tab.status = 'open'
    ORDER BY t.number`).all();
}

router.get('/', authMiddleware, (req, res) => {
  releaseExpiredCleaningTables(db).forEach((table) => broadcast('table:updated', mapTable(table)));
  res.json(getTableRows().map(mapTable));
});

router.get('/public/:tagId', (req, res) => {
  releaseExpiredCleaningTables(db).forEach((table) => broadcast('table:updated', mapTable(table)));
  const table = db.prepare(`SELECT t.*, tab.id AS open_tab_id FROM tables t
    LEFT JOIN dine_in_tabs tab ON tab.table_number = t.number AND tab.status = 'open'
    WHERE t.tag_id = ?`).get(req.params.tagId);
  if (!table) return res.status(404).json({ error: 'Table tag not found' });
  if (table.status === 'occupied' && !table.open_tab_id) return res.status(409).json({ error: 'This table is not available for ordering' });
  if (['reserved', 'cleaning'].includes(table.status)) return res.status(409).json({ error: 'This table is not currently available' });
  res.json({ number: table.number, seats: table.seats, zone: table.zone, tagId: table.tag_id, status: table.status, hasOpenTab: Boolean(table.open_tab_id) });
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

router.get('/:id/tab', authMiddleware, requireRole('admin', 'manager', 'foh'), (req, res) => {
  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found.' });
  const tab = getOpenDineInTab(db, table.number);
  if (!tab) return res.status(404).json({ error: 'This table has no open visit.' });
  res.json(getDineInTabSummary(db, tab.id));
});

router.patch('/:id/tab/customer', authMiddleware, requireRole('admin', 'manager', 'foh'), (req, res) => {
  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found.' });
  const tab = getOpenDineInTab(db, table.number);
  if (!tab) return res.status(404).json({ error: 'This table has no open visit.' });

  const customerName = String(req.body?.customerName || '').trim().slice(0, 120);
  const customerPhone = normalizeTanzanianPhone(req.body?.customerPhone || '');
  const customerEmail = String(req.body?.customerEmail || '').trim().toLowerCase().slice(0, 254);
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const now = new Date().toISOString();
  const saveCustomer = db.transaction(() => {
    db.prepare(`UPDATE dine_in_tabs SET customer_name = ?, customer_phone = ?, customer_email = ?
      WHERE id = ? AND status = 'open'`)
      .run(customerName || null, customerPhone || null, customerEmail || null, tab.id);
    db.prepare(`UPDATE orders SET customer_name = ?, customer_phone = ?, customer_email = ?, updated_at = ?
      WHERE dine_in_tab_id = ?`)
      .run(customerName || null, customerPhone || null, customerEmail || null, now, tab.id);
  });
  saveCustomer();

  const summary = getDineInTabSummary(db, tab.id);
  summary.tickets.forEach((ticket) => {
    const order = getOrderById(ticket.id);
    if (order) broadcast('order:updated', order);
  });
  res.json(summary);
});

router.post('/:id/payments', authMiddleware, requireRole('admin', 'manager', 'foh'), (req, res) => {
  try {
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    if (!table) return res.status(404).json({ error: 'Table not found.' });
    const summary = recordDineInTabPayments(db, {
      tableId: table.id,
      payments: req.body?.payments,
      receivedBy: req.user?.name || 'Staff',
      receivedByUserId: req.user?.id ?? null,
    });
    const updatedTable = getTableRows().find((row) => row.id === table.id);
    broadcast('table:updated', mapTable(updatedTable));
    summary.tickets.forEach((ticket) => {
      const order = getOrderById(ticket.id);
      if (order) broadcast('order:updated', order);
    });
    res.json({ tab: summary, table: mapTable(updatedTable) });
  } catch (error) {
    const conflict = /exceeds the balance|already closed|no active dine-in tab|cannot be allocated/i.test(error.message);
    res.status(conflict ? 409 : 400).json({ error: error.message || 'Unable to record table payment.' });
  }
});

router.patch('/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Table not found' });
  const { number, seats, status, reservation, currentOrderId, tagId, imageUrl, zone, note } = req.body;
  const nextStatus = status ?? existing.status;
  const openTab = getOpenDineInTab(db, existing.number);
  if (openTab && nextStatus !== 'occupied') {
    const summary = getDineInTabSummary(db, openTab.id);
    const message = summary?.balanceDue > 0
      ? 'This table has an unpaid balance. Settle the open tab before releasing or reusing it.'
      : 'This table visit is still open. Complete every ticket before releasing the table.';
    return res.status(409).json({ error: message });
  }
  if (nextStatus === 'occupied' && !openTab && existing.status !== 'occupied') {
    return res.status(409).json({ error: 'Start a dine-in order to open a table visit.' });
  }
  const cleaningStartedAt = nextStatus === 'cleaning'
    ? existing.status === 'cleaning' && existing.cleaning_started_at
      ? existing.cleaning_started_at
      : new Date().toISOString()
    : null;
  try {
    db.prepare(
      'UPDATE tables SET number = ?, seats = ?, status = ?, reservation = ?, current_order_id = ?, tag_id = ?, image_url = ?, zone = ?, note = ?, cleaning_started_at = ? WHERE id = ?'
    ).run(
      number ?? existing.number,
      seats ?? existing.seats,
      nextStatus,
      reservation !== undefined ? reservation : existing.reservation,
      openTab ? existing.current_order_id : currentOrderId !== undefined ? currentOrderId : existing.current_order_id,
      tagId !== undefined ? tagId : existing.tag_id,
      imageUrl !== undefined ? imageUrl : existing.image_url,
      zone !== undefined ? zone : existing.zone,
      note !== undefined ? note : existing.note,
      cleaningStartedAt,
      req.params.id
    );
    const table = mapTable(getTableRows().find((row) => row.id === Number(req.params.id)));
    broadcast('table:updated', table);
    res.json(table);
  } catch {
    res.status(409).json({ error: 'Table number already exists' });
  }
});

export default router;
