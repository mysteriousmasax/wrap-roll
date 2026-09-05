import { create } from 'zustand';
import { api } from '../api/client';

const defaults = {
  restaurant_name: 'Wrap & Roll',
  branch_location: 'Mwai Kibaki Rd, Mikocheni (Wikicha Tower), Dar es Salaam',
  google_maps_url: 'https://maps.app.goo.gl/gZqwfknocNK6FYNAA',
  phone: '+255 746 222 889',
  email: 'info@wrapandrolltz.com',
  operating_hours: '7:00 AM - 11:00 PM',
  weekly_hours: '{}',
  timezone: 'Africa/Dar_es_Salaam',
  tax_rate: '8',
  vat_rate: '18',
  currency: 'TZS',
  tax_id: 'TIN-123-456-789',
  payment_card: 'true',
  payment_mobile: 'true',
  payment_cash: 'true',
  lipa_namba_number: '123456',
  public_animation_enabled: 'true',
  public_animation_style: 'lift',
  public_animation_duration: '650',
  public_animation_replay: 'true',
};

const useSettingsStore = create((set, get) => ({
  settings: { ...defaults },
  loaded: false,

  fetchSettings: async () => {
    try {
      const settings = await api.getSettings();
      set({ settings: { ...defaults, ...settings }, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  saveSettings: async (partial) => {
    const merged = { ...get().settings, ...partial };
    const settings = await api.updateSettings(merged);
    set({ settings: { ...defaults, ...settings } });
    return settings;
  },

  getTaxRate: () => parseFloat(get().settings.tax_rate || '8') / 100,
  getCurrency: () => get().settings.currency || 'TZS',
}));

export default useSettingsStore;
