import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import { downloadAsset } from '../../utils/downloadAsset';
import { getStockUnitConversionFactor, stockUnitGroups, stockUnitOptions } from '../../utils/stockUnits';
import ReceiptIntake from '../../components/ReceiptIntake';
import { Package, AlertTriangle, CalendarClock, Edit3, Search, Plus, MapPin, Truck, X, Upload, History, SlidersHorizontal, Download, Trash2, ScanLine } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';

const fallbackImage = 'https://images.unsplash.com/photo-1547592180-85f173990554?w=240&h=180&fit=crop';
const defaultInventoryCategories = ['Stock items', 'Fresh ingredients', 'Bakery', 'Cold storage', 'Packaging', 'Beverages'];
const defaultStorageLocations = ['Stock sheet', 'Back freezer', 'Fridge', 'Sandwich shelf', 'Pizza shelf', 'Burger shelf'];
const emptyForm = { name: '', quantity: '', unit: 'kg', threshold: '0', supplier: '', imageUrl: '', category: 'Stock items', sku: '', unitCost: '', purchaseUnit: 'kg', purchaseUnitFactor: '1', purchaseUnitCost: '', expiryDate: '', storageLocation: 'Stock sheet', deliveryDate: '', backFreezerChiller: '0', refrigerator: '0', frontSandwich: '0', frontPizza: '0', frontBurger: '0', reinterpretUnit: false, confirmUnitReinterpretation: false };
const normalizeOptionList = (items, fallback) => (Array.isArray(items) && items.length ? items.map((item) => typeof item === 'string' ? { id: null, name: item } : { id: item.id ?? null, name: item.name || item.value || '' }).filter((item) => item.name) : fallback.map((name) => ({ id: null, name })));

function daysUntil(date) {
  if (!date) return null;
  return Math.ceil((new Date(`${date}T23:59:59`) - new Date()) / 86400000);
}

