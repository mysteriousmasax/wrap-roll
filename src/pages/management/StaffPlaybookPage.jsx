import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Copy, Printer, Save, ShieldAlert, Utensils } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';

const tabs = [
  { id: 'checklists', label: 'Daily checklists', Icon: ClipboardCheck },
  { id: 'recovery', label: 'Guest recovery', Icon: ShieldAlert },
  { id: 'menu', label: 'Menu guide', Icon: Utensils },
  { id: 'handover', label: 'Shift handover', Icon: Save },
];

const recoveryScripts = [
  {
    scenario: 'Delayed delivery', prompt: '“Mbona mnazingua?”',
    response: 'Pole sana Ndugu [Jina] kwa kucheleweshewa chakula chako. Tunatambua tumekukwaza. Tunafuatilia oda yako sasa hivi na tutakupa taarifa ndani ya dakika 2. Kufidia hili, tutakupa drink ya bure.',
    action: 'Contact the Bolt driver now, update the guest within 2 minutes, and record any complimentary item.',
  },
  {
    scenario: 'Incorrect or missing item', prompt: '',
    response: 'Pole sana [Jina] kwa makosa haya. Tunaweza kutuma [Kitu Sahihi] mara moja tukiwa tumelipia delivery, AU kukurudishia pesa za [Kitu Kilichokosekana] kwa M-Pesa sasa hivi.',
    action: 'Dispatch a replacement or arrange an immediate M-Pesa refund; record which resolution was agreed.',
  },
  {
    scenario: 'Food quality complaint', prompt: '',
    response: 'Habari [Jina], poleni sana. Ahadi yetu Wrap & Roll ni chakula fresh na cha kifalme. Tutakutumia oda mpya iliyoandaliwa sasa hivi au tutakuwekea full credit kwa mlo wako unaofuata.',
    action: 'Notify the kitchen lead; replace the meal or record the approved store credit.',
  },
];

const menuGuide = [
  {
    category: 'Wraps & Rolls', items: 'Veggie: 12.5k / 13k\nChicken Tandoori: 16k / 19k\nHouse Steak: 17k / 21k\nPastrami Beef: 17k / 20k',
    options: 'Bread: White or Cheese & Herbs\nPortions: Half or Full\nMozzarella +TZS 3,000\nJalapeños +TZS 1,500',
    script: '“Would you prefer White or Cheese & Herbs bread today? Adding extra Mozzarella makes it extra rich!”',
  },
  {
    category: 'Burgers', items: 'Chicken Burger: TZS 9,000\nBeef Burger: TZS 12,500\n2x Beef Burger: TZS 18,000',
    options: 'All burgers include cheese.\nMake It a Meal: +TZS 7,000 for small chips and a 600ml soda.',
    script: '“Would you like to Make It a Meal with small chips and a cold 600ml soda for just TZS 7,000 extra?”',
  },
  {
    category: 'Combos & Feasts', items: 'Burger Combo: TZS 17,000\nChicken Roll Lunchbox: TZS 17,000\n2x Pizza Combo: TZS 42,000\nFamily Package: TZS 74,000',
    options: 'Choose soda size: 300ml, 600ml, or 1.25L.\nFries: medium or large.',
    script: '“Gathering with friends? Our 2x Pizza Combo gives you 2 medium pizzas, medium fries and 2 sodas for TZS 42,000!”',
  },
];

const today = () => new Date().toLocaleDateString('en-CA');

