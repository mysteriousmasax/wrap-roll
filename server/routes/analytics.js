import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { createRequire } from 'module';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs');
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { getOrders } from '../utils/orders.js';
import { generateOfflineAgentReply, generateOperationsReport, generateStaffAssistantReply } from '../utils/gemini.js';
import { aiProvider, recordAiActivity } from '../utils/aiActivity.js';

const router = Router();
const logoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/wrap-roll-logo-lockup-transparent.png');

router.get('/sales', authMiddleware, (req, res) => {
  res.json(getSeriesForRange('month'));
});

function buildRangeSeries(rows, formatLabel) {
  return rows.map((row) => ({
    label: formatLabel(row.label),
    revenue: Number(row.revenue ?? 0),
    orders: Number(row.orders ?? 0),
    profit: Number(row.profit ?? 0),
  }));
}

function getSeriesForRange(range) {
  const groups = new Map();
  const orders = getLiveOrders();

  for (const order of orders) {
    const created = new Date(order.created_at);
    let key;
    if (range === 'day') key = created.toISOString().slice(0, 10);
    else if (range === 'week') {
      const start = new Date(created);
      const diff = (start.getUTCDay() + 6) % 7;
      start.setUTCDate(start.getUTCDate() - diff);
      key = start.toISOString().slice(0, 10);
    } else key = created.toISOString().slice(0, 7);

    const current = groups.get(key) || { revenue: 0, orders: 0, profit: 0 };
    const revenue = Number(order.total || 0);
    current.revenue += revenue;
    current.orders += 1;
    current.profit += revenue * 0.28;
    groups.set(key, current);
  }

  const rows = [...groups.entries()].map(([label, data]) => ({ label, revenue: data.revenue, orders: data.orders, profit: data.profit }));
  rows.sort((a, b) => a.label.localeCompare(b.label));

  if (range === 'day') {
    return buildRangeSeries(rows.slice(-7), (label) => new Date(`${label}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  }
  if (range === 'week') {
    return buildRangeSeries(rows.slice(-8), (label) => new Date(`${label}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  }
  return buildRangeSeries(rows.slice(-12), (label) => new Date(`${label}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));
}

function getLiveOrders() {
  return db.prepare("SELECT created_at, total, order_type, status FROM orders WHERE created_at IS NOT NULL AND status != 'cancelled'").all();
}

function getCurrentPeriodRevenue(start, end) {
  return db.prepare("SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'cancelled'").get(start, end);
}

router.get('/summary', authMiddleware, (req, res) => {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const tomorrowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const todayTotals = getCurrentPeriodRevenue(todayStart, tomorrowStart);
  const monthTotals = getCurrentPeriodRevenue(monthStart, nextMonthStart);
  const activeOrders = getOrders({ status: 'pending,preparing,ready' });
  const todayOrders = getOrders({}).filter((o) => o.createdAt >= todayStart && o.createdAt < tomorrowStart);
  const summaryRanges = {
    day: getSeriesForRange('day'),
    week: getSeriesForRange('week'),
    month: getSeriesForRange('month'),
  };

  const todayRevenue = Number(todayTotals.revenue || 0);
  const avgOrder = todayOrders.length ? todayRevenue / todayOrders.length : 0;
  const allOrders = getLiveOrders();
  const channelMix = allOrders.reduce((mix, order) => {
    mix[order.order_type] = (mix[order.order_type] || 0) + 1;
    return mix;
  }, {});
  const channelTotal = Object.values(channelMix).reduce((sum, count) => sum + count, 0);
  const channelPercentages = Object.fromEntries(
    Object.entries(channelMix).map(([channel, count]) => [channel, channelTotal ? Math.round((count / channelTotal) * 100) : 0])
  );

  res.json({
    monthlyRevenue: Number(monthTotals.revenue || 0),
    monthlyProfit: Number(monthTotals.revenue || 0) * 0.28,
    monthlyOrders: Number(monthTotals.orders || 0),
    todayRevenue: Number(todayTotals.revenue || 0),
    todayOrders: Number(todayTotals.orders || 0),
    avgOrderValue: avgOrder,
    activeKitchenOrders: activeOrders.length,
    pendingOrders: activeOrders.filter((o) => o.status === 'pending').length,
    preparingOrders: activeOrders.filter((o) => o.status === 'preparing').length,
    readyOrders: activeOrders.filter((o) => o.status === 'ready').length,
    channelMix,
    channelPercentages,
    ranges: summaryRanges,
  });
});

router.get('/categories', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT mi.category, SUM(oi.price * oi.qty) as revenue
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id AND o.status != 'cancelled'
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    GROUP BY mi.category
    ORDER BY revenue DESC
  `).all();
  const total = rows.reduce((sum, row) => sum + row.revenue, 0);
  const labels = { wraps: 'Signature Wraps', rolls: 'Classic Rolls', sides: 'Sides', drinks: 'Drinks' };
  res.json(rows.map((row) => ({
    name: labels[row.category] || row.category || 'Other',
    value: total ? Math.round((row.revenue / total) * 100) : 0,
    revenue: row.revenue,
  })));
});

router.get('/reports', authMiddleware, (req, res) => {
  const salesData = getSeriesForRange('month');
  const totalRevenue = salesData.reduce((s, r) => s + r.revenue, 0);
  const daySeries = getSeriesForRange('day');
  const weekSeries = getSeriesForRange('week');
  const monthSeries = getSeriesForRange('month');
  const categoryRows = db.prepare(`
    SELECT mi.category, COALESCE(SUM(oi.price * oi.qty), 0) AS amount
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id AND o.status != 'cancelled'
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    GROUP BY mi.category
  `).all();
  const paymentRows = db.prepare(`
    SELECT payment_method AS method, COALESCE(SUM(total), 0) AS amount
    FROM orders
    WHERE status != 'cancelled' AND payment_method IS NOT NULL
    GROUP BY payment_method
    ORDER BY amount DESC
  `).all();
  const expenseRows = db.prepare(`
    SELECT category, COALESCE(SUM(amount), 0) AS amount
    FROM business_expenses
    WHERE status != 'rejected'
    GROUP BY category
  `).all();
  const payrollTotal = Number(db.prepare('SELECT COALESCE(SUM(net_pay), 0) AS amount FROM payroll_records').get().amount || 0);
  const foodSales = categoryRows
    .filter((row) => !['drinks', 'beverages', 'coffee'].includes(String(row.category || '').toLowerCase()))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const beverageSales = categoryRows
    .filter((row) => ['drinks', 'beverages', 'coffee'].includes(String(row.category || '').toLowerCase()))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const costOfGoods = expenseRows
    .filter((row) => ['food supplies', 'inventory', 'cost of goods'].includes(String(row.category || '').toLowerCase()))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const operatingExpenses = expenseRows
    .filter((row) => !['food supplies', 'inventory', 'cost of goods'].includes(String(row.category || '').toLowerCase()))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const paymentTotal = paymentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalExpenses = expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalProfit = totalRevenue - totalExpenses - payrollTotal;
  const vatRate = Number(db.prepare("SELECT value FROM settings WHERE key = 'vat_rate'").get()?.value || 0);
  const taxLiability = totalRevenue * (vatRate / 100);
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previousMonth = previousMonthDate.toISOString().slice(0, 7);
  const periodRevenue = (month) => Number(db.prepare("SELECT COALESCE(SUM(total), 0) AS amount FROM orders WHERE status != 'cancelled' AND substr(created_at, 1, 7) = ?").get(month).amount || 0);
  const periodExpenses = (month) => Number(db.prepare("SELECT COALESCE(SUM(amount), 0) AS amount FROM business_expenses WHERE status != 'rejected' AND substr(expense_date, 1, 7) = ?").get(month).amount || 0);
  const periodPayroll = (month) => Number(db.prepare("SELECT COALESCE(SUM(net_pay), 0) AS amount FROM payroll_records WHERE substr(pay_period, 1, 7) = ?").get(month).amount || 0);
  const currentPeriodRevenue = periodRevenue(currentMonth);
  const previousPeriodRevenue = periodRevenue(previousMonth);
  const currentPeriodProfit = currentPeriodRevenue - periodExpenses(currentMonth) - periodPayroll(currentMonth);
  const previousPeriodProfit = previousPeriodRevenue - periodExpenses(previousMonth) - periodPayroll(previousMonth);
  const changePercent = (current, previous) => previous ? Number((((current - previous) / previous) * 100).toFixed(1)) : null;
  const percentage = (amount, total = totalRevenue) => total ? `${((amount / total) * 100).toFixed(1)}%` : '0.0%';

  res.json({
    reportTypes: [
      { id: 'sales', label: 'Sales summary' },
      { id: 'pnl', label: 'Profit and loss' },
      { id: 'payments', label: 'Payment reconciliation' },
      { id: 'tax', label: 'VAT / tax summary' },
      { id: 'expenses', label: 'Operating expenses' },
      { id: 'payroll', label: 'Payroll and labor' },
      { id: 'inventory', label: 'Inventory valuation' },
      { id: 'orders', label: 'Order performance' },
    ],
    exportFormats: [
      { id: 'csv', label: 'CSV' },
      { id: 'json', label: 'JSON' },
      { id: 'html', label: 'HTML / Print' },
      { id: 'pdf', label: 'PDF' },
      { id: 'xlsx', label: 'Excel' },
      { id: 'docx', label: 'Word' },
      { id: 'pptx', label: 'PowerPoint' },
    ],
    salesData,
    totalRevenue,
    totalProfit,
    profitMargin: totalRevenue ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0,
    taxRate: vatRate,
    taxLiability,
    financialChanges: { revenue: changePercent(currentPeriodRevenue, previousPeriodRevenue), profit: changePercent(currentPeriodProfit, previousPeriodProfit), margin: changePercent(currentPeriodRevenue ? (currentPeriodProfit / currentPeriodRevenue) * 100 : 0, previousPeriodRevenue ? (previousPeriodProfit / previousPeriodRevenue) * 100 : 0) },
    ranges: {
      day: daySeries,
      week: weekSeries,
      month: monthSeries,
    },
    paymentMethods: paymentRows.map((row) => ({
      method: row.method,
      amount: Number(row.amount || 0),
      pct: paymentTotal ? Math.round((Number(row.amount || 0) / paymentTotal) * 100) : 0,
    })),
    plRows: [
      { cat: 'Food Sales', amt: foodSales, pct: percentage(foodSales) },
      { cat: 'Beverage Sales', amt: beverageSales, pct: percentage(beverageSales) },
      { cat: 'Cost of Goods', amt: -costOfGoods, pct: percentage(costOfGoods) },
      { cat: 'Labor Costs', amt: -payrollTotal, pct: percentage(payrollTotal) },
      { cat: 'Operating Expenses', amt: -operatingExpenses, pct: percentage(operatingExpenses) },
    ],
  });
});

function getFinancialReport(type) {
  const sales = getSeriesForRange('month');
  const orders = db.prepare("SELECT id, created_at, status, order_type, order_source, payment_method, payment_status, total FROM orders WHERE status != 'cancelled' ORDER BY created_at DESC").all();
  const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const vatRate = Number(db.prepare("SELECT value FROM settings WHERE key = 'vat_rate'").get()?.value || 0);
  const tax = revenue * (vatRate / 100);
  const expenses = db.prepare("SELECT expense_date, category, description, supplier, amount, payment_method, status FROM business_expenses WHERE status != 'rejected' ORDER BY expense_date DESC").all();
  const payroll = db.prepare('SELECT pay_period, staff_name, basic_pay, overtime, allowances, deductions, net_pay, status FROM payroll_records ORDER BY pay_period DESC').all();
  const inventory = db.prepare('SELECT name, sku, category, quantity, unit, unit_cost, quantity * unit_cost AS value, supplier, expiry_date FROM inventory ORDER BY value DESC').all();
  const payments = db.prepare("SELECT payment_method AS method, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS amount, SUM(CASE WHEN payment_status IN ('paid', 'completed') THEN 1 ELSE 0 END) AS paid_orders FROM orders WHERE status != 'cancelled' AND payment_method IS NOT NULL GROUP BY payment_method ORDER BY amount DESC").all();
  const orderPerformance = db.prepare("SELECT status, order_type, order_source, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue FROM orders GROUP BY status, order_type, order_source ORDER BY revenue DESC").all();
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const payrollTotal = payroll.reduce((sum, item) => sum + Number(item.net_pay || 0), 0);

  const reports = {
    sales: { title: 'Sales Summary', columns: ['period', 'revenue', 'orders', 'profit'], rows: sales.map((row) => ({ period: row.label, revenue: row.revenue, orders: row.orders, profit: row.profit })) },
    pnl: { title: 'Profit and Loss', columns: ['category', 'amount', 'percentage'], rows: [
      { category: 'Revenue', amount: revenue, percentage: 100 },
      { category: 'Operating expenses', amount: -expenseTotal, percentage: revenue ? (-expenseTotal / revenue) * 100 : 0 },
      { category: 'Payroll', amount: -payrollTotal, percentage: revenue ? (-payrollTotal / revenue) * 100 : 0 },
      { category: 'Net profit', amount: revenue - expenseTotal - payrollTotal, percentage: revenue ? ((revenue - expenseTotal - payrollTotal) / revenue) * 100 : 0 },
    ] },
    payments: { title: 'Payment Reconciliation', columns: ['method', 'orders', 'paid_orders', 'amount'], rows: payments },
    tax: { title: 'VAT and Tax Summary', columns: ['metric', 'amount'], rows: [
      { metric: 'Gross revenue', amount: revenue },
      { metric: 'VAT rate', amount: vatRate },
      { metric: 'VAT liability', amount: tax },
      { metric: 'Revenue excluding VAT', amount: revenue - tax },
    ] },
    expenses: { title: 'Operating Expenses', columns: ['expense_date', 'category', 'description', 'supplier', 'amount', 'payment_method', 'status'], rows: expenses },
    payroll: { title: 'Payroll and Labor', columns: ['pay_period', 'staff_name', 'basic_pay', 'overtime', 'allowances', 'deductions', 'net_pay', 'status'], rows: payroll },
    inventory: { title: 'Inventory Valuation', columns: ['name', 'sku', 'category', 'quantity', 'unit', 'unit_cost', 'value', 'supplier', 'expiry_date'], rows: inventory },
    orders: { title: 'Order Performance', columns: ['status', 'order_type', 'order_source', 'orders', 'revenue'], rows: orderPerformance },
  };
  return reports[type] || reports.sales;
}

router.get('/reports/data', authMiddleware, (req, res) => {
  const type = String(req.query.type || 'sales');
  const allowedTypes = ['sales', 'pnl', 'payments', 'tax', 'expenses', 'payroll', 'inventory', 'orders'];
  if (!allowedTypes.includes(type)) return res.status(400).json({ error: 'Unknown financial report type' });
  res.json(getFinancialReport(type));
});

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function reportHtml(report) {
  const logoData = readFileSync(logoPath).toString('base64');
  const headers = report.columns.map((column) => `<th>${column}</th>`).join('');
  const rows = report.rows.map((row) => `<tr>${report.columns.map((column) => `<td>${String(row[column] ?? '').replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character]))}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${report.title}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#292522;background:#fffaf5}.brand{border-bottom:3px solid #b0003a;padding-bottom:18px;margin-bottom:24px}.brand img{width:190px;height:auto}h1{font-size:22px;margin:18px 0 6px}p{color:#777;font-size:12px}table{border-collapse:collapse;width:100%;background:#fff}th,td{border:1px solid #ead8d0;padding:8px;text-align:left;font-size:12px}th{background:#f8ece8;text-transform:uppercase;letter-spacing:.06em}</style></head><body><div class="brand"><img src="data:image/png;base64,${logoData}" alt="Wrap & Roll"><h1>${report.title}</h1><p>Generated ${new Date().toISOString()}</p></div><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function pdfBuffer(report) {
  return new Promise((resolve) => {
    const document = new PDFDocument({ margin: 40 });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.image(logoPath, 40, 35, { fit: [180, 50] });
    document.fontSize(20).text(report.title, 40, 105);
    document.fontSize(9).fillColor('#666666').text(`Generated ${new Date().toISOString()}`, 40, 130);
    let y = 165;
    document.fontSize(8).fillColor('#292522');
    report.columns.forEach((column, index) => document.text(column, 40 + index * 75, y, { width: 70 }));
    y += 18;
    report.rows.forEach((row) => {
      if (y > 750) { document.addPage(); y = 45; }
      report.columns.forEach((column, index) => document.text(String(row[column] ?? ''), 40 + index * 75, y, { width: 70, ellipsis: true }));
      y += 16;
    });
    document.end();
  });
}

