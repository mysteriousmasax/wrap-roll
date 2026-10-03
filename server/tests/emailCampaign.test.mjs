import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCampaignSubject,
  buildCampaignBody,
  selectAudience,
  renderEmailTemplate,
  escapeEmailHtml,
  plainTextToHtml,
} from '../utils/emailCampaigns.js';

test('buildCampaignSubject uses the campaign type and brand name', () => {
  assert.equal(buildCampaignSubject('birthday'), 'Happy birthday from Wrap & Roll');
  assert.equal(buildCampaignSubject('welcome'), 'Welcome to Wrap & Roll');
});

test('buildCampaignBody personalizes the message and includes an unsubscribe note', () => {
  const body = buildCampaignBody('winback', {
    firstName: 'Amina',
    restaurantName: 'Wrap & Roll',
    offer: '15% off your next order',
  });

  assert.match(body, /Amina/);
  assert.match(body, /15% off your next order/);
  assert.match(body, /Unsubscribe/i);
});

test('selectAudience filters subscribers by segment and channel', () => {
  const subscribers = [
    { email: 'vip@example.com', segment: 'vip', preferred_channel: 'email', active: 1, consent_status: 'subscribed' },
    { email: 'guest@example.com', segment: 'regular', preferred_channel: 'email', active: 1, consent_status: 'subscribed' },
    { email: 'inactive@example.com', segment: 'inactive', preferred_channel: 'sms', active: 1, consent_status: 'subscribed' },
    { email: 'disabled@example.com', segment: 'vip', preferred_channel: 'email', active: 0, consent_status: 'subscribed' },
    { email: 'pending@example.com', segment: 'vip', preferred_channel: 'email', active: 1, consent_status: 'pending' },
  ];

  const selected = selectAudience(subscribers, 'vip', 'email', new Set(['vip@example.com']));
  assert.deepEqual(selected, []);
  const optedIn = selectAudience(subscribers, 'vip', 'email');
  assert.deepEqual(optedIn.map((row) => row.email), ['vip@example.com']);
});

test('selectAudience excludes non-consented and suppressed contacts across all segments', () => {
  const rows = [
    { email: 'ok@example.com', segment: 'regular', active: 1, consent_status: 'subscribed', preferred_channel: 'email' },
    { email: 'pending@example.com', segment: 'regular', active: 1, consent_status: 'pending', preferred_channel: 'email' },
    { email: 'unsubscribed@example.com', segment: 'regular', active: 0, consent_status: 'unsubscribed', preferred_channel: 'email' },
  ];
  assert.deepEqual(selectAudience(rows, 'all', 'email', new Set(['ok@example.com'])), []);
  assert.deepEqual(selectAudience(rows, 'all', 'email').map((row) => row.email), ['ok@example.com']);
});

test('renderEmailTemplate replaces known customer fields and keeps unknown tokens visible', () => {
  assert.equal(
    renderEmailTemplate('Hi {{first_name}}. {{unknown}}', { firstName: 'Amina' }),
    'Hi Amina. {{unknown}}',
  );
});

test('plainTextToHtml escapes untrusted content and preserves line breaks', () => {
  const html = plainTextToHtml('<script>alert(1)</script>\nThanks');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<br>/);
  assert.equal(escapeEmailHtml('A&B'), 'A&amp;B');
});
