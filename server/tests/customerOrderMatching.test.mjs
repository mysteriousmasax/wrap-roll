import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomerOrderMatcher } from '../utils/customerOrderMatching.js';

test('customer order matching prefers customer ID and normalized unique contacts', () => {
  const customers = [
    { id: 1, name: 'Alex Kim', phone: '+255712345678', email: 'alex@example.com' },
    { id: 2, name: 'Alex Kim', phone: '+255713456789', email: 'other@example.com' },
    { id: 3, name: 'Sam Guest', phone: '', email: '' },
  ];
  const resolveCustomer = createCustomerOrderMatcher(customers);

  assert.equal(resolveCustomer({ customer_id: 2, customer_phone: '0712345678', customer_email: 'alex@example.com' }).id, 2);
  assert.equal(resolveCustomer({ customer_phone: '0712 345 678' }).id, 1);
  assert.equal(resolveCustomer({ customer_email: ' ALEX@example.com ' }).id, 1);
  assert.equal(resolveCustomer({ customer_name: 'Alex Kim' }), null);
  assert.equal(resolveCustomer({ customer_name: 'Sam Guest' }).id, 3);
  assert.equal(resolveCustomer({ customer_id: 999, customer_name: 'Sam Guest' }), null);
});