import PDFDocument from 'pdfkit';

function formatAmount(value) {
  return `TZS ${Number(value || 0).toLocaleString('en-TZ', { maximumFractionDigits: 0 })}`;
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
      const price = Number(modifier.price ?? modifier.amount ?? modifier.total ?? 0);
      if (!name) return [];
      return [{ name, price, type: modifier.type || 'add' }];
    }
    return [];
  });
}

export async function buildInvoicePdfBuffer(order = {}, settings = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks = [];

  return new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const invoiceNumber = order.invoiceNumber || order.invoice_number || order.orderNumber || order.order_number || order.id || 'INVOICE';
    const customerName = order.customerName || order.customer || order.customer_name || 'Customer';
    const companyName = order.companyName || order.company_name || '';
    const billingAddress = order.billingAddress || order.billing_address || '';
    const tin = order.customerTin || order.customer_tin || settings.tax_id || '';
    const items = Array.isArray(order.items) ? order.items : [];
    const subtotal = Number(order.subtotal || items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || item.quantity || 1)), 0));
    const tax = Number(order.tax || 0);
    const total = Number(order.total || subtotal + tax);

    doc.fontSize(24).text('Wrap & Roll', { align: 'center', underline: true });
    doc.moveDown(0.6);
    doc.fontSize(18).text('Invoice', { align: 'center' });
    doc.moveDown(0.8);
    doc.fontSize(10).text(`Invoice No: ${invoiceNumber}`);
    doc.text(`Date: ${new Date(order.paidAt || order.paid_at || order.createdAt || Date.now()).toLocaleString('en-TZ', { timeZone: 'Africa/Dar_es_Salaam' })}`);
    doc.text(`Customer: ${customerName}`);
    if (companyName) doc.text(`Company: ${companyName}`);
    if (tin) doc.text(`TIN: ${tin}`);
    if (billingAddress) doc.text(`Billing address: ${billingAddress}`);
    doc.moveDown(1);

    doc.fontSize(12).text('Item', 48, doc.y, { width: 250 });
    doc.text('Amount', 360, doc.y, { width: 100, align: 'right' });
    doc.moveDown(0.6);
    doc.moveTo(48, doc.y).lineTo(548, doc.y).stroke();

    items.forEach((item) => {
      const qty = Number(item.qty || item.quantity || 1);
      const unitPrice = Number(item.price || 0);
      const modifiers = normalizeModifiers(item);
      const lineTotal = qty * unitPrice;
      doc.moveDown(0.5);
      doc.fontSize(10).text(`${qty}x ${item.name || 'Menu item'}`, 48, doc.y, { width: 280, continued: false });
      doc.text(formatAmount(lineTotal), 360, doc.y, { width: 120, align: 'right' });
      if (modifiers.length) {
        doc.moveDown(0.2);
        modifiers.forEach((modifier) => {
          const modifierCost = Number(modifier.price || 0) * qty;
          doc.fontSize(8).fillColor('#666').text(`  + ${modifier.name} (${modifierCost > 0 ? formatAmount(modifierCost) : 'Included'})`, 64, doc.y, { width: 300 });
        });
      }
      doc.fillColor('#000');
    });

    doc.moveDown(1);
    doc.moveTo(48, doc.y).lineTo(548, doc.y).stroke();
    doc.fontSize(11).text('Subtotal', 48, doc.y + 12, { width: 320 });
    doc.text(formatAmount(subtotal), 360, doc.y + 12, { width: 120, align: 'right' });
    doc.text('Tax', 48, doc.y + 24, { width: 320 });
    doc.text(formatAmount(tax), 360, doc.y + 24, { width: 120, align: 'right' });
    doc.fontSize(13).font('Helvetica-Bold').text('Total', 48, doc.y + 36, { width: 320 });
    doc.text(formatAmount(total), 360, doc.y + 36, { width: 120, align: 'right' });
    doc.fontSize(10).fillColor('#666').text('Thank you for shopping with Wrap & Roll.', 48, doc.y + 60, { width: 460 });
    doc.end();
  });
}
