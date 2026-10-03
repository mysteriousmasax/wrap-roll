import db from '../db/database.js';
import { campaignQueueReady, processEmailCampaign } from './emailCampaignService.js';
import { escapeEmailHtml, plainTextToHtml, renderEmailTemplate } from './emailCampaigns.js';
import { createEmailToken, isSmtpConfigured, publicEmailUrl, sendEmail } from './emailDelivery.js';

const minute = 60 * 1000;
let processing = false;

function enqueueAutomation(automation, subscriberId, eventKey, now = new Date()) {
  const step = db.prepare('SELECT delay_minutes FROM email_automation_steps WHERE automation_id = ? ORDER BY step_order LIMIT 1').get(automation.id);
  if (!step) return false;
  const nextSendAt = new Date(now.getTime() + Number(step.delay_minutes || 0) * minute).toISOString();
  const result = db.prepare(`INSERT OR IGNORE INTO email_automation_enrollments
    (automation_id, subscriber_id, event_key, current_step, status, next_send_at, created_at, updated_at)
    VALUES (?, ?, ?, 0, 'active', ?, ?, ?)`)
    .run(automation.id, subscriberId, eventKey, nextSendAt, now.toISOString(), now.toISOString());
  return result.changes > 0;
}

export function enrollSubscriberForAutomations(subscriberId, triggerType = 'subscriber_added', eventKey = `subscriber:${subscriberId}`) {
  const subscriber = db.prepare('SELECT * FROM email_subscribers WHERE id = ?').get(Number(subscriberId));
  if (!subscriber || subscriber.consent_status !== 'subscribed' || !subscriber.active) return 0;
  const automations = db.prepare("SELECT * FROM email_automations WHERE status = 'active' AND trigger_type = ?").all(triggerType);
  return automations.reduce((count, automation) => count + Number(enqueueAutomation(automation, subscriber.id, `${automation.id}:${eventKey}`)), 0);
}

function discoverEventEnrollments(now) {
  const automations = db.prepare("SELECT * FROM email_automations WHERE status = 'active' AND trigger_type IN ('post_visit', 'birthday', 'winback')").all();
  const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  for (const automation of automations) {
    if (automation.trigger_type === 'post_visit') {
      const since = new Date(now.getTime() - 24 * 60 * minute).toISOString();
      const rows = db.prepare(`SELECT s.id AS subscriber_id, o.id AS order_id FROM orders o
        JOIN email_subscribers s ON lower(trim(s.email)) = lower(trim(o.customer_email))
        WHERE o.customer_email IS NOT NULL AND o.created_at >= ? AND o.payment_status IN ('paid', 'completed')
          AND s.active = 1 AND s.consent_status = 'subscribed'`).all(since);
      rows.forEach((row) => enqueueAutomation(automation, row.subscriber_id, `${automation.id}:order:${row.order_id}`, now));
    }
    if (automation.trigger_type === 'birthday') {
      const rows = db.prepare(`SELECT s.id AS subscriber_id, c.id AS customer_id FROM customers c
        JOIN email_subscribers s ON lower(trim(s.email)) = lower(trim(c.email))
        WHERE substr(c.birthday, 6, 5) = ? AND s.active = 1 AND s.consent_status = 'subscribed'`).all(today);
      rows.forEach((row) => enqueueAutomation(automation, row.subscriber_id, `${automation.id}:birthday:${now.getFullYear()}:${row.customer_id}`, now));
    }
    if (automation.trigger_type === 'winback') {
      let config = {};
      try { config = JSON.parse(automation.config || '{}'); } catch {}
      const days = Math.max(30, Math.min(365, Number(config.inactiveDays || 60)));
      const cutoff = new Date(now.getTime() - days * 24 * 60 * minute).toISOString().slice(0, 10);
      const rows = db.prepare(`SELECT s.id AS subscriber_id, c.id AS customer_id, c.last_visit FROM customers c
        JOIN email_subscribers s ON lower(trim(s.email)) = lower(trim(c.email))
        WHERE c.last_visit <= ? AND s.active = 1 AND s.consent_status = 'subscribed'`).all(cutoff);
      rows.forEach((row) => enqueueAutomation(automation, row.subscriber_id, `${automation.id}:winback:${row.customer_id}:${row.last_visit}`, now));
    }
  }
}

async function processAutomationEnrollments(now) {
  if (!isSmtpConfigured() || !process.env.EMAIL_POSTAL_ADDRESS) return;
  const due = db.prepare(`SELECT e.*, s.email, s.first_name, s.last_name, s.consent_status, a.name AS automation_name
    FROM email_automation_enrollments e
    JOIN email_subscribers s ON s.id = e.subscriber_id
    JOIN email_automations a ON a.id = e.automation_id
    WHERE e.status = 'active' AND a.status = 'active' AND e.next_send_at <= ?
    ORDER BY e.next_send_at LIMIT 25`).all(now.toISOString());

  for (const enrollment of due) {
    if (enrollment.consent_status !== 'subscribed') {
      db.prepare("UPDATE email_automation_enrollments SET status = 'suppressed', updated_at = ? WHERE id = ?")
        .run(now.toISOString(), enrollment.id);
      continue;
    }
    const suppression = db.prepare('SELECT email FROM email_suppressions WHERE email = ?').get(enrollment.email.toLowerCase());
    if (suppression) {
      db.prepare("UPDATE email_automation_enrollments SET status = 'suppressed', updated_at = ? WHERE id = ?")
        .run(now.toISOString(), enrollment.id);
      continue;
    }

    const step = db.prepare('SELECT * FROM email_automation_steps WHERE automation_id = ? AND step_order = ?')
      .get(enrollment.automation_id, enrollment.current_step);
    if (!step) {
      db.prepare("UPDATE email_automation_enrollments SET status = 'completed', updated_at = ? WHERE id = ?")
        .run(now.toISOString(), enrollment.id);
      continue;
    }

    const template = step.template_id ? db.prepare('SELECT * FROM email_templates WHERE id = ?').get(step.template_id) : null;
    const body = template?.body_text || step.body_text;
    const subject = template?.subject || step.subject;
    const token = createEmailToken({ purpose: 'email-unsubscribe', subscriberId: enrollment.subscriber_id, email: enrollment.email });
    const unsubscribeUrl = publicEmailUrl(`/api/email-marketing/unsubscribe?token=${encodeURIComponent(token)}`);
    const variables = { firstName: enrollment.first_name, lastName: enrollment.last_name, email: enrollment.email, unsubscribeUrl };
    const htmlVariables = {
      firstName: escapeEmailHtml(enrollment.first_name || 'friend'),
      lastName: escapeEmailHtml(enrollment.last_name || ''),
      email: escapeEmailHtml(enrollment.email),
      restaurantName: escapeEmailHtml(process.env.EMAIL_FROM_NAME || 'Wrap & Roll'),
      unsubscribeUrl,
    };
    const postalAddress = String(process.env.EMAIL_POSTAL_ADDRESS || '');
    const renderedText = `${renderEmailTemplate(body, variables)}\n\n${postalAddress}\nUnsubscribe: ${unsubscribeUrl}`;
    const renderedHtml = `${renderEmailTemplate(template?.html_body || plainTextToHtml(body), htmlVariables)}<footer><p>${escapeEmailHtml(postalAddress)}</p><p><a href="${unsubscribeUrl}">Unsubscribe</a></p></footer>`;
    const sentAt = new Date().toISOString();
    const event = db.prepare(`INSERT INTO email_automation_events (automation_id, subscriber_id, step_id, email, status, sent_at)
      VALUES (?, ?, ?, ?, 'sending', ?)`)
      .run(enrollment.automation_id, enrollment.subscriber_id, step.id, enrollment.email, sentAt);

    try {
      const result = await sendEmail({ to: enrollment.email, subject, text: renderedText, html: renderedHtml, headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
      db.prepare('UPDATE email_automation_events SET status = ?, message_id = ?, response = ? WHERE id = ?')
        .run('sent', result.messageId || null, 'Accepted by SMTP relay', event.lastInsertRowid);
      const nextStep = db.prepare('SELECT delay_minutes FROM email_automation_steps WHERE automation_id = ? AND step_order = ?')
        .get(enrollment.automation_id, enrollment.current_step + 1);
      if (nextStep) {
        const nextSendAt = new Date(Date.now() + Number(nextStep.delay_minutes || 0) * minute).toISOString();
        db.prepare(`UPDATE email_automation_enrollments SET current_step = current_step + 1, next_send_at = ?, last_sent_at = ?, updated_at = ? WHERE id = ?`)
          .run(nextSendAt, sentAt, sentAt, enrollment.id);
      } else {
        db.prepare("UPDATE email_automation_enrollments SET status = 'completed', last_sent_at = ?, updated_at = ? WHERE id = ?")
          .run(sentAt, sentAt, enrollment.id);
      }
    } catch (error) {
      db.prepare('UPDATE email_automation_events SET status = ?, response = ? WHERE id = ?')
        .run('failed', String(error.message || 'Delivery failed').slice(0, 500), event.lastInsertRowid);
      db.prepare("UPDATE email_automation_enrollments SET status = 'failed', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), enrollment.id);
    }
  }
}

async function processEmailQueue() {
  if (processing) return;
  processing = true;
  try {
    const now = new Date();
    discoverEventEnrollments(now);
    if (campaignQueueReady()) {
      const staleSendingCutoff = new Date(now.getTime() - 10 * minute).toISOString();
      db.prepare("UPDATE email_campaigns SET status = 'queued' WHERE status = 'sending' AND updated_at < ?").run(staleSendingCutoff);
      const campaigns = db.prepare(`SELECT id FROM email_campaigns
        WHERE status = 'queued' OR (status = 'scheduled' AND scheduled_at <= ?)
        ORDER BY COALESCE(scheduled_at, created_at) LIMIT 1`).all(now.toISOString());
      for (const campaign of campaigns) {
        try { await processEmailCampaign(campaign.id); }
        catch (error) { console.error(`Email campaign ${campaign.id} failed:`, error.message); }
      }
      await processAutomationEnrollments(new Date());
    }
  } catch (error) {
    console.error('Email marketing worker failed:', error.message);
  } finally {
    processing = false;
  }
}

export function startEmailMarketingWorker() {
  const timer = setInterval(processEmailQueue, 30 * 1000);
  timer.unref?.();
  processEmailQueue();
  return () => clearInterval(timer);
}