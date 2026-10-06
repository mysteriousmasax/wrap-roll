import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Copy, Edit3, PackageCheck, Plus, Printer, Save, ShieldAlert, Trash2, Utensils } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import useAuthStore from '../../store/useAuthStore';

function summarizeStockRows(rows = []) {
  const normalized = (Array.isArray(rows) ? rows : []).map((row) => ({
    item: String(row?.item || 'New stock item').trim() || 'New stock item',
    unit: String(row?.unit || 'units').trim() || 'units',
    opening: Number(row?.opening || 0),
    added: Number(row?.added || 0),
    closing: Number(row?.closing || 0),
    status: ['ok', 'restock', 'prep', 'low'].includes(String(row?.status || 'ok')) ? String(row.status || 'ok') : 'ok',
  }));

  const totals = normalized.reduce((acc, row) => {
    acc.totalOpening += Number(row.opening || 0);
    acc.totalAdded += Number(row.added || 0);
    acc.totalClosing += Number(row.closing || 0);
    if (row.status === 'restock' || row.status === 'prep' || row.status === 'low' || row.closing <= 0) acc.lowStockCount += 1;
    return acc;
  }, { totalOpening: 0, totalAdded: 0, totalClosing: 0, lowStockCount: 0 });

  return {
    rows: normalized,
    totalItems: normalized.length,
    totalOpeningStock: totals.totalOpening,
    totalAdded: totals.totalAdded,
    totalClosingStock: totals.totalClosing,
    stockVariance: totals.totalClosing - totals.totalOpening,
    lowStockItems: normalized.filter((row) => row.status === 'restock' || row.status === 'prep' || row.status === 'low' || row.closing <= 0),
    financialSummary: {
      totalValue: totals.totalClosing * 3500,
      lowStockCount: totals.lowStockCount,
      stockVariance: totals.totalClosing - totals.totalOpening,
      currency: 'TZS',
    },
  };
}

const allTabs = [
  { id: 'checklists', label: 'Daily checklists', Icon: ClipboardCheck },
  { id: 'recovery', label: 'Guest recovery', Icon: ShieldAlert },
  { id: 'menu', label: 'Menu guide', Icon: Utensils },
  { id: 'handover', label: 'Shift handover', Icon: Save },
];

const roleTabs = {
  admin: allTabs,
  manager: allTabs,
  executive: allTabs,
  foh: [allTabs[0], allTabs[1], allTabs[3]],
  kitchen: [allTabs[0], allTabs[3]],
};

const roleChecklistPhases = {
  admin: ['morning-kitchen', 'foh-digital', 'lunch-rush', 'midday-handover', 'evening-close'],
  executive: ['morning-kitchen', 'foh-digital', 'lunch-rush', 'midday-handover', 'evening-close'],
  manager: ['morning-kitchen', 'foh-digital', 'lunch-rush', 'midday-handover', 'evening-close'],
  foh: ['foh-digital', 'lunch-rush', 'midday-handover', 'evening-close'],
  kitchen: ['morning-kitchen', 'lunch-rush', 'midday-handover', 'evening-close'],
};

const shiftChecklistPhases = {
  morning: ['morning-kitchen', 'foh-digital', 'lunch-rush', 'midday-handover'],
  evening: ['lunch-rush', 'midday-handover', 'evening-close'],
};

const financialModel = [
  {
    title: 'Expense',
    detail: 'Bills, rent, utility, transport, repairs, marketing and supplier payments. These hit the P&L immediately and reduce operating profit.',
    effect: 'Affects monthly operating profit and expense controls, not stock quantity.',
  },
  {
    title: 'Inventory',
    detail: 'Tracked stock items with unit cost, reorder threshold, supplier, and storage location. They show low-stock, receiving records, and stock value.',
    effect: 'Affects inventory value, COGS, restocking, and stock alerts when used or received.',
  },
  {
    title: 'Bread / stock items',
    detail: 'Bread batches, prep items, and reusable stock such as bread rolls, meat prep, condiments and packaging count as inventory stock.',
    effect: 'These are counted in the daily stock sheet and impact food cost and gross margin when used to prep orders.',
  },
];

