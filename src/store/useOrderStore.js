import { create } from 'zustand';
import { api } from '../api/client';
import { enqueueOrder, getQueuedOrders, removeQueuedOrder, getQueuedOrderCount } from '../offline/orderQueue';

let queueSyncInProgress = false;

function notifyQueueChanged(count) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-orders-updated', { detail: { count } }));
  }
}

export async function syncQueuedOrders() {
  if (queueSyncInProgress || typeof window === 'undefined') return 0;
  queueSyncInProgress = true;
  let synced = 0;

  try {
    const queuedOrders = await getQueuedOrders();
    for (const queuedOrder of queuedOrders) {
      try {
        const order = await api.createOrder(queuedOrder.payload);
        await removeQueuedOrder(queuedOrder.queueId);
        useOrderStore.setState((state) => ({ orders: [order, ...state.orders] }));
        synced += 1;
      } catch (error) {
        if (error.status === 0) break;
        console.error('Offline order could not sync:', error);
        break;
      }
    }
  } catch (error) {
    console.error('Could not read offline orders:', error);
  } finally {
    queueSyncInProgress = false;
    notifyQueueChanged(await getQueuedOrderCount().catch(() => 0));
  }

  return synced;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', syncQueuedOrders);
  syncQueuedOrders();
}

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
    try {
      const order = await api.createOrder(orderData);
      set((state) => ({ orders: [order, ...state.orders] }));
      return order;
    } catch (error) {
      if (error.status !== 0) throw error;
      const queuedOrder = await enqueueOrder(orderData);
      notifyQueueChanged(await getQueuedOrderCount());
      return {
        id: queuedOrder.queueId,
        offline: true,
        status: 'queued',
        createdAt: queuedOrder.createdAt,
      };
    }
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
