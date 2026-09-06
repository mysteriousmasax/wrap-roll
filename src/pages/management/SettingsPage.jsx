import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { api } from '../../api/client';
import useSettingsStore from '../../store/useSettingsStore';
import { Save, Store, Receipt, CreditCard, Globe, Shield, Bell, MessageCircle, Plus, Trash2, Brain, Download } from 'lucide-react';
import { downloadAsset } from '../../utils/downloadAsset';

const sections = [
  { id: 'general', label: 'General', icon: Store },
  { id: 'tax', label: 'Tax & Currency', icon: Receipt },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'appearance', label: 'Website Motion', icon: Globe },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'chat', label: 'Chat Auto-Replies', icon: MessageCircle },
  { id: 'security', label: 'Security', icon: Shield },
];

const WEEKDAYS = [
  ['monday', 'Monday'], ['tuesday', 'Tuesday'], ['wednesday', 'Wednesday'],
  ['thursday', 'Thursday'], ['friday', 'Friday'], ['saturday', 'Saturday'], ['sunday', 'Sunday'],
];

function parseWeeklyHours(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) return parsed;
  } catch {}
  return Object.fromEntries(WEEKDAYS.map(([key]) => [key, { closed: false, periods: [{ open: '07:00', close: '23:00' }] }]));
}

function readLipaAccounts(value, fallback = '123456') {
  try {
    const parsed = JSON.parse(value || '[]');
    if (Array.isArray(parsed) && parsed.length) return parsed.map((account) => ({ ...account, useInternalQr: account.useInternalQr !== false }));
  } catch {}
  return [{ label: 'Main Lipa Namba', number: fallback, qrImage: '', useInternalQr: true }];
}

