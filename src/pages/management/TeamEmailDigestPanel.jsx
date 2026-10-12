import { useEffect, useRef, useState } from 'react';
import { BarChart3, ClipboardList, Mail, Package, Send, Users } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { api } from '../../api/client';

const frequencyOptions = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

function money(value, currency) {
  return `${Number(value || 0).toLocaleString('en-TZ')} ${currency || 'TZS'}`;
}

export default function TeamEmailDigestPanel() {
  const [frequency, setFrequency] = useState('daily');
  const [config, setConfig] = useState({ enabled: false, frequencies: frequencyOptions.map(({ id }) => id), sendHour: 8, topics: { financial: true, lowStock: true, kanban: true } });
  const [staff, setStaff] = useState([]);
  const [report, setReport] = useState(null);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const settingsLoaded = useRef(false);

  const load = async (selectedFrequency = frequency) => {
    try {
      const data = await api.getEmailTeamDigest(selectedFrequency);
      if (!settingsLoaded.current) {
        setConfig(data.config);
        settingsLoaded.current = true;
      }
      setStaff(data.staff || []);
      setReport(data.report);
      setSmtpConfigured(Boolean(data.smtpConfigured));
    } catch (error) {
      setMessage(error.message || 'Unable to load staff email reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(frequency); }, [frequency]);

  const updateTopic = (topic) => setConfig((current) => ({ ...current, topics: { ...current.topics, [topic]: !current.topics[topic] } }));
  const toggleFrequency = (value) => setConfig((current) => ({
    ...current,
    frequencies: current.frequencies.includes(value)
      ? current.frequencies.filter((item) => item !== value)
      : [...current.frequencies, value],
  }));

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const result = await api.saveEmailTeamDigest(config);
      setConfig(result.config);
      setMessage('Staff report schedule saved.');
    } catch (error) {
      setMessage(error.message || 'Unable to save staff report settings.');
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    setMessage('');
    try {
      const result = await api.sendEmailTeamDigest(frequency);
      setMessage(`Report sent to ${result.sent} staff${result.failed ? `; ${result.failed} failed` : ''}${result.skipped ? `; ${result.skipped} already received` : ''}.`);
    } catch (error) {
      setMessage(error.message || 'Unable to send staff report.');
    } finally {
      setSending(false);
    }
  };

  const availableRecipients = staff.filter((member) => member.email);
  const selectedRecipientIds = config.recipientStaffIds ?? availableRecipients.map((member) => member.id);
  const recipients = availableRecipients.filter((member) => selectedRecipientIds.includes(member.id));
  const missingEmail = staff.filter((member) => !member.email).length;
  const setRecipientIds = (recipientStaffIds) => setConfig((current) => ({ ...current, recipientStaffIds }));
  const toggleRecipient = (staffId) => setRecipientIds(
    selectedRecipientIds.includes(staffId)
      ? selectedRecipientIds.filter((id) => id !== staffId)
      : [...selectedRecipientIds, staffId]
  );

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-outline-variant px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Mail size={19} /></div>
          <div><h2 className="text-base font-bold">Staff reports &amp; alerts</h2><p className="mt-1 text-xs text-surface-on-variant">Internal financial analytics, low-stock alerts, and team Kanban by email</p></div>
        </div>
        <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${smtpConfigured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
          {smtpConfigured ? 'Email delivery ready' : 'Email delivery not configured'}
        </span>
      </div>

      {message && <p role="status" className="border-b border-outline-variant px-4 py-3 text-sm text-primary">{message}</p>}
      {loading ? <p className="p-4 text-sm text-surface-on-variant">Loading staff report preview...</p> : <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-5 p-4">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" checked={config.enabled} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} className="h-4 w-4 accent-primary" />
            Enable scheduled staff emails
          </label>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase text-surface-on-variant">Include in each email</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ['financial', 'Financial analytics', BarChart3],
                ['lowStock', 'Low stock', Package],
                ['kanban', 'Team Kanban', ClipboardList],
              ].map(([key, label, Icon]) => <label key={key} className="flex min-h-10 items-center gap-2 rounded-lg border border-outline-variant px-3 text-xs font-semibold">
                <input type="checkbox" checked={config.topics[key]} onChange={() => updateTopic(key)} className="h-4 w-4 accent-primary" />
                <Icon size={15} className="text-primary" />{label}
              </label>)}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-[1fr_10rem] sm:items-end">
            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase text-surface-on-variant">Schedule</legend>
              <div className="flex flex-wrap gap-4">
                {frequencyOptions.map(({ id, label }) => <label key={id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={config.frequencies.includes(id)} onChange={() => toggleFrequency(id)} className="h-4 w-4 accent-primary" />{label}
                </label>)}
              </div>
            </fieldset>
            <label className="text-xs font-semibold">Send after
              <select value={config.sendHour} onChange={(event) => setConfig({ ...config, sendHour: Number(event.target.value) })} className="input-field mt-1 w-full">
                {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase text-surface-on-variant">Report recipients</legend>
            <div className="mb-2 flex flex-wrap gap-2">
              <Button type="button" size="xs" variant="secondary" onClick={() => setRecipientIds(availableRecipients.map((member) => member.id))}>All active</Button>
              <Button type="button" size="xs" variant="secondary" disabled={!availableRecipients.some((member) => /admin/i.test(member.role || ''))} onClick={() => setRecipientIds(availableRecipients.filter((member) => /admin/i.test(member.role || '')).map((member) => member.id))}>Admins only</Button>
            </div>
            <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-outline-variant p-2 sm:grid-cols-2">
              {staff.map((member) => <label key={member.id} className={`flex min-w-0 items-center gap-2 rounded px-2 py-1.5 text-xs ${member.email ? 'cursor-pointer hover:bg-surface-container-low' : 'opacity-50'}`}>
                <input type="checkbox" checked={selectedRecipientIds.includes(member.id)} disabled={!member.email} onChange={() => toggleRecipient(member.id)} className="h-4 w-4 shrink-0 accent-primary" />
                <span className="min-w-0"><span className="block truncate font-semibold">{member.name} <span className="font-normal text-surface-on-variant">({member.role || 'staff'})</span></span><span className="block truncate text-surface-on-variant">{member.email || 'No linked email'}</span></span>
              </label>)}
              {!staff.length && <p className="p-2 text-xs text-surface-on-variant">No active staff or admin recipients are available.</p>}
            </div>
            <p className="mt-1 text-xs text-surface-on-variant">Selected: {recipients.length}</p>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabled={saving || !Object.values(config.topics).some(Boolean) || (config.enabled && recipients.length === 0)}><Mail size={14} />{saving ? 'Saving...' : 'Save schedule'}</Button>
            <Button size="sm" variant="secondary" onClick={sendNow} disabled={sending || !smtpConfigured || recipients.length === 0 || !Object.values(config.topics).some(Boolean)}><Send size={14} />{sending ? 'Sending...' : `Send ${frequency} now`}</Button>
          </div>
        </div>

        <aside className="border-t border-outline-variant bg-surface-container-low/50 p-4 xl:border-l xl:border-t-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><h3 className="text-sm font-bold">Preview</h3><p className="mt-1 text-xs text-surface-on-variant">{report?.period?.start} to {report?.period?.end}</p></div>
            <select aria-label="Preview reporting period" value={frequency} onChange={(event) => setFrequency(event.target.value)} className="input-field w-auto text-xs">
              {frequencyOptions.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>

          {report?.financial && <div className="mb-4 grid grid-cols-2 gap-x-3 gap-y-2 border-b border-outline-variant pb-4 text-xs">
            <span className="text-surface-on-variant">Revenue</span><strong className="text-right">{money(report.financial.revenue, report.financial.currency)}</strong>
            <span className="text-surface-on-variant">Orders</span><strong className="text-right">{report.financial.orders}</strong>
            <span className="text-surface-on-variant">Expenses</span><strong className="text-right">{money(report.financial.expenses, report.financial.currency)}</strong>
            <span className="text-surface-on-variant">Payroll booked</span><strong className="text-right">{money(report.financial.payroll, report.financial.currency)}</strong>
            <span className="text-surface-on-variant">Operating result</span><strong className="text-right">{money(report.financial.operatingResult, report.financial.currency)}</strong>
          </div>}

          {report?.lowStock && <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-bold"><Package size={14} className="text-warning" />Low stock <span className="text-surface-on-variant">{report.lowStock.length}</span></h4>
            {report.lowStock.length ? <ul className="space-y-1 text-xs">{report.lowStock.slice(0, 5).map((item) => <li key={item.name} className="flex justify-between gap-3"><span className="truncate">{item.name}</span><span className="shrink-0 text-surface-on-variant">{item.quantity} {item.unit}</span></li>)}</ul> : <p className="text-xs text-surface-on-variant">No items below threshold.</p>}
          </div>}

          {report?.kanban && <div>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-bold"><ClipboardList size={14} className="text-primary" />Open Kanban <span className="text-surface-on-variant">{report.kanban.length}</span></h4>
            {report.kanban.length ? <ul className="space-y-1 text-xs">{report.kanban.slice(0, 5).map((task, index) => <li key={`${task.staff_name}-${task.title}-${index}`} className="flex justify-between gap-3"><span className="truncate">{task.title}</span><span className="shrink-0 text-surface-on-variant">{task.staff_name}</span></li>)}</ul> : <p className="text-xs text-surface-on-variant">No open team tasks.</p>}
          </div>}

          <div className="mt-4 border-t border-outline-variant pt-3">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-bold"><Users size={14} className="text-primary" />Staff recipients <span className="text-surface-on-variant">{recipients.length}</span></h4>
            <div className="max-h-28 space-y-1 overflow-auto text-xs">
              {recipients.map((member) => <p key={member.id} className="flex justify-between gap-2"><span className="truncate">{member.name}</span><span className="truncate text-surface-on-variant">{member.email}</span></p>)}
              {!recipients.length && <p className="text-surface-on-variant">No staff emails are linked yet.</p>}
            </div>
            {missingEmail > 0 && <p className="mt-2 text-[11px] text-warning">{missingEmail} active staff {missingEmail === 1 ? 'member has' : 'members have'} no linked email and will not receive reports.</p>}
          </div>
        </aside>
      </div>}
    </Card>
  );
}