import { useEffect, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react';

const emptyCustomer = { name: '', phone: '', email: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyCustomer);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCustomers = async () => {
    try {
      setCustomers(await api.getCustomers());
    } catch (loadError) {
      setError(loadError.message || 'Unable to load customers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCustomers(); }, []);
  useWebSocket((event) => {
    if (['customer:updated', 'customer:deleted', 'order:created', 'order:updated'].includes(event)) loadCustomers();
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyCustomer);
    setError('');
    setNotice('');
    setModalOpen(true);
  };

  const openEdit = (customer) => {
    setEditing(customer);
    setForm({ name: customer.name || '', phone: customer.phone || '', email: customer.email || '' });
    setError('');
    setNotice('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyCustomer);
  };

  const saveCustomer = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) await api.updateCustomer(editing.id, form);
      else await api.createCustomer({ ...form, tier: 'Regular' });
      setNotice(editing ? 'Customer details updated.' : 'Customer added.');
      closeModal();
      await loadCustomers();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save customer.');
    } finally {
      setSaving(false);
    }
  };

  const removeCustomer = async (customer) => {
    if (!window.confirm(`Delete ${customer.name} and their linked loyalty records?`)) return;
    setError('');
    try {
      await api.deleteCustomer(customer.id);
      setNotice(`${customer.name} was deleted.`);
      await loadCustomers();
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete customer.');
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = customers.filter((customer) =>
    `${customer.name} ${customer.phone || ''} ${customer.email || ''}`.toLowerCase().includes(normalizedSearch)
  );

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Customers"
        subtitle="Saved customer contacts for POS checkout and loyalty follow-up"
        actions={<Button size="sm" onClick={openNew}><Plus size={14} /> Add customer</Button>}
      />

      {(error || notice) && <p className={`mb-3 text-sm ${error ? 'text-error' : 'text-success'}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, or email" className="input-field w-full pl-9" />
        </label>
        <p className="text-xs text-surface-on-variant">{filtered.length} of {customers.length} customers</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-white">
        {loading ? (
          <p className="p-6 text-sm text-surface-on-variant">Loading customers...</p>
        ) : filtered.length ? (
          <div className="divide-y divide-outline-variant/70">
            {filtered.map((customer) => (
              <div key={customer.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#faeee2] text-[#ae002a]"><Users size={16} /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{customer.name}</p>
                    <p className="mt-0.5 break-all text-xs text-surface-on-variant">{customer.phone || 'No phone'}{customer.email ? ` · ${customer.email}` : ''}</p>
                    <p className="mt-1 text-[11px] font-semibold text-primary">{customer.rollPoints || 0} Roll Points</p>
                    {customer.favoriteItems?.length > 0 && <p className="mt-1 truncate text-[11px] text-surface-on-variant">Often orders: {customer.favoriteItems.join(', ')}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 self-end sm:self-auto">
                  <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(customer)}><Pencil size={13} /> Edit</Button>
                  <button type="button" onClick={() => removeCustomer(customer)} aria-label={`Delete ${customer.name}`} title="Delete customer" className="grid h-9 w-9 place-items-center rounded-lg text-error hover:bg-error/10"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid justify-items-center gap-2 px-6 py-12 text-center">
            <Users size={24} className="text-outline" />
            <p className="text-sm font-semibold">No customers found</p>
            <p className="text-xs text-surface-on-variant">Add a customer or try a different search.</p>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Edit customer' : 'Add customer'}>
        <form onSubmit={saveCustomer} className="space-y-4">
          <Input label="Customer name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          <Input label="Phone number" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          <Input label="Email address" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <p className="-mt-2 text-[11px] text-surface-on-variant">A saved email lets the customer verify their Roll Points online.</p>
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Add customer'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}