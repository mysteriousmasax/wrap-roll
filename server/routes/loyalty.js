import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

function toInt(value) {
  return Number(value || 0);
}

function mapCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    lifetimeValue: Number(row.lifetime_value || 0),
    favoriteItems: JSON.parse(row.favorite_items || '[]'),
    lastVisit: row.last_visit,
    phone: row.phone,
    email: row.email,
    visits: toInt(row.visits),
    atRisk: !!row.at_risk,
    birthday: row.birthday,
    anniversary: row.anniversary,
    customerSegment: row.customer_segment || 'regular',
    nfcTagCode: row.nfc_tag_code,
    nfcTagType: row.nfc_tag_type || 'key_holder',
    loyaltyNotes: row.loyalty_notes,
    preferredChannel: row.preferred_channel || 'pos',
  };
}

router.get('/', authMiddleware, (req, res) => {
  const customerRows = db.prepare('SELECT * FROM customers ORDER BY name').all();
  const itemRows = db.prepare('SELECT * FROM loyalty_items ORDER BY created_at DESC').all();
  const byCustomer = new Map();

  itemRows.forEach((item) => {
    const current = byCustomer.get(item.customer_id) || [];
    current.push({
      id: item.id,
      customerId: item.customer_id,
      itemName: item.item_name,
      itemType: item.item_type,
      itemCode: item.item_code,
      status: item.status,
      issueDate: item.issue_date,
      notes: item.notes,
      createdAt: item.created_at,
    });
    byCustomer.set(item.customer_id, current);
  });

  const data = customerRows.map((customer) => ({
    ...mapCustomer(customer),
    loyaltyItems: byCustomer.get(customer.id) || [],
  }));

  res.json(data);
});

router.get('/dashboard', authMiddleware, (req, res) => {
  const customers = db.prepare('SELECT * FROM customers ORDER BY name').all();
  const today = new Date();
  const getMonthDay = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const currentKey = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const birthdays = customers.filter((customer) => customer.birthday && getMonthDay(customer.birthday));
  const anniversaries = customers.filter((customer) => customer.anniversary && getMonthDay(customer.anniversary));
  const couples = customers.filter((customer) => (customer.customer_segment || '').toLowerCase() === 'couples');

  const upcomingBirthdays = birthdays
    .map((customer) => ({
      customerId: customer.id,
      name: customer.name,
      birthday: customer.birthday,
      tag: customer.nfc_tag_code,
      dateKey: getMonthDay(customer.birthday),
      monthDay: getMonthDay(customer.birthday),
    }))
    .sort((a, b) => ((a.dateKey < currentKey ? `1-${a.dateKey}` : `0-${a.dateKey}`).localeCompare(b.dateKey < currentKey ? `1-${b.dateKey}` : `0-${b.dateKey}`)));

  const upcomingAnniversaries = anniversaries
    .map((customer) => ({
      customerId: customer.id,
      name: customer.name,
      anniversary: customer.anniversary,
      dateKey: getMonthDay(customer.anniversary),
    }))
    .sort((a, b) => ((a.dateKey < currentKey ? `1-${a.dateKey}` : `0-${a.dateKey}`).localeCompare(b.dateKey < currentKey ? `1-${b.dateKey}` : `0-${b.dateKey}`)));

  res.json({
    totals: {
      customers: customers.length,
      birthdays: birthdays.length,
      anniversaries: anniversaries.length,
      couples: couples.length,
    },
    upcomingBirthdays,
    upcomingAnniversaries,
    couples,
    nextHolidayWindow: {
      month: today.getMonth() + 1,
      year: today.getFullYear(),
    },
  });
});

router.post('/campaign/dispatch', authMiddleware, (req, res) => {
  const customers = db.prepare('SELECT * FROM customers WHERE birthday IS NOT NULL OR anniversary IS NOT NULL OR lower(customer_segment) = ?').all('couples');
  const now = new Date().toISOString();
  const sent = [];
  customers.forEach((customer) => {
    const events = [];
    if (customer.birthday) events.push('birthday');
    if (customer.anniversary) events.push('anniversary');
    if ((customer.customer_segment || '').toLowerCase() === 'couples') events.push('couples offer');
    const message = `Hello ${customer.name?.split(' ')[0] || 'friend'}, Wrap & Roll has a special ${events.join(' and ')} offer waiting for you.`;
    db.prepare('INSERT INTO notifications (type, title, message, read, created_at) VALUES (?, ?, ?, 0, ?)').run('success', 'Customer campaign ready', message, now);
    sent.push({ customerId: customer.id, name: customer.name, channel: customer.preferred_channel || 'pos', message });
  });
  res.json({ ok: true, sentCount: sent.length, sent });
});

export default router;