function isLowStock(item) {
  const quantity = Number(item.quantity);
  const threshold = Number(item.threshold);
  return Number.isFinite(quantity) && Number.isFinite(threshold) && quantity <= threshold;
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

export default function InventoryPage({ embedded = false }) {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showLowStock, setShowLowStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditItem, setAuditItem] = useState(null);
  const [auditRows, setAuditRows] = useState([]);
  const [purchaseRows, setPurchaseRows] = useState([]);
  const [movementRows, setMovementRows] = useState([]);
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustment, setAdjustment] = useState({ amount: '', reason: 'Stock received' });
  const [inventoryCategories, setInventoryCategories] = useState(normalizeOptionList(defaultInventoryCategories, defaultInventoryCategories));
  const [inventoryStorageLocations, setInventoryStorageLocations] = useState(normalizeOptionList(defaultStorageLocations, defaultStorageLocations));
  const [optionEditor, setOptionEditor] = useState(null);
  const [optionValue, setOptionValue] = useState('');
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeNotice, setIntakeNotice] = useState('');

  const loadInventoryOptions = async () => {
    try {
      const [categoriesData, locationsData] = await Promise.all([
        api.getInventoryCategories().catch(() => []),
        api.getInventoryStorageLocations().catch(() => []),
      ]);
      setInventoryCategories(normalizeOptionList(categoriesData, defaultInventoryCategories));
      setInventoryStorageLocations(normalizeOptionList(locationsData, defaultStorageLocations));
    } catch {
      setInventoryCategories(normalizeOptionList(defaultInventoryCategories, defaultInventoryCategories));
      setInventoryStorageLocations(normalizeOptionList(defaultStorageLocations, defaultStorageLocations));
    }
  };

  const load = () => api.getInventory().then(setItems).catch((err) => setError(err.message || 'Unable to load inventory.')).finally(() => setLoading(false));
  useEffect(() => { load(); loadInventoryOptions(); }, []);
  useWebSocket((event) => {
    if (event === 'inventory:updated') load();
  });

  const lowStock = items.filter(isLowStock);
  const expiringSoon = items.filter((item) => { const days = daysUntil(item.expiryDate); return days !== null && days <= 7; });
  const stockValue = items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitCost || 0)), 0);
  const categories = useMemo(() => ['all', ...new Set(items.map((item) => item.category || 'ingredients'))], [items]);
  const filteredItems = items.filter((item) => {
    const text = `${item.name} ${item.supplier} ${item.sku}`.toLowerCase();
    return (!showLowStock || isLowStock(item))
      && (category === 'all' || (item.category || 'ingredients') === category)
      && text.includes(search.toLowerCase());
  });

  const openAdd = () => { setEditingItem(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (item) => { setEditingItem(item); setForm({ ...emptyForm, ...item, quantity: String(item.quantity), threshold: String(item.threshold), unitCost: String(item.unitCost || ''), purchaseUnit: item.purchaseUnit || item.unit, purchaseUnitFactor: String(item.purchaseUnitFactor || 1), purchaseUnitCost: String(item.purchaseUnitCost || 0), backFreezerChiller: String(item.backFreezerChiller || 0), refrigerator: String(item.refrigerator || 0), frontSandwich: String(item.frontSandwich || 0), frontPizza: String(item.frontPizza || 0), frontBurger: String(item.frontBurger || 0) }); setShowModal(true); };
  const changeBaseUnit = (nextUnit) => {
    if (!editingItem) {
      setForm((current) => ({ ...current, unit: nextUnit, purchaseUnit: current.purchaseUnit === current.unit ? nextUnit : current.purchaseUnit }));
      return;
    }
    const sourceUnit = form.reinterpretUnit ? editingItem.unit : form.unit;
    const conversionFactor = getStockUnitConversionFactor(sourceUnit, nextUnit);
    if (conversionFactor === null) {
      setError('');
      setForm((current) => ({ ...current, unit: nextUnit, reinterpretUnit: true, confirmUnitReinterpretation: false }));
      return;
    }
    setError('');
    setForm((current) => ({
      ...current,
      unit: nextUnit,
      reinterpretUnit: false,
      confirmUnitReinterpretation: false,
      quantity: String(Number(current.quantity || 0) * conversionFactor),
      threshold: String(Number(current.threshold || 0) * conversionFactor),
      backFreezerChiller: String(Number(current.backFreezerChiller || 0) * conversionFactor),
      refrigerator: String(Number(current.refrigerator || 0) * conversionFactor),
      frontSandwich: String(Number(current.frontSandwich || 0) * conversionFactor),
      frontPizza: String(Number(current.frontPizza || 0) * conversionFactor),
      frontBurger: String(Number(current.frontBurger || 0) * conversionFactor),
      purchaseUnitFactor: String(Number(current.purchaseUnitFactor || 1) * conversionFactor),
      unitCost: String(Number(current.unitCost || 0) / conversionFactor),
    }));
  };
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
      const [changes, purchases, movements] = await Promise.all([
        api.getInventoryAudit(item.id),
        api.getInventoryPurchaseHistory(item.id),
        api.getInventoryMovements(item.id),
      ]);
      setAuditRows(changes);
      setPurchaseRows(purchases);
      setMovementRows(movements);
    } catch (err) {
      setError(err.message || 'Unable to load inventory and purchase history.');
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
    try {
      const payload = {
        ...form,
        reinterpretUnit: Boolean(form.reinterpretUnit && form.confirmUnitReinterpretation),
        quantity: Number(form.quantity),
        threshold: Number(form.threshold),
        unitCost: Number(form.unitCost) || 0,
        purchaseUnitFactor: Number(form.purchaseUnitFactor) || 1,
        purchaseUnitCost: Number(form.purchaseUnitCost) || 0,
        backFreezerChiller: Number(form.backFreezerChiller) || 0,
        refrigerator: Number(form.refrigerator) || 0,
        frontSandwich: Number(form.frontSandwich) || 0,
        frontPizza: Number(form.frontPizza) || 0,
        frontBurger: Number(form.frontBurger) || 0,
        unit: String(form.unit || 'kg').trim() || 'kg',
      };
      if (form.reinterpretUnit && !form.confirmUnitReinterpretation) {
        setError(`Confirm that ${editingItem.unit} was the wrong unit label and that existing quantities should remain unchanged as ${form.unit}.`);
        return;
      }
      if (editingItem) await api.updateInventory(editingItem.id, payload);
      else await api.createInventory(payload);
      closeModal();
      setError('');
      load();
    } catch (err) {
      setError(err.message || 'Unable to save inventory item.');
    }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete ${item.name}? This removes it from inventory tracking.`)) return;
    try {
      await api.deleteInventory(item.id);
      setError('');
      load();
    } catch (err) {
      setError(err.message || 'Unable to delete inventory item.');
    }
  };

  const openOptionManager = (kind, value = null) => {
    const options = kind === 'category' ? inventoryCategories : inventoryStorageLocations;
    const selected = value && typeof value === 'object' ? value : (options.find((entry) => entry.name === value) ?? null);
    setOptionEditor({ kind, mode: selected ? 'edit' : 'add', id: selected?.id ?? null, oldName: selected?.name || '', name: selected?.name || value || '' });
    setOptionValue(selected?.name || value || '');
    if (!selected && !options.length) {
      setOptionValue(kind === 'category' ? 'Stock items' : 'Stock sheet');
    }
  };

  const saveOption = async () => {
    const trimmed = optionValue.trim();
    if (!trimmed || !optionEditor) return;
    try {
      if (optionEditor.kind === 'category') {
        if (optionEditor.mode === 'edit' && optionEditor.id) await api.updateInventoryCategory(optionEditor.id, { name: trimmed });
        else await api.createInventoryCategory({ name: trimmed });
        setForm((current) => ({
          ...current,
          category: optionEditor.mode === 'add' || current.category === optionEditor.oldName ? trimmed : current.category,
        }));
      } else {
        if (optionEditor.mode === 'edit' && optionEditor.id) await api.updateInventoryStorageLocation(optionEditor.id, { name: trimmed });
        else await api.createInventoryStorageLocation({ name: trimmed });
      }
      await loadInventoryOptions();
      if (optionEditor.kind === 'category' && optionEditor.mode === 'edit') await load();
      setOptionEditor(null);
      setOptionValue('');
    } catch (err) {
      setError(err.message || 'Unable to save inventory option.');
    }
  };

  const deleteOption = async (kind, option) => {
    if (!option || !window.confirm(`Delete ${option.name || option}?`)) return;
    try {
      if (kind === 'category') {
        await api.deleteInventoryCategory(option.id ?? option);
        const fallback = option.name.toLowerCase() === 'stock items' ? 'Fresh ingredients' : 'Stock items';
        setForm((current) => current.category === option.name ? { ...current, category: fallback } : current);
      } else await api.deleteInventoryStorageLocation(option.id ?? option);
      await loadInventoryOptions();
      if (kind === 'category') await load();
    } catch (err) {
      setError(err.message || 'Unable to delete inventory option.');
    }
  };

  const updateSheetField = async (item, field, value) => {
    const nextItem = { ...item, [field]: value };
    try {
      const updated = await api.updateInventory(item.id, { [field]: field === 'deliveryDate' ? value : Number(value) || 0 });
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      setError('');
    } catch (updateError) {
      setError(updateError.message || 'Unable to update inventory count.');
      load();
    }
  };

  const downloadInventoryImage = async (item) => {
    if (!item.imageUrl) return;
    try {
      await downloadAsset(item.imageUrl, `wrap-roll-inventory-${item.name}`);
    } catch (downloadError) {
      setError(downloadError.message || 'Unable to download this image.');
    }
  };

  const scanButton = <Button size="sm" variant="secondary" onClick={() => { setIntakeNotice(''); setIntakeOpen(true); }}><ScanLine size={14} /> Scan / Receive</Button>;
  const handleIntakeComplete = (notice) => { setIntakeOpen(false); setIntakeNotice(notice); setError(''); load(); };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading inventory...</div>;

  return (
    <div className={'inventory-page ' + (embedded ? '' : 'p-4 sm:p-6')}>
      {!embedded && <PageHeader title="Inventory Management" subtitle="Track stock levels, suppliers, expiry dates, and storage locations" actions={<div className="flex gap-2">{scanButton}<Button size="sm" onClick={openAdd}><Plus size={14} /> Add Item</Button></div>} />}
      {embedded && <div className="mb-4 flex justify-end gap-2">{scanButton}<Button size="sm" onClick={openAdd}><Plus size={14} /> Add Item</Button></div>}

      {intakeNotice && <div className="mb-4 flex items-center justify-between rounded-xl border border-success/20 bg-success/5 p-3 text-sm text-success"><span>{intakeNotice}</span><button onClick={() => setIntakeNotice('')}><X size={16} /></button></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Package size={19} className="text-primary" /></div><div><p className="text-xs text-surface-on-variant">Total items</p><p className="text-xl font-bold">{items.length}</p><p className="text-[10px] text-surface-on-variant">Across all stores</p></div></div>
        <button type="button" aria-pressed={showLowStock} onClick={() => { setShowLowStock((active) => !active); setCategory('all'); setSearch(''); }} className={'card flex w-full items-center gap-3 text-left transition-colors ' + (showLowStock ? 'ring-2 ring-error/30 bg-error/[0.03]' : 'hover:bg-error/[0.02]')}><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-error/10"><AlertTriangle size={19} className="text-error" /></div><div><p className="text-xs text-surface-on-variant">Low stock</p><p className="text-xl font-bold text-error">{lowStock.length}</p><p className="text-[10px] text-surface-on-variant">{showLowStock ? 'Tap to show all items' : 'Tap to view items'}</p></div></button>
        <div className="card flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10"><CalendarClock size={19} className="text-warning" /></div><div><p className="text-xs text-surface-on-variant">Expiring soon</p><p className="text-xl font-bold text-warning">{expiringSoon.length}</p><p className="text-[10px] text-surface-on-variant">Within 7 days</p></div></div>
        <div className="card flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10"><Truck size={19} className="text-success" /></div><div><p className="text-xs text-surface-on-variant">Stock value</p><p className="text-xl font-bold text-success">{formatCurrency(stockValue)}</p><p className="text-[10px] text-surface-on-variant">Estimated cost</p></div></div>
      </div>

      <div className="mb-4 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full shrink-0 lg:w-72"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, SKU, supplier..." className="input-field w-full pl-9" /></div><div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 lg:pl-2">{categories.map((entry) => <button key={entry} onClick={() => setCategory(entry)} className={'shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-semibold capitalize ' + (category === entry ? 'bg-primary text-white' : 'bg-white text-surface-on hover:bg-surface-container')}>{entry}</button>)}</div></div>
      {showLowStock && <p className="mb-3 text-xs font-semibold text-error" role="status">Showing {filteredItems.length} low-stock item{filteredItems.length === 1 ? '' : 's'} at or below the reorder threshold.</p>}
      {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-error/20 bg-error/5 p-3 text-sm text-error"><span>{error}</span><button onClick={() => { setError(''); load(); }}><X size={16} /></button></div>}

      <div className="hidden overflow-x-auto rounded-2xl border border-outline-variant bg-white shadow-sm">
        <table className="w-full min-w-[1120px] border-collapse text-left text-xs">
          <thead className="bg-surface-container text-[10px] uppercase tracking-wide text-surface-on-variant"><tr><th className="border-b border-outline-variant px-3 py-3">Item type</th><th className="border-b border-outline-variant px-3 py-3">Delivery date</th><th className="border-b border-outline-variant px-3 py-3">Quantity</th><th className="border-b border-outline-variant px-3 py-3">Back / freezer / chiller</th><th className="border-b border-outline-variant px-3 py-3">Refrigerator</th><th className="border-b border-outline-variant px-3 py-3">Front sandwich</th><th className="border-b border-outline-variant px-3 py-3">Front pizza</th><th className="border-b border-outline-variant px-3 py-3">Front burger</th><th className="border-b border-outline-variant px-3 py-3">Total</th><th className="border-b border-outline-variant px-3 py-3" aria-label="Actions" /></tr></thead>
          <tbody>{filteredItems.map((item) => <tr key={item.id} className="border-b border-outline-variant/60 last:border-b-0 hover:bg-surface-container-low"><td className="px-3 py-2"><button className="text-left font-semibold text-primary hover:underline" onClick={() => openEdit(item)}>{item.name}<span className="mt-0.5 block text-[10px] font-normal capitalize text-surface-on-variant">{item.category || 'Stock items'}</span></button></td><td className="px-3 py-2"><input aria-label={`${item.name} delivery date`} type="date" defaultValue={item.deliveryDate} onBlur={(event) => updateSheetField(item, 'deliveryDate', event.target.value)} className="input-field w-32 px-2 py-1 text-xs" /></td><td className="px-3 py-2"><input aria-label={`${item.name} quantity`} type="number" step="any" defaultValue={item.quantity} onBlur={(event) => updateSheetField(item, 'quantity', event.target.value)} className="input-field w-20 px-2 py-1 text-xs" /></td><td className="px-3 py-2"><input aria-label={`${item.name} back freezer chiller`} type="number" step="any" defaultValue={item.backFreezerChiller} onBlur={(event) => updateSheetField(item, 'backFreezerChiller', event.target.value)} className="input-field w-20 px-2 py-1 text-xs" /></td><td className="px-3 py-2"><input aria-label={`${item.name} refrigerator`} type="number" step="any" defaultValue={item.refrigerator} onBlur={(event) => updateSheetField(item, 'refrigerator', event.target.value)} className="input-field w-20 px-2 py-1 text-xs" /></td><td className="px-3 py-2"><input aria-label={`${item.name} front sandwich`} type="number" step="any" defaultValue={item.frontSandwich} onBlur={(event) => updateSheetField(item, 'frontSandwich', event.target.value)} className="input-field w-20 px-2 py-1 text-xs" /></td><td className="px-3 py-2"><input aria-label={`${item.name} front pizza`} type="number" step="any" defaultValue={item.frontPizza} onBlur={(event) => updateSheetField(item, 'frontPizza', event.target.value)} className="input-field w-20 px-2 py-1 text-xs" /></td><td className="px-3 py-2"><input aria-label={`${item.name} front burger`} type="number" step="any" defaultValue={item.frontBurger} onBlur={(event) => updateSheetField(item, 'frontBurger', event.target.value)} className="input-field w-20 px-2 py-1 text-xs" /></td><td className="px-3 py-2 text-base font-bold text-primary">{item.total}</td><td className="px-3 py-2"><button title="Edit inventory item" onClick={() => openEdit(item)} className="rounded-lg p-2 hover:bg-surface-container"><Edit3 size={15} className="text-surface-on-variant" /></button></td></tr>)}{!filteredItems.length && <tr><td colSpan="10" className="p-10 text-center text-sm text-surface-on-variant">{showLowStock ? 'No low-stock inventory items.' : 'No inventory items match your filters.'}</td></tr>}</tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {filteredItems.map((item) => {
          const isLow = isLowStock(item);
          const expiryDays = daysUntil(item.expiryDate);
          const isExpiring = expiryDays !== null && expiryDays <= 7;
          const stockPercent = Math.min(100, (item.quantity / Math.max(item.threshold * 2, 1)) * 100);
          const itemStockValue = Number(item.quantity || 0) * Number(item.unitCost || 0);
          return <article key={item.id} className={'rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ' + (isLow ? 'border-error/25 bg-error/[0.02]' : 'border-outline-variant')}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3"><img src={item.imageUrl || fallbackImage} alt={item.name} className="h-14 w-16 shrink-0 rounded-xl object-cover" onError={(event) => { event.currentTarget.src = fallbackImage; }} /><div className="min-w-0"><h3 className="truncate text-sm font-bold">{item.name}</h3><p className="mt-0.5 text-[10px] uppercase tracking-wide text-surface-on-variant">{item.sku || `INV-${String(item.id).padStart(3, '0')}`}</p><p className="text-xs capitalize text-surface-on-variant">{item.category || 'ingredients'}</p></div></div>
              <Badge variant={isLow ? 'red' : 'green'}>{isLow ? 'Low Stock' : 'In Stock'}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div><p className="text-surface-on-variant">Stock level</p><p className={'mt-1 text-lg font-bold ' + (isLow ? 'text-error' : '')}>{item.quantity} <span className="text-xs font-normal text-surface-on-variant">{item.unit}</span></p><div className="mt-1 h-1.5 rounded-full bg-surface-container"><div className={'h-1.5 rounded-full ' + (isLow ? 'bg-error' : 'bg-success')} style={{ width: `${stockPercent}%` }} /></div><p className="mt-3 text-surface-on-variant">Available stock value</p><p className="mt-1 text-sm font-bold text-primary">{formatCurrency(itemStockValue)}</p></div>
              <div><p className="text-surface-on-variant">Threshold</p><p className="mt-1 font-semibold">{item.threshold} {item.unit}</p><p className="mt-3 text-surface-on-variant">Moving-average cost per {item.unit}</p><p className="mt-1 font-semibold">{formatCurrency(item.unitCost || 0)}</p></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-outline-variant/60 pt-3 text-xs"><div><p className="text-surface-on-variant">Supplier</p><p className="mt-1 font-semibold">{item.supplier || 'Not assigned'}</p><p className="mt-3 text-surface-on-variant">Location</p><p className="mt-1 inline-flex items-center gap-1 font-semibold"><MapPin size={12} />{item.storageLocation || 'Main store'}</p></div><div><p className="text-surface-on-variant">Expiry</p><p className={'mt-1 font-semibold ' + (isExpiring ? 'text-warning' : '')}>{item.expiryDate || 'No expiry'}</p>{isExpiring && <p className="mt-1 text-warning">{expiryDays < 0 ? 'Expired' : `${expiryDays} days left`}</p>}</div></div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-outline-variant/60 pt-3 text-xs">
              <div>
                <p className="text-surface-on-variant">Delivery date</p>
                <p className="mt-1 font-semibold">{item.deliveryDate || 'Not recorded'}</p>
                <p className="mt-3 text-surface-on-variant">Delivered quantity</p>
                <p className="mt-1 font-semibold">{item.quantity} {item.unit}</p>
              </div>
              <div>
                <p className="text-surface-on-variant">Storage counts ({item.unit})</p>
                <p className="mt-1 leading-5 text-surface-on-variant">Back/freezer/chiller <strong className="text-surface-on">{item.backFreezerChiller}</strong> · Refrigerator <strong className="text-surface-on">{item.refrigerator}</strong></p>
                <p className="leading-5 text-surface-on-variant">Sandwich <strong className="text-surface-on">{item.frontSandwich}</strong> · Pizza <strong className="text-surface-on">{item.frontPizza}</strong> · Burger <strong className="text-surface-on">{item.frontBurger}</strong></p>
                <p className="mt-1 font-bold text-primary">Assigned: {item.total} {item.unit}</p>
                <p className="font-semibold text-surface-on-variant">Unassigned: {item.unassigned} {item.unit}</p>
                {item.storageOverAssigned && <p className="mt-1 font-semibold text-error">Location counts exceed on-hand stock; correct counts.</p>}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-1 border-t border-outline-variant/60 pt-3"><button title="Download inventory image" onClick={() => downloadInventoryImage(item)} disabled={!item.imageUrl} className="rounded-lg p-2 hover:bg-surface-container disabled:opacity-30"><Download size={15} className="text-surface-on-variant" /></button><button title="Adjust stock" onClick={() => openAdjust(item)} className="rounded-lg p-2 hover:bg-surface-container"><SlidersHorizontal size={15} className="text-surface-on-variant" /></button><button title="View inventory history" onClick={() => openAudit(item)} className="rounded-lg p-2 hover:bg-surface-container"><History size={15} className="text-surface-on-variant" /></button><button title="Edit inventory item" onClick={() => openEdit(item)} className="rounded-lg p-2 hover:bg-surface-container"><Edit3 size={15} className="text-surface-on-variant" /></button><button title="Delete inventory item" onClick={() => deleteItem(item)} className="rounded-lg p-2 text-error hover:bg-error/5"><Trash2 size={15} /></button></div>
          </article>;
        })}
        {!filteredItems.length && <div className="rounded-2xl border border-dashed border-outline-variant p-10 text-center text-sm text-surface-on-variant xl:col-span-5">{showLowStock ? 'No low-stock inventory items.' : 'No inventory items match your filters.'}</div>}
      </div>

      <Modal isOpen={showModal} onClose={closeModal} title={editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Item Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="SKU" placeholder="INV-001" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={`On-hand quantity (${form.unit})`} type="number" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            <label className="block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">Base stock unit
              <select className="input-field mt-1 w-full" value={form.unit} onChange={(e) => changeBaseUnit(e.target.value)}>
                {!stockUnitOptions.includes(form.unit) && <option value={form.unit}>{form.unit} (current)</option>}
                {stockUnitGroups.map((group) => <optgroup key={group.label} label={group.label}>
                  {group.units.map((option) => <option key={option} value={option}>{option}</option>)}
                </optgroup>)}
              </select>
            </label>
          </div>
          {editingItem && <p className="text-[11px] text-surface-on-variant">Compatible unit changes automatically convert stock, thresholds, storage counts, purchase quantities, and unit cost.</p>}
          {editingItem && form.reinterpretUnit && <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-bold">You selected {form.unit}, which cannot be converted from {editingItem.unit}.</p>
            <p className="mt-1">This correction will keep the current number of stock units, storage counts, threshold, and unit cost unchanged, and reset the purchase unit to {form.unit}. Only confirm if the old unit label was entered incorrectly.</p>
            <label className="mt-2 flex items-start gap-2 font-semibold"><input type="checkbox" checked={form.confirmUnitReinterpretation} onChange={(event) => setForm((current) => ({ ...current, confirmUnitReinterpretation: event.target.checked }))} className="mt-0.5 accent-primary" />I confirm this is a unit-label correction, not a physical unit conversion.</label>
          </div>}
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-surface-on">Purchase pack and cost</p>
            <p className="mt-1 text-[11px] text-surface-on-variant">Stock is tracked in the base unit; set how much one purchased pack adds. Example: one 1 kg bag = 1,000 g. For existing stock, record each delivery through receipt intake to update the moving average and keep supplier price history.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Input label="Purchase unit (bag, case, bottle)" value={form.purchaseUnit} onChange={(e) => setForm({ ...form, purchaseUnit: e.target.value })} />
              <Input label={`Base ${form.unit} per purchase unit`} type="number" min="0.000001" step="any" value={form.purchaseUnitFactor} onChange={(e) => setForm({ ...form, purchaseUnitFactor: e.target.value })} />
              <Input label="Latest purchase pack cost (TZS)" type="number" min="0" step="any" disabled={Boolean(editingItem)} value={form.purchaseUnitCost} onChange={(e) => setForm({ ...form, purchaseUnitCost: e.target.value })} />
              <Input
                label={`${editingItem ? 'Current moving-average' : 'Initial'} cost per ${form.unit} (TZS)`}
                type="number"
                min="0"
                step="any"
                disabled={Boolean(editingItem) || (Number(form.purchaseUnitCost) > 0 && Number(form.purchaseUnitFactor) > 0)}
                value={editingItem
                  ? form.unitCost
                  : Number(form.purchaseUnitCost) > 0 && Number(form.purchaseUnitFactor) > 0
                    ? String(Number(form.purchaseUnitCost) / Number(form.purchaseUnitFactor))
                    : form.unitCost}
                onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={`Low-stock threshold (${form.unit})`} type="number" min="0" step="any" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
            <Input label="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Storage location note" value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} />
            <Input label="Expiry date" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">Category</label>
            <div className="mt-1 flex gap-2">
              <select className="input-field min-w-0 flex-1" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {form.category && !inventoryCategories.some((entry) => entry.name === form.category) && <option value={form.category}>{form.category}</option>}
                {inventoryCategories.map((entry) => <option key={entry.id ?? entry.name} value={entry.name}>{entry.name}</option>)}
              </select>
              <button type="button" onClick={() => openOptionManager('category')} aria-label="Manage inventory categories" title="Manage categories" className="shrink-0 rounded-lg border border-outline-variant px-3 text-primary hover:bg-primary/5"><SlidersHorizontal size={16} /></button>
            </div>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-surface-on">Storage counts ({form.unit})</p>
            <p className="mt-1 text-[11px] text-surface-on-variant">Assigned counts must add up to no more than on-hand quantity. The difference is tracked as unassigned stock.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Input label="Back / freezer / chiller" type="number" min="0" step="any" value={form.backFreezerChiller} onChange={(e) => setForm({ ...form, backFreezerChiller: e.target.value })} />
              <Input label="Refrigerator" type="number" min="0" step="any" value={form.refrigerator} onChange={(e) => setForm({ ...form, refrigerator: e.target.value })} />
              <Input label="Front sandwich" type="number" min="0" step="any" value={form.frontSandwich} onChange={(e) => setForm({ ...form, frontSandwich: e.target.value })} />
              <Input label="Front pizza" type="number" min="0" step="any" value={form.frontPizza} onChange={(e) => setForm({ ...form, frontPizza: e.target.value })} />
              <Input label="Front burger" type="number" min="0" step="any" value={form.frontBurger} onChange={(e) => setForm({ ...form, frontBurger: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">Import photo</label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/5">
              <Upload size={16} />{form.imageUrl ? 'Replace photo' : 'Choose photo'}
              <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} />
            </label>
          </div>
          {form.imageUrl && <img src={form.imageUrl} alt="Inventory preview" className="h-32 w-full rounded-xl object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={closeModal} className="flex-1">Cancel</Button>
            <Button onClick={save} className="flex-1">{editingItem ? 'Save Changes' : 'Add Item'}</Button>
          </div>
        </div>
      </Modal>
      <Modal isOpen={adjustItem !== null} onClose={() => setAdjustItem(null)} title={adjustItem ? `Adjust ${adjustItem.name}` : 'Adjust stock'}><div className="space-y-4"><p className="text-sm text-surface-on-variant">Current stock: <strong>{adjustItem?.quantity} {adjustItem?.unit}</strong></p><Input label="Quantity change (+ receive, - remove)" type="number" step="any" value={adjustment.amount} onChange={(e) => setAdjustment({ ...adjustment, amount: e.target.value })} placeholder="e.g. 12 or -2" /><label className="block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">Reason<select className="input-field mt-1" value={adjustment.reason} onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })}><option>Stock received</option><option>Wastage</option><option>Damaged goods</option><option>Stock count correction</option><option>Transfer</option></select></label><div className="flex gap-3"><Button variant="secondary" onClick={() => setAdjustItem(null)} className="flex-1">Cancel</Button><Button onClick={saveAdjustment} className="flex-1">Record adjustment</Button></div></div></Modal>
      <Modal isOpen={auditItem !== null} onClose={() => setAuditItem(null)} title={auditItem ? `${auditItem.name} history` : 'Inventory history'}>
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-sm font-bold">Stock movement ledger</h3>
            <p className="mb-3 text-xs text-surface-on-variant">Sales usage, receipts, wastage, manual adjustments, unit corrections, and confirmed shift counts. Order IDs are shown for sales. Earlier activity remains in Inventory changes below.</p>
            {movementRows.length === 0 ? <p className="text-sm text-surface-on-variant">No unified movements recorded yet. New activity will appear here.</p> : (
              <div className="max-h-80 space-y-2 overflow-auto">
                {movementRows.map((row) => <article key={row.id} className="rounded-xl border border-outline-variant/60 bg-surface-container-low p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{String(row.movementType).replace(/_/g, ' ')}</p>
                      <p className="mt-1 break-words text-xs text-surface-on-variant">{row.note || 'No details recorded'}</p>
                      {row.referenceId && <p className="mt-1 break-all text-[10px] text-surface-on-variant">{row.referenceType || 'Reference'}: {row.referenceId}</p>}
                    </div>
                    <p className={`shrink-0 text-right text-xs font-bold ${Number(row.quantityDelta) < 0 ? 'text-error' : 'text-success'}`}>
                      {Number(row.quantityDelta) > 0 ? '+' : ''}{Number(row.quantityDelta)} {row.unitAfter || row.unitBefore}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-outline-variant/60 pt-2 text-[10px] text-surface-on-variant">
                    <span>{row.actorName}</span>
                    <time>{new Date(row.createdAt).toLocaleString()}</time>
                    <span>{row.quantityBefore} → {row.quantityAfter} {row.unitAfter || row.unitBefore}</span>
                  </div>
                </article>)}
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-bold">Purchase price history</h3>
            <p className="mb-3 text-xs text-surface-on-variant">Each receipt retains its supplier and purchase price. On-hand inventory is valued at the moving weighted-average cost.</p>
            {purchaseRows.length === 0 ? <p className="text-sm text-surface-on-variant">No purchase receipts have been recorded for this item yet.</p> : (
              <div className="max-h-72 overflow-auto rounded-xl border border-outline-variant">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface-container-low text-surface-on-variant">
                    <tr><th className="p-2">Date / supplier</th><th className="p-2">Received</th><th className="p-2">Receipt price</th><th className="p-2">Avg cost after</th></tr>
                  </thead>
                  <tbody>
                    {purchaseRows.map((row) => (
                      <tr key={row.id} className="border-t border-outline-variant/60">
                        <td className="p-2"><p className="font-semibold">{row.purchaseDate}</p><p>{row.source === 'receipt' ? 'Receipt' : row.source === 'opening_stock' ? 'Opening stock' : 'Inventory entry'} · {row.supplier || 'Supplier not recorded'}{row.receiptRef ? ` · ${row.receiptRef}` : ''}</p></td>
                        <td className="p-2">{row.purchaseQuantity} {row.purchaseUnit}</td>
                        <td className="p-2">{formatCurrency(row.purchaseUnitCost)} / {row.purchaseUnit}</td>
                        <td className="p-2">{formatCurrency(row.newAverageCost)} / {row.baseUnit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-bold">Inventory changes</h3>
            {auditRows.length === 0 && <p className="text-sm text-surface-on-variant">No inventory changes recorded yet.</p>}
            <div className="max-h-64 space-y-3 overflow-auto">
              {auditRows.map((row) => <div key={row.id} className="rounded-xl border border-outline-variant/50 bg-surface-container-low p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold capitalize">{row.action}</p><p className="text-xs text-surface-on-variant">{row.changedByName || row.changed_by_name} · {row.changedByRole || row.changed_by_role || 'staff'}</p></div><time className="text-right text-[10px] text-surface-on-variant">{new Date(row.createdAt || row.created_at).toLocaleString()}</time></div><div className="mt-2 space-y-1">{Object.entries(row.changes || {}).map(([field, change]) => <p key={field} className="text-xs"><span className="font-semibold capitalize">{field.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}: </span>{String(change.from ?? 'none')} -&gt; {String(change.to ?? 'none')}</p>)}</div></div>)}
            </div>
          </section>
        </div>
      </Modal>
      <Modal isOpen={!!optionEditor} onClose={() => setOptionEditor(null)} title={optionEditor?.kind === 'category' ? 'Manage inventory categories' : 'Manage storage locations'}>
        <div className="space-y-4">
          <div className="space-y-2">
            {(optionEditor?.kind === 'category' ? inventoryCategories : inventoryStorageLocations).map((entry) => (
              <div key={entry.id ?? entry.name} className="flex items-center justify-between gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm">
                <span className="font-medium">{entry.name}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => openOptionManager(optionEditor.kind, entry)} className="rounded-lg border border-outline-variant px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-surface-on hover:bg-white">Edit</button>
                  <button type="button" onClick={() => deleteOption(optionEditor.kind, entry)} className="rounded-lg border border-error/20 bg-error/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-error hover:bg-error/10">Delete</button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-surface-on-variant">{optionEditor?.kind === 'category' ? 'Category name' : 'Storage location name'}</label>
            <input className="input-field w-full" value={optionValue} onChange={(e) => setOptionValue(e.target.value)} placeholder={optionEditor?.kind === 'category' ? 'e.g. Bakery' : 'e.g. Fridge'} />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { setOptionEditor(null); setOptionValue(''); }} className="flex-1">Cancel</Button>
            <Button onClick={saveOption} className="flex-1">{optionEditor?.mode === 'edit' ? 'Save' : 'Add'}</Button>
          </div>
        </div>
      </Modal>

      {intakeOpen && <ReceiptIntake inventory={items} onClose={() => setIntakeOpen(false)} onComplete={handleIntakeComplete} />}
    </div>
  );
}
