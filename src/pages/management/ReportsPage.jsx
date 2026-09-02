import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import { DollarSign, TrendingUp, Download, FileText, PieChart } from 'lucide-react';

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('month');

  useEffect(() => {
    api.getReports().then(setReport).finally(() => setLoading(false));
  }, []);

  const exportReport = () => {
    if (!report) return;
    const csv = [
      'Month,Revenue,Orders,Profit',
      ...report.salesData.map((d) => `${d.month},${d.revenue},${d.orders},${d.profit}`),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wrap-roll-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading reports...</div>;

  const { salesData, totalRevenue, totalProfit, profitMargin, plRows } = report;
  const rangeData = (report.ranges || {})[range] || [];
  const maxRevenue = rangeData.length ? Math.max(...rangeData.map((row) => Number(row.revenue || 0)), 1) : 1;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Financial Reports" subtitle="Certified financial reporting and analytics" actions={
        <Button size="sm" onClick={exportReport}><Download size={14} /> Export Report</Button>
      } />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Gross Revenue" value={formatCurrency(totalRevenue)} change={12.5} icon={DollarSign} iconColor="green" />
        <StatCard title="Net Profit" value={formatCurrency(totalProfit)} change={8.7} icon={TrendingUp} iconColor="primary" />
        <StatCard title="Profit Margin" value={profitMargin + '%'} change={2.1} icon={PieChart} iconColor="yellow" />
        <StatCard title="Tax Liability (VAT)" value={formatCurrency(totalRevenue * 0.09)} icon={FileText} iconColor="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <h3 className="font-display font-bold text-sm mb-4">Monthly P&L Statement</h3>
          <table className="w-full">
            <thead><tr className="border-b border-outline-variant"><th className="text-left text-xs uppercase text-surface-on-variant p-2">Category</th><th className="text-right text-xs uppercase text-surface-on-variant p-2">Amount</th><th className="text-right text-xs uppercase text-surface-on-variant p-2">%</th></tr></thead>
            <tbody>
              {plRows.map((row) => (
                <tr key={row.cat} className="border-b border-outline-variant/30">
                  <td className="p-2 text-sm font-semibold">{row.cat}</td>
                  <td className={'p-2 text-sm font-bold text-right ' + (row.amt < 0 ? 'text-error' : 'text-success')}>{formatCurrency(Math.abs(row.amt))}</td>
                  <td className="p-2 text-sm text-surface-on-variant text-right">{row.pct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h3 className="font-display font-bold text-sm mb-4">Payment Methods Breakdown</h3>
          <div className="space-y-4">
            {[{ method: 'Credit / Debit Card', pct: 65, color: 'bg-primary' }, { method: 'Mobile Money', pct: 25, color: 'bg-secondary-container' }, { method: 'Cash', pct: 10, color: 'bg-gray-400' }].map((pm) => (
              <div key={pm.method}>
                <div className="flex justify-between text-sm mb-1"><span className="font-semibold">{pm.method}</span><span className="text-surface-on-variant">{pm.pct}%</span></div>
                <div className="bg-surface-container-low rounded-full h-3 overflow-hidden"><div className={'h-full rounded-full ' + pm.color} style={{ width: pm.pct + '%' }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-6 p-3 bg-surface-container-low rounded-xl">
            <p className="text-xs text-surface-on-variant">Auditor Certification</p>
            <Badge variant="green" className="mt-2">Certified</Badge>
          </div>
        </Card>
      </div>

      <Card className="mb-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-display font-bold text-sm">Daily / Weekly / Monthly Report</h3>
          <div className="inline-flex rounded-full border border-outline-variant bg-surface-container-low p-1">
            {['day', 'week', 'month'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRange(option)}
                className={'rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ' + (range === option ? 'bg-primary text-primary-foreground' : 'text-surface-on-variant hover:bg-white/10')}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {rangeData.length ? rangeData.map((item) => (
            <div key={item.label} className="flex items-center gap-4 p-2 rounded-lg hover:bg-surface-container-low">
              <span className="font-semibold text-sm w-20">{item.label}</span>
              <div className="flex-1 bg-surface-container-low rounded-full h-4 overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min((Number(item.revenue || 0) / maxRevenue) * 100, 100)}%` }} />
              </div>
              <span className="font-bold text-sm w-24 text-right">{formatCurrency(Number(item.revenue || 0))}</span>
              <span className="text-sm text-success w-20 text-right">{formatCurrency(Number(item.profit || 0))}</span>
            </div>
          )) : <p className="text-sm text-surface-on-variant">No revenue data available for this window.</p>}
        </div>
      </Card>

      <Card>
        <h3 className="font-display font-bold text-sm mb-4">Monthly Revenue History</h3>
        <div className="space-y-2">
          {salesData.map((d) => (
            <div key={d.month} className="flex items-center gap-4 p-2 rounded-lg hover:bg-surface-container-low">
              <span className="font-semibold text-sm w-10">{d.month}</span>
              <div className="flex-1 bg-surface-container-low rounded-full h-4 overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: (d.revenue / 140000 * 100) + '%' }} /></div>
              <span className="font-bold text-sm w-24 text-right">{formatCurrency(d.revenue)}</span>
              <span className="text-sm text-success w-24 text-right">{formatCurrency(d.profit)} profit</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
