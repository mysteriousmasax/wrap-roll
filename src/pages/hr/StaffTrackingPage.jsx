import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import { api } from '../../api/client';
import { Users, Clock, AlertTriangle, UserCheck, Trash2, LogIn, LogOut, ClipboardCheck, Edit3, Plus, Save, X } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import useAuthStore from '../../store/useAuthStore';

function toTimeInput(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return '';
  let hour = Number(match[1]);
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

export default function StaffTrackingPage({ embedded = false }) {
  const [tracking, setTracking] = useState({ staff: [], attendance: [], tasks: [] });
  const [loading, setLoading] = useState(true);
  const [taskForm, setTaskForm] = useState({ staffId: '', title: '', dueDate: '' });
  const [attendanceEdits, setAttendanceEdits] = useState({});
  const [checklist, setChecklist] = useState(null);
  const [checklistForm, setChecklistForm] = useState({ phaseId: '', label: '' });
  const [checklistEditor, setChecklistEditor] = useState(null);
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const currentUser = useAuthStore((state) => state.currentUser);

  const load = () => api.getStaffTracking().then(setTracking).catch((requestError) => setError(requestError.message || 'Unable to load staff tracking.')).finally(() => setLoading(false));
  const loadChecklistDefinitions = () => api.getOperationalChecklists(new Date().toLocaleDateString('en-CA'))
    .then(setChecklist)
    .catch((requestError) => setError(requestError.message || 'Unable to load checklist definitions.'));
  useEffect(() => { load(); }, []);
  useEffect(() => { loadChecklistDefinitions(); }, []);
  useWebSocket((event) => {
    if (event === 'staff:updated') load();
  });

  const toggleClock = async (staff) => {
    try {
      setError('');
      const location = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
        );
      });
      await api.clockStaff(staff.id, staff.status === 'on-clock' ? 'out' : 'in', location);
      await load();
    } catch (requestError) {
      setError(requestError.message || 'Unable to update clock status.');
    }
  };

  const addTask = async (event) => {
    event.preventDefault();
    if (!taskForm.staffId || !taskForm.title.trim()) return;
    try {
      setError('');
      await api.createStaffTask(taskForm);
      setTaskForm({ staffId: '', title: '', dueDate: '' });
      await load();
    } catch (requestError) {
      setError(requestError.message || 'Unable to assign task.');
    }
  };

  const completeTask = async (id) => { try { await api.updateStaffTask(id, 'completed'); await load(); } catch (requestError) { setError(requestError.message || 'Unable to complete task.'); } };
  const resolveApprovalTask = async (id, status) => { try { await api.updateStaffTask(id, status); await load(); } catch (requestError) { setError(requestError.message || 'Unable to resolve approval.'); } };
  const saveAttendanceEdit = async (entry) => {
    const edit = attendanceEdits[entry.id] || {};
    const startTime = edit.startTime ?? toTimeInput(entry.login);
    const endTime = edit.endTime ?? toTimeInput(entry.logout);
    try {
      setError('');
      await api.correctStaffAttendance(entry.id, { startTime, endTime });
      setAttendanceEdits((current) => { const next = { ...current }; delete next[entry.id]; return next; });
      setMessage(`Attendance corrected for ${entry.staffName}.`);
      await load();
    } catch (requestError) {
      setError(requestError.message || 'Unable to correct attendance.');
    }
  };
  const saveChecklistItem = async (event) => {
    event.preventDefault();
    const phaseId = checklistForm.phaseId || checklist?.phases?.[0]?.id;
    const label = checklistForm.label.trim();
    if (!phaseId || !label) return;
    setChecklistSaving(true);
    try {
      await api.createOperationalChecklistTask(phaseId, label);
      setChecklistForm({ phaseId, label: '' });
      await loadChecklistDefinitions();
    } catch (requestError) {
      setError(requestError.message || 'Unable to add checklist item.');
    } finally {
      setChecklistSaving(false);
    }
  };
  const saveChecklistLabel = async (event) => {
    event.preventDefault();
    if (!checklistEditor?.label.trim()) return;
    setChecklistSaving(true);
    try {
      await api.updateOperationalChecklistTaskLabel(checklistEditor.key, checklistEditor.label.trim());
      setChecklistEditor(null);
      await loadChecklistDefinitions();
    } catch (requestError) {
      setError(requestError.message || 'Unable to update checklist item.');
    } finally {
      setChecklistSaving(false);
    }
  };
  const removeChecklistItem = async (task) => {
    if (!window.confirm(`Delete checklist item "${task.label}"?`)) return;
    try {
      await api.deleteOperationalChecklistTask(task.key);
      await loadChecklistDefinitions();
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete checklist item.');
    }
  };
  const removeStaff = async (staff) => {
    if (currentUser?.role !== 'admin' || !window.confirm(`Remove ${staff.name} from active staff?`)) return;
    try {
      setError('');
      await api.deleteStaff(staff.id);
      await load();
    } catch (requestError) {
      setError(requestError.message || 'Unable to remove staff member.');
    }
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading staff...</div>;

  const staffMembers = tracking.staff;
  const onClock = staffMembers.filter((s) => s.status === 'on-clock');
  const approvalQueue = tracking.tasks.filter((task) => task.type === 'crm_approval' && !['completed', 'approved', 'rejected'].includes(task.status));

  return (
    <div className={embedded ? '' : 'p-4 sm:p-6'}>
      {!embedded && <PageHeader title="HR Staff Tracking" subtitle="Real-time workforce monitoring and shift management" />}
      {error && <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error" role="alert">{error}</div>}
      {message && <div className="mb-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-semibold text-success" role="status">{message}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Staff" value={staffMembers.length} icon={Users} iconColor="primary" />
        <StatCard title="On Clock" value={onClock.length} icon={UserCheck} iconColor="green" />
        <StatCard title="Off Clock" value={staffMembers.filter((s) => s.status === 'off-clock').length} icon={Clock} />
        <StatCard title="No Show" value={staffMembers.filter((s) => s.status === 'no-show').length} icon={AlertTriangle} iconColor="red" />
      </div>

      {['admin', 'manager', 'executive'].includes(currentUser?.role) && (
        <Card className="mb-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div><h3 className="flex items-center gap-2 font-display text-sm font-bold"><ClipboardCheck size={16} className="text-primary" />Daily checklist definitions</h3><p className="mt-1 text-xs text-surface-on-variant">Add, rename, or remove shared checklist items here. Staff only record completion in My Shift.</p></div>
          </div>
          <form onSubmit={saveChecklistItem} className="mb-4 grid gap-2 sm:grid-cols-[minmax(150px,0.8fr)_1.8fr_auto]">
            <select aria-label="Checklist phase" required value={checklistForm.phaseId || checklist?.phases?.[0]?.id || ''} onChange={(event) => setChecklistForm({ ...checklistForm, phaseId: event.target.value })} className="input-field"><option value="" disabled>Select phase</option>{(checklist?.phases || []).map((phase) => <option key={phase.id} value={phase.id}>{phase.title}</option>)}</select>
            <input aria-label="New checklist item" required maxLength={240} value={checklistForm.label} onChange={(event) => setChecklistForm({ ...checklistForm, label: event.target.value })} placeholder="Add a checklist step" className="input-field" />
            <Button type="submit" size="sm" disabled={checklistSaving || !checklist?.phases?.length}><Plus size={14} />Add item</Button>
          </form>
          <div className="grid gap-3 lg:grid-cols-2">
            {(checklist?.phases || []).map((phase) => <section key={phase.id} className="rounded-lg border border-outline-variant p-3"><h4 className="mb-2 text-xs font-bold">{phase.title}<span className="ml-2 font-normal text-surface-on-variant">{phase.time}</span></h4><div className="space-y-2">{phase.tasks.map((task) => checklistEditor?.key === task.key ? (
              <form key={task.key} onSubmit={saveChecklistLabel} className="flex items-center gap-2"><input autoFocus required maxLength={240} aria-label="Edit checklist item" value={checklistEditor.label} onChange={(event) => setChecklistEditor({ ...checklistEditor, label: event.target.value })} className="input-field min-w-0 flex-1" /><Button type="submit" size="sm" disabled={checklistSaving} aria-label="Save checklist item"><Save size={14} /></Button><Button type="button" size="sm" variant="secondary" onClick={() => setChecklistEditor(null)} aria-label="Cancel edit"><X size={14} /></Button></form>
            ) : <div key={task.key} className="flex items-start justify-between gap-2 rounded-md bg-surface-container-low px-2 py-1.5 text-xs"><span className="min-w-0 flex-1">{task.label}</span><div className="flex shrink-0 items-center"><button type="button" onClick={() => setChecklistEditor({ key: task.key, label: task.label })} className="rounded p-1 text-surface-on-variant hover:bg-white" aria-label={`Edit ${task.label}`}><Edit3 size={13} /></button><button type="button" onClick={() => removeChecklistItem(task)} className="rounded p-1 text-error hover:bg-white" aria-label={`Delete ${task.label}`}><Trash2 size={13} /></button></div></div>)}</div></section>)}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-display font-bold text-sm mb-4">Shift Timeline - Today</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {staffMembers.map((staff) => (
            <div key={staff.id} className="rounded-xl border border-outline-variant/60 p-3 hover:bg-surface-container-low">
              <div className="flex items-start gap-3">
              <div className={'w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ' +
                (staff.status === 'on-clock' ? 'bg-success/10 text-success ring-2 ring-success/30' : 'bg-surface-container text-surface-on-variant')}>
                {staff.avatar}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm">{staff.name}</p>
                <p className="text-xs text-surface-on-variant">{staff.role}</p>
              </div>
              <StatusBadge status={staff.status} />
              </div>
              <div className="mt-3 flex items-center gap-2">
              <div className="flex-1">
                <div className="bg-surface-container-low rounded-full h-3 overflow-hidden">
                  <div className={'h-full rounded-full ' + (staff.status === 'on-clock' ? 'bg-success' : staff.status === 'no-show' ? 'bg-error' : 'bg-outline-variant')}
                    style={{ width: staff.status === 'on-clock' ? '65%' : staff.attendance?.hours ? `${Math.min(100, (staff.attendance.hours / 8) * 100)}%` : '0%' }} />
                </div>
              </div>
              <p className="text-xs text-surface-on-variant">{staff.attendance?.login || staff.clockIn || '-'}{staff.attendance?.logout ? ` - ${staff.attendance.logout}` : ''}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-outline-variant/40 pt-3 text-center">
                <div><p className="text-sm font-bold">{staff.activity.orders}</p><p className="text-[10px] text-surface-on-variant">Orders</p></div>
                <div><p className="text-sm font-bold">{staff.activity.openTasks}</p><p className="text-[10px] text-surface-on-variant">Open tasks</p></div>
              </div>
              <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => toggleClock(staff)}>
                {staff.status === 'on-clock' ? <LogOut size={14} /> : <LogIn size={14} />}
                {staff.status === 'on-clock' ? 'Clock Out' : 'Clock In'}
              </Button>
              {currentUser?.role === 'admin' && <Button variant="ghost" size="sm" onClick={() => removeStaff(staff)} aria-label={`Remove ${staff.name}`}><Trash2 size={14} /></Button>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <div><h3 className="font-display font-bold text-sm">Attendance log</h3><p className="mt-1 text-xs text-surface-on-variant">Clock-in and clock-out events from the API.</p></div>
          <Clock size={18} className="text-primary" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="border-b border-outline-variant text-[10px] uppercase tracking-wide text-surface-on-variant"><tr><th className="p-2">Staff</th><th className="p-2">Date / shift</th><th className="p-2">Clock in</th><th className="p-2">Clock out</th><th className="p-2">Hours</th><th className="p-2">Timing</th><th className="p-2">Correction</th></tr></thead>
            <tbody>{tracking.attendance.map((entry) => {
              const edit = attendanceEdits[entry.id] || {};
              return <tr key={entry.id} className="border-b border-outline-variant/40">
                <td className="p-2 font-semibold">{entry.staffName}</td>
                <td className="p-2">{entry.date}<span className="block capitalize text-[10px] text-surface-on-variant">{entry.assignedShift || 'Shift'}</span></td>
                <td className="p-2"><label className="sr-only">{entry.staffName} clock in</label><input type="time" disabled={!['admin', 'manager'].includes(currentUser?.role)} value={edit.startTime ?? toTimeInput(entry.login)} onChange={(event) => setAttendanceEdits((current) => ({ ...current, [entry.id]: { ...current[entry.id], startTime: event.target.value } }))} className="input-field w-28" /></td>
                <td className="p-2"><label className="sr-only">{entry.staffName} clock out</label><input type="time" disabled={!['admin', 'manager'].includes(currentUser?.role) || entry.status === 'active'} value={edit.endTime ?? toTimeInput(entry.logout)} onChange={(event) => setAttendanceEdits((current) => ({ ...current, [entry.id]: { ...current[entry.id], endTime: event.target.value } }))} className="input-field w-28" /></td>
                <td className="p-2">{entry.hours ? Number(entry.hours).toFixed(2) : '-'}</td>
                <td className="p-2 text-[10px]">{entry.lateMinutes ? <span className="block text-error">Late {entry.lateMinutes}m</span> : 'On time'}{entry.overtimeMinutes > 0 && <span className="block text-primary">OT {entry.overtimeMinutes}m</span>}<span className="block text-surface-on-variant">Plan {entry.scheduledStart || '-'}–{entry.scheduledEnd || '-'}</span></td>
                <td className="p-2">{['admin', 'manager'].includes(currentUser?.role) && <Button size="sm" variant="secondary" disabled={entry.status === 'active' || !(edit.endTime ?? toTimeInput(entry.logout))} onClick={() => saveAttendanceEdit(entry)}><Save size={13} />Save</Button>}</td>
              </tr>;
            })}</tbody>
          </table>
          {!tracking.attendance.length && <p className="py-6 text-center text-sm text-surface-on-variant">No attendance events recorded yet.</p>}
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 font-display text-sm font-bold">CRM approval queue</h3>
          <div className="space-y-2">
            {approvalQueue.length ? approvalQueue.map((task) => (
              <div key={task.id} className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-surface-on">{task.title}</p>
                    <p className="mt-1 text-surface-on-variant">{task.staffName} · {task.dueDate || 'No due date'}</p>
                  </div>
                  <span className="rounded-full bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">Pending</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => resolveApprovalTask(task.id, 'approved')}>Approve</Button>
                  <Button variant="secondary" size="sm" onClick={() => resolveApprovalTask(task.id, 'rejected')}>Reject</Button>
                </div>
              </div>
            )) : <p className="text-sm text-surface-on-variant">No CRM campaign actions awaiting approval.</p>}
          </div>
        </Card>
        <Card>
          <h3 className="mb-4 font-display text-sm font-bold">Assigned staff tasks</h3>
          <form onSubmit={addTask} className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.5fr_auto]"><select required value={taskForm.staffId} onChange={(e) => setTaskForm({ ...taskForm, staffId: e.target.value })} className="rounded-lg border border-outline-variant p-2 text-xs"><option value="">Assign staff</option>{staffMembers.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select><input required value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Task title" className="rounded-lg border border-outline-variant p-2 text-xs" /><Button type="submit" size="sm">Assign</Button></form>
          <div className="space-y-2">{tracking.tasks.filter((task) => task.type !== 'crm_approval').map((task) => <div key={task.id} className="flex items-center justify-between rounded-lg border border-outline-variant/50 px-3 py-2 text-xs"><div><p className="font-semibold">{task.title}</p><p className="text-surface-on-variant">{task.staffName} · {task.dueDate || 'No due date'}</p></div><Button variant="ghost" size="sm" onClick={() => completeTask(task.id)}>Complete</Button></div>)}{!tracking.tasks.filter((task) => task.type !== 'crm_approval').length && <p className="text-sm text-surface-on-variant">No open tasks assigned.</p>}</div>
        </Card>
      </div>
    </div>
  );
}
