import { useEffect, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { api } from '../../api/client';
import { Mail, Users, Send, Sparkles, Plus } from 'lucide-react';

export default function EmailMarketingPage() {
  const [overview, setOverview] = useState({
    subscribers: 0,
    activeSubscribers: 0,
    vipSubscribers: 0,
    inactiveSubscribers: 0,
    campaigns: 0,
    sentCampaigns: 0,
    draftCampaigns: 0,
    smtpConfigured: false,
    lastCampaign: null,
  });
  const [subscribers, setSubscribers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [subForm, setSubForm] = useState({ email: '', firstName: '', lastName: '', segment: 'regular', preferredChannel: 'email' });
  const [campaignForm, setCampaignForm] = useState({ name: 'Wrap & Roll weekly newsletter', type: 'newsletter', segment: 'all', channel: 'email', offer: '15% off your next order', subject: 'Wrap & Roll this week' });

  const loadData = async () => {
    try {
      const [overviewData, subscribersData, campaignsData] = await Promise.all([
        api.getEmailMarketingOverview(),
        api.getEmailSubscribers(),
        api.getEmailCampaigns(),
      ]);
      setOverview(overviewData);
      setSubscribers(subscribersData);
      setCampaigns(campaignsData);
    } catch (error) {
      setMessage(error.message || 'Unable to load email marketing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const addSubscriber = async (event) => {
    event.preventDefault();
    try {
      const saved = await api.createEmailSubscriber(subForm);
      setSubscribers((current) => [saved, ...current]);
      setSubForm({ email: '', firstName: '', lastName: '', segment: 'regular', preferredChannel: 'email' });
      setMessage('Subscriber added to the self-hosted list.');
      await loadData();
    } catch (error) {
      setMessage(error.message || 'Unable to add subscriber');
    }
  };

  const createCampaign = async (event) => {
    event.preventDefault();
    try {
      const created = await api.createEmailCampaign(campaignForm);
      setCampaigns((current) => [created, ...current]);
      setCampaignForm({ name: 'Wrap & Roll weekly newsletter', type: 'newsletter', segment: 'all', channel: 'email', offer: '15% off your next order', subject: 'Wrap & Roll this week' });
      setMessage('Campaign draft created.');
    } catch (error) {
      setMessage(error.message || 'Unable to create campaign');
    }
  };

  const sendCampaign = async (id) => {
    try {
      const result = await api.sendEmailCampaign(id);
      setMessage(`Campaign sent to ${result.sentCount} customers in ${result.mode} mode.`);
      await loadData();
    } catch (error) {
      setMessage(error.message || 'Unable to send campaign');
    }
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading email marketing...</div>;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Self-Hosted Email Marketing" subtitle="Bulk campaigns, list management, and live sending for Wrap & Roll" actions={
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${overview.smtpConfigured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {overview.smtpConfigured ? 'SMTP ready' : 'SMTP setup needed'}
        </span>
      } />

      {message && <p className="mb-4 text-sm text-primary">{message}</p>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4"><p className="text-xs text-surface-on-variant">Subscribers</p><p className="text-2xl font-bold mt-2">{overview.subscribers}</p></Card>
        <Card className="p-4"><p className="text-xs text-surface-on-variant">Active</p><p className="text-2xl font-bold mt-2 text-green-600">{overview.activeSubscribers}</p></Card>
        <Card className="p-4"><p className="text-xs text-surface-on-variant">VIP</p><p className="text-2xl font-bold mt-2 text-violet-600">{overview.vipSubscribers}</p></Card>
        <Card className="p-4"><p className="text-xs text-surface-on-variant">Campaigns</p><p className="text-2xl font-bold mt-2 text-primary">{overview.campaigns}</p></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4"><Users size={16} className="text-primary" /><h3 className="font-bold text-sm">Add subscriber</h3></div>
          <form onSubmit={addSubscriber} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Email" type="email" value={subForm.email} onChange={(event) => setSubForm({ ...subForm, email: event.target.value })} />
            <Input label="Preferred channel" value={subForm.preferredChannel} onChange={(event) => setSubForm({ ...subForm, preferredChannel: event.target.value })} />
            <Input label="First name" value={subForm.firstName} onChange={(event) => setSubForm({ ...subForm, firstName: event.target.value })} />
            <Input label="Last name" value={subForm.lastName} onChange={(event) => setSubForm({ ...subForm, lastName: event.target.value })} />
            <label className="text-xs font-semibold md:col-span-2">
              Segment
              <select value={subForm.segment} onChange={(event) => setSubForm({ ...subForm, segment: event.target.value })} className="input-field mt-1 w-full">
                <option value="regular">Regular</option>
                <option value="vip">VIP</option>
                <option value="inactive">Inactive</option>
                <option value="birthday">Birthday</option>
                <option value="loyalty">Loyalty</option>
              </select>
            </label>
            <div className="md:col-span-2"><Button type="submit" size="sm"><Plus size={14} /> Add subscriber</Button></div>
          </form>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4"><Sparkles size={16} className="text-violet-600" /><h3 className="font-bold text-sm">Create campaign draft</h3></div>
          <form onSubmit={createCampaign} className="space-y-3">
            <Input label="Campaign name" value={campaignForm.name} onChange={(event) => setCampaignForm({ ...campaignForm, name: event.target.value })} />
            <Input label="Subject" value={campaignForm.subject} onChange={(event) => setCampaignForm({ ...campaignForm, subject: event.target.value })} />
            <Input label="Offer" value={campaignForm.offer} onChange={(event) => setCampaignForm({ ...campaignForm, offer: event.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold">
                Type
                <select value={campaignForm.type} onChange={(event) => setCampaignForm({ ...campaignForm, type: event.target.value })} className="input-field mt-1 w-full">
                  <option value="welcome">Welcome</option>
                  <option value="birthday">Birthday</option>
                  <option value="winback">Win-back</option>
                  <option value="thankyou">Thank you</option>
                  <option value="newsletter">Newsletter</option>
                  <option value="offer">Offer</option>
                </select>
              </label>
              <label className="text-xs font-semibold">
                Segment
                <select value={campaignForm.segment} onChange={(event) => setCampaignForm({ ...campaignForm, segment: event.target.value })} className="input-field mt-1 w-full">
                  <option value="all">All</option>
                  <option value="vip">VIP</option>
                  <option value="regular">Regular</option>
                  <option value="inactive">Inactive</option>
                  <option value="birthday">Birthday</option>
                </select>
              </label>
            </div>
            <Button type="submit" size="sm"><Mail size={14} /> Save draft</Button>
          </form>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3"><Users size={16} className="text-primary" /><h3 className="font-bold text-sm">Subscriber list</h3></div>
          <div className="space-y-2 max-h-[22rem] overflow-auto pr-1">
            {subscribers.length ? subscribers.slice(0, 12).map((subscriber) => (
              <div key={subscriber.id} className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold">{subscriber.first_name || subscriber.email.split('@')[0]}</p>
                  <p className="text-surface-on-variant">{subscriber.email}</p>
                </div>
                <span className="rounded-full bg-primary/10 text-primary px-2 py-1 font-semibold">{subscriber.segment}</span>
              </div>
            )) : <p className="text-xs text-surface-on-variant">No subscribers yet.</p>}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3"><Send size={16} className="text-green-600" /><h3 className="font-bold text-sm">Campaign queue</h3></div>
          <div className="space-y-2 max-h-[22rem] overflow-auto pr-1">
            {campaigns.length ? campaigns.map((campaign) => (
              <div key={campaign.id} className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{campaign.name}</p>
                    <p className="text-surface-on-variant">{campaign.subject}</p>
                  </div>
                  <span className="rounded-full bg-surface px-2 py-1 text-[10px] font-semibold uppercase">{campaign.status}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>{campaign.segment} · {campaign.channel}</span>
                  <Button size="xs" onClick={() => sendCampaign(campaign.id)}>Send</Button>
                </div>
              </div>
            )) : <p className="text-xs text-surface-on-variant">No campaigns yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
