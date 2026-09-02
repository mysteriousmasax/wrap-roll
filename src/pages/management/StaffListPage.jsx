import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { api } from '../../api/client';
import { Search, UserPlus, Phone, Clock, ShieldCheck, BriefcaseBusiness } from 'lucide-react';

export default function StaffListPage() {
  const [staffMembers, setStaffMembers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editStaff, setEditStaff] = useState(null);
  const [form, setForm] = useState({ name: '', role: 'foh', shift: 'Morning', phone: '', username: '', email: '', password: '' });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => api.getStaff().then(setStaffMembers).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.name || form.password.length < 8) return;
    await api.createStaff(form);
    setShowAdd(false);
    setForm({ name: '', role: 'foh', shift: 'Morning', phone: '', username: '', email: '', password: '' });
    load();
  };

  const handleEdit = async () => {
    if (!form.name) return;
    await api.updateStaff(editStaff.id, form);
    if (form.password) await api.updateStaffCredentials(editStaff.id, { username: form.username, email: form.email, password: form.password });
    setEditStaff(null);
    load();
  };

  const openEdit = (staff) => {
    setForm({ name: staff.name, role: staff.role, shift: staff.shift, phone: staff.phone, username: staff.name.toLowerCase().replace(/[^a-z0-9]+/g, '.'), email: '', password: '' });
    setEditStaff(staff);
  };

  const visibleStaff = staffMembers.filter((staff) => {
    const matchesStatus = statusFilter === 'all' || staff.status === statusFilter;
    const searchText = `${staff.name} ${staff.role} ${staff.shift} ${staff.phone}`.toLowerCase();
    return matchesStatus && searchText.includes(search.toLowerCase());
  });

  const StaffForm = ({ onSave, label }) => (
    <div className="space-y-4">
      <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      {!editStaff && <Input label="Username" placeholder="e.g. grace.kimaro" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '.') })} />}
      {!editStaff && <Input label="Email" type="email" placeholder="staff@wrapandrolltz.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
      <div>
        <label className="block text-xs font-semibold text-surface-on-variant uppercase mb-1.5">System Access Role</label>
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input-field">
          <option value="foh">FOH / Cashier</option><option value="kitchen">Kitchen / KDS</option><option value="manager">Manager</option><option value="executive">Executive</option><option value="admin">Administrator</option>
        </select>
      </div>
      <Input label="Shift" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} />
      <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      {!editStaff && <Input label="Login Password" type="password" minLength={8} placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
      {!editStaff && <p className="text-xs text-surface-on-variant">Give the staff member their username and password privately.</p>}
      {editStaff && <Input label="Reset Password (optional)" type="password" minLength={8} placeholder="Leave blank to keep current password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
      <Button onClick={onSave} className="w-full">{label}</Button>
    </div>
  );

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading staff...</div>;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Staff Management" subtitle="Manage employees, roles, access, and shifts" actions={
        <Button size="sm" onClick={() => setShowAdd(true)}><UserPlus size={14} /> Add Staff</Button>
      } />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><p className="text-xs text-surface-on-variant uppercase font-semibold">Total Staff</p><p className="mt-1 text-2xl font-bold">{staffMembers.length}</p><p className="mt-1 text-[10px] text-surface-on-variant">Active team members</p></Card>
        <Card><p className="text-xs text-surface-on-variant uppercase font-semibold">On Clock</p><p className="mt-1 text-2xl font-bold text-success">{staffMembers.filter((s) => s.status === 'on-clock').length}</p><p className="mt-1 text-[10px] text-surface-on-variant">Working now</p></Card>
        <Card><p className="text-xs text-surface-on-variant uppercase font-semibold">Off Clock</p><p className="mt-1 text-2xl font-bold">{staffMembers.filter((s) => s.status === 'off-clock').length}</p><p className="mt-1 text-[10px] text-surface-on-variant">Available later</p></Card>
        <Card><p className="text-xs text-surface-on-variant uppercase font-semibold">No Show</p><p className="mt-1 text-2xl font-bold text-error">{staffMembers.filter((s) => s.status === 'no-show').length}</p><p className="mt-1 text-[10px] text-surface-on-variant">Needs attention</p></Card>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2 overflow-x-auto"><button onClick={() => setStatusFilter('all')} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${statusFilter === 'all' ? 'bg-primary text-white' : 'bg-white text-surface-on'}`}>Everyone</button><button onClick={() => setStatusFilter('on-clock')} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${statusFilter === 'on-clock' ? 'bg-success text-white' : 'bg-white text-surface-on'}`}>On clock</button><button onClick={() => setStatusFilter('off-clock')} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${statusFilter === 'off-clock' ? 'bg-surface-on text-white' : 'bg-white text-surface-on'}`}>Off clock</button><button onClick={() => setStatusFilter('no-show')} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${statusFilter === 'no-show' ? 'bg-error text-white' : 'bg-white text-surface-on'}`}>No show</button></div><div className="relative w-full sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff..." className="input-field pl-9" /></div></div>
      <div className="grid gap-3">
        {visibleStaff.map((staff) => (
          <Card key={staff.id} className="staff-card flex items-center gap-4">
            <div className={'w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ' +
              (staff.status === 'on-clock' ? 'bg-success/10 text-success ring-2 ring-success/30' : 'bg-surface-container text-surface-on-variant')}>
              {staff.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-sm">{staff.name}</p>
                <StatusBadge status={staff.status} />
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-surface-on-variant"><BriefcaseBusiness size={11} />{staff.role} &middot; {staff.shift} Shift</p>
              <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-primary"><ShieldCheck size={11} />System access configured</p>
            </div>
            <div className="text-right">
              {staff.clockIn && <p className="text-sm font-semibold flex items-center gap-1"><Clock size={12} /> {staff.clockIn}</p>}
              <p className="text-xs text-surface-on-variant flex items-center gap-1"><Phone size={10} /> {staff.phone}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => openEdit(staff)}>Edit</Button>
          </Card>
        ))}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Staff Member">
        <StaffForm onSave={handleAdd} label="Add Staff" />
      </Modal>
      <Modal isOpen={!!editStaff} onClose={() => setEditStaff(null)} title="Edit Staff Member">
        <StaffForm onSave={handleEdit} label="Save Changes" />
      </Modal>
    </div>
  );
}
