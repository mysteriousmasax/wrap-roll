import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { resolveMx, resolveTxt, reverse } from 'node:dns/promises';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { buildCampaignBody, buildCampaignSubject, plainTextToHtml, selectAudience } from '../utils/emailCampaigns.js';
import { isSmtpConfigured, publicEmailUrl, sendEmail, senderSummary, verifyEmailToken, verifySmtpTransport } from '../utils/emailDelivery.js';
import { enrollSubscriberForAutomations } from '../utils/emailAutomationWorker.js';
import { processEmailCampaign, sendCampaignTest } from '../utils/emailCampaignService.js';

const router = Router();
const adminRoles = ['admin', 'manager', 'executive'];

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function seedDefaultTemplates() {
  const defaults = [
    { name: 'Welcome', category: 'welcome', subject: 'Welcome to Wrap & Roll, {{first_name}}', body: 'We are delighted to have you at Wrap & Roll. Discover fresh wraps, bold flavours, and warm hospitality.\n\nWe look forward to serving you again.' },
    { name: 'Post-visit thank you', category: 'post_visit', subject: 'Thanks for dining with us, {{first_name}}', body: 'Thank you for choosing Wrap & Roll. We hope you enjoyed your meal.\n\nWe would love to welcome you back soon.' },
    { name: 'Birthday treat', category: 'birthday', subject: 'Happy birthday, {{first_name}}!', body: 'Happy birthday from all of us at Wrap & Roll. We have a special treat waiting for you: {{offer}}.' },
    { name: 'Win-back', category: 'winback', subject: 'We miss you, {{first_name}}', body: 'It has been a while since your last visit. Come back to Wrap & Roll and enjoy {{offer}}.' },
    { name: 'Weekly newsletter', category: 'newsletter', subject: 'This week at Wrap & Roll', body: 'Here is what is fresh this week: new dishes, kitchen highlights, and offers made for you.' },
  ];
  const now = new Date().toISOString();
  const insert = db.prepare('INSERT INTO email_templates (name, category, subject, body_text, html_body, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)');
  for (const template of defaults) {
    if (db.prepare('SELECT id FROM email_templates WHERE lower(name) = lower(?)').get(template.name)) continue;
    insert.run(template.name, template.category, template.subject, template.body, plainTextToHtml(template.body), now, now);
  }
}

function seedDefaultAutomations() {
  const defaults = [
    { name: 'Welcome new subscribers', trigger: 'subscriber_added', delay: 0, template: 'Welcome', config: {} },
    { name: 'Thank guests after a visit', trigger: 'post_visit', delay: 1440, template: 'Post-visit thank you', config: {} },
    { name: 'Birthday treat', trigger: 'birthday', delay: 0, template: 'Birthday treat', config: {} },
    { name: 'Win back lapsed guests', trigger: 'winback', delay: 0, template: 'Win-back', config: { inactiveDays: 60 } },
  ];
  const now = new Date().toISOString();
  for (const item of defaults) {
    if (db.prepare('SELECT id FROM email_automations WHERE trigger_type = ? AND name = ?').get(item.trigger, item.name)) continue;
    const template = db.prepare('SELECT id, subject, body_text FROM email_templates WHERE name = ?').get(item.template);
    if (!template) continue;
    const automation = db.prepare('INSERT INTO email_automations (name, trigger_type, status, segment, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(item.name, item.trigger, 'paused', 'all', JSON.stringify(item.config), now, now);
    db.prepare('INSERT INTO email_automation_steps (automation_id, step_order, delay_minutes, template_id, subject, body_text) VALUES (?, 0, ?, ?, ?, ?)')
      .run(automation.lastInsertRowid, item.delay, template.id, template.subject, template.body_text);
  }
}

router.post('/webhooks/events', (req, res) => {
  const expectedSecret = process.env.EMAIL_WEBHOOK_SECRET || '';
  const providedSecret = String(req.get('x-email-webhook-secret') || req.get('authorization')?.replace(/^Bearer\s+/i, '') || '');
  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(providedSecret);
  if (!expectedSecret || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return res.status(expectedSecret ? 401 : 503).json({ error: 'Email webhook authentication is not configured or invalid.' });
  }

  const eventId = String(req.body?.eventId || req.body?.id || '').trim();
  const eventType = String(req.body?.type || '').trim().toLowerCase();
  const email = normalizeEmail(req.body?.customer?.email || req.body?.email);
  if (!eventId || !eventType || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'eventId, type, and a valid customer email are required.' });
  }
  const now = new Date().toISOString();
  const previousEvent = db.prepare('SELECT status FROM email_webhook_events WHERE event_id = ?').get(eventId);
  if (previousEvent && ['processed', 'suppressed'].includes(previousEvent.status)) return res.json({ ok: true, duplicate: true });
  if (previousEvent) {
    db.prepare("UPDATE email_webhook_events SET status = 'received', response = '' WHERE event_id = ?").run(eventId);
  } else {
    db.prepare('INSERT INTO email_webhook_events (event_id, event_type, status, received_at) VALUES (?, ?, ?, ?)')
      .run(eventId, eventType, 'received', now);
  }

  let subscriber = db.prepare('SELECT * FROM email_subscribers WHERE lower(email) = ?').get(email);
  const deliveryEvent = req.body?.messageId
    ? db.prepare('SELECT id FROM email_campaign_events WHERE message_id = ? ORDER BY sent_at DESC LIMIT 1').get(String(req.body.messageId))
    : db.prepare('SELECT id FROM email_campaign_events WHERE lower(email) = ? ORDER BY sent_at DESC LIMIT 1').get(email);
  const isComplaint = ['email.complaint', 'email.spam_complaint'].includes(eventType);
  const isBounce = ['email.bounced', 'email.hard_bounce', 'email.delivery_failed'].includes(eventType);
  const isProviderUnsubscribe = ['email.unsubscribed', 'email.unsubscribe'].includes(eventType);
  if (isComplaint || isBounce || isProviderUnsubscribe) {
    const reason = isComplaint ? 'spam_complaint' : isBounce ? 'hard_bounce' : 'unsubscribe';
    db.prepare('INSERT OR REPLACE INTO email_suppressions (email, reason, source, created_at) VALUES (?, ?, ?, ?)')
      .run(email, reason, 'provider_webhook', now);
    if (subscriber) {
      if (isComplaint || isProviderUnsubscribe) {
        db.prepare("UPDATE email_subscribers SET active = 0, consent_status = 'unsubscribed', unsubscribed_at = ?, updated_at = ? WHERE id = ?")
          .run(now, now, subscriber.id);
      } else {
        db.prepare('UPDATE email_subscribers SET active = 0, updated_at = ? WHERE id = ?').run(now, subscriber.id);
      }
      db.prepare("UPDATE email_automation_enrollments SET status = 'suppressed', updated_at = ? WHERE subscriber_id = ? AND status = 'active'")
        .run(now, subscriber.id);
    }
    if (deliveryEvent) {
      db.prepare('UPDATE email_campaign_events SET status = ?, bounced_at = ?, response = ? WHERE id = ?')
        .run(reason, now, String(req.body?.reason || reason).slice(0, 500), deliveryEvent.id);
    }
    db.prepare("UPDATE email_webhook_events SET status = 'processed', response = ? WHERE event_id = ?").run(reason, eventId);
    return res.json({ ok: true, suppressed: true, reason });
  }

  const explicitConsent = req.body?.marketingConsent === true || req.body?.consent === true;
  if (eventType === 'subscriber.created' && explicitConsent) {
    if (db.prepare('SELECT email FROM email_suppressions WHERE email = ?').get(email)) {
      db.prepare("UPDATE email_webhook_events SET status = 'suppressed', response = ? WHERE event_id = ?").run('Existing suppression retained.', eventId);
      return res.json({ ok: true, suppressed: true });
    }
    const firstName = String(req.body?.customer?.firstName || req.body?.firstName || '').trim();
    const lastName = String(req.body?.customer?.lastName || req.body?.lastName || '').trim();
    if (subscriber) {
      db.prepare(`UPDATE email_subscribers SET first_name = ?, last_name = ?, active = 1, verified = 1, consent_status = 'subscribed',
        consent_at = ?, consent_source = ?, updated_at = ? WHERE id = ?`).run(firstName, lastName, now, `webhook:${eventType}`, now, subscriber.id);
    } else {
      const result = db.prepare(`INSERT INTO email_subscribers (email, first_name, last_name, segment, source, preferred_channel, active, verified,
        consent_status, consent_at, consent_source, created_at, updated_at) VALUES (?, ?, ?, ?, 'webhook', 'email', 1, 1, 'subscribed', ?, ?, ?, ?)`)
        .run(email, firstName, lastName, req.body?.segment || 'regular', now, `webhook:${eventType}`, now, now);
      subscriber = db.prepare('SELECT * FROM email_subscribers WHERE id = ?').get(result.lastInsertRowid);
    }
    enrollSubscriberForAutomations(subscriber.id, 'subscriber_added', `webhook:${eventId}`);
  } else if (eventType === 'order.paid' && subscriber?.consent_status === 'subscribed') {
    enrollSubscriberForAutomations(subscriber.id, 'post_visit', `order:${req.body?.orderId || eventId}`);
  } else if (subscriber?.consent_status === 'subscribed') {
    enrollSubscriberForAutomations(subscriber.id, eventType, eventId);
  }
  db.prepare("UPDATE email_webhook_events SET status = 'processed', response = ? WHERE event_id = ?")
    .run(subscriber ? 'Contact event accepted.' : 'No subscribed contact matched.', eventId);
  res.json({ ok: true, accepted: Boolean(subscriber), eventType });
});

