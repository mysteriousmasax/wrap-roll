import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderReceivedEmail, buildPaidInvoiceEmail } from '../utils/orderEmailContent.js';

const order = {
  id: 'WR-20261003-1001',
  invoiceNumber: 'INV-20261003-001001',
  customer: 'Amina Customer',
  customerEmail: 'amina@example.com',
  customerType: 'company',
  companyName: 'Amina Foods & Co',
  customerTin: '123-456-789',
  billingAddress: 'Dar es Salaam',
  subtotal: 10000,
  tax: 800,
  total: 10800,
  paymentMethod: 'lipa_namba',
  paymentStatus: 'paid',
  paidAt: '2026-10-03T12:00:00.000Z',
  items: [{ name: '<Chicken Roll>', qty: 2, price: 5000 }],
};

test('paid company invoice includes logo, invoice number, company TIN, and escaped line items', () => {
  const invoice = buildPaidInvoiceEmail(order, { tax_id: '999-888-777' }, 'https://wrapandrolltz.com/wrap-roll-logo-lockup-transparent.png');

  assert.match(invoice.subject, /INV-20261003-001001/);
  assert.match(invoice.html, /wrap-roll-logo-lockup-transparent\.png/);
  assert.match(invoice.html, /Amina Foods &amp; Co/);
  assert.match(invoice.html, /Customer TIN:<\/strong> 123-456-789/);
  assert.match(invoice.html, /&lt;Chicken Roll&gt;/);
  assert.match(invoice.html, /Wrap &amp; Roll TIN:<\/strong> 999-888-777/);
  assert.match(invoice.text, /Total paid: TZS 10,800/);
});

test('order confirmation explains that the invoice follows payment', () => {
  const confirmation = buildOrderReceivedEmail(order, 'https://wrapandrolltz.com/wrap-roll-logo-lockup-transparent.png');

  assert.match(confirmation.subject, /Order received/);
  assert.match(confirmation.text, /waiting for payment confirmation/);
  assert.match(confirmation.text, /invoice when payment is confirmed/);
  assert.match(confirmation.html, /<img[^>]+wrap-roll-logo-lockup-transparent\.png/);
});