const recoveryScripts = [
  {
    scenario: 'Delayed delivery',
    prompt: '“Mbona mnazingua?”',
    response: 'Pole sana Ndugu [Jina] kwa kucheleweshewa chakula chako. Tunatambua tumekukwaza. Tunafuatilia oda yako sasa hivi na tutakupa taarifa ndani ya dakika 2. Kufidia hili, tutakupa drink ya bure.',
    action: 'Contact the Bolt driver now, update the guest within 2 minutes, and record any complimentary item.',
  },
  {
    scenario: 'Incorrect or missing item',
    prompt: '',
    response: 'Pole sana [Jina] kwa makosa haya. Tunaweza kutuma [Kitu Sahihi] mara moja tukiwa tumelipia delivery, AU kukurudishia pesa za [Kitu Kilichokosekana] kwa M-Pesa sasa hivi.',
    action: 'Dispatch a replacement or arrange an immediate M-Pesa refund; record which resolution was agreed.',
  },
  {
    scenario: 'Food quality complaint',
    prompt: '',
    response: 'Habari [Jina], poleni sana. Ahadi yetu Wrap & Roll ni chakula fresh na cha kifalme. Tutakutumia oda mpya iliyoandaliwa sasa hivi au tutakuwekea full credit kwa mlo wako unaofuata.',
    action: 'Notify the kitchen lead; replace the meal or record the approved store credit.',
  },
];

const menuGuide = [
  {
    category: 'Wraps & Rolls',
    items: 'Veggie: 12.5k / 13k\nChicken Tandoori: 16k / 19k\nHouse Steak: 17k / 21k\nPastrami Beef: 17k / 20k',
    options: 'Bread: White or Cheese & Herbs\nPortions: Half or Full\nMozzarella +TZS 3,000\nJalapeños +TZS 1,500',
    script: '“Would you prefer White or Cheese & Herbs bread today? Adding extra Mozzarella makes it extra rich!”',
  },
  {
    category: 'Burgers',
    items: 'Chicken Burger: TZS 9,000\nBeef Burger: TZS 12,500\n2x Beef Burger: TZS 18,000',
    options: 'All burgers include cheese.\nMake It a Meal: +TZS 7,000 for small chips and a 600ml soda.',
    script: '“Would you like to Make It a Meal with small chips and a cold 600ml soda for just TZS 7,000 extra?”',
  },
  {
    category: 'Combos & Feasts',
    items: 'Burger Combo: TZS 17,000\nChicken Roll Lunchbox: TZS 17,000\n2x Pizza Combo: TZS 42,000\nFamily Package: TZS 74,000',
    options: 'Choose soda size: 300ml, 600ml, or 1.25L.\nFries: medium or large.',
    script: '“Gathering with friends? Our 2x Pizza Combo gives you 2 medium pizzas, medium fries and 2 sodas for TZS 42,000!”',
  },
];

const today = () => new Date().toLocaleDateString('en-CA');