async function xlsxBuffer(report) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');
  const logoId = workbook.addImage({ filename: logoPath, extension: 'png' });
  worksheet.addImage(logoId, 'A1:C4');
  worksheet.getCell('A6').value = report.title;
  worksheet.getCell('A7').value = `Generated ${new Date().toISOString()}`;
  worksheet.addRow([]);
  worksheet.addRow(report.columns);
  report.rows.forEach((row) => worksheet.addRow(report.columns.map((column) => row[column] ?? '')));
  worksheet.getRow(9).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB0003A' } };
  worksheet.columns.forEach((column) => { column.width = 20; });
  return workbook.xlsx.writeBuffer();
}

async function docxBuffer(report) {
  const logo = await readFile(logoPath);
  const rows = [
    new TableRow({ children: report.columns.map((column) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: column, bold: true })] })] })) }),
    ...report.rows.map((row) => new TableRow({ children: report.columns.map((column) => new TableCell({ children: [new Paragraph(String(row[column] ?? ''))] })) })),
  ];
  const document = new Document({ sections: [{ children: [
    new Paragraph({ children: [new ImageRun({ data: logo, transformation: { width: 180, height: 50 } })] }),
    new Paragraph({ text: report.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph(`Generated ${new Date().toISOString()}`),
    new Table({ rows }),
  ] }] });
  return Packer.toBuffer(document);
}

async function pptxBuffer(report) {
  const presentation = new PptxGenJS();
  presentation.layout = 'LAYOUT_WIDE';
  presentation.author = 'Wrap & Roll';
  const slide = presentation.addSlide();
  slide.background = { color: 'FFF9F4' };
  slide.addImage({ path: logoPath, x: 0.4, y: 0.25, w: 2.1, h: 0.55 });
  slide.addText(report.title, { x: 0.4, y: 1.05, w: 12, h: 0.4, fontFace: 'Arial', fontSize: 22, bold: true, color: '292522' });
  slide.addText(`Generated ${new Date().toISOString()}`, { x: 0.4, y: 1.48, w: 12, h: 0.2, fontFace: 'Arial', fontSize: 8, color: '777777' });
  const rows = [report.columns, ...report.rows.map((row) => report.columns.map((column) => String(row[column] ?? '')))];
  slide.addTable(rows, { x: 0.4, y: 1.9, w: 12.2, h: 4.8, fontFace: 'Arial', fontSize: 8, color: '292522', border: { type: 'solid', color: 'E4BDBD', pt: 0.5 }, fill: 'FFFFFF', bold: false, autoFit: false, rowH: 0.3 });
  return presentation.write({ outputType: 'nodebuffer' });
}

router.get('/reports/export', authMiddleware, async (req, res) => {
  const type = String(req.query.type || 'sales');
  const format = String(req.query.format || 'csv').toLowerCase();
  const allowedTypes = ['sales', 'pnl', 'payments', 'tax', 'expenses', 'payroll', 'inventory', 'orders'];
  const allowedFormats = ['csv', 'json', 'html', 'pdf', 'xlsx', 'docx', 'pptx'];
  if (!allowedTypes.includes(type)) return res.status(400).json({ error: 'Unknown financial report type' });
  if (!allowedFormats.includes(format)) return res.status(400).json({ error: 'Unsupported export format' });
  const report = getFinancialReport(type);
  const filename = `wrap-roll-${type}-report.${format}`;
  if (format === 'pdf' || format === 'xlsx' || format === 'docx' || format === 'pptx') {
    const generators = { pdf: pdfBuffer, xlsx: xlsxBuffer, docx: docxBuffer, pptx: pptxBuffer };
    const contentTypes = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
    const content = await generators[format](report);
    res.type(contentTypes[format]).set('Content-Disposition', `attachment; filename="${filename}"`).send(content);
    return;
  }
  if (format === 'json') {
    res.type('application/json').set('Content-Disposition', `attachment; filename="${filename}"`).send(JSON.stringify(report, null, 2));
    return;
  }
  if (format === 'html') {
    res.type('text/html').set('Content-Disposition', `attachment; filename="${filename}"`).send(reportHtml(report));
    return;
  }
  const csv = [report.columns.join(','), ...report.rows.map((row) => report.columns.map((column) => csvValue(row[column])).join(','))].join('\n');
  res.type('text/csv').set('Content-Disposition', `attachment; filename="${filename}"`).send(csv);
});

function getAiSnapshot() {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    sales: {
      recentMonths: getSeriesForRange('month'),
      recentWeeks: getSeriesForRange('week'),
      paymentMethods: db.prepare(`SELECT payment_method AS method, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS amount
        FROM orders WHERE status != 'cancelled' AND payment_method IS NOT NULL GROUP BY payment_method ORDER BY amount DESC`).all(),
    },
    orderHealth: {
      byStatus: db.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY count DESC').all(),
      unpaid: db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS amount FROM orders WHERE status != 'cancelled' AND (payment_status IS NULL OR payment_status NOT IN ('paid', 'completed'))").get(),
      cancelled: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'cancelled'").get().count,
      oldestActive: db.prepare("SELECT id, status, total, created_at FROM orders WHERE status IN ('pending', 'preparing', 'ready') ORDER BY created_at ASC LIMIT 5").all(),
    },
    inventory: {
      lowStock: db.prepare('SELECT name, quantity, unit, threshold, expiry_date, supplier FROM inventory WHERE threshold IS NOT NULL AND quantity <= threshold ORDER BY quantity ASC LIMIT 30').all(),
      expiringOrExpired: db.prepare("SELECT name, quantity, unit, expiry_date FROM inventory WHERE expiry_date IS NOT NULL AND date(expiry_date) <= date('now', '+7 day') ORDER BY expiry_date ASC LIMIT 30").all(),
    },
    workforce: {
      staffByStatus: db.prepare('SELECT status, COUNT(*) AS count FROM staff GROUP BY status').all(),
      openTasks: db.prepare("SELECT COUNT(*) AS count FROM staff_tasks WHERE status != 'completed'").get().count,
      overdueTasks: db.prepare("SELECT COUNT(*) AS count FROM staff_tasks WHERE status != 'completed' AND due_date IS NOT NULL AND date(due_date) < date('now')").get().count,
    },
    finance: {
      pendingExpenses: db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM business_expenses WHERE status = 'pending'").get(),
      recentExpenseCategories: db.prepare("SELECT category, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM business_expenses WHERE status != 'rejected' GROUP BY category ORDER BY amount DESC LIMIT 12").all(),
    },
  };
}

