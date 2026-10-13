import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackMenuImage, getMenuImage, getMenuImageHash, resolveMenuImageUpdate } from '../utils/menuImages.js';

test('oversized embedded menu images use the fallback instead of a dead image endpoint', () => {
  const encodedLength = Math.ceil(((8 * 1024 * 1024) + 1) / 3) * 4;
  const image = `data:image/jpeg;base64,${'A'.repeat(encodedLength)}`;

  assert.equal(getMenuImage(image, 191), fallbackMenuImage);
});

test('supported embedded menu images use the hashed image endpoint', () => {
  assert.match(getMenuImage('data:image/png;base64,AA==', 191), /^\/api\/menu\/image\/191\/[a-f\d]{20}$/i);
});

test('image URL generation and validation normalize stored whitespace consistently', () => {
  const image = ' \ndata:image/png;base64,AA==\n';
  const imageUrl = getMenuImage(image, 191);

  assert.equal(getMenuImageHash(image), imageUrl.split('/').at(-1));
});

test('saving a displayed hashed URL preserves the original database image source', () => {
  const storedImage = 'data:image/png;base64,AA==';
  const displayedImage = getMenuImage(storedImage, 191);

  assert.equal(resolveMenuImageUpdate(displayedImage, storedImage, 191), storedImage);
  assert.equal(resolveMenuImageUpdate('data:image/jpeg;base64,Q3VzdG9t', storedImage, 191), 'data:image/jpeg;base64,Q3VzdG9t');
  assert.equal(resolveMenuImageUpdate(undefined, storedImage, 191), storedImage);
});