import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderReceivedEmail, buildPaidInvoiceEmail } from '../utils/orderEmailContent.js';
import { buildInvoicePdfBuffer } from '../utils/invoicePdf.js';

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

test('paid invoice email includes extra and upgrade charges in the item breakdown', () => {
  const invoice = buildPaidInvoiceEmail({
    ...order,
    items: [{
      name: '2x Chicken Burger',
      qty: 1,
      price: 13000,
      modifiers: [
        { name: 'Burger patty', price: 3000, type: 'add' },
        { name: 'Jalapenos', price: 2000, type: 'add' },
      ],
    }],
  }, { tax_id: '999-888-777' }, 'https://wrapandrolltz.com/wrap-roll-logo-lockup-transparent.png');

  assert.match(invoice.html, /Burger patty/);
  assert.match(invoice.html, /TZS 3,000/);
  assert.match(invoice.html, /Jalapenos/);
  assert.match(invoice.html, /TZS 2,000/);
  assert.match(invoice.text, /Burger patty.*TZS 3,000/s);
});

test('invoice PDF buffer is generated for email attachments', async () => {
  const pdf = await buildInvoicePdfBuffer({
    ...order,
    invoiceNumber: 'INV-20261003-001001',
    items: [{ name: '2x Chicken Burger', qty: 1, price: 13000, modifiers: [{ name: 'Burger patty', price: 3000, type: 'add' }] }],
    subtotal: 13000,
    tax: 1040,
    total: 14040,
  }, { tax_id: '999-888-777' });

  assert.ok(Buffer.isBuffer(pdf));
  assert.match(pdf.toString('latin1'), /PDF/);
  assert.ok(pdf.length > 150);
});