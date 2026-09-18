import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../routes/inventory.js', import.meta.url), 'utf8');
const insertMatch = source.match(/INSERT INTO inventory\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/s);

assert.ok(insertMatch, 'inventory insert SQL should exist');

const rawColumns = insertMatch[1].split(',').map((column) => column.trim());
const placeholderCount = (insertMatch[2].match(/\?/g) || []).length;

test('inventory insert statement keeps column and value counts aligned', () => {
  assert.equal(rawColumns.length, placeholderCount, `expected ${rawColumns.length} columns to match ${placeholderCount} values`);
  assert.ok(rawColumns.includes('delivery_date'), 'inventory insert should include delivery_date column');
  assert.ok(rawColumns.includes('front_burger'), 'inventory insert should include front_burger column');
});
