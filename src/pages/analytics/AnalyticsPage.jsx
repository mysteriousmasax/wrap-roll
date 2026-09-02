import { useState, useEffect } from 'react';
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
import { formatCurrency } from '../../utils/format';
import {
  ArrowRight,
  DollarSign,
  RefreshCw,
  ShoppingBag,
  Truck,
  TrendingUp,
  Utensils,
  Zap,
  Activity,
  Layers,
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
  const navigate = useNavigate();

  const loadAnalytics = async (showLoader = false) => {
    if (showLoader) setRefreshing(true);
    try {
      const [sales, categories, sum, orders] = await Promise.all([
        api.getSales(),
        api.getCategorySales(),
        api.getAnalyticsSummary(),
        api.getOrders(),
      ]);
      setSalesData(sales || []);
      setCategorySales(categories || []);
      setSummary(sum || {});
      setRecentOrders((orders || []).slice(0, 5));
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  useWebSocket((event) => {
    if (event === 'order:created' || event === 'order:updated') loadAnalytics();
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

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Executive Analytics"
        subtitle="Real-time restaurant revenue, category trends, and live order pipeline"
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden text-[10px] text-[#746e67] sm:block">
              Updated {lastUpdated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
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
          change={14.2}
          icon={DollarSign}
          iconColor="green"
        />
        <StatCard
          title="Avg Order Value"
          value={formatCurrency(summary?.avgOrderValue ?? 0)}
          change={5.8}
          icon={ShoppingBag}
          iconColor="primary"
        />
        <StatCard
          title="Active Kitchen Tickets"
          value={String(summary?.activeKitchenOrders ?? 0)}
          change={8.3}
          icon={Zap}
          iconColor="yellow"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(summary?.monthlyRevenue ?? 0)}
          change={10.2}
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
            <button
              onClick={() => navigate('/orders')}
              className="flex items-center gap-1 text-xs font-bold text-[#ae002a] hover:underline"
            >
              View all orders <ArrowRight size={13} />
            </button>
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
                  <div
                    className="h-full rounded-full bg-[#ae002a]"
                    style={{ width: `${summary?.channelPercentages?.['dine-in'] || 0}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#fff9f0] text-[#e6ac29]">
                <ShoppingBag size={15} />
              </span>
              <div className="flex-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-[#1f1d1b]">Takeout / Pickup</span>
                  <span className="font-bold text-[#e6ac29]">{summary?.channelMix?.takeout || 0}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#fbf6ee]">
                  <div
                    className="h-full rounded-full bg-[#e6ac29]"
                    style={{ width: `${summary?.channelPercentages?.takeout || 0}%` }}
                  />
                </div>
              </div>
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
              <p className="text-xs text-[#746e67]">Monthly business turnover trend</p>
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
    </div>
  );
}

