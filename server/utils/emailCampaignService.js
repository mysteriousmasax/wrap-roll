import db from '../db/database.js';
import { escapeEmailHtml, plainTextToHtml, renderEmailTemplate, selectAudience } from './emailCampaigns.js';
import { createEmailToken, createEmailTransport, getEmailProvider, isEmailDeliveryConfigured, publicEmailUrl, resolveEmailSender, sendEmail } from './emailDelivery.js';

function campaignFooter(unsubscribeUrl) {
  return `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e7e2dc;color:#716a64;font:12px Arial,sans-serif"><p>${escapeEmailHtml(process.env.EMAIL_POSTAL_ADDRESS || 'Wrap & Roll, Dar es Salaam, Tanzania')}</p><p>You received this marketing email because you opted in to updates from Wrap &amp; Roll. <a href="${unsubscribeUrl}">Unsubscribe</a></p></div>`;
}

function personalize(value, subscriber, campaign, unsubscribeUrl) {
  return renderEmailTemplate(value, {
    firstName: subscriber.first_name,
    lastName: subscriber.last_name,
    email: subscriber.email,
    restaurantName: process.env.EMAIL_FROM_NAME || 'Wrap & Roll',
    offer: campaign.offer,
    unsubscribeUrl,
  });
}

function personalizeHtml(value, subscriber, campaign, unsubscribeUrl) {
  return renderEmailTemplate(value, {
    firstName: escapeEmailHtml(subscriber.first_name || 'friend'),
    lastName: escapeEmailHtml(subscriber.last_name || ''),
    email: escapeEmailHtml(subscriber.email || ''),
    restaurantName: escapeEmailHtml(process.env.EMAIL_FROM_NAME || 'Wrap & Roll'),
    offer: escapeEmailHtml(campaign.offer || ''),
    unsubscribeUrl,
  });
}

