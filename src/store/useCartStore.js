import { create } from 'zustand';
import useSettingsStore from './useSettingsStore';

const useCartStore = create((set, get) => ({
  items: [],
  orderType: 'dine-in',
  tableNumber: null,
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  deliveryAddress: '',
  orderSource: 'foh',
  paymentReference: '',
  orderNotes: '',
  discountPercent: 0,

  addItem: (item) => {
    const qty = Math.max(1, parseInt(item.quantity || 1, 10));
    set((state) => {
      const existing = state.items.find(
        (i) =>
          i.id === item.id &&
          JSON.stringify(i.modifiers || []) === JSON.stringify(item.modifiers || []) &&
          (i.specialInstructions || '') === (item.specialInstructions || '')
      );
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.cartId === existing.cartId ? { ...i, quantity: i.quantity + qty } : i
          ),
        };
      }
      const { quantity: _q, ...rest } = item;
      return {
        items: [
          ...state.items,
          {
            ...rest,
            quantity: qty,
            modifiers: rest.modifiers || [],
            cartId: Date.now() + Math.random().toString(36).substr(2, 4),
          },
        ],
      };
    });
  },

  addCustomItem: ({ name, price, quantity = 1, specialInstructions = '', category = 'Custom' }) => {
    const qty = Math.max(1, parseInt(quantity, 10));
    const numPrice = Math.max(0, parseFloat(price) || 0);
    const customItem = {
      id: `custom-${Date.now()}`,
      name: name.trim() || 'Special Custom Meal',
      price: numPrice,
      quantity: qty,
      category,
      modifiers: [],
      specialInstructions,
      image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&h=600&fit=crop',
      cartId: `custom-${Date.now()}`,
    };
    set((state) => ({ items: [...state.items, customItem] }));
  },

  removeItem: (cartId) => {
    set((state) => ({ items: state.items.filter((i) => i.cartId !== cartId) }));
  },

  updateQuantity: (cartId, quantity) => {
    const numQty = parseInt(quantity, 10);
    if (isNaN(numQty) || numQty <= 0) {
      set((state) => ({ items: state.items.filter((i) => i.cartId !== cartId) }));
    } else {
      set((state) => ({
        items: state.items.map((i) => (i.cartId === cartId ? { ...i, quantity: numQty } : i)),
      }));
    }
  },

  clearCart: () =>
    set({
      items: [],
      tableNumber: null,
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      deliveryAddress: '',
      orderSource: 'foh',
      paymentReference: '',
      orderNotes: '',
      discountPercent: 0,
    }),

  setOrderType: (orderType) => set({ orderType }),
  setTableNumber: (tableNumber) => set({ tableNumber }),
  setCustomerName: (customerName) => set({ customerName }),
  setCustomerPhone: (customerPhone) => set({ customerPhone }),
  setCustomerEmail: (customerEmail) => set({ customerEmail }),
  setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),
  setOrderSource: (orderSource) => set({ orderSource }),
  setPaymentReference: (paymentReference) => set({ paymentReference }),
  setOrderNotes: (orderNotes) => set({ orderNotes }),
  setDiscountPercent: (discountPercent) => set({ discountPercent }),

  getSubtotal: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
  getDiscountAmount: () => (get().getSubtotal() * (get().discountPercent || 0)) / 100,
  getTax: () =>
    (get().getSubtotal() - get().getDiscountAmount()) * useSettingsStore.getState().getTaxRate(),
  getTotal: () => get().getSubtotal() - get().getDiscountAmount() + get().getTax(),
  getItemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}));

export default useCartStore;
