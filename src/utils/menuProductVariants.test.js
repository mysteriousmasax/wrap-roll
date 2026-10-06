import test from 'node:test';
import assert from 'node:assert/strict';
import { groupLegacyMenuVariants, isMenuVariantCategory } from './menuProductVariants.js';

test('legacy size rows collapse into one product with source-linked prices', () => {
  const items = [
    { id: 10, name: 'Chicken Pizza (LARGE)', price: 18000, category: 'large', categories: ['large', 'pizzas'] },
    { id: 11, name: 'Chicken Pizza (SMALL)', price: 10000, category: 'pizzas', categories: ['pizzas', 'small'] },
    { id: 12, name: 'Chicken Pizza (MEDIUM)', price: 15000, category: 'medium', categories: ['medium', 'pizzas'] },
    { id: 13, name: 'Only Large Pizza', price: 12000, category: 'large', categories: ['large', 'pizzas'] },
    { id: 14, name: 'Manual Variants', price: 9000, category: 'pizzas', categories: ['pizzas'], variants: [{ name: 'XL', price: 15000 }] },
  ];

  const grouped = groupLegacyMenuVariants(items);

  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].name, 'Chicken Pizza');
  assert.deepEqual(grouped[0].categories, ['pizzas']);
  assert.deepEqual(grouped[0].variants.map(({ name, price, menuItemId }) => ({ name, price, menuItemId })), [
    { name: 'Small', price: 10000, menuItemId: 11 },
    { name: 'Medium', price: 15000, menuItemId: 12 },
    { name: 'Large', price: 18000, menuItemId: 10 },
  ]);
  assert.equal(grouped[1].name, 'Only Large Pizza');
  assert.equal(grouped[2].name, 'Manual Variants');
});

test('variant names are recognized as non-category filters without hiding real category slugs', () => {
  for (const label of ['Full', 'Half', 'Small', 'Medium', 'Large', 'Single', 'Double', 'Hot', 'Cold', 'Combo', 'Solo']) {
    assert.equal(isMenuVariantCategory(label), true);
  }
  assert.equal(isMenuVariantCategory('cold-drinks'), false);
  assert.equal(isMenuVariantCategory('combos'), false);
});

test('full/half, single/double, hot/cold, and combo/solo rows can all group as variants', () => {
  const items = [
    { id: 20, name: 'Tuna Roll - Full', price: 21000, category: 'full', categories: ['full', 'rolls'] },
    { id: 21, name: 'Tuna Roll - Half', price: 11000, category: 'half', categories: ['half', 'rolls'] },
    { id: 22, name: 'Classic Burger - Single', price: 10000, category: 'single', categories: ['single', 'burgers'] },
    { id: 23, name: 'Classic Burger - Double', price: 15000, category: 'double', categories: ['double', 'burgers'] },
    { id: 24, name: 'Tea - Hot', price: 4000, category: 'hot', categories: ['hot', 'drinks'] },
    { id: 25, name: 'Tea - Cold', price: 5000, category: 'cold', categories: ['cold', 'drinks'] },
    { id: 26, name: 'Chicken Meal - Solo', price: 12000, category: 'solo', categories: ['solo', 'meals'] },
    { id: 27, name: 'Chicken Meal - Combo', price: 18000, category: 'combo', categories: ['combo', 'meals'] },
  ];

  const grouped = groupLegacyMenuVariants(items);

  assert.deepEqual(grouped.map((item) => item.name), ['Tuna Roll', 'Classic Burger', 'Tea', 'Chicken Meal']);
  assert.deepEqual(grouped.map((item) => item.variants.map((variant) => variant.name)), [
    ['Half', 'Full'],
    ['Single', 'Double'],
    ['Hot', 'Cold'],
    ['Solo', 'Combo'],
  ]);
});