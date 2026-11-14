import { useEffect, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import {
  CalendarRange,
  Download,
  Eye,
  FileText,
  Search,
  WalletCards,
} from 'lucide-react';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'daily', label: 'Daily Sales' },
  { id: 'vat', label: 'Monthly VAT' },
  { id: 'tax', label: 'Annual Tax' },
  { id: 'receipts', label: 'Receipts Log' },
  { id: 'audit', label: 'Audit Trail' },
];

const localDateValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function ResponsiveReportTable({ columns, rows, getKey, primaryColumn, renderCell, emptyMessage }) {
  const primary = columns.find(([key]) => key === primaryColumn) || columns[0];
  const secondary = columns.filter(([key]) => key !== primary[0]);

  return (
    <div className="min-w-0">
      <div className="hidden overflow-hidden rounded-xl border border-outline-variant xl:block">
        <table className="w-full table-fixed text-left text-xs">
          <thead className="bg-surface-container-low text-surface-on-variant">
            <tr>{columns.map(([key, label]) => <th key={key} className="break-words px-2 py-2 font-bold">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={getKey(row, index)} className="border-t border-outline-variant/60">
                {columns.map(([key]) => <td key={key} className="break-words px-2 py-2">{renderCell ? renderCell(row, key) : row[key] ?? '—'}</td>)}
              </tr>
            ))}
            {!rows.length && <tr><td className="p-3 text-surface-on-variant" colSpan={columns.length}>{emptyMessage}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid min-w-0 gap-2 xl:hidden">
        {rows.map((row, index) => (
          <article key={getKey(row, index)} className="min-w-0 rounded-xl border border-outline-variant bg-white p-3">
            <div className="min-w-0">
              <p className="break-words text-[10px] font-semibold uppercase tracking-wide text-surface-on-variant">{primary[1]}</p>
              <p className="mt-0.5 min-w-0 break-words font-semibold text-surface-on">{renderCell ? renderCell(row, primary[0]) : row[primary[0]] ?? '—'}</p>
            </div>
            {secondary.length > 0 && (
              <dl className="mt-2 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2">
                {secondary.map(([key, label]) => (
                  <div key={key} className="min-w-0">
                    <dt className="break-words text-[10px] font-semibold uppercase tracking-wide text-surface-on-variant">{label}</dt>
                    <dd className="mt-0.5 min-w-0 break-words text-xs text-surface-on">{renderCell ? renderCell(row, key) : row[key] ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </article>
        ))}
        {!rows.length && <p className="rounded-xl border border-dashed border-outline-variant p-3 text-sm text-surface-on-variant">{emptyMessage}</p>}
      </div>
    </div>
  );
}

const statusVariant = (value) => {
  const normalized = String(value).trim().toLowerCase();
  if (['sent', 'approved', 'complete', 'logged', 'paid'].includes(normalized)) return 'green';
  if (['open', 'alert', 'in progress', 'queued', 'pending'].includes(normalized)) return 'yellow';
  if (['missed', 'rejected', 'refunded'].includes(normalized)) return 'red';
  if (['locked'].includes(normalized)) return 'orange';
  return 'default';
};

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [salesAdjustments, setSalesAdjustments] = useState(null);
  const [salesTrend, setSalesTrend] = useState([]);
  const [categoryMix, setCategoryMix] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [inventoryItemsCount, setInventoryItemsCount] = useState(0);
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [complianceReport, setComplianceReport] = useState(null);
  const [complianceError, setComplianceError] = useState('');
  const [receiptSearch, setReceiptSearch] = useState('');
  const [previewRange, setPreviewRange] = useState('day');
  const [previewDate, setPreviewDate] = useState(() => localDateValue());
  const [reportPreview, setReportPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [exportingFormat, setExportingFormat] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState('');

  useEffect(() => {
    let active = true;
    setReportPreview(null);
    setPreviewError('');
    api.getAnalyticsExportPreview(previewRange, previewDate)
      .then((report) => {
        if (active) setReportPreview(report);
      })
      .catch((error) => {
        if (active) setPreviewError(error.message || 'Unable to load report preview.');
      });
    return () => { active = false; };
  }, [previewRange, previewDate]);

  useEffect(() => {
    let active = true;
    setComplianceReport(null);
    setComplianceError('');
    api.getComplianceReports(reportMonth)
      .then((report) => {
        if (active) {
          setComplianceReport(report);
          setComplianceError('');
        }
      })
      .catch((error) => {
        if (active) setComplianceError(error.message || 'Unable to load report data.');
      });
    return () => { active = false; };
  }, [reportMonth]);

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      api.getAnalyticsSummary(),
      api.getSales(),
      api.getCategorySales(),
      api.getOrders(),
      api.getInventory(),
      api.getAnalyticsReports(),
    ]).then(([summaryResult, salesResult, categoryResult, ordersResult, inventoryResult, reportResult]) => {
      if (!active) return;

      if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value || {});

      if (salesResult.status === 'fulfilled') {
        const rows = Array.isArray(salesResult.value) ? salesResult.value : [];
        const maxRevenue = rows.reduce((highest, row) => Math.max(highest, Number(row.revenue || 0)), 0) || 1;
        setSalesTrend(rows.slice(-7).map((row) => ({
          label: String(row.label || '').slice(0, 3) || 'N/A',
          value: Math.round((Number(row.revenue || 0) / maxRevenue) * 100),
        })));
      }

      if (categoryResult.status === 'fulfilled') {
        const rows = Array.isArray(categoryResult.value) ? categoryResult.value : [];
        const total = rows.reduce((sum, item) => sum + Number(item.revenue || 0), 0) || 1;
        const palette = ['bg-primary', 'bg-warning', 'bg-success', 'bg-secondary'];
        setCategoryMix(rows.map((item, index) => ({
          label: item.name || 'Other',
          percent: Math.round((Number(item.revenue || 0) / total) * 100),
          amount: formatCurrency(Number(item.revenue || 0)),
          color: palette[index % palette.length],
        })));
      }

      if (ordersResult.status === 'fulfilled') {
        const converted = (ordersResult.value || [])
          .filter((order) => order.status === 'completed' && ['paid', 'completed'].includes(String(order.payment_status || order.paymentStatus || '').toLowerCase()))
          .slice(0, 5)
          .map((order) => ({
            id: `#${order.id}`,
            customer: order.customer_name || order.customerName || order.customer?.name || 'Walk-in guest',
            total: Number(order.total || 0),
            time: new Date(order.created_at || order.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            status: order.payment_status || order.paymentStatus || 'Paid',
          }));
        setRecentTransactions(converted);
      }

      if (inventoryResult.status === 'fulfilled') {
        const rows = Array.isArray(inventoryResult.value) ? inventoryResult.value : [];
        const nextInventoryValue = rows.reduce((total, item) => {
          const quantity = Number(item.quantity || 0);
          const unitCost = Number(item.unitCost || item.unit_cost || 0);
          return total + (quantity * unitCost);
        }, 0);
        setInventoryValue(nextInventoryValue);
        setInventoryItemsCount(rows.length);
      }
      if (reportResult?.status === 'fulfilled') setSalesAdjustments(reportResult.value?.financialAdjustments || null);
    });

    return () => { active = false; };
  }, []);

  const overviewMetrics = [
    { label: 'Net sales', value: formatCurrency(Number(salesAdjustments?.netSales ?? summary?.monthlyRevenue ?? 0)), note: summary?.changes?.monthlyRevenue != null ? `${summary.changes.monthlyRevenue >= 0 ? '+' : ''}${summary.changes.monthlyRevenue}% vs last month` : 'After discounts and processed refunds' },
    { label: 'Reported profit', value: formatCurrency(Number(summary?.monthlyProfit || 0)), note: 'From recorded sales and expenses' },
    { label: 'Orders', value: Number(summary?.monthlyOrders || 0).toLocaleString(), note: `Avg ticket ${formatCurrency(Number(summary?.avgOrderValue || 0))}` },
    { label: 'Inventory value', value: formatCurrency(Number(inventoryValue || 0)), note: `${inventoryItemsCount} items tracked across stock` },
  ];
  const adjustmentMetrics = [
    { label: 'Gross sales', value: formatCurrency(Number(salesAdjustments?.grossSales || 0)) },
    { label: 'Offer discounts', value: formatCurrency(Number(salesAdjustments?.offerDiscounts || 0)) },
    { label: 'Manager discounts', value: formatCurrency(Number(salesAdjustments?.manualDiscounts || 0)) },
    { label: 'Processed refunds', value: formatCurrency(Number(salesAdjustments?.refunds || 0)) },
  ];

  const renderStatus = (status) => <Badge variant={statusVariant(status)}>{status}</Badge>;
  const filteredReceipts = (complianceReport?.receipts || []).filter((row) => (
    `${row.id} ${row.customer}`.toLowerCase().includes(receiptSearch.trim().toLowerCase())
  ));
  const exportReport = async (format) => {
    setExportingFormat(format);
    setPreviewError('');
    try {
      const { blob, filename } = await api.exportAnalytics(previewRange, format, previewDate);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setPreviewError(error.message || `Unable to export ${format.toUpperCase()} report.`);
    } finally {
      setExportingFormat('');
    }
  };
  const openReceipt = async (receipt) => {
    setSelectedReceipt(null);
    setReceiptError('');
    setReceiptLoading(true);
    setReceiptModalOpen(true);
    try {
      const order = await api.getOrder(receipt.orderId || receipt.id);
      setSelectedReceipt(order);
    } catch (error) {
      setReceiptError(error.message || 'Unable to load receipt details.');
    } finally {
      setReceiptLoading(false);
    }
  };

  return (
    <div className="min-w-0 max-w-full p-2.5 sm:p-6">
      <PageHeader
        title="Compliance & Reports"
        subtitle="Business performance, paid order records, and recorded audit activity"
        mobileStack
      />

      <div className="mt-4 min-w-0 space-y-4 sm:mt-6 sm:space-y-6">
        {complianceError && (
          <div role="alert" className="rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error">
            Could not load live report data: {complianceError}
          </div>
        )}

        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
          <Card className="min-w-0 !p-3 sm:!p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-surface-on-variant">Today's paid orders</p>
            <p className="mt-2 text-xl font-black sm:mt-4 sm:text-2xl">{Number(complianceReport?.todaySummary?.receipts || 0).toLocaleString()}</p>
            <p className="mt-1 break-words text-xs text-surface-on-variant sm:mt-2 sm:text-sm">{formatCurrency(Number(complianceReport?.todaySummary?.gross || 0))} gross sales</p>
          </Card>
          <Card className="min-w-0 !p-3 sm:!p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-surface-on-variant">Today's recorded order tax</p>
            <p className="mt-2 break-words text-lg font-black sm:mt-4 sm:text-2xl">{formatCurrency(Number(complianceReport?.todaySummary?.orderTax || 0))}</p>
            <p className="mt-1 break-words text-xs text-surface-on-variant sm:mt-2 sm:text-sm">Order tax is separate from the configured VAT rate.</p>
          </Card>
          <Card className="col-span-2 min-w-0 !p-3 sm:col-span-1 sm:!p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-surface-on-variant">Reporting coverage</p>
            <p className="mt-2 text-base font-bold sm:mt-4 sm:text-lg">Live app records only</p>
            <p className="mt-1 break-words text-xs text-surface-on-variant sm:mt-2 sm:text-sm">EFD transmission and tax filing status are not tracked here.</p>
          </Card>
        </div>

        <Card className="min-w-0 space-y-3 !p-3 sm:space-y-4 sm:!p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-surface-on-variant">Report preview and export</p>
              <p className="mt-1 text-sm text-surface-on-variant">Choose a day, week, or month. Weekly and monthly reports use the selected date as a period anchor.</p>
            </div>
            <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <label className="min-w-0 text-xs font-semibold text-surface-on-variant">
                Period
                <select className="input-field mt-1 block w-full" value={previewRange} onChange={(event) => setPreviewRange(event.target.value)}>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </label>
              <label className="min-w-0 text-xs font-semibold text-surface-on-variant">
                {previewRange === 'day' ? 'Report date' : 'Pick a date in the period'}
                <input className="input-field mt-1 block w-full min-w-0" type="date" value={previewDate} onChange={(event) => setPreviewDate(event.target.value)} />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {[
              ['xlsx', 'Export Excel'],
              ['docx', 'Export Word'],
              ['pdf', 'Export PDF'],
              ['csv', 'Export CSV'],
            ].map(([format, label]) => (
              <Button key={format} size="sm" variant="secondary" className="min-w-0 justify-center px-2 text-xs" disabled={Boolean(exportingFormat)} onClick={() => exportReport(format)}>
                <Download size={14} />{exportingFormat === format ? 'Preparing…' : label.replace('Export ', '')}
              </Button>
            ))}
          </div>

          {previewError && <p role="alert" className="text-sm text-error">{previewError}</p>}
          {reportPreview ? (
            <div>
              <h3 className="mb-2 text-sm font-bold">{reportPreview.title}</h3>
              <div className="max-h-80 overflow-y-auto rounded-xl">
                <ResponsiveReportTable
                  columns={reportPreview.columns.map((column) => [column, column.replace(/([A-Z])/g, ' $1')])}
                  rows={reportPreview.rows}
                  getKey={(row, index) => `${row.order || row.period || 'report'}-${index}`}
                  primaryColumn={reportPreview.columns.includes('order') ? 'order' : reportPreview.columns.includes('period') ? 'period' : reportPreview.columns[0]}
                  renderCell={(row, column) => {
                    const value = row[column];
                    return ['total', 'revenue', 'profit', 'orderTax'].includes(column) && typeof value === 'number'
                      ? formatCurrency(value)
                      : value ?? '—';
                  }}
                  emptyMessage="No records in this period."
                />
              </div>
            </div>
          ) : !previewError && <p className="text-sm text-surface-on-variant">Loading preview…</p>}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-2 border-b border-outline-variant bg-surface-container-low p-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-3 py-2 text-xs font-bold capitalize transition-colors ${activeTab === tab.id ? 'bg-primary text-white' : 'bg-white text-surface-on-variant hover:bg-surface-container'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="min-w-0 p-2.5 sm:p-6">
            {activeTab === 'overview' && (
              <div className="space-y-5">
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
                  {overviewMetrics.map((metric) => (
                    <div key={metric.label} className="min-w-0 rounded-2xl border border-outline-variant bg-surface-container-low p-3 sm:p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-surface-on-variant">{metric.label}</p>
                      <p className="mt-2 break-words text-lg font-black text-surface-on sm:mt-3 sm:text-2xl">{metric.value}</p>
                      <p className="mt-1 break-words text-[11px] text-surface-on-variant sm:mt-2 sm:text-xs">{metric.note}</p>
                    </div>
                  ))}
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
                  {adjustmentMetrics.map((metric) => (
                    <div key={metric.label} className="min-w-0 rounded-2xl border border-outline-variant bg-white p-3 sm:p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-surface-on-variant">{metric.label}</p>
                      <p className="mt-2 break-words text-lg font-black text-surface-on sm:mt-3 sm:text-2xl">{metric.value}</p>
                      <p className="mt-1 text-[11px] text-surface-on-variant">{salesAdjustments?.period || 'Current month'}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.5fr_0.9fr]">
                  <Card className="min-w-0 !p-3 sm:!p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-surface-on-variant">Revenue trend</p>
                        <p className="mt-1 text-lg font-bold text-surface-on">This week</p>
                      </div>
                    </div>

                    {salesTrend.length ? (
                      <div className="mt-4 flex h-40 items-end gap-1.5 sm:mt-6 sm:h-48 sm:gap-3">
                      {salesTrend.map((day) => (
                        <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
                          <div className="flex h-36 w-full items-end justify-center rounded-t-xl bg-primary/20 p-1">
                            <div
                              className="w-full rounded-t-xl bg-primary"
                              style={{ height: `${day.value}%` }}
                              title={`${day.label}: ${day.value}%`}
                            />
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-surface-on-variant">{day.label}</span>
                        </div>
                      ))}
                      </div>
                    ) : <p className="mt-6 text-sm text-surface-on-variant">No sales data is available for this period.</p>}
                  </Card>

                  <Card className="min-w-0 !p-3 sm:!p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-surface-on-variant">Category mix</p>
                    {categoryMix.length ? (
                      <div className="mt-5 space-y-4">
                      {categoryMix.map((item) => (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0 break-words font-semibold text-surface-on">{item.label}</span>
                            <span className="min-w-0 break-words text-right text-surface-on-variant">{item.amount}</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface-container">
                            <div className={`${item.color} h-2 rounded-full`} style={{ width: `${item.percent}%` }} />
                          </div>
                        </div>
                      ))}
                      </div>
                    ) : <p className="mt-5 text-sm text-surface-on-variant">No category sales data is available.</p>}
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                  <Card className="min-w-0 !p-3 sm:!p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-surface-on-variant">Recent transactions</p>
                        <p className="mt-1 text-lg font-bold text-surface-on">Daily activity</p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <ResponsiveReportTable
                        columns={[['id', 'Ref'], ['customer', 'Customer'], ['total', 'Total'], ['time', 'Time'], ['status', 'Status']]}
                        rows={recentTransactions}
                        getKey={(row) => row.id}
                        primaryColumn="id"
                        renderCell={(row, column) => column === 'total' ? formatCurrency(row.total) : column === 'status' ? renderStatus(row.status) : row[column]}
                        emptyMessage="No completed, paid orders are available."
                      />
                    </div>
                  </Card>

                  <Card className="min-w-0 !p-3 sm:!p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-surface-on-variant">Operations snapshot</p>
                    <div className="mt-4 space-y-4">
                      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-surface-on">Inventory items</span>
                          <WalletCards size={16} className="text-primary" />
                        </div>
                        <p className="mt-2 text-xl font-black text-surface-on">{inventoryItemsCount.toLocaleString()}</p>
                        <p className="text-xs text-surface-on-variant">{formatCurrency(inventoryValue)} current inventory valuation</p>
                      </div>

                      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-surface-on">Report source</span>
                          <CalendarRange size={16} className="text-warning" />
                        </div>
                        <p className="mt-2 text-xl font-black text-surface-on">Live orders</p>
                      </div>

                      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-surface-on">EFD status</span>
                          <FileText size={16} className="text-surface-on-variant" />
                        </div>
                        <p className="mt-2 text-xl font-black text-surface-on">Not tracked</p>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === 'daily' && (
              <div className="space-y-4">
                <p className="text-sm text-surface-on-variant">Paid order totals for the latest 14 restaurant days. These are not generated TRA Z-reports.</p>

                <ResponsiveReportTable
                  columns={[['date', 'Date'], ['receipts', 'Receipts'], ['gross', 'Gross sales'], ['orderTax', 'Recorded order tax'], ['status', 'Paid orders']]}
                  rows={complianceReport?.dailyRows || []}
                  getKey={(row) => row.date}
                  primaryColumn="date"
                  renderCell={(row, column) => column === 'gross' || column === 'orderTax' ? formatCurrency(row[column]) : column === 'status' ? (row.receipts ? 'Recorded' : 'None') : row[column]}
                  emptyMessage={complianceError || 'Loading live report data...'}
                />
              </div>
            )}

            {activeTab === 'vat' && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-surface-on-variant">Monthly sales and order-tax summary</p>
                      <p className="mt-2 text-lg font-bold">{complianceReport?.month || reportMonth}</p>
                      <p className="mt-1 text-sm text-surface-on-variant">VAT liability and filing status are not calculated or stored in this app.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <CalendarRange size={14} />
                      <input className="rounded-lg border border-outline-variant bg-white px-2 py-1" type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
                  {[
                    ['Gross sales', formatCurrency(Number(complianceReport?.monthSummary?.gross || 0))],
                    ['Recorded order tax', formatCurrency(Number(complianceReport?.monthSummary?.orderTax || 0))],
                    ['Paid orders', Number(complianceReport?.monthSummary?.receipts || 0).toLocaleString()],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-2xl border border-outline-variant bg-white p-3 sm:p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-surface-on-variant">{label}</p>
                      <p className="mt-2 break-words text-lg font-black text-surface-on sm:mt-3 sm:text-2xl">{value}</p>
                    </div>
                  ))}
                </div>

                <ResponsiveReportTable
                  columns={[['date', 'Date'], ['gross', 'Gross sales'], ['orderTax', 'Recorded order tax'], ['receipts', 'Receipts']]}
                  rows={complianceReport?.monthRows || []}
                  getKey={(row) => row.date}
                  primaryColumn="date"
                  renderCell={(row, column) => column === 'gross' || column === 'orderTax' ? formatCurrency(row[column]) : row[column]}
                  emptyMessage={complianceError || 'Loading live report data...'}
                />

              </div>
            )}

            {activeTab === 'tax' && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-surface-on-variant">Annual sales and recorded order-tax summary</p>
                      <p className="mt-2 text-lg font-bold">Calendar year {complianceReport?.year || reportMonth.slice(0, 4)}</p>
                      <p className="mt-1 text-sm text-surface-on-variant">Income tax and filing status are not calculated or stored in this app.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <CalendarRange size={14} />
                      <input className="rounded-lg border border-outline-variant bg-white px-2 py-1" type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
                  {[
                    ['Annual gross sales', formatCurrency(Number(complianceReport?.yearSummary?.gross || 0))],
                    ['Recorded order tax', formatCurrency(Number(complianceReport?.yearSummary?.orderTax || 0))],
                    ['Paid orders', Number(complianceReport?.yearSummary?.receipts || 0).toLocaleString()],
                    ['Days with recorded sales', (complianceReport?.yearRows || []).reduce((total, row) => total + row.daysWithSales, 0).toLocaleString()],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-2xl border border-outline-variant bg-white p-3 sm:p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-surface-on-variant">{label}</p>
                      <p className="mt-2 break-words text-lg font-black text-surface-on sm:mt-3 sm:text-2xl">{value}</p>
                    </div>
                  ))}
                </div>

                <ResponsiveReportTable
                  columns={[['month', 'Month'], ['gross', 'Gross sales'], ['orderTax', 'Recorded order tax'], ['receipts', 'Paid orders'], ['daysWithSales', 'Days with sales']]}
                  rows={complianceReport?.yearRows || []}
                  getKey={(row) => row.month}
                  primaryColumn="month"
                  renderCell={(row, column) => column === 'gross' || column === 'orderTax' ? formatCurrency(row[column]) : row[column]}
                  emptyMessage={complianceError || 'Loading live report data...'}
                />

              </div>
            )}

            {activeTab === 'receipts' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex min-w-0 items-center rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm sm:w-fit">
                    <Search size={14} className="mr-2 text-surface-on-variant" />
                    <input className="min-w-0 flex-1 outline-none" value={receiptSearch} onChange={(event) => setReceiptSearch(event.target.value)} placeholder="Search order or customer" />
                  </label>
                  <p className="break-words text-xs text-surface-on-variant sm:text-sm">Showing up to 200 completed, paid orders for {complianceReport?.month || reportMonth}.</p>
                </div>

                <ResponsiveReportTable
                  columns={[
                    ['id', 'Receipt #'], ['customer', 'Customer'], ['date', 'Date / Time'], ['items', 'Items'],
                    ['gross', 'Gross'], ['orderTax', 'Recorded order tax'], ['payment', 'Payment'], ['efdStatus', 'EFD status'], ['details', 'Details'],
                  ]}
                  rows={filteredReceipts}
                  getKey={(row) => row.id}
                  primaryColumn="id"
                  renderCell={(row, column) => {
                    if (column === 'date') return new Date(row.date).toLocaleString();
                    if (column === 'gross' || column === 'orderTax') return formatCurrency(row[column]);
                    if (column === 'details') {
                      return <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline" onClick={() => openReceipt(row)}><Eye size={14} /> View</button>;
                    }
                    return row[column] || (column === 'customer' ? '—' : '');
                  }}
                  emptyMessage={complianceReport ? 'No matching paid orders for this month.' : complianceError || 'Loading live report data...'}
                />
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FileText className="text-primary" size={18} />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-surface-on-variant">Recorded activity</p>
                        <p className="text-sm text-surface-on-variant">Recent order events, inventory changes, and recorded deletions.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <ResponsiveReportTable
                  columns={[['action', 'Action'], ['user', 'User'], ['time', 'Time'], ['result', 'Result']]}
                  rows={complianceReport?.auditRows || []}
                  getKey={(row) => row.id}
                  primaryColumn="action"
                  renderCell={(row, column) => {
                    if (column === 'user') return <><span className="font-semibold">{row.user || 'System'}</span><span className="ml-1 capitalize text-surface-on-variant">· {row.userRole || 'unknown role'}</span></>;
                    if (column === 'time') return new Date(row.time).toLocaleString();
                    if (column === 'result') return row.result || 'Recorded';
                    return row.action;
                  }}
                  emptyMessage={complianceReport ? 'No recorded activity is available.' : complianceError || 'Loading live report data...'}
                />
              </div>
            )}
          </div>
        </Card>
      </div>
      <Modal isOpen={receiptModalOpen} onClose={() => setReceiptModalOpen(false)} title={selectedReceipt ? `Receipt ${selectedReceipt.orderNumber || selectedReceipt.id}` : 'Receipt details'} size="lg">
        {receiptLoading ? <p className="text-sm text-surface-on-variant">Loading order details…</p>
          : receiptError ? <p role="alert" className="text-sm text-error">{receiptError}</p>
            : selectedReceipt && (
              <div className="min-w-0 space-y-4 sm:space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 break-words rounded-xl bg-surface-container-low p-3 text-sm">
                    <p><strong>Date:</strong> {new Date(selectedReceipt.createdAt).toLocaleString()}</p>
                    <p><strong>Customer:</strong> {selectedReceipt.customer || 'Walk-in guest'}</p>
                    <p><strong>Order:</strong> {selectedReceipt.type || 'Not recorded'} · {selectedReceipt.orderSource || 'Not recorded'}</p>
                  </div>
                  <div className="min-w-0 break-words rounded-xl bg-surface-container-low p-3 text-sm">
                    <p><strong>Payment:</strong> {selectedReceipt.paymentMethod || 'Not recorded'} · {selectedReceipt.paymentStatus}</p>
                    <p><strong>Order tax:</strong> {formatCurrency(Number(selectedReceipt.tax || 0))}</p>
                    <p><strong>Total:</strong> {formatCurrency(Number(selectedReceipt.total || 0))}</p>
                  </div>
                </div>
                <ResponsiveReportTable
                  columns={[['name', 'Item'], ['qty', 'Qty'], ['price', 'Unit price'], ['lineTotal', 'Line total']]}
                  rows={selectedReceipt.items || []}
                  getKey={(item, index) => `${item.name}-${index}`}
                  primaryColumn="name"
                  renderCell={(item, column) => column === 'price'
                    ? formatCurrency(Number(item.price || 0))
                    : column === 'lineTotal'
                      ? formatCurrency(Number(item.qty || 0) * Number(item.price || 0))
                      : item[column]}
                  emptyMessage="No line items were recorded."
                />
                <div>
                  <h3 className="mb-2 text-sm font-bold">Recorded order activity</h3>
                  {(selectedReceipt.events || []).length ? <div className="space-y-2">
                    {selectedReceipt.events.map((event) => (
                      <div key={event.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-outline-variant/60 px-3 py-2 text-xs">
                        <span className="min-w-0 break-words"><strong className="capitalize">{String(event.type).replace(/_/g, ' ')}</strong> · {event.actorName} ({event.actorRole})</span>
                        <span className="min-w-0 break-words">{new Date(event.occurredAt).toLocaleString()}</span>
                      </div>
                    ))}
                  </div> : <p className="text-sm text-surface-on-variant">No separate order activity events are available.</p>}
                </div>
              </div>
            )}
      </Modal>
    </div>
  );
}
