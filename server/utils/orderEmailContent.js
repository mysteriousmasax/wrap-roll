function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function formatAmount(value) {
  return `TZS ${Number(value || 0).toLocaleString('en-TZ', { maximumFractionDigits: 0 })}`;
}

function orderNumber(order) {
  return order.invoiceNumber || order.invoice_number || order.orderNumber || order.order_number || order.id;
}

function normalizeModifiers(item) {
  const raw = Array.isArray(item?.modifiers) ? item.modifiers : [];
  return raw.flatMap((modifier) => {
    if (!modifier) return [];
    if (typeof modifier === 'string') {
      return [{ name: modifier, price: 0, type: 'add' }];
    }
    if (typeof modifier === 'object') {
      const name = String(modifier.name || modifier.label || 'Extra').trim();
      if (!name) return [];
      return [{
        name,
        price: Number(modifier.price ?? modifier.amount ?? modifier.total ?? 0),
        type: modifier.type || 'add',
      }];
    }
    return [];
  });
}

function orderLines(order) {
  return (order.items || []).map((item) => {
    const quantity = Number(item.qty || item.quantity || 0);
    const basePrice = Number(item.price || 0);
    const modifiers = normalizeModifiers(item);
    const modifierTotal = modifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0);
    return {
      name: item.name || 'Menu item',
      quantity,
      price: basePrice,
      lineTotal: quantity * basePrice,
      modifiers,
      modifierTotal: quantity * modifierTotal,
    };
  });
}

function emailShell(content, logoUrl) {
  return `<div style="margin:0;background:#f7f5f2;padding:24px 12px;font-family:Arial,sans-serif;color:#292522"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #eadfda;border-radius:12px;overflow:hidden"><div style="padding:24px;text-align:center;border-bottom:1px solid #eadfda"><img src="${escapeHtml(logoUrl)}" alt="Wrap &amp; Roll" width="190" style="display:block;width:190px;max-width:100%;height:auto;margin:0 auto"></div><div style="padding:24px">${content}</div></div></div>`;
}

export function buildOrderReceivedEmail(order, logoUrl) {
  const number = orderNumber(order);
  const lines = orderLines(order);
  const itemsText = lines.map((item) => {
    const modifiersText = item.modifiers.length
      ? ` (${item.modifiers.map((modifier) => `${modifier.name}${modifier.price > 0 ? ` + ${formatAmount(modifier.price)}` : ''}`).join(', ')})`
      : '';
    return `${item.quantity} x ${item.name}${modifiersText} — ${formatAmount(item.lineTotal)}`;
  }).join('\n');
  const itemsHtml = lines.map((item) => {
    const modifiersHtml = item.modifiers.length
      ? `<div style="margin-top:6px;font-size:12px;color:#625d59">${item.modifiers.map((modifier) => `+ ${escapeHtml(modifier.name)}${modifier.price > 0 ? ` (${formatAmount(modifier.price)})` : ''}`).join('<br>')}</div>`
      : '';
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #eee"><div style="font-weight:600">${item.quantity} x ${escapeHtml(item.name)}</div>${modifiersHtml}</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${formatAmount(item.lineTotal)}</td></tr>`;
  }).join('');
  const html = emailShell(`<h1 style="margin:0 0 12px;color:#ae002a;font-size:22px">We received your order</h1><p style="line-height:1.6">Hello ${escapeHtml(order.customer || order.customerName || 'there')}, your order <strong>${escapeHtml(number)}</strong> is received and waiting for payment confirmation.</p><table style="width:100%;border-collapse:collapse;margin:20px 0">${itemsHtml}</table><p style="margin:6px 0">Subtotal: ${formatAmount(order.subtotal)}</p><p style="margin:6px 0">Tax: ${formatAmount(order.tax)}</p><p style="margin:10px 0;font-size:18px;font-weight:bold">Total: ${formatAmount(order.total)}</p><p style="line-height:1.6">We’ll email your itemized invoice when payment is confirmed.</p>`, logoUrl);
  const text = `We received your order ${number}, which is waiting for payment confirmation.\n\n${itemsText}\n\nSubtotal: ${formatAmount(order.subtotal)}\nTax: ${formatAmount(order.tax)}\nTotal: ${formatAmount(order.total)}\n\nWe’ll email your itemized invoice when payment is confirmed.`;
  return { subject: `Order received: ${number}`, text, html };
}

