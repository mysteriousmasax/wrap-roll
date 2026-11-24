import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReceiptImage } from '../utils/receiptImage.js';

test('receipt images accept supported image data URLs and optional empty values', () => {
  const image = 'data:image/jpeg;base64,Zm9v';
  assert.equal(normalizeReceiptImage(image), image);
  assert.equal(normalizeReceiptImage(undefined), null);
  assert.equal(normalizeReceiptImage(''), null);
});

test('receipt images reject non-images, malformed data URLs, and oversized payloads', () => {
  assert.throws(() => normalizeReceiptImage('data:text/html;base64,PHNjcmlwdD4='));
  assert.throws(() => normalizeReceiptImage('data:image/svg+xml;base64,PHN2Zz4='));
  assert.throws(() => normalizeReceiptImage(`data:image/jpeg;base64,${'A'.repeat(7 * 1024 * 1024)}`));
});
