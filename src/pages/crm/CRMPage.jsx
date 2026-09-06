import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import { Search, Users, Star, AlertTriangle, Crown, TabletSmartphone, Mail, Instagram, Facebook, MessageSquareText, UtensilsCrossed, MapPinned, Gift, CalendarDays, Save, Sparkles, ShieldAlert, Send, Brain, Target } from 'lucide-react';

function WhatsAppLogo({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 2.5C8.56 2.5 2.5 8.56 2.5 16c0 2.23.57 4.43 1.62 6.34L2.5 29.5l7.2-1.58A13.5 13.5 0 1 0 16 2.5Z" fill="#25D366"/>
      <path d="M12.87 9.53c-.51-.98-1.1-.95-1.51-.96h-.84c-.4 0-.96.12-1.47.64-.5.52-1.91 1.86-1.91 4.53 0 2.67 1.96 5.27 2.23 5.64.28.37 3.75 5.95 9.24 8.09 4.46 1.76 5.36 1.41 6.32 1.32.96-.09 3.14-1.28 3.57-2.6.42-1.31.42-2.44.3-2.68-.12-.25-.44-.39-1-.7-.55-.3-3.11-1.52-3.59-1.7-.47-.18-.82-.27-1.16.25-.35.54-1.38 1.7-1.72 2.01-.35.31-.69.32-1.42.11-.74-.21-2.34-1.13-4.18-3.03-1.56-1.61-2.31-3.15-2.57-3.89-.27-.73-.1-1.13.27-1.7.27-.42.73-1.05.97-1.4.25-.35.4-.75.09-1.63-.32-.89-1.31-2.77-1.66-3.56Z" fill="#fff"/>
    </svg>
  );
}

const channelMeta = {
  whatsapp: { label: 'WhatsApp', Icon: MessageSquareText, color: 'whatsapp' },
  sms: { label: 'SMS', Icon: TabletSmartphone, color: 'sms' },
  email: { label: 'Email', Icon: Mail, color: 'email' },
  instagram: { label: 'Instagram', Icon: Instagram, color: 'instagram' },
  facebook: { label: 'Facebook', Icon: Facebook, color: 'facebook' },
  pos: { label: 'In-person', Icon: MapPinned, color: 'pos' },
};

