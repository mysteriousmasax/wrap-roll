import { useEffect, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import {
  ArrowDownToLine, Banknote, Check, ClipboardCheck, FilePlus2, Package,
  Pencil, Receipt, ShieldCheck, Trash2, WalletCards, X
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
  const [expenses, setExpenses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ expenseDate: new Date().toISOString().slice(0, 10), category: expenseCategories[0], description: '', supplier: '', amount: '', paymentMethod: 'bank', receiptRef: '' });

  const loadData = async () => {
    const [nextOverview, nextExpenses] = await Promise.all([api.getBusinessOverview(), api.getBusinessExpenses()]);
    setOverview(nextOverview);
    setExpenses(nextExpenses);
  };

  useEffect(() => { loadData().catch(() => setMessage('Business data could not be loaded.')); }, []);

  const submitExpense = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (editingExpense) await api.updateBusinessExpense(editingExpense.id, form);
      else await api.createBusinessExpense(form);
      setForm({ ...form, description: '', supplier: '', amount: '', receiptRef: '' });
      setEditingExpense(null);
      setShowForm(false);
      setMessage(editingExpense ? 'Expense updated.' : 'Expense submitted for approval.');
      await loadData();
    } catch (error) {
      setMessage(error.message || 'Expense could not be saved.');
    } finally { setSaving(false); }
  };

  const setExpenseStatus = async (id, status) => {
    await api.updateBusinessExpenseStatus(id, status);
    await loadData();
  };

  const editExpense = (expense) => {
    setEditingExpense(expense);
    setForm({ expenseDate: expense.expense_date, category: expense.category, description: expense.description, supplier: expense.supplier || '', amount: expense.amount, paymentMethod: expense.payment_method || 'bank', receiptRef: expense.receipt_ref || '' });
    setShowForm(true);
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

  if (!overview) return <div className="p-6 text-sm text-surface-on-variant">Loading business operations...</div>;

  return (
    <div className={embedded ? '' : 'p-4 sm:p-6'}>
      {!embedded && <PageHeader title="Business Operations" subtitle="Control the money, people, suppliers, and daily health of the restaurant" actions={<Button size="sm" onClick={() => setShowForm(!showForm)}><FilePlus2 size={15} /> Record expense</Button>} />}
      {embedded && <div className="mb-4 flex justify-end"><Button size="sm" onClick={() => setShowForm(!showForm)}><FilePlus2 size={15} /> Record expense</Button></div>}

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
          <div className="flex items-end"><Button type="submit" disabled={saving} className="w-full">{saving ? 'Saving...' : editingExpense ? 'Save changes' : 'Submit for approval'}</Button></div>
        </form>
      </Card>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Month revenue" value={formatCurrency(overview.revenue)} detail={`${overview.orders} completed orders`} icon={Banknote} />
        <Metric label="Operating profit" value={formatCurrency(overview.operatingProfit)} detail="After payroll and expenses" icon={WalletCards} tone={overview.operatingProfit >= 0 ? 'green' : 'red'} />
        <Metric label="Expenses" value={formatCurrency(overview.expenses)} detail={`${overview.expenseCount} recorded this month`} icon={Receipt} tone="yellow" />
        <Metric label="VAT collected" value={formatCurrency(overview.tax)} detail="Ready for tax review" icon={ShieldCheck} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display font-bold">Expense control</h2><p className="text-xs text-surface-on-variant">Review bills before they affect the books.</p></div><Badge variant="yellow">{overview.pendingExpenses} pending</Badge></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[680px]"><thead><tr className="border-b border-outline-variant text-left text-[10px] uppercase tracking-wider text-surface-on-variant"><th className="p-2">Date</th><th className="p-2">Description</th><th className="p-2">Supplier</th><th className="p-2 text-right">Amount</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-b border-outline-variant/40 text-sm"><td className="p-2">{expense.expense_date}</td><td className="p-2 font-semibold">{expense.description}<span className="block text-xs text-surface-on-variant">{expense.category}</span></td><td className="p-2 text-surface-on-variant">{expense.supplier || 'Unassigned'}</td><td className="p-2 text-right font-bold">{formatCurrency(expense.amount)}</td><td className="p-2"><Badge variant={expense.status === 'approved' ? 'green' : expense.status === 'rejected' ? 'red' : 'yellow'}>{expense.status}</Badge></td><td className="p-2"><div className="flex gap-1"><button type="button" onClick={() => editExpense(expense)} className="rounded-md bg-slate-50 p-1.5 text-slate-700" title="Edit expense"><Pencil size={14} /></button>{expense.status === 'pending' && <><button type="button" onClick={() => setExpenseStatus(expense.id, 'approved')} className="rounded-md bg-emerald-50 p-1.5 text-emerald-700" title="Approve"><Check size={14} /></button><button type="button" onClick={() => setExpenseStatus(expense.id, 'rejected')} className="rounded-md bg-red-50 p-1.5 text-red-700" title="Reject"><X size={14} /></button></>}<button type="button" onClick={() => deleteExpense(expense.id)} className="rounded-md bg-red-50 p-1.5 text-red-700" title="Delete expense"><Trash2 size={14} /></button></div></td></tr>)}</tbody></table>{!expenses.length && <p className="py-8 text-center text-sm text-surface-on-variant">No expenses have been recorded yet.</p>}</div>
        </Card>

        <div className="space-y-4">
          <Card><div className="mb-4 flex items-center gap-2"><ClipboardCheck size={18} className="text-primary" /><h2 className="font-display font-bold">Cash & payroll</h2></div><div className="space-y-3">{overview.cash.map((item) => <div key={item.method} className="flex items-center justify-between text-sm"><span className="capitalize text-surface-on-variant">{item.method.replace('_', ' ')}</span><span className="font-bold">{formatCurrency(item.amount)}</span></div>)}<div className="flex justify-between border-t border-outline-variant pt-3 text-sm"><span className="text-surface-on-variant">Current payroll</span><span className="font-bold">{formatCurrency(overview.payroll)}</span></div></div></Card>
          <Card><div className="mb-4 flex items-center gap-2"><Package size={18} className="text-primary" /><h2 className="font-display font-bold">Supplier & stock watch</h2></div>{overview.lowStock.map((item) => <div key={item.id} className="mb-3 flex items-center justify-between gap-3 text-sm"><div><p className="font-semibold">{item.name}</p><p className="text-xs text-surface-on-variant">{item.supplier || 'No supplier'}</p></div><span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{item.quantity} {item.unit}</span></div>)}{!overview.lowStock.length && <p className="text-sm text-surface-on-variant">Stock levels are healthy.</p>}<a href="/management/operations" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary">Open operations hub <ArrowDownToLine size={13} /></a></Card>
        </div>
      </div>
    </div>
  );
}
