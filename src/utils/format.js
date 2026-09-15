import useSettingsStore from '../store/useSettingsStore';
import { api } from '../api/client';

export const formatCurrency = (amount, currency) => {
  const cur = currency || useSettingsStore.getState().getCurrency() || localStorage.getItem('wraproll_display_currency') || 'TZS';
  if (cur === 'TZS') {
    return 'TZS ' + Number(amount).toLocaleString('en-TZ');
  }
  const rates = { USD: 0.00039, KES: 0.060, TZS: 1 };
  const symbols = { USD: '$', KES: 'KES ' };
  return (symbols[cur] || `${cur} `) + (Number(amount) * (rates[cur] || 1)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatNumber = (num) => new Intl.NumberFormat('en-US').format(num);
export const formatPercent = (num) => (num > 0 ? '+' : '') + num.toFixed(1) + '%';
export const formatDate = (date) => new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
export const formatTime = (date) => new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

export function printReceipt(order) {
  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) return;
  const items = (order.items || [])
    .map((i) => `<tr><td>${i.qty}x ${i.name}</td><td align="right">${formatCurrency(i.price * i.qty)}</td></tr>`)
    .join('');
  win.document.write(`
    <html><head><title>Receipt ${order.id}</title>
    <style>body{font-family:monospace;padding:20px;font-size:12px}table{width:100%}h2{text-align:center}</style></head>
    <body>
      <h2>Wrap & Roll</h2>
      <p>Order: <strong>${order.id}</strong></p>
      <p>Date: ${new Date().toLocaleString()}</p>
      <p>Type: ${order.type || order.orderType || ''}</p>
      <hr/>
      <table>${items}</table>
      <hr/>
      <p>Subtotal: ${formatCurrency(order.subtotal || 0)}</p>
      <p>Tax: ${formatCurrency(order.tax || 0)}</p>
      <p><strong>Total: ${formatCurrency(order.total || 0)}</strong></p>
      <p>Payment: ${order.paymentMethod || order.method || ''}</p>
      <script>window.print();</script>
    </body></html>
  `);
  win.document.close();
}

export async function printThermalReceipt(order) {
  try {
    await api.printReceipt(order);
    return true;
  } catch {
    printReceipt(order);
    return false;
  }
}

export function printInvoice(invoice, printWindow = null) {
  const win = printWindow || window.open('', '_blank', 'width=720,height=900');
  if (!win) return;
  const customer = invoice.customer || {};
  const items = (invoice.items || []).map((item) => `<tr><td>${item.qty}x ${item.name}</td><td align="right">${formatCurrency(item.price * item.qty, invoice.order?.currency || 'TZS')}</td></tr>`).join('');
  win.document.write(`<html><head><title>${invoice.invoiceNumber}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#24211e}header{display:flex;justify-content:space-between;border-bottom:2px solid #ae002a;padding-bottom:16px}table{width:100%;border-collapse:collapse;margin:24px 0}td{padding:8px 0;border-bottom:1px solid #eee}h1{color:#ae002a}footer{margin-top:40px;font-size:12px;color:#746e67}</style></head><body><header><div><h1>Wrap &amp; Roll</h1><p>Invoice ${invoice.invoiceNumber}</p></div><div><strong>${customer.customerType === 'company' ? customer.companyName || customer.name : customer.name}</strong><p>${customer.tin ? `TIN: ${customer.tin}<br>` : ''}${customer.billingAddress || customer.address || ''}</p></div></header><p>Order: ${invoice.order?.order_number || invoice.order?.id || ''}</p><table>${items}</table><p>Subtotal: ${formatCurrency(invoice.order?.subtotal || 0)}</p><p>Tax: ${formatCurrency(invoice.order?.tax || 0)}</p><h2>Total: ${formatCurrency(invoice.order?.total || 0)}</h2><footer>Issued ${new Date(invoice.createdAt).toLocaleString()}</footer><script>window.print()</script></body></html>`);
  win.document.close();
}

export function printFiscalInvoice(order, settings = {}, printWindow = null) {
  const win = printWindow || window.open('', '_blank', 'width=420,height=760');
  if (!win) return false;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const customer = order.customer || {};
  const items = (order.items || []).map((item) => `<tr><td>${esc(item.name)}<br>${item.qty} x ${formatCurrency(item.price, settings.currency || 'TZS')}</td><td>${formatCurrency(Number(item.price || 0) * Number(item.qty || 0), settings.currency || 'TZS')}</td></tr>`).join('');
  const receiptNumber = order.receiptNumber || order.receipt_number || 'Pending VFD';
  const verificationCode = order.verificationCode || order.verification_code || 'Pending VFD';
  const taxRate = Number(settings.vat_rate || settings.tax_rate || 0).toFixed(2);
  const tax = Number(order.tax || 0);
  const total = Number(order.total || 0);
  win.document.write(`<html><head><title>Receipt ${esc(order.id || '')}</title><style>@page{size:58mm auto;margin:0}*{box-sizing:border-box}body{width:58mm;margin:0;padding:3mm 2.5mm;font-family:Arial,sans-serif;font-size:10px;color:#111}h1,h2,p{margin:0}h1{font-size:13px;text-align:center;margin-bottom:2px}h2{font-size:11px;text-align:center;margin:5px 0}p{line-height:1.35}.center{text-align:center}.rule{border-top:1px dashed #111;margin:6px 0}table{width:100%;border-collapse:collapse}th{text-align:left;border-bottom:1px solid #111;padding-bottom:3px}th:last-child,td:last-child{text-align:right;vertical-align:top}td{padding:3px 0;vertical-align:top;word-break:break-word}.total{font-weight:700;font-size:12px}.small{font-size:9px}.vfd{font-weight:700;margin-top:7px}</style></head><body><h2>*** START OF LEGAL RECEIPT ***</h2><h1>${esc(settings.restaurant_name || 'Wrap & Roll')}</h1><p class="center">${esc(settings.branch_location || '')}</p><p class="center">TEL: ${esc(settings.phone || '')}</p><p class="center">TIN: ${esc(settings.tax_id || 'Not configured')}</p><p class="center">VRN: ${esc(settings.tra_vrn || 'NOT REGISTERED')}</p><p class="center">SERIAL NUMBER: ${esc(settings.tra_serial_number || 'Pending VFD')}</p><p class="center">UIN: ${esc(settings.tra_uin || 'Pending VFD')}</p><p class="center">${esc(settings.branch_location || '')}</p><div class="rule"></div><p>CUSTOMER NAME: ${esc(customer.name || order.customerName || order.customer_name || 'Walk-in customer')}</p><p>CUSTOMER ID TYPE: ${esc(customer.tin || customer.customerTin ? 'TIN' : '')}</p><p>CUSTOMER ID: ${esc(customer.tin || customer.customerTin || '')}</p><p>CUSTOMER VRN: ${esc(customer.vrn || '')}</p><p>CUSTOMER MOBILE: ${esc(customer.phone || order.customerPhone || order.customer_phone || '')}</p><div class="rule"></div><p>RECEIPT NUMBER: ${esc(receiptNumber)}</p><p>DATE: ${new Date(order.paidAt || order.paid_at || Date.now()).toLocaleDateString('en-CA')} TIME: ${new Date(order.paidAt || order.paid_at || Date.now()).toLocaleTimeString('en-GB')}</p><div class="rule"></div><table><thead><tr><th>DESCRIPTION QTY</th><th>AMOUNT</th></tr></thead><tbody>${items}</tbody></table><div class="rule"></div><p>TOTAL EXCL OF TAX: ${formatCurrency(total - tax, settings.currency || 'TZS')}</p><p>DISCOUNT: ${formatCurrency(0, settings.currency || 'TZS')}</p><p>TAX A - ${taxRate}%: ${formatCurrency(tax, settings.currency || 'TZS')}</p><p>TOTAL TAX: ${formatCurrency(tax, settings.currency || 'TZS')}</p><p class="total">TOTAL INCL OF TAX: ${formatCurrency(total, settings.currency || 'TZS')}</p><p>PAYMENT: ${esc(order.paymentMethod || order.payment_method || 'Mobile money')}</p><p class="center vfd">RECEIPT VERIFICATION CODE</p><p class="center">${esc(verificationCode)}</p><p class="center small">Order: ${esc(order.orderNumber || order.order_number || order.id || '')}</p><h2>*** END OF LEGAL RECEIPT ***</h2><script>window.print();</script></body></html>`);
  win.document.close();
  return true;
}
