import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';
import useAuthStore from '../../store/useAuthStore';
import { isPageAllowedForUser } from '../../utils/roleAccess';
import { formatCurrency } from '../../utils/format';
import {
  ArrowRight,
  DollarSign,
  Download,
  RefreshCw,
  ShoppingBag,
  Truck,
  TrendingUp,
  Utensils,
  Zap,
  Activity,
  Layers,
  ClipboardList,
  WalletCards,
} from 'lucide-react';

const BRAND_COLORS = ['#ae002a', '#e6ac29', '#227653', '#d97706', '#8b5cf6', '#0284c7'];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-[#ebdccb] p-3 rounded-2xl shadow-xl text-xs text-[#24211e]">
        <p className="font-bold text-[#1f1d1b] mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="flex items-center gap-2" style={{ color: entry.color }}>
            <span>{entry.name || 'Revenue'}:</span>
            <span className="font-bold">{formatCurrency(entry.value)}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function AnalyticsPage() {
  const [salesData, setSalesData] = useState([]);
  const [categorySales, setCategorySales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [reportRange, setReportRange] = useState('month');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pettyCashRows, setPettyCashRows] = useState(() => Array.from({ length: 7 }, (_, index) => ({ id: index + 1, item: '', rate: '', quantity: '', remarks: '' })));
  const [pettyCashMeta, setPettyCashMeta] = useState({ weekEnding: '', checkedBy: '', checkedDate: '', approvedBy: '', approvedDate: '' });
  const [salesSummaryRows, setSalesSummaryRows] = useState(() => Array.from({ length: 12 }, (_, index) => ({ id: index + 1, date: '', item: '', quantity: '', openingStock: '', closingStock: '', price: '', remarks: '' })));
  const [salesSummaryMeta, setSalesSummaryMeta] = useState({ shift: '', checkedBy: '', approvedBy: '', wastage: ['', '', '', ''] });
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [summaryMessage, setSummaryMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dayOrders, setDayOrders] = useState(null);
  const [dayOrdersLoading, setDayOrdersLoading] = useState(false);
  const [shiftHandovers, setShiftHandovers] = useState({ morning: null, evening: null });
  const [shiftSummaryLoading, setShiftSummaryLoading] = useState(false);
  const [shiftSummaryError, setShiftSummaryError] = useState('');
  const refreshTimerRef = useRef(null);

  const exportAnalytics = async (format) => {
    if (exporting) return;
    setExporting(true);
    try {
      const date = reportRange === 'day' ? selectedDate : '';
      const { blob, filename } = await api.exportAnalytics(reportRange, format, date);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setSummaryMessage(`Exported ${reportRange} analytics (${format.toUpperCase()}).`);
    } catch (error) {
      setSummaryMessage(error.message || 'Unable to export analytics.');
    } finally {
      setExporting(false);
    }
  };

  // Load the selected day's completed orders for both the summary and drill-down preview.
  useEffect(() => {
    let cancelled = false;
    setDayOrdersLoading(true);
    api.getOrdersByDay(selectedDate)
      .then((data) => { if (!cancelled) setDayOrders(data); })
      .catch(() => { if (!cancelled) setDayOrders(null); })
      .finally(() => { if (!cancelled) setDayOrdersLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDate]);

  useEffect(() => {
    let cancelled = false;
    setShiftSummaryLoading(true);
    setShiftSummaryError('');
    Promise.all(['morning', 'evening'].map((shift) => api.getShiftHandover(selectedDate, shift)))
      .then(([morning, evening]) => {
        if (!cancelled) setShiftHandovers({ morning, evening });
      })
      .catch((error) => {
        if (!cancelled) setShiftSummaryError(error.message || 'Unable to load shift summaries.');
      })
      .finally(() => {
        if (!cancelled) setShiftSummaryLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedDate]);

  const loadAnalytics = async (showLoader = false) => {
    if (showLoader) setRefreshing(true);
    try {
      const [sales, categories, sum, orders] = await Promise.all([
        api.getSales(),
        api.getCategorySales(),
        api.getAnalyticsSummary(selectedDate),
        api.getOrders(),
      ]);
      setSalesData(sales || []);
      setCategorySales(categories || []);
      setSummary(sum || {});
      const operational = sum?.operational || {};
      setPettyCashRows((operational.pettyCash || []).map((row, index) => ({ ...row, id: row.id || index + 1, rate: String(row.rate || ''), quantity: String(row.quantity || 1) })));
      setSalesSummaryRows((operational.dailySales || []).map((row, index) => ({ ...row, id: row.id || index + 1, quantity: String(row.quantity || ''), openingStock: String(row.openingStock || ''), closingStock: String(row.closingStock || ''), price: String(row.price || '') })));
      setRecentOrders((orders || []).filter((order) => order.status === 'completed' && ['paid', 'completed'].includes(order.paymentStatus)).slice(0, 5));
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
    const refreshTimer = window.setInterval(() => loadAnalytics(), 30000);
    return () => window.clearInterval(refreshTimer);
  }, [selectedDate]);

  useWebSocket((event) => {
    if (['order:created', 'order:updated', 'order:deleted', 'order:confirmed', 'payment:confirmed', 'payment:manual_review', 'payment:rejected', 'business:updated', 'staff:updated', 'inventory:updated', 'customer:updated', 'menu:updated', 'table:updated', 'settings:updated'].includes(event)) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => loadAnalytics(), 50);
    }
  });

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-sm text-[#746e67]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full border-2 border-[#ae002a] border-t-transparent animate-spin" />
          <span>Loading analytics dashboard...</span>
        </div>
      </div>
    );
  }

  const rangeData = (summary?.ranges && summary.ranges[reportRange]) || [];
  const pettyCashTotal = summary?.operational?.pettyCashTotal ?? pettyCashRows.reduce((sum, row) => sum + (Number(row.rate) || 0) * (Number(row.quantity) || 0), 0);
  const dailySalesTotal = summary?.operational?.dailySalesTotal ?? salesSummaryRows.reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.price) || 0), 0);
  const dailyStockRows = ['morning', 'evening'].flatMap((shift) => {
    const handover = shiftHandovers[shift];
    return handover?.id || handover?.updated_at ? (handover.inventoryCounts || []) : [];
  });
  const dailyStockItems = new Map();
  dailyStockRows.forEach((row) => {
    const itemName = String(row.item || 'Stock item').trim();
    const key = itemName.toLowerCase();
    const item = dailyStockItems.get(key) || { counted: false, needsAttention: false };
    item.counted ||= ['opening', 'added', 'closing'].some((field) => row[field] !== '' && row[field] !== null && row[field] !== undefined);
    item.needsAttention ||= ['restock', 'prep', 'low'].includes(row.status) || (row.closing !== '' && row.closing !== null && row.closing !== undefined && Number(row.closing) <= 0);
    dailyStockItems.set(key, item);
  });
  const dailyStockItemsCounted = [...dailyStockItems.values()].filter((item) => item.counted).length;
  const dailyStockAttentionCount = [...dailyStockItems.values()].filter((item) => item.needsAttention).length;
  const dailyDifference = (row) => (Number(row.openingStock) || 0) - (Number(row.closingStock) || 0);
  const updatePettyCashRow = (id, field, value) => setPettyCashRows((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
  const updateSalesSummaryRow = (id, field, value) => setSalesSummaryRows((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
  const saveSummary = async (type, payload, date) => {
    try {
      setSummaryMessage('Saving summary...');
      await api.saveOperationalSummary(type, date, { rows: payload, checkedBy: currentUser?.name || '' });
      setSummaryMessage('Summary saved.');
    } catch (error) { setSummaryMessage(error.message || 'Unable to save summary.'); }
  };
  const approveSummary = async (type, date) => {
    try {
      await api.approveOperationalSummary(type, date);
      setSummaryMessage(`Approved by ${currentUser?.name || 'authorized user'}.`);
    } catch (error) { setSummaryMessage(error.message || 'Unable to approve summary.'); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Executive Analytics"
        subtitle="Real-time restaurant revenue, category trends, and live order pipeline"
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="hidden text-[10px] text-[#746e67] sm:block">
              Updated {lastUpdated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div className="inline-flex rounded-full border border-[#ebdccb] bg-[#fbf6ee] p-1">
              {['day', 'week', 'month'].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setReportRange(option)}
                  className={
                    'rounded-full px-3 py-1 text-xs font-bold capitalize transition-colors ' +
                    (reportRange === option ? 'bg-[#ae002a] text-white shadow-sm' : 'text-[#746e67] hover:bg-white')
                  }
                >
                  {option}
                </button>
              ))}
            </div>
            {reportRange === 'day' && (
              <input
                type="date"
                value={selectedDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="rounded-xl border border-[#ebdccb] bg-white px-3 py-2 text-xs font-semibold text-[#554e46] focus:outline-none focus:border-[#ae002a]"
                aria-label="Select day"
              />
            )}
            <div className="inline-flex overflow-hidden rounded-xl border border-[#ebdccb] bg-white shadow-sm">
              {[['xlsx', 'Excel'], ['docx', 'Word'], ['pdf', 'PDF']].map(([format, label]) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => exportAnalytics(format)}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#227653] transition-colors hover:bg-[#f0f9f3] disabled:opacity-50 border-r border-[#ebdccb] last:border-r-0"
                  title={`Export ${reportRange}${reportRange === 'day' ? ` (${selectedDate})` : ''} analytics as ${label}`}
                >
                  <Download size={14} /> {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => loadAnalytics(true)}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-xl bg-white border border-[#ebdccb] px-3.5 py-2 text-xs font-bold text-[#ae002a] shadow-sm hover:bg-[#faeee2] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        }
      />

      {/* KPI Stats Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Revenue"
          value={formatCurrency(summary?.todayRevenue ?? 0)}
          change={summary?.changes?.todayRevenue ?? undefined}
          icon={DollarSign}
          iconColor="green"
        />
        <StatCard
          title="Avg Order Value"
          value={formatCurrency(summary?.avgOrderValue ?? 0)}
          change={summary?.changes?.avgOrderValue ?? undefined}
          icon={ShoppingBag}
          iconColor="primary"
        />
        <StatCard
          title="Active Kitchen Tickets"
          value={String(summary?.activeKitchenOrders ?? 0)}
          change={summary?.changes?.activeKitchenOrders ?? undefined}
          icon={Zap}
          iconColor="yellow"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(summary?.monthlyRevenue ?? 0)}
          change={summary?.changes?.monthlyRevenue ?? undefined}
          icon={TrendingUp}
          iconColor="primary"
        />
      </div>

      {/* Live Order Pipeline + Channels Mix */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border border-[#ebdccb] bg-white rounded-3xl p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-sm text-[#1f1d1b]">Live Kitchen Flow</h3>
              <p className="mt-0.5 text-xs text-[#746e67]">Real-time pipeline across all ordering points</p>
            </div>
            {isPageAllowedForUser(currentUser, '/orders') && (
              <button
                onClick={() => navigate('/orders')}
                className="flex items-center gap-1 text-xs font-bold text-[#ae002a] hover:underline"
              >
                View all orders <ArrowRight size={13} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-[#fff9f0] border border-[#f5d777] p-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#775a00]">New Pending</p>
              <p className="mt-1 text-2xl font-bold text-[#1f1d1b] font-display">
                {summary?.pendingOrders ?? 0}
              </p>
              <p className="mt-0.5 text-[10px] text-[#8c8278]">Awaiting chef start</p>
            </div>

            <div className="rounded-2xl bg-[#fff5ea] border border-[#fd7e14]/40 p-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#c05600]">In Cooking</p>
              <p className="mt-1 text-2xl font-bold text-[#c05600] font-display">
                {summary?.preparingOrders ?? 0}
              </p>
              <p className="mt-0.5 text-[10px] text-[#8c8278]">On the grill / station</p>
            </div>

            <div className="rounded-2xl bg-[#f0f9f3] border border-[#227653]/30 p-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#227653]">Ready to Serve</p>
              <p className="mt-1 text-2xl font-bold text-[#227653] font-display">
                {summary?.readyOrders ?? 0}
              </p>
              <p className="mt-0.5 text-[10px] text-[#8c8278]">At counter / packing</p>
            </div>
          </div>
        </Card>

        <Card className="border border-[#ebdccb] bg-white rounded-3xl p-5 shadow-sm">
          <h3 className="mb-3 font-display font-bold text-sm text-[#1f1d1b]">Order Channel Mix</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#faeee2] text-[#ae002a]">
                <Utensils size={15} />
              </span>
              <div className="flex-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-[#1f1d1b]">Dine-in (Tables)</span>
                  <span className="font-bold text-[#ae002a]">{summary?.channelMix?.['dine-in'] || 0}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#fbf6ee]">
                  <div className="h-full rounded-full bg-[#ae002a]" style={{ width: `${summary?.channelPercentages?.['dine-in'] || 0}%` }} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#fff9f0] text-[#e6ac29]"><ShoppingBag size={15} /></span>
              <div className="flex-1"><div className="flex justify-between text-xs"><span className="font-semibold text-[#1f1d1b]">Takeout / Pickup</span><span className="font-bold text-[#e6ac29]">{summary?.channelMix?.takeout || 0}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-[#fbf6ee]"><div className="h-full rounded-full bg-[#e6ac29]" style={{ width: `${summary?.channelPercentages?.takeout || 0}%` }} /></div></div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f0f9f3] text-[#227653]">
                <Truck size={15} />
              </span>
              <div className="flex-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-[#1f1d1b]">Delivery Orders</span>
                  <span className="font-bold text-[#227653]">{summary?.channelMix?.delivery || 0}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#fbf6ee]">
                  <div
                    className="h-full rounded-full bg-[#227653]"
                    style={{ width: `${summary?.channelPercentages?.delivery || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Interactive Recharts Area & Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trends Interactive Area Chart */}
        <Card className="lg:col-span-2 border border-[#ebdccb] bg-white rounded-3xl p-5 shadow-sm">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-sm text-[#1f1d1b]">Revenue Trajectory</h3>
              <p className="text-xs text-[#746e67]">{reportRange === 'day' ? 'Daily turnover · last 7 days' : reportRange === 'week' ? 'Weekly turnover · last 8 weeks' : 'Monthly turnover · last 12 months'}</p>
            </div>
            <div className="inline-flex rounded-full border border-[#ebdccb] bg-[#fbf6ee] p-1">
              {['day', 'week', 'month'].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setReportRange(option)}
                  className={
                    'rounded-full px-3 py-1 text-xs font-bold capitalize transition-colors ' +
                    (reportRange === option
                      ? 'bg-[#ae002a] text-white shadow-sm'
                      : 'text-[#746e67] hover:bg-white')
                  }
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rangeData.length ? rangeData : salesData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ae002a" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ae002a" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3ebde" />
                <XAxis dataKey={rangeData.length ? 'label' : 'month'} stroke="#998f86" fontSize={11} />
                <YAxis
                  stroke="#998f86"
                  fontSize={11}
                  tickFormatter={(val) => `${val / 1000}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#ae002a"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Category Breakdown Chart */}
        <Card className="border border-[#ebdccb] bg-white rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-display font-bold text-sm text-[#1f1d1b]">Category Sales Share</h3>
            <p className="text-xs text-[#746e67] mb-3">Revenue percentage by category</p>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categorySales}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={38}
                  outerRadius={65}
                  paddingAngle={4}
                >
                  {categorySales.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={BRAND_COLORS[index % BRAND_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-[#eee4d5]">
            {categorySales.map((cat, index) => (
              <div key={cat.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: BRAND_COLORS[index % BRAND_COLORS.length] }}
                  />
                  <span className="font-semibold text-[#1f1d1b]">{cat.name}</span>
                </div>
                <span className="font-bold text-[#ae002a]">{formatCurrency(cat.revenue)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Day drill-down: every order placed on the selected day, ready to export */}
      {reportRange === 'day' && (
        <Card className="border border-[#ebdccb] bg-white rounded-3xl p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display font-bold text-sm text-[#1f1d1b]">Orders on {selectedDate}</h3>
              <p className="text-xs text-[#746e67]">
                {dayOrdersLoading ? 'Loading orders…' : `${dayOrders?.count ?? 0} completed order${(dayOrders?.count ?? 0) === 1 ? '' : 's'} · ${formatCurrency(dayOrders?.totalRevenue ?? 0)} · ordering time tracked`}
              </p>
            </div>
            <div className="inline-flex overflow-hidden rounded-xl border border-[#ebdccb] bg-white shadow-sm">
              {[['xlsx', 'Excel'], ['docx', 'Word'], ['pdf', 'PDF']].map(([format, label]) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => exportAnalytics(format)}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#227653] transition-colors hover:bg-[#f0f9f3] disabled:opacity-50 border-r border-[#ebdccb] last:border-r-0"
                >
                  <Download size={13} /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead className="bg-[#fbf6ee] text-[10px] uppercase tracking-wide text-[#746e67]">
                <tr>
                  <th className="border border-[#ebdccb] p-2">Order</th>
                  <th className="border border-[#ebdccb] p-2">Time ordered</th>
                  <th className="border border-[#ebdccb] p-2">Customer</th>
                  <th className="border border-[#ebdccb] p-2">Type</th>
                  <th className="border border-[#ebdccb] p-2">Source</th>
                  <th className="border border-[#ebdccb] p-2">Payment</th>
                  <th className="border border-[#ebdccb] p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(dayOrders?.orders || []).map((order) => (
                  <tr key={order.id} className="hover:bg-[#fbf6ee]">
                    <td className="border border-[#ebdccb] p-2 font-bold text-[#ae002a]">{order.id}</td>
                    <td className="border border-[#ebdccb] p-2 font-semibold text-[#1f1d1b]">{order.time}</td>
                    <td className="border border-[#ebdccb] p-2">{order.customer}</td>
                    <td className="border border-[#ebdccb] p-2 capitalize">{order.type}</td>
                    <td className="border border-[#ebdccb] p-2 capitalize">{order.source}</td>
                    <td className="border border-[#ebdccb] p-2 capitalize">{order.payment}</td>
                    <td className="border border-[#ebdccb] p-2 text-right font-bold text-[#ae002a]">{formatCurrency(order.total)}</td>
                  </tr>
                ))}
                {!dayOrdersLoading && !(dayOrders?.orders || []).length && (
                  <tr><td colSpan={7} className="border border-[#ebdccb] p-6 text-center text-[#746e67]">No completed orders on {selectedDate}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Live Transaction Feed Table */}
      <Card className="border border-[#ebdccb] bg-white rounded-3xl p-5 shadow-sm">
        <h3 className="font-display font-bold text-sm text-[#1f1d1b] mb-3">Recent Sales Transactions</h3>
        <div className="space-y-2">
          {recentOrders.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between gap-4 p-3 rounded-2xl bg-[#fbf6ee] hover:bg-[#faeee2] transition-colors border border-[#ebdccb]"
            >
              <div className="flex items-center gap-3">
                <span className="font-bold text-xs bg-white px-2.5 py-1 rounded-lg border border-[#ebdccb] text-[#ae002a]">
                  {tx.id}
                </span>
                <div>
                  <p className="text-xs font-bold text-[#1f1d1b]">{tx.customerName || 'Walk-in Guest'}</p>
                  <p className="text-[10px] text-[#746e67]">
                    {tx.items?.slice(0, 3).map((i) => `${i.qty}x ${i.name}`).join(', ')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-white border border-[#ebdccb] font-bold capitalize text-[#554e46]">
                  {tx.paymentMethod || 'cash'}
                </span>
                <span className="font-display font-bold text-sm text-[#ae002a]">
                  {formatCurrency(tx.total)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <section className="space-y-4" aria-label="Daily operational summaries">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ae002a]">Business close · daily and per shift</p>
            <h2 className="mt-1 font-display text-xl font-bold text-[#1f1d1b]">Daily &amp; Shift Summary</h2>
            <p className="mt-1 text-xs text-[#746e67]">Completed sales are live; shift figures come from saved handover counts.</p>
          </div>
          <label className="text-xs font-semibold text-[#554e46]">
            Summary date
            <input
              type="date"
              value={selectedDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="mt-1 block rounded-xl border border-[#ebdccb] bg-white px-3 py-2 text-xs font-semibold focus:border-[#ae002a] focus:outline-none"
              aria-label="Daily and shift summary date"
            />
          </label>
        </div>

        {shiftSummaryError && <p role="alert" className="text-sm text-red-700">{shiftSummaryError}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Completed sales', dayOrdersLoading ? 'Loading…' : formatCurrency(dayOrders?.totalRevenue ?? 0)],
            ['Paid orders', dayOrdersLoading ? 'Loading…' : (dayOrders?.count ?? 0)],
            ['Items counted', shiftSummaryLoading ? 'Loading…' : dailyStockItemsCounted],
            ['Stock attention', shiftSummaryLoading ? 'Loading…' : dailyStockAttentionCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-[#ebdccb] bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#746e67]">{label}</p>
              <p className="mt-2 font-display text-xl font-bold text-[#1f1d1b]">{value}</p>
              <p className="mt-1 text-[10px] text-[#746e67]">{selectedDate}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {['morning', 'evening'].map((shift) => {
            const handover = shiftHandovers[shift];
            const reconciliationRows = Object.entries(handover?.reconciliation || {}).filter(([channel]) => channel !== 'cashFloat');
            const expectedRows = reconciliationRows.filter(([, row]) => row.expected !== '' && Number.isFinite(Number(row.expected)));
            const actualRows = reconciliationRows.filter(([, row]) => row.actual !== '' && Number.isFinite(Number(row.actual)));
            const expectedTotal = expectedRows.reduce((total, [, row]) => total + Number(row.expected), 0);
            const actualTotal = actualRows.reduce((total, [, row]) => total + Number(row.actual), 0);
            const inventoryCounts = Array.isArray(handover?.inventoryCounts) ? handover.inventoryCounts : [];
            const countedItems = inventoryCounts.filter((row) => ['opening', 'added', 'closing'].some((field) => row[field] !== '' && Number.isFinite(Number(row[field])))).length;
            const lowStockItems = inventoryCounts.filter((row) => ['restock', 'prep', 'low'].includes(row.status) || (row.closing !== '' && Number(row.closing) <= 0)).length;
            const isSaved = Boolean(handover?.id || handover?.updated_at);

            return (
              <Card key={shift} className="border border-[#ebdccb] bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ae002a]">{shift} shift</p>
                    <h3 className="mt-1 font-display text-lg font-bold text-[#1f1d1b]">{shift === 'morning' ? 'Morning' : 'Evening'} Handover</h3>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isSaved ? 'bg-[#f0f9f3] text-[#227653]' : 'bg-[#fbf6ee] text-[#746e67]'}`}>
                    {shiftSummaryLoading ? 'Loading' : isSaved ? `Saved by ${handover.created_by || handover.manager_out || 'staff'}` : 'Not submitted'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl bg-[#fbf6ee] p-3">
                    <p className="text-[9px] font-bold uppercase text-[#746e67]">Expected takings</p>
                    <p className="mt-1 text-sm font-bold text-[#1f1d1b]">{expectedRows.length ? formatCurrency(expectedTotal) : '—'}</p>
                  </div>
                  <div className="rounded-xl bg-[#fbf6ee] p-3">
                    <p className="text-[9px] font-bold uppercase text-[#746e67]">Counted takings</p>
                    <p className="mt-1 text-sm font-bold text-[#1f1d1b]">{actualRows.length ? formatCurrency(actualTotal) : '—'}</p>
                  </div>
                  <div className="rounded-xl bg-[#fbf6ee] p-3">
                    <p className="text-[9px] font-bold uppercase text-[#746e67]">Variance</p>
                    <p className={`mt-1 text-sm font-bold ${expectedRows.length && actualRows.length ? (actualTotal - expectedTotal === 0 ? 'text-[#227653]' : 'text-[#ae002a]') : 'text-[#746e67]'}`}>
                      {expectedRows.length && actualRows.length ? formatCurrency(actualTotal - expectedTotal) : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#fbf6ee] p-3">
                    <p className="text-[9px] font-bold uppercase text-[#746e67]">Stock check</p>
                    <p className="mt-1 text-sm font-bold text-[#1f1d1b]">{countedItems} counted · {lowStockItems} attention</p>
                  </div>
                </div>
                <p className="mt-3 text-[10px] text-[#746e67]">{handover?.updated_at ? `Last saved ${new Date(handover.updated_at).toLocaleString()}` : 'Shift sales are not inferred from order timestamps; enter and save reconciliation in Shift Handover.'}</p>
              </Card>
            );
          })}
        </div>

        <div className="flex items-end justify-between gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ae002a]">Cash control · live</p><h2 className="mt-1 font-display text-xl font-bold text-[#1f1d1b]">Petty Cash Summary</h2><p className="mt-1 text-xs text-[#746e67]">Automatically calculated from approved cash expenses.</p></div>
          <WalletCards size={24} className="text-[#ae002a]" />
        </div>
        <Card className="border border-[#ebdccb] bg-white rounded-3xl p-5 shadow-sm">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-xl border border-[#ebdccb] bg-[#fffaf5] px-3 py-2"><p className="text-[10px] font-bold uppercase text-[#746e67]">Reporting window</p><p className="mt-1 text-sm font-semibold text-[#1f1d1b]">Last 7 days · updated live</p></div><div className="rounded-xl bg-[#faeee2] p-3 sm:col-span-2"><p className="text-[10px] font-bold uppercase text-[#746e67]">Total cash expenses</p><p className="mt-1 font-display text-xl font-bold text-[#ae002a]">{formatCurrency(pettyCashTotal)}</p></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] border-collapse text-left text-xs"><thead className="bg-[#fbf6ee] text-[10px] uppercase tracking-wide text-[#746e67]"><tr><th className="border border-[#ebdccb] p-2">S/N</th><th className="border border-[#ebdccb] p-2">Item</th><th className="border border-[#ebdccb] p-2">@</th><th className="border border-[#ebdccb] p-2">Quantity</th><th className="border border-[#ebdccb] p-2">Total</th><th className="border border-[#ebdccb] p-2">Remarks</th></tr></thead><tbody>{pettyCashRows.map((row) => <tr key={row.id}><td className="border border-[#ebdccb] p-2 text-[#746e67]">{row.id}</td><td className="border border-[#ebdccb] p-1"><input aria-label={`Petty cash item ${row.id}`} value={row.item} onChange={(event) => updatePettyCashRow(row.id, 'item', event.target.value)} className="w-full bg-transparent p-1 outline-none" /></td><td className="border border-[#ebdccb] p-1"><input aria-label={`Petty cash rate ${row.id}`} type="number" value={row.rate} onChange={(event) => updatePettyCashRow(row.id, 'rate', event.target.value)} className="w-24 bg-transparent p-1 outline-none" /></td><td className="border border-[#ebdccb] p-1"><input aria-label={`Petty cash quantity ${row.id}`} type="number" value={row.quantity} onChange={(event) => updatePettyCashRow(row.id, 'quantity', event.target.value)} className="w-20 bg-transparent p-1 outline-none" /></td><td className="border border-[#ebdccb] p-2 font-bold text-[#ae002a]">{formatCurrency((Number(row.rate) || 0) * (Number(row.quantity) || 0))}</td><td className="border border-[#ebdccb] p-1"><input aria-label={`Petty cash remarks ${row.id}`} value={row.remarks} onChange={(event) => updatePettyCashRow(row.id, 'remarks', event.target.value)} className="w-full bg-transparent p-1 outline-none" /></td></tr>)}</tbody></table></div>
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[#eee4d5] pt-4"><div className="text-xs text-[#554e46]">Checked by <strong>{currentUser?.name || 'Current account'}</strong></div><button type="button" onClick={() => saveSummary('petty_cash', pettyCashRows, pettyCashMeta.checkedDate || new Date().toISOString().slice(0, 10))} className="rounded-xl bg-[#ae002a] px-3 py-2 text-xs font-bold text-white">Save summary</button>{['admin', 'executive', 'manager'].includes(currentUser?.role) && <button type="button" onClick={() => approveSummary('petty_cash', pettyCashMeta.checkedDate || new Date().toISOString().slice(0, 10))} className="rounded-xl border border-[#ae002a] px-3 py-2 text-xs font-bold text-[#ae002a]">Approve summary</button>} {summaryMessage && <span className="text-xs font-semibold text-[#227653]">{summaryMessage}</span>}</div>
        </Card>

        <div className="flex items-end justify-between gap-4 pt-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ae002a]">Stock movement · live</p><h2 className="mt-1 font-display text-xl font-bold text-[#1f1d1b]">Daily Sales Summary</h2><p className="mt-1 text-xs text-[#746e67]">Automatically calculated from the latest recorded business day and inventory.</p></div><ClipboardList size={24} className="text-[#ae002a]" /></div>
        <Card className="border border-[#ebdccb] bg-white rounded-3xl p-5 shadow-sm"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="rounded-xl border border-[#ebdccb] bg-[#fffaf5] px-3 py-2"><p className="text-[10px] font-bold uppercase text-[#746e67]">Reporting window</p><p className="mt-1 text-sm font-semibold text-[#1f1d1b]">{summary?.operational?.reportDate || 'No recorded sales'} · updated live</p></div><div className="rounded-xl bg-[#f0f9f3] px-4 py-3 text-right"><p className="text-[10px] font-bold uppercase text-[#746e67]">Total sales</p><p className="font-display text-xl font-bold text-[#227653]">{formatCurrency(dailySalesTotal)}</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[1040px] border-collapse text-left text-xs"><thead className="bg-[#fbf6ee] text-[10px] uppercase tracking-wide text-[#746e67]"><tr><th className="border border-[#ebdccb] p-2">Date</th><th className="border border-[#ebdccb] p-2">Item</th><th className="border border-[#ebdccb] p-2">Qty</th><th className="border border-[#ebdccb] p-2">Opening stock</th><th className="border border-[#ebdccb] p-2">Closing stock</th><th className="border border-[#ebdccb] p-2">Price</th><th className="border border-[#ebdccb] p-2">Difference</th><th className="border border-[#ebdccb] p-2">Total</th><th className="border border-[#ebdccb] p-2">Checked by</th><th className="border border-[#ebdccb] p-2">Remarks</th></tr></thead><tbody>{salesSummaryRows.map((row) => <tr key={row.id}><td className="border border-[#ebdccb] p-2 text-[#554e46]">{row.date || '-'}</td><td className="border border-[#ebdccb] p-2 font-semibold">{row.item || '-'}</td><td className="border border-[#ebdccb] p-2">{row.quantity || 0}</td><td className="border border-[#ebdccb] p-2">{row.openingStock || 0}</td><td className="border border-[#ebdccb] p-2">{row.closingStock || 0}</td><td className="border border-[#ebdccb] p-2">{formatCurrency(row.price || 0)}</td><td className="border border-[#ebdccb] p-2 font-semibold text-[#554e46]">{dailyDifference(row)}</td><td className="border border-[#ebdccb] p-2 font-bold text-[#ae002a]">{formatCurrency(row.total || 0)}</td><td className="border border-[#ebdccb] p-2 text-[#746e67]">{row.checkedBy || 'System / website'}</td><td className="border border-[#ebdccb] p-2 text-[#746e67]">{row.remarks || '-'}</td></tr>)}</tbody></table></div><div className="mt-4 flex flex-wrap items-center gap-3"><span className="text-xs text-[#554e46]">Checked by <strong>{currentUser?.name || 'Current account'}</strong></span><button type="button" onClick={() => saveSummary('daily_sales', salesSummaryRows, summary?.operational?.reportDate || new Date().toISOString().slice(0, 10))} className="rounded-xl bg-[#ae002a] px-3 py-2 text-xs font-bold text-white">Save summary</button>{['admin', 'executive', 'manager'].includes(currentUser?.role) && <button type="button" onClick={() => approveSummary('daily_sales', summary?.operational?.reportDate || new Date().toISOString().slice(0, 10))} className="rounded-xl border border-[#ae002a] px-3 py-2 text-xs font-bold text-[#ae002a]">Approve summary</button>} {summaryMessage && <span className="text-xs font-semibold text-[#227653]">{summaryMessage}</span>}</div><div className="mt-4 rounded-xl border border-[#ebdccb] bg-[#fffaf5] p-3 text-xs text-[#746e67]">Live figures are sourced from completed orders and current inventory. Manual saves are audited to the active account.</div></Card>
      </section>
    </div>
  );
}