router.post('/ai-review', authMiddleware, async (_req, res) => {
  const snapshot = getAiSnapshot();
  const now = snapshot.generatedAt;
  const startedAt = Date.now();

  try {
    const report = await generateOperationsReport(snapshot);
    recordAiActivity({ surface: 'reports', action: 'operations-review', provider: aiProvider(), userId: _req.user?.id, durationMs: Date.now() - startedAt });
    if (!report) return res.status(503).json({ error: 'Gemini is not configured' });
    res.json({ report, generatedAt: now });
  } catch (error) {
    recordAiActivity({ surface: 'reports', action: 'operations-review', provider: 'offline', status: 'failed', userId: _req.user?.id, durationMs: Date.now() - startedAt });
    console.error('Gemini operations review unavailable:', error.message);
    res.status(502).json({ error: 'Unable to generate the operations review right now' });
  }
});

router.post('/ai-assistant', authMiddleware, async (req, res) => {
  const question = String(req.body.question || '').trim();
  if (!question || question.length > 1200) return res.status(400).json({ error: 'Ask a question between 1 and 1200 characters' });
  try {
    const snapshot = getAiSnapshot();
    const startedAt = Date.now();
    let answer;
    try {
      answer = await generateStaffAssistantReply(snapshot, question);
    } catch (error) {
      console.warn('Falling back to built-in offline assistant:', error.message);
      answer = generateOfflineAgentReply(snapshot, question);
    }
    recordAiActivity({ surface: 'assistant', action: 'staff-question', provider: aiProvider(), userId: req.user?.id, durationMs: Date.now() - startedAt, inputLength: question.length });
    if (!answer) return res.status(503).json({ error: 'Gemini is not configured' });
    res.json({ answer, generatedAt: snapshot.generatedAt });
  } catch (error) {
    recordAiActivity({ surface: 'assistant', action: 'staff-question', provider: 'offline', status: 'failed', userId: req.user?.id, inputLength: question.length });
    console.error('Gemini staff assistant unavailable:', error.message);
    const snapshot = getAiSnapshot();
    const offlineAnswer = generateOfflineAgentReply(snapshot, question);
    res.json({ answer: offlineAnswer, generatedAt: snapshot.generatedAt });
  }
});

router.get('/ai-activity', authMiddleware, (req, res) => {
  const activity = db.prepare(`SELECT id, surface, action, provider, status, duration_ms AS durationMs, input_length AS inputLength, created_at AS createdAt
    FROM ai_activity ORDER BY id DESC LIMIT 100`).all();
  res.json({ activity });
});

export default router;
