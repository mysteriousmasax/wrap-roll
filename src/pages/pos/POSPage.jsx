import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Sparkles,
  Utensils,
  PlusCircle,
  Check,
  X,
  FileText,
  Percent,
} from 'lucide-react';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import useCartStore from '../../store/useCartStore';
import useSettingsStore from '../../store/useSettingsStore';
import ProductCard from '../../components/ui/ProductCard';
import Button from '../../components/ui/Button';
import ItemCustomization from './ItemCustomization';
import OrderTypeSelector from './OrderTypeSelector';

const categories = [
  { id: 'all', label: 'All Items' },
  { id: 'wraps', label: 'Wraps' },
  { id: 'salads', label: 'Salads' },
  { id: 'rolls', label: 'Rolls' },
  { id: 'pizzas', label: 'Pizza' },
  { id: 'burgers', label: 'Burgers' },
  { id: 'combos', label: 'Combos' },
  { id: 'sides', label: 'Sides' },
  { id: 'extras', label: 'Extras' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'cold-drinks', label: 'Cold Drinks' },
  { id: 'soft-drinks', label: 'Soft Drinks' },
];

const quickUpsells = [
  { name: 'French Fries', price: 4000, category: 'sides' },
  { name: 'Cold Soda / Water', price: 2000, category: 'soft-drinks' },
  { name: 'Garlic Mayo Dip', price: 1500, category: 'extras' },
  { name: 'Extra Cheddar Cheese', price: 2500, category: 'extras' },
];

