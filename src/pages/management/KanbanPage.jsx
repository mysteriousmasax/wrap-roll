import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, CircleAlert, Clock3, Filter, Flag, Plus, Search, Trash2, X } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
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
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ staffId: '', title: '', description: '', category: 'Marketing', priority: 'medium', dueDate: '' });

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
    return text.includes(search.toLowerCase()) && (categoryFilter === 'all' || task.category === categoryFilter) && (priorityFilter === 'all' || task.priority === priorityFilter);
  }), [tasks, search, categoryFilter, priorityFilter]);

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
    try { await api.deleteKanbanTask(task.id); await load(); } catch (error) { setMessage(error.message || 'Unable to delete task.'); }
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading Kanban board...</div>;

  return <div className="kanban-page p-4 sm:p-6">
    <PageHeader title="Team Kanban" subtitle="Coordinate marketing, follow-ups, operations, and executive work in one live board" actions={<Button onClick={() => setShowForm((open) => !open)}><Plus size={15} /> New task</Button>} />
    {message && <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">{message}</div>}

    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {columns.map((column) => <div key={column.id} className={`rounded-xl border-l-4 ${column.tone} bg-white p-3 shadow-sm`}><p className="text-[10px] font-bold uppercase tracking-wider text-surface-on-variant">{column.label}</p><p className="mt-1 text-2xl font-bold">{tasks.filter((task) => task.status === column.id).length}</p></div>)}
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

    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-outline-variant bg-white p-3 shadow-sm lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, teammates, or descriptions..." className="input-field pl-9" /></div><div className="flex flex-wrap items-center gap-2"><Filter size={15} className="text-surface-on-variant" /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="input-field w-auto"><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="input-field w-auto"><option value="all">All priorities</option>{priorities.map((item) => <option key={item}>{item}</option>)}</select></div></div>

    <div className="kanban-board grid min-w-0 grid-cols-1 gap-3 overflow-x-auto md:grid-cols-2 xl:grid-cols-4">
      {columns.map((column) => <section key={column.id} className="kanban-column min-w-0 rounded-2xl border border-outline-variant bg-surface-container-low p-3"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold"><span className={`h-2.5 w-2.5 rounded-full ${column.dot}`} />{column.label}</h2><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-surface-on-variant">{visibleTasks.filter((task) => task.status === column.id).length}</span></div><div className="space-y-3">{visibleTasks.filter((task) => task.status === column.id).map((task) => <article key={task.id} className="kanban-card rounded-xl border border-outline-variant bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${priorityClass(task.priority)}`}>{task.priority}</span><button type="button" onClick={() => removeTask(task)} aria-label={`Delete ${task.title}`} className="text-outline hover:text-error"><Trash2 size={14} /></button></div><h3 className="mt-2 text-sm font-bold">{task.title}</h3>{task.description && <p className="mt-1 text-xs leading-5 text-surface-on-variant">{task.description}</p>}<div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold"><span className="rounded bg-primary/10 px-2 py-1 text-primary">{task.category}</span><span className="rounded bg-surface-container-low px-2 py-1">{task.staffName}</span></div><div className="mt-3 flex items-center justify-between gap-2 border-t border-outline-variant pt-2 text-[10px] text-surface-on-variant"><span className="flex items-center gap-1"><CalendarDays size={12} />{task.dueDate || 'No due date'}</span>{task.status !== 'completed' && <span className="flex items-center gap-1"><Clock3 size={12} />Live</span>}</div><div className="mt-3 flex flex-wrap gap-1.5">{columns.filter((item) => item.id !== task.status).map((item) => <button key={item.id} type="button" onClick={() => updateStatus(task, item.id)} className="rounded-lg border border-outline-variant px-2 py-1 text-[10px] font-bold hover:bg-surface-container-low">Move to {item.label}</button>)}</div></article>)}</div></section>)}
    </div>
    <p className="mt-4 text-[11px] text-surface-on-variant">Signed in as {currentUser?.name}. Use priorities, categories, due dates, search, filters, assignees, descriptions, live updates, status moves, and deletion to keep work moving.</p>
  </div>;
}
