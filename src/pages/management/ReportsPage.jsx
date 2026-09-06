import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import { DollarSign, TrendingUp, Download, FileText, PieChart, Sparkles, Eye } from 'lucide-react';

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('month');
  const [aiReview, setAiReview] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [reportType, setReportType] = useState('sales');
  const [exportFormat, setExportFormat] = useState('csv');
  const [exporting, setExporting] = useState(false);
  const [previewReport, setPreviewReport] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    api.getReports().then(setReport).finally(() => setLoading(false));
  }, []);

  const generateAiReview = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const result = await api.generateAiOperationsReview();
      setAiReview(result.report);
    } catch (error) {
      setAiError(error.message || 'Unable to generate the operations review');
    } finally {
      setAiLoading(false);
    }
  };

  const exportReport = async () => {
    if (!report || exporting) return;
    setExporting(true);
    try {
      const result = await api.exportFinancialReport(reportType, exportFormat);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setAiError(error.message || 'Unable to export the financial report');
    } finally {
      setExporting(false);
    }
  };

  const openPreview = async () => {
    if (previewLoading) return;
    setPreviewLoading(true);
    try {
      setPreviewReport(await api.getFinancialReportPreview(reportType));
    } catch (error) {
      setAiError(error.message || 'Unable to load report preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading reports...</div>;

  const { salesData, totalRevenue, totalProfit, profitMargin, taxLiability = 0, financialChanges = {}, plRows, paymentMethods = [] } = report;
  const rangeData = (report.ranges || {})[range] || [];
  const maxRevenue = rangeData.length ? Math.max(...rangeData.map((row) => Number(row.revenue || 0)), 1) : 1;
  const maxHistoricalRevenue = salesData.length ? Math.max(...salesData.map((row) => Number(row.revenue || 0)), 1) : 1;
  const selectedFormatLabel = (report.exportFormats || []).find((format) => format.id === exportFormat)?.label || exportFormat.toUpperCase();

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Financial Reports" subtitle="Certified financial reporting and analytics" actions={
        <div className="flex flex-wrap items-center justify-end gap-2"><Button size="sm" variant="secondary" onClick={generateAiReview} disabled={aiLoading}><Sparkles size={14} /> {aiLoading ? 'Reviewing system...' : 'Gemini system review'}</Button><select aria-label="Financial report type" value={reportType} onChange={(event) => { setReportType(event.target.value); setPreviewReport(null); }} className="rounded-xl border border-outline-variant bg-white px-3 py-1.5 text-xs font-semibold">{(report.reportTypes || []).map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select><select aria-label="Export format" value={exportFormat} onChange={(event) => setExportFormat(event.target.value)} className="rounded-xl border border-outline-variant bg-white px-3 py-1.5 text-xs font-semibold">{(report.exportFormats || [{ id: 'csv', label: 'CSV' }, { id: 'json', label: 'JSON' }, { id: 'html', label: 'HTML / Print' }, { id: 'pdf', label: 'PDF' }, { id: 'xlsx', label: 'Excel' }, { id: 'docx', label: 'Word' }, { id: 'pptx', label: 'PowerPoint' }]).map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}</select><Button size="sm" variant="secondary" onClick={openPreview} disabled={previewLoading}><Eye size={14} /> {previewLoading ? 'Loading preview...' : 'Preview'}</Button><Button size="sm" onClick={exportReport} disabled={exporting}><Download size={14} /> {exporting ? 'Exporting...' : 'Export Report'}</Button></div>
      } />

      <Modal isOpen={Boolean(previewReport)} onClose={() => setPreviewReport(null)} title="Document preview" size="xl">
        {previewReport && <div className="rounded-2xl bg-[#eee3dc] p-3 shadow-inner sm:p-6">
          <div className="rounded-xl border border-[#ead8d0] bg-[#fffdf9] p-5 shadow-[0_12px_30px_rgba(88,48,35,0.12)] sm:p-8">
            <div className="flex items-start justify-between gap-5 border-b-2 border-[#b0003a]/20 pb-6"><div><img src="/wrap-roll-logo-lockup-transparent.png" alt="Wrap & Roll" className="h-11 w-auto object-contain" /><p className="mt-6 text-[10px] font-bold uppercase tracking-[0.24em] text-[#b0003a]">Financial report</p><h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#292522] sm:text-3xl">{previewReport.title}</h2><p className="mt-2 max-w-md text-xs leading-5 text-[#7b6c64]">A live operational snapshot prepared from Wrap & Roll restaurant data.</p></div><div className="min-w-[100px] text-right text-xs text-[#7b6c64]"><p className="font-bold text-[#292522]">Wrap & Roll</p><p className="mt-2">{new Date().toLocaleDateString()}</p><span className="mt-3 inline-flex rounded-full bg-[#f8e7ec] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#b0003a]">{selectedFormatLabel}</span></div></div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-lg bg-[#f8ece8] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8c7167]">Rows included</p><p className="mt-1 text-xl font-bold text-[#292522]">{previewReport.rows.length}</p></div><div className="rounded-lg bg-[#f2f7ee] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#68825e]">Source</p><p className="mt-1 text-sm font-bold text-[#365a37]">Live API</p></div><div className="col-span-2 rounded-lg bg-[#fff4d9] p-3 sm:col-span-1"><p className="text-[10px] font-bold uppercase tracking-wide text-[#99731d]">Status</p><p className="mt-1 text-sm font-bold text-[#73570e]">Ready to export</p></div></div>
            <div className="mt-6 overflow-hidden rounded-xl border border-[#ead8d0] bg-white"><div className="flex items-center justify-between border-b border-[#ead8d0] bg-[#f8ece8] px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7b6259]">Report detail</p><p className="text-[10px] text-[#9a8177]">Preview · first 30 rows</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-[#fffaf7] text-[10px] uppercase tracking-wider text-[#7b6259]"><tr>{previewReport.columns.map((column) => <th key={column} className="px-4 py-3 font-bold">{column.replace(/_/g, ' ')}</th>)}</tr></thead><tbody>{previewReport.rows.slice(0, 30).map((row, index) => <tr key={index} className={'border-t border-[#f0e4de] ' + (index % 2 ? 'bg-[#fffdfb]' : 'bg-white')}>{previewReport.columns.map((column) => <td key={column} className="px-4 py-3 align-top text-[#4d423d]">{String(row[column] ?? '')}</td>)}</tr>)}</tbody></table>{!previewReport.rows.length && <div className="px-5 py-12 text-center text-sm text-[#8c7b72]">No rows are available for this report yet.</div>}</div></div>
            {previewReport.rows.length > 30 && <p className="mt-3 text-xs text-[#7b6c64]">The preview shows the first 30 rows. Your export contains the complete report.</p>}
            <div className="mt-7 flex items-center justify-between border-t border-[#ead8d0] pt-4 text-[10px] text-[#9a8177]"><span>Confidential · Internal operations</span><span>wrapandrolltz.com</span></div>
          </div>
        </div>}
      </Modal>

      {(aiReview || aiError) && <Card className="mb-6 border border-primary/20 bg-primary/5">
        <div className="flex items-start justify-between gap-4"><div><h3 className="font-display font-bold text-sm">Gemini operations feedback</h3><p className="mt-1 text-xs text-surface-on-variant">Generated from the current sales, orders, inventory, workforce, and finance data.</p></div><Sparkles size={18} className="text-primary" /></div>
        {aiError ? <p className="mt-4 text-sm text-error">{aiError}</p> : <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6 text-surface-on">{aiReview}</pre>}
      </Card>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Gross Revenue" value={formatCurrency(totalRevenue)} change={financialChanges.revenue ?? undefined} icon={DollarSign} iconColor="green" />
        <StatCard title="Net Profit" value={formatCurrency(totalProfit)} change={financialChanges.profit ?? undefined} icon={TrendingUp} iconColor="primary" />
        <StatCard title="Profit Margin" value={profitMargin + '%'} change={financialChanges.margin ?? undefined} icon={PieChart} iconColor="yellow" />
        <StatCard title="Tax Liability (VAT)" value={formatCurrency(taxLiability)} icon={FileText} iconColor="red" />
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
            {paymentMethods.map((pm, index) => (
              <div key={pm.method}>
                <div className="flex justify-between text-sm mb-1"><span className="font-semibold capitalize">{pm.method.replace('_', ' ')}</span><span className="text-surface-on-variant">{pm.pct}%</span></div>
                <div className="bg-surface-container-low rounded-full h-3 overflow-hidden"><div className={'h-full rounded-full ' + ['bg-primary', 'bg-secondary-container', 'bg-gray-400'][index % 3]} style={{ width: pm.pct + '%' }} /></div>
              </div>
            ))}
            {!paymentMethods.length && <p className="text-sm text-surface-on-variant">No payment data available.</p>}
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
              <span className="font-semibold text-sm w-20">{d.label || d.month}</span>
              <div className="flex-1 bg-surface-container-low rounded-full h-4 overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${Math.min((Number(d.revenue || 0) / maxHistoricalRevenue) * 100, 100)}%` }} /></div>
              <span className="font-bold text-sm w-24 text-right">{formatCurrency(d.revenue)}</span>
              <span className="text-sm text-success w-24 text-right">{formatCurrency(d.profit)} profit</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
