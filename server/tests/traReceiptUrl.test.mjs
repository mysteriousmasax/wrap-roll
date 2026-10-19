import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTraReceiptUrl } from '../utils/traReceiptUrl.js';

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