export function buildPaidInvoiceEmail(order, settings, logoUrl) {
  const number = orderNumber(order);
  const lines = orderLines(order);
  const companyOrder = order.customerType === 'company' || order.customer_type === 'company';
  const companyName = order.companyName || order.company_name || '';
  const customerName = companyOrder ? companyName : (order.customer || order.customerName || 'Customer');
  const tin = order.customerTin || order.customer_tin || '';
  const invoiceDate = new Date(order.paidAt || order.paid_at || order.createdAt || Date.now()).toLocaleString('en-TZ', { timeZone: 'Africa/Dar_es_Salaam' });
  const itemsText = lines.map((item) => {
    const modifierText = item.modifiers.length
      ? ` (${item.modifiers.map((modifier) => `${modifier.name}${modifier.price > 0 ? ` + ${formatAmount(modifier.price)}` : ''}`).join(', ')})`
      : '';
    return `${item.quantity} x ${item.name}${modifierText} — ${formatAmount(item.lineTotal)}`;
  }).join('\n');
  const itemsHtml = lines.map((item) => {
    const modifierRows = item.modifiers.length
      ? `<div style="margin-top:6px;font-size:12px;color:#625d59">${item.modifiers.map((modifier) => `+ ${escapeHtml(modifier.name)}${modifier.price > 0 ? ` (${formatAmount(modifier.price)})` : ''}`).join('<br>')}</div>`
      : '';
    return `<tr><td style="padding:10px 4px;border-bottom:1px solid #eee"><div style="font-weight:600">${item.quantity} x ${escapeHtml(item.name)}</div>${modifierRows}</td><td style="padding:10px 4px;border-bottom:1px solid #eee;text-align:right">${formatAmount(item.price)}</td><td style="padding:10px 4px;border-bottom:1px solid #eee;text-align:right">${formatAmount(item.lineTotal)}</td></tr>`;
  }).join('');
  const companyDetails = [
    `<p style="margin:5px 0"><strong>Bill to:</strong> ${escapeHtml(customerName)}</p>`,
    companyOrder && tin ? `<p style="margin:5px 0"><strong>Customer TIN:</strong> ${escapeHtml(tin)}</p>` : '',
    !companyOrder && tin ? `<p style="margin:5px 0"><strong>Customer TIN:</strong> ${escapeHtml(tin)}</p>` : '',
    (order.billingAddress || order.billing_address) ? `<p style="margin:5px 0"><strong>Billing address:</strong> ${escapeHtml(order.billingAddress || order.billing_address)}</p>` : '',
  ].join('');
  const issuerTin = settings.tax_id ? `<p style="margin:5px 0"><strong>Wrap &amp; Roll TIN:</strong> ${escapeHtml(settings.tax_id)}</p>` : '';
  const roadsideHtml = order.roadsideTrackingUrl ? `<p style="margin:16px 0"><a href="${escapeHtml(order.roadsideTrackingUrl)}" style="display:inline-block;padding:12px 18px;background:#ae002a;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Open roadside handoff tracking</a></p><p style="font-size:12px;line-height:1.5">Location sharing is optional and starts only when you open the link and allow it.</p>` : '';
  const scheduledHtml = order.scheduledFor ? `<p style="margin:8px 0"><strong>Fulfillment time:</strong> ${escapeHtml(new Date(order.scheduledFor).toLocaleString('en-TZ', { timeZone: 'Africa/Dar_es_Salaam' }))}</p>` : '';
  const html = emailShell(`<h1 style="margin:0 0 8px;color:#ae002a;font-size:22px">Paid invoice</h1><p style="margin:0 0 18px;color:#625d59">Invoice ${escapeHtml(number)} · ${escapeHtml(invoiceDate)}</p><div style="padding:12px;background:#faf7f4;border-radius:8px">${companyDetails}${issuerTin}</div>${scheduledHtml}<table style="width:100%;border-collapse:collapse;margin:20px 0"><thead><tr><th style="padding:8px 4px;text-align:left;border-bottom:2px solid #ae002a">Item</th><th style="padding:8px 4px;text-align:right;border-bottom:2px solid #ae002a">Unit</th><th style="padding:8px 4px;text-align:right;border-bottom:2px solid #ae002a">Amount</th></tr></thead><tbody>${itemsHtml}</tbody></table><p style="margin:6px 0;text-align:right">Subtotal: ${formatAmount(order.subtotal)}</p><p style="margin:6px 0;text-align:right">Tax: ${formatAmount(order.tax)}</p><p style="margin:10px 0;text-align:right;font-size:19px;font-weight:bold;color:#ae002a">Total paid: ${formatAmount(order.total)}</p><p style="margin:8px 0"><strong>Payment method:</strong> ${escapeHtml(order.paymentMethod || order.payment_method || 'Payment received')}</p><p style="margin:8px 0"><strong>Order:</strong> ${escapeHtml(number)}</p>${roadsideHtml}<p style="margin:20px 0 0;line-height:1.6">Thank you for choosing Wrap &amp; Roll.</p>`, logoUrl);
  const text = `PAID INVOICE ${number}\n${invoiceDate}\n\nBill to: ${customerName}${tin ? `\nCustomer TIN: ${tin}` : ''}${order.billingAddress || order.billing_address ? `\nBilling address: ${order.billingAddress || order.billing_address}` : ''}${settings.tax_id ? `\nWrap & Roll TIN: ${settings.tax_id}` : ''}${order.scheduledFor ? `\nFulfillment time: ${new Date(order.scheduledFor).toLocaleString('en-TZ', { timeZone: 'Africa/Dar_es_Salaam' })}` : ''}\n\n${itemsText}\n\nSubtotal: ${formatAmount(order.subtotal)}\nTax: ${formatAmount(order.tax)}\nTotal paid: ${formatAmount(order.total)}\nPayment method: ${order.paymentMethod || order.payment_method || 'Payment received'}${order.roadsideTrackingUrl ? `\n\nRoadside tracking (optional): ${order.roadsideTrackingUrl}` : ''}\n\nThank you for choosing Wrap & Roll.`;
  return { subject: `Paid invoice ${number} — Wrap & Roll`, text, html };
}