function parseCsvRows(source) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const input = String(source || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"' && quoted && input[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(value); value = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = '';
    } else value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, String(cells[index] || '').trim()])));
}

router.post('/subscribe', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (req.body?.marketingConsent !== true) return res.status(400).json({ error: 'Marketing consent is required.' });
  if (!isSmtpConfigured()) return res.status(503).json({ error: 'Email confirmation is temporarily unavailable.' });

  const suppression = db.prepare('SELECT email FROM email_suppressions WHERE email = ?').get(email);
  if (suppression) return res.status(202).json({ ok: true, message: 'If this address is eligible, a confirmation email will be sent.' });
  const existing = db.prepare('SELECT * FROM email_subscribers WHERE lower(email) = ?').get(email);
  if (existing?.consent_status === 'subscribed' && existing.active) {
    return res.status(200).json({ ok: true, message: 'This address is already subscribed.' });
  }

  let subscriberId = existing?.id;
  const now = new Date().toISOString();
  if (subscriberId) {
    db.prepare(`UPDATE email_subscribers SET first_name = ?, last_name = ?, segment = ?, source = 'website', active = 0,
      verified = 0, consent_status = 'pending', consent_source = 'website_form', updated_at = ? WHERE id = ?`)
      .run(String(req.body?.firstName || existing.first_name || '').trim(), String(req.body?.lastName || existing.last_name || '').trim(),
        String(req.body?.segment || existing.segment || 'regular'), now, subscriberId);
  } else {
    const result = db.prepare(`INSERT INTO email_subscribers (email, first_name, last_name, segment, source, preferred_channel, active, verified,
      consent_status, consent_source, created_at, updated_at) VALUES (?, ?, ?, ?, 'website', 'email', 0, 0, 'pending', 'website_form', ?, ?)`)
      .run(email, String(req.body?.firstName || '').trim(), String(req.body?.lastName || '').trim(), String(req.body?.segment || 'regular'), now, now);
    subscriberId = result.lastInsertRowId;
  }

  try {
    const token = createEmailToken({ purpose: 'email-confirm', subscriberId, email }, '48h');
    const confirmationUrl = publicEmailUrl(`/api/email-marketing/confirm?token=${encodeURIComponent(token)}`);
    const name = escapeHtml(process.env.EMAIL_FROM_NAME || 'Wrap & Roll');
    await sendEmail({
      to: email,
      subject: `Confirm email updates from ${process.env.EMAIL_FROM_NAME || 'Wrap & Roll'}`,
      text: `Confirm that you want marketing emails from ${process.env.EMAIL_FROM_NAME || 'Wrap & Roll'} by opening: ${confirmationUrl}\n\nIf you did not request this, ignore this message.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Confirm your email</h2><p>Confirm that you want marketing emails from ${name}.</p><p><a href="${confirmationUrl}">Confirm subscription</a></p><p>If you did not request this, ignore this message.</p></div>`,
    });
    res.status(202).json({ ok: true, message: 'Check your inbox to confirm your subscription.' });
  } catch (error) {
    res.status(503).json({ error: error.message || 'Unable to send the confirmation email.' });
  }
});

