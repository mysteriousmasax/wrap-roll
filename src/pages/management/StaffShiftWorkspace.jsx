import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDollarSign, ClipboardCheck, Clock3, LogIn, LogOut, PackageCheck, Save, ShieldAlert } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { api } from '../../api/client';
import useAuthStore from '../../store/useAuthStore';
import { useWebSocket } from '../../hooks/useWebSocket';

const rolePhases = {
  admin: ['morning-kitchen', 'foh-digital', 'lunch-rush', 'midday-handover', 'evening-close'],
  executive: ['morning-kitchen', 'foh-digital', 'lunch-rush', 'midday-handover', 'evening-close'],
  manager: ['morning-kitchen', 'foh-digital', 'lunch-rush', 'midday-handover', 'evening-close'],
  foh: ['foh-digital', 'lunch-rush', 'midday-handover', 'evening-close'],
  kitchen: ['morning-kitchen', 'lunch-rush', 'midday-handover', 'evening-close'],
};

const phasesByShift = {
  morning: ['morning-kitchen', 'foh-digital', 'lunch-rush', 'midday-handover'],
  evening: ['lunch-rush', 'midday-handover', 'evening-close'],
};

const today = () => new Date().toLocaleDateString('en-CA');
const inventoryName = (item) => String(item?.name || '').trim().toLowerCase();
const normalizeShift = (value, fallback = 'morning') => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.includes('evening') ? 'evening' : normalized.includes('morning') ? 'morning' : fallback;
};

function withInventoryLinks(handover, items, date, shift) {
  return {
    ...handover,
    inventoryCounts: (handover.inventoryCounts || []).map((row, index) => {
      const match = items.find((item) => inventoryName(item) === String(row.item || '').trim().toLowerCase());
      return {
        ...row,
        inventoryId: row.inventoryId || match?.id || '',
        unit: match?.unit || row.unit || 'units',
        opening: row.opening === '' || row.opening == null ? (match ? String(match.quantity ?? '') : '') : String(row.opening),
        clientKey: `${date}-${shift}-${index}`,
      };
    }),
  };
}