export default function StaffPlaybookPage() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const role = currentUser?.role || 'manager';
  const tabs = useMemo(() => roleTabs[role] || allTabs, [role]);
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'checklists');
  const [date, setDate] = useState(today());
  const [checklist, setChecklist] = useState(null);
  const [checklistLoading, setChecklistLoading] = useState(true);
  const [checklistError, setChecklistError] = useState('');
  const [shift, setShift] = useState('morning');
  const [handover, setHandover] = useState(null);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [stockReport, setStockReport] = useState({ rows: [], financialSummary: { totalValue: 0, lowStockCount: 0, stockVariance: 0, currency: 'TZS' } });
  const [stockReportLoading, setStockReportLoading] = useState(false);
  const [stockReportError, setStockReportError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [taskEditor, setTaskEditor] = useState(null);
  const [taskSaving, setTaskSaving] = useState(false);

  const loadDailyStockReport = async (reportDate = date) => {
    setStockReportLoading(true);
    setStockReportError('');
    try {
      const result = await api.getOperationalSummary('daily_stock', reportDate);
      const payload = result?.payload && typeof result.payload === 'object'
        ? result.payload
        : { rows: [], financialSummary: { totalValue: 0, lowStockCount: 0, stockVariance: 0, currency: 'TZS' } };

      setStockReport({
        ...payload,
        checkedBy: result?.checkedBy || payload.checkedBy || '',
        approvedBy: result?.approvedBy || payload.approvedBy || '',
        checkedAt: result?.checkedAt || payload.checkedAt || null,
        approvedAt: result?.approvedAt || payload.approvedAt || null,
      });
    } catch (error) {
      setStockReportError(error.message || 'Unable to load stock report.');
    } finally {
      setStockReportLoading(false);
    }
  };

  const saveDailyStockReport = async ({ approve = false } = {}) => {
    const rows = (handover?.inventoryCounts || []).map((row) => ({
      item: row?.item || 'New stock item',
      unit: row?.unit || 'units',
      opening: Number(row?.opening || 0),
      added: Number(row?.added || 0),
      closing: Number(row?.closing || 0),
      status: row?.status || 'ok',
    }));

    const payload = summarizeStockRows(rows);
    await api.saveOperationalSummary('daily_stock', date, payload);
    if (approve) await api.approveOperationalSummary('daily_stock', date);
    await loadDailyStockReport(date);
    return payload;
  };

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) setActiveTab(tabs[0]?.id || 'checklists');
  }, [tabs, activeTab]);

  useEffect(() => {
    let cancelled = false;
    setChecklistLoading(true);
    api.getOperationalChecklists(date)
      .then((result) => { if (!cancelled) setChecklist(result); })
      .catch((error) => { if (!cancelled) setChecklistError(error.message || 'Unable to load daily checklist.'); })
      .finally(() => { if (!cancelled) setChecklistLoading(false); });
    return () => { cancelled = true; };
  }, [date, currentUser?.id]);

  useEffect(() => {
    if (!date) return undefined;
    loadDailyStockReport(date);
    return undefined;
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    setHandoverLoading(true);
    api.getShiftHandover(date, shift)
      .then((result) => {
        if (!cancelled) {
          setHandover({
            ...result,
            inventoryCounts: (result.inventoryCounts || []).map((row, index) => ({ ...row, clientKey: `${date}-${shift}-${index}` })),
          });
        }
      })
      .catch((error) => { if (!cancelled) setMessage(error.message || 'Unable to load handover.'); })
      .finally(() => { if (!cancelled) setHandoverLoading(false); });
    return () => { cancelled = true; };
  }, [date, shift]);

  const toggleTask = async (phase, task) => {
    const next = !task.completed;
    setChecklist((current) => ({
      ...current,
      phases: current.phases.map((group) => group.id !== phase.id ? group : ({
        ...group,
        tasks: group.tasks.map((item) => item.key !== task.key ? item : { ...item, completed: next, completedAt: next ? new Date().toISOString() : null }),
      })),
    }));

    try {
      await api.updateOperationalChecklistTask(date, phase.id, task.key, next);
      setChecklistError('');
      setChecklist((current) => ({
        ...current,
        phases: current.phases.map((group) => group.id !== phase.id ? group : ({
          ...group,
          tasks: group.tasks.map((item) => item.key !== task.key ? item : {
            ...item,
            completed: next,
            completedBy: next ? (currentUser?.name || '') : '',
            completedAt: next ? new Date().toISOString() : null,
          }),
        })),
      }));
      const refreshedChecklist = await api.getOperationalChecklists(date);
      setChecklist(refreshedChecklist);
    } catch (error) {
      setChecklistError(error.message || 'Checklist update failed.');
      setChecklist((current) => ({
        ...current,
        phases: current.phases.map((group) => group.id !== phase.id ? group : ({
          ...group,
          tasks: group.tasks.map((item) => item.key !== task.key ? item : { ...item, completed: task.completed, completedAt: task.completedAt }),
        })),
      }));
    }
  };

  const saveChecklistTask = async (event) => {
    event.preventDefault();
    const label = taskEditor?.label.trim();
    if (!label) return;
    setTaskSaving(true);
    setChecklistError('');
    try {
      if (taskEditor.key) await api.updateOperationalChecklistTaskLabel(taskEditor.key, label);
      else await api.createOperationalChecklistTask(taskEditor.phaseId, label);
      setChecklist(await api.getOperationalChecklists(date));
      setTaskEditor(null);
    } catch (error) {
      setChecklistError(error.message || 'Unable to save checklist item.');
    } finally {
      setTaskSaving(false);
    }
  };

  const deleteChecklistTask = async (task) => {
    if (!window.confirm(`Delete checklist item "${task.label}"?`)) return;
    setChecklistError('');
    try {
      await api.deleteOperationalChecklistTask(task.key);
      setChecklist(await api.getOperationalChecklists(date));
      if (taskEditor?.key === task.key) setTaskEditor(null);
    } catch (error) {
      setChecklistError(error.message || 'Unable to delete checklist item.');
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

  const addInventoryCount = () => setHandover((current) => ({
    ...current,
    inventoryCounts: [...(current.inventoryCounts || []), { clientKey: `new-${Date.now()}-${Math.random()}`, item: 'New stock item', unit: 'units', opening: '', added: '', closing: '', status: 'ok' }],
  }));

  const removeInventoryCount = (index) => setHandover((current) => ({
    ...current,
    inventoryCounts: (current.inventoryCounts || []).filter((_, rowIndex) => rowIndex !== index),
  }));

  const saveHandover = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const inventoryCounts = (handover.inventoryCounts || []).map(({ clientKey, ...row }) => row);
      const result = await api.saveShiftHandover({ ...handover, inventoryCounts, date, shift });
      setHandover((current) => ({ ...current, ...result, inventoryCounts: current.inventoryCounts }));
      await saveDailyStockReport({ approve: false });
      setMessage('Shift handover saved.');
    } catch (error) {
      setMessage(error.message || 'Unable to save shift handover.');
    } finally {
      setSaving(false);
    }
  };

  const approveDailyStock = async () => {
    try {
      await saveDailyStockReport({ approve: true });
      setMessage('Daily stock report checked and approved.');
    } catch (error) {
      setMessage(error.message || 'Unable to approve daily stock report.');
    }
  };

  const copyScript = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Response copied. Personalize the guest name and order details before sending.');
    } catch {
      setMessage('Unable to copy response on this device.');
    }
  };

  const allowedPhaseIds = roleChecklistPhases[role] || roleChecklistPhases.manager;
  const canManageChecklist = ['admin', 'manager', 'executive'].includes(role);
  const visiblePhases = (checklist?.phases || []).filter((phase) => (
    allowedPhaseIds.includes(phase.id) && shiftChecklistPhases[shift].includes(phase.id)
  ));
  const completedCount = visiblePhases.flatMap((phase) => phase.tasks).filter((task) => task.completed).length;
  const taskCount = visiblePhases.reduce((count, phase) => count + phase.tasks.length, 0);
  const nextPhaseId = visiblePhases.find((phase) => phase.tasks.some((task) => !task.completed))?.id;

  return (
    <div className="min-w-0 p-3 sm:p-6">
      <PageHeader mobileStack title="Staff Playbook" subtitle="Shift checklists, guest recovery, menu guidance, and handovers" />
      {message && <div role="status" className="mb-4 rounded-lg bg-surface-container-low px-3 py-2 text-sm">{message}</div>}

      <nav aria-label="Staff playbook sections" className="mb-5 grid grid-cols-2 gap-1 border-b border-outline-variant pb-2 sm:flex sm:flex-wrap sm:gap-2">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)} className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-xs font-bold sm:shrink-0 sm:justify-start sm:px-3 ${activeTab === id ? 'border-primary text-primary' : 'border-transparent text-surface-on-variant'}`}>
            <Icon size={15} />{label}
          </button>
        ))}
      </nav>

      {activeTab === 'checklists' && (
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{currentUser?.name || 'My account'} · {role}</p>
              <h2 className="mt-1 font-display text-lg font-bold">My shift checklist</h2>
              <p className="text-xs text-surface-on-variant">{completedCount} of {taskCount} assigned tasks complete.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase text-surface-on-variant">My shift</p>
                <div className="flex rounded-lg border border-outline-variant p-1" role="group" aria-label="Checklist shift">
                  {['morning', 'evening'].map((option) => (
                    <button key={option} type="button" onClick={() => setShift(option)} aria-pressed={shift === option} className={`rounded-md px-3 py-2 text-xs font-bold capitalize ${shift === option ? 'bg-primary text-white' : 'text-surface-on-variant'}`}>
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <label className="text-xs font-semibold">
                Business date
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-field mt-1 block" />
              </label>
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-label="My shift checklist progress" aria-valuemin={0} aria-valuemax={taskCount} aria-valuenow={completedCount}>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${taskCount ? (completedCount / taskCount) * 100 : 0}%` }} />
          </div>

          {checklistError && <p role="alert" className="text-sm text-red-700">{checklistError}</p>}
          {checklistLoading && <p className="py-6 text-sm text-surface-on-variant">Loading checklist…</p>}
          {['admin', 'manager', 'executive'].includes(role) && checklist?.teamProgress?.length > 0 && (
            <Card className="min-w-0 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold">Team checklist progress</h3>
                  <p className="text-xs text-surface-on-variant">Individual completion is tracked separately by account.</p>
                </div>
                <ClipboardCheck size={17} className="text-primary" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {checklist.teamProgress.map((person) => (
                  <div key={person.staffId || person.userId} className="rounded-lg border border-outline-variant p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold">{person.name}</p>
                      <span className="shrink-0 text-xs font-semibold text-primary">{person.completedTasks}/{checklist.totalTasks}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${checklist.totalTasks ? Math.min(100, (person.completedTasks / checklist.totalTasks) * 100) : 0}%` }} />
                    </div>
                    <p className="mt-2 text-[10px] capitalize text-surface-on-variant">{person.userId ? `Account #${person.userId}` : `HR staff #${person.staffId}`} · {person.role || 'staff'}</p>
                    <p className="mt-2 text-[10px] text-surface-on-variant">Last activity {person.lastUpdated ? new Date(person.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'not recorded'}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {visiblePhases.map((phase, phaseIndex) => {
            const phaseCompleted = phase.tasks.filter((task) => task.completed).length;
            const isComplete = phaseCompleted === phase.tasks.length;
            const phaseStatus = isComplete ? 'Complete' : phase.id === nextPhaseId ? 'In progress' : 'Up next';
            return (
              <Card key={phase.id} className="min-w-0 p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${isComplete ? 'bg-green-100 text-green-800' : phase.id === nextPhaseId ? 'bg-primary text-white' : 'bg-surface-container-high text-surface-on-variant'}`}>
                      {isComplete ? <CheckCircle2 size={16} /> : phaseIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase text-primary">{phase.time} · {phase.lead}</p>
                      <h3 className="font-display font-bold">{phase.title}</h3>
                      <p className="mt-1 text-[10px] text-surface-on-variant">{phaseCompleted} of {phase.tasks.length} steps complete</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isComplete ? 'bg-green-100 text-green-800' : phase.id === nextPhaseId ? 'bg-red-50 text-primary' : 'bg-surface-container-low text-surface-on-variant'}`}>
                    {phaseStatus}
                  </span>
                </div>
                <div className="space-y-2">
                  {canManageChecklist && (
                    <div className="mb-3">
                      <Button type="button" size="sm" variant="secondary" onClick={() => setTaskEditor({ phaseId: phase.id, key: '', label: '' })}>
                        <Plus size={14} /> Add checklist item
                      </Button>
                      {taskEditor?.phaseId === phase.id && (
                        <form onSubmit={saveChecklistTask} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-outline-variant p-3">
                          <label className="min-w-[220px] flex-1 text-xs font-semibold">
                            Checklist item
                            <input
                              autoFocus
                              maxLength={240}
                              value={taskEditor.label}
                              onChange={(event) => setTaskEditor((current) => ({ ...current, label: event.target.value }))}
                              className="input-field mt-1 w-full"
                              placeholder="Enter a checklist step"
                            />
                          </label>
                          <Button type="button" size="sm" variant="secondary" onClick={() => setTaskEditor(null)}>Cancel</Button>
                          <Button type="submit" size="sm" disabled={taskSaving || !taskEditor.label.trim()}>
                            <Save size={14} /> {taskSaving ? 'Saving…' : taskEditor.key ? 'Save item' : 'Add item'}
                          </Button>
                        </form>
                      )}
                    </div>
                  )}
                  {phase.tasks.map((task) => (
                    <div key={task.key} className="flex items-start gap-2 rounded-lg border border-outline-variant/70 p-3 text-sm">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                        <input type="checkbox" checked={task.completed} onChange={() => toggleTask(phase, task)} className="mt-0.5 h-4 w-4 accent-primary" />
                        <span className="min-w-0 flex-1">
                          <span className={task.completed ? 'text-surface-on-variant line-through' : ''}>{task.label}</span>
                          {task.completed && task.completedBy && <span className="mt-1 block text-[10px] text-surface-on-variant">Checked by {task.completedBy}{task.completedAt ? ` · ${new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>}
                        </span>
                        {task.completed && <CheckCircle2 size={16} className="shrink-0 text-green-700" />}
                      </label>
                      {canManageChecklist && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => setTaskEditor({ phaseId: phase.id, key: task.key, label: task.label })} className="rounded p-1.5 text-surface-on-variant hover:bg-surface-container-low" title="Edit checklist item" aria-label={`Edit checklist item: ${task.label}`}><Edit3 size={14} /></button>
                          <button type="button" onClick={() => deleteChecklistTask(task)} className="rounded p-1.5 text-error hover:bg-error/10" title="Delete checklist item" aria-label={`Delete checklist item: ${task.label}`}><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}

          {!checklistLoading && !visiblePhases.length && <p className="rounded-lg border border-outline-variant p-4 text-sm text-surface-on-variant">No checklist steps are assigned to this role and shift.</p>}
        </div>
      )}

      {activeTab === 'recovery' && (
        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
          {recoveryScripts.map((item) => (
            <Card key={item.scenario} className="min-w-0 p-4 sm:p-5">
              <div className="mb-3">
                <h2 className="font-display font-bold">{item.scenario}</h2>
                {item.prompt && <p className="mt-1 text-xs text-surface-on-variant">Guest: {item.prompt}</p>}
              </div>
              <blockquote className="rounded-lg border-l-4 border-primary bg-surface-container-low p-3 text-sm leading-6">{item.response}</blockquote>
              <p className="mt-3 text-xs text-surface-on-variant"><strong>Resolve:</strong> {item.action}</p>
              <Button type="button" size="sm" variant="secondary" className="mt-4" onClick={() => copyScript(item.response)}><Copy size={14} /> Copy response</Button>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'menu' && (
        <div className="min-w-0 space-y-4">
          {menuGuide.map((item) => (
            <Card key={item.category} className="min-w-0 p-4 sm:p-5">
              <div className="grid gap-4 lg:grid-cols-[0.8fr_1fr_1.2fr]">
                <div>
                  <p className="text-[10px] font-bold uppercase text-primary">Category</p>
                  <h2 className="mt-1 font-display text-lg font-bold">{item.category}</h2>
                </div>
                <div>
                  <p className="text-xs font-bold">Core items &amp; pricing</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-surface-on-variant">{item.items}</p>
                </div>
                <div>
                  <p className="text-xs font-bold">Customization &amp; upselling</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-surface-on-variant">{item.options}</p>
                  <blockquote className="mt-3 border-l-4 border-primary pl-3 text-sm italic">{item.script}</blockquote>
                </div>
              </div>
            </Card>
          ))}
          <p className="text-[11px] text-surface-on-variant">Use the live POS menu and prices as the source of truth if they differ from this training guide.</p>
        </div>
      )}

      {activeTab === 'handover' && (
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold">
              Date
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-field mt-1 block" />
            </label>
            <div className="flex rounded-lg border border-outline-variant p-1" role="group" aria-label="Shift">
              <button type="button" onClick={() => setShift('morning')} aria-pressed={shift === 'morning'} className={`rounded-md px-3 py-2 text-xs font-bold ${shift === 'morning' ? 'bg-primary text-white' : 'text-surface-on-variant'}`}>Morning</button>
              <button type="button" onClick={() => setShift('evening')} aria-pressed={shift === 'evening'} className={`rounded-md px-3 py-2 text-xs font-bold ${shift === 'evening' ? 'bg-primary text-white' : 'text-surface-on-variant'}`}>Evening</button>
            </div>
            <Button type="button" variant="secondary" className="print:hidden" onClick={() => window.print()}><Printer size={14} /> Print sheet</Button>
          </div>

          {handoverLoading && <p className="py-4 text-sm text-surface-on-variant">Loading shift handover…</p>}

          {handover && (
            <form onSubmit={saveHandover} className="min-w-0 space-y-4">
              <Card className="min-w-0 p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold">Manager out<input value={handover.manager_out || ''} onChange={(event) => setHandover({ ...handover, manager_out: event.target.value, managerOut: event.target.value })} className="input-field mt-1 w-full" /></label>
                  <label className="text-xs font-semibold">Manager in<input value={handover.manager_in || ''} onChange={(event) => setHandover({ ...handover, manager_in: event.target.value, managerIn: event.target.value })} className="input-field mt-1 w-full" /></label>
                </div>
              </Card>

              <Card className="min-w-0 p-4 sm:p-5">
                <h2 className="mb-3 font-display font-bold">Payment reconciliation · TZS</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-outline-variant text-surface-on-variant">
                        <th className="py-2">Payment channel</th>
                        <th className="py-2">Expected POS total</th>
                        <th className="py-2">Actual count</th>
                        <th className="py-2">Variance</th>
                        <th className="py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(handover.reconciliation || {}).map(([key, row]) => {
                        const expected = Number(row.expected) || 0;
                        const actual = Number(row.actual) || 0;
                        return (
                          <tr key={key} className="border-b border-outline-variant/50">
                            <td className="py-2 font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</td>
                            <td className="py-2">{row.expected === '' ? '—' : formatCurrency(expected)}</td>
                            <td className="py-2"><input type="number" min="0" value={row.actual ?? ''} onChange={(event) => updateReconciliation(key, 'actual', event.target.value)} className="input-field w-32" /></td>
                            <td className={`py-2 font-bold ${row.actual === '' ? '' : actual - expected === 0 ? 'text-green-700' : 'text-red-700'}`}>{row.actual === '' ? '—' : formatCurrency(actual - expected)}</td>
                            <td className="py-2 text-surface-on-variant">{row.notes || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="min-w-0 p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="font-display font-bold">Stock count</h2>
                  <Button type="button" variant="secondary" size="sm" onClick={addInventoryCount}><Plus size={14} /> Add item</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-outline-variant text-surface-on-variant">
                        <th className="py-2">Item</th>
                        <th className="py-2">Unit</th>
                        <th className="py-2">Opening</th>
                        <th className="py-2">Added prep</th>
                        <th className="py-2">Closing</th>
                        <th className="py-2">Status / requisition</th>
                        <th className="py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(handover.inventoryCounts || []).map((row, index) => (
                        <tr key={row.clientKey || index} className="border-b border-outline-variant/50">
                          <td className="py-2 font-semibold"><input value={row.item || ''} onChange={(event) => updateInventoryCount(index, 'item', event.target.value)} className="input-field w-full min-w-[180px]" /></td>
                          <td className="py-2"><input value={row.unit || ''} onChange={(event) => updateInventoryCount(index, 'unit', event.target.value)} className="input-field w-20" /></td>
                          {['opening', 'added', 'closing'].map((field) => (
                            <td key={field} className="py-2"><input type="number" min="0" value={row[field] ?? ''} onChange={(event) => updateInventoryCount(index, field, event.target.value)} className="input-field w-24" /></td>
                          ))}
                          <td className="py-2">
                            <select value={row.status || 'ok'} onChange={(event) => updateInventoryCount(index, 'status', event.target.value)} className="input-field">
                              <option value="ok">OK</option>
                              <option value="restock">Needs restock</option>
                              <option value="prep">Needs prep</option>
                            </select>
                          </td>
                          <td className="py-2 text-right"><button type="button" onClick={() => removeInventoryCount(index)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label={`Remove ${row.item || 'stock item'}`}><Trash2 size={14} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="min-w-0 p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display font-bold">Daily stock report</h2>
                    <p className="text-xs text-surface-on-variant">Saved as a separate approval trail for the day.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => saveDailyStockReport({ approve: false })}>Save report</Button>
                    <Button type="button" size="sm" onClick={approveDailyStock}>Approve</Button>
                  </div>
                </div>

                {stockReportError && <p className="mb-3 text-sm text-red-700">{stockReportError}</p>}
                {stockReportLoading ? (
                  <p className="text-sm text-surface-on-variant">Loading stock report…</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-4">
                    {[
                      ['Items counted', stockReport.totalItems ?? 0],
                      ['Opening stock', stockReport.totalOpeningStock ?? 0],
                      ['Closing stock', stockReport.totalClosingStock ?? 0],
                      ['Stock variance', stockReport.stockVariance ?? 0],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{label}</p>
                        <p className="mt-2 text-lg font-bold">{value}</p>
                      </div>
                    ))}

                    <div className="sm:col-span-2 rounded-xl border border-outline-variant bg-surface-container-low p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Financial summary</p>
                      <p className="mt-2 text-sm text-surface-on-variant">Estimated stock value: {Number(stockReport.financialSummary?.totalValue || 0).toLocaleString()} {stockReport.financialSummary?.currency || 'TZS'}</p>
                      <p className="mt-1 text-sm text-surface-on-variant">Low stock count: {stockReport.financialSummary?.lowStockCount ?? 0}</p>
                    </div>

                    <div className="sm:col-span-2 rounded-xl border border-outline-variant bg-surface-container-low p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Approval trail</p>
                      <p className="mt-2 text-sm text-surface-on-variant">Checked by: {stockReport.checkedBy || 'Not yet checked'}</p>
                      <p className="mt-1 text-sm text-surface-on-variant">Approved by: {stockReport.approvedBy || 'Not yet approved'}</p>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="min-w-0 p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2"><PackageCheck size={16} className="text-primary" /><h2 className="font-display font-bold">Financial model</h2></div>
                <div className="grid gap-3 lg:grid-cols-3">
                  {financialModel.map((item) => (
                    <div key={item.title} className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-surface-on-variant">{item.detail}</p>
                      <p className="mt-3 text-xs font-semibold text-surface-on">Effect: {item.effect}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="flex flex-wrap justify-end gap-2 print:hidden">
                <Button type="submit" disabled={saving || handoverLoading}><Save size={14} /> {saving ? 'Saving…' : 'Save handover'}</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