router.get('/confirm', (req, res) => {
  try {
    const payload = verifyEmailToken(req.query.token, 'email-confirm');
    const token = escapeHtml(String(req.query.token));
    return res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm subscription</title></head><body style="font:16px Arial,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#292522"><h1>Confirm email updates</h1><p>Press the button to confirm you want marketing email from Wrap &amp; Roll.</p><form method="post" action="/api/email-marketing/confirm"><input type="hidden" name="token" value="${token}"><button style="padding:12px 18px;background:#ae002a;color:#fff;border:0;border-radius:8px">Confirm subscription</button></form></body></html>`);
  } catch {
    return res.status(400).type('html').send('<h1>This confirmation link is invalid or expired.</h1>');
  }
});

router.post('/confirm', (req, res) => {
  try {
    const payload = verifyEmailToken(req.body?.token || req.query.token, 'email-confirm');
    const email = normalizeEmail(payload.email);
    const now = new Date().toISOString();
    const result = db.prepare(`UPDATE email_subscribers SET active = 1, verified = 1, consent_status = 'subscribed', consent_at = ?,
      consent_source = 'double_opt_in', updated_at = ? WHERE id = ? AND lower(email) = ? AND consent_status = 'pending'`)
      .run(now, now, Number(payload.subscriberId), email);
    if (!result.changes) return res.status(409).type('html').send('<h1>This subscription is already confirmed or is no longer available.</h1>');
    enrollSubscriberForAutomations(Number(payload.subscriberId), 'subscriber_added', `subscriber:${payload.subscriberId}`);
    return res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Subscription confirmed</title></head><body style="font:16px Arial,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#292522"><h1>You’re subscribed.</h1><p>Thanks for confirming. You can unsubscribe from any marketing email.</p></body></html>');
  } catch {
    return res.status(400).type('html').send('<h1>This confirmation link is invalid or expired.</h1>');
  }
});

router.get('/unsubscribe', (req, res) => {
  try {
    verifyEmailToken(req.query.token, 'email-unsubscribe');
    const token = escapeHtml(String(req.query.token));
    return res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font:16px Arial,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#292522"><h1>Manage email preferences</h1><p>Confirm that you no longer want marketing emails from Wrap &amp; Roll.</p><form method="post" action="/api/email-marketing/unsubscribe"><input type="hidden" name="token" value="${token}"><button style="padding:12px 18px;background:#ae002a;color:#fff;border:0;border-radius:8px">Unsubscribe</button></form></body></html>`);
  } catch {
    return res.status(400).type('html').send('<h1>This unsubscribe link is invalid or expired.</h1>');
  }
});

router.post('/unsubscribe', (req, res) => {
  try {
    const payload = verifyEmailToken(req.body?.token || req.query.token, 'email-unsubscribe');
    const email = normalizeEmail(payload.email);
    const now = new Date().toISOString();
    db.prepare("UPDATE email_subscribers SET consent_status = 'unsubscribed', active = 0, unsubscribed_at = ?, updated_at = ? WHERE id = ? AND lower(email) = ?")
      .run(now, now, Number(payload.subscriberId), email);
    db.prepare('INSERT OR REPLACE INTO email_suppressions (email, reason, source, created_at) VALUES (?, ?, ?, ?)')
      .run(email, 'unsubscribe', 'email_link', now);
    db.prepare("UPDATE email_automation_enrollments SET status = 'unsubscribed', updated_at = ? WHERE subscriber_id = ? AND status = 'active'")
      .run(now, Number(payload.subscriberId));
    if (String(req.get('accept') || '').includes('text/html')) return res.type('html').send('<h1>You are unsubscribed.</h1><p>You will no longer receive marketing emails from Wrap &amp; Roll.</p>');
    return res.json({ ok: true, unsubscribed: true });
  } catch {
    return res.status(400).json({ error: 'Unsubscribe link is invalid or expired.' });
  }
});

router.get('/track/open/:id', (req, res) => {
  try {
    const payload = verifyEmailToken(req.query.token, 'email-tracking');
    db.prepare('UPDATE email_campaign_events SET opened_at = COALESCE(opened_at, ?) WHERE id = ? AND campaign_id = ? AND lower(email) = ?')
      .run(new Date().toISOString(), Number(req.params.id), Number(payload.campaignId), normalizeEmail(payload.email));
  } catch {}
  const gif = Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64');
  res.set({ 'Content-Type': 'image/gif', 'Content-Length': gif.length, 'Cache-Control': 'no-store, no-cache, must-revalidate' }).send(gif);
});

router.get('/track/click/:id', (req, res) => {
  try {
    const payload = verifyEmailToken(req.query.token, 'email-tracking');
    const target = new URL(String(req.query.url || ''));
    if (!['http:', 'https:'].includes(target.protocol)) return res.status(400).send('Invalid target URL.');
    db.prepare('UPDATE email_campaign_events SET clicked_at = COALESCE(clicked_at, ?) WHERE id = ? AND campaign_id = ? AND lower(email) = ?')
      .run(new Date().toISOString(), Number(req.params.id), Number(payload.campaignId), normalizeEmail(payload.email));
    return res.redirect(302, target.toString());
  } catch {
    return res.status(400).send('This tracked link is invalid or expired.');
  }
});