function displayMinutes(value) {
  const minutes = Number(value || 0);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function StaffShiftWorkspace() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const role = currentUser?.role || 'foh';
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState('morning');
  const [workspace, setWorkspace] = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryReady, setInventoryReady] = useState(false);
  const [handover, setHandover] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getMyShiftWorkspace(), api.getInventory()])
      .then(([nextWorkspace, items]) => {
        if (cancelled) return;
        setWorkspace(nextWorkspace);
        setDate(nextWorkspace.date || today());
        setShift(normalizeShift(nextWorkspace.active?.notes, normalizeShift(nextWorkspace.shift?.label)));
        setInventoryItems(items || []);
        setInventoryReady(true);
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || 'Unable to load your shift workspace.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!date || !inventoryReady) return undefined;
    let cancelled = false;
    api.getShiftHandover(date, shift)
      .then((result) => { if (!cancelled) setHandover(withInventoryLinks(result, inventoryItems, date, shift)); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || 'Unable to load payment and stock counts.'); });
    return () => { cancelled = true; };
  }, [date, shift, inventoryReady, inventoryItems]);

  useEffect(() => {
    if (!date) return undefined;
    let cancelled = false;
    api.getOperationalChecklists(date)
      .then((result) => { if (!cancelled) setChecklist(result); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || 'Unable to load your daily checklist.'); });
    return () => { cancelled = true; };
  }, [date]);

  useWebSocket((event) => {
    if (event === 'staff:updated') {
      api.getMyShiftWorkspace().then(setWorkspace).catch(() => {});
    }
    if (['order:created', 'order:updated', 'payment:confirmed', 'inventory:updated'].includes(event)) {
      api.getShiftHandover(date, shift).then((result) => setHandover(withInventoryLinks(result, inventoryItems, date, shift))).catch(() => {});
    }
  });

  const refreshWorkspace = async () => {
    const result = await api.getMyShiftWorkspace();
    setWorkspace(result);
    return result;
  };

  const clock = async () => {
    setWorking(true);
    setError('');
    setMessage('');
    let location = null;
    if (!workspace?.active && navigator.geolocation) {
      location = await new Promise((resolve) => navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 300000 }
      ));
    }
    try {
      const result = await api.clockMyShift(workspace?.active ? 'out' : 'in', location, shift);
      setWorkspace(result);
      const event = result.clockEvent;
      setMessage(event?.action === 'clock_in'
        ? event.lateMinutes ? `Clocked in ${event.lateMinutes} minutes late.` : 'Clocked in. Your shift has started.'
        : event?.overtimeMinutes ? `Clocked out. ${event.overtimeMinutes} minutes of overtime recorded.` : 'Clocked out. Shift complete.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to update your clock.');
    } finally {
      setWorking(false);
    }
  };

  const updateTask = async (task, status) => {
    try {
      await api.updateMyStaffTask(task.id, status);
      await refreshWorkspace();
    } catch (requestError) {
      setError(requestError.message || 'Unable to update this task.');
    }
  };

  const toggleChecklistTask = async (phase, task) => {
    setChecklist((current) => ({
      ...current,
      phases: current.phases.map((group) => group.id !== phase.id ? group : ({
        ...group,
        tasks: group.tasks.map((item) => item.key === task.key ? { ...item, completed: !task.completed } : item),
      })),
    }));
    try {
      await api.updateOperationalChecklistTask(date, phase.id, task.key, !task.completed);
    } catch (requestError) {
      setError(requestError.message || 'Unable to save checklist progress.');
      api.getOperationalChecklists(date).then(setChecklist).catch(() => {});
    }
  };

  const updateReconciliation = (key, field, value) => setHandover((current) => ({
    ...current,
    reconciliation: {
      ...current.reconciliation,
      [key]: { ...current.reconciliation[key], [field]: value, ...(field === 'expected' ? { expectedSource: 'manual' } : {}) },
    },
  }));

  const updateInventoryCount = (index, field, value) => setHandover((current) => ({
    ...current,
    inventoryCounts: current.inventoryCounts.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row),
  }));

  const saveHandover = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const inventoryCounts = (handover.inventoryCounts || []).map(({ clientKey, ...row }) => row);
      const saved = await api.saveShiftHandover({ ...handover, date, shift, inventoryCounts });
      setHandover((current) => ({ ...current, ...saved, inventoryCounts: current.inventoryCounts }));
      setMessage('Payment reconciliation and stock count saved.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to save shift reconciliation.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading your shift...</div>;
  if (!workspace) return <div className="p-4 sm:p-6"><PageHeader title="My Shift" subtitle="Your attendance, tasks, and shift close" />{error && <p role="alert" className="rounded-lg bg-error/10 p-3 text-sm text-error">{error}</p>}</div>;

  const allowedPhases = rolePhases[role] || rolePhases.foh;
  const visiblePhases = (checklist?.phases || []).filter((phase) => allowedPhases.includes(phase.id) && (phasesByShift[shift] || phasesByShift.morning).includes(phase.id));
  const checklistTasks = visiblePhases.flatMap((phase) => phase.tasks);
  const completedTasks = checklistTasks.filter((task) => task.completed).length;
  const reconciliationRows = Object.entries(handover?.reconciliation || {});
  const shortfalls = reconciliationRows.filter(([key, row]) => key !== 'cashFloat' && row.actual !== '' && Number(row.actual) < Number(row.expected || 0));
  const expectedTotal = reconciliationRows.filter(([key]) => key !== 'cashFloat').reduce((sum, [, row]) => sum + (Number(row.expected) || 0), 0);
  const actualTotal = reconciliationRows.filter(([key, row]) => key !== 'cashFloat' && row.actual !== '').reduce((sum, [, row]) => sum + (Number(row.actual) || 0), 0);
  const schedule = workspace.active
    ? { start: workspace.active.scheduled_start_time, end: workspace.active.scheduled_end_time }
    : shift === 'evening'
      ? { start: workspace.staff.eveningStartTime, end: workspace.staff.eveningEndTime }
      : { start: workspace.staff.morningStartTime, end: workspace.staff.morningEndTime };
  const canClockToday = date === workspace.date;

  return (
    <main className="min-w-0 space-y-4 p-3 sm:p-6">
      <PageHeader mobileStack title="My Shift" subtitle={`${workspace.staff.name} · ${workspace.staff.role} · Your daily operations and attendance`} />
      {error && <div role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-semibold text-success">{message}</div>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-xs font-semibold">Business date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-field mt-1 block" /></label>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-surface-on-variant">Shift</span>
          <div className="flex rounded-lg border border-outline-variant p-1" role="group" aria-label="Select shift">
            {['morning', 'evening'].map((option) => <button key={option} type="button" onClick={() => setShift(option)} aria-pressed={shift === option} className={`rounded-md px-3 py-2 text-xs font-bold capitalize ${shift === option ? 'bg-primary text-white' : 'text-surface-on-variant'}`}>{option}</button>)}
          </div>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_2fr]" aria-label="Shift attendance and timing analytics">
        <Card className="border-l-4 border-l-primary p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">{workspace.active ? 'Shift in progress' : 'Shift status'}</p><h2 className="mt-1 font-display text-lg font-bold">{workspace.active ? 'You are clocked in' : 'Ready to clock in'}</h2><p className="mt-1 text-xs text-surface-on-variant">{schedule.start || 'Schedule not set'}{schedule.end ? ` to ${schedule.end}` : ''}</p></div>
            <Clock3 size={22} className={workspace.active ? 'text-success' : 'text-surface-on-variant'} />
          </div>
          {workspace.active?.late_minutes > 0 && <p className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-900"><AlertTriangle size={14} />{workspace.active.late_minutes} minutes late at clock-in</p>}
          <Button type="button" disabled={working || !canClockToday} onClick={clock} className="mt-4 w-full">{workspace.active ? <LogOut size={15} /> : <LogIn size={15} />}{!canClockToday ? 'Clock actions are for today' : working ? 'Recording...' : workspace.active ? 'Clock out' : `Clock in · ${shift}`}</Button>
          <p className="mt-2 text-[10px] text-surface-on-variant">Clock times use the restaurant timezone. Late arrival and overtime compare against the schedule set by your manager.</p>
        </Card>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            ['Hours worked · 30 days', `${workspace.metrics.hours}h`],
            ['On-time shifts', workspace.metrics.punctuality == null ? '—' : `${workspace.metrics.punctuality}%`],
            ['Late arrivals', `${workspace.metrics.lateShifts} · ${workspace.metrics.lateMinutes}m`],
            ['Overtime recorded', displayMinutes(workspace.metrics.overtimeMinutes)],
          ].map(([label, value]) => <Card key={label} className="p-3 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-surface-on-variant">{label}</p><p className="mt-2 font-display text-xl font-bold">{value}</p><p className="mt-1 text-[10px] text-surface-on-variant">Last 30 days · {workspace.metrics.shifts} closed shifts</p></Card>)}
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">My assignments</p><h2 className="mt-1 font-display font-bold">Tasks from team Kanban</h2></div><span className="rounded-full bg-surface-container-low px-2 py-1 text-xs font-bold">{workspace.tasks.length}</span></div>
          <div className="space-y-2">{workspace.tasks.length ? workspace.tasks.map((task) => (
            <article key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant p-3">
              <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{task.title}</h3><p className="mt-1 text-xs text-surface-on-variant">{task.category || task.task_type || 'Task'} · {task.due_date || 'No due date'}{task.priority ? ` · ${task.priority}` : ''}</p>{task.description && <p className="mt-1 text-xs text-surface-on-variant">{task.description}</p>}</div>
              <select aria-label={`Update task ${task.title}`} value={task.status} onChange={(event) => updateTask(task, event.target.value)} className="input-field w-auto min-w-32 text-xs"><option value="open">To do</option>{task.task_type === 'kanban' && <><option value="in_progress">In progress</option><option value="blocked">Blocked</option></>}<option value="completed">Done</option></select>
            </article>
          )) : <p className="rounded-lg bg-surface-container-low p-4 text-sm text-surface-on-variant">No open tasks assigned to you.</p>}</div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Daily operating rhythm</p><h2 className="mt-1 font-display font-bold">My shift checklist</h2><p className="mt-1 text-xs text-surface-on-variant">{completedTasks} of {checklistTasks.length} steps complete</p></div><ClipboardCheck size={18} className="text-primary" /></div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-label="Shift checklist progress" aria-valuemin={0} aria-valuemax={checklistTasks.length} aria-valuenow={completedTasks}><div className="h-full bg-primary" style={{ width: `${checklistTasks.length ? completedTasks / checklistTasks.length * 100 : 0}%` }} /></div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto">{visiblePhases.map((phase) => <section key={phase.id}><h3 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-surface-on-variant">{phase.title} · {phase.time}</h3><div className="space-y-1">{phase.tasks.map((task) => <label key={task.key} className="flex cursor-pointer items-start gap-2 rounded-md border border-outline-variant/60 p-2 text-xs"><input type="checkbox" checked={task.completed} onChange={() => toggleChecklistTask(phase, task)} className="mt-0.5 accent-primary" /><span className={task.completed ? 'text-surface-on-variant line-through' : ''}>{task.label}</span>{task.completed && <CheckCircle2 size={14} className="ml-auto shrink-0 text-success" />}</label>)}</div></section>)}{!visiblePhases.length && <p className="text-sm text-surface-on-variant">No checklist steps are assigned to this shift.</p>}</div>
        </Card>
      </section>

      <form onSubmit={saveHandover} className="space-y-4">
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Till close · TZS</p><h2 className="mt-1 font-display font-bold">Payment reconciliation</h2><p className="mt-1 text-xs text-surface-on-variant">Expected amounts pull from paid POS transactions for staff assigned to this shift. Cash float is counted separately.</p></div><CircleDollarSign size={20} className="text-primary" /></div>
          {shortfalls.length > 0 && <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"><ShieldAlert size={15} className="mt-0.5 shrink-0" /><span>{shortfalls.map(([key]) => key.replace(/([A-Z])/g, ' $1')).join(', ')} is below the expected POS total. Recount the till and add a handover note.</span></div>}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><div className="rounded-lg bg-surface-container-low p-3"><p className="text-[10px] font-bold uppercase text-surface-on-variant">Expected takings</p><p className="mt-1 text-sm font-bold">{expectedTotal.toLocaleString()} TZS</p></div><div className="rounded-lg bg-surface-container-low p-3"><p className="text-[10px] font-bold uppercase text-surface-on-variant">Counted</p><p className="mt-1 text-sm font-bold">{actualTotal.toLocaleString()} TZS</p></div><div className="col-span-2 rounded-lg bg-surface-container-low p-3 sm:col-span-1"><p className="text-[10px] font-bold uppercase text-surface-on-variant">Variance</p><p className={`mt-1 text-sm font-bold ${actualTotal >= expectedTotal ? 'text-success' : 'text-error'}`}>{(actualTotal - expectedTotal).toLocaleString()} TZS</p></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead><tr className="border-b border-outline-variant text-surface-on-variant"><th className="py-2">Payment channel</th><th className="py-2">Expected POS total</th><th className="py-2">Actual count</th><th className="py-2">Variance</th><th className="py-2">Notes</th></tr></thead><tbody>{reconciliationRows.map(([key, row]) => {
            const expected = Number(row.expected) || 0;
            const actual = Number(row.actual) || 0;
            return <tr key={key} className="border-b border-outline-variant/50"><td className="py-2 font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</td><td className="py-2"><input aria-label={`Expected POS total for ${key}`} type="number" min="0" step="1" value={row.expected ?? ''} onChange={(event) => updateReconciliation(key, 'expected', event.target.value)} className="input-field w-36" /></td><td className="py-2"><input aria-label={`Actual count for ${key}`} type="number" min="0" step="1" value={row.actual ?? ''} onChange={(event) => updateReconciliation(key, 'actual', event.target.value)} className="input-field w-32" /></td><td className={`py-2 font-bold ${row.actual === '' ? '' : actual - expected === 0 ? 'text-success' : 'text-error'}`}>{row.actual === '' ? '—' : `${(actual - expected).toLocaleString()} TZS`}</td><td className="py-2"><input aria-label={`Notes for ${key}`} value={row.notes || ''} onChange={(event) => updateReconciliation(key, 'notes', event.target.value)} className="input-field min-w-24" /></td></tr>;
          })}</tbody></table></div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Inventory close</p><h2 className="mt-1 font-display font-bold">Stock count</h2><p className="mt-1 text-xs text-surface-on-variant">Opening balances begin at live inventory. Enter closing counts to reconcile inventory.</p></div><PackageCheck size={20} className="text-primary" /></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead><tr className="border-b border-outline-variant text-surface-on-variant"><th className="py-2">Item</th><th className="py-2">Unit</th><th className="py-2">Opening</th><th className="py-2">Added prep</th><th className="py-2">Closing</th><th className="py-2">Status</th></tr></thead><tbody>{(handover?.inventoryCounts || []).map((row, index) => <tr key={row.clientKey || index} className="border-b border-outline-variant/50"><td className="py-2 font-semibold">{row.item || 'Stock item'}</td><td className="py-2">{row.unit || 'units'}</td>{['opening', 'added', 'closing'].map((field) => <td key={field} className="py-2"><input aria-label={`${field} ${row.item || 'stock item'}`} type="number" min="0" step="any" value={row[field] ?? ''} onChange={(event) => updateInventoryCount(index, field, event.target.value)} className="input-field w-24" /></td>)}<td className="py-2"><select aria-label={`Status for ${row.item || 'stock item'}`} value={row.status || 'ok'} onChange={(event) => updateInventoryCount(index, 'status', event.target.value)} className="input-field"><option value="ok">OK</option><option value="restock">Needs restock</option><option value="prep">Needs prep</option></select></td></tr>)}</tbody></table></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-[11px] text-surface-on-variant"><ShieldAlert size={14} />Any closing count updates live inventory and creates an audit record.</p><Button type="submit" disabled={saving || !handover}><Save size={14} />{saving ? 'Saving...' : 'Save shift close'}</Button></div>
        </Card>
      </form>

      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2"><Clock3 size={17} className="text-primary" /><div><h2 className="font-display font-bold">Recent attendance</h2><p className="text-xs text-surface-on-variant">Schedule adherence from your last 30 days.</p></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead><tr className="border-b border-outline-variant text-surface-on-variant"><th className="py-2">Date</th><th className="py-2">Shift</th><th className="py-2">Clock in</th><th className="py-2">Clock out</th><th className="py-2">Late</th><th className="py-2">Overtime</th></tr></thead><tbody>{workspace.history.slice(0, 10).map((entry) => <tr key={entry.id} className="border-b border-outline-variant/50"><td className="py-2">{entry.shift_date}</td><td className="py-2 capitalize">{entry.notes || '-'}</td><td className="py-2">{entry.start_time || '-'}</td><td className="py-2">{entry.end_time || 'In progress'}</td><td className="py-2">{entry.late_minutes ? `${entry.late_minutes} min` : 'On time'}</td><td className="py-2">{entry.overtime_minutes ? `${entry.overtime_minutes} min` : '-'}</td></tr>)}</tbody></table>{!workspace.history.length && <p className="py-4 text-sm text-surface-on-variant">No recent clock records.</p>}</div>
      </Card>
    </main>
  );
}