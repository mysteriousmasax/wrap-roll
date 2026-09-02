import { create } from 'zustand';
import { api } from '../api/client';

const useOrderStore = create((set, get) => ({
  orders: [],
  loading: false,

  fetchOrders: async (status) => {
    set({ loading: true });
    try {
      const orders = await api.getOrders(status);
      set({ orders, loading: false });
      return orders;
    } catch {
      set({ loading: false });
      return get().orders;
    }
  },

  createOrder: async (orderData) => {
    const order = await api.createOrder(orderData);
    set((state) => ({ orders: [order, ...state.orders] }));
    return order;
  },

  updateOrderStatus: async (orderId, status) => {
    const order = await api.updateOrderStatus(orderId, status);
    set((state) => ({
      orders: state.orders.map((o) => (o.id === orderId ? order : o)),
    }));
    return order;
  },

  upsertOrder: (order) => {
    set((state) => {
      const exists = state.orders.some((o) => o.id === order.id);
      if (exists) {
        return { orders: state.orders.map((o) => (o.id === order.id ? order : o)) };
      }
      return { orders: [order, ...state.orders] };
    });
  },

  getActiveOrders: () =>
    get().orders.filter((o) => ['pending', 'preparing', 'ready'].includes(o.status)),
}));

export default useOrderStore;
