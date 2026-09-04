import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import importPhoto from '../../utils/importPhoto';
import {
  Plus,
  Edit3,
  Trash2,
  Search,
  Star,
  Eye,
  EyeOff,
  RotateCcw,
  Utensils,
  Layers3,
  Zap,
  Tag,
  FolderPlus,
  Upload,
} from 'lucide-react';

const DEFAULT_CATEGORIES = ['wraps', 'salads', 'rolls', 'pizzas', 'burgers', 'combos', 'sides', 'coffee', 'cold-drinks', 'soft-drinks'];

export default function MenuEditorPage() {
  const [items, setItems] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editItem, setEditItem] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showModifiers, setShowModifiers] = useState(false);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [customCategories, setCustomCategories] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [modifierForm, setModifierForm] = useState({ name: '', price: '', type: 'add' });
  const [modifierEditId, setModifierEditId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    category: 'wraps',
    image: '',
    prep_time_minutes: '8',
    popular: false,
    active: true,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingId, setSavingId] = useState(null);

  const loadMenu = () => {
    setLoadError('');
    return api
      .getMenu(true)
      .then(setItems)
      .catch((error) => setLoadError(error.message || 'Unable to load menu items.'))
      .finally(() => setLoading(false));
  };

  const loadModifiers = async () => {
    try {
      const rows = await api.getModifiers();
      setModifiers(rows || []);
    } catch (error) {
      setLoadError(error.message || 'Unable to load modifiers.');
    }
  };

  useEffect(() => {
    loadMenu();
    loadModifiers();
  }, []);

  // Compute all available categories from default, custom, and existing items
  const allCategories = Array.from(
    new Set([
      ...DEFAULT_CATEGORIES,
      ...customCategories,
      ...items.map((i) => i.category).filter(Boolean),
    ])
  );

  const filtered = items.filter((i) => {
    const matchesCategory = activeCategory === 'all' || i.category === activeCategory;
    const matchesSearch =
      !search.trim() ||
      `${i.name} ${i.description}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || (statusFilter === 'active' ? i.active : !i.active);
    return matchesCategory && matchesSearch && matchesStatus;
  });

  const openEdit = (item) => {
    setForm({
      name: item.name,
      description: item.description || '',
      price: String(item.price),
      category: item.category || 'wraps',
      image: item.image || '',
      prep_time_minutes: String(item.prep_time_minutes ?? 8),
      popular: item.popular,
      active: item.active,
    });
    setEditItem(item);
  };

  const saveEdit = async () => {
    if (!form.name || !form.price) return;
    await api.updateMenuItem(editItem.id, {
      name: form.name,
      description: form.description,
      price: parseFloat(form.price),
      category: form.category,
      image: form.image,
      prep_time_minutes: Number(form.prep_time_minutes || 8),
      popular: form.popular,
      active: form.active,
    });
    setEditItem(null);
    loadMenu();
  };

  const saveAdd = async () => {
    if (!form.name || !form.price) return;
    await api.createMenuItem({
      name: form.name,
      description: form.description,
      price: parseFloat(form.price),
      category: form.category,
      image: form.image,
      prep_time_minutes: Number(form.prep_time_minutes || 8),
      popular: form.popular,
    });
    setShowAdd(false);
    resetForm();
    loadMenu();
  };

  const saveModifier = async () => {
    if (!modifierForm.name?.trim()) return;
    const payload = {
      name: modifierForm.name.trim(),
      price: Number(modifierForm.price || 0),
      type: modifierForm.type,
    };

    if (modifierEditId) {
      await api.updateModifier(modifierEditId, payload);
    } else {
      await api.createModifier(payload);
    }

    setShowModifiers(true);
    setModifierForm({ name: '', price: '', type: 'add' });
    setModifierEditId(null);
    loadModifiers();
  };

  const deleteModifier = async (modifierId) => {
    await api.deleteModifier(modifierId);
    loadModifiers();
  };

  const doDelete = async () => {
    await api.deleteMenuItem(deleteConfirm.id);
    setDeleteConfirm(null);
    loadMenu();
  };

  const handleAddNewCategory = (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const cleanCat = newCategoryName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!customCategories.includes(cleanCat)) {
      setCustomCategories((prev) => [...prev, cleanCat]);
    }
    setForm((f) => ({ ...f, category: cleanCat }));
    setNewCategoryName('');
    setShowNewCategoryModal(false);
  };

  const resetForm = () =>
    setForm({
      name: '',
      description: '',
      price: '',
      category: 'wraps',
      image: '',
      prep_time_minutes: '8',
      popular: false,
      active: true,
    });

  const handlePhotoChange = async (event) => {
    try {
      const image = await importPhoto(event.target.files?.[0]);
      setForm((current) => ({ ...current, image }));
      setLoadError('');
    } catch (error) {
      setLoadError(error.message);
    } finally {
      event.target.value = '';
    }
  };

  const FormFields = ({ onSave, saveLabel }) => (
    <div className="space-y-4">
      <Input
        label="Item Name / Meal Title"
        placeholder="e.g. Signature Mega Wrap Meal"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <Input
        label="Description & Ingredients"
        placeholder="Brief description of flavors and ingredients"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Price (TZS)"
          type="number"
          placeholder="0"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
        <Input
          label="Prep Time (Minutes)"
          type="number"
          min="1"
          step="1"
          value={form.prep_time_minutes}
          onChange={(e) => setForm({ ...form, prep_time_minutes: e.target.value })}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-[#746e67] uppercase tracking-wider">
            Category
          </label>
          <button
            type="button"
            onClick={() => setShowNewCategoryModal(true)}
            className="text-[11px] font-bold text-[#ae002a] hover:underline flex items-center gap-1"
          >
            <Plus size={12} /> Add New Category
          </button>
        </div>
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-[#ebdccb] bg-white text-xs text-[#24211e] focus:outline-none focus:border-[#ae002a]"
        >
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-bold uppercase tracking-wider text-[#746e67]">Food Image</label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#ebdccb] px-4 py-3 text-sm font-semibold text-[#ae002a] hover:bg-[#ae002a]/5">
          <Upload size={16} /> {form.image ? 'Replace photo' : 'Upload image'}
          <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} />
        </label>
      </div>
      {form.image && (
        <div className="rounded-2xl border border-[#ebdccb] bg-[#fbf6ee] p-2">
          <p className="mb-2 text-xs font-bold text-[#746e67]">Photo Preview</p>
          <img
            src={form.image}
            alt="Preview"
            className="h-28 w-full rounded-xl object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#ebdccb] bg-white p-3 text-xs font-bold text-[#1f1d1b]">
          <input
            type="checkbox"
            checked={form.popular}
            onChange={(e) => setForm({ ...form, popular: e.target.checked })}
          />
          <Star size={15} className="text-[#e6ac29]" /> Featured on Front
        </label>
        {editItem && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#ebdccb] bg-white p-3 text-xs font-bold text-[#1f1d1b]">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            {form.active ? <Eye size={15} className="text-[#227653]" /> : <EyeOff size={15} className="text-[#ae002a]" />} Available Online
          </label>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          variant="secondary"
          onClick={() => {
            setEditItem(null);
            setShowAdd(false);
            resetForm();
          }}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button onClick={onSave} className="flex-1 bg-[#ae002a] text-white hover:bg-[#920023]">
          {saveLabel}
        </Button>
      </div>
    </div>
  );

  const toggleItem = async (item, field) => {
    setSavingId(`${item.id}-${field}`);
    try {
      const updated = await api.updateMenuItem(item.id, { [field]: !item[field] });
      setItems((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry))
      );
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-[#746e67]">Loading menu items...</div>;
  }

  const activeCount = items.filter((item) => item.active).length;
  const popularCount = items.filter((item) => item.popular).length;
  const categoryCount = new Set(items.map((item) => item.category)).size;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Menu & Food Options Editor"
        subtitle="Manage food items, customizable meal options, categories, and extra modifiers"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowNewCategoryModal(true)}
              className="border border-[#ebdccb]"
            >
              <FolderPlus size={14} /> + Category
            </Button>
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setShowAdd(true);
              }}
              className="bg-[#ae002a] text-white hover:bg-[#920023]"
            >
              <Plus size={14} /> Add Food Item
            </Button>
          </div>
        }
      />

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="bg-white border border-[#ebdccb] rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#faeee2] text-[#ae002a]">
            <Utensils size={18} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#746e67]">Total Items</p>
            <p className="text-xl font-bold text-[#1f1d1b]">{items.length}</p>
          </div>
        </div>

        <div className="bg-white border border-[#ebdccb] rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0f9f3] text-[#227653]">
            <Eye size={18} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#746e67]">Available Online</p>
            <p className="text-xl font-bold text-[#227653]">{activeCount}</p>
          </div>
        </div>

        <div className="bg-white border border-[#ebdccb] rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff9f0] text-[#e6ac29]">
            <Star size={18} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#746e67]">Featured Favorites</p>
            <p className="text-xl font-bold text-[#e6ac29]">{popularCount}</p>
          </div>
        </div>

        <div className="bg-white border border-[#ebdccb] rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fbf6ee] text-[#746e67]">
            <Layers3 size={18} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#746e67]">Menu Categories</p>
            <p className="text-xl font-bold text-[#1f1d1b]">{categoryCount}</p>
          </div>
        </div>
      </div>

      {/* Modifier Library Section */}
      <div className="bg-white border border-[#ebdccb] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#ae002a]">
              Modifiers &amp; Food Add-ons
            </p>
            <h2 className="text-base font-bold text-[#1f1d1b]">
              Extra toppings, sides, and diet removals
            </h2>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowModifiers((value) => !value)}
            className="border border-[#ebdccb]"
          >
            {showModifiers ? 'Hide Modifier Editor' : 'Manage Modifiers'}
          </Button>
        </div>

        {showModifiers && (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] pt-2 border-t border-[#eee4d5]">
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {modifiers.length === 0 ? (
                <p className="text-xs text-[#746e67]">No modifiers created yet.</p>
              ) : (
                modifiers.map((modifier) => (
                  <div
                    key={modifier.id}
                    className="flex items-center justify-between rounded-2xl border border-[#ebdccb] bg-[#fbf6ee] p-3"
                  >
                    <div>
                      <p className="font-bold text-xs text-[#1f1d1b]">{modifier.name}</p>
                      <p className="text-[10px] text-[#746e67]">
                        {modifier.type === 'remove' ? 'Diet Removal' : 'Add-on'} •{' '}
                        {formatCurrency(modifier.price || 0)}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        className="rounded-lg p-1.5 bg-white border border-[#ebdccb] hover:bg-[#faeee2] text-[#554e46]"
                        onClick={() => {
                          setModifierEditId(modifier.id);
                          setModifierForm({
                            name: modifier.name,
                            price: String(modifier.price || 0),
                            type: modifier.type || 'add',
                          });
                        }}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        className="rounded-lg p-1.5 bg-white border border-[#ebdccb] hover:bg-[#fff0f0] text-[#ae002a]"
                        onClick={() => deleteModifier(modifier.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-2xl border border-[#ebdccb] bg-[#fffdfa] p-4 space-y-3">
              <p className="text-xs font-bold text-[#1f1d1b]">
                {modifierEditId ? 'Edit Modifier' : 'Create New Modifier'}
              </p>
              <Input
                label="Modifier Name"
                placeholder="e.g. Extra Cheddar Cheese"
                value={modifierForm.name}
                onChange={(e) => setModifierForm({ ...modifierForm, name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Price (TZS)"
                  type="number"
                  placeholder="0"
                  value={modifierForm.price}
                  onChange={(e) => setModifierForm({ ...modifierForm, price: e.target.value })}
                />
                <div>
                  <label className="block text-xs font-bold text-[#746e67] uppercase mb-1">
                    Action Type
                  </label>
                  <select
                    value={modifierForm.type}
                    onChange={(e) => setModifierForm({ ...modifierForm, type: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#ebdccb] bg-white text-xs text-[#24211e]"
                  >
                    <option value="add">Add-on (+ Price)</option>
                    <option value="remove">Remove (No Price)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="secondary"
                  className="flex-1 text-xs"
                  onClick={() => {
                    setModifierEditId(null);
                    setModifierForm({ name: '', price: '', type: 'add' });
                  }}
                >
                  Clear
                </Button>
                <Button
                  className="flex-1 bg-[#ae002a] text-white hover:bg-[#920023] text-xs"
                  onClick={saveModifier}
                >
                  {modifierEditId ? 'Save Changes' : 'Create Modifier'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#746e67]"
          />
          <input
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-[#ebdccb] bg-white text-xs focus:outline-none focus:border-[#ae002a]"
            placeholder="Search menu items by title or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-[#ebdccb] bg-white text-xs text-[#24211e] w-full lg:w-44"
        >
          <option value="all">All Statuses</option>
          <option value="active">Online / Active</option>
          <option value="inactive">Hidden / Inactive</option>
        </select>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setActiveCategory('all')}
          className={
            'px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ' +
            (activeCategory === 'all'
              ? 'bg-[#ae002a] text-white shadow-sm'
              : 'bg-white border border-[#ebdccb] text-[#554e46] hover:bg-[#faeee2]')
          }
        >
          All Items ({items.length})
        </button>
        {allCategories.map((cat) => {
          const count = items.filter((i) => i.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={
                'px-3.5 py-1.5 rounded-full text-xs font-bold capitalize whitespace-nowrap transition-colors ' +
                (activeCategory === cat
                  ? 'bg-[#ae002a] text-white shadow-sm'
                  : 'bg-white border border-[#ebdccb] text-[#554e46] hover:bg-[#faeee2]')
              }
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#ae002a]/20 bg-[#fff5f5] p-3 text-xs text-[#ae002a]">
          <span>{loadError}</span>
          <Button size="sm" variant="secondary" onClick={loadMenu}>
            <RotateCcw size={14} /> Retry
          </Button>
        </div>
      )}

      {/* Items Table */}
      <div className="bg-white border border-[#ebdccb] rounded-3xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-[#ebdccb] bg-[#fbf6ee]">
              <th className="p-3.5 text-left text-xs font-bold uppercase text-[#746e67]">Food Item</th>
              <th className="p-3.5 text-left text-xs font-bold uppercase text-[#746e67]">Category</th>
              <th className="p-3.5 text-left text-xs font-bold uppercase text-[#746e67]">Price</th>
              <th className="p-3.5 text-left text-xs font-bold uppercase text-[#746e67]">Status</th>
              <th className="p-3.5 text-left text-xs font-bold uppercase text-[#746e67]">Quick Controls</th>
              <th className="p-3.5 text-right text-xs font-bold uppercase text-[#746e67]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length && !loadError && (
              <tr>
                <td colSpan="6" className="p-10 text-center text-xs text-[#746e67]">
                  No menu items match the current filters.
                </td>
              </tr>
            )}
            {filtered.map((item) => (
              <tr
                key={item.id}
                className="border-b border-[#eee4d5] hover:bg-[#fbf6ee]/50 transition-colors"
              >
                <td className="p-3.5">
                  <div className="flex items-center gap-3">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-11 w-11 rounded-xl object-cover border border-[#ebdccb]"
                      onError={(e) => {
                        e.currentTarget.src =
                          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop';
                      }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-[#1f1d1b]">{item.name}</p>
                      <p className="truncate text-[10px] text-[#746e67] max-w-xs">{item.description}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3.5">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#faeee2] text-[#ae002a] text-[10px] font-bold uppercase tracking-wider">
                    {item.category}
                  </span>
                </td>
                <td className="p-3.5 text-xs font-bold text-[#ae002a]">
                  {formatCurrency(item.price)}
                </td>
                <td className="p-3.5">
                  <span
                    className={
                      'px-2 py-0.5 rounded-full text-[10px] font-bold ' +
                      (item.active
                        ? item.popular
                          ? 'bg-[#fff9f0] text-[#775a00] border border-[#f5d777]'
                          : 'bg-[#f0f9f3] text-[#227653] border border-[#227653]/30'
                        : 'bg-[#fff5f5] text-[#ae002a] border border-[#ae002a]/30')
                    }
                  >
                    {item.active ? (item.popular ? 'Popular' : 'Active') : 'Hidden'}
                  </span>
                </td>
                <td className="p-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      title={item.active ? 'Hide from menu' : 'Show on menu'}
                      disabled={savingId === `${item.id}-active`}
                      onClick={() => toggleItem(item, 'active')}
                      className={
                        'inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-bold transition-colors border ' +
                        (item.active
                          ? 'bg-[#f0f9f3] text-[#227653] border-[#227653]/30'
                          : 'bg-white text-[#746e67] border-[#ebdccb]')
                      }
                    >
                      {item.active ? <Eye size={12} /> : <EyeOff size={12} />}
                      {item.active ? 'Online' : 'Hidden'}
                    </button>
                    <button
                      title={item.popular ? 'Unmark popular' : 'Mark popular'}
                      disabled={savingId === `${item.id}-popular`}
                      onClick={() => toggleItem(item, 'popular')}
                      className={
                        'inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-bold transition-colors border ' +
                        (item.popular
                          ? 'bg-[#fff9f0] text-[#775a00] border-[#f5d777]'
                          : 'bg-white text-[#746e67] border-[#ebdccb]')
                      }
                    >
                      <Zap size={12} /> {item.popular ? 'Featured' : 'Feature'}
                    </button>
                  </div>
                </td>
                <td className="p-3.5">
                  <div className="flex justify-end gap-1.5">
                    <button
                      title="Edit item"
                      className="p-1.5 rounded-xl bg-[#fbf6ee] hover:bg-[#faeee2] text-[#554e46] border border-[#ebdccb]"
                      onClick={() => openEdit(item)}
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      title="Delete item"
                      className="p-1.5 rounded-xl bg-[#fff5f5] hover:bg-[#ffe5e5] text-[#ae002a] border border-[#ae002a]/20"
                      onClick={() => setDeleteConfirm(item)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add New Category Modal */}
      <Modal
        isOpen={showNewCategoryModal}
        onClose={() => setShowNewCategoryModal(false)}
        title="Add Food Category"
      >
        <form onSubmit={handleAddNewCategory} className="space-y-4">
          <Input
            label="Category Name"
            placeholder="e.g. Combos, Platters, Desserts"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setShowNewCategoryModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-[#ae002a] text-white hover:bg-[#920023]">
              Add Category
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Item Modal */}
      <Modal
        isOpen={showAdd}
        onClose={() => {
          setShowAdd(false);
          resetForm();
        }}
        title="Add New Food Item / Meal"
      >
        <FormFields onSave={saveAdd} saveLabel="Create Food Item" />
      </Modal>

      {/* Edit Item Modal */}
      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title="Edit Menu Item">
        <FormFields onSave={saveEdit} saveLabel="Save Changes" />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Menu Item"
      >
        <div className="text-center space-y-4">
          <p className="text-xs text-[#554e46]">
            Are you sure you want to remove <strong>{deleteConfirm?.name}</strong> from the menu?
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setDeleteConfirm(null)}
              className="flex-1 text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={doDelete}
              className="flex-1 bg-[#ae002a] text-white hover:bg-[#920023] text-xs"
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