router.get('/overview', authMiddleware, requireRole(...adminRoles), (req, res) => {
  seedDefaultTemplates();
  seedDefaultAutomations();
  const subscriberSummary = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN consent_status = 'subscribed' AND active = 1 THEN 1 ELSE 0 END) AS consented, SUM(CASE WHEN segment = 'vip' AND active = 1 THEN 1 ELSE 0 END) AS vip, SUM(CASE WHEN consent_status = 'pending' THEN 1 ELSE 0 END) AS pending FROM email_subscribers").get();
  const campaignSummary = db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN status = "sent" THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN status = "draft" THEN 1 ELSE 0 END) AS drafts FROM email_campaigns').get();
  const lastCampaign = db.prepare('SELECT * FROM email_campaigns ORDER BY created_at DESC LIMIT 1').get();
  const delivery = db.prepare("SELECT COUNT(*) AS sent, SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened, SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed FROM email_campaign_events").get();
  const suppressions = db.prepare('SELECT COUNT(*) AS count FROM email_suppressions').get().count;

  res.json({
    subscribers: Number(subscriberSummary?.total || 0),
    activeSubscribers: Number(subscriberSummary?.active || 0),
    consentedSubscribers: Number(subscriberSummary?.consented || 0),
    pendingConsent: Number(subscriberSummary?.pending || 0),
    vipSubscribers: Number(subscriberSummary?.vip || 0),
    campaigns: Number(campaignSummary?.total || 0),
    sentCampaigns: Number(campaignSummary?.sent || 0),
    draftCampaigns: Number(campaignSummary?.drafts || 0),
    lastCampaign: lastCampaign ? {
      id: lastCampaign.id,
      name: lastCampaign.name,
      status: lastCampaign.status,
      createdAt: lastCampaign.created_at,
      sentCount: Number(lastCampaign.sent_count || 0),
    } : null,
    suppressions: Number(suppressions || 0),
    delivery: { sent: Number(delivery.sent || 0), opened: Number(delivery.opened || 0), clicked: Number(delivery.clicked || 0), failed: Number(delivery.failed || 0) },
    ...senderSummary(),
  });
});

router.get('/subscribers', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
  const params = [];
  const where = ['1 = 1'];
  if (req.query.search) {
    where.push('(lower(email) LIKE ? OR lower(first_name) LIKE ? OR lower(last_name) LIKE ?)');
    const term = `%${String(req.query.search).trim().toLowerCase()}%`;
    params.push(term, term, term);
  }
  if (req.query.segment && req.query.segment !== 'all') { where.push('segment = ?'); params.push(req.query.segment); }
  if (req.query.consent && req.query.consent !== 'all') { where.push('consent_status = ?'); params.push(req.query.consent); }
  if (req.query.active !== undefined) { where.push('active = ?'); params.push(req.query.active === 'true' ? 1 : 0); }
  const condition = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM email_subscribers WHERE ${condition}`).get(...params).count;
  const rows = db.prepare(`SELECT * FROM email_subscribers WHERE ${condition} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);
  res.json({ subscribers: rows.map((row) => ({ ...row, active: Boolean(row.active), tags: parseJson(row.tags, []), customFields: parseJson(row.custom_fields, {}) })), total: Number(total), page, pages: Math.ceil(total / limit) });
});

router.post('/subscribers', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const { email, firstName, lastName, segment = 'regular', source = 'manual', preferredChannel = 'email', customerId = null, tags = [], customFields = {}, consentConfirmed = false } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (consentConfirmed !== true) return res.status(400).json({ error: 'Confirm that this customer explicitly opted in before adding them to marketing.' });
  if (db.prepare('SELECT email FROM email_suppressions WHERE email = ?').get(normalizedEmail)) {
    db.prepare('DELETE FROM email_suppressions WHERE email = ?').run(normalizedEmail);
  }

  const existing = db.prepare('SELECT * FROM email_subscribers WHERE lower(email) = ?').get(normalizedEmail);
  const now = new Date().toISOString();
  if (existing) {
    db.prepare(`UPDATE email_subscribers SET first_name = ?, last_name = ?, segment = ?, source = ?, preferred_channel = ?, customer_id = ?, active = 1, verified = 1,
      consent_status = 'subscribed', consent_at = ?, consent_source = ?, unsubscribed_at = NULL, tags = ?, custom_fields = ?, updated_at = ? WHERE id = ?`).run(
      firstName || existing.first_name || '',
      lastName || existing.last_name || '',
      segment || existing.segment || 'regular',
      source || existing.source || 'manual',
      preferredChannel || existing.preferred_channel || 'email',
      customerId ?? existing.customer_id,
      now,
      source || 'manual',
      JSON.stringify(Array.isArray(tags) ? tags : []),
      JSON.stringify(customFields && typeof customFields === 'object' ? customFields : {}),
      now,
      existing.id,
    );
    const updated = db.prepare('SELECT * FROM email_subscribers WHERE id = ?').get(existing.id);
    return res.status(200).json(updated);
  }

  const result = db.prepare(`INSERT INTO email_subscribers
    (email, first_name, last_name, segment, source, preferred_channel, customer_id, active, verified, consent_status, consent_at, consent_source, tags, custom_fields, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'subscribed', ?, ?, ?, ?, ?, ?)`)
    .run(normalizedEmail, firstName || '', lastName || '', segment || 'regular', source || 'manual', preferredChannel || 'email', customerId || null, now, source || 'manual', JSON.stringify(Array.isArray(tags) ? tags : []), JSON.stringify(customFields && typeof customFields === 'object' ? customFields : {}), now, now);

  const row = db.prepare('SELECT * FROM email_subscribers WHERE id = ?').get(result.lastInsertRowid);
  enrollSubscriberForAutomations(row.id, 'subscriber_added', `subscriber:${row.id}`);
  res.status(201).json(row);
});

