import { useEffect, useState } from 'react';
import { Activity, FileText, Mail, Send, Settings2, Users, Workflow } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import Card from '../../../components/ui/Card';
import { api } from '../../../api/client';
import EmailCampaignsPanel from './EmailCampaignsPanel';
import EmailAudiencePanel from './EmailAudiencePanel';
import EmailAutomationsPanel from './EmailAutomationsPanel';
import EmailTemplatesPanel from './EmailTemplatesPanel';
import EmailDeliveriesPanel from './EmailDeliveriesPanel';
import EmailSetupPanel from './EmailSetupPanel';
import useAuthStore from '../../../store/useAuthStore';

const tabs = [
  { id: 'overview', label: 'Overview', Icon: Activity },
  { id: 'campaigns', label: 'Campaigns', Icon: Send },
  { id: 'audience', label: 'Audience', Icon: Users },
  { id: 'automations', label: 'Automations', Icon: Workflow },
  { id: 'templates', label: 'Templates', Icon: FileText },
  { id: 'deliveries', label: 'Delivery log', Icon: Mail },
  { id: 'setup', label: 'Sending setup', Icon: Settings2 },
];

function Overview({ overview, campaigns, onNavigate }) {
  const deliveryReady = Boolean(overview.deliveryConfigured || overview.smtpConfigured);
  const postalAddressReady = Boolean(overview.postalAddressConfigured);
  const metrics = [
    ['Consented contacts', overview.consentedSubscribers || 0],
    ['Pending consent', overview.pendingConsent || 0],
    ['Campaigns sent', overview.sentCampaigns || 0],
    ['Suppressions', overview.suppressions || 0],
  ];
  return (
    <div className="min-w-0 space-y-5">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => <Card className="min-w-0 p-4" key={label}><p className="text-xs text-surface-on-variant">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></Card>)}
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="min-w-0 p-4 sm:p-5">
          <h2 className="font-display text-base font-bold">Deliverability snapshot</h2>
          <p className="mt-1 text-xs text-surface-on-variant">Lifetime campaign delivery and engagement events.</p>
          <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-surface-on-variant">Accepted</p><strong>{overview.delivery?.sent || 0}</strong></div>
            <div><p className="text-xs text-surface-on-variant">Opens</p><strong>{overview.delivery?.opened || 0}</strong></div>
            <div><p className="text-xs text-surface-on-variant">Clicks</p><strong>{overview.delivery?.clicked || 0}</strong></div>
            <div><p className="text-xs text-surface-on-variant">Failures</p><strong>{overview.delivery?.failed || 0}</strong></div>
          </div>
          <button className="mt-5 text-xs font-bold text-primary" onClick={() => onNavigate('setup')}>Review sending setup</button>
        </Card>
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-base font-bold">Recent campaigns</h2><p className="mt-1 text-xs text-surface-on-variant">Drafts, scheduled sends, and delivery results.</p></div><button className="text-xs font-bold text-primary" onClick={() => onNavigate('campaigns')}>All campaigns</button></div>
          <div className="mt-4 divide-y divide-outline-variant">
            {campaigns.slice(0, 5).map((campaign) => <div key={campaign.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="truncate font-semibold">{campaign.name}</p><p className="text-xs text-surface-on-variant">{campaign.segment} · {campaign.total_target || 0} recipients</p></div><span className="shrink-0 rounded-full bg-surface-container-low px-2 py-1 text-[10px] font-bold uppercase">{campaign.status}</span></div>)}
            {!campaigns.length && <p className="py-5 text-xs text-surface-on-variant">No campaigns yet.</p>}
          </div>
        </Card>
      </div>
      {!deliveryReady && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Email provider is not configured.</strong> Configure Resend or an SMTP relay in Sending setup before sending campaigns.</div>}
      {deliveryReady && !postalAddressReady && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Postal address is required.</strong> Set EMAIL_POSTAL_ADDRESS in Railway before sending marketing campaigns.</div>}
    </div>
  );
}

export default function EmailMarketingWorkspace() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((key) => key + 1);
  const report = (type, text) => { setNotice({ type, text }); refresh(); };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [summary, rows] = await Promise.all([api.getEmailMarketingOverview(), api.getEmailCampaigns()]);
        if (!cancelled) {
          setOverview(summary);
          setCampaigns(rows);
          setNotice(null);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({ type: 'error', text: error.message || 'Unable to load email marketing.' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (currentUser) {
      load();
    }

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, refreshKey]);

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading email marketing...</div>;

  return (
    <div className="w-full min-w-0 p-3 sm:p-6">
      <PageHeader mobileStack title="Email Marketing" subtitle="Consent-based campaigns, customer journeys, and delivery health" actions={
        <span className={`max-w-full break-words rounded-full px-3 py-1.5 text-xs font-bold ${overview.deliveryConfigured || overview.smtpConfigured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
          {(overview.deliveryConfigured || overview.smtpConfigured) && overview.postalAddressConfigured ? `Sending ready · ${overview.address || 'sender configured'}` : (overview.deliveryConfigured || overview.smtpConfigured) ? 'Postal address needed' : 'Sending setup needed'}
        </span>
      } />
      {notice && <div role="status" className={`mb-4 min-w-0 break-words rounded-lg px-3 py-2 text-sm ${notice.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-surface-container-low text-surface-on'}`}>{notice.text}</div>}
      <nav aria-label="Email marketing sections" className="mb-6 grid min-w-0 grid-cols-2 gap-1 border-b border-outline-variant pb-2 sm:flex sm:flex-wrap sm:gap-2">
        {tabs.map(({ id, label, Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-[11px] font-bold sm:shrink-0 sm:justify-start sm:px-3 sm:text-xs ${activeTab === id ? 'border-primary text-primary' : 'border-transparent text-surface-on-variant hover:text-surface-on'}`}><Icon size={15} />{label}</button>)}
      </nav>
      {activeTab === 'overview' && <Overview overview={overview} campaigns={campaigns} onNavigate={setActiveTab} />}
      {activeTab === 'campaigns' && <EmailCampaignsPanel campaigns={campaigns} onReport={report} />}
      {activeTab === 'audience' && <EmailAudiencePanel onReport={report} />}
      {activeTab === 'automations' && <EmailAutomationsPanel onReport={report} />}
      {activeTab === 'templates' && <EmailTemplatesPanel onReport={report} />}
      {activeTab === 'deliveries' && <EmailDeliveriesPanel />}
      {activeTab === 'setup' && <EmailSetupPanel onReport={report} />}
    </div>
  );
}
