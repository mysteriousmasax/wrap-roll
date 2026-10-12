import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, CircleAlert, Clock3, Filter, Flag, Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';
import useAuthStore from '../../store/useAuthStore';

const columns = [
  { id: 'open', label: 'Backlog', tone: 'border-outline-variant', dot: 'bg-slate-400' },
  { id: 'in_progress', label: 'In progress', tone: 'border-warning', dot: 'bg-warning' },
  { id: 'blocked', label: 'Blocked', tone: 'border-error', dot: 'bg-error' },
  { id: 'completed', label: 'Done', tone: 'border-success', dot: 'bg-success' },
];
const priorities = ['low', 'medium', 'high', 'urgent'];
const categories = ['Marketing', 'Follow-up', 'Operations', 'Finance', 'People', 'Inventory', 'Customer care', 'General'];

function priorityClass(priority) {
  return priority === 'urgent' ? 'bg-red-100 text-red-800' : priority === 'high' ? 'bg-orange-100 text-orange-800' : priority === 'low' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800';
}

export default function KanbanPage() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ staffId: '', title: '', description: '', category: 'Marketing', priority: 'medium', dueDate: '' });
  const [selectedTask, setSelectedTask] = useState(null);
  const [detailsForm, setDetailsForm] = useState(null);
  const [savingDetails, setSavingDetails] = useState(false);

  const load = async () => {
    try {
      const [nextTasks, nextStaff] = await Promise.all([api.getKanbanTasks(), api.getStaff()]);
      setTasks(nextTasks || []);
      setStaff(nextStaff || []);
    } catch (error) { setMessage(error.message || 'Unable to load the Kanban board.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useWebSocket((event) => { if (event === 'staff:updated') load(); });

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const text = `${task.title} ${task.description} ${task.staffName} ${task.category}`.toLowerCase();
    return text.includes(search.toLowerCase())
      && (categoryFilter === 'all' || task.category === categoryFilter)
      && (priorityFilter === 'all' || task.priority === priorityFilter)
      && (statusFilter === 'all' || task.status === statusFilter);
  }), [tasks, search, categoryFilter, priorityFilter, statusFilter]);

  const openTaskDetails = (task) => {
    setSelectedTask(task);
    setDetailsForm({ title: task.title, description: task.description || '', category: task.category || 'General', priority: task.priority || 'medium', dueDate: task.dueDate || '' });
  };

  const saveTaskDetails = async (event) => {
    event.preventDefault();
    if (!selectedTask || !detailsForm) return;
    setSavingDetails(true);
    setMessage('');
    try {
      await api.updateKanbanTask(selectedTask.id, detailsForm);
      setSelectedTask(null);
      setDetailsForm(null);
      setMessage('Task details saved.');
      await load();
    } catch (error) { setMessage(error.message || 'Unable to save task details.'); }
    finally { setSavingDetails(false); }
  };

  const updateStatus = async (task, status) => {
    try { await api.updateKanbanTask(task.id, { status }); await load(); }
    catch (error) { setMessage(error.message || 'Unable to update task.'); }
  };

  const createTask = async (event) => {
    event.preventDefault();
    try { await api.createKanbanTask(form); setForm({ staffId: '', title: '', description: '', category: 'Marketing', priority: 'medium', dueDate: '' }); setShowForm(false); await load(); }
    catch (error) { setMessage(error.message || 'Unable to create task.'); }
  };

  const removeTask = async (task) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    try { await api.deleteKanbanTask(task.id); if (selectedTask?.id === task.id) setSelectedTask(null); await load(); } catch (error) { setMessage(error.message || 'Unable to delete task.'); }
  };

  const today = new Date().toLocaleDateString('en-CA');
  const openTasks = tasks.filter((task) => task.status !== 'completed');
  const overdueTasks = openTasks.filter((task) => task.dueDate && task.dueDate < today);
  const dueTodayTasks = openTasks.filter((task) => task.dueDate === today);
  const urgentTasks = openTasks.filter((task) => task.priority === 'urgent');

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading Kanban board...</div>;

  return <div className="kanban-page p-4 sm:p-6">
    <PageHeader title="Team Kanban" subtitle="Coordinate marketing, follow-ups, operations, and executive work in one live board" actions={<Button onClick={() => setShowForm((open) => !open)}><Plus size={15} /> New task</Button>} />
    {message && <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">{message}</div>}

    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {columns.map((column) => <div key={column.id} className={`rounded-xl border-l-4 ${column.tone} bg-white p-3 shadow-sm`}><p className="text-[10px] font-bold uppercase tracking-wider text-surface-on-variant">{column.label}</p><p className="mt-1 text-2xl font-bold">{tasks.filter((task) => task.status === column.id).length}</p></div>)}
    </div>

    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className={`flex items-center gap-3 rounded-lg border p-3 ${overdueTasks.length ? 'border-error/30 bg-error/5' : 'border-outline-variant bg-white'}`}><CircleAlert size={17} className={overdueTasks.length ? 'text-error' : 'text-surface-on-variant'} /><div><p className="text-[10px] font-bold uppercase text-surface-on-variant">Overdue</p><p className="text-lg font-bold">{overdueTasks.length} tasks</p></div></div>
      <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-white p-3"><CalendarDays size={17} className="text-primary" /><div><p className="text-[10px] font-bold uppercase text-surface-on-variant">Due today</p><p className="text-lg font-bold">{dueTodayTasks.length} tasks</p></div></div>
      <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-white p-3"><Flag size={17} className={urgentTasks.length ? 'text-error' : 'text-surface-on-variant'} /><div><p className="text-[10px] font-bold uppercase text-surface-on-variant">Urgent in progress</p><p className="text-lg font-bold">{urgentTasks.length} tasks</p></div></div>
    </div>

    {showForm && <Card className="mb-5 border-primary/30"><form onSubmit={createTask} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs font-semibold md:col-span-2">Task title<input required autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Follow up with Google review campaign" className="input-field mt-1" /></label>
      <label className="text-xs font-semibold">Assign to<select required value={form.staffId} onChange={(event) => setForm({ ...form, staffId: event.target.value })} className="input-field mt-1"><option value="">Select teammate</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label>
      <label className="text-xs font-semibold">Due date<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="input-field mt-1" /></label>
      <label className="text-xs font-semibold">Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="input-field mt-1">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-xs font-semibold">Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="input-field mt-1">{priorities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="text-xs font-semibold md:col-span-2 xl:col-span-4">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows="2" className="input-field mt-1" placeholder="Context, expected result, links, or handoff notes" /></label>
      <div className="flex justify-end gap-2 md:col-span-2 xl:col-span-4"><Button type="button" variant="secondary" onClick={() => setShowForm(false)}><X size={14} /> Cancel</Button><Button type="submit"><Check size={14} /> Create task</Button></div>
    </form></Card>}

    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-outline-variant bg-white p-3 shadow-sm lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, teammates, or descriptions..." className="input-field pl-9" /></div><div className="flex flex-wrap items-center gap-2"><Filter size={15} className="text-surface-on-variant" /><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-field w-auto"><option value="all">All statuses</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select><select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="input-field w-auto"><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="input-field w-auto"><option value="all">All priorities</option>{priorities.map((item) => <option key={item}>{item}</option>)}</select></div></div>

    <div className="kanban-board grid min-w-0 grid-cols-1 gap-3 overflow-x-auto md:grid-cols-2 xl:grid-cols-4">
      {columns.map((column) => <section key={column.id} className="kanban-column min-w-0 rounded-2xl border border-outline-variant bg-surface-container-low p-3"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold"><span className={`h-2.5 w-2.5 rounded-full ${column.dot}`} />{column.label}</h2><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-surface-on-variant">{visibleTasks.filter((task) => task.status === column.id).length}</span></div><div className="space-y-3">{visibleTasks.filter((task) => task.status === column.id).map((task) => <article key={task.id} className="kanban-card rounded-xl border border-outline-variant bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${priorityClass(task.priority)}`}>{task.priority}</span><button type="button" onClick={() => removeTask(task)} aria-label={`Delete ${task.title}`} className="text-outline hover:text-error"><Trash2 size={14} /></button></div><h3 className="mt-2 text-sm font-bold">{task.title}</h3>{task.description && <p className="mt-1 text-xs leading-5 text-surface-on-variant">{task.description}</p>}<div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold"><span className="rounded bg-primary/10 px-2 py-1 text-primary">{task.category}</span><span className="rounded bg-surface-container-low px-2 py-1">{task.staffName}</span></div><div className="mt-3 flex items-center justify-between gap-2 border-t border-outline-variant pt-2 text-[10px] text-surface-on-variant"><span className="flex items-center gap-1"><CalendarDays size={12} />{task.dueDate || 'No due date'}</span>{task.status !== 'completed' && <span className="flex items-center gap-1"><Clock3 size={12} />Live</span>}</div><div className="mt-3 flex flex-wrap gap-1.5">{columns.filter((item) => item.id !== task.status).map((item) => <button key={item.id} type="button" onClick={() => updateStatus(task, item.id)} className="rounded-lg border border-outline-variant px-2 py-1 text-[10px] font-bold hover:bg-surface-container-low">Move to {item.label}</button>)}</div></article>)}</div></section>)}
    </div>
    <Card className="mt-5 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-4 py-3 sm:px-5">
        <div><h2 className="font-display text-sm font-bold">Task register</h2><p className="mt-1 text-[11px] text-surface-on-variant">Ownership, deadline risk, priority, and update history for filtered tasks.</p></div>
        <span className="rounded-md bg-surface-container-low px-2 py-1 text-[10px] font-bold">{visibleTasks.length} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-outline-variant bg-surface-container-low text-[10px] uppercase tracking-wide text-surface-on-variant"><tr><th className="p-3">Work item</th><th className="p-3">Owner</th><th className="p-3">Priority</th><th className="p-3">Status</th><th className="p-3">Deadline</th><th className="p-3">Last updated</th><th className="p-3 text-right">Details</th></tr></thead>
          <tbody>{visibleTasks.map((task) => {
            const overdue = task.dueDate && task.dueDate < today && task.status !== 'completed';
            const deadlineLabel = !task.dueDate ? 'No due date' : overdue ? `Overdue · ${task.dueDate}` : task.dueDate === today ? 'Today' : task.dueDate;
            return <tr key={task.id} className="border-b border-outline-variant/50 last:border-0">
              <td className="max-w-[280px] p-3"><p className="truncate font-semibold">{task.title}</p><p className="mt-1 truncate text-[10px] text-surface-on-variant">{task.category}{task.description ? ` · ${task.description}` : ''}</p></td>
              <td className="p-3"><span className="inline-flex items-center gap-1"><UserRound size={12} />{task.staffName}</span></td>
              <td className="p-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${priorityClass(task.priority)}`}>{task.priority}</span></td>
              <td className="p-3 capitalize">{task.status.replace('_', ' ')}</td>
              <td className={`p-3 font-semibold ${overdue ? 'text-error' : task.dueDate === today ? 'text-primary' : ''}`}>{deadlineLabel}</td>
              <td className="p-3 text-surface-on-variant">{task.updatedAt ? new Date(task.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded'}<span className="mt-1 block text-[10px]">Created by {task.createdBy || 'System'}</span></td>
              <td className="p-3 text-right"><Button type="button" size="sm" variant="secondary" onClick={() => openTaskDetails(task)}><Pencil size={13} />Details</Button></td>
            </tr>;
          })}</tbody>
        </table>
        {!visibleTasks.length && <p className="p-5 text-sm text-surface-on-variant">No tasks match the current filters.</p>}
      </div>
    </Card>

    <Modal isOpen={Boolean(selectedTask)} onClose={() => { setSelectedTask(null); setDetailsForm(null); }} title="Task details" size="lg">
      {selectedTask && detailsForm && <form onSubmit={saveTaskDetails} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-container-low p-3 text-xs sm:grid-cols-4">
          <div><p className="text-[10px] font-bold uppercase text-surface-on-variant">Assigned to</p><p className="mt-1 font-semibold">{selectedTask.staffName}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-surface-on-variant">Created by</p><p className="mt-1 font-semibold">{selectedTask.createdBy || 'System'}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-surface-on-variant">Created</p><p className="mt-1 font-semibold">{selectedTask.createdAt ? new Date(selectedTask.createdAt).toLocaleString() : 'Not recorded'}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-surface-on-variant">Last updated</p><p className="mt-1 font-semibold">{selectedTask.updatedAt ? new Date(selectedTask.updatedAt).toLocaleString() : 'Not recorded'}</p></div>
        </div>
        <label className="block text-xs font-semibold">Task title<input required maxLength={240} value={detailsForm.title} onChange={(event) => setDetailsForm({ ...detailsForm, title: event.target.value })} className="input-field mt-1" /></label>
        <label className="block text-xs font-semibold">Description<textarea rows="4" value={detailsForm.description} onChange={(event) => setDetailsForm({ ...detailsForm, description: event.target.value })} className="input-field mt-1 w-full" placeholder="Context, expected result, handoff notes, or links" /></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Category<select value={detailsForm.category} onChange={(event) => setDetailsForm({ ...detailsForm, category: event.target.value })} className="input-field mt-1 w-full">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold">Priority<select value={detailsForm.priority} onChange={(event) => setDetailsForm({ ...detailsForm, priority: event.target.value })} className="input-field mt-1 w-full">{priorities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold">Status<select value={detailsForm.status || selectedTask.status} onChange={(event) => setDetailsForm({ ...detailsForm, status: event.target.value })} className="input-field mt-1 w-full">{columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label>
          <label className="text-xs font-semibold">Due date<input type="date" value={detailsForm.dueDate} onChange={(event) => setDetailsForm({ ...detailsForm, dueDate: event.target.value })} className="input-field mt-1 w-full" /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-outline-variant pt-3"><Button type="button" variant="secondary" onClick={() => { setSelectedTask(null); setDetailsForm(null); }}>Cancel</Button><Button type="submit" disabled={savingDetails}><Check size={14} />{savingDetails ? 'Saving...' : 'Save details'}</Button></div>
      </form>}
    </Modal>

    <p className="mt-4 text-[11px] text-surface-on-variant">Signed in as {currentUser?.name}. Use priorities, categories, due dates, search, filters, assignees, descriptions, live updates, status moves, and deletion to keep work moving.</p>
  </div>;
}