function CustomItemModal({ isOpen, onClose, onAdd }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [category, setCategory] = useState('Custom Platter');
  const [specialInstructions, setSpecialInstructions] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || isNaN(parseFloat(price)) || parseFloat(price) <= 0) return;
    onAdd({
      name: name.trim(),
      price: parseFloat(price),
      quantity: Math.max(1, parseInt(quantity, 10) || 1),
      category,
      specialInstructions,
    });
    setName('');
    setPrice('');
    setQuantity(1);
    setSpecialInstructions('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#fffdfa] border border-[#ebdccb] rounded-3xl shadow-2xl w-full max-w-md p-6 animate-slide-up z-10 text-[#24211e]">
        <div className="flex items-center justify-between pb-3 border-b border-[#eee4d5] mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#fde8d7] text-[#ae002a] flex items-center justify-center">
              <PlusCircle size={18} />
            </div>
            <h2 className="text-base font-bold font-display">Add Custom Food / Catering Item</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-[#746e67] hover:bg-[#faeee2]">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#746e67] mb-1">
              Item or Platter Name
            </label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="E.g., Catering Large Party Platter, Custom Box..."
              className="w-full px-3.5 py-2 rounded-xl border border-[#ebdccb] bg-white text-sm focus:outline-none focus:border-[#ae002a] text-[#24211e]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#746e67] mb-1">
                Price (TZS)
              </label>
              <input
                required
                type="number"
                min="0"
                step="500"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="25000"
                className="w-full px-3.5 py-2 rounded-xl border border-[#ebdccb] bg-white text-sm focus:outline-none focus:border-[#ae002a] text-[#24211e]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#746e67] mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                max="999"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#ebdccb] bg-white text-sm focus:outline-none focus:border-[#ae002a] text-[#24211e]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#746e67] mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-[#ebdccb] bg-white text-sm focus:outline-none focus:border-[#ae002a] text-[#24211e]"
            >
              <option value="Custom Platter">Custom Platter / Catering</option>
              <option value="Special Meal">Special Meal Request</option>
              <option value="Combos">Custom Combo</option>
              <option value="Beverages">Custom Drinks</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#746e67] mb-1">
              Preparation / Large Order Notes
            </label>
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="Any specific chef instructions or packaging requests..."
              rows={2}
              className="w-full px-3.5 py-2 rounded-xl border border-[#ebdccb] bg-white text-xs text-[#24211e] focus:outline-none focus:border-[#ae002a] resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#d9cdb7] text-xs font-semibold text-[#554e46] hover:bg-[#faeee2]"
            >
              Cancel
            </button>
            <Button type="submit" size="sm">
              Add to Cart
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CartPanel({ onCheckout, onOpenCustomModal }) {
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    getSubtotal,
    getDiscountAmount,
    getTax,
    getTotal,
    getItemCount,
    addItem,
    discountPercent,
    setDiscountPercent,
    orderNotes,
    setOrderNotes,
  } = useCartStore();
  const taxRate = useSettingsStore((s) => s.settings.tax_rate);
  const [showNotes, setShowNotes] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const subtotal = getSubtotal();
  const discount = getDiscountAmount();
  const tax = getTax();
  const total = getTotal();
  const itemCount = getItemCount();

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-between p-4 text-center bg-[#fffdfa]">
        <div className="flex-1 flex flex-col items-center justify-center space-y-3 py-6">
          <div className="w-16 h-16 rounded-2xl bg-[#faeee2] text-[#ae002a] flex items-center justify-center shadow-sm">
            <ShoppingCart size={28} />
          </div>
          <div className="max-w-xs">
            <h3 className="font-display font-bold text-sm text-[#1f1d1b]">Your Order Is Ready</h3>
            <p className="text-xs text-[#746e67] mt-1">
              Select items from the menu, or use the quick buttons below for custom/bulk orders.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenCustomModal}
            className="mt-2 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#d9cdb7] bg-white text-xs font-bold text-[#ae002a] shadow-sm hover:bg-[#faeee2] transition-colors"
          >
            <PlusCircle size={14} /> + Custom Food / Catering Item
          </button>
        </div>

        {/* Quick upsells preview */}
        <div className="w-full pt-3 border-t border-[#eee4d5]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c8278] text-left mb-2">
            Popular Add-ons
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {quickUpsells.map((upsell) => (
              <button
                key={upsell.name}
                type="button"
                onClick={() =>
                  addItem({
                    id: `upsell-${upsell.name}`,
                    name: upsell.name,
                    price: upsell.price,
                    quantity: 1,
                    category: upsell.category,
                  })
                }
                className="p-2 rounded-xl border border-[#ebdccb] bg-white text-left hover:border-[#ae002a]/40 hover:bg-[#fff7f0] transition-colors text-xs"
              >
                <p className="font-semibold truncate text-[#1f1d1b]">{upsell.name}</p>
                <p className="text-[10px] font-bold text-[#ae002a]">+{formatCurrency(upsell.price)}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#fffdfa]">
      {/* Items Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {items.map((item) => (
          <div
            key={item.cartId}
            className="p-3 bg-white border border-[#eee4d5] rounded-2xl shadow-sm hover:border-[#d9cdb7] transition-all"
          >
            <div className="flex items-start gap-2.5">
              {item.image && (
                <img
                  src={item.image}
                  alt=""
                  className="w-11 h-11 rounded-xl object-cover border border-[#ebdccb] flex-shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-xs font-bold text-[#1f1d1b] leading-tight truncate">{item.name}</p>
                  <button
                    onClick={() => removeItem(item.cartId)}
                    className="text-[#998f86] hover:text-[#ae002a] p-0.5 rounded transition-colors"
                    title="Remove item"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {item.modifiers?.length > 0 && (
                  <p className="text-[10px] text-[#ae002a] font-medium truncate mt-0.5">
                    + {item.modifiers.join(', ')}
                  </p>
                )}

                {item.specialInstructions && (
                  <p className="text-[10px] text-[#746e67] italic truncate mt-0.5">
                    &ldquo;{item.specialInstructions}&rdquo;
                  </p>
                )}

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#f3ebde]">
                  <span className="text-xs font-bold text-[#ae002a]">
                    {formatCurrency(item.price * item.quantity)}
                  </span>

                  {/* Quantity Stepper with Quick Increment */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.cartId, item.quantity - 1)}
                      className="w-6 h-6 rounded-lg border border-[#d9cdb7] bg-white flex items-center justify-center text-[#554e46] hover:bg-[#faeee2]"
                      aria-label="Decrease"
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(item.cartId, parseInt(e.target.value, 10) || 1)
                      }
                      className="w-9 text-center font-bold text-xs bg-transparent border-0 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.cartId, item.quantity + 1)}
                      className="w-6 h-6 rounded-lg border border-[#d9cdb7] bg-white flex items-center justify-center text-[#554e46] hover:bg-[#faeee2]"
                      aria-label="Increase"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Quick Add More Options Strip */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8c8278]">
              Quick Add More Food
            </span>
            <button
              type="button"
              onClick={onOpenCustomModal}
              className="text-[10px] font-bold text-[#ae002a] hover:underline"
            >
              + Custom Platter
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {quickUpsells.map((upsell) => (
              <button
                key={upsell.name}
                type="button"
                onClick={() =>
                  addItem({
                    id: `upsell-${upsell.name}`,
                    name: upsell.name,
                    price: upsell.price,
                    quantity: 1,
                    category: upsell.category,
                  })
                }
                className="px-2.5 py-1.5 rounded-xl border border-[#ebdccb] bg-white text-left hover:border-[#ae002a]/40 hover:bg-[#fff7f0] transition-colors whitespace-nowrap flex-shrink-0 text-[11px]"
              >
                <span className="font-semibold text-[#1f1d1b]">{upsell.name}</span>{' '}
                <span className="font-bold text-[#ae002a]">+{formatCurrency(upsell.price)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Summary & Actions */}
      <div className="p-3.5 border-t border-[#eee4d5] bg-white space-y-2.5 shadow-sm">
        {/* Discount & Order Notes controls */}
        <div className="flex items-center justify-between text-xs text-[#746e67] gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowNotes(!showNotes)}
              className={
                'px-2 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ' +
                (orderNotes
                  ? 'border-[#ae002a] bg-[#fff3ec] text-[#ae002a]'
                  : 'border-[#ebdccb] text-[#746e67] hover:bg-[#faeee2]')
              }
            >
              <FileText size={12} /> {orderNotes ? 'Notes Added' : 'Order Notes'}
            </button>

            <div className="flex items-center gap-1 bg-[#fbf6ee] border border-[#ebdccb] rounded-lg px-2 py-0.5 text-[11px]">
              <Percent size={11} className="text-[#8c8278]" />
              <select
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                className="bg-transparent font-bold text-[#24211e] focus:outline-none cursor-pointer text-[11px]"
              >
                <option value={0}>0% Disc</option>
                <option value={5}>5% Disc</option>
                <option value={10}>10% Disc</option>
                <option value={15}>15% Disc</option>
                <option value={20}>20% Disc</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="text-[11px] text-[#998f86] hover:text-[#ae002a] font-semibold"
          >
            Clear Cart
          </button>
        </div>

        {showNotes && (
          <textarea
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="Special instructions for kitchen / packing..."
            rows={2}
            className="w-full px-3 py-1.5 rounded-xl border border-[#ebdccb] bg-[#fbf6ee] text-xs text-[#24211e] focus:outline-none focus:border-[#ae002a] resize-none"
          />
        )}

        {/* Calculation Lines */}
        <div className="space-y-1 text-xs pt-1 border-t border-[#f3ebde]">
          <div className="flex justify-between text-[#746e67]">
            <span>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
            <span className="font-semibold text-[#1f1d1b]">{formatCurrency(subtotal)}</span>
          </div>

          {discount > 0 && (
            <div className="flex justify-between text-[#227653] font-semibold">
              <span>Discount ({discountPercent}%)</span>
              <span>-{formatCurrency(discount)}</span>
            </div>
          )}

          <div className="flex justify-between text-[#746e67]">
            <span>Tax ({taxRate}%)</span>
            <span className="font-semibold text-[#1f1d1b]">{formatCurrency(tax)}</span>
          </div>

          <div className="flex justify-between font-bold text-sm pt-2 border-t border-[#eee4d5]">
            <span className="text-[#1f1d1b]">Total Payable</span>
            <span className="text-base text-[#ae002a]">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Big Checkout Button */}
        <Button onClick={onCheckout} size="md" className="w-full font-bold shadow-md py-3 text-sm">
          Proceed to Checkout &middot; {formatCurrency(total)}
        </Button>
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#fffdfa] border border-[#ebdccb] rounded-2xl p-5 max-w-xs w-full shadow-2xl text-center space-y-3">
            <h4 className="font-bold text-sm text-[#1f1d1b]">Clear Current Order?</h4>
            <p className="text-xs text-[#746e67]">This will remove all {itemCount} items from the cart.</p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 rounded-xl border border-[#d9cdb7] text-xs font-semibold text-[#554e46] hover:bg-[#faeee2]"
              >
                Keep Items
              </button>
              <button
                onClick={() => {
                  clearCart();
                  setShowClearConfirm(false);
                }}
                className="px-4 py-1.5 rounded-xl bg-[#ae002a] text-white text-xs font-bold shadow-sm"
              >
                Yes, Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showCustomization, setShowCustomization] = useState(false);
  const [showOrderType, setShowOrderType] = useState(false);
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [loading, setLoading] = useState(true);

  const { items, addItem, addCustomItem, getTotal, getItemCount } = useCartStore();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.getMenu(), api.getModifiers()])
      .then(([menu, mods]) => {
        setMenuItems(menu || []);
        setModifiers(mods || []);
      })
      .catch((err) => {
        console.error('Failed to load menu:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = menuItems.filter((item) => {
    const matchCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchSearch =
      !searchQuery.trim() ||
      `${item.name} ${item.description || ''}`.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const handleItemClick = (item) => {
    setSelectedItem(item);
    setShowCustomization(true);
  };

  const handleAddToCart = (item, itemModifiers, specialInstructions, quantity) => {
    const modifierPrice = itemModifiers.reduce((sum, m) => sum + (m.price || 0), 0);
    addItem({
      ...item,
      price: (item.price || 0) + modifierPrice,
      modifiers: itemModifiers.map((m) => m.name),
      specialInstructions,
      quantity,
    });
    setShowCustomization(false);
  };

  const handleCheckout = () => {
    if (items.length === 0) return;
    setShowMobileCart(false);
    setShowOrderType(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[#746e67]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full border-2 border-[#ae002a] border-t-transparent animate-spin" />
          <span>Loading menu catalog...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-page flex flex-1 h-[calc(100vh-3.5rem)] overflow-hidden bg-[#faf7f2]">
      {/* Main Catalog Area */}
      <div className="pos-catalog flex-1 flex flex-col min-w-0">
        {/* Top Filter & Search Toolbar */}
        <div className="pos-toolbar p-3.5 border border-[#ebdccb] bg-white rounded-2xl mx-3 mt-3 space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ae002a] flex items-center gap-1.5">
                <Utensils size={12} /> Point of Sale Till
              </p>
              <h1 className="font-display text-base sm:text-lg font-bold text-[#1f1d1b]">
                Select Dishes &amp; Meals
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCustomItemModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#d9cdb7] bg-[#fffaf3] text-xs font-bold text-[#ae002a] hover:bg-[#faeee2] transition-colors shadow-sm"
              >
                <Plus size={14} /> + Custom Food / Catering
              </button>

              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#fbf6ee] px-3 py-1 text-xs font-bold text-[#746e67]">
                {filteredItems.length} items
              </span>
            </div>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#998f86]" />
            <input
              type="text"
              placeholder="Search dishes, drinks, wraps, rolls..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#fbf6ee] border border-[#ebdccb] focus:outline-none focus:border-[#ae002a] focus:bg-white text-xs sm:text-sm text-[#24211e] placeholder:text-[#a0978e] transition-all"
            />
          </div>

          {/* Category Horizontal Scroll Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={
                  'px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ' +
                  (activeCategory === cat.id
                    ? 'bg-[#ae002a] text-white shadow-sm'
                    : 'bg-[#fbf6ee] border border-[#ebdccb] text-[#554e46] hover:bg-[#faeee2]')
                }
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid Area */}
        <div className="pos-product-area flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredItems.map((item) => (
              <ProductCard key={item.id} item={item} onClick={handleItemClick} />
            ))}
          </div>

          {filteredItems.length === 0 && (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[#ebdccb] bg-white/70 p-6 text-center">
              <Search size={28} className="mb-2 text-[#998f86]" />
              <p className="text-sm font-bold text-[#1f1d1b]">No menu items found</p>
              <p className="mt-1 text-xs text-[#746e67]">Try another category or search term.</p>
              <button
                onClick={() => setShowCustomItemModal(true)}
                className="mt-3 px-3 py-1.5 rounded-xl bg-[#ae002a] text-white text-xs font-bold"
              >
                Add as Custom Food Item
              </button>
            </div>
          )}
        </div>
      </div>

      {/* PERMANENTLY OPEN Cart Panel on Desktop & Tablet (Never Hidden) */}
      <div className="pos-cart-panel w-80 xl:w-96 flex-shrink-0 flex flex-col bg-white border border-[#ebdccb] hidden sm:flex rounded-2xl shadow-sm my-3 mr-3 overflow-hidden">
        {/* Cart Header */}
        <div className="p-3.5 border-b border-[#eee4d5] bg-gradient-to-r from-[#fff9f0] to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#faeee2] text-[#ae002a] flex items-center justify-center">
              <ShoppingCart size={16} />
            </div>
            <h2 className="font-display font-bold text-sm text-[#1f1d1b]">Current Order</h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="bg-[#ae002a] text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {getItemCount()} {getItemCount() === 1 ? 'item' : 'items'}
            </span>
          </div>
        </div>

        {/* Interactive Cart Contents */}
        <CartPanel
          onCheckout={handleCheckout}
          onOpenCustomModal={() => setShowCustomItemModal(true)}
        />
      </div>

      {/* Mobile Sticky Floating Cart Bar (Always Visible on Mobile) */}
      <div className="sm:hidden fixed bottom-3 left-3 right-3 z-30 flex items-center gap-2 bg-[#1f1d1b] text-white p-2 rounded-2xl shadow-2xl border border-white/10">
        <button
          type="button"
          onClick={() => setShowMobileCart(true)}
          className="flex-1 flex items-center justify-between px-3 py-2 text-left"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#ae002a] text-white flex items-center justify-center font-bold text-xs">
              {getItemCount()}
            </div>
            <div>
              <p className="text-xs font-bold leading-tight">View Cart</p>
              <p className="text-[10px] text-white/70">
                {getItemCount()} {getItemCount() === 1 ? 'item' : 'items'} in order
              </p>
            </div>
          </div>
          <span className="font-display font-bold text-sm text-[#ffc72c]">
            {formatCurrency(getTotal())}
          </span>
        </button>

        <button
          type="button"
          disabled={items.length === 0}
          onClick={handleCheckout}
          className="px-4 py-2.5 rounded-xl bg-[#ae002a] text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1"
        >
          Pay &rarr;
        </button>
      </div>

      {/* Mobile Drawer Modal */}
      {showMobileCart && (
        <div className="sm:hidden fixed inset-0 z-40 flex flex-col justify-end animate-fade-in">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileCart(false)} />
          <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl animate-slide-up border-t border-[#ebdccb]">
            <div className="p-4 border-b border-[#eee4d5] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-[#ae002a]" />
                <h2 className="font-display font-bold text-sm">Order Summary</h2>
                <span className="bg-[#fbf6ee] text-[#ae002a] font-bold text-xs px-2 py-0.5 rounded-full">
                  {getItemCount()} items
                </span>
              </div>
              <button
                onClick={() => setShowMobileCart(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#fbf6ee] text-[#746e67]"
              >
                <X size={18} />
              </button>
            </div>
            <CartPanel
              onCheckout={handleCheckout}
              onOpenCustomModal={() => {
                setShowMobileCart(false);
                setShowCustomItemModal(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      <ItemCustomization
        isOpen={showCustomization}
        item={selectedItem}
        modifiers={modifiers}
        onClose={() => setShowCustomization(false)}
        onAdd={handleAddToCart}
      />
      <OrderTypeSelector
        isOpen={showOrderType}
        onClose={() => setShowOrderType(false)}
        onComplete={() => navigate('/pos/payment')}
      />
      <CustomItemModal
        isOpen={showCustomItemModal}
        onClose={() => setShowCustomItemModal(false)}
        onAdd={(customItem) => addCustomItem(customItem)}
      />
    </div>
  );
}

