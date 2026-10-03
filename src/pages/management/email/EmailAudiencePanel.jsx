import { useEffect, useState } from 'react';
import { Download, Plus, Search, ShieldCheck, Upload } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { api } from '../../../api/client';

const initialForm = { email: '', firstName: '', lastName: '', segment: 'regular', preferredChannel: 'email', consentConfirmed: false };

export default function EmailAudiencePanel({ onReport }) {
  const [result, setResult] = useState({ subscribers: [], total: 0, page: 1, pages: 1 });
  const [suppressions, setSuppressions] = useState([]);
  const [filters, setFilters] = useState({ search: '', segment: 'all', consent: 'all', page: 1 });
  const [form, setForm] = useState(initialForm);
  const [suppressionEmail, setSuppressionEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [importingOrders, setImportingOrders] = useState(false);

  const load = async () => {
    const [subscribers, blocked] = await Promise.all([api.getEmailSubscribers({ ...filters, limit: 25 }), api.getEmailSuppressions()]);
    setResult(subscribers);
    setSuppressions(blocked);
  };

  useEffect(() => { load().catch((error) => onReport('error', error.message || 'Unable to load audience.')); }, [filters.page, filters.segment, filters.consent, filters.search]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));

  const addSubscriber = async (event) => {
    event.preventDefault();
    if (!form.consentConfirmed) return onReport('error', 'Confirm documented customer opt-in before adding them to marketing.');
    setLoading(true);
    try {
      await api.createEmailSubscriber({ ...form, source: 'manual' });
      setForm(initialForm);
      await load();
      onReport('success', 'Consented subscriber added.');
    } catch (error) { onReport('error', error.message || 'Unable to add subscriber.'); }
    finally { setLoading(false); }
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const response = await api.importEmailSubscribers(await file.text());
      await load();
      onReport('success', `Imported ${response.imported}; skipped ${response.skipped} without valid email and explicit consent.`);
    } catch (error) { onReport('error', error.message || 'CSV import failed.'); }
    finally { setLoading(false); event.target.value = ''; }
  };

  const importOrderEmails = async () => {
    setImportingOrders(true);
    try {
      const result = await api.importOrderEmailContacts();
      await load();
      onReport('success', `Added ${result.added} order emails as pending consent. ${result.existing} already in the audience; ${result.suppressed} suppressed. No marketing emails were sent.`);
    } catch (error) { onReport('error', error.message || 'Unable to fetch order emails.'); }
    finally { setImportingOrders(false); }
  };

  const exportCsv = async () => {
    try {
      const blob = await api.downloadEmailSubscribers();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'wrap-roll-email-subscribers.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { onReport('error', error.message || 'Unable to export subscribers.'); }
  };

  const toggleConsent = async (subscriber) => {
    const nextStatus = subscriber.consent_status === 'subscribed' ? 'unsubscribed' : 'subscribed';
    if (nextStatus === 'subscribed' && !window.confirm(`Confirm ${subscriber.email} has explicitly opted back in?`)) return;
    try {
      await api.updateEmailSubscriber(subscriber.id, { consentStatus: nextStatus, consentConfirmed: nextStatus === 'subscribed' });
      await load();
      onReport('success', nextStatus === 'subscribed' ? 'Subscriber reactivated with recorded consent.' : 'Subscriber unsubscribed and suppressed.');
    } catch (error) { onReport('error', error.message || 'Unable to update consent.'); }
  };

  const addSuppression = async (event) => {
    event.preventDefault();
    try {
      await api.addEmailSuppression({ email: suppressionEmail, reason: 'manual suppression' });
      setSuppressionEmail('');
      await load();
      onReport('success', 'Address added to the suppression list.');
    } catch (error) { onReport('error', error.message || 'Unable to suppress address.'); }
  };

  const releaseSuppression = async (email) => {
    if (!window.confirm(`Remove ${email} from suppression? Only proceed if the customer explicitly opted back in.`)) return;
    try {
      await api.releaseEmailSuppression(email);
      await load();
      onReport('success', 'Suppression removed after consent confirmation.');
    } catch (error) { onReport('error', error.message || 'Unable to release suppression.'); }
  };

  return (
    <div className="min-w-0 space-y-5">
      <Card className="min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><Plus size={17} className="text-primary" /><h2 className="font-display text-base font-bold">Add a consented contact</h2></div>
        <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={addSubscriber}>
          <label className="block text-xs font-semibold">Email<input required type="email" className="input-field mt-1 w-full" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label className="block text-xs font-semibold">First name<input className="input-field mt-1 w-full" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label>
          <label className="block text-xs font-semibold">Last name<input className="input-field mt-1 w-full" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label>
          <label className="block text-xs font-semibold">Segment<select className="input-field mt-1 w-full" value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })}>{['regular', 'vip', 'inactive', 'birthday', 'loyalty'].map((segment) => <option key={segment}>{segment}</option>)}</select></label>
          <label className="flex items-start gap-2 text-xs sm:col-span-2 xl:col-span-3"><input type="checkbox" className="mt-0.5" checked={form.consentConfirmed} onChange={(event) => setForm({ ...form, consentConfirmed: event.target.checked })} /><span>I have recorded this customer’s explicit consent to receive marketing emails.</span></label>
          <Button type="submit" size="sm" disabled={loading || !form.consentConfirmed}><Plus size={14} /> Add contact</Button>
        </form>
      </Card>

      <Card className="min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-display text-base font-bold">Audience</h2><p className="mt-1 text-xs text-surface-on-variant">{result.total} contacts · campaign sends require subscribed consent and no suppression.</p></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={importOrderEmails} disabled={importingOrders}><Download size={14} /> {importingOrders ? 'Fetching...' : 'Fetch order emails'}</Button><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-xs font-bold"><Upload size={14} /> Import CSV<input type="file" accept=".csv,text/csv" className="sr-only" onChange={importCsv} /></label><Button size="sm" variant="secondary" onClick={exportCsv}><Download size={14} /> Export CSV</Button></div>
        </div>
        <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_160px_170px]">
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" /><input className="input-field w-full pl-9" placeholder="Search name or email" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} /></div>
          <select className="input-field" value={filters.segment} onChange={(event) => updateFilter('segment', event.target.value)}><option value="all">All segments</option>{['regular', 'vip', 'inactive', 'birthday', 'loyalty'].map((segment) => <option key={segment}>{segment}</option>)}</select>
          <select className="input-field" value={filters.consent} onChange={(event) => updateFilter('consent', event.target.value)}><option value="all">All consent states</option><option value="subscribed">Subscribed</option><option value="pending">Pending</option><option value="unsubscribed">Unsubscribed</option></select>
        </div>
        <div className="mt-4 min-w-0 max-w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs"><thead className="border-b border-outline-variant text-surface-on-variant"><tr><th className="py-2 pr-3">Contact</th><th className="py-2 pr-3">Segment</th><th className="py-2 pr-3">Source</th><th className="py-2 pr-3">Consent</th><th className="py-2">Recorded</th><th className="py-2 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-outline-variant">{result.subscribers.map((subscriber) => <tr key={subscriber.id}><td className="py-3 pr-3"><p className="font-semibold">{[subscriber.first_name, subscriber.last_name].filter(Boolean).join(' ') || subscriber.email}</p><p className="text-surface-on-variant">{subscriber.email}</p></td><td className="py-3 pr-3">{subscriber.segment}</td><td className="py-3 pr-3">{subscriber.source}</td><td className="py-3 pr-3 capitalize">{subscriber.consent_status}</td><td className="py-3">{subscriber.consent_at ? new Date(subscriber.consent_at).toLocaleDateString() : 'Not recorded'}</td><td className="py-3 text-right"><button className="font-bold text-primary" onClick={() => toggleConsent(subscriber)}>{subscriber.consent_status === 'subscribed' ? 'Unsubscribe' : 'Resubscribe'}</button></td></tr>)}</tbody>
          </table>
          {!result.subscribers.length && <p className="py-8 text-center text-xs text-surface-on-variant">No contacts match these filters.</p>}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs"><span>Page {result.page} of {Math.max(1, result.pages)}</span><div className="flex gap-2"><Button size="xs" variant="secondary" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</Button><Button size="xs" variant="secondary" disabled={filters.page >= result.pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</Button></div></div>
      </Card>

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <Card className="p-5"><div className="mb-3 flex items-center gap-2"><ShieldCheck size={16} className="text-primary" /><h2 className="font-display text-base font-bold">Suppression list</h2></div><div className="max-h-64 divide-y divide-outline-variant overflow-y-auto">{suppressions.map((item) => <div className="flex items-center justify-between gap-3 py-2 text-xs" key={item.email}><div><p className="font-semibold">{item.email}</p><p className="text-surface-on-variant">{item.reason} · {item.source}</p></div><Button size="xs" variant="secondary" onClick={() => releaseSuppression(item.email)}>Release</Button></div>)}{!suppressions.length && <p className="py-4 text-xs text-surface-on-variant">No suppressed addresses.</p>}</div></Card>
        <Card className="p-5"><h2 className="font-display text-base font-bold">Suppress an address</h2><p className="mt-1 text-xs text-surface-on-variant">Use for hard bounces, spam complaints, or customer requests. Suppressed addresses cannot receive campaigns.</p><form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={addSuppression}><input required type="email" className="input-field min-w-0 flex-1" value={suppressionEmail} onChange={(event) => setSuppressionEmail(event.target.value)} placeholder="customer@example.com" /><Button size="sm" type="submit">Suppress</Button></form></Card>
      </div>
    </div>
  );
}
