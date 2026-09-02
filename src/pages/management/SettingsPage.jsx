import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import useSettingsStore from '../../store/useSettingsStore';
import { Save, Store, Receipt, CreditCard, Globe, Shield, Bell, Plus, Trash2 } from 'lucide-react';

const sections = [
  { id: 'general', label: 'General', icon: Store },
  { id: 'tax', label: 'Tax & Currency', icon: Receipt },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'appearance', label: 'Website Motion', icon: Globe },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
];

function readLipaAccounts(value, fallback = '123456') {
  try {
    const parsed = JSON.parse(value || '[]');
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return [{ label: 'Main Lipa Namba', number: fallback, qrImage: '' }];
}

export default function SettingsPage() {
  const { settings, saveSettings, loaded } = useSettingsStore();
  const [activeSection, setActiveSection] = useState('general');
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [lipaAccounts, setLipaAccounts] = useState([]);

  useEffect(() => {
    if (loaded) setForm({ ...settings });
    if (loaded) {
      setForm({ ...settings });
      setLipaAccounts(readLipaAccounts(settings.lipa_namba_accounts, settings.lipa_namba_number));
    }
  }, [loaded, settings]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await saveSettings(form);
      setMessage('Settings saved successfully');
    } catch (err) {
      setMessage(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const togglePayment = (key) => update(key, form[key] === 'true' ? 'false' : 'true');

  const updateLipaAccounts = (accounts) => {
    setLipaAccounts(accounts);
    update('lipa_namba_accounts', JSON.stringify(accounts));
    update('lipa_namba_number', accounts[0]?.number || '');
  };

  const uploadQr = (index, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateLipaAccounts(lipaAccounts.map((account, accountIndex) => accountIndex === index ? { ...account, qrImage: reader.result } : account));
    reader.readAsDataURL(file);
  };

  if (!loaded) return <div className="p-6 text-sm text-surface-on-variant">Loading settings...</div>;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="System Settings" subtitle="Configure your POS system preferences" actions={
        <Button size="sm" onClick={handleSave} disabled={saving}><Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}</Button>
      } />

      {message && <p className="text-sm mb-4 text-primary">{message}</p>}

      <div className="flex gap-6 flex-col lg:flex-row">
        <div className="w-full lg:w-48 space-y-1">
          {sections.map((sec) => (
            <button key={sec.id} onClick={() => setActiveSection(sec.id)}
              className={'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ' +
                (activeSection === sec.id ? 'bg-primary text-white' : 'hover:bg-surface-container-low text-surface-on')}>
              <sec.icon size={16} />
              {sec.label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-6">
          {activeSection === 'general' && (
            <Card>
              <h3 className="font-display font-bold mb-4">General Settings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Restaurant Name" value={form.restaurant_name || ''} onChange={(e) => update('restaurant_name', e.target.value)} />
                <Input label="Branch Location" value={form.branch_location || ''} onChange={(e) => update('branch_location', e.target.value)} />
                <Input label="Phone Number" value={form.phone || ''} onChange={(e) => update('phone', e.target.value)} />
                <Input label="Email" value={form.email || ''} onChange={(e) => update('email', e.target.value)} />
                <Input label="Operating Hours" value={form.operating_hours || ''} onChange={(e) => update('operating_hours', e.target.value)} />
                <Input label="Timezone" value={form.timezone || ''} onChange={(e) => update('timezone', e.target.value)} />
                <Input label="Lipa Namba Number" value={form.lipa_namba_number || ''} onChange={(e) => update('lipa_namba_number', e.target.value)} />
              </div>
            </Card>
          )}
          {activeSection === 'tax' && (
            <Card>
              <h3 className="font-display font-bold mb-4">Tax & Currency</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Tax Rate (%)" type="number" value={form.tax_rate || ''} onChange={(e) => update('tax_rate', e.target.value)} />
                <Input label="VAT Rate (%)" type="number" value={form.vat_rate || ''} onChange={(e) => update('vat_rate', e.target.value)} />
                <div>
                  <label className="block text-xs font-semibold text-surface-on-variant uppercase mb-1.5">Default Currency</label>
                  <select className="input-field" value={form.currency || 'TZS'} onChange={(e) => update('currency', e.target.value)}>
                    <option value="TZS">TZS (TSh)</option>
                    <option value="USD">USD ($)</option>
                    <option value="KES">KES (KSh)</option>
                  </select>
                </div>
                <Input label="Tax ID / TIN" value={form.tax_id || ''} onChange={(e) => update('tax_id', e.target.value)} />
              </div>
            </Card>
          )}
          {activeSection === 'payments' && (
            <Card>
              <h3 className="font-display font-bold mb-4">Payment Configuration</h3>
              <div className="space-y-4">
                {[
                  { key: 'payment_card', title: 'Credit/Debit Cards', desc: 'Visa, Mastercard' },
                  { key: 'payment_mobile', title: 'Mobile Money (Lipa Namba)', desc: 'M-Pesa, Tigo Pesa, Airtel Money' },
                  { key: 'payment_cash', title: 'Cash', desc: 'Accept cash payments' },
                ].map((p) => (
                  <button key={p.key} onClick={() => togglePayment(p.key)} className="w-full flex items-center justify-between p-3 bg-surface-container-low rounded-xl text-left">
                    <div><p className="font-semibold text-sm">{p.title}</p><p className="text-xs text-surface-on-variant">{p.desc}</p></div>
                    <div className={'w-10 h-5 rounded-full relative transition-colors ' + (form[p.key] === 'true' ? 'bg-success' : 'bg-outline-variant')}>
                      <div className={'w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ' + (form[p.key] === 'true' ? 'right-0.5' : 'left-0.5')} />
                    </div>
                  </button>
                ))}
                <div className="pt-2 border-t border-outline-variant">
                  <div className="flex items-center justify-between mb-3">
                    <div><h4 className="font-semibold text-sm">Lipa Namba accounts</h4><p className="text-xs text-surface-on-variant">Customers can choose any account at checkout.</p></div>
                    <Button size="sm" variant="secondary" onClick={() => updateLipaAccounts([...lipaAccounts, { label: `Account ${lipaAccounts.length + 1}`, number: '', qrImage: '' }])}><Plus size={14} /> Add account</Button>
                  </div>
                  <div className="space-y-3">
                    {lipaAccounts.map((account, index) => <div key={index} className="rounded-lg border border-outline-variant p-3 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Input label="Account name" value={account.label || ''} onChange={(event) => updateLipaAccounts(lipaAccounts.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
                          <Input label="Lipa Namba number" value={account.number || ''} onChange={(event) => updateLipaAccounts(lipaAccounts.map((item, itemIndex) => itemIndex === index ? { ...item, number: event.target.value } : item))} />
                        </div>
                        <button type="button" className="mt-6 p-2 text-primary hover:bg-primary/10 rounded-lg" onClick={() => updateLipaAccounts(lipaAccounts.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${account.label || 'account'}`} disabled={lipaAccounts.length === 1}><Trash2 size={16} /></button>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant text-xs font-semibold cursor-pointer hover:bg-surface-container-low"><Plus size={14} /> Upload QR image<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => uploadQr(index, event.target.files?.[0])} /></label>
                        {account.qrImage && <img src={account.qrImage} alt={`${account.label || 'Account'} QR preview`} className="w-12 h-12 object-contain border rounded" />}
                      </div>
                    </div>)}
                  </div>
                </div>
              </div>
            </Card>
          )}
          {activeSection === 'appearance' && (
            <Card>
              <h3 className="font-display font-bold mb-1">Website Motion</h3>
              <p className="text-sm text-surface-on-variant mb-4">Control how the public website reveals content while customers scroll.</p>
              <div className="space-y-4">
                <button onClick={() => update('public_animation_enabled', form.public_animation_enabled === 'true' ? 'false' : 'true')} className="w-full flex items-center justify-between p-3 bg-surface-container-low rounded-xl text-left">
                  <div><p className="font-semibold text-sm">Enable animations</p><p className="text-xs text-surface-on-variant">Respect reduced-motion preferences automatically.</p></div>
                  <div className={'w-10 h-5 rounded-full relative transition-colors ' + (form.public_animation_enabled === 'true' ? 'bg-success' : 'bg-outline-variant')}><div className={'w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ' + (form.public_animation_enabled === 'true' ? 'right-0.5' : 'left-0.5')} /></div>
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-semibold text-surface-on-variant uppercase mb-1.5">Reveal style</label><select className="input-field" value={form.public_animation_style || 'lift'} onChange={(e) => update('public_animation_style', e.target.value)}><option value="lift">Lift and fade</option><option value="fade">Fade only</option><option value="zoom">Zoom and fade</option></select></div>
                  <Input label="Duration (ms)" type="number" min="250" max="1500" step="50" value={form.public_animation_duration || '650'} onChange={(e) => update('public_animation_duration', e.target.value)} />
                </div>
                <button onClick={() => update('public_animation_replay', form.public_animation_replay === 'true' ? 'false' : 'true')} className="w-full flex items-center justify-between p-3 bg-surface-container-low rounded-xl text-left"><div><p className="font-semibold text-sm">Replay on re-entry</p><p className="text-xs text-surface-on-variant">Animate content each time it enters the viewport.</p></div><div className={'w-10 h-5 rounded-full relative transition-colors ' + (form.public_animation_replay === 'true' ? 'bg-success' : 'bg-outline-variant')}><div className={'w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ' + (form.public_animation_replay === 'true' ? 'right-0.5' : 'left-0.5')} /></div></button>
              </div>
            </Card>
          )}
          {activeSection === 'notifications' && (
            <Card>
              <h3 className="font-display font-bold mb-4">Notification Settings</h3>
              <p className="text-sm text-surface-on-variant mb-4">Low stock alerts and order notifications are enabled by default.</p>
              <Input label="Alert Email" value={form.email || ''} onChange={(e) => update('email', e.target.value)} />
            </Card>
          )}
          {activeSection === 'security' && (
            <Card>
              <h3 className="font-display font-bold mb-4">Security Settings</h3>
              <p className="text-sm text-surface-on-variant">Staff authenticate with 4-digit PINs. PINs are hashed server-side. Set JWT_SECRET in server environment for production.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
