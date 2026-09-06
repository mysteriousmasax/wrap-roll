import useSettingsStore from '../store/useSettingsStore';

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
