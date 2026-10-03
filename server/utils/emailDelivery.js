import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';

export function isSmtpConfigured() {
  return Boolean(process.env.EMAIL_SMTP_HOST && process.env.EMAIL_SMTP_USER && process.env.EMAIL_SMTP_PASS);
}

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM_ADDRESS);
}

export function getEmailProvider() {
  if (isResendConfigured()) return 'resend';
  if (isSmtpConfigured()) return 'smtp';
  return null;
}

export function isEmailDeliveryConfigured() {
  return Boolean(getEmailProvider());
}

export function createEmailTransport() {
  if (!isSmtpConfigured()) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST,
    port: Number(process.env.EMAIL_SMTP_PORT || 587),
    secure: String(process.env.EMAIL_SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: { user: process.env.EMAIL_SMTP_USER, pass: process.env.EMAIL_SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}

export function resolveEmailSender() {
  return {
    name: process.env.EMAIL_FROM_NAME || 'Wrap & Roll',
    address: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER || '',
    replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER || '',
  };
}

function getTokenSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET must be configured to sign email unsubscribe and tracking links.');
  return secret;
}

export function createEmailToken(payload, expiresIn = '2y') {
  return jwt.sign(payload, getTokenSecret(), { expiresIn });
}

export function verifyEmailToken(token, expectedPurpose) {
  const payload = jwt.verify(String(token || ''), getTokenSecret());
  if (payload.purpose !== expectedPurpose) throw new Error('Email token purpose is invalid.');
  return payload;
}

export function publicEmailUrl(path) {
  const base = String(process.env.PUBLIC_APP_URL || 'https://wrapandrolltz.com').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function verifyEmailDelivery() {
  if (isResendConfigured()) return resolveEmailSender();
  const transport = createEmailTransport();
  if (!transport) throw new Error('SMTP is not configured. Add EMAIL_SMTP_HOST, EMAIL_SMTP_USER, and EMAIL_SMTP_PASS.');
  await transport.verify();
  return resolveEmailSender();
}

export async function sendEmail({ to, subject, text, html, headers = {}, transport }) {
  const sender = resolveEmailSender();
  if (isResendConfigured()) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${sender.name.replace(/[<>]/g, '')} <${sender.address}>`,
        to: [to],
        subject,
        text,
        html,
        reply_to: sender.replyTo,
        headers,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `Resend rejected the email (${response.status}).`);
    return { messageId: result.id, provider: 'resend' };
  }

  const activeTransport = transport || createEmailTransport();
  if (!activeTransport) throw new Error('Configure Resend with RESEND_API_KEY and EMAIL_FROM_ADDRESS, or configure an SMTP relay.');
  return activeTransport.sendMail({
    from: `"${sender.name.replace(/"/g, '')}" <${sender.address}>`,
    replyTo: sender.replyTo,
    to,
    subject,
    text,
    html,
    headers,
  });
}

export function senderSummary() {
  const sender = resolveEmailSender();
  return {
    name: sender.name,
    address: sender.address,
    replyTo: sender.replyTo,
    provider: getEmailProvider(),
    deliveryConfigured: isEmailDeliveryConfigured(),
    resendConfigured: isResendConfigured(),
    smtpConfigured: isSmtpConfigured(),
    postalAddressConfigured: Boolean(process.env.EMAIL_POSTAL_ADDRESS),
  };
}