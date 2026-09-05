import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { getOrders } from '../utils/orders.js';

const router = Router();

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
  const totalProfit = totalRevenue * 0.28;
  const daySeries = getSeriesForRange('day');
  const weekSeries = getSeriesForRange('week');
  const monthSeries = getSeriesForRange('month');

  res.json({
    salesData,
    totalRevenue,
    totalProfit,
    profitMargin: totalRevenue ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0,
    ranges: {
      day: daySeries,
      week: weekSeries,
      month: monthSeries,
    },
    plRows: [
      { cat: 'Food Sales', amt: totalRevenue * 0.678, pct: '67.8%' },
      { cat: 'Beverage Sales', amt: totalRevenue * 0.322, pct: '32.2%' },
      { cat: 'Cost of Goods', amt: -totalRevenue * 0.4, pct: '40.0%' },
      { cat: 'Labor Costs', amt: -totalRevenue * 0.2, pct: '20.0%' },
      { cat: 'Operating Expenses', amt: -totalRevenue * 0.1, pct: '10.0%' },
    ],
  });
});

export default router;
