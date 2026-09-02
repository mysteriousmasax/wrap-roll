import { create } from 'zustand';
import { api, setToken } from '../api/client';

const useAuthStore = create((set) => ({
  currentUser: null,
  isAuthenticated: false,
  loading: true,

  init: async () => {
    const token = localStorage.getItem('wraproll_token');
    if (!token) {
      set({ loading: false, isAuthenticated: false, currentUser: null });
      return;
    }
    try {
      const { user } = await api.me();
      set({ currentUser: user, isAuthenticated: true, loading: false });
    } catch {
      setToken(null);
      set({ currentUser: null, isAuthenticated: false, loading: false });
    }
  },

  login: async (pin) => {
    const { user, token } = await api.login(pin);
    setToken(token);
    set({ currentUser: user, isAuthenticated: true });
    return true;
  },

  logout: () => {
    setToken(null);
    set({ currentUser: null, isAuthenticated: false });
  },

  updateProfile: async (data) => {
    const { user } = await api.updateProfile(data);
    set({ currentUser: user });
    return user;
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => useAuthStore.getState().logout());
}

export default useAuthStore;
