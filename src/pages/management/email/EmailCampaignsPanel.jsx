import { useEffect, useState } from 'react';
import { CalendarClock, Copy, MailCheck, Send, Trash2 } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { api } from '../../../api/client';

const segments = ['all', 'vip', 'regular', 'inactive', 'birthday', 'loyalty'];

export default function EmailCampaignsPanel({ campaigns, onReport }) {
  const [templates, setTemplates] = useState([]);
  const [smtpReady, setSmtpReady] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: '', type: 'newsletter', subject: '', preheader: '', body: '', offer: '', segment: 'all', templateId: '', scheduleFor: '' });
  const [editingId, setEditingId] = useState(null);
  const [testEmail, setTestEmail] = useState('');
  const [selectedTestCampaign, setSelectedTestCampaign] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    Promise.all([api.getEmailTemplates(), api.getEmailMarketingOverview()])
      .then(([rows, overview]) => { setTemplates(rows); setSmtpReady((overview.deliveryConfigured || overview.smtpConfigured) && overview.postalAddressConfigured); })
      .catch((error) => onReport('error', error.message || 'Unable to load campaign setup.'));
  }, []);

  const update = (key, value) => setCampaignForm((current) => ({ ...current, [key]: value }));

  const chooseTemplate = (id) => {
    const template = templates.find((item) => String(item.id) === String(id));
    setCampaignForm((current) => ({
      ...current,
      templateId: id,
      ...(template ? { name: current.name || template.name, subject: template.subject, preheader: template.preheader || '', body: template.body_text || '' } : {}),
    }));
  };

  const editCampaign = (campaign) => {
    let payload = {};
    try { payload = JSON.parse(campaign.payload || '{}'); } catch {}
    const schedule = campaign.scheduled_at ? new Date(campaign.scheduled_at) : null;
    const localSchedule = schedule ? new Date(schedule.getTime() - schedule.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    setEditingId(campaign.id);
    setCampaignForm({
      name: campaign.name,
      type: campaign.type || 'newsletter',
      subject: campaign.subject,
      preheader: campaign.preheader || '',
      body: campaign.body || '',
      offer: campaign.offer || '',
      segment: campaign.segment || 'all',
      templateId: String(payload.templateId || ''),
      scheduleFor: localSchedule,
    });
  };

  const plainTextHtml = (value) => `<div style="font-family:Arial,sans-serif;line-height:1.6">${String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])).split(/\r?\n/).map((line) => line || '&nbsp;').join('<br>')}</div>`;

  const saveCampaign = async (event) => {
    event.preventDefault();
    setWorking(true);
    try {
      const payload = { ...campaignForm, htmlBody: plainTextHtml(campaignForm.body), scheduleFor: campaignForm.scheduleFor ? new Date(campaignForm.scheduleFor).toISOString() : null };
      const saved = editingId ? await api.updateEmailCampaign(editingId, payload) : await api.createEmailCampaign(payload);
      setSelectedTestCampaign(String(saved.id));
      setEditingId(null);
      setCampaignForm({ name: '', type: 'newsletter', subject: '', preheader: '', body: '', offer: '', segment: 'all', templateId: '', scheduleFor: '' });
      onReport('success', saved.status === 'scheduled' ? 'Campaign scheduled.' : 'Campaign draft saved.');
    } catch (error) {
      onReport('error', error.message || 'Unable to save campaign.');
    } finally {
      setWorking(false);
    }
  };

  const queueCampaign = async (campaign) => {
    if (!smtpReady) return onReport('error', 'Configure and verify SMTP before queueing a campaign.');
    if (!window.confirm(`Queue “${campaign.name}” for opted-in ${campaign.segment} contacts?`)) return;
    setWorking(true);
    try {
      await api.sendEmailCampaign(campaign.id);
      setSelectedTestCampaign(String(campaign.id));
      onReport('success', 'Campaign queued. Delivery results will appear in the Delivery log.');
    } catch (error) {
      onReport('error', error.message || 'Unable to queue campaign.');
    } finally {
      setWorking(false);
    }
  };

  const testCampaign = async () => {
    if (!selectedTestCampaign || !testEmail.trim()) return onReport('error', 'Choose a campaign and enter a test address.');
    setWorking(true);
    try {
      const result = await api.testEmailCampaign(selectedTestCampaign, testEmail);
      onReport('success', `Test email accepted for ${result.recipient}.`);
    } catch (error) {
      onReport('error', error.message || 'Test email failed.');
    } finally {
      setWorking(false);
    }
  };

  const deleteCampaign = async (campaign) => {
    if (!window.confirm(`Delete draft “${campaign.name}”?`)) return;
    try { await api.deleteEmailCampaign(campaign.id); onReport('success', 'Draft deleted.'); }
    catch (error) { onReport('error', error.message || 'Unable to delete campaign.'); }
  };

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.4fr)]">
      <Card className="min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><MailCheck size={17} className="text-primary" /><h2 className="font-display text-base font-bold">{editingId ? 'Edit campaign' : 'Campaign editor'}</h2></div>
        <form className="space-y-3" onSubmit={saveCampaign}>
          <label className="block text-xs font-semibold">Start from a template
            <select className="input-field mt-1 w-full" value={campaignForm.templateId} onChange={(event) => chooseTemplate(event.target.value)}>
              <option value="">Blank campaign</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2"><Input label="Campaign name" required value={campaignForm.name} onChange={(event) => update('name', event.target.value)} /><label className="block text-xs font-semibold">Email type<select className="input-field mt-1 w-full" value={campaignForm.type} onChange={(event) => update('type', event.target.value)}>{[['newsletter', 'Newsletter'], ['new_menu', 'New menu'], ['holiday', 'Holiday'], ['event', 'Event'], ['offer', 'Offer'], ['thankyou', 'Thank you'], ['review_request', 'Review request'], ['birthday', 'Birthday'], ['winback', 'Win-back'], ['reservation', 'Reservation'], ['loyalty', 'Loyalty']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <Input label="Subject" required maxLength={180} value={campaignForm.subject} onChange={(event) => update('subject', event.target.value)} />
          <Input label="Preheader" value={campaignForm.preheader} onChange={(event) => update('preheader', event.target.value)} />
          <label className="block text-xs font-semibold">Message
            <textarea required rows={8} maxLength={20000} className="input-field mt-1 w-full" value={campaignForm.body} onChange={(event) => update('body', event.target.value)} placeholder="Use {{first_name}}, {{offer}}, and {{restaurant_name}} for personalization." />
          </label>
          <Input label="Offer / campaign detail" value={campaignForm.offer} onChange={(event) => update('offer', event.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold">Audience segment
              <select className="input-field mt-1 w-full" value={campaignForm.segment} onChange={(event) => update('segment', event.target.value)}>{segments.map((segment) => <option key={segment} value={segment}>{segment}</option>)}</select>
            </label>
            <Input label="Schedule (optional)" type="datetime-local" value={campaignForm.scheduleFor} onChange={(event) => update('scheduleFor', event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={working}><CalendarClock size={14} /> {working ? 'Saving...' : campaignForm.scheduleFor ? 'Schedule campaign' : editingId ? 'Save changes' : 'Save draft'}</Button>{editingId && <Button type="button" size="sm" variant="secondary" onClick={() => { setEditingId(null); setCampaignForm({ name: '', type: 'newsletter', subject: '', preheader: '', body: '', offer: '', segment: 'all', templateId: '', scheduleFor: '' }); }}>Cancel edit</Button>}</div>
        </form>
        <div className="mt-6 border-t border-outline-variant pt-4">
          <h3 className="text-sm font-bold">Test delivery</h3>
          <p className="mt-1 text-xs text-surface-on-variant">Test sends only to the address below, not to campaign contacts.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select className="input-field min-w-0 flex-1" value={selectedTestCampaign} onChange={(event) => setSelectedTestCampaign(event.target.value)} aria-label="Test campaign">
              <option value="">Select campaign</option>{campaigns.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.name}</option>)}
            </select>
            <input className="input-field min-w-0 flex-1" type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="test@example.com" aria-label="Test recipient email" />
            <Button type="button" size="sm" variant="secondary" onClick={testCampaign} disabled={working || !smtpReady}><Send size={14} /> Test</Button>
          </div>
        </div>
      </Card>

      <Card className="min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-display text-base font-bold">Campaigns</h2><p className="mt-1 text-xs text-surface-on-variant">Only subscribed, active, non-suppressed contacts are eligible.</p></div><span className="text-xs text-surface-on-variant">{campaigns.length} total</span></div>
        <div className="min-w-0 max-w-full overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs"><thead className="border-b border-outline-variant text-surface-on-variant"><tr><th className="py-2 pr-3">Campaign</th><th className="py-2 pr-3">Audience</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Delivery</th><th className="py-2 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-outline-variant">{campaigns.map((campaign) => <tr key={campaign.id}>
              <td className="py-3 pr-3"><p className="font-bold">{campaign.name}</p><p className="mt-1 text-surface-on-variant">{campaign.subject}</p>{campaign.scheduled_at && <p className="mt-1 text-[10px] text-surface-on-variant">{new Date(campaign.scheduled_at).toLocaleString()}</p>}</td>
              <td className="py-3 pr-3">{campaign.segment}</td><td className="py-3 pr-3"><span className="rounded-full bg-surface-container-low px-2 py-1 font-bold uppercase">{campaign.status}</span></td>
              <td className="py-3 pr-3">{campaign.sent_count || 0}/{campaign.total_target || 0} sent<p className="mt-1 text-[10px] text-surface-on-variant">{campaign.opened || 0} opens · {campaign.clicked || 0} clicks · {campaign.failed || 0} failed</p></td>
              <td className="py-3 text-right"><div className="flex justify-end gap-2">{['draft', 'scheduled', 'failed'].includes(campaign.status) && <Button size="xs" variant="secondary" onClick={() => editCampaign(campaign)}><Copy size={12} /> Edit</Button>}{['draft', 'failed'].includes(campaign.status) && <Button size="xs" onClick={() => queueCampaign(campaign)} disabled={working || !smtpReady}><Send size={12} /> Queue</Button>}{['draft', 'scheduled', 'failed'].includes(campaign.status) && <Button size="xs" variant="danger" onClick={() => deleteCampaign(campaign)} aria-label={`Delete ${campaign.name}`}><Trash2 size={12} /></Button>}</div></td>
            </tr>)}</tbody>
          </table>
          {!campaigns.length && <p className="py-8 text-center text-xs text-surface-on-variant">No campaigns yet. Create a draft or schedule your first send.</p>}
        </div>
      </Card>
    </div>
  );
}