router.patch('/subscribers/:id', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const subscriber = db.prepare('SELECT * FROM email_subscribers WHERE id = ?').get(Number(req.params.id));
  if (!subscriber) return res.status(404).json({ error: 'Subscriber not found.' });
  const { firstName, lastName, segment, preferredChannel, tags, customFields, consentStatus, consentConfirmed } = req.body || {};
  const nextConsent = consentStatus || subscriber.consent_status;
  if (nextConsent === 'subscribed' && consentConfirmed !== true && subscriber.consent_status !== 'subscribed') {
    return res.status(400).json({ error: 'Explicit customer consent is required to resubscribe this address.' });
  }
  const now = new Date().toISOString();
  const unsubscribed = nextConsent === 'unsubscribed';
  db.prepare(`UPDATE email_subscribers SET first_name = ?, last_name = ?, segment = ?, preferred_channel = ?, tags = ?, custom_fields = ?, consent_status = ?,
    consent_at = CASE WHEN ? = 'subscribed' AND consent_status != 'subscribed' THEN ? ELSE consent_at END,
    unsubscribed_at = CASE WHEN ? = 'unsubscribed' THEN ? ELSE NULL END,
    active = CASE WHEN ? = 'subscribed' THEN 1 ELSE 0 END, updated_at = ? WHERE id = ?`)
    .run(firstName ?? subscriber.first_name, lastName ?? subscriber.last_name, segment ?? subscriber.segment, preferredChannel ?? subscriber.preferred_channel,
      JSON.stringify(Array.isArray(tags) ? tags : parseJson(subscriber.tags, [])), JSON.stringify(customFields && typeof customFields === 'object' ? customFields : parseJson(subscriber.custom_fields, {})),
      nextConsent, nextConsent, now, nextConsent, now, nextConsent, now, subscriber.id);
  if (unsubscribed) {
    db.prepare('INSERT OR REPLACE INTO email_suppressions (email, reason, source, created_at) VALUES (?, ?, ?, ?)')
      .run(subscriber.email, 'unsubscribe', 'admin', now);
  } else if (nextConsent === 'subscribed') {
    db.prepare('DELETE FROM email_suppressions WHERE email = ?').run(subscriber.email.toLowerCase());
  }
  res.json(db.prepare('SELECT * FROM email_subscribers WHERE id = ?').get(subscriber.id));
});

router.post('/subscribers/import', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const csv = String(req.body?.csv || '');
  if (!csv || csv.length > 2_000_000) return res.status(400).json({ error: 'Upload a CSV file smaller than 2 MB.' });
  const rows = parseCsvRows(csv);
  if (rows.length > 2000) return res.status(400).json({ error: 'Import up to 2,000 contacts per upload.' });
  let imported = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    const consent = /^(yes|true|1|subscribed|opted[- ]?in)$/i.test(row.consent || row.marketing_consent || row.consent_status || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !consent) { skipped += 1; continue; }
    const suppressed = db.prepare('SELECT email FROM email_suppressions WHERE email = ?').get(email);
    if (suppressed && !consent) { skipped += 1; continue; }
    if (suppressed) db.prepare('DELETE FROM email_suppressions WHERE email = ?').run(email);
    const existing = db.prepare('SELECT id FROM email_subscribers WHERE lower(email) = ?').get(email);
    if (existing) {
      db.prepare(`UPDATE email_subscribers SET first_name = ?, last_name = ?, segment = ?, source = ?, preferred_channel = ?, active = 1,
        consent_status = 'subscribed', consent_at = ?, consent_source = ?, unsubscribed_at = NULL, updated_at = ? WHERE id = ?`)
        .run(row.first_name || '', row.last_name || '', row.segment || 'regular', 'csv_import', row.preferred_channel || 'email', now, row.consent_source || 'csv_import', now, existing.id);
    } else {
      const result = db.prepare(`INSERT INTO email_subscribers (email, first_name, last_name, segment, source, preferred_channel, active, verified,
        consent_status, consent_at, consent_source, created_at, updated_at) VALUES (?, ?, ?, ?, 'csv_import', ?, 1, 1, 'subscribed', ?, ?, ?, ?)`)
        .run(email, row.first_name || '', row.last_name || '', row.segment || 'regular', row.preferred_channel || 'email', now, row.consent_source || 'csv_import', now, now);
      enrollSubscriberForAutomations(result.lastInsertRowid, 'subscriber_added', `subscriber:${result.lastInsertRowid}`);
    }
    imported += 1;
  }
  res.json({ imported, skipped, total: rows.length });
});

router.get('/subscribers/export', authMiddleware, requireRole(...adminRoles), (_req, res) => {
  const rows = db.prepare('SELECT email, first_name, last_name, segment, source, preferred_channel, consent_status, consent_at, consent_source, tags FROM email_subscribers ORDER BY created_at DESC').all();
  const columns = ['email', 'first_name', 'last_name', 'segment', 'source', 'preferred_channel', 'consent_status', 'consent_at', 'consent_source', 'tags'];
  const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="wrap-roll-email-subscribers.csv"');
  res.send(`\uFEFF${csv}`);
});

router.get('/suppressions', authMiddleware, requireRole(...adminRoles), (_req, res) => {
  res.json(db.prepare('SELECT * FROM email_suppressions ORDER BY created_at DESC').all());
});

router.post('/suppressions', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const now = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO email_suppressions (email, reason, source, created_at) VALUES (?, ?, ?, ?)')
    .run(email, String(req.body?.reason || 'manual').slice(0, 80), 'admin', now);
  db.prepare("UPDATE email_subscribers SET active = 0, consent_status = 'unsubscribed', unsubscribed_at = ?, updated_at = ? WHERE lower(email) = ?")
    .run(now, now, email);
  res.status(201).json({ email, reason: req.body?.reason || 'manual', createdAt: now });
});

router.delete('/suppressions/:email', authMiddleware, requireRole(...adminRoles), (req, res) => {
  if (req.body?.consentConfirmed !== true) return res.status(400).json({ error: 'Confirm that the customer has explicitly opted back in before removing a suppression.' });
  const email = normalizeEmail(req.params.email);
  const subscriber = db.prepare('SELECT id FROM email_subscribers WHERE lower(email) = ?').get(email);
  if (!subscriber) return res.status(404).json({ error: 'Subscriber not found. Re-add the subscriber with explicit consent first.' });
  const now = new Date().toISOString();
  db.prepare('DELETE FROM email_suppressions WHERE email = ?').run(email);
  db.prepare("UPDATE email_subscribers SET active = 1, consent_status = 'subscribed', consent_at = ?, consent_source = 'admin_reconsent', unsubscribed_at = NULL, updated_at = ? WHERE id = ?")
    .run(now, now, subscriber.id);
  res.json({ ok: true, email });
});

