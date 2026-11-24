import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTraReceiptUrl, resolveTraReceiptRedirect } from '../utils/traReceiptUrl.js';

test('TRA verification links accept HTTP or HTTPS receipts on the official host and fetch securely', () => {
  assert.equal(
    normalizeTraReceiptUrl('https://verify.tra.go.tz/3B7C4210717_161905'),
    'https://verify.tra.go.tz/3B7C4210717_161905',
  );
  assert.equal(
    normalizeTraReceiptUrl('http://verify.tra.go.tz/3B7C4210717_161905'),
    'https://verify.tra.go.tz/3B7C4210717_161905',
  );
  for (const value of [
    'https://example.com/3B7C4210717_161905',
    'https://verify.tra.go.tz/Home/Index',
    'https://verify.tra.go.tz/3B7C4210717?next=https://example.com',
  ]) {
    assert.throws(() => normalizeTraReceiptUrl(value));
  }
});

test('TRA domain without a receipt code explains that the full QR link is required', () => {
  assert.throws(
    () => normalizeTraReceiptUrl('https://verify.tra.go.tz/'),
    /complete TRA receipt link.*full receipt QR code/i,
  );
});

test('TRA receipt redirects are resolved only when they remain on the supported receipt route', () => {
  assert.equal(
    resolveTraReceiptRedirect('https://verify.tra.go.tz/3B7C4210717_161905', '/3B7C4210717_161905/'),
    'https://verify.tra.go.tz/3B7C4210717_161905/',
  );
  assert.equal(
    resolveTraReceiptRedirect('https://verify.tra.go.tz/3B7C4210717_161905', 'http://verify.tra.go.tz/3B7C4210717_161905'),
    'https://verify.tra.go.tz/3B7C4210717_161905',
  );
  assert.throws(() => resolveTraReceiptRedirect(
    'https://verify.tra.go.tz/3B7C4210717_161905',
    'https://example.com/receipt',
  ));
  assert.throws(() => resolveTraReceiptRedirect(
    'https://verify.tra.go.tz/3B7C4210717_161905',
    '/Home/Index',
  ));
});