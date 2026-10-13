import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTanzanianPhone } from '../../shared/phone.js';

test('normalizes Tanzanian mobile numbers entered with 07 or 06 prefixes', () => {
  assert.equal(normalizeTanzanianPhone('0712 345 678'), '+255712345678');
  assert.equal(normalizeTanzanianPhone('0623-456-789'), '+255623456789');
});

test('canonicalizes Tanzanian country-code numbers and preserves other values', () => {
  assert.equal(normalizeTanzanianPhone('+255 712 345 678'), '+255712345678');
  assert.equal(normalizeTanzanianPhone('255623456789'), '+255623456789');
  assert.equal(normalizeTanzanianPhone('+254 712 345 678'), '+254 712 345 678');
  assert.equal(normalizeTanzanianPhone('07123'), '07123');
  assert.equal(normalizeTanzanianPhone(''), '');
});