router.get('/smtp/status', authMiddleware, requireRole(...adminRoles), (_req, res) => {
  res.json({ ...senderSummary(), postalAddressConfigured: Boolean(process.env.EMAIL_POSTAL_ADDRESS) });
});

router.get('/deliverability', authMiddleware, requireRole(...adminRoles), async (_req, res) => {
  const sender = senderSummary();
  const domain = String(sender.address.split('@')[1] || '').toLowerCase();
  const check = async (task) => { try { return await task(); } catch { return null; } };
  if (!domain) return res.json({ domain: '', smtpConfigured: sender.smtpConfigured, checks: [] });

  const [txtRecords, dmarcRecords, mxRecords, dkimRecords, ptrRecords] = await Promise.all([
    check(() => resolveTxt(domain)),
    check(() => resolveTxt(`_dmarc.${domain}`)),
    check(() => resolveMx(domain)),
    process.env.EMAIL_DKIM_SELECTOR ? check(() => resolveTxt(`${process.env.EMAIL_DKIM_SELECTOR}._domainkey.${domain}`)) : Promise.resolve(null),
    process.env.EMAIL_SENDING_IP ? check(() => reverse(process.env.EMAIL_SENDING_IP)) : Promise.resolve(null),
  ]);
  const flattenedTxt = (records) => (records || []).map((record) => record.join(''));
  const spf = flattenedTxt(txtRecords).find((record) => /^v=spf1\b/i.test(record));
  const dmarc = flattenedTxt(dmarcRecords).find((record) => /^v=dmarc1\b/i.test(record));
  const dkim = flattenedTxt(dkimRecords).find((record) => record.includes('p='));
  const expectedHelo = String(process.env.EMAIL_HELO_DOMAIN || '').toLowerCase();
  const ptr = (ptrRecords || []).map((record) => record.toLowerCase());
  res.json({
    domain,
    smtpConfigured: sender.smtpConfigured,
    sender: { name: sender.name, address: sender.address, replyTo: sender.replyTo },
    checks: [
      { id: 'smtp', label: 'SMTP relay', status: sender.smtpConfigured ? 'configured' : 'missing', detail: sender.smtpConfigured ? 'Credentials are present; run a test send to verify connectivity.' : 'Configure host, user, and password in Railway.' },
      { id: 'postal', label: 'Postal address', status: process.env.EMAIL_POSTAL_ADDRESS ? 'configured' : 'missing', detail: process.env.EMAIL_POSTAL_ADDRESS || 'A real business postal address is required in marketing footers.' },
      { id: 'spf', label: 'SPF', status: spf ? 'found' : 'missing', record: spf || null, hostname: domain },
      { id: 'dkim', label: 'DKIM', status: dkim ? 'found' : 'missing', record: dkim || null, hostname: process.env.EMAIL_DKIM_SELECTOR ? `${process.env.EMAIL_DKIM_SELECTOR}._domainkey.${domain}` : null, detail: process.env.EMAIL_DKIM_SELECTOR ? undefined : 'Set EMAIL_DKIM_SELECTOR to the selector published by your mail provider.' },
      { id: 'dmarc', label: 'DMARC', status: dmarc ? 'found' : 'missing', record: dmarc || null, hostname: `_dmarc.${domain}` },
      { id: 'mx', label: 'MX', status: mxRecords?.length ? 'found' : 'missing', records: mxRecords || [], hostname: domain },
      { id: 'ptr', label: 'Reverse DNS (PTR)', status: expectedHelo && ptr.includes(expectedHelo) ? 'matched' : (process.env.EMAIL_SENDING_IP ? 'check' : 'not_applicable'), records: ptr, detail: process.env.EMAIL_SENDING_IP ? `Expected ${expectedHelo || 'EMAIL_HELO_DOMAIN to be configured'}.` : 'The SMTP provider manages the sending IP and PTR record.' },
    ],
  });
});

router.post('/smtp/test', authMiddleware, requireRole(...adminRoles), async (req, res) => {
  const to = normalizeEmail(req.body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'Enter a valid test-recipient email.' });
  try {
    await verifySmtpTransport();
    const result = await sendEmail({ to, subject: 'Wrap & Roll SMTP test', text: 'Your Wrap & Roll email sender is configured and can deliver mail.', html: '<p>Your Wrap &amp; Roll email sender is configured and can deliver mail.</p>' });
    res.json({ ok: true, recipient: to, messageId: result.messageId });
  } catch (error) {
    res.status(503).json({ error: error.message || 'SMTP verification or test delivery failed.' });
  }
});

router.get('/templates', authMiddleware, requireRole(...adminRoles), (_req, res) => {
  seedDefaultTemplates();
  res.json(db.prepare('SELECT * FROM email_templates ORDER BY is_system DESC, updated_at DESC').all());
});

router.post('/templates', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const name = String(req.body?.name || '').trim();
  const subject = String(req.body?.subject || '').trim();
  const bodyText = String(req.body?.bodyText || '').trim();
  if (!name || !subject || !bodyText) return res.status(400).json({ error: 'Name, subject, and text content are required.' });
  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO email_templates (name, category, subject, preheader, html_body, body_text, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
    .run(name, req.body?.category || 'marketing', subject, req.body?.preheader || '', req.body?.htmlBody || plainTextToHtml(bodyText), bodyText, now, now);
  res.status(201).json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/templates/:id', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const template = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(Number(req.params.id));
  if (!template) return res.status(404).json({ error: 'Template not found.' });
  const now = new Date().toISOString();
  db.prepare('UPDATE email_templates SET name = ?, category = ?, subject = ?, preheader = ?, html_body = ?, body_text = ?, updated_at = ? WHERE id = ?')
    .run(req.body?.name ?? template.name, req.body?.category ?? template.category, req.body?.subject ?? template.subject, req.body?.preheader ?? template.preheader,
      req.body?.htmlBody ?? template.html_body, req.body?.bodyText ?? template.body_text, now, template.id);
  res.json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(template.id));
});

