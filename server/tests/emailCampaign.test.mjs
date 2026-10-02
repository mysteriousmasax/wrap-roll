import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCampaignSubject,
  buildCampaignBody,
  selectAudience,
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
    { email: 'vip@example.com', segment: 'vip', channel: 'email', active: 1 },
    { email: 'guest@example.com', segment: 'regular', channel: 'email', active: 1 },
    { email: 'inactive@example.com', segment: 'inactive', channel: 'sms', active: 1 },
    { email: 'disabled@example.com', segment: 'vip', channel: 'email', active: 0 },
  ];

  const selected = selectAudience(subscribers, 'vip', 'email');
  assert.deepEqual(selected.map((row) => row.email), ['vip@example.com']);
});
