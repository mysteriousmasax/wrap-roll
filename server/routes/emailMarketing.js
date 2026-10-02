import { Router } from 'express';
import nodemailer from 'nodemailer';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { buildCampaignBody, buildCampaignSubject, selectAudience } from '../utils/emailCampaigns.js';

const router = Router();

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function createTransport() {
  const host = process.env.EMAIL_SMTP_HOST;
  const port = Number(process.env.EMAIL_SMTP_PORT || 587);
  const secure = String(process.env.EMAIL_SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.EMAIL_SMTP_USER || '';
  const pass = process.env.EMAIL_SMTP_PASS || '';

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function resolveSender() {
  return {
    fromName: process.env.EMAIL_FROM_NAME || 'Wrap & Roll',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER || 'noreply@wrapandrolltz.com',
  };
}

router.get('/overview', authMiddleware, (req, res) => {
  const subscriberSummary = db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN segment = "vip" THEN 1 ELSE 0 END) AS vip, SUM(CASE WHEN segment = "inactive" THEN 1 ELSE 0 END) AS inactive FROM email_subscribers').get();
  const campaignSummary = db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN status = "sent" THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN status = "draft" THEN 1 ELSE 0 END) AS drafts FROM email_campaigns').get();
  const lastCampaign = db.prepare('SELECT * FROM email_campaigns ORDER BY created_at DESC LIMIT 1').get();

  res.json({
    subscribers: Number(subscriberSummary?.total || 0),
    activeSubscribers: Number(subscriberSummary?.active || 0),
    vipSubscribers: Number(subscriberSummary?.vip || 0),
    inactiveSubscribers: Number(subscriberSummary?.inactive || 0),
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
    smtpConfigured: Boolean(process.env.EMAIL_SMTP_HOST && process.env.EMAIL_SMTP_USER && process.env.EMAIL_SMTP_PASS),
  });
});

router.get('/subscribers', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM email_subscribers ORDER BY created_at DESC').all();
  res.json(rows.map((row) => ({
    ...row,
    active: Boolean(row.active),
  })));
});

router.post('/subscribers', authMiddleware, (req, res) => {
  const { email, firstName, lastName, segment = 'regular', source = 'manual', preferredChannel = 'email', customerId = null } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  const existing = db.prepare('SELECT * FROM email_subscribers WHERE lower(email) = ?').get(normalizedEmail);
  if (existing) {
    db.prepare('UPDATE email_subscribers SET first_name = ?, last_name = ?, segment = ?, source = ?, preferred_channel = ?, customer_id = ?, updated_at = ? WHERE id = ?').run(
      firstName || existing.first_name || '',
      lastName || existing.last_name || '',
      segment || existing.segment || 'regular',
      source || existing.source || 'manual',
      preferredChannel || existing.preferred_channel || 'email',
      customerId ?? existing.customer_id,
      new Date().toISOString(),
      existing.id,
    );
    const updated = db.prepare('SELECT * FROM email_subscribers WHERE id = ?').get(existing.id);
    return res.status(200).json(updated);
  }

  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO email_subscribers (email, first_name, last_name, segment, source, preferred_channel, customer_id, active, verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)')
    .run(normalizedEmail, firstName || '', lastName || '', segment || 'regular', source || 'manual', preferredChannel || 'email', customerId || null, now, now);

  const row = db.prepare('SELECT * FROM email_subscribers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.get('/campaigns', authMiddleware, (req, res) => {
  const campaigns = db.prepare('SELECT * FROM email_campaigns ORDER BY created_at DESC').all();
  res.json(campaigns);
});

router.post('/campaigns', authMiddleware, requireRole('admin', 'manager', 'executive'), (req, res) => {
  const { name, subject, type = 'welcome', segment = 'all', channel = 'email', offer = '15% off your next order', body, scheduleFor = null, template = 'standard' } = req.body || {};
  const safeName = String(name || `${buildCampaignSubject(type)} campaign`).trim();
  const safeSubject = String(subject || buildCampaignSubject(type)).trim();
  const now = new Date().toISOString();
  const payload = JSON.stringify({
    type,
    segment,
    channel,
    offer,
    template,
    scheduleFor,
  });

  const result = db.prepare('INSERT INTO email_campaigns (name, subject, type, segment, channel, template, offer, payload, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(safeName, safeSubject, type, segment, channel, template, offer, payload, body || buildCampaignBody(type, { offer }), 'draft', now, now);

  const campaign = db.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(campaign);
});

router.post('/campaigns/:id/send', authMiddleware, requireRole('admin', 'manager', 'executive'), async (req, res) => {
  const campaign = db.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(Number(req.params.id));
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const subscribers = db.prepare('SELECT * FROM email_subscribers WHERE active = 1 ORDER BY created_at DESC').all();
  const targetSubscribers = selectAudience(subscribers, campaign.segment, campaign.channel);
  const transport = createTransport();
  const dryRun = !transport;
  const sender = resolveSender();

  let sent = 0;
  const results = [];

  for (const subscriber of targetSubscribers) {
    const firstName = (subscriber.first_name || subscriber.email.split('@')[0] || 'friend').trim();
    const subject = String(campaign.subject || buildCampaignSubject(campaign.type || 'welcome')).trim();
    const body = String(campaign.body || buildCampaignBody(campaign.type || 'welcome', { firstName, offer: campaign.offer || '15% off your next order' })).trim();

    try {
      if (!dryRun) {
        await transport.sendMail({
          from: `${sender.fromName} <${sender.fromAddress}>`,
          to: subscriber.email,
          subject,
          text: body,
          html: body.replace(/\n/g, '<br />'),
        });
      }

      results.push({ email: subscriber.email, status: dryRun ? 'dry-run' : 'sent' });
      sent += 1;
      db.prepare('INSERT INTO email_campaign_events (campaign_id, subscriber_id, email, status, sent_at, response) VALUES (?, ?, ?, ?, ?, ?)')
        .run(campaign.id, subscriber.id, subscriber.email, dryRun ? 'dry-run' : 'sent', new Date().toISOString(), dryRun ? 'Dry-run preview' : 'Delivered via SMTP');
    } catch (error) {
      results.push({ email: subscriber.email, status: 'failed', reason: error.message || 'Unable to deliver' });
      db.prepare('INSERT INTO email_campaign_events (campaign_id, subscriber_id, email, status, sent_at, response) VALUES (?, ?, ?, ?, ?, ?)')
        .run(campaign.id, subscriber.id, subscriber.email, 'failed', new Date().toISOString(), error.message || 'Unable to deliver');
    }
  }

  db.prepare('UPDATE email_campaigns SET status = ?, sent_count = ?, total_target = ?, updated_at = ? WHERE id = ?').run(dryRun ? 'draft' : 'sent', sent, targetSubscribers.length, new Date().toISOString(), campaign.id);

  res.json({
    ok: true,
    campaignId: campaign.id,
    dryRun,
    sentCount: sent,
    totalTarget: targetSubscribers.length,
    mode: dryRun ? 'preview' : 'live',
    results,
  });
});

export default router;
