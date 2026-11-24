import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';
import { formatCurrency } from '../../utils/format';
import importPhoto from '../../utils/importPhoto';
import ReceiptIntake from '../../components/ReceiptIntake';
import {
  ArrowDownToLine, Banknote, Check, ClipboardCheck, FilePlus2, Package,
  Pencil, Receipt, ScanLine, ShieldCheck, Trash2, WalletCards, X
} from 'lucide-react';

const expenseCategories = ['Food supplies', 'Utilities', 'Rent', 'Repairs', 'Marketing', 'Transport', 'Other'];
const paymentMethods = ['bank', 'cash', 'mobile_money', 'card'];

function Metric({ label, value, detail, icon: Icon, tone = 'green' }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-surface-on-variant">{label}</p><p className="mt-2 text-2xl font-display font-bold">{value}</p><p className="mt-1 text-xs text-surface-on-variant">{detail}</p></div>
        <div className={`rounded-xl p-2.5 ${tone === 'red' ? 'bg-red-50 text-red-700' : tone === 'yellow' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><Icon size={19} /></div>
      </div>
    </Card>
  );
}

export default function BusinessOperationsPage({ embedded = false }) {
  const [overview, setOverview] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [intakeOpen, setIntakeOpen] = useState(false);
  const refreshTimerRef = useRef(null);
  const [form, setForm] = useState({ expenseDate: new Date().toISOString().slice(0, 10), category: expenseCategories[0], description: '', supplier: '', amount: '', paymentMethod: 'bank', receiptRef: '', receiptImage: '' });

  const loadData = async () => {
    const [nextOverview, nextExpenses, nextInventory] = await Promise.all([api.getBusinessOverview(), api.getBusinessExpenses(), api.getInventory()]);
    setOverview(nextOverview);
    setExpenses(nextExpenses);
    setInventory(nextInventory);
  };

  useEffect(() => { loadData().catch((error) => setMessage(error.message || 'Business data could not be loaded.')); }, []);
  useWebSocket((event) => {
    if (['order:created', 'order:updated', 'order:confirmed', 'payment:confirmed', 'business:updated', 'staff:updated', 'inventory:updated', 'customer:updated', 'settings:updated'].includes(event)) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => loadData().catch(() => {}), 50);
    }
  });

  const submitExpense = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (editingExpense) await api.updateBusinessExpense(editingExpense.id, form);
      else await api.createBusinessExpense(form);
      setForm({ ...form, description: '', supplier: '', amount: '', receiptRef: '', receiptImage: '' });
      setEditingExpense(null);
      setShowForm(false);
      setMessage(editingExpense?.status === 'rejected'
        ? 'Expense updated and resubmitted for approval.'
        : editingExpense ? 'Expense updated.' : 'Expense submitted for approval.');
      await loadData();
    } catch (error) {
      setMessage(error.message || 'Expense could not be saved.');
    } finally { setSaving(false); }
  };

  const setExpenseStatus = async (id, status) => {
    try {
      await api.updateBusinessExpenseStatus(id, status);
      setMessage(status === 'approved' ? 'Expense approved.' : status === 'rejected' ? 'Expense rejected.' : 'Expense status updated.');
      await loadData();
    } catch (error) {
      setMessage(error.message || 'Expense status could not be updated.');
    }
  };

  const editExpense = async (expense) => {
    let receiptImage = '';
    if (expense.has_receipt_image) {
      try {
        ({ receiptImage } = await api.getBusinessExpenseReceiptImage(expense.id));
      } catch (error) {
        setMessage(error.message || 'Receipt photo could not be loaded.');
        return;
      }
    }
    setEditingExpense(expense);
    setForm({ expenseDate: expense.expense_date, category: expense.category, description: expense.description, supplier: expense.supplier || '', amount: expense.amount, paymentMethod: expense.payment_method || 'bank', receiptRef: expense.receipt_ref || '', receiptImage });
    setShowForm(true);
  };

  const attachReceiptPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const receiptImage = await importPhoto(file);
      setForm((current) => ({ ...current, receiptImage }));
      setMessage('Receipt photo attached.');
    } catch (error) {
      setMessage(error.message || 'Receipt photo could not be attached.');
    }
  };

  const deleteExpense = async (id) => {
    if (!window.confirm('Delete this expense permanently?')) return;
    try {
      await api.deleteBusinessExpense(id);
      setMessage('Expense deleted.');
      await loadData();
    } catch (error) {
      setMessage(error.message || 'Expense could not be deleted.');
    }
  };

  if (!overview) return (
    <div className="p-6 text-sm text-surface-on-variant">
      {message ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <span>{message}</span>
          <Button size="sm" variant="secondary" onClick={() => loadData().catch((error) => setMessage(error.message || 'Business data could not be loaded.'))}>Retry</Button>
        </div>
      ) : 'Loading business operations...'}
    </div>
  );

  const lowStock = inventory.filter((item) => Number(item.quantity) <= Number(item.threshold));

  const scanActions = <div className="flex min-w-0 flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setIntakeOpen(true)}><ScanLine size={15} /> Scan receipt</Button><Button size="sm" onClick={() => setShowForm(!showForm)}><FilePlus2 size={15} /> Record expense</Button></div>;

  return (
    <div className={embedded ? '' : 'p-4 sm:p-6'}>
      {!embedded && <PageHeader title="Business Operations" subtitle="Control the money, people, suppliers, and daily health of the restaurant" actions={scanActions} />}
      {embedded && <div className="mb-4 flex justify-end">{scanActions}</div>}

      {message && <div className="mb-4 rounded-lg border border-outline-variant bg-white px-4 py-3 text-sm font-semibold">{message}</div>}

      {showForm && <Card className="mb-6 border-primary/30">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display font-bold">{editingExpense ? 'Edit business expense' : 'New business expense'}</h2><p className="text-xs text-surface-on-variant">Capture a bill, purchase, or operating cost for approval.</p></div><button type="button" onClick={() => { setShowForm(false); setEditingExpense(null); }} aria-label="Close expense form"><X size={18} /></button></div>
        <form onSubmit={submitExpense} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold">Date<input required type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant p-2.5 text-sm" /></label>
          <label className="text-xs font-semibold">Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant p-2.5 text-sm">{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold sm:col-span-2">Description<input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Weekly produce delivery" className="mt-1 w-full rounded-lg border border-outline-variant p-2.5 text-sm" /></label>
          <label className="text-xs font-semibold">Amount (TZS)<input required min="1" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant p-2.5 text-sm" /></label>
          <label className="text-xs font-semibold">Supplier<input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier or payee" className="mt-1 w-full rounded-lg border border-outline-variant p-2.5 text-sm" /></label>
          <label className="text-xs font-semibold">Payment method<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant p-2.5 text-sm">{paymentMethods.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}</select></label>
          <label className="text-xs font-semibold">Receipt reference<input value={form.receiptRef} onChange={(e) => setForm({ ...form, receiptRef: e.target.value })} placeholder="Optional" className="mt-1 w-full rounded-lg border border-outline-variant p-2.5 text-sm" /></label>
          <div className="text-xs font-semibold sm:col-span-2">
            <span>Receipt photo</span>
            <div className="mt-1 flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg border border-outline-variant px-3 py-2 text-sm font-medium">
                Upload photo<input type="file" accept="image/*" onChange={attachReceiptPhoto} className="sr-only" />
              </label>
              <label className="cursor-pointer rounded-lg border border-outline-variant px-3 py-2 text-sm font-medium">
                Take photo<input type="file" accept="image/*" capture="environment" onChange={attachReceiptPhoto} className="sr-only" />
              </label>
              {form.receiptImage && <button type="button" onClick={() => setForm({ ...form, receiptImage: '' })} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-medium text-red-700">Remove photo</button>}
            </div>
            {form.receiptImage && <img src={form.receiptImage} alt="Attached receipt" className="mt-2 max-h-40 rounded-lg border border-outline-variant object-contain" />}
            <p className="mt-1 font-normal text-surface-on-variant">Images are resized before saving with the expense.</p>
          </div>
          <div className="flex items-end"><Button type="submit" disabled={saving} className="w-full">{saving ? 'Saving...' : editingExpense ? 'Save changes' : 'Submit for approval'}</Button></div>
        </form>
      </Card>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Month revenue" value={formatCurrency(overview.revenue)} detail={`${overview.orders} completed orders`} icon={Banknote} />
        <Metric label="Operating profit" value={formatCurrency(overview.operatingProfit)} detail="After payroll and expenses" icon={WalletCards} tone={overview.operatingProfit >= 0 ? 'green' : 'red'} />
        <Metric label="Expenses" value={formatCurrency(overview.expenses)} detail={`${overview.expenseCount} recorded this month`} icon={Receipt} tone="yellow" />
        <Metric label="VAT collected" value={formatCurrency(overview.tax)} detail="Ready for tax review" icon={ShieldCheck} />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h2 className="font-display font-bold">Expense control</h2><p className="text-xs text-surface-on-variant">Review bills before they affect the books.</p></div><Badge className="max-w-full whitespace-normal text-center" variant="yellow">{overview.pendingExpenses} pending</Badge></div>
          <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[680px]"><thead><tr className="border-b border-outline-variant text-left text-[10px] uppercase tracking-wider text-surface-on-variant"><th className="p-2">Date</th><th className="p-2">Description</th><th className="p-2">Supplier</th><th className="p-2 text-right">Amount</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-b border-outline-variant/40 text-sm"><td className="p-2">{expense.expense_date}</td><td className="p-2 font-semibold">{expense.description}<span className="block text-xs text-surface-on-variant">{expense.category}</span>{expense.has_receipt_image && <span className="mt-1 block text-xs text-surface-on-variant">Receipt photo attached · open Edit to view</span>}</td><td className="p-2 text-surface-on-variant">{expense.supplier || 'Unassigned'}</td><td className="p-2 text-right font-bold">{formatCurrency(expense.amount)}</td><td className="p-2"><Badge variant={expense.status === 'approved' ? 'green' : expense.status === 'rejected' ? 'red' : 'yellow'}>{expense.status}</Badge></td><td className="p-2"><div className="flex gap-1"><button type="button" onClick={() => editExpense(expense)} className="rounded-md bg-slate-50 p-1.5 text-slate-700" title="Edit expense" aria-label="Edit expense"><Pencil size={14} /></button>{expense.status === 'pending' && <><button type="button" onClick={() => setExpenseStatus(expense.id, 'approved')} className="rounded-md bg-emerald-50 p-1.5 text-emerald-700" title="Approve" aria-label="Approve expense"><Check size={14} /></button><button type="button" onClick={() => setExpenseStatus(expense.id, 'rejected')} className="rounded-md bg-red-50 p-1.5 text-red-700" title="Reject" aria-label="Reject expense"><X size={14} /></button></>}<button type="button" onClick={() => deleteExpense(expense.id)} className="rounded-md bg-red-50 p-1.5 text-red-700" title="Delete expense" aria-label="Delete expense"><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div>
          <div className="space-y-3 sm:hidden">
            {expenses.map((expense) => <article key={expense.id} className="min-w-0 rounded-xl border border-outline-variant p-3">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-bold">{expense.description}</h3>
                  <p className="mt-1 break-words text-xs text-surface-on-variant">{expense.category} · {expense.supplier || 'Unassigned'}</p>
                </div>
                <Badge className="max-w-[45%] whitespace-normal text-center" variant={expense.status === 'approved' ? 'green' : expense.status === 'rejected' ? 'red' : 'yellow'}>{expense.status}</Badge>
              </div>
              <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 border-t border-outline-variant pt-3 text-xs">
                <div><dt className="text-surface-on-variant">Date</dt><dd className="mt-0.5 font-semibold">{expense.expense_date}</dd></div>
                <div><dt className="text-surface-on-variant">Amount</dt><dd className="mt-0.5 break-words font-bold">{formatCurrency(expense.amount)}</dd></div>
              </dl>
              {expense.has_receipt_image && <p className="mt-2 text-xs text-surface-on-variant">Receipt photo attached · open Edit to view</p>}
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-outline-variant pt-3">
                <button type="button" onClick={() => editExpense(expense)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-800"><Pencil size={14} /> Edit</button>
                {expense.status === 'pending' && <button type="button" onClick={() => setExpenseStatus(expense.id, 'approved')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-800"><Check size={14} /> Accept</button>}
                {expense.status === 'pending' && <button type="button" onClick={() => setExpenseStatus(expense.id, 'rejected')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-2 py-2 text-xs font-semibold text-amber-900"><X size={14} /> Reject</button>}
                <button type="button" onClick={() => deleteExpense(expense.id)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-red-50 px-2 py-2 text-xs font-semibold text-red-800"><Trash2 size={14} /> Delete</button>
              </div>
            </article>)}
          </div>
          {!expenses.length && <p className="py-8 text-center text-sm text-surface-on-variant">No expenses have been recorded yet.</p>}
        </Card>

        <div className="space-y-4">
          <Card><div className="mb-4 flex items-center gap-2"><ClipboardCheck size={18} className="text-primary" /><h2 className="font-display font-bold">Cash & payroll</h2></div><div className="space-y-3">{overview.cash.map((item) => <div key={item.method} className="flex items-center justify-between text-sm"><span className="capitalize text-surface-on-variant">{item.method.replace('_', ' ')}</span><span className="font-bold">{formatCurrency(item.amount)}</span></div>)}<div className="flex justify-between border-t border-outline-variant pt-3 text-sm"><span className="text-surface-on-variant">Current payroll</span><span className="font-bold">{formatCurrency(overview.payroll)}</span></div></div></Card>
          <Card><div className="mb-4 flex items-center gap-2"><Package size={18} className="text-primary" /><h2 className="font-display font-bold">Supplier & stock watch</h2></div>{lowStock.map((item) => <div key={item.id} className="mb-3 flex items-center justify-between gap-3 text-sm"><div><p className="font-semibold">{item.name}</p><p className="text-xs text-surface-on-variant">{item.supplier || 'No supplier'}</p></div><span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{item.quantity} {item.unit}</span></div>)}{!lowStock.length && <p className="text-sm text-surface-on-variant">Stock levels are healthy.</p>}<a href="/management/inventory" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary">Open live inventory <ArrowDownToLine size={13} /></a></Card>
        </div>
      </div>
      {intakeOpen && <ReceiptIntake inventory={inventory} onClose={() => setIntakeOpen(false)} onComplete={(notice) => { setIntakeOpen(false); setMessage(notice); loadData().catch(() => {}); }} />}
    </div>
  );
}
