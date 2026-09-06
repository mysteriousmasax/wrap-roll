import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';
import { formatCurrency } from '../../utils/format';
import importPhoto from '../../utils/importPhoto';
import { downloadAsset } from '../../utils/downloadAsset';
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
  Download,
  BookOpen,
  Smartphone,
  Tablet,
  Laptop,
  Monitor,
} from 'lucide-react';

const DEFAULT_CATEGORIES = ['wraps', 'salads', 'rolls', 'pizzas', 'burgers', 'combos', 'sides', 'coffee', 'cold-drinks', 'soft-drinks'];
const FALLBACK_MENU_IMAGE = 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&h=600&fit=crop';

function getSafeMenuImage(image) {
  if (typeof image !== 'string') return FALLBACK_MENU_IMAGE;
  const value = image.trim();
  return /^(https?:\/\/|\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(value)
    ? value
    : FALLBACK_MENU_IMAGE;
}

export default function MenuEditorPage() {
  const [items, setItems] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
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
  const [menuExporting, setMenuExporting] = useState('');
  const [showMenuPreview, setShowMenuPreview] = useState(false);
  const [previewFormat, setPreviewFormat] = useState('pdf');
  const [imagePreviewWidth, setImagePreviewWidth] = useState(390);

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

  useWebSocket((event) => {
    if (event === 'menu:updated') {
      loadMenu();
      loadModifiers();
    }
  });

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
    if (!deleteConfirm) return;
    try {
      await api.deleteMenuItem(deleteConfirm.id);
      setItems((current) => statusFilter === 'inactive'
        ? current.map((item) => item.id === deleteConfirm.id ? { ...item, active: false } : item)
        : current.filter((item) => item.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (error) {
      setLoadError(error.message || 'Unable to remove this menu item.');
    }
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
        <div className="rounded-2xl border border-[#ebdccb] bg-[#fbf6ee] p-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-[#292522]">Responsive image preview</p>
              <p className="mt-0.5 text-[10px] text-[#746e67]">Check the menu crop at common device widths.</p>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[#ae002a]">{imagePreviewWidth}px viewport</span>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              ['phone', 390, Smartphone],
              ['tablet', 768, Tablet],
              ['laptop', 1280, Laptop],
              ['desktop', 1440, Monitor],
            ].map(([label, width, Icon]) => (
              <button
                key={label}
                type="button"
                onClick={() => setImagePreviewWidth(width)}
                className={'inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold capitalize ' + (imagePreviewWidth === width ? 'border-[#ae002a] bg-[#ae002a] text-white' : 'border-[#ebdccb] bg-white text-[#746e67] hover:bg-[#faeee2]')}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min="320"
            max="1440"
            step="10"
            value={imagePreviewWidth}
            onChange={(event) => setImagePreviewWidth(Number(event.target.value))}
            className="mb-3 w-full accent-[#ae002a]"
            aria-label="Preview viewport width"
          />
          <div className="overflow-x-auto rounded-xl border border-[#d9c4b5] bg-[#e9ddd4] p-2">
            <div className="mx-auto min-w-[280px] max-w-full overflow-hidden rounded-lg bg-white shadow-sm" style={{ width: `${imagePreviewWidth}px` }}>
              <div className="relative aspect-[2/1] bg-[#ead8c9]">
                <img
                  src={getSafeMenuImage(form.image)}
                  alt="Food image responsive preview"
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
                <span className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1 text-[9px] font-bold text-white">Menu card crop</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-2.5">
                <span className="truncate text-[10px] font-bold text-[#292522]">{form.name || 'Food item name'}</span>
                <span className="shrink-0 text-[10px] font-bold text-[#ae002a]">{form.price ? formatCurrency(Number(form.price)) : 'TZS 0'}</span>
              </div>
            </div>
          </div>
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

  const exportMenuBook = async (format) => {
    if (menuExporting) return;
    setMenuExporting(format);
    try {
      const result = await api.exportMenuBook(format);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (error) {
      setLoadError(error.message || 'Unable to export the menu book.');
    } finally {
      setMenuExporting('');
    }
  };

  const downloadMenuImage = async (item) => {
    if (!item.image) return;
    try {
      await downloadAsset(item.image, `wrap-roll-${item.name}`);
    } catch (error) {
      setLoadError(error.message || 'Unable to download this image.');
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-[#746e67]">Loading menu items...</div>;
  }

  const activeCount = items.filter((item) => item.active).length;
  const popularCount = items.filter((item) => item.popular).length;
  const categoryCount = new Set(items.map((item) => item.category)).size;
  const previewGroups = items.filter((item) => item.active).reduce((groups, item) => {
    (groups[item.category || 'other'] ||= []).push(item);
    return groups;
  }, {});
  const previewFeaturedItem = items.find((item) => item.active && item.image) || items.find((item) => item.active);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Menu & Food Options Editor"
        subtitle="Manage food items, customizable meal options, categories, and extra modifiers"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-[#ebdccb] bg-white p-1">
              <span className="hidden items-center gap-1 px-2 text-[10px] font-bold uppercase tracking-wide text-[#746e67] sm:flex"><BookOpen size={13} /> Menu book</span>
              <button type="button" onClick={() => { setPreviewFormat('pdf'); setShowMenuPreview(true); }} className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-[#ae002a] hover:bg-[#faeee2]">Preview</button>
              {[
                ['pdf', 'PDF'],
                ['pptx', 'PPT'],
                ['xlsx', 'Excel'],
                ['docx', 'Word'],
              ].map(([format, label]) => <button key={format} type="button" onClick={() => exportMenuBook(format)} disabled={Boolean(menuExporting)} className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-[#ae002a] hover:bg-[#faeee2] disabled:opacity-50">{menuExporting === format ? '...' : label}</button>)}
            </div>
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

      <Modal isOpen={showMenuPreview} onClose={() => setShowMenuPreview(false)} title="Menu book preview" size="xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ebdccb] bg-[#fffaf4] p-2"><div className="flex gap-1">{[['pdf', 'PDF'], ['pptx', 'PowerPoint'], ['xlsx', 'Excel'], ['docx', 'Word']].map(([format, label]) => <button key={format} type="button" onClick={() => setPreviewFormat(format)} className={'rounded-lg px-3 py-2 text-[10px] font-bold transition-colors ' + (previewFormat === format ? 'bg-[#ae002a] text-white' : 'text-[#ae002a] hover:bg-[#faeee2]')}>{label}</button>)}</div><p className="px-2 text-[10px] text-[#786a62]">Preview matches the selected saved format</p></div>
        <div className="mb-4 rounded-xl border border-[#ead8c9] bg-white px-4 py-3"><p className="text-xs font-bold text-[#292522]">{previewFormat === 'pdf' ? 'Print-ready menu pages' : previewFormat === 'pptx' ? 'Presentation deck: cover plus category slides' : previewFormat === 'xlsx' ? 'Workbook preview: catalog sheet plus add-ons sheet' : 'Word document preview: branded headings and category tables'}</p><p className="mt-1 text-[10px] text-[#786a62]">Live active menu data · {items.filter((item) => item.active).length} available items · prices in TZS</p></div>
        <div className={'rounded-2xl p-3 sm:p-6 ' + (previewFormat === 'pptx' ? 'bg-[#292522]' : previewFormat === 'xlsx' ? 'bg-[#e9f1e7]' : previewFormat === 'docx' ? 'bg-[#e6e6e6]' : 'bg-[#302e2c]')}>
          <div className={'overflow-hidden rounded-sm bg-[#f7f3ec] shadow-[0_18px_45px_rgba(0,0,0,0.28)] ' + (previewFormat === 'xlsx' ? 'ring-4 ring-[#227653]/20' : previewFormat === 'docx' ? 'ring-4 ring-[#2d5b9c]/20' : previewFormat === 'pptx' ? 'ring-4 ring-[#e37b22]/20' : 'ring-4 ring-[#ae002a]/10')}>
            <section className="relative min-h-[520px] overflow-hidden bg-[#ae002a] px-6 py-10 text-white sm:px-14 sm:py-14">
              <div className="absolute right-5 top-8 h-[calc(100%-8rem)] w-[38%] overflow-hidden rounded-[48%_48%_10%_10%] border-8 border-white/90 shadow-2xl sm:right-12 sm:w-[34%]"><img src={getSafeMenuImage(previewFeaturedItem?.image)} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.src = FALLBACK_MENU_IMAGE; }} /></div>
              <div className="absolute inset-0 bg-gradient-to-r from-[#ae002a] via-[#ae002a]/95 to-[#ae002a]/25" />
              <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border-[34px] border-[#d99a22]/50" />
              <div className="relative flex h-full min-h-[420px] flex-col justify-between">
                <div className="flex items-start justify-between gap-4 border-b border-white/25 pb-5"><img src="/wrap-roll-logo-lockup-transparent.png" alt="Wrap & Roll" className="h-12 w-auto brightness-0 invert" /><span className="pt-2 text-right text-[9px] font-bold uppercase tracking-[0.28em] text-[#f8d887]">Dar es Salaam<br />2026 edition</span></div>
                <div className="max-w-xl py-14 pr-[28%] sm:pr-[24%]"><p className="text-xs font-bold uppercase tracking-[0.36em] text-[#f8d887]">The menu book</p><h2 className="mt-4 font-display text-5xl font-bold leading-[0.95] sm:text-7xl">Fresh food,<br /><span className="text-[#f8d887]">made your way.</span></h2><p className="mt-6 max-w-md text-sm leading-6 text-white/80">Wraps, rolls, salads, pizzas, burgers, combos, sides and drinks, prepared fresh for every order.</p></div>
                <div className="flex items-end justify-between gap-4 border-t border-white/25 pt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70"><span>Wikicha Tower · Mwai Kibaki Road</span><span>01 / Cover</span></div>
              </div>
            </section>
            <div className="space-y-5 bg-[#302e2c] p-3 sm:p-6">
              {Object.entries(previewGroups).map(([category, categoryItems], categoryIndex) => <section key={category} className="relative overflow-hidden bg-[#fffdf9] px-5 py-8 shadow-[0_8px_24px_rgba(0,0,0,0.16)] sm:px-10 sm:py-10">
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-[#ae002a]" />
                <div className="relative mb-6 flex items-end justify-between border-b-2 border-[#ae002a]/30 pb-3"><div><p className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#ae002a]">Wrap &amp; Roll · Section {String(categoryIndex + 1).padStart(2, '0')}</p><h3 className="mt-1 font-display text-3xl font-bold uppercase leading-none text-[#292522] sm:text-5xl">{category.replace(/-/g, ' ')}</h3></div><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ae002a]">{categoryItems.length} items</span></div>
                <div className="relative grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  {categoryItems.slice(0, 10).map((item) => <article key={item.id} className="flex min-h-[112px] min-w-0 gap-3 border-b border-dotted border-[#c9bbae] pb-4"><div className="h-20 w-20 shrink-0 overflow-hidden bg-[#eaded3] shadow-sm"><img src={getSafeMenuImage(item.image)} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.src = FALLBACK_MENU_IMAGE; }} /></div><div className="min-w-0 flex-1 pt-0.5"><div className="flex items-start gap-2"><h4 className="line-clamp-2 flex-1 text-[13px] font-black uppercase leading-5 text-[#292522]">{item.name}</h4><span className="shrink-0 text-[13px] font-black text-[#ae002a]">{formatCurrency(item.price)}</span></div><p className="mt-1 line-clamp-3 text-[10px] leading-4 text-[#786a62]">{item.description || 'Freshly prepared at Wrap & Roll.'}</p>{item.popular && <span className="mt-1 inline-block text-[9px] font-bold uppercase tracking-wide text-[#b47a13]">★ Favourite</span>}</div></article>)}
                </div>
                {categoryItems.length > 10 && <p className="relative mt-3 text-right text-[9px] font-bold text-[#ae002a]">+ {categoryItems.length - 10} more in the exported book</p>}
                <div className="relative mt-14 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.2em] text-white"><span>Always fresh</span><span>{String(categoryIndex + 2).padStart(2, '0')}</span></div>
              </section>)}
              <footer className="px-2 pb-2 pt-1 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-white/70">Wikicha Tower · Mwai Kibaki Road · Dar es Salaam · Prices in TZS · {previewFormat.toUpperCase()} preview</footer>
            </div>
          </div>
        </div>
      </Modal>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="bg-white border border-[#ebdccb] rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#faeee2] text-[#ae002a]">
            <Utensils size={18} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#746e67]">Catalog Items (including hidden)</p>
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

      {/* Food item grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!filtered.length && !loadError && (
          <div className="col-span-full rounded-3xl border border-dashed border-[#ebdccb] bg-white p-10 text-center text-xs text-[#746e67]">
            No menu items match the current filters.
          </div>
        )}
        {filtered.map((item) => (
          <article key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#ebdccb] bg-white shadow-sm transition-shadow hover:shadow-md">
            <div className="relative aspect-[2/1] bg-[#fbf6ee]">
              <img
                src={getSafeMenuImage(item.image)}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = FALLBACK_MENU_IMAGE;
                }}
              />
              <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#ae002a] shadow-sm">
                {item.category}
              </span>
              <button type="button" title="Download food image" onClick={() => downloadMenuImage(item)} disabled={!item.image} className="absolute bottom-3 right-3 rounded-xl bg-white/95 p-2 text-[#ae002a] shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"><Download size={14} /></button>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-3.5">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-bold text-[#1f1d1b]">{item.name}</h3>
                  <span className="shrink-0 text-sm font-bold text-[#ae002a]">{formatCurrency(item.price)}</span>
                </div>
                <p className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-4 text-[#746e67]">{item.description || 'Freshly prepared at Wrap & Roll.'}</p>
              </div>
              <div className="flex items-center justify-between border-t border-[#eee4d5] pt-3">
                <span className={'rounded-full px-2 py-0.5 text-[10px] font-bold ' + (item.active ? item.popular ? 'bg-[#fff9f0] text-[#775a00] border border-[#f5d777]' : 'bg-[#f0f9f3] text-[#227653] border border-[#227653]/30' : 'bg-[#fff5f5] text-[#ae002a] border border-[#ae002a]/30')}>
                  {item.active ? (item.popular ? 'Popular' : 'Active') : 'Hidden'}
                </span>
                <div className="flex gap-1.5">
                  <button title="Edit item" className="rounded-xl border border-[#ebdccb] bg-[#fbf6ee] p-1.5 text-[#554e46] hover:bg-[#faeee2]" onClick={() => openEdit(item)}><Edit3 size={13} /></button>
                  <button title="Remove from online menu" className="rounded-xl border border-[#ae002a]/20 bg-[#fff5f5] p-1.5 text-[#ae002a] hover:bg-[#ffe5e5]" onClick={() => setDeleteConfirm(item)}><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button title={item.active ? 'Hide from menu' : 'Show on menu'} disabled={savingId === `${item.id}-active`} onClick={() => toggleItem(item, 'active')} className={'inline-flex items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-[10px] font-bold ' + (item.active ? 'border-[#227653]/30 bg-[#f0f9f3] text-[#227653]' : 'border-[#ebdccb] bg-white text-[#746e67]')}>
                  {item.active ? <Eye size={12} /> : <EyeOff size={12} />}{item.active ? 'Online' : 'Hidden'}
                </button>
                <button title={item.popular ? 'Unmark popular' : 'Mark popular'} disabled={savingId === `${item.id}-popular`} onClick={() => toggleItem(item, 'popular')} className={'inline-flex items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-[10px] font-bold ' + (item.popular ? 'border-[#f5d777] bg-[#fff9f0] text-[#775a00]' : 'border-[#ebdccb] bg-white text-[#746e67]')}>
                  <Zap size={12} />{item.popular ? 'Featured' : 'Feature'}
                </button>
              </div>
            </div>
          </article>
        ))}
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
        title="Remove Menu Item"
      >
        <div className="text-center space-y-4">
          <p className="text-xs text-[#554e46]">
            Remove <strong>{deleteConfirm?.name}</strong> from the online menu? It will remain available under Hidden status.
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
              Remove from Menu
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

