import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { refreshDocumentData } from '../scripts/refreshDocumentData.js';

test('document refresh preserves menu-editor images stored in the database', () => {
  const db = new DatabaseSync(':memory:');
  try {
    refreshDocumentData(db);
    const customImage = 'data:image/jpeg;base64,Y3VzdG9tLW1lbnUtaW1hZ2U=';
    db.prepare('UPDATE menu_items SET image = ? WHERE name = ?').run(customImage, 'Veggie Wrap');

    refreshDocumentData(db);

    assert.equal(db.prepare('SELECT image FROM menu_items WHERE name = ?').get('Veggie Wrap').image, customImage);
  } finally {
    db.close();
  }
});