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
  );
  const discountAmount = Number(order.discountAmount || order.discount_amount || 0);
  if (discountAmount > 0) {
    lines.push(...wrap(`${order.discountLabel || order.discount_label || 'Discount'}: -${formatMoney(discountAmount, currency)}`, width));
    if (order.discountReason || order.discount_reason) lines.push(...wrap(`Reason: ${order.discountReason || order.discount_reason}`, width));
  }
  lines.push(...wrap(`Tax: ${formatMoney(order.tax, currency)}`, width), ...wrap(`TOTAL: ${formatMoney(order.total, currency)}`, width));
  if (order.tabId) {
    for (const payment of order.payments || []) {
      if (!['paid', 'completed'].includes(payment.status)) continue;
      lines.push(...wrap(`Received ${payment.method || 'payment'}: ${formatMoney(payment.amount, currency)}`, width));
      if (payment.transactionId) lines.push(...wrap(`Reference: ${payment.transactionId}`, width));
    }
    lines.push(
      ...wrap(`Ticket paid: ${formatMoney(order.paidAmount || 0, currency)}`, width),
      ...wrap(`Ticket due: ${formatMoney(order.balanceDue || 0, currency)}`, width),
      ...wrap(`TABLE TAB: ${formatMoney(order.tabTotal || 0, currency)}`, width),
      ...wrap(`Tab paid: ${formatMoney(order.tabPaid || 0, currency)}`, width),
      ...wrap(`TAB BALANCE: ${formatMoney(order.tabBalanceDue || 0, currency)}`, width),
    );
  } else {
    lines.push(...wrap(`Payment: ${order.paymentMethod || order.method || ''}`, width));
  }
  lines.push(
    ...wrap(settings.invoice_footer || 'Thank you for dining with us.', width),
  );
  return lines.join('\n');
}

export function buildThermalFiscalInvoice(order, settings = {}) {
  const width = profileWidth(settings);
  const currency = settings.currency || 'TZS';
  const customer = typeof order.customer === 'object' ? order.customer : {};
  const customerType = order.customerType || order.customer_type || customer.customerType || 'individual';
  const customerName = customerType === 'company'
    ? order.companyName || order.company_name || customer.companyName || order.customerName || order.customer_name || customer.name
    : order.customerName || order.customer_name || customer.name || order.customer;
  const customerTin = order.customerTin || order.customer_tin || customer.tin || '';
  const invoiceNumber = order.invoiceNumber || order.invoice_number || order.orderNumber || order.order_number || order.id || '';
  const lines = [
    settings.invoice_title || 'INVOICE',
    settings.restaurant_name || 'Wrap & Roll',
    settings.branch_location || '',
    settings.phone ? `TEL: ${settings.phone}` : '',
    `CUSTOMER: ${customerName || 'Walk-in customer'}`,
    customer.phone || order.customerPhone || order.customer_phone ? `MOBILE: ${customer.phone || order.customerPhone || order.customer_phone}` : '',
    customerTin ? `CUSTOMER TIN: ${customerTin}` : '',
    order.billingAddress || order.billing_address ? `BILLING: ${order.billingAddress || order.billing_address}` : '',
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
    lines.push(...wrap(`Subtotal: ${formatMoney(order.subtotal ?? total - tax + Number(order.discountAmount || order.discount_amount || 0), currency)}`, width));
  }
  const discountAmount = Number(order.discountAmount || order.discount_amount || 0);
  if (discountAmount > 0) {
    lines.push(...wrap(`${order.discountLabel || order.discount_label || 'Discount'}: -${formatMoney(discountAmount, currency)}`, width));
    if (order.discountReason || order.discount_reason) lines.push(...wrap(`Reason: ${order.discountReason || order.discount_reason}`, width));
  }
  if (settings.invoice_show_tax !== 'false') {
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
  );
  const discountAmount = Number(invoice.order?.discount_amount || invoice.order?.discountAmount || 0);
  if (discountAmount > 0) {
    lines.push(...wrap(`${invoice.order?.discount_label || invoice.order?.discountLabel || 'Discount'}: -${formatMoney(discountAmount, currency)}`, width));
    const discountReason = invoice.order?.discount_reason || invoice.order?.discountReason;
    if (discountReason) lines.push(...wrap(`Reason: ${discountReason}`, width));
  }
  lines.push(
    ...wrap(`Tax: ${formatMoney(invoice.order?.tax, currency)}`, width),
    ...wrap(`TOTAL: ${formatMoney(invoice.order?.total, currency)}`, width),
    `Issued: ${new Date(invoice.createdAt || Date.now()).toLocaleString()}`,
  );
  return lines.join('\n');
}