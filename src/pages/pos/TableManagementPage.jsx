import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { api } from '../../api/client';
import { Users, Clock, MapPin, Wifi, Camera, NotebookPen } from 'lucide-react';

const defaultTableImage = 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=600&fit=crop';

export default function TableManagementPage() {
  const [tables, setTables] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ number: '', seats: '4', tagId: '', zone: 'Main Dining', imageUrl: '', note: '' });
  const [loading, setLoading] = useState(true);

  const load = () => api.getTables().then(setTables).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const stats = {
    available: tables.filter((t) => t.status === 'available').length,
    occupied: tables.filter((t) => t.status === 'occupied').length,
    reserved: tables.filter((t) => t.status === 'reserved').length,
  };

  const handleAdd = async () => {
    if (!form.number || !form.seats) return;
    await api.createTable({
      number: parseInt(form.number),
      seats: parseInt(form.seats),
      tagId: form.tagId || `WR-T${form.number.toString().padStart(2, '0')}`,
      zone: form.zone || 'Main Dining',
      imageUrl: form.imageUrl || defaultTableImage,
      note: form.note || 'Tap NFC tag to identify the guest table',
    });
    setShowAdd(false);
    setForm({ number: '', seats: '4', tagId: '', zone: 'Main Dining', imageUrl: '', note: '' });
    load();
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading tables...</div>;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Table Management" subtitle="Manage floor plan, NFC tagging, and live table assignments" actions={
        <Button size="sm" onClick={() => setShowAdd(true)}>+ Add Table</Button>
      } />
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-xs font-semibold uppercase text-surface-on-variant">Available</p><p className="mt-1 text-2xl font-bold text-success">{stats.available}</p></div>
        <div className="card"><p className="text-xs font-semibold uppercase text-surface-on-variant">Occupied</p><p className="mt-1 text-2xl font-bold text-primary">{stats.occupied}</p></div>
        <div className="card"><p className="text-xs font-semibold uppercase text-surface-on-variant">Reserved</p><p className="mt-1 text-2xl font-bold text-secondary">{stats.reserved}</p></div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((table) => (
          <div key={table.id} className={'card overflow-hidden border-2 transition-all hover:-translate-y-0.5 ' +
            (table.status === 'available' ? 'border-success/30 hover:border-success' :
             table.status === 'occupied' ? 'border-primary/30 hover:border-primary' :
             table.status === 'reserved' ? 'border-secondary-container/50 hover:border-secondary-container' :
             'border-outline-variant')}>
            <div className="relative h-32 w-full overflow-hidden">
              <img src={table.imageUrl || defaultTableImage} alt={`Table ${table.number}`} className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-3 text-white">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-sm">{table.zone || 'Main Dining'}</span>
                  <span className="rounded-full bg-[#f5d777]/90 px-2 py-1 text-[10px] font-bold text-[#24211e]">NFC {table.tagId || `WR-T${table.number}`}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-surface-on-variant">Table {table.number}</p>
                  <h3 className="mt-1 text-xl font-display font-bold">{table.seats}-seat seating</h3>
                </div>
                <StatusBadge status={table.status} className="whitespace-nowrap" />
              </div>

              <div className="flex items-center gap-2 text-sm text-surface-on-variant"><Users size={14} /> {table.seats} guests</div>

              <div className="grid gap-2 rounded-xl bg-surface-container-low p-3 text-xs text-surface-on-variant">
                <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><Wifi size={12} /> NFC tag</span><span className="font-semibold text-on-surface">{table.tagId || `WR-T${table.number}`}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><MapPin size={12} /> Zone</span><span className="font-semibold text-on-surface">{table.zone || 'Main Dining'}</span></div>
                {table.order && <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><NotebookPen size={12} /> Live order</span><span className="font-semibold text-primary">{table.order}</span></div>}
                {table.reservation && <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><Clock size={12} /> Reservation</span><span className="font-semibold text-secondary">{table.reservation}</span></div>}
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant bg-white px-2.5 py-2 text-xs text-surface-on-variant">
                <span className="inline-flex items-center gap-1.5"><Camera size={12} /> Table view</span>
                <span className="font-semibold text-on-surface">{table.note || 'Tap NFC tag to identify guest table'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Table">
        <div className="space-y-4">
          <Input label="Table Number" type="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
          <Input label="Seats" type="number" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
          <Input label="NFC Tag ID" value={form.tagId} onChange={(e) => setForm({ ...form, tagId: e.target.value })} placeholder="WR-T01" />
          <Input label="Zone" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="Main Dining" />
          <Input label="Table Image URL" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." />
          <Input label="Table Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Tap NFC tag to identify guest table" />
          <Button onClick={handleAdd} className="w-full">Add Table</Button>
        </div>
      </Modal>
    </div>
  );
}