export function buildCompanyInvoiceEmail(order, logoUrl) {
  const number = orderNumber(order);
  const companyName = order.companyName || order.customer || 'Company customer';
  const scheduled = order.scheduledFor
    ? new Date(order.scheduledFor).toLocaleString('en-TZ', { timeZone: 'Africa/Dar_es_Salaam' })
    : 'To be arranged with our team';
  const lines = orderLines(order).map((item) => `${item.quantity} x ${item.name} — ${formatAmount(item.lineTotal)}`).join('\n');
  const roadsideHtml = order.roadsideTrackingUrl ? `<p style="margin:16px 0"><a href="${escapeHtml(order.roadsideTrackingUrl)}" style="display:inline-block;padding:12px 18px;background:#ae002a;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Open roadside handoff tracking</a></p><p style="font-size:12px;line-height:1.5">Location sharing is optional and starts only when you open the link and allow it.</p>` : '';
  const html = emailShell(`<h1 style="margin:0 0 12px;color:#ae002a;font-size:22px">Company order invoice</h1><p style="line-height:1.6">Hello ${escapeHtml(companyName)}, your order <strong>${escapeHtml(number)}</strong> is confirmed under approved company invoice terms.</p><p style="margin:8px 0"><strong>Fulfillment time:</strong> ${escapeHtml(scheduled)}</p><table style="width:100%;border-collapse:collapse;margin:20px 0">${orderLines(order).map((item) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee">${item.quantity} x ${escapeHtml(item.name)}</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${formatAmount(item.lineTotal)}</td></tr>`).join('')}</table><p style="margin:6px 0">Subtotal: ${formatAmount(order.subtotal)}</p><p style="margin:6px 0">Tax: ${formatAmount(order.tax)}</p><p style="margin:10px 0;font-size:18px;font-weight:bold">Amount due: ${formatAmount(order.total)}</p><p style="line-height:1.6">This order is payable under the invoice terms approved for your company. We’ll send a separate receipt when payment is recorded.</p>${roadsideHtml}`, logoUrl);
  const text = `Company order invoice ${number}\nHello ${companyName}, your order is confirmed under approved company invoice terms.\nFulfillment time: ${scheduled}\n\n${lines}\n\nSubtotal: ${formatAmount(order.subtotal)}\nTax: ${formatAmount(order.tax)}\nAmount due: ${formatAmount(order.total)}${order.roadsideTrackingUrl ? `\n\nRoadside tracking (optional): ${order.roadsideTrackingUrl}` : ''}\n\nThis order is payable under your approved company invoice terms.`;
  return { subject: `Company order invoice: ${number}`, text, html };
}

export function buildReservationUpdateEmail(order, logoUrl) {
  const number = orderNumber(order);
  const status = String(order.reservationStatus || 'updated').replaceAll('_', ' ');
  const scheduled = order.scheduledFor
    ? new Date(order.scheduledFor).toLocaleString('en-TZ', { timeZone: 'Africa/Dar_es_Salaam' })
    : 'No pickup time selected';
  const refundNote = status === 'cancelled' && ['paid', 'completed'].includes(order.paymentStatus)
    ? 'The payment remains recorded; our team will contact you about any agreed refund.'
    : '';
  const html = emailShell(`<h1 style="margin:0 0 12px;color:#ae002a;font-size:22px">Reservation update</h1><p style="line-height:1.6">Your reservation <strong>${escapeHtml(number)}</strong> is now <strong>${escapeHtml(status)}</strong>.</p><p><strong>Pickup / handoff:</strong> ${escapeHtml(scheduled)}</p><p><strong>Payment:</strong> ${escapeHtml(order.paymentStatus || 'pending')}</p>${refundNote ? `<p style="line-height:1.6">${refundNote}</p>` : ''}<p style="line-height:1.6">If you have questions, contact Wrap &amp; Roll and quote order ${escapeHtml(number)}.</p>`, logoUrl);
  const text = `Reservation update ${number}\nStatus: ${status}\nPickup / handoff: ${scheduled}\nPayment: ${order.paymentStatus || 'pending'}${refundNote ? `\n${refundNote}` : ''}\n\nContact Wrap & Roll with order ${number} if you have questions.`;
  return { subject: `Reservation update: ${number}`, text, html };
}

export function buildRoadsideCompleteEmail(order, logoUrl) {
  const number = orderNumber(order);
  const html = emailShell(`<h1 style="margin:0 0 12px;color:#ae002a;font-size:22px">How was your roadside handoff?</h1><p style="line-height:1.6">Your order <strong>${escapeHtml(number)}</strong> has been handed over. We would value a quick rating of the service.</p>${order.roadsideTrackingUrl ? `<p style="margin:18px 0"><a href="${escapeHtml(order.roadsideTrackingUrl)}" style="display:inline-block;padding:12px 18px;background:#ae002a;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Rate your handoff</a></p>` : ''}<p style="font-size:12px;line-height:1.5">Your location-sharing session has ended. The link can be used to rate this order only.</p>`, logoUrl);
  const text = `Your roadside order ${number} has been handed over. Rate the service: ${order.roadsideTrackingUrl || 'Open your order tracking link.'}\n\nYour location-sharing session has ended.`;
  return { subject: `Rate your roadside handoff: ${number}`, text, html };
}