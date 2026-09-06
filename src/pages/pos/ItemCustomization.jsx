import { useState } from 'react';
import { X, Plus, Minus, Utensils, Sparkles, Check } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import Button from '../../components/ui/Button';

const quickQuantities = [1, 2, 5, 10, 20, 50];

export default function ItemCustomization({ isOpen, item, modifiers: allModifiers = [], kitchenLoad = 0, onClose, onAdd }) {
  const [selectedModifiers, setSelectedModifiers] = useState([]);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [quantity, setQuantity] = useState(1);


  if (!isOpen || !item) return null;

  const addModifiers = allModifiers.filter((m) => m.type === 'add');
  const removeModifiers = allModifiers.filter((m) => m.type === 'remove');
  const modifierTotal = selectedModifiers.reduce((sum, m) => sum + (m.price || 0), 0);
  const singleItemPrice = (item.price || 0) + modifierTotal;
  const itemTotal = singleItemPrice * quantity;
  const basePrepMinutes = Number(item.prep_time_minutes || 8);
  const queueMinutes = Math.min(30, kitchenLoad * 2);
  const quantityMinutes = Math.max(0, Math.ceil(quantity / 3) - 1) * 2;
  const extrasMinutes = addModifiers.length ? selectedModifiers.filter((mod) => mod.type === 'add').length : 0;
  const prepMinutes = basePrepMinutes + queueMinutes + quantityMinutes + extrasMinutes;
  const prepWindow = `${prepMinutes}-${prepMinutes + 5} min`;

  const toggleModifier = (mod) => {
    setSelectedModifiers((prev) =>
      prev.find((m) => m.id === mod.id) ? prev.filter((m) => m.id !== mod.id) : [...prev, mod]
    );
  };

  const handleAdd = () => {
    onAdd(item, selectedModifiers, specialInstructions, quantity);
    setSelectedModifiers([]);
    setSpecialInstructions('');
    setQuantity(1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#fffdfa] border border-[#ebdccb] rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-slide-up z-10 text-[#24211e]">
        {/* Header with image banner */}
        <div className="relative p-5 border-b border-[#eee4d5] bg-gradient-to-r from-[#fff9f0] to-[#fffdfa] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            {item.image && (
              <img
                src={item.image}
                alt=""
                className="w-16 h-16 rounded-2xl object-cover border border-[#ecdac8] shadow-sm flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#fde8d7] text-[#ae002a] text-[10px] font-bold uppercase tracking-wider mb-1">
                <Utensils size={11} /> {item.category || 'Meal Option'}
              </div>
              <h2 className="text-lg sm:text-xl font-bold font-display text-[#1f1d1b] leading-snug">
                {item.name}
              </h2>
              <p className="text-xs text-[#746e67] line-clamp-2 mt-0.5 leading-relaxed">
                {item.description || 'Customize your meal with fresh toppings and sides'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-[#e8dcd0] text-[#746e67] hover:bg-[#faeee2] hover:text-[#ae002a] transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Customization Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Quantity comes first because it directly affects production time. */}
          <div className="bg-[#fbf6ee] border border-[#ebdccb] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#746e67] flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#e6ac29]" /> How many would you like?
              </label>
              <span className="text-xs font-bold text-[#ae002a]">
                {quantity} {quantity === 1 ? 'item' : 'items'} &times; {formatCurrency(singleItemPrice)}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#ecdac8] bg-white px-3 py-2.5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#746e67]">Estimated ready time</p>
                <p className="text-sm font-bold text-[#ae002a]">{prepWindow}</p>
              </div>
              <p className="text-right text-[11px] leading-snug text-[#746e67]">
                {kitchenLoad > 0 ? `${kitchenLoad} active kitchen ticket${kitchenLoad === 1 ? '' : 's'} ahead` : 'Kitchen queue is clear'}
                <br />Quantity and extras included
              </p>
            </div>

            {/* Stepper + Quick Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center border border-[#d9cdb7] bg-white rounded-xl shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center text-[#746e67] hover:bg-[#faeee2] hover:text-[#ae002a] transition-colors"
                  aria-label="Decrease quantity"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-14 text-center font-bold text-sm bg-transparent border-0 focus:outline-none text-[#24211e]"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-10 h-10 flex items-center justify-center text-[#746e67] hover:bg-[#faeee2] hover:text-[#ae002a] transition-colors"
                  aria-label="Increase quantity"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Fast multipliers */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {quickQuantities.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setQuantity(preset)}
                    className={
                      'px-2.5 py-2 rounded-xl text-xs font-bold transition-all ' +
                      (quantity === preset
                        ? 'bg-[#ae002a] text-white shadow-sm'
                        : 'bg-white border border-[#e4d6c4] text-[#554e46] hover:bg-[#faeee2] hover:border-[#ae002a]/40')
                    }
                  >
                    {preset === 1 ? 'Single' : `${preset}x`}
                  </button>
                ))}
              </div>
            </div>
            {quantity >= 10 && <p className="mt-3 rounded-xl border border-[#f0cf8a] bg-[#fff9ed] px-3 py-2 text-[11px] font-semibold leading-snug text-[#775a00]">Large order: please confirm the {prepWindow} estimate with the guest before sending it to the kitchen.</p>}
          </div>

          {/* Add Extras & Combos */}
          {addModifiers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold font-display uppercase tracking-wider text-[#746e67]">
                  Add Extras &amp; Upgrades
                </h3>
                <span className="text-[11px] text-[#8c8278]">Adds {selectedModifiers.filter((mod) => mod.type === 'add').length} min each</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {addModifiers.map((mod) => {
                  const selected = selectedModifiers.some((m) => m.id === mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleModifier(mod)}
                      className={
                        'p-3 rounded-2xl text-left transition-all border flex items-center justify-between gap-2 ' +
                        (selected
                          ? 'border-[#ae002a] bg-[#fff3ec] shadow-sm'
                          : 'border-[#ebdccb] bg-white hover:border-[#d4a373] hover:bg-[#fffbf6]')
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={
                            'w-5 h-5 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ' +
                            (selected ? 'bg-[#ae002a] text-white' : 'border border-[#d9cdb7] bg-white')
                          }
                        >
                          {selected && <Check size={13} strokeWidth={3} />}
                        </div>
                        <div>
                          <p className="font-semibold text-xs sm:text-sm text-[#1f1d1b] leading-snug">
                            {mod.name}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[#ae002a] whitespace-nowrap">
                        +{formatCurrency(mod.price || 0)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Remove Ingredients / Dietary */}
          {removeModifiers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold font-display uppercase tracking-wider text-[#746e67]">
                  Dietary / Remove Ingredients
                </h3>
                <span className="text-[11px] text-[#8c8278]">Tap to exclude</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {removeModifiers.map((mod) => {
                  const selected = selectedModifiers.some((m) => m.id === mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleModifier(mod)}
                      className={
                        'px-3 py-1.5 rounded-full text-xs font-bold transition-all border ' +
                        (selected
                          ? 'bg-[#ae002a] border-[#ae002a] text-white shadow-sm'
                          : 'bg-white border-[#ebdccb] text-[#5c544d] hover:bg-[#faeee2]')
                      }
                    >
                      {selected ? `No ${mod.name}` : `Without ${mod.name}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Special Instructions */}
          <div>
            <label className="block text-xs font-bold font-display uppercase tracking-wider text-[#746e67] mb-2">
              Special Instructions &amp; Packaging Notes
            </label>
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="E.g., extra spicy, wrap tightly in foil, sauce on the side, label for John..."
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-[#ebdccb] bg-white focus:outline-none focus:border-[#ae002a] focus:ring-2 focus:ring-[#ae002a]/20 text-xs sm:text-sm text-[#24211e] placeholder:text-[#a0978e] transition-all resize-none"
            />
          </div>
        </div>

        {/* Footer with sticky CTA */}
        <div className="p-4 sm:p-5 border-t border-[#eee4d5] bg-white flex items-center justify-between gap-3 shadow-lg">
          <div className="leading-tight">
            <span className="text-[11px] font-semibold text-[#746e67] uppercase tracking-wider block">
              Total ({quantity} {quantity === 1 ? 'item' : 'items'})
            </span>
            <span className="text-lg sm:text-xl font-bold font-display text-[#ae002a]">
              {formatCurrency(itemTotal)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-[#d9cdb7] font-semibold text-xs text-[#554e46] hover:bg-[#faeee2] transition-colors"
            >
              Cancel
            </button>
            <Button onClick={handleAdd} size="md" className="px-6 py-2.5 text-xs sm:text-sm font-bold shadow-md">
              Add to Order &middot; {formatCurrency(itemTotal)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}