router.delete('/templates/:id', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const template = db.prepare('SELECT id, is_system FROM email_templates WHERE id = ?').get(Number(req.params.id));
  if (!template) return res.status(404).json({ error: 'Template not found.' });
  if (template.is_system) return res.status(409).json({ error: 'Built-in templates cannot be deleted.' });
  db.prepare('DELETE FROM email_templates WHERE id = ?').run(template.id);
  res.json({ ok: true });
});

router.get('/campaigns', authMiddleware, requireRole(...adminRoles), (_req, res) => {
  const campaigns = db.prepare(`SELECT c.*,
    (SELECT COUNT(*) FROM email_campaign_events e WHERE e.campaign_id = c.id AND e.status = 'sent') AS delivered,
    (SELECT COUNT(*) FROM email_campaign_events e WHERE e.campaign_id = c.id AND e.opened_at IS NOT NULL) AS opened,
    (SELECT COUNT(*) FROM email_campaign_events e WHERE e.campaign_id = c.id AND e.clicked_at IS NOT NULL) AS clicked,
    (SELECT COUNT(*) FROM email_campaign_events e WHERE e.campaign_id = c.id AND e.status = 'failed') AS failed
    FROM email_campaigns c ORDER BY COALESCE(c.scheduled_at, c.created_at) DESC`).all();
  res.json(campaigns);
});

