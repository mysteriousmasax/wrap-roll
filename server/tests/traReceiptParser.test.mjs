import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTraReceiptHtml } from '../../src/utils/traReceiptParser.js';

function element(tagName, children = []) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes: children,
    get textContent() { return children.map((child) => child.nodeType === 3 ? child.nodeValue : child.textContent).join(''); },
    querySelectorAll(selector) {
      const tags = selector.split(',').map((tag) => tag.trim().toUpperCase());
      const found = [];
      const visit = (child) => {
        if (child.nodeType !== 1) return;
        if (tags.includes(child.tagName)) found.push(child);
        child.childNodes.forEach(visit);
      };
      children.forEach(visit);
      return found;
    },
  };
  return node;
}

const text = (nodeValue) => ({ nodeType: 3, nodeValue, textContent: nodeValue });
const cell = (value, tagName = 'td') => element(tagName, [text(value)]);
const row = (values, tagName = 'td') => element('tr', values.map((value) => cell(value, tagName)));

test('TRA receipt parser extracts itemized produce and receipt totals for review', () => {
  const table = element('table', [
    row(['Item Description', 'Quantity', 'Unit', 'Unit Price', 'Total'], 'th'),
    row(['Lettuce', '2', 'kg', '1,500.00', '3,000.00']),
    row(['Onion', '1', 'kg', '1,000.00', '1,000.00']),
  ]);
  const body = element('body', [
    element('h4', [text('START OF LEGAL RECEIPT')]),
    element('h3', [text('Mikocheni Fresh Produce Ltd')]),
    element('p', [text('RECEIPT NO: INV-2026-11')]),
    element('p', [text('RECEIPT DATE: 19/10/2026')]),
    element('p', [text('TOTAL INCL OF TAX: 4,720.00')]),
    element('h4', [text('RECEIPT VERIFICATION CODE')]),
    table,
  ]);
  const originalParser = globalThis.DOMParser;
  globalThis.DOMParser = class {
    parseFromString() {
      return { body, querySelectorAll: (selector) => body.querySelectorAll(selector) };
    }
  };

  try {
    const parsed = parseTraReceiptHtml('<verified receipt>');
    assert.equal(parsed.supplier, 'Mikocheni Fresh Produce Ltd');
    assert.equal(parsed.receiptRef, 'INV-2026-11');
    assert.equal(parsed.expenseDate, '2026-10-19');
    assert.equal(parsed.amount, 4720);
    assert.deepEqual(parsed.items, [
      { name: 'Lettuce', quantity: 2, unit: 'kg', unitCost: 1500 },
      { name: 'Onion', quantity: 1, unit: 'kg', unitCost: 1000 },
    ]);
  } finally {
    if (originalParser === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = originalParser;
  }
});