export default function SettingsPage() {
  const { settings, saveSettings, loaded } = useSettingsStore();
  const [activeSection, setActiveSection] = useState('general');
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [lipaAccounts, setLipaAccounts] = useState([]);
  const [weeklyHours, setWeeklyHours] = useState(parseWeeklyHours(''));
  const [chatFaqs, setChatFaqs] = useState([]);
  const [faqForm, setFaqForm] = useState({ question: '', keywords: '', answer: '', answerSw: '' });
  const [editingFaqId, setEditingFaqId] = useState(null);
  const [training, setTraining] = useState(null);
  const [aiActivity, setAiActivity] = useState([]);
  const [retraining, setRetraining] = useState(false);

  useEffect(() => {
    if (loaded) {
      setForm({ ...settings });
      setLipaAccounts(readLipaAccounts(settings.lipa_namba_accounts, settings.lipa_namba_number));
      setWeeklyHours(parseWeeklyHours(settings.weekly_hours));
    }
  }, [loaded, settings]);

  useEffect(() => {
    if (loaded && activeSection === 'chat') {
      api.getChatFaqs().then(setChatFaqs).catch(() => setMessage('Unable to load chat auto-replies'));
      api.getChatTraining().then(setTraining).catch(() => setMessage('Unable to load training results'));
      api.getAiActivity().then((result) => setAiActivity(result.activity || [])).catch(() => setMessage('Unable to load AI activity'));
    }
  }, [activeSection, loaded]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const updateWeeklyHours = (day, patch) => {
    const next = { ...weeklyHours, [day]: { ...weeklyHours[day], ...patch } };
    setWeeklyHours(next);
    update('weekly_hours', JSON.stringify(next));
  };

  const updatePeriod = (day, index, field, value) => {
    const periods = (weeklyHours[day]?.periods || []).map((period, periodIndex) => periodIndex === index ? { ...period, [field]: value } : period);
    updateWeeklyHours(day, { periods });
  };

  const addPeriod = (day) => updateWeeklyHours(day, { periods: [...(weeklyHours[day]?.periods || []), { open: '17:00', close: '22:00' }] });

  const removePeriod = (day, index) => updateWeeklyHours(day, { periods: (weeklyHours[day]?.periods || []).filter((_, periodIndex) => periodIndex !== index) });

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

  const downloadQr = async (account) => {
    if (!account.qrImage) return;
    try {
      await downloadAsset(account.qrImage, `wrap-roll-${account.label || 'lipa-namba'}-qr`);
    } catch (error) {
      setMessage(error.message || 'Unable to download the QR image');
    }
  };

  const saveFaq = async (event) => {
    event.preventDefault();
    try {
      const saved = editingFaqId ? await api.updateChatFaq(editingFaqId, faqForm) : await api.createChatFaq(faqForm);
      setChatFaqs((current) => editingFaqId ? current.map((faq) => faq.id === saved.id ? saved : faq) : [...current, saved]);
      setFaqForm({ question: '', keywords: '', answer: '', answerSw: '' });
      setEditingFaqId(null);
      setMessage('Chat auto-reply saved successfully');
    } catch (error) {
      setMessage(error.message || 'Unable to save chat auto-reply');
    }
  };

  const editFaq = (faq) => {
    setEditingFaqId(faq.id);
    setFaqForm({ question: faq.question, keywords: faq.keywords, answer: faq.answer, answerSw: faq.answer_sw || '' });
  };

  const retrainAssistant = async () => {
    setRetraining(true);
    try {
      const result = await api.retrainChatAssistant();
      api.getAiActivity().then((activity) => setAiActivity(activity.activity || [])).catch(() => {});
      setTraining((current) => ({ ...(current || {}), latest: result.run, stats: { approvedExamples: result.run.approved_examples, bilingualExamples: result.run.bilingual_examples, staffExamples: result.run.staff_examples } }));
      setMessage('Assistant retrained successfully');
    } catch (error) {
      setMessage(error.message || 'Unable to retrain assistant');
    } finally {
      setRetraining(false);
    }
  };

  const disableFaq = async (id) => {
    try {
      await api.deleteChatFaq(id);
      setChatFaqs((current) => current.map((faq) => faq.id === id ? { ...faq, active: 0 } : faq));
    } catch (error) {
      setMessage(error.message || 'Unable to disable chat auto-reply');
    }
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
                <Input label="Google Maps URL" value={form.google_maps_url || ''} onChange={(e) => update('google_maps_url', e.target.value)} />
                <Input label="Google Maps Embed URL" value={form.google_maps_embed_url || ''} onChange={(e) => update('google_maps_embed_url', e.target.value)} />
                <Input label="Phone Number" value={form.phone || ''} onChange={(e) => update('phone', e.target.value)} />
                <Input label="Email" value={form.email || ''} onChange={(e) => update('email', e.target.value)} />
                <Input label="Operating Hours" value={form.operating_hours || ''} onChange={(e) => update('operating_hours', e.target.value)} />
                <Input label="Timezone" value={form.timezone || ''} onChange={(e) => update('timezone', e.target.value)} />
                <Input label="Lipa Namba Number" value={form.lipa_namba_number || ''} onChange={(e) => update('lipa_namba_number', e.target.value)} />
              </div>
              <div className="mt-6 border-t border-outline-variant pt-5">
                <div className="mb-3"><h4 className="font-semibold text-sm">Opening hours by day</h4><p className="text-xs text-surface-on-variant">Set closed days and split hours for lunch breaks or evening service. These hours are stored with your business settings.</p></div>
                <div className="space-y-2">
                  {WEEKDAYS.map(([day, label]) => {
                    const value = weeklyHours[day] || { closed: false, periods: [] };
                    return <div key={day} className="rounded-lg border border-outline-variant p-3">
                      <div className="flex items-center justify-between gap-3 mb-2"><span className="font-semibold text-sm">{label}</span><label className="inline-flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={Boolean(value.closed)} onChange={(event) => updateWeeklyHours(day, { closed: event.target.checked })} /> Closed</label></div>
                      {!value.closed && <div className="space-y-2">{(value.periods || []).map((period, index) => <div className="flex items-end gap-2" key={`${day}-${index}`}><label className="flex-1 text-[10px] font-semibold uppercase text-surface-on-variant">Opens<input className="input-field mt-1" type="time" value={period.open || ''} onChange={(event) => updatePeriod(day, index, 'open', event.target.value)} /></label><label className="flex-1 text-[10px] font-semibold uppercase text-surface-on-variant">Closes<input className="input-field mt-1" type="time" value={period.close || ''} onChange={(event) => updatePeriod(day, index, 'close', event.target.value)} /></label>{(value.periods || []).length > 1 && <button type="button" className="mb-1 px-2 py-2 text-xs font-semibold text-error" onClick={() => removePeriod(day, index)}>Remove</button>}</div>)}<button type="button" className="text-xs font-semibold text-primary" onClick={() => addPeriod(day)}>+ Add another period</button></div>}
                    </div>;
                  })}
                </div>
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
                    <Button size="sm" variant="secondary" onClick={() => updateLipaAccounts([...lipaAccounts, { label: `Account ${lipaAccounts.length + 1}`, number: '', qrImage: '', useInternalQr: true }])}><Plus size={14} /> Add account</Button>
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
                        <label className="inline-flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={account.useInternalQr !== false} onChange={(event) => updateLipaAccounts(lipaAccounts.map((item, itemIndex) => itemIndex === index ? { ...item, useInternalQr: event.target.checked } : item))} /> Use internal QR</label>
                        {account.qrImage && !account.useInternalQr && <><img src={account.qrImage} alt={`${account.label || 'Account'} QR preview`} className="w-12 h-12 object-contain border rounded" /><button type="button" title="Download QR image" onClick={() => downloadQr(account)} className="rounded-lg border border-outline-variant p-2 text-primary hover:bg-surface-container-low"><Download size={14} /></button></>}
                      </div>
                      <p className="text-xs text-surface-on-variant">Internal QR is generated from the Lipa Namba number and is recommended when an uploaded image is blurry or low quality.</p>
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
          {activeSection === 'chat' && (
            <Card>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div><h3 className="font-display font-bold">Chat Auto-Replies</h3><p className="text-sm text-surface-on-variant mt-1">Answers sent automatically when a customer asks a matching question.</p></div>
                <Button size="sm" variant="secondary" onClick={retrainAssistant} disabled={retraining}><Brain size={14} /> {retraining ? 'Retraining...' : 'Retrain assistant'}</Button>
                {editingFaqId && <Button size="sm" variant="secondary" onClick={() => { setEditingFaqId(null); setFaqForm({ question: '', keywords: '', answer: '', answerSw: '' }); }}>Cancel edit</Button>}
              </div>
              <form onSubmit={saveFaq} className="space-y-3 mb-6">
                <Input label="Question label" value={faqForm.question} onChange={(event) => setFaqForm({ ...faqForm, question: event.target.value })} placeholder="Where are you located?" />
                <Input label="Matching keywords" value={faqForm.keywords} onChange={(event) => setFaqForm({ ...faqForm, keywords: event.target.value })} placeholder="location, address, directions" />
                <div><label className="block text-xs font-semibold text-surface-on-variant uppercase mb-1.5">Answer</label><textarea className="input-field min-h-24" value={faqForm.answer} onChange={(event) => setFaqForm({ ...faqForm, answer: event.target.value })} placeholder="Write the customer-facing answer" required /></div>
                <div><label className="block text-xs font-semibold text-surface-on-variant uppercase mb-1.5">Swahili answer</label><textarea className="input-field min-h-24" value={faqForm.answerSw} onChange={(event) => setFaqForm({ ...faqForm, answerSw: event.target.value })} placeholder="Andika jibu la mteja kwa Kiswahili" /></div>
                <Button type="submit" size="sm"><Save size={14} /> {editingFaqId ? 'Update auto-reply' : 'Add auto-reply'}</Button>
              </form>
              {training && <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-xl bg-surface-container-low p-3"><p className="text-xs text-surface-on-variant">Approved examples</p><p className="mt-1 text-xl font-bold">{training.stats?.approvedExamples || 0}</p></div><div className="rounded-xl bg-surface-container-low p-3"><p className="text-xs text-surface-on-variant">Bilingual examples</p><p className="mt-1 text-xl font-bold">{training.stats?.bilingualExamples || 0}</p></div><div className="rounded-xl bg-surface-container-low p-3"><p className="text-xs text-surface-on-variant">Staff examples</p><p className="mt-1 text-xl font-bold">{training.stats?.staffExamples || 0}</p></div><p className="sm:col-span-3 text-xs text-surface-on-variant">{training.latest?.result || 'No retraining run yet. Add approved answers, then retrain the assistant.'}</p></div>}
              <div className="mb-6 rounded-xl border border-outline-variant p-3">
                <div className="flex items-center justify-between gap-3"><div><h4 className="font-display font-bold text-sm">AI activity</h4><p className="mt-1 text-xs text-surface-on-variant">Every AI feature records its page, action, provider, and result.</p></div><span className="text-xs text-surface-on-variant">{aiActivity.length} recent calls</span></div>
                <div className="mt-3 space-y-2">
                  {aiActivity.slice(0, 8).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-xs"><span className="font-semibold capitalize">{item.surface} / {item.action}</span><span className="text-surface-on-variant">{item.provider} · {item.status} · {item.durationMs}ms</span></div>)}
                  {!aiActivity.length && <p className="text-xs text-surface-on-variant">No AI calls recorded yet.</p>}
                </div>
              </div>
              <div className="space-y-2">
                {chatFaqs.map((faq) => <div key={faq.id} className={'border border-outline-variant rounded-lg p-3 ' + (!faq.active ? 'opacity-50' : '')}>
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-sm">{faq.question}</p><p className="text-[11px] text-surface-on-variant mt-1">Keywords: {faq.keywords}</p><p className="text-xs mt-2">{faq.answer}</p></div><div className="flex gap-1 shrink-0"><button type="button" className="text-xs font-semibold text-primary px-2 py-1" onClick={() => editFaq(faq)}>Edit</button>{faq.active ? <button type="button" className="text-xs font-semibold text-error px-2 py-1" onClick={() => disableFaq(faq.id)}>Disable</button> : <span className="text-xs text-surface-on-variant px-2 py-1">Disabled</span>}</div></div>
                </div>)}
              </div>
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
