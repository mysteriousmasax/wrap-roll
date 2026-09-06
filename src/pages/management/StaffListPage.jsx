import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { api, ApiError } from '../../api/client';
import { Search, UserPlus, Phone, Clock, ShieldCheck, BriefcaseBusiness, Plus, Trash2 } from 'lucide-react';

const builtInRoles = [
  { name: 'foh', label: 'FOH / Cashier', baseRole: 'foh' },
  { name: 'kitchen', label: 'Kitchen / KDS', baseRole: 'kitchen' },
  { name: 'manager', label: 'Manager', baseRole: 'manager' },
  { name: 'executive', label: 'Executive', baseRole: 'executive' },
  { name: 'admin', label: 'Administrator', baseRole: 'admin' },
];

function StaffForm({ form, setForm, editStaff, formError, onSave, label, roleOptions, shiftOptions }) {
  return (
    <div className="space-y-4">
      <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input label="Username" placeholder="e.g. grace.kimaro" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '.') })} />
      <Input label="Email" type="email" placeholder="staff@wrapandrolltz.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <div>
        <label className="block text-xs font-semibold text-surface-on-variant uppercase mb-1.5">System Access Role</label>
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input-field">
          {roleOptions.map((role) => <option key={role.name} value={role.name}>{role.label || role.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-surface-on-variant uppercase mb-1.5">Shift</label>
        <select value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} className="input-field">
          {shiftOptions.map((shift) => <option key={shift} value={shift}>{shift}</option>)}
        </select>
      </div>
      <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      {!editStaff && <Input label="Login Password" type="password" minLength={8} placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
      {!editStaff && <p className="text-xs text-surface-on-variant">Give the staff member their username and password privately.</p>}
      {editStaff && <Input label="Reset Password (optional)" type="password" minLength={8} placeholder="Leave blank to keep current password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
      {formError && <p className="rounded-xl border border-error/20 bg-error/5 px-3 py-2 text-sm text-error">{formError}</p>}
      <Button onClick={onSave} className="w-full">{label}</Button>
    </div>
  );
}

export default function StaffListPage({ embedded = false }) {
  const [staffMembers, setStaffMembers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editStaff, setEditStaff] = useState(null);
  const [form, setForm] = useState({ name: '', role: 'foh', shift: 'Morning', phone: '', username: '', email: '', password: '' });
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [customRoles, setCustomRoles] = useState([]);
  const [shiftOptions, setShiftOptions] = useState(['Morning', 'Afternoon', 'Evening', 'Night']);

  const load = () => Promise.all([api.getStaff(), api.getSettings()]).then(([staff, settings]) => {
    setStaffMembers(staff);
    try { setCustomRoles(JSON.parse(settings.custom_staff_roles || '[]')); } catch { setCustomRoles([]); }
    try {
      const shifts = JSON.parse(settings.shift_types || '[]');
      if (Array.isArray(shifts) && shifts.length) setShiftOptions(shifts);
    } catch {}
  }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    setFormError('');
    if (!form.name) {
      setFormError('Enter the staff member’s name.');
      return;
    }
    if (form.password.length < 8) {
      setFormError('Use a password with at least 8 characters.');
      return;
    }
    try {
      await api.createStaff(form);
      setShowAdd(false);
      setForm({ name: '', role: 'foh', shift: 'Morning', phone: '', username: '', email: '', password: '' });
      load();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Unable to add staff member. Please try again.');
    }
  };

  const handleEdit = async () => {
    if (!form.name) return;
    setFormError('');
    try {
      await api.updateStaff(editStaff.id, form);
      await api.updateStaffCredentials(editStaff.id, { username: form.username, email: form.email, password: form.password || undefined });
      setEditStaff(null);
      load();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Unable to save staff changes.');
    }
  };

  const openEdit = (staff) => {
    setForm({ name: staff.name, role: staff.role, shift: staff.shift, phone: staff.phone || '', username: staff.username || staff.name.toLowerCase().replace(/[^a-z0-9]+/g, '.'), email: staff.email || '', password: '' });
    setFormError('');
    setEditStaff(staff);
  };

  const addRole = async () => {
    const name = window.prompt('New role name');
    if (!name?.trim()) return;
    const baseRole = window.prompt('Base access: foh, kitchen, manager, executive, or admin', 'foh');
    if (!builtInRoles.some((role) => role.name === baseRole)) return;
    const next = [...customRoles, { name: name.trim(), label: name.trim(), baseRole }];
    await api.updateSettings({ custom_staff_roles: JSON.stringify(next) });
    setCustomRoles(next);
  };

  const addShift = async () => {
    const shift = window.prompt('New shift type');
    if (!shift?.trim() || shiftOptions.includes(shift.trim())) return;
    const next = [...shiftOptions, shift.trim()];
    await api.updateSettings({ shift_types: JSON.stringify(next) });
    setShiftOptions(next);
  };

  const removeStaff = async (staff) => {
    if (!window.confirm(`Remove ${staff.name}? Their history will be preserved.`)) return;
    await api.deleteStaff(staff.id);
    await load();
  };

  const visibleStaff = staffMembers.filter((staff) => {
    const matchesStatus = statusFilter === 'all' || staff.status === statusFilter;
    const searchText = `${staff.name} ${staff.role} ${staff.shift} ${staff.phone}`.toLowerCase();
    return matchesStatus && searchText.includes(search.toLowerCase());
  });

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading staff...</div>;

  return (
    <div className={embedded ? '' : 'p-4 sm:p-6'}>
      {!embedded && <PageHeader title="Staff Management" subtitle="Manage employees, roles, access, and shifts" actions={
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={addRole}><Plus size={14} /> New Role</Button><Button size="sm" variant="secondary" onClick={addShift}><Plus size={14} /> New Shift</Button><Button size="sm" onClick={() => setShowAdd(true)}><UserPlus size={14} /> Add Staff</Button></div>
      } />}
      {embedded && <div className="mb-4 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={addRole}><Plus size={14} /> New Role</Button><Button size="sm" variant="secondary" onClick={addShift}><Plus size={14} /> New Shift</Button><Button size="sm" onClick={() => setShowAdd(true)}><UserPlus size={14} /> Add Staff</Button></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><p className="text-xs text-surface-on-variant uppercase font-semibold">Total Staff</p><p className="mt-1 text-2xl font-bold">{staffMembers.length}</p><p className="mt-1 text-[10px] text-surface-on-variant">Active team members</p></Card>
        <Card><p className="text-xs text-surface-on-variant uppercase font-semibold">On Clock</p><p className="mt-1 text-2xl font-bold text-success">{staffMembers.filter((s) => s.status === 'on-clock').length}</p><p className="mt-1 text-[10px] text-surface-on-variant">Working now</p></Card>
        <Card><p className="text-xs text-surface-on-variant uppercase font-semibold">Off Clock</p><p className="mt-1 text-2xl font-bold">{staffMembers.filter((s) => s.status === 'off-clock').length}</p><p className="mt-1 text-[10px] text-surface-on-variant">Available later</p></Card>
        <Card><p className="text-xs text-surface-on-variant uppercase font-semibold">No Show</p><p className="mt-1 text-2xl font-bold text-error">{staffMembers.filter((s) => s.status === 'no-show').length}</p><p className="mt-1 text-[10px] text-surface-on-variant">Needs attention</p></Card>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2 overflow-x-auto"><button onClick={() => setStatusFilter('all')} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${statusFilter === 'all' ? 'bg-primary text-white' : 'bg-white text-surface-on'}`}>Everyone</button><button onClick={() => setStatusFilter('on-clock')} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${statusFilter === 'on-clock' ? 'bg-success text-white' : 'bg-white text-surface-on'}`}>On clock</button><button onClick={() => setStatusFilter('off-clock')} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${statusFilter === 'off-clock' ? 'bg-surface-on text-white' : 'bg-white text-surface-on'}`}>Off clock</button><button onClick={() => setStatusFilter('no-show')} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${statusFilter === 'no-show' ? 'bg-error text-white' : 'bg-white text-surface-on'}`}>No show</button></div><div className="relative w-full sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff..." className="input-field pl-9" /></div></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleStaff.map((staff) => (
          <Card key={staff.id} className="staff-card flex flex-col gap-3">
            <div className="flex min-w-0 items-start gap-3"><div className={'flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-bold text-sm ' +
              (staff.status === 'on-clock' ? 'bg-success/10 text-success ring-2 ring-success/30' : 'bg-surface-container text-surface-on-variant')}>
              {staff.avatar}
            </div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-bold text-sm">{staff.name}</p><StatusBadge status={staff.status} /></div><p className="mt-0.5 flex items-center gap-1 text-xs capitalize text-surface-on-variant"><BriefcaseBusiness size={11} />{staff.role} · {staff.shift} Shift</p><p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-primary"><ShieldCheck size={11} />Access configured</p></div></div>
            <div className="flex items-center justify-between gap-2 border-t border-outline-variant/60 pt-3"><div className="min-w-0 text-xs text-surface-on-variant">{staff.clockIn && <p className="mb-1 flex items-center gap-1 font-semibold"><Clock size={11} />{staff.clockIn}</p>}<p className="flex items-center gap-1 truncate"><Phone size={10} />{staff.phone || 'No phone'}</p>{staff.email && <p className="mt-1 truncate text-[10px]">{staff.email}</p>}</div><div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => openEdit(staff)}>Edit</Button><button type="button" onClick={() => removeStaff(staff)} className="rounded-lg p-2 text-error hover:bg-error/10" title="Remove staff"><Trash2 size={15} /></button></div></div>
          </Card>
        ))}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Staff Member">
        <StaffForm form={form} setForm={setForm} editStaff={editStaff} formError={formError} onSave={handleAdd} label="Add Staff" roleOptions={[...builtInRoles, ...customRoles]} shiftOptions={shiftOptions} />
      </Modal>
      <Modal isOpen={!!editStaff} onClose={() => setEditStaff(null)} title="Edit Staff Member">
        <StaffForm form={form} setForm={setForm} editStaff={editStaff} formError={formError} onSave={handleEdit} label="Save Changes" roleOptions={[...builtInRoles, ...customRoles]} shiftOptions={shiftOptions} />
      </Modal>
    </div>
  );
}