function addTracking(html, eventId, token) {
  const clickBase = publicEmailUrl(`/api/email-marketing/track/click/${eventId}`);
  const trackedLinks = html.replace(/href=(['"])(https?:\/\/[^'"]+)\1/gi, (_match, quote, url) => (
    `href=${quote}${clickBase}?token=${encodeURIComponent(token)}&url=${encodeURIComponent(url)}${quote}`
  ));
  const openUrl = publicEmailUrl(`/api/email-marketing/track/open/${eventId}?token=${encodeURIComponent(token)}`);
  return `${trackedLinks}<img src="${openUrl}" width="1" height="1" alt="" style="display:none!important" />`;
}

export async function sendCampaignTest(campaignId, recipient) {
  if (!isEmailDeliveryConfigured()) throw new Error('Configure Resend or SMTP before testing delivery.');
  const campaign = db.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(Number(campaignId));
  if (!campaign) throw new Error('Campaign not found.');
  const email = String(recipient || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid test recipient email.');

  const unsubscribeUrl = publicEmailUrl('/unsubscribe?test=1');
  const subscriber = { email, first_name: 'there', last_name: '' };
  const subject = `[TEST] ${personalize(campaign.subject, subscriber, campaign, unsubscribeUrl)}`;
  const text = `${personalize(campaign.body || '', subscriber, campaign, unsubscribeUrl)}\n\nThis is a test message; campaign recipients were not contacted.`;
  const htmlSource = campaign.html_body || plainTextToHtml(campaign.body || '');
  const html = `${personalize(htmlSource, subscriber, campaign, unsubscribeUrl)}<p>This is a test message; campaign recipients were not contacted.</p>`;
  const transport = createEmailTransport();
  const result = await sendEmail({ to: email, subject, text, html, transport });
  return { recipient: email, messageId: result.messageId };
}

export async function processEmailCampaign(campaignId) {
  if (!isEmailDeliveryConfigured()) throw new Error('Configure Resend or SMTP before sending.');
  if (!process.env.EMAIL_POSTAL_ADDRESS) throw new Error('Set EMAIL_POSTAL_ADDRESS before sending marketing campaigns.');
  const campaign = db.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(Number(campaignId));
  if (!campaign || !['queued', 'scheduled', 'sending'].includes(campaign.status)) return null;

  const subscribers = db.prepare('SELECT * FROM email_subscribers WHERE active = 1').all();
  const suppressions = new Set(db.prepare('SELECT email FROM email_suppressions').all().map((row) => row.email.toLowerCase()));
  const audience = selectAudience(subscribers, campaign.segment, campaign.channel, suppressions);
  const deliveredEmails = new Set(db.prepare("SELECT lower(email) AS email FROM email_campaign_events WHERE campaign_id = ? AND status = 'sent'").all(campaign.id).map((row) => row.email));
  const pendingAudience = audience.filter((subscriber) => !deliveredEmails.has(subscriber.email.toLowerCase()));
  const now = new Date().toISOString();
  db.prepare('UPDATE email_campaigns SET status = ?, total_target = ?, updated_at = ? WHERE id = ?')
    .run('sending', audience.length, now, campaign.id);

  if (!audience.length) {
    db.prepare('UPDATE email_campaigns SET status = ?, sent_count = 0, updated_at = ? WHERE id = ?')
      .run('failed', now, campaign.id);
    throw new Error('No eligible subscribers have active marketing consent for this audience.');
  }

  const transport = createEmailTransport();
  let sent = deliveredEmails.size;
  let failed = 0;
  for (const subscriber of pendingAudience) {
    const unsubscribeToken = createEmailToken({
      purpose: 'email-unsubscribe',
      subscriberId: subscriber.id,
      email: subscriber.email,
    });
    const unsubscribeUrl = publicEmailUrl(`/api/email-marketing/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`);
    const trackingToken = createEmailToken({ purpose: 'email-tracking', campaignId: campaign.id, email: subscriber.email });
    const subject = personalize(campaign.subject, subscriber, campaign, unsubscribeUrl);
    const text = `${personalize(campaign.body || '', subscriber, campaign, unsubscribeUrl)}\n\nUnsubscribe: ${unsubscribeUrl}`;
    const sourceHtml = campaign.html_body || plainTextToHtml(campaign.body || '');
    const html = addTracking(`${personalizeHtml(sourceHtml, subscriber, campaign, unsubscribeUrl)}${campaignFooter(unsubscribeUrl)}`, 0, trackingToken);
    const createdAt = new Date().toISOString();
    const event = db.prepare('INSERT INTO email_campaign_events (campaign_id, subscriber_id, email, status, sent_at, metadata) VALUES (?, ?, ?, ?, ?, ?)')
      .run(campaign.id, subscriber.id, subscriber.email, 'sending', createdAt, JSON.stringify({ type: 'campaign' }));
    const trackedHtml = html.replaceAll('/track/click/0?', `/track/click/${event.lastInsertRowid}?`)
      .replaceAll('/track/open/0?', `/track/open/${event.lastInsertRowid}?`);

    try {
      const result = await sendEmail({
        to: subscriber.email,
        subject,
        text,
        html: trackedHtml,
        transport,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      sent += 1;
      db.prepare('UPDATE email_campaign_events SET status = ?, message_id = ?, response = ? WHERE id = ?')
        .run('sent', result.messageId || null, `Accepted by ${getEmailProvider() || 'email provider'}`, event.lastInsertRowid);
    } catch (error) {
      failed += 1;
      const response = String(error.message || 'Delivery failed').slice(0, 500);
      db.prepare('UPDATE email_campaign_events SET status = ?, response = ?, error_code = ? WHERE id = ?')
        .run('failed', response, String(error.code || '').slice(0, 80), event.lastInsertRowid);
      if (['550', '551', '553', '5.1.1'].some((code) => response.includes(code))) {
        db.prepare('INSERT OR IGNORE INTO email_suppressions (email, reason, source, created_at) VALUES (?, ?, ?, ?)')
          .run(subscriber.email.toLowerCase(), 'hard_bounce', getEmailProvider() || 'email', new Date().toISOString());
      }
    }
  }

  const status = failed && !sent ? 'failed' : 'sent';
  db.prepare('UPDATE email_campaigns SET status = ?, sent_count = ?, sent_at = ?, updated_at = ? WHERE id = ?')
    .run(status, sent, sent ? new Date().toISOString() : null, new Date().toISOString(), campaign.id);
  return { campaignId: campaign.id, sentCount: sent, failedCount: failed, totalTarget: audience.length, status };
}

export function campaignQueueReady() {
  return isEmailDeliveryConfigured() && Boolean(process.env.EMAIL_POSTAL_ADDRESS);
}

export function senderSummary() {
  const sender = resolveEmailSender();
  return { name: sender.name, address: sender.address, replyTo: sender.replyTo, provider: getEmailProvider(), deliveryConfigured: isEmailDeliveryConfigured() };
}