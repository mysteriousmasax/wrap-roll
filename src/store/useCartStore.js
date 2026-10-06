import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import useSettingsStore from './useSettingsStore';

const useCartStore = create(persist((set, get) => ({
  items: [],
  orderType: 'dine-in',
  tableNumber: null,
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  deliveryAddress: '',
  deliveryLatitude: null,
  deliveryLongitude: null,
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
          (i.variantName || '') === (item.variantName || '') &&
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
      isCustom: true,
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

  setItems: (items) => set({ items: Array.isArray(items) ? items : [] }),

  restoreCart: (cart = {}) => set({
    items: Array.isArray(cart.items) ? cart.items : [],
    orderType: cart.orderType || 'dine-in',
    tableNumber: cart.tableNumber ?? null,
    customerName: cart.customerName || '',
    customerPhone: cart.customerPhone || '',
    customerEmail: cart.customerEmail || '',
    deliveryAddress: cart.deliveryAddress || '',
    deliveryLatitude: cart.deliveryLatitude ?? null,
    deliveryLongitude: cart.deliveryLongitude ?? null,
    orderSource: cart.orderSource || 'foh',
    paymentReference: cart.paymentReference || '',
    orderNotes: cart.orderNotes || '',
    discountPercent: Number(cart.discountPercent) || 0,
  }),

  resetCart: () => set({
    items: [],
    orderType: 'dine-in',
    tableNumber: null,
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    deliveryAddress: '',
    deliveryLatitude: null,
    deliveryLongitude: null,
    orderSource: 'foh',
    paymentReference: '',
    orderNotes: '',
    discountPercent: 0,
  }),

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

  updateItem: (cartId, updates) => {
    set((state) => ({
      items: state.items.map((item) => (item.cartId === cartId ? { ...item, ...updates } : item)),
    }));
  },

  clearCart: () =>
    set({
      items: [],
      tableNumber: null,
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      deliveryAddress: '',
      deliveryLatitude: null,
      deliveryLongitude: null,
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
  setDeliveryLocation: ({ address, latitude, longitude }) => set({ deliveryAddress: address, deliveryLatitude: latitude, deliveryLongitude: longitude }),
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
}), {
  name: 'wraproll_pos_cart',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    items: state.items,
    orderType: state.orderType,
    tableNumber: state.tableNumber,
    customerName: state.customerName,
    customerPhone: state.customerPhone,
    customerEmail: state.customerEmail,
    deliveryAddress: state.deliveryAddress,
    deliveryLatitude: state.deliveryLatitude,
    deliveryLongitude: state.deliveryLongitude,
    orderSource: state.orderSource,
    paymentReference: state.paymentReference,
    orderNotes: state.orderNotes,
    discountPercent: state.discountPercent,
  }),
}));

export default useCartStore;