router.post('/campaigns', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const name = String(req.body?.name || '').trim();
  const type = String(req.body?.type || 'newsletter').trim();
  const template = req.body?.templateId ? db.prepare('SELECT * FROM email_templates WHERE id = ?').get(Number(req.body.templateId)) : null;
  const subject = String(req.body?.subject || template?.subject || buildCampaignSubject(type)).trim();
  const body = String(req.body?.body || template?.body_text || buildCampaignBody(type, { offer: req.body?.offer } )).trim();
  const htmlBody = String(req.body?.htmlBody || template?.html_body || plainTextToHtml(body));
  const scheduleDate = req.body?.scheduleFor ? new Date(req.body.scheduleFor) : null;
  if (!name || !subject || !body) return res.status(400).json({ error: 'Campaign name, subject, and message are required.' });
  if (req.body?.scheduleFor && (!scheduleDate || Number.isNaN(scheduleDate.getTime()) || scheduleDate <= new Date())) {
    return res.status(400).json({ error: 'Choose a future send time.' });
  }
  const now = new Date().toISOString();
  const status = scheduleDate ? 'scheduled' : 'draft';
  const result = db.prepare(`INSERT INTO email_campaigns
    (name, subject, type, segment, channel, template, offer, payload, body, html_body, preheader, status, scheduled_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'email', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, subject, type, req.body?.segment || 'all', template?.name || req.body?.template || 'custom', req.body?.offer || '',
      JSON.stringify({ templateId: template?.id || null, utm: req.body?.utm !== false }), body, htmlBody, req.body?.preheader || '', status,
      scheduleDate?.toISOString() || null, now, now);
  res.status(201).json(db.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/campaigns/:id', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const campaign = db.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(Number(req.params.id));
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  if (!['draft', 'scheduled', 'failed'].includes(campaign.status)) return res.status(409).json({ error: 'Only draft, scheduled, or failed campaigns can be edited.' });
  const scheduleProvided = Object.hasOwn(req.body || {}, 'scheduleFor');
  const scheduleDate = scheduleProvided && req.body.scheduleFor ? new Date(req.body.scheduleFor) : null;
  if (scheduleProvided && req.body.scheduleFor && (Number.isNaN(scheduleDate?.getTime()) || scheduleDate <= new Date())) {
    return res.status(400).json({ error: 'Choose a future send time.' });
  }
  const scheduledAt = scheduleProvided ? scheduleDate?.toISOString() || null : campaign.scheduled_at;
  const nextStatus = scheduledAt ? 'scheduled' : 'draft';
  const now = new Date().toISOString();
  db.prepare(`UPDATE email_campaigns SET name = ?, subject = ?, segment = ?, offer = ?, body = ?, html_body = ?, preheader = ?, scheduled_at = ?,
    status = ?, updated_at = ? WHERE id = ?`)
    .run(req.body?.name ?? campaign.name, req.body?.subject ?? campaign.subject, req.body?.segment ?? campaign.segment, req.body?.offer ?? campaign.offer,
      req.body?.body ?? campaign.body, req.body?.htmlBody ?? campaign.html_body, req.body?.preheader ?? campaign.preheader,
      scheduledAt, nextStatus, now, campaign.id);
  res.json(db.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(campaign.id));
});

router.delete('/campaigns/:id', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const campaign = db.prepare('SELECT id, status FROM email_campaigns WHERE id = ?').get(Number(req.params.id));
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  if (!['draft', 'scheduled', 'failed'].includes(campaign.status)) return res.status(409).json({ error: 'Sent or actively sending campaigns cannot be deleted.' });
  db.prepare('DELETE FROM email_campaigns WHERE id = ?').run(campaign.id);
  res.json({ ok: true });
});

router.post('/campaigns/:id/test', authMiddleware, requireRole(...adminRoles), async (req, res) => {
  try {
    res.json({ ok: true, ...(await sendCampaignTest(req.params.id, req.body?.email)) });
  } catch (error) {
    res.status(503).json({ error: error.message || 'Test email delivery failed.' });
  }
});

router.post('/campaigns/:id/send', authMiddleware, requireRole(...adminRoles), (req, res) => {
  if (!isSmtpConfigured()) return res.status(503).json({ error: 'SMTP is not configured. No email was sent.' });
  if (!process.env.EMAIL_POSTAL_ADDRESS) return res.status(503).json({ error: 'Set EMAIL_POSTAL_ADDRESS before sending marketing campaigns.' });
  const campaign = db.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(Number(req.params.id));
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  if (!['draft', 'failed'].includes(campaign.status)) return res.status(409).json({ error: `Campaign is ${campaign.status} and cannot be queued.` });
  const subscribers = db.prepare('SELECT * FROM email_subscribers WHERE active = 1').all();
  const suppressions = new Set(db.prepare('SELECT email FROM email_suppressions').all().map((row) => row.email.toLowerCase()));
  const eligible = selectAudience(subscribers, campaign.segment, campaign.channel, suppressions);
  if (!eligible.length) return res.status(409).json({ error: 'No eligible subscribers have active marketing consent for this audience.' });
  const now = new Date().toISOString();
  db.prepare('UPDATE email_campaigns SET status = ?, scheduled_at = NULL, updated_at = ? WHERE id = ?').run('queued', now, campaign.id);
  res.status(202).json({ ok: true, campaignId: campaign.id, status: 'queued' });
});

router.get('/campaigns/:id/events', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const campaignId = Number(req.params.id);
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
  const total = db.prepare('SELECT COUNT(*) AS count FROM email_campaign_events WHERE campaign_id = ?').get(campaignId).count;
  const events = db.prepare('SELECT * FROM email_campaign_events WHERE campaign_id = ? ORDER BY sent_at DESC LIMIT ? OFFSET ?')
    .all(campaignId, limit, (page - 1) * limit);
  res.json({ events, total: Number(total), page });
});

router.get('/deliveries', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 100)));
  const campaignEvents = db.prepare(`SELECT e.id, e.email, e.status, e.sent_at AS occurred_at, e.response, e.message_id,
    c.name AS source_name, 'campaign' AS source_type FROM email_campaign_events e
    LEFT JOIN email_campaigns c ON c.id = e.campaign_id ORDER BY e.sent_at DESC LIMIT ?`).all(limit);
  const automationEvents = db.prepare(`SELECT e.id, e.email, e.status, e.sent_at AS occurred_at, e.response, e.message_id,
    a.name AS source_name, 'automation' AS source_type FROM email_automation_events e
    LEFT JOIN email_automations a ON a.id = e.automation_id ORDER BY e.sent_at DESC LIMIT ?`).all(limit);
  res.json([...campaignEvents, ...automationEvents].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, limit));
});

router.get('/automations', authMiddleware, requireRole(...adminRoles), (_req, res) => {
  seedDefaultTemplates();
  seedDefaultAutomations();
  const automations = db.prepare('SELECT * FROM email_automations ORDER BY created_at DESC').all().map((automation) => ({
    ...automation,
    config: parseJson(automation.config, {}),
    steps: db.prepare('SELECT * FROM email_automation_steps WHERE automation_id = ? ORDER BY step_order').all(automation.id),
    activeEnrollments: db.prepare("SELECT COUNT(*) AS count FROM email_automation_enrollments WHERE automation_id = ? AND status = 'active'").get(automation.id).count,
  }));
  res.json(automations);
});

router.post('/automations', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const name = String(req.body?.name || '').trim();
  const triggerType = String(req.body?.triggerType || '').trim();
  const allowedTriggers = new Set(['subscriber_added', 'post_visit', 'birthday', 'winback', 'reservation.created', 'order.created', 'order.abandoned', 'catering.inquiry', 'giftcard.purchased']);
  const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
  if (!name || !allowedTriggers.has(triggerType) || !steps.length) return res.status(400).json({ error: 'Name, supported trigger, and at least one sequence step are required.' });
  const now = new Date().toISOString();
  const create = db.transaction(() => {
    const result = db.prepare('INSERT INTO email_automations (name, trigger_type, status, segment, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, triggerType, req.body?.status === 'active' ? 'active' : 'paused', req.body?.segment || 'all', JSON.stringify(req.body?.config || {}), now, now);
    const insertStep = db.prepare('INSERT INTO email_automation_steps (automation_id, step_order, delay_minutes, template_id, subject, body_text) VALUES (?, ?, ?, ?, ?, ?)');
    steps.slice(0, 12).forEach((step, index) => {
      const template = step.templateId ? db.prepare('SELECT * FROM email_templates WHERE id = ?').get(Number(step.templateId)) : null;
      insertStep.run(result.lastInsertRowid, index, Math.max(0, Number(step.delayMinutes || 0)), template?.id || null,
        String(step.subject || template?.subject || '').trim(), String(step.bodyText || template?.body_text || '').trim());
    });
    return result.lastInsertRowid;
  });
  const id = create();
  res.status(201).json(db.prepare('SELECT * FROM email_automations WHERE id = ?').get(id));
});

router.patch('/automations/:id', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const automation = db.prepare('SELECT * FROM email_automations WHERE id = ?').get(Number(req.params.id));
  if (!automation) return res.status(404).json({ error: 'Automation not found.' });
  const status = req.body?.status;
  if (status && !['active', 'paused', 'draft'].includes(status)) return res.status(400).json({ error: 'Invalid automation status.' });
  db.prepare('UPDATE email_automations SET name = ?, status = ?, segment = ?, config = ?, updated_at = ? WHERE id = ?')
    .run(req.body?.name ?? automation.name, status ?? automation.status, req.body?.segment ?? automation.segment,
      JSON.stringify(req.body?.config ?? parseJson(automation.config, {})), new Date().toISOString(), automation.id);
  res.json(db.prepare('SELECT * FROM email_automations WHERE id = ?').get(automation.id));
});

router.delete('/automations/:id', authMiddleware, requireRole(...adminRoles), (req, res) => {
  const automation = db.prepare('SELECT id, status FROM email_automations WHERE id = ?').get(Number(req.params.id));
  if (!automation) return res.status(404).json({ error: 'Automation not found.' });
  if (automation.status === 'active') return res.status(409).json({ error: 'Pause an automation before deleting it.' });
  db.prepare('DELETE FROM email_automations WHERE id = ?').run(automation.id);
  res.json({ ok: true });
});

export default router;
