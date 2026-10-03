import nodemailer from 'nodemailer';

function errorWithStatus(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createEmailTransport() {
  const host = process.env.EMAIL_SMTP_HOST;
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.EMAIL_SMTP_PORT || 587),
    secure: String(process.env.EMAIL_SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: { user, pass },
  });
}

async function sendMetaMessage(url, token, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw errorWithStatus(result.error?.message || 'Meta could not deliver this message.', 502);
  }
  return result;
}

function getGraphVersion() {
  return String(process.env.META_GRAPH_API_VERSION || 'v23.0').replace(/^v?/, 'v');
}

function getInstagramRecipient(customer) {
  try {
    const socialLinks = JSON.parse(customer.social_links || '{}');
    return String(socialLinks.instagramRecipientId || socialLinks.instagram_scoped_id || '').trim();
  } catch {
    return '';
  }
}

export function normalizeWhatsAppPhone(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = `255${phone.slice(1)}`;
  return phone;
}

export async function sendCrmMessage({ customer, channel, message }) {
  const text = String(message || '').trim();
  if (!text) throw errorWithStatus('Enter a message before sending.', 400);
  if (text.length > 4096) throw errorWithStatus('Messages must be 4,096 characters or fewer.', 400);

  if (channel === 'email') {
    if (!customer.email) throw errorWithStatus('This customer has no email address.', 400);
    const transport = createEmailTransport();
    if (!transport) throw errorWithStatus('Email sending is not configured. Add the SMTP settings to Railway.', 503);
    const fromName = process.env.EMAIL_FROM_NAME || 'Wrap & Roll';
    const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER;
    const result = await transport.sendMail({
      from: `${fromName} <${fromAddress}>`,
      to: customer.email,
      subject: `A message from ${fromName}`,
      text,
    });
    return { channel, recipient: customer.email, messageId: result.messageId };
  }

  const graphVersion = getGraphVersion();
  if (channel === 'whatsapp') {
    const phone = normalizeWhatsAppPhone(customer.phone);
    if (!/^\d{8,15}$/.test(phone)) throw errorWithStatus('Add a valid international phone number for this customer.', 400);
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) throw errorWithStatus('WhatsApp sending is not configured. Add the WhatsApp Business API settings to Railway.', 503);
    const result = await sendMetaMessage(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, token, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: text },
    });
    return { channel, recipient: phone, messageId: result.messages?.[0]?.id || null };
  }

  if (channel === 'instagram') {
    const recipientId = getInstagramRecipient(customer);
    if (!recipientId) throw errorWithStatus('Add this customer’s Instagram messaging recipient ID in their loyalty profile.', 400);
    const token = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    const pageId = process.env.INSTAGRAM_PAGE_ID;
    if (!token || !pageId) throw errorWithStatus('Instagram sending is not configured. Add the Instagram Messaging API settings to Railway.', 503);
    const result = await sendMetaMessage(`https://graph.facebook.com/${graphVersion}/${pageId}/messages`, token, {
      recipient: { id: recipientId },
      message: { text },
    });
    return { channel, recipient: recipientId, messageId: result.message_id || null };
  }

  throw errorWithStatus('Choose email, WhatsApp, or Instagram.', 400);
}