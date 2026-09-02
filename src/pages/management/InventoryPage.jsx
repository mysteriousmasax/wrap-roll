import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import { Package, AlertTriangle, CalendarClock, Edit3, Search, Plus, MapPin, Truck, X, Upload, History, SlidersHorizontal } from 'lucide-react';

const fallbackImage = 'https://images.unsplash.com/photo-1547592180-85f173990554?w=240&h=180&fit=crop';
const emptyForm = { name: '', quantity: '', unit: 'kg', threshold: '10', supplier: '', imageUrl: '', category: 'ingredients', sku: '', unitCost: '', expiryDate: '', storageLocation: 'Main store' };

function daysUntil(date) {
  if (!date) return null;
  return Math.ceil((new Date(`${date}T23:59:59`) - new Date()) / 86400000);
}

function importPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type.startsWith('image/')) return reject(new Error('Choose an image file.'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Photo must be smaller than 8 MB.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read that photo.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Unable to process that photo.'));
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditItem, setAuditItem] = useState(null);
  const [auditRows, setAuditRows] = useState([]);
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustment, setAdjustment] = useState({ amount: '', reason: 'Stock received' });

  const load = () => api.getInventory().then(setItems).catch((err) => setError(err.message || 'Unable to load inventory.')).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const lowStock = items.filter((item) => item.quantity <= item.threshold);
  const expiringSoon = items.filter((item) => { const days = daysUntil(item.expiryDate); return days !== null && days <= 7; });
  const stockValue = items.reduce((sum, item) => sum + (item.quantity * (item.unitCost || 0)), 0);
  const categories = useMemo(() => ['all', ...new Set(items.map((item) => item.category || 'ingredients'))], [items]);
  const filteredItems = items.filter((item) => {
    const text = `${item.name} ${item.supplier} ${item.sku}`.toLowerCase();
    return (category === 'all' || (item.category || 'ingredients') === category) && text.includes(search.toLowerCase());
  });

  const openAdd = () => { setEditingItem(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (item) => { setEditingItem(item); setForm({ ...emptyForm, ...item, quantity: String(item.quantity), threshold: String(item.threshold), unitCost: String(item.unitCost || '') }); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditingItem(null); setForm(emptyForm); };
  const handlePhotoChange = async (event) => {
    try {
      const imageUrl = await importPhoto(event.target.files?.[0]);
      setForm((current) => ({ ...current, imageUrl }));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      event.target.value = '';
    }
  };
  const openAudit = async (item) => {
    setAuditItem(item);
    try {
      setAuditRows(await api.getInventoryAudit(item.id));
    } catch (err) {
      setError(err.message || 'Unable to load item history.');
    }
  };
  const openAdjust = (item) => { setAdjustItem(item); setAdjustment({ amount: '', reason: 'Stock received' }); };
  const saveAdjustment = async () => {
    if (!adjustItem || !adjustment.amount || !adjustment.reason) return;
    await api.adjustInventory(adjustItem.id, { amount: Number(adjustment.amount), reason: adjustment.reason });
    setAdjustItem(null);
    load();
  };

  const save = async () => {
    if (!form.name || form.quantity === '') return;
    const payload = { ...form, quantity: Number(form.quantity), threshold: Number(form.threshold), unitCost: Number(form.unitCost) || 0 };
    if (editingItem) await api.updateInventory(editingItem.id, payload);
    else await api.createInventory(payload);
    closeModal();
    load();
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading inventory...</div>;

  return (
    <div className="inventory-page p-4 sm:p-6">
      <PageHeader title="Inventory Management" subtitle="Track stock levels, suppliers, expiry dates, and storage locations" actions={<Button size="sm" onClick={openAdd}><Plus size={14} /> Add Item</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Package size={19} className="text-primary" /></div><div><p className="text-xs text-surface-on-variant">Total items</p><p className="text-xl font-bold">{items.length}</p><p className="text-[10px] text-surface-on-variant">Across all stores</p></div></div>
        <div className="card flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-error/10"><AlertTriangle size={19} className="text-error" /></div><div><p className="text-xs text-surface-on-variant">Low stock</p><p className="text-xl font-bold text-error">{lowStock.length}</p><p className="text-[10px] text-surface-on-variant">Needs attention</p></div></div>
        <div className="card flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10"><CalendarClock size={19} className="text-warning" /></div><div><p className="text-xs text-surface-on-variant">Expiring soon</p><p className="text-xl font-bold text-warning">{expiringSoon.length}</p><p className="text-[10px] text-surface-on-variant">Within 7 days</p></div></div>
        <div className="card flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10"><Truck size={19} className="text-success" /></div><div><p className="text-xs text-surface-on-variant">Stock value</p><p className="text-xl font-bold text-success">{formatCurrency(stockValue)}</p><p className="text-[10px] text-surface-on-variant">Estimated cost</p></div></div>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full lg:max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, SKU, supplier..." className="input-field pl-9" /></div><div className="flex gap-2 overflow-x-auto">{categories.map((entry) => <button key={entry} onClick={() => setCategory(entry)} className={'whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold capitalize ' + (category === entry ? 'bg-primary text-white' : 'bg-white text-surface-on hover:bg-surface-container')}>{entry}</button>)}</div></div>
      {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-error/20 bg-error/5 p-3 text-sm text-error"><span>{error}</span><button onClick={() => { setError(''); load(); }}><X size={16} /></button></div>}

      <div className="card overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1050px]"><thead><tr className="border-b border-outline-variant bg-surface-container-low">{['Item', 'Stock level', 'Threshold', 'Status', 'Supplier', 'Expiry', 'Location', 'Actions'].map((heading) => <th key={heading} className="p-3 text-left text-[10px] font-bold uppercase tracking-wide text-surface-on-variant">{heading}</th>)}</tr></thead><tbody>
        {filteredItems.map((item) => { const isLow = item.quantity <= item.threshold; const expiryDays = daysUntil(item.expiryDate); const isExpiring = expiryDays !== null && expiryDays <= 7; return <tr key={item.id} className={'border-b border-outline-variant/30 transition-colors hover:bg-surface-container-low/60 ' + (isLow ? 'bg-error/5' : '')}>
          <td className="p-3"><div className="flex items-center gap-3"><img src={item.imageUrl || fallbackImage} alt={item.name} className="h-12 w-14 rounded-lg object-cover" onError={(event) => { event.currentTarget.src = fallbackImage; }} /><div><p className="text-sm font-bold">{item.name}</p><p className="mt-0.5 text-[10px] uppercase tracking-wide text-surface-on-variant">{item.sku || `INV-${String(item.id).padStart(3, '0')}`}</p><p className="text-xs capitalize text-surface-on-variant">{item.category || 'ingredients'}</p></div></div></td>
          <td className="p-3"><span className={'text-sm font-bold ' + (isLow ? 'text-error' : '')}>{item.quantity}</span> <span className="text-xs text-surface-on-variant">{item.unit}</span><div className="mt-1 h-1.5 w-24 rounded-full bg-surface-container"><div className={'h-1.5 rounded-full ' + (isLow ? 'bg-error' : 'bg-success')} style={{ width: `${Math.min(100, (item.quantity / Math.max(item.threshold * 2, 1)) * 100)}%` }} /></div></td>
          <td className="p-3 text-sm text-surface-on-variant">{item.threshold} {item.unit}</td><td className="p-3"><Badge variant={isLow ? 'red' : 'green'}>{isLow ? 'Low Stock' : 'In Stock'}</Badge></td><td className="p-3"><p className="text-sm font-semibold">{item.supplier || 'Not assigned'}</p><p className="text-[10px] text-surface-on-variant">Unit cost: {formatCurrency(item.unitCost || 0)}</p></td><td className="p-3"><p className={'text-sm font-semibold ' + (isExpiring ? 'text-warning' : '')}>{item.expiryDate || 'No expiry'}</p>{isExpiring && <p className="text-[10px] text-warning">{expiryDays < 0 ? 'Expired' : `${expiryDays} days left`}</p>}</td><td className="p-3"><span className="inline-flex items-center gap-1 text-xs text-surface-on-variant"><MapPin size={12} />{item.storageLocation || 'Main store'}</span></td><td className="p-3"><button title="Adjust stock" onClick={() => openAdjust(item)} className="rounded-lg p-2 hover:bg-surface-container"><SlidersHorizontal size={15} className="text-surface-on-variant" /></button><button title="View inventory history" onClick={() => openAudit(item)} className="rounded-lg p-2 hover:bg-surface-container"><History size={15} className="text-surface-on-variant" /></button><button title="Edit inventory item" onClick={() => openEdit(item)} className="rounded-lg p-2 hover:bg-surface-container"><Edit3 size={15} className="text-surface-on-variant" /></button></td>
        </tr>; })}
        {!filteredItems.length && <tr><td colSpan="8" className="p-10 text-center text-sm text-surface-on-variant">No inventory items match your filters.</td></tr>}
      </tbody></table></div></div>

      <Modal isOpen={showModal} onClose={closeModal} title={editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}><div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Input label="Item Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><Input label="SKU" placeholder="INV-001" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div><div className="grid grid-cols-2 gap-3"><Input label="Quantity" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /><Input label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div><div className="grid grid-cols-2 gap-3"><Input label="Low-stock threshold" type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} /><Input label="Unit cost (TZS)" type="number" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} /></div><div className="grid grid-cols-2 gap-3"><Input label="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /><Input label="Storage location" value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} /></div><div className="grid grid-cols-2 gap-3"><Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /><Input label="Expiry date" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></div><div className="space-y-1.5"><label className="block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">Import photo</label><label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/5"><Upload size={16} />{form.imageUrl ? 'Replace photo' : 'Choose photo'}<input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} /></label></div>{form.imageUrl && <img src={form.imageUrl} alt="Inventory preview" className="h-32 w-full rounded-xl object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}<div className="flex gap-3"><Button variant="secondary" onClick={closeModal} className="flex-1">Cancel</Button><Button onClick={save} className="flex-1">{editingItem ? 'Save Changes' : 'Add Item'}</Button></div></div></Modal>
      <Modal isOpen={adjustItem !== null} onClose={() => setAdjustItem(null)} title={adjustItem ? `Adjust ${adjustItem.name}` : 'Adjust stock'}><div className="space-y-4"><p className="text-sm text-surface-on-variant">Current stock: <strong>{adjustItem?.quantity} {adjustItem?.unit}</strong></p><Input label="Quantity change (+ receive, - remove)" type="number" value={adjustment.amount} onChange={(e) => setAdjustment({ ...adjustment, amount: e.target.value })} placeholder="e.g. 12 or -2" /><label className="block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">Reason<select className="input-field mt-1" value={adjustment.reason} onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })}><option>Stock received</option><option>Wastage</option><option>Damaged goods</option><option>Stock count correction</option><option>Transfer</option></select></label><div className="flex gap-3"><Button variant="secondary" onClick={() => setAdjustItem(null)} className="flex-1">Cancel</Button><Button onClick={saveAdjustment} className="flex-1">Record adjustment</Button></div></div></Modal>
      <Modal isOpen={auditItem !== null} onClose={() => setAuditItem(null)} title={auditItem ? `${auditItem.name} history` : 'Inventory history'}><div className="space-y-3">{auditRows.length === 0 && <p className="text-sm text-surface-on-variant">No changes recorded yet.</p>}{auditRows.map((row) => <div key={row.id} className="rounded-xl border border-outline-variant/50 bg-surface-container-low p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold capitalize">{row.action}</p><p className="text-xs text-surface-on-variant">{row.changedByName || row.changed_by_name} · {row.changedByRole || row.changed_by_role || 'staff'}</p></div><time className="text-right text-[10px] text-surface-on-variant">{new Date(row.createdAt || row.created_at).toLocaleString()}</time></div><div className="mt-2 space-y-1">{Object.entries(row.changes || {}).map(([field, change]) => <p key={field} className="text-xs"><span className="font-semibold capitalize">{field.replace(/([A-Z])/g, ' $1')}: </span>{String(change.from ?? 'none')} -&gt; {String(change.to ?? 'none')}</p>)}</div></div>)}</div></Modal>
    </div>
  );
}
