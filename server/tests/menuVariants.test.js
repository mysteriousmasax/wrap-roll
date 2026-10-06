import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMenuVariants, parseMenuVariants } from '../utils/menuVariants.js';

test('menu variants preserve names and prices and reject invalid or duplicate choices', () => {
  const variants = normalizeMenuVariants([
    { name: ' Small ', price: '8000' },
    { name: 'Large', price: 14000 },
  ]);

  assert.deepEqual(variants, [
    { name: 'Small', price: 8000 },
    { name: 'Large', price: 14000 },
  ]);
  assert.deepEqual(parseMenuVariants(JSON.stringify(variants)), variants);
  assert.throws(() => normalizeMenuVariants([{ name: 'Small', price: 0 }]), /price greater than zero/);
  assert.throws(() => normalizeMenuVariants([{ name: 'Small', price: 1 }, { name: ' small ', price: 2 }]), /unique/);
  assert.deepEqual(parseMenuVariants('invalid'), []);
});