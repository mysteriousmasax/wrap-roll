import db from '../db/database.js';
import { getOrderById } from './orders.js';
import { isEmailDeliveryConfigured, publicEmailUrl, sendEmail } from './emailDelivery.js';
import { buildCompanyInvoiceEmail, buildOrderReceivedEmail, buildPaidInvoiceEmail, buildReservationUpdateEmail, buildRoadsideCompleteEmail } from './orderEmailContent.js';
import { buildInvoicePdfBuffer } from './invoicePdf.js';
import { createRoadsideAccessToken } from './roadsideAccess.js';

const emailTypes = new Set(['order_received', 'paid_invoice', 'company_invoice']);

function isSupportedEmailType(emailType) {
  return emailTypes.has(emailType) || /^reservation_update:\d+$/.test(emailType) || /^roadside_handoff:\d+$/.test(emailType);
}
const maxAttempts = 5;
const retryDelayMs = 5 * 60 * 1000;

export function enqueueOrderEmail(orderId, emailType) {
  if (!isSupportedEmailType(emailType)) throw new Error('Unsupported order email type.');
  const order = db.prepare('SELECT customer_email, payment_status, payment_terms FROM orders WHERE id = ?').get(orderId);
  const recipient = String(order?.customer_email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return false;
  if (emailType === 'paid_invoice' && !['paid', 'completed'].includes(order.payment_status)) return false;
  if (emailType === 'company_invoice' && order.payment_terms !== 'invoice') return false;

  const now = new Date().toISOString();
  const inserted = db.prepare(`INSERT OR IGNORE INTO order_email_outbox
    (order_id, email_type, recipient_email, status, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?)`)
    .run(orderId, emailType, recipient, now, now);
  return inserted.changes > 0;
}

function readSettings() {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(({ key, value }) => [key, value]));
}

function ensureInvoiceRecord(order) {
  const existing = db.prepare('SELECT invoice_number FROM invoices WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(order.id);
  if (existing) return existing.invoice_number;

  const customer = db.prepare(`SELECT * FROM customers
    WHERE (? <> '' AND lower(email) = ?) OR (? <> '' AND phone = ?) OR lower(name) = ?
    ORDER BY id DESC LIMIT 1`).get(
    String(order.customerEmail || '').trim().toLowerCase(),
    String(order.customerEmail || '').trim().toLowerCase(),
    String(order.customerPhone || '').trim(),
    String(order.customerPhone || '').trim(),
    String(order.customer || '').trim().toLowerCase()
  );
  if (!customer) throw new Error('Customer record for this order was not found.');

  const datePart = new Date(order.paidAt || Date.now()).toISOString().slice(0, 10).replace(/-/g, '');
  const orderDigits = String(order.id || '').replace(/\D/g, '').slice(-6).padStart(6, '0');
  const invoiceNumber = `INV-${datePart}-${orderDigits}`;
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO invoices
    (invoice_number, customer_id, order_id, customer_type, company_name, tin, billing_address, subtotal, tax, total, currency, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)`)
    .run(invoiceNumber, customer.id, order.id, order.customerType || 'individual', order.companyName || null,
      order.customerTin || null, order.billingAddress || null, order.subtotal, order.tax, order.total, 'TZS', now);
  return db.prepare('SELECT invoice_number FROM invoices WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(order.id)?.invoice_number || invoiceNumber;
}

export async function processOrderEmailOutbox() {
  if (!isEmailDeliveryConfigured()) return 0;

  const now = new Date();
  const nowIso = now.toISOString();
  const staleSendingCutoff = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const retryCutoff = new Date(now.getTime() - retryDelayMs).toISOString();
  db.prepare(`UPDATE order_email_outbox SET status = 'failed', response = ?, updated_at = ?
    WHERE status = 'sending' AND updated_at < ? AND attempt_count < ?`)
    .run('Previous email attempt did not finish.', nowIso, staleSendingCutoff, maxAttempts);

  const queued = db.prepare(`SELECT * FROM order_email_outbox
    WHERE status = 'pending' OR (status = 'failed' AND attempt_count < ? AND updated_at <= ?)
    ORDER BY created_at LIMIT 10`).all(maxAttempts, retryCutoff);
  let sent = 0;

  for (const event of queued) {
    const claimed = db.prepare(`UPDATE order_email_outbox SET status = 'sending', attempt_count = attempt_count + 1, updated_at = ?
      WHERE id = ? AND (status = 'pending' OR (status = 'failed' AND attempt_count < ? AND updated_at <= ?))`)
      .run(nowIso, event.id, maxAttempts, retryCutoff);
    if (!claimed.changes) continue;

    try {
      const order = getOrderById(event.order_id);
      if (!order) throw new Error('Order no longer exists.');
      if (order.fulfillmentMode === 'roadside_handoff') {
        const baseUrl = publicEmailUrl(`/roadside-track/${encodeURIComponent(order.id)}`);
        order.roadsideTrackingUrl = `${baseUrl}#${createRoadsideAccessToken(order.id)}`;
      }
      if (event.email_type === 'paid_invoice' && !['paid', 'completed'].includes(order.paymentStatus)) {
        throw new Error('Order payment is not confirmed.');
      }
      const settings = readSettings();
      if (['paid_invoice', 'company_invoice'].includes(event.email_type)) order.invoiceNumber = ensureInvoiceRecord(order);
      const content = event.email_type === 'paid_invoice'
        ? buildPaidInvoiceEmail(order, settings, publicEmailUrl('/wrap-roll-logo-lockup-transparent.png'))
        : event.email_type === 'company_invoice'
          ? buildCompanyInvoiceEmail(order, publicEmailUrl('/wrap-roll-logo-lockup-transparent.png'))
          : event.email_type.startsWith('reservation_update:')
            ? buildReservationUpdateEmail(order, publicEmailUrl('/wrap-roll-logo-lockup-transparent.png'))
            : event.email_type.startsWith('roadside_handoff:')
              ? buildRoadsideCompleteEmail(order, publicEmailUrl('/wrap-roll-logo-lockup-transparent.png'))
              : buildOrderReceivedEmail(order, publicEmailUrl('/wrap-roll-logo-lockup-transparent.png'));
      const attachments = [];
      if (['paid_invoice', 'company_invoice'].includes(event.email_type)) {
        const invoicePdf = await buildInvoicePdfBuffer(order, settings);
        attachments.push({
          filename: `${order.invoiceNumber || order.id || 'invoice'}.pdf`,
          content: invoicePdf,
          contentType: 'application/pdf',
        });
      }
      const result = await sendEmail({ to: event.recipient_email, ...content, attachments });
      db.prepare(`UPDATE order_email_outbox SET status = 'sent', message_id = ?, response = ?, sent_at = ?, updated_at = ? WHERE id = ?`)
        .run(result.messageId || null, `Accepted by ${result.provider || 'email provider'}`, new Date().toISOString(), new Date().toISOString(), event.id);
      sent += 1;
    } catch (error) {
      db.prepare(`UPDATE order_email_outbox SET status = 'failed', response = ?, updated_at = ? WHERE id = ?`)
        .run(String(error.message || 'Email delivery failed').slice(0, 500), new Date().toISOString(), event.id);
      console.error(`Order email ${event.email_type} for ${event.order_id} failed:`, error.message);
    }
  }

  return sent;
}