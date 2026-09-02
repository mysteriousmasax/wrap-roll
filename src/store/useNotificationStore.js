import { create } from 'zustand';
import { api } from '../api/client';

const useNotificationStore = create((set, get) => ({
  notifications: [],
  loaded: false,

  fetchNotifications: async () => {
    try {
      const response = await api.getNotifications();
      const notifications = Array.isArray(response)
        ? response
        : Array.isArray(response?.notifications)
          ? response.notifications
          : [];
      set({ notifications, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  markRead: async (id) => {
    await api.markNotificationRead(id);
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  },

  markAllRead: async () => {
    await api.markAllNotificationsRead();
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
  },

  getUnreadCount: () => {
    const notifications = get().notifications;
    return Array.isArray(notifications) ? notifications.filter((n) => !n.read).length : 0;
  },
}));

export default useNotificationStore;
