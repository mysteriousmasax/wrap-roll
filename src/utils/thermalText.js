function wrap(value, width) {
  const words = String(value ?? '').replace(/[\r\n]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
    while (line.length > width) {
      lines.push(line.slice(0, width));
      line = line.slice(width);
    }
  }
  if (line) lines.push(line);
  return lines;
}

function formatMoney(value, currency) {
  return `${currency} ${Number(value || 0).toLocaleString('en-TZ')}`;
}

function profileWidth(settings) {
  return Number(settings.printer_paper_width_mm || 58) >= 80 ? 48 : 32;
}

export function buildThermalReceipt(order, settings = {}) {
  const width = profileWidth(settings);
  const currency = settings.currency || 'TZS';
  const lines = [
    settings.restaurant_name || 'Wrap & Roll',
    settings.branch_location || '',
    settings.phone ? `TEL: ${settings.phone}` : '',
    `ORDER: ${order.id || order.orderId || ''}`,
    `DATE: ${new Date(order.createdAt || Date.now()).toLocaleString()}`,
    order.customer || order.customerName ? `CUSTOMER: ${order.customer || order.customerName}` : '',
    '-'.repeat(width),
  ].filter(Boolean).flatMap((line) => wrap(line, width));

  for (const item of order.items || []) {
    lines.push(...wrap(`${item.qty || 0}x ${item.name || ''}`, width));
    lines.push(...wrap(`  ${formatMoney(Number(item.price || 0) * Number(item.qty || 0), currency)}`, width));
  }

  lines.push(
    '-'.repeat(width),
    ...wrap(`Subtotal: ${formatMoney(order.subtotal, currency)}`, width),
    ...wrap(`Tax: ${formatMoney(order.tax, currency)}`, width),
    ...wrap(`TOTAL: ${formatMoney(order.total, currency)}`, width),
    ...wrap(`Payment: ${order.paymentMethod || order.method || ''}`, width),
    ...wrap(settings.invoice_footer || 'Thank you for dining with us.', width),
  );
  return lines.join('\n');
}

export function buildThermalFiscalInvoice(order, settings = {}) {
  const width = profileWidth(settings);
  const currency = settings.currency || 'TZS';
  const customer = order.customer || {};
  const invoiceNumber = order.invoiceNumber || order.invoice_number || order.orderNumber || order.order_number || order.id || '';
  const lines = [
    settings.invoice_title || 'INVOICE',
    settings.restaurant_name || 'Wrap & Roll',
    settings.branch_location || '',
    settings.phone ? `TEL: ${settings.phone}` : '',
    `CUSTOMER: ${customer.name || order.customerName || order.customer_name || 'Walk-in customer'}`,
    customer.phone || order.customerPhone || order.customer_phone ? `MOBILE: ${customer.phone || order.customerPhone || order.customer_phone}` : '',
    `INVOICE: ${invoiceNumber}`,
    `DATE: ${new Date(order.paidAt || order.paid_at || Date.now()).toLocaleString()}`,
    '-'.repeat(width),
  ].filter(Boolean).flatMap((line) => wrap(line, width));

  for (const item of order.items || []) {
    lines.push(...wrap(`${item.name || ''} x${item.qty || 0}`, width));
    lines.push(...wrap(`  ${formatMoney(Number(item.price || 0) * Number(item.qty || 0), currency)}`, width));
  }

  const tax = Number(order.tax || 0);
  const total = Number(order.total || 0);
  if (settings.invoice_show_tax !== 'false') {
    lines.push(...wrap(`Subtotal: ${formatMoney(total - tax, currency)}`, width));
    lines.push(...wrap(`Tax: ${formatMoney(tax, currency)}`, width));
  }
  lines.push(
    ...wrap(`TOTAL: ${formatMoney(total, currency)}`, width),
    ...wrap(`Payment: ${order.paymentMethod || order.payment_method || 'Mobile money'}`, width),
    ...wrap(settings.invoice_footer || 'Thank you for your business.', width),
  );
  return lines.join('\n');
}

export function buildThermalCustomerInvoice(invoice) {
  const width = 32;
  const currency = invoice.order?.currency || 'TZS';
  const customer = invoice.customer || {};
  const lines = [
    'WRAP & ROLL',
    `INVOICE ${invoice.invoiceNumber || ''}`,
    customer.customerType === 'company' ? customer.companyName || customer.name : customer.name,
    customer.tin ? `TIN: ${customer.tin}` : '',
    customer.billingAddress || customer.address || '',
    `ORDER: ${invoice.order?.order_number || invoice.order?.id || ''}`,
    '-'.repeat(width),
  ].filter(Boolean).flatMap((line) => wrap(line, width));

  for (const item of invoice.items || []) {
    lines.push(...wrap(`${item.qty}x ${item.name}`, width));
    lines.push(...wrap(`  ${formatMoney(Number(item.price || 0) * Number(item.qty || 0), currency)}`, width));
  }

  lines.push(
    '-'.repeat(width),
    ...wrap(`Subtotal: ${formatMoney(invoice.order?.subtotal, currency)}`, width),
    ...wrap(`Tax: ${formatMoney(invoice.order?.tax, currency)}`, width),
    ...wrap(`TOTAL: ${formatMoney(invoice.order?.total, currency)}`, width),
    `Issued: ${new Date(invoice.createdAt || Date.now()).toLocaleString()}`,
  );
  return lines.join('\n');
}