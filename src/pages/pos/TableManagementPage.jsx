import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { api } from '../../api/client';
import importPhoto from '../../utils/importPhoto';
import { downloadAsset } from '../../utils/downloadAsset';
import { Users, Clock, MapPin, Wifi, Camera, NotebookPen, Upload, X, Download } from 'lucide-react';

const defaultTableImage = 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=600&fit=crop';
const emptyForm = { number: '', seats: '4', status: 'available', tagId: '', zone: 'Main Dining', imageUrl: '', reservation: '', note: '' };

export default function TableManagementPage() {
  const [tables, setTables] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editTable, setEditTable] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => api.getTables().then(setTables).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handlePhotoChange = async (event) => {
    try {
      const imageUrl = await importPhoto(event.target.files?.[0]);
      setForm((current) => ({ ...current, imageUrl }));
      setError('');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      event.target.value = '';
    }
  };

  const openAdd = () => {
    setError('');
    setForm(emptyForm);
    setShowAdd(true);
  };

  const openEdit = (table) => {
    setError('');
    setForm({
      number: String(table.number),
      seats: String(table.seats),
      status: table.status || 'available',
      tagId: table.tagId || '',
      zone: table.zone || 'Main Dining',
      imageUrl: table.imageUrl || '',
      reservation: table.reservation || '',
      note: table.note || '',
    });
    setEditTable(table);
  };

  const stats = {
    available: tables.filter((t) => t.status === 'available').length,
    occupied: tables.filter((t) => t.status === 'occupied').length,
    reserved: tables.filter((t) => t.status === 'reserved').length,
  };

  const handleSave = async () => {
    setError('');
    if (!form.number || !form.seats) {
      setError('Table number and seats are required.');
      return;
    }
    const data = {
      number: parseInt(form.number, 10),
      seats: parseInt(form.seats, 10),
      status: form.status,
      tagId: form.tagId || `WR-T${form.number.toString().padStart(2, '0')}`,
      zone: form.zone || 'Main Dining',
      imageUrl: form.imageUrl || defaultTableImage,
      reservation: form.reservation || null,
      note: form.note || 'Tap NFC tag to identify the guest table',
    };
    try {
      if (editTable) {
        await api.updateTable(editTable.id, data);
        setEditTable(null);
      } else {
        await api.createTable(data);
        setShowAdd(false);
      }
      setForm(emptyForm);
      load();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save table changes.');
    }
  };

  const downloadTableImage = async (table) => {
    if (!table.imageUrl) return;
    try {
      await downloadAsset(table.imageUrl, `wrap-roll-table-${table.number}`);
    } catch (downloadError) {
      setError(downloadError.message || 'Unable to download this image.');
    }
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading tables...</div>;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Table Management" subtitle="Manage floor plan, NFC tagging, and live table assignments" actions={
      <Button size="sm" onClick={openAdd}>+ Add Table</Button>
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
              <div className="flex gap-2"><Button variant="ghost" size="sm" className="flex-1" onClick={() => openEdit(table)}>Edit Table</Button><button type="button" title="Download table image" onClick={() => downloadTableImage(table)} disabled={!table.imageUrl} className="rounded-lg border border-outline-variant px-3 text-primary hover:bg-surface-container-low disabled:opacity-30"><Download size={15} /></button></div>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={showAdd || !!editTable} onClose={() => { setShowAdd(false); setEditTable(null); }} title={editTable ? 'Edit Table' : 'Add Table'}>
        <div className="space-y-4">
          {error && <div className="flex items-center justify-between rounded-xl border border-error/20 bg-error/5 p-3 text-sm text-error"><span>{error}</span><button type="button" onClick={() => setError('')}><X size={16} /></button></div>}
          <Input label="Table Number" type="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
          <Input label="Seats" type="number" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
          {editTable && <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input-field"><option value="available">Available</option><option value="occupied">Occupied</option><option value="reserved">Reserved</option><option value="cleaning">Cleaning</option></select></div>}
          <Input label="NFC Tag ID" value={form.tagId} onChange={(e) => setForm({ ...form, tagId: e.target.value })} placeholder="WR-T01" />
          <Input label="Zone" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="Main Dining" />
          {editTable && <Input label="Reservation" value={form.reservation} onChange={(e) => setForm({ ...form, reservation: e.target.value })} placeholder="e.g. 6:30 PM" />}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">Table Image</label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/5">
              <Upload size={16} /> {form.imageUrl ? 'Replace photo' : 'Upload image'}
              <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} />
            </label>
            {form.imageUrl && <img src={form.imageUrl} alt="Table preview" className="h-28 w-full rounded-xl object-cover" />}
          </div>
          <Input label="Table Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Tap NFC tag to identify guest table" />
          <Button onClick={handleSave} className="w-full">{editTable ? 'Save Table Changes' : 'Add Table'}</Button>
        </div>
      </Modal>
    </div>
  );
}
