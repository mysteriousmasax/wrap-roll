import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWhatsAppPhone, sendCrmMessage } from '../utils/crmMessaging.js';

function unsetEnvironment(keys) {
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  return () => keys.forEach((key) => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  });
}

test('normalizes Tanzanian local WhatsApp numbers to country code format', () => {
  assert.equal(normalizeWhatsAppPhone('+255 712 345 678'), '255712345678');
  assert.equal(normalizeWhatsAppPhone('0712 345 678'), '255712345678');
});

test('rejects empty outbound messages', async () => {
  await assert.rejects(
    sendCrmMessage({ customer: {}, channel: 'email', message: '  ' }),
    (error) => error.statusCode === 400,
  );
});

test('does not report WhatsApp delivery when business API credentials are missing', async () => {
  const restore = unsetEnvironment(['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']);
  try {
    await assert.rejects(
      sendCrmMessage({ customer: { phone: '+255712345678' }, channel: 'whatsapp', message: 'Hello' }),
      (error) => error.statusCode === 503 && error.message.includes('WhatsApp sending is not configured'),
    );
  } finally {
    restore();
  }
});

test('sends WhatsApp text to the customer through the configured business sender', async () => {
  const restore = unsetEnvironment(['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']);
  const previousFetch = globalThis.fetch;
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ messages: [{ id: 'message-id' }] }) };
  };
  try {
    const result = await sendCrmMessage({ customer: { phone: '0712345678' }, channel: 'whatsapp', message: 'Hello' });
    assert.equal(result.messageId, 'message-id');
    assert.equal(request.url, 'https://graph.facebook.com/v23.0/test-phone-id/messages');
    assert.equal(JSON.parse(request.options.body).to, '255712345678');
  } finally {
    globalThis.fetch = previousFetch;
    restore();
  }
});

test('does not report Instagram delivery without a recipient ID', async () => {
  const restore = unsetEnvironment(['INSTAGRAM_ACCESS_TOKEN', 'META_ACCESS_TOKEN', 'INSTAGRAM_PAGE_ID']);
  try {
    await assert.rejects(
      sendCrmMessage({ customer: { social_links: '{}' }, channel: 'instagram', message: 'Hello' }),
      (error) => error.statusCode === 400 && error.message.includes('recipient ID'),
    );
  } finally {
    restore();
  }
});

test('sends Instagram text to the saved Meta-scoped recipient ID', async () => {
  const restore = unsetEnvironment(['INSTAGRAM_ACCESS_TOKEN', 'META_ACCESS_TOKEN', 'INSTAGRAM_PAGE_ID']);
  const previousFetch = globalThis.fetch;
  process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token';
  process.env.INSTAGRAM_PAGE_ID = 'test-page-id';
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ message_id: 'instagram-message-id' }) };
  };
  try {
    const result = await sendCrmMessage({
      customer: { social_links: JSON.stringify({ instagramRecipientId: 'scoped-recipient-id' }) },
      channel: 'instagram',
      message: 'Hello',
    });
    assert.equal(result.messageId, 'instagram-message-id');
    assert.equal(request.url, 'https://graph.facebook.com/v23.0/test-page-id/messages');
    assert.equal(JSON.parse(request.options.body).recipient.id, 'scoped-recipient-id');
  } finally {
    globalThis.fetch = previousFetch;
    restore();
  }
});

test('does not report email delivery when SMTP is not configured', async () => {
  const restore = unsetEnvironment(['EMAIL_SMTP_HOST', 'EMAIL_SMTP_USER', 'EMAIL_SMTP_PASS']);
  try {
    await assert.rejects(
      sendCrmMessage({ customer: { email: 'customer@example.com' }, channel: 'email', message: 'Hello' }),
      (error) => error.statusCode === 503 && error.message.includes('Email sending is not configured'),
    );
  } finally {
    restore();
  }
});