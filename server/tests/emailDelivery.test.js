import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmailProvider, isEmailDeliveryConfigured, isResendConfigured, sendEmail, senderSummary } from '../utils/emailDelivery.js';

function saveEnvironment(keys) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  return () => keys.forEach((key) => {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  });
}

test('Resend API configuration enables email delivery without SMTP credentials', () => {
  const restore = saveEnvironment(['RESEND_API_KEY', 'EMAIL_FROM_ADDRESS', 'EMAIL_SMTP_HOST', 'EMAIL_SMTP_USER', 'EMAIL_SMTP_PASS']);
  try {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM_ADDRESS = 'news@example.com';
    delete process.env.EMAIL_SMTP_HOST;
    delete process.env.EMAIL_SMTP_USER;
    delete process.env.EMAIL_SMTP_PASS;

    assert.equal(isResendConfigured(), true);
    assert.equal(isEmailDeliveryConfigured(), true);
    assert.equal(getEmailProvider(), 'resend');
    assert.equal(senderSummary().deliveryConfigured, true);
  } finally {
    restore();
  }
});

test('sendEmail submits messages to the Resend API and returns its ID', async () => {
  const restore = saveEnvironment(['RESEND_API_KEY', 'EMAIL_FROM_NAME', 'EMAIL_FROM_ADDRESS', 'EMAIL_REPLY_TO']);
  const originalFetch = globalThis.fetch;
  let request;
  try {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM_NAME = 'Wrap & Roll';
    process.env.EMAIL_FROM_ADDRESS = 'news@example.com';
    process.env.EMAIL_REPLY_TO = 'support@example.com';
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ id: 'email-test-123' }) };
    };

    const result = await sendEmail({ to: 'guest@example.com', subject: 'Hello', text: 'Welcome', html: '<p>Welcome</p>' });

    assert.equal(result.messageId, 'email-test-123');
    assert.equal(result.provider, 'resend');
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.options.headers.Authorization, 'Bearer re_test_key');
    assert.deepEqual(JSON.parse(request.options.body), {
      from: 'Wrap & Roll <news@example.com>',
      to: ['guest@example.com'],
      subject: 'Hello',
      text: 'Welcome',
      html: '<p>Welcome</p>',
      reply_to: 'support@example.com',
      headers: {},
    });
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test('sendEmail preserves SMTP delivery when Resend is not configured', async () => {
  const restore = saveEnvironment(['RESEND_API_KEY', 'EMAIL_SMTP_HOST', 'EMAIL_SMTP_USER', 'EMAIL_SMTP_PASS']);
  try {
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_SMTP_HOST = 'smtp.example.com';
    process.env.EMAIL_SMTP_USER = 'sender@example.com';
    process.env.EMAIL_SMTP_PASS = 'smtp-test-password';
    const transport = { sendMail: async (message) => ({ messageId: message.to }) };

    const result = await sendEmail({ to: 'guest@example.com', subject: 'Hello', text: 'Welcome', transport });

    assert.equal(getEmailProvider(), 'smtp');
    assert.equal(result.messageId, 'guest@example.com');
  } finally {
    restore();
  }
});