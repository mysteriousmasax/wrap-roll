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