export default function CRMPage() {
  const [customers, setCustomers] = useState([]);
  const [holidayFeed, setHolidayFeed] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({});
  const [status, setStatus] = useState('');
  const [intelligence, setIntelligence] = useState(null);
  const [aiOutput, setAiOutput] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const loadCustomers = async () => {
    const data = await api.getCustomers();
    setCustomers(data);
    if (!selectedCustomerId && data[0]) setSelectedCustomerId(data[0].id);
    if (selectedCustomerId) {
      const match = data.find((customer) => customer.id === selectedCustomerId);
      if (match) setCustomerForm({
        birthday: match.birthday || '',
        anniversary: match.anniversary || '',
        customerSegment: match.customerSegment || match.customer_segment || 'regular',
        nfcTagCode: match.nfcTagCode || match.nfc_tag_code || '',
        nfcTagType: match.nfcTagType || match.nfc_tag_type || 'key_holder',
        loyaltyNotes: match.loyaltyNotes || match.loyalty_notes || '',
        preferredChannel: match.preferredChannel || match.preferred_channel || 'pos',
      });
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [customersData, calendarData, intelligenceData] = await Promise.all([
          api.getCustomers(),
          api.getHolidayFeed(),
          api.getCrmIntelligence(),
        ]);
        setCustomers(customersData);
        setHolidayFeed(calendarData);
        setIntelligence(intelligenceData);
        if (customersData[0]) {
          setSelectedCustomerId(customersData[0].id);
          setCustomerForm({
            birthday: customersData[0].birthday || '',
            anniversary: customersData[0].anniversary || '',
            customerSegment: customersData[0].customerSegment || customersData[0].customer_segment || 'regular',
            nfcTagCode: customersData[0].nfcTagCode || customersData[0].nfc_tag_code || '',
            nfcTagType: customersData[0].nfcTagType || customersData[0].nfc_tag_type || 'key_holder',
            loyaltyNotes: customersData[0].loyaltyNotes || customersData[0].loyalty_notes || '',
            preferredChannel: customersData[0].preferredChannel || customersData[0].preferred_channel || 'pos',
          });
        }
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) || customers[0] || null;

  const openWhatsApp = (customer) => {
    const phoneNumber = (customer?.phone || '255712345678').replace(/\D/g, '');
    const message = encodeURIComponent(`Hello ${customer?.name || 'Wrap & Roll'}, we would love to serve you again soon.`);
    const whatsappAppUrl = `whatsapp://send?phone=${phoneNumber}&text=${message}`;
    const whatsappWebUrl = `https://wa.me/${phoneNumber}?text=${message}`;

    const newWindow = window.open(whatsappAppUrl, '_blank');
    if (!newWindow) {
      window.location.href = whatsappWebUrl;
      return;
    }

    setTimeout(() => {
      window.open(whatsappWebUrl, '_blank', 'noopener,noreferrer');
    }, 500);
  };

  const filtered = customers.filter((customer) => {
    const matchesSearch = customer.name.toLowerCase().includes(search.toLowerCase());
    const matchesChannel = channelFilter === 'all' || customer.channel === channelFilter || customer.channels?.[channelFilter];
    return matchesSearch && matchesChannel;
  });

  const handleCustomerChange = (key, value) => setCustomerForm((current) => ({ ...current, [key]: value }));

  const saveCustomerProfile = async () => {
    if (!selectedCustomer) return;
    setSavingCustomer(true);
    try {
      await api.updateCustomerLoyalty(selectedCustomer.id, { ...customerForm });
      await loadCustomers();
      setStatus('Customer loyalty profile saved.');
    } catch (error) {
      setStatus(error.message || 'Unable to save loyalty info.');
    } finally {
      setSavingCustomer(false);
    }
  };

  const sendHolidayNotice = async () => {
    try {
      const response = await api.dispatchHolidayNotifications();
      setStatus(`Holiday alert sent to ${response.sentCount} customers.`);
    } catch (error) {
      setStatus(error.message || 'Unable to dispatch event notifications');
    }
  };

  const runAi = async (action, question = '') => {
    setAiLoading(true);
    try {
      const result = question ? await api.askCrmAssistant(question) : await action();
      setAiOutput(result.report || result.answer || 'No analysis returned.');
    } catch (error) {
      setAiOutput(error.message || 'Unable to generate CRM analysis');
    } finally {
      setAiLoading(false);
    }
  };

  const requestAction = async (type, payload) => {
    try {
      await api.requestCrmAction(type, payload);
      setStatus('Action submitted for staff approval.');
    } catch (error) {
      setStatus(error.message || 'Unable to submit action');
    }
  };

  const vipCount = customers.filter((customer) => customer.tier === 'VIP').length;
  const atRiskCount = customers.filter((customer) => customer.atRisk).length;
  const totalLtv = customers.reduce((sum, customer) => sum + Number(customer.lifetimeValue || 0), 0);
  const dineInCustomers = customers.filter((customer) => Number(customer.dineInVisits || 0) > 0).length;
  const topCategory = customers.reduce((acc, customer) => {
    if (!customer.preferredCategory || customer.preferredCategory === 'General') return acc;
    return acc || customer.preferredCategory;
  }, 'General');
  const channelTotals = Object.keys(channelMeta).reduce((acc, key) => {
    acc[key] = customers.filter((customer) => customer.channels?.[key]).length;
    return acc;
  }, {});

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading customers...</div>;

  return (
    <div className="crm-dashboard-shell p-4 sm:p-6">
      <PageHeader title="CRM & Loyalty" subtitle="Customer relationship management and retention" actions={
        <Button variant="whatsapp" size="sm" onClick={() => openWhatsApp(customers[0])}><WhatsAppLogo /> WhatsApp</Button>
      } />

      {intelligence && <>
        <div className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-6">
          {[['Customers', intelligence.customerSummary.total, Users], ['VIP', intelligence.customerSummary.vip, Crown], ['Inactive', intelligence.customerSummary.inactive, CalendarDays], ['At risk', intelligence.customerSummary.atRisk, AlertTriangle], ['Unpaid orders', intelligence.risks.unpaidOrders.count, ShieldAlert], ['Low stock', intelligence.risks.lowStock.length, Target]].map(([label, value, Icon]) => <Card key={label} className="p-3"><Icon size={15} className="text-primary" /><p className="mt-2 text-[10px] text-surface-on-variant">{label}</p><p className="text-xl font-bold">{value}</p></Card>)}
        </div>
        <Card className="mb-6 border border-primary/20 bg-primary/5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-display font-bold text-sm">CRM intelligence cockpit</h3><p className="mt-1 text-xs text-surface-on-variant">Deterministic customer data first, Gemini analysis second. Actions require approval.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => runAi(api.generateCrmSwot)} disabled={aiLoading}><Brain size={14} /> SWOT</Button><Button size="sm" variant="secondary" onClick={() => runAi(api.generateDailyBriefing)} disabled={aiLoading}><Sparkles size={14} /> Daily briefing</Button></div></div>
          <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); runAi(null, aiQuestion); }}><input className="min-w-0 flex-1 rounded-xl border border-outline-variant bg-white px-3 py-2 text-xs" value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} placeholder="Ask: Which customers should receive a loyalty offer?" /><Button type="submit" size="sm" disabled={aiLoading || !aiQuestion.trim()}><Send size={13} /> Ask AI</Button></form>
          {aiOutput && <pre className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-4 text-xs leading-5">{aiOutput}</pre>}
        </Card>
        <div className="grid gap-4 mb-6 lg:grid-cols-2">
          <Card><div className="flex items-center gap-2 mb-3"><Users size={16} className="text-primary" /><h3 className="font-display font-bold text-sm">Customer segments</h3></div><div className="grid grid-cols-2 gap-2 text-xs">{['vip', 'regular', 'new', 'inactive', 'at-risk'].map((segment) => <div key={segment} className="rounded-lg bg-surface-container-low p-3"><span className="capitalize text-surface-on-variant">{segment}</span><strong className="mt-1 block text-lg">{intelligence.customers.filter((customer) => customer.segment === segment).length}</strong></div>)}</div></Card>
          <Card><div className="flex items-center gap-2 mb-3"><ShieldAlert size={16} className="text-error" /><h3 className="font-display font-bold text-sm">Issues needing attention</h3></div><div className="space-y-2 text-xs"><p>{intelligence.risks.unresolvedComplaints} unresolved customer conversations</p><p>{intelligence.risks.delayedOrders} delayed kitchen orders</p><p>{intelligence.risks.lowStock.length} low-stock or expiring inventory items</p><p>{intelligence.risks.unpaidOrders.count} unpaid orders worth {formatCurrency(intelligence.risks.unpaidOrders.amount || 0)}</p></div></Card>
        </div>
        <Card className="mb-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-display font-bold text-sm">Recommended CRM actions</h3><p className="mt-1 text-xs text-surface-on-variant">Review before sending campaigns or changing records.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => requestAction('inactive_customer_campaign', { count: intelligence.customerSummary.inactive })}><Send size={13} /> Inactive campaign</Button><Button size="sm" variant="secondary" onClick={() => requestAction('vip_loyalty_offer', { count: intelligence.customerSummary.vip })}><Gift size={13} /> VIP loyalty offer</Button><Button size="sm" variant="secondary" onClick={() => requestAction('staff_follow_up', { complaints: intelligence.risks.unresolvedComplaints })}><CalendarDays size={13} /> Assign follow-up</Button></div></div></Card>
      </>}

      <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2 xl:grid-cols-12">
        <Card className="flex items-center gap-3 md:col-span-2 xl:col-span-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users size={20} className="text-primary" /></div>
          <div><p className="text-xs text-surface-on-variant">Total Members</p><p className="text-xl font-bold">{customers.length}</p></div>
        </Card>
        <Card className="flex items-center gap-3 md:col-span-1 xl:col-span-3">
          <div className="w-10 h-10 rounded-xl bg-secondary-container/30 flex items-center justify-center"><Crown size={20} className="text-secondary" /></div>
          <div><p className="text-xs text-surface-on-variant">VIP Members</p><p className="text-xl font-bold">{vipCount}</p></div>
        </Card>
        <Card className="flex items-center gap-3 md:col-span-1 xl:col-span-3">
          <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center"><Star size={20} className="text-success" /></div>
          <div><p className="text-xs text-surface-on-variant">Total LTV</p><p className="text-xl font-bold">{formatCurrency(totalLtv)}</p></div>
        </Card>
        <Card className="flex items-center gap-3 md:col-span-2 xl:col-span-2">
          <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center"><AlertTriangle size={20} className="text-error" /></div>
          <div><p className="text-xs text-surface-on-variant">At Risk</p><p className="text-xl font-bold text-error">{atRiskCount}</p></div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6 xl:grid-cols-12">
        <Card className="p-4 xl:col-span-5">
          <div className="flex items-center gap-2 mb-3"><UtensilsCrossed size={16} className="text-primary" /><p className="font-bold text-sm">Top category</p></div>
          <p className="text-2xl font-bold">{topCategory}</p>
          <p className="text-xs text-surface-on-variant mt-1">Based on repeat order categories</p>
        </Card>
        <Card className="p-4 xl:col-span-3">
          <div className="flex items-center gap-2 mb-3"><MapPinned size={16} className="text-success" /><p className="font-bold text-sm">Dine-in tables</p></div>
          <p className="text-2xl font-bold">{dineInCustomers}</p>
          <p className="text-xs text-surface-on-variant mt-1">Customers with table visits</p>
        </Card>
        <Card className="p-4 xl:col-span-4">
          <div className="flex items-center gap-2 mb-3"><MessageSquareText size={16} className="text-[#25D366]" /><p className="font-bold text-sm">Engagement</p></div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(channelMeta).map(([key, meta]) => (
              <span key={key} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${meta.color}`}>
                <meta.Icon size={12} /> {meta.label}: {channelTotals[key] || 0}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3 mb-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers..." className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-outline-variant text-sm focus:outline-none focus:border-primary" />
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setChannelFilter('all')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${channelFilter === 'all' ? 'bg-primary text-white' : 'bg-surface-container text-surface-on'}`}>All</button>
          {Object.entries(channelMeta).map(([key, meta]) => (
            <button key={key} onClick={() => setChannelFilter(key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${channelFilter === key ? meta.color : 'bg-surface-container text-surface-on'}`}>
              {meta.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 mb-6 xl:grid-cols-12">
        <div className="grid gap-3 xl:col-span-8">
          {filtered.map((customer) => (
            <Card
              key={customer.id}
              className={`customer-list-card ${selectedCustomer?.id === customer.id ? 'customer-list-card-selected' : ''}`}
              onClick={() => setSelectedCustomerId(customer.id)}
            >
              <div className="customer-list-header">
                <div className="customer-identity">
                  <div className="customer-avatar">
                    {customer.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="customer-meta-wrap">
                    <div className="customer-name-row">
                      <h3>{customer.name}</h3>
                      <StatusBadge status={customer.tier} />
                      {customer.atRisk && <span className="badge-red">At Risk</span>}
                    </div>
                    <div className="customer-meta-row">
                      <span>{customer.totalOrders || customer.visits || 0} orders</span>
                      <span>•</span>
                      <span>{customer.tableVisits || 0} table visits</span>
                      <span>•</span>
                      <span>Last visit: {customer.lastVisit || 'N/A'}</span>
                    </div>
                    <div className="tag-row">
                      {(customer.favoriteCategories?.length ? customer.favoriteCategories : [customer.preferredCategory || 'General']).map((category) => (
                        <span key={`${customer.id}-${category}`} className="mini-tag">{category}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="customer-value-box">
                  <span className="customer-value">{formatCurrency(customer.lifetimeValue || 0)}</span>
                  <span className="customer-value-label">Lifetime Value</span>
                </div>
              </div>

              <div className="customer-list-footer">
                <div className="customer-channels">
                  {Object.entries(channelMeta).filter(([key]) => customer.channels?.[key]).map(([key, meta]) => (
                    <span key={`${customer.id}-${key}`} className={`channel-chip ${meta.color}`}>
                      <meta.Icon size={11} /> {meta.label}
                    </span>
                  ))}
                </div>
                <p className="customer-top-channel">Top channel: <strong>{customer.channel || 'pos'}</strong></p>
              </div>

              <Button
                variant="whatsapp"
                size="sm"
                className="customer-whatsapp-button"
                onClick={(event) => {
                  event.stopPropagation();
                  openWhatsApp(customer);
                }}
                aria-label={`Open WhatsApp for ${customer.name}`}
              >
                <WhatsAppLogo /> WhatsApp
              </Button>
            </Card>
          ))}
        </div>

        {selectedCustomer && (
          <Card className="p-4 xl:col-span-4">
            <div className="flex items-center gap-2 mb-3"><Gift size={16} className="text-primary" /><h3 className="font-bold text-sm">Loyalty profile</h3></div>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="text-surface-on-variant block mb-1">Birthday</span><input value={customerForm.birthday || ''} onChange={(e) => handleCustomerChange('birthday', e.target.value)} type="date" className="input-field w-full" /></label>
                <label className="block"><span className="text-surface-on-variant block mb-1">Anniversary</span><input value={customerForm.anniversary || ''} onChange={(e) => handleCustomerChange('anniversary', e.target.value)} type="date" className="input-field w-full" /></label>
              </div>
              <label className="block"><span className="text-surface-on-variant block mb-1">Segment</span><select value={customerForm.customerSegment || 'regular'} onChange={(e) => handleCustomerChange('customerSegment', e.target.value)} className="input-field w-full"><option value="regular">Regular</option><option value="birthday">Birthday</option><option value="couples">Couples</option><option value="vip">VIP</option><option value="first_order">First Order</option></select></label>
              <label className="block"><span className="text-surface-on-variant block mb-1">NFC tag code</span><input value={customerForm.nfcTagCode || ''} onChange={(e) => handleCustomerChange('nfcTagCode', e.target.value)} className="input-field w-full" placeholder="WR-0001-123456" /></label>
              <label className="block"><span className="text-surface-on-variant block mb-1">NFC type</span><select value={customerForm.nfcTagType || 'key_holder'} onChange={(e) => handleCustomerChange('nfcTagType', e.target.value)} className="input-field w-full"><option value="key_holder">Key Holder</option><option value="engraved_card">Engraved Card</option><option value="phone_holder">Phone Holder</option><option value="premium_kit">Premium Kit</option></select></label>
              <label className="block"><span className="text-surface-on-variant block mb-1">Preferred channel</span><select value={customerForm.preferredChannel || 'pos'} onChange={(e) => handleCustomerChange('preferredChannel', e.target.value)} className="input-field w-full"><option value="pos">In-person</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select></label>
              <label className="block"><span className="text-surface-on-variant block mb-1">Loyalty notes</span><textarea value={customerForm.loyaltyNotes || ''} onChange={(e) => handleCustomerChange('loyaltyNotes', e.target.value)} rows="3" className="input-field w-full" placeholder="Birthday offer, couples table, favorite items..." /></label>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveCustomerProfile} disabled={savingCustomer}><Save size={14} /> {savingCustomer ? 'Saving...' : 'Save'}</Button>
                <Button variant="secondary" size="sm" onClick={sendHolidayNotice}><Sparkles size={14} /> Notify</Button>
              </div>
              {status && <p className="text-[11px] text-primary">{status}</p>}
            </div>
          </Card>
        )}
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3"><CalendarDays size={16} className="text-primary" /><h3 className="font-bold text-sm">World holiday feed</h3></div>
        <div className="grid gap-2">
          {holidayFeed.map((event) => (
            <div key={event.id} className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs">
              <div>
                <p className="font-semibold text-surface-on">{event.title}</p>
                <p className="text-surface-on-variant">{event.date} &middot; {event.country}</p>
              </div>
              <span className="rounded-full bg-primary/10 text-primary px-2 py-1 font-semibold">{event.category}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
