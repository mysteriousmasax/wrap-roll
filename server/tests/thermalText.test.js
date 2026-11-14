import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThermalCustomerInvoice, buildThermalFiscalInvoice, buildThermalReceipt } from '../../src/utils/thermalText.js';

function linesWithinWidth(text, width) {
  return text.split('\n').every((line) => line.length <= width);
}

test('formats phone receipts for 58 mm paper without over-width lines', () => {
  const text = buildThermalReceipt({
    id: 'WR-123456',
    items: [{ qty: 2, name: 'A very long customized chicken wrap with extra ingredients', price: 14000 }],
    subtotal: 28000,
    tax: 2240,
    total: 30240,
  }, { printer_paper_width_mm: '58' });

  assert.ok(text.includes('WR-123456'));
  assert.ok(text.includes('TOTAL: TZS 30,240'));
  assert.ok(linesWithinWidth(text, 32));
});

test('shows discounts and discount reasons on receipts and invoices', () => {
  const receipt = buildThermalReceipt({
    id: 'WR-DISCOUNT',
    items: [{ qty: 1, name: 'Chicken Wrap', price: 10000 }],
    subtotal: 10000,
    discountAmount: 1000,
    discountLabel: 'Staff discount',
    discountReason: 'Service recovery',
    tax: 720,
    total: 9720,
  });
  const invoice = buildThermalFiscalInvoice({
    id: 'WR-DISCOUNT',
    items: [{ qty: 1, name: 'Chicken Wrap', price: 10000 }],
    subtotal: 10000,
    discount_amount: 1000,
    discount_label: 'Staff discount',
    discount_reason: 'Service recovery',
    tax: 720,
    total: 9720,
  });

  for (const text of [receipt, invoice]) {
    assert.ok(text.includes('Staff discount: -TZS 1,000'));
    assert.ok(text.includes('Reason: Service recovery'));
    assert.ok(text.includes('Subtotal: TZS 10,000'));
    assert.ok(text.includes('TOTAL: TZS 9,720'));
  }
});

test('dine-in receipts show actual payments and the shared tab balance', () => {
  const text = buildThermalReceipt({
    id: 'WR-123457',
    tabId: 'TAB-1',
    items: [{ qty: 1, name: 'Chicken Wrap', price: 10000 }],
    subtotal: 10000,
    tax: 800,
    total: 10800,
    payments: [{ status: 'paid', method: 'cash', amount: 5000, transactionId: null }],
    paidAmount: 5000,
    balanceDue: 5800,
    tabTotal: 15800,
    tabPaid: 5000,
    tabBalanceDue: 10800,
  });

  assert.ok(text.includes('Received cash: TZS 5,000'));
  assert.ok(text.includes('Ticket due: TZS 5,800'));
  assert.ok(text.includes('TAB BALANCE: TZS 10,800'));
  assert.ok(linesWithinWidth(text, 32));
});

test('formats phone fiscal invoices for 80 mm paper', () => {
  const text = buildThermalFiscalInvoice({
    id: 'ORDER-1001',
    invoiceNumber: 'INV-1001',
    customerName: 'Customer',
    items: [{ qty: 1, name: 'A very long customized chicken wrap with extra ingredients', price: 14000 }],
    subtotal: 14000,
    tax: 1120,
    total: 15120,
  }, { printer_paper_width_mm: '80' });

  assert.ok(text.includes('INV-1001'));
  assert.ok(text.includes('TOTAL: TZS 15,120'));
  assert.ok(linesWithinWidth(text, 48));
});

test('formats CRM customer invoices with customer billing details', () => {
  const text = buildThermalCustomerInvoice({
    invoiceNumber: 'INV-20261002-1001',
    customer: { name: 'Customer Name', tin: '123456', billingAddress: 'Dar es Salaam' },
    order: { id: 'WR-1001', subtotal: 10000, tax: 800, total: 10800 },
    items: [{ qty: 1, name: 'Chicken Wrap', price: 10000 }],
  });

  assert.ok(text.includes('Customer Name'));
  assert.ok(text.includes('TIN: 123456'));
  assert.ok(text.includes('INV-20261002-1001'));
  assert.ok(text.includes('TOTAL: TZS 10,800'));
  assert.ok(linesWithinWidth(text, 32));
});

test('shows discounts on CRM customer invoices', () => {
  const text = buildThermalCustomerInvoice({
    invoiceNumber: 'INV-DISCOUNT',
    customer: { name: 'Customer Name' },
    order: {
      id: 'WR-DISCOUNT',
      subtotal: 10000,
      discount_amount: 1000,
      discount_label: 'Staff discount',
      discount_reason: 'Service recovery',
      tax: 720,
      total: 9720,
    },
    items: [{ qty: 1, name: 'Chicken Wrap', price: 10000 }],
  });

  assert.ok(text.includes('Staff discount: -TZS 1,000'));
  assert.ok(text.includes('Reason: Service recovery'));
  assert.ok(text.includes('TOTAL: TZS 9,720'));
  assert.ok(linesWithinWidth(text, 32));
});