export default function StaffPlaybookPage() {
  const [activeTab, setActiveTab] = useState('checklists');
  const [date, setDate] = useState(today());
  const [checklist, setChecklist] = useState(null);
  const [checklistLoading, setChecklistLoading] = useState(true);
  const [checklistError, setChecklistError] = useState('');
  const [shift, setShift] = useState('morning');
  const [handover, setHandover] = useState(null);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setChecklistLoading(true);
    api.getOperationalChecklists(date)
      .then((result) => { if (!cancelled) setChecklist(result); })
      .catch((error) => { if (!cancelled) setChecklistError(error.message || 'Unable to load daily checklist.'); })
      .finally(() => { if (!cancelled) setChecklistLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    setHandoverLoading(true);
    api.getShiftHandover(date, shift)
      .then((result) => { if (!cancelled) setHandover(result); })
      .catch((error) => { if (!cancelled) setMessage(error.message || 'Unable to load handover.'); })
      .finally(() => { if (!cancelled) setHandoverLoading(false); });
    return () => { cancelled = true; };
  }, [date, shift]);

  const toggleTask = async (phase, task) => {
    const next = !task.completed;
    setChecklist((current) => ({ ...current, phases: current.phases.map((group) => group.id !== phase.id ? group : ({
      ...group,
      tasks: group.tasks.map((item) => item.key !== task.key ? item : { ...item, completed: next, completedAt: next ? new Date().toISOString() : null }),
    })) }));
    try {
      await api.updateOperationalChecklistTask(date, phase.id, task.key, next);
      setChecklistError('');
    } catch (error) {
      setChecklistError(error.message || 'Checklist update failed.');
      setChecklist((current) => ({ ...current, phases: current.phases.map((group) => group.id !== phase.id ? group : ({
        ...group,
        tasks: group.tasks.map((item) => item.key !== task.key ? item : { ...item, completed: task.completed, completedAt: task.completedAt }),
      })) }));
    }
  };

  const updateReconciliation = (key, field, value) => setHandover((current) => ({
    ...current,
    reconciliation: { ...current.reconciliation, [key]: { ...current.reconciliation[key], [field]: value } },
  }));

  const updateInventoryCount = (index, field, value) => setHandover((current) => ({
    ...current,
    inventoryCounts: current.inventoryCounts.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row),
  }));

  const saveHandover = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const result = await api.saveShiftHandover({ ...handover, date, shift });
      setHandover((current) => ({ ...current, ...result }));
      setMessage('Shift handover saved.');
    } catch (error) { setMessage(error.message || 'Unable to save shift handover.'); }
    finally { setSaving(false); }
  };

  const copyScript = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Response copied. Personalize the guest name and order details before sending.');
    } catch { setMessage('Unable to copy response on this device.'); }
  };

  const completedCount = checklist?.phases.flatMap((phase) => phase.tasks).filter((task) => task.completed).length || 0;
  const taskCount = checklist?.phases.reduce((count, phase) => count + phase.tasks.length, 0) || 0;

  return (
    <div className="min-w-0 p-3 sm:p-6">
      <PageHeader mobileStack title="Staff Playbook" subtitle="Shift checklists, guest recovery, menu guidance, and handovers" />
      {message && <div role="status" className="mb-4 rounded-lg bg-surface-container-low px-3 py-2 text-sm">{message}</div>}
      <nav aria-label="Staff playbook sections" className="mb-5 grid grid-cols-2 gap-1 border-b border-outline-variant pb-2 sm:flex sm:flex-wrap sm:gap-2">
        {tabs.map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-xs font-bold sm:shrink-0 sm:justify-start sm:px-3 ${activeTab === id ? 'border-primary text-primary' : 'border-transparent text-surface-on-variant'}`}><Icon size={15} />{label}</button>)}
      </nav>

      {activeTab === 'checklists' && <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Timed daily checklist</h2><p className="text-xs text-surface-on-variant">{completedCount} of {taskCount} tasks complete today.</p></div><label className="text-xs font-semibold">Business date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-field mt-1 block" /></label></div>
        {checklistError && <p role="alert" className="text-sm text-red-700">{checklistError}</p>}
        {checklistLoading && <p className="py-6 text-sm text-surface-on-variant">Loading checklist…</p>}
        {(checklist?.phases || []).map((phase) => <Card key={phase.id} className="min-w-0 p-4 sm:p-5"><div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] font-bold uppercase text-primary">{phase.time}</p><h3 className="font-display font-bold">{phase.title}</h3></div><span className="text-xs text-surface-on-variant">Lead: {phase.lead}</span></div><div className="space-y-2">{phase.tasks.map((task) => <label key={task.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant/70 p-3 text-sm"><input type="checkbox" checked={task.completed} onChange={() => toggleTask(phase, task)} className="mt-0.5 h-4 w-4 accent-primary" /><span className="min-w-0 flex-1"><span className={task.completed ? 'text-surface-on-variant line-through' : ''}>{task.label}</span>{task.completed && task.completedBy && <span className="mt-1 block text-[10px] text-surface-on-variant">Completed by {task.completedBy}</span>}</span>{task.completed && <CheckCircle2 size={16} className="shrink-0 text-green-700" />}</label>)}</div></Card>)}
      </div>}

      {activeTab === 'recovery' && <div className="grid min-w-0 gap-4 xl:grid-cols-3">{recoveryScripts.map((item) => <Card key={item.scenario} className="min-w-0 p-4 sm:p-5"><div className="mb-3"><h2 className="font-display font-bold">{item.scenario}</h2>{item.prompt && <p className="mt-1 text-xs text-surface-on-variant">Guest: {item.prompt}</p>}</div><blockquote className="rounded-lg border-l-4 border-primary bg-surface-container-low p-3 text-sm leading-6">{item.response}</blockquote><p className="mt-3 text-xs text-surface-on-variant"><strong>Resolve:</strong> {item.action}</p><Button type="button" size="sm" variant="secondary" className="mt-4" onClick={() => copyScript(item.response)}><Copy size={14} /> Copy response</Button></Card>)}</div>}

      {activeTab === 'menu' && <div className="min-w-0 space-y-4">{menuGuide.map((item) => <Card key={item.category} className="min-w-0 p-4 sm:p-5"><div className="grid gap-4 lg:grid-cols-[0.8fr_1fr_1.2fr]"><div><p className="text-[10px] font-bold uppercase text-primary">Category</p><h2 className="mt-1 font-display text-lg font-bold">{item.category}</h2></div><div><p className="text-xs font-bold">Core items &amp; pricing</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-surface-on-variant">{item.items}</p></div><div><p className="text-xs font-bold">Customization &amp; upselling</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-surface-on-variant">{item.options}</p><blockquote className="mt-3 border-l-4 border-primary pl-3 text-sm italic">{item.script}</blockquote></div></div></Card>)}<p className="text-[11px] text-surface-on-variant">Use the live POS menu and prices as the source of truth if they differ from this training guide.</p></div>}

      {activeTab === 'handover' && <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-semibold">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-field mt-1 block" /></label><div className="flex rounded-lg border border-outline-variant p-1" role="group" aria-label="Shift"><button type="button" onClick={() => setShift('morning')} aria-pressed={shift === 'morning'} className={`rounded-md px-3 py-2 text-xs font-bold ${shift === 'morning' ? 'bg-primary text-white' : 'text-surface-on-variant'}`}>Morning</button><button type="button" onClick={() => setShift('evening')} aria-pressed={shift === 'evening'} className={`rounded-md px-3 py-2 text-xs font-bold ${shift === 'evening' ? 'bg-primary text-white' : 'text-surface-on-variant'}`}>Evening</button></div><Button type="button" variant="secondary" className="print:hidden" onClick={() => window.print()}><Printer size={14} /> Print sheet</Button></div>
        {handoverLoading && <p className="py-4 text-sm text-surface-on-variant">Loading shift handover…</p>}
        {handover && <form onSubmit={saveHandover} className="min-w-0 space-y-4">
          <Card className="min-w-0 p-4 sm:p-5"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Manager out<input value={handover.manager_out || ''} onChange={(event) => setHandover({ ...handover, manager_out: event.target.value, managerOut: event.target.value })} className="input-field mt-1 w-full" /></label><label className="text-xs font-semibold">Manager in<input value={handover.manager_in || ''} onChange={(event) => setHandover({ ...handover, manager_in: event.target.value, managerIn: event.target.value })} className="input-field mt-1 w-full" /></label></div></Card>
          <Card className="min-w-0 p-4 sm:p-5"><h2 className="mb-3 font-display font-bold">Payment reconciliation · TZS</h2><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b border-outline-variant text-surface-on-variant"><th className="py-2">Payment channel</th><th className="py-2">Expected POS total</th><th className="py-2">Actual count</th><th className="py-2">Variance</th><th className="py-2">Notes</th></tr></thead><tbody>{Object.entries(handover.reconciliation || {}).map(([key, row]) => { const expected = Number(row.expected) || 0; const actual = Number(row.actual) || 0; return <tr key={key} className="border-b border-outline-variant/50"><td className="py-2 font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</td><td className="py-2">{row.expected === '' ? '—' : formatCurrency(expected)}</td><td className="py-2"><input type="number" min="0" value={row.actual ?? ''} onChange={(event) => updateReconciliation(key, 'actual', event.target.value)} className="input-field w-32" /></td><td className={`py-2 font-bold ${row.actual === '' ? '' : actual - expected === 0 ? 'text-green-700' : 'text-red-700'}`}>{row.actual === '' ? '—' : formatCurrency(actual - expected)}</td><td className="py-2 text-surface-on-variant">{row.notes || ''}</td></tr>; })}</tbody></table></div></Card>
          <Card className="min-w-0 p-4 sm:p-5"><h2 className="mb-3 font-display font-bold">Stock count</h2><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead><tr className="border-b border-outline-variant text-surface-on-variant"><th className="py-2">Item</th><th className="py-2">Unit</th><th className="py-2">Opening</th><th className="py-2">Added prep</th><th className="py-2">Closing</th><th className="py-2">Status / requisition</th></tr></thead><tbody>{(handover.inventoryCounts || []).map((row, index) => <tr key={row.item} className="border-b border-outline-variant/50"><td className="py-2 font-semibold">{row.item}</td><td className="py-2">{row.unit}</td>{['opening', 'added', 'closing'].map((field) => <td key={field} className="py-2"><input type="number" min="0" value={row[field] ?? ''} onChange={(event) => updateInventoryCount(index, field, event.target.value)} className="input-field w-24" /></td>)}<td className="py-2"><select value={row.status || 'ok'} onChange={(event) => updateInventoryCount(index, 'status', event.target.value)} className="input-field"><option value="ok">OK</option><option value="restock">Needs restock</option><option value="prep">Needs prep</option></select></td></tr>)}</tbody></table></div><label className="mt-4 block text-xs font-semibold">Manager notes<textarea rows={3} value={handover.notes || ''} onChange={(event) => setHandover({ ...handover, notes: event.target.value })} className="input-field mt-1 w-full" /></label></Card>
          <div className="flex flex-wrap justify-end gap-2 print:hidden"><Button type="submit" disabled={saving || handoverLoading}><Save size={14} /> {saving ? 'Saving…' : 'Save handover'}</Button></div>
        </form>}
      </div>}
    </div>
  );
}