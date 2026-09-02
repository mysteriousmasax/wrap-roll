import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const defaultHolidayTemplates = [
  'Happy {event} {name}! We are celebrating with you and would love to welcome you for a special treat at Wrap & Roll.',
  'Hello {name}, this {event} is a perfect time to enjoy a special meal with us at Wrap & Roll.',
  'Dear {name}, we wish you a joyful {event}. Come celebrate with us and enjoy a warm welcome on us.'
];

async function fetchExternalHolidayFeed(country = process.env.HOLIDAY_API_COUNTRY || 'TZ') {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${new Date().getFullYear()}/${country}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Holiday feed unavailable: ${response.status}`);
  const data = await response.json();
  return (Array.isArray(data) ? data : []).map((entry) => ({
    title: entry.name || 'Holiday',
    date: entry.date,
    country: country,
    region: entry.localName || null,
    category: 'holiday',
    source: 'external-api',
    template: defaultHolidayTemplates[0],
  }));
}

const worldHolidays = [
  { title: 'New Year\'s Day', date: '2026-01-01', country: 'GLOBAL', category: 'holiday' },
  { title: 'Valentine\'s Day', date: '2026-02-14', country: 'GLOBAL', category: 'event' },
  { title: 'International Women\'s Day', date: '2026-03-08', country: 'GLOBAL', category: 'event' },
  { title: 'Easter Sunday', date: '2026-04-12', country: 'GLOBAL', category: 'holiday' },
  { title: 'Labour Day', date: '2026-05-01', country: 'GLOBAL', category: 'holiday' },
  { title: 'Father\'s Day', date: '2026-06-21', country: 'GLOBAL', category: 'event' },
  { title: 'Independence Day', date: '2026-07-01', country: 'GLOBAL', category: 'holiday' },
  { title: 'Mother\'s Day', date: '2026-05-10', country: 'GLOBAL', category: 'event' },
  { title: 'Christmas Day', date: '2026-12-25', country: 'GLOBAL', category: 'holiday' },
  { title: 'New Year\'s Eve', date: '2026-12-31', country: 'GLOBAL', category: 'event' },
];

function getNextHolidayFeed() {
  const now = new Date();
  const year = now.getFullYear();
  return worldHolidays.map((holiday) => ({
    ...holiday,
    id: `${holiday.title}-${holiday.date}`,
    year,
    template: holiday.template || defaultHolidayTemplates[Math.floor(Math.random() * defaultHolidayTemplates.length)],
  }));
}

router.get('/feed', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM holiday_events WHERE active = 1 ORDER BY event_date ASC').all();
  if (rows.length === 0) {
    const seed = db.transaction(() => {
      const now = new Date().toISOString();
      getNextHolidayFeed().forEach((event) => {
        db.prepare(
          'INSERT INTO holiday_events (title, event_date, country, region, category, source, template, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
        ).run(event.title, event.date, event.country, event.region || null, event.category, 'world-feed', event.template, now);
      });
    });
    seed();
  }

  const events = db.prepare('SELECT * FROM holiday_events WHERE active = 1 ORDER BY event_date ASC').all();
  res.json(events.map((event) => ({
    id: event.id,
    title: event.title,
    date: event.event_date,
    country: event.country,
    region: event.region,
    category: event.category,
    source: event.source,
    template: event.template || defaultHolidayTemplates[0],
  })));
});

router.post('/sync', authMiddleware, (req, res) => {
  const seed = db.transaction(() => {
    const now = new Date().toISOString();
    getNextHolidayFeed().forEach((event) => {
      const existing = db.prepare('SELECT id FROM holiday_events WHERE title = ? AND event_date = ?').get(event.title, event.date);
      if (!existing) {
        db.prepare(
          'INSERT INTO holiday_events (title, event_date, country, region, category, source, template, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
        ).run(event.title, event.date, event.country, event.region || null, event.category, 'world-feed', event.template, now);
      }
    });
  });
  seed();
  res.json({ ok: true, synced: true });
});

router.post('/dispatch', authMiddleware, (req, res) => {
  const { eventId } = req.body;
  const customers = db.prepare('SELECT * FROM customers WHERE email IS NOT NULL OR phone IS NOT NULL').all();
  const event = eventId
    ? db.prepare('SELECT * FROM holiday_events WHERE id = ?').get(eventId)
    : db.prepare('SELECT * FROM holiday_events WHERE active = 1 ORDER BY event_date ASC LIMIT 1').get();

  if (!event) return res.status(404).json({ error: 'Holiday event not found' });

  const sent = [];
  customers.forEach((customer) => {
    const name = customer.name?.split(' ')[0] || 'friend';
    const template = event.template || defaultHolidayTemplates[0];
    const message = template.replace('{name}', name).replace('{event}', event.title);
    sent.push({
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      message,
    });
    db.prepare('INSERT INTO notifications (type, title, message, read, created_at) VALUES (?, ?, ?, 0, ?)')
      .run('info', `Holiday: ${event.title}`, message, new Date().toISOString());
  });

  res.json({ ok: true, eventTitle: event.title, sentCount: sent.length, sent });
});

export default router;
