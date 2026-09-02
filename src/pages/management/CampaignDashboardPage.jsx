import { useEffect, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { api } from '../../api/client';
import { CalendarDays, Gift, Heart, Sparkles } from 'lucide-react';

export default function CampaignDashboardPage() {
  const [dashboard, setDashboard] = useState({ totals: { customers: 0, birthdays: 0, anniversaries: 0, couples: 0 }, upcomingBirthdays: [], upcomingAnniversaries: [], couples: [] });
  const [loading, setLoading] = useState(true);
  const [sendStatus, setSendStatus] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getCampaignDashboard();
        setDashboard(data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const sendCampaign = async () => {
    try {
      const response = await api.dispatchHolidayNotifications();
      setSendStatus(`Campaign notifications sent to ${response.sentCount} customers.`);
    } catch (error) {
      setSendStatus(error.message || 'Unable to dispatch campaign notifications');
    }
  };

  if (loading) return <div className="p-6 text-sm text-surface-on-variant">Loading campaign dashboard...</div>;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Birthday & Couples Campaigns" subtitle="Celebrate loyal guests with personalized offers and gifts" actions={
        <Button size="sm" onClick={sendCampaign}><Sparkles size={14} /> Send campaign</Button>
      } />

      {sendStatus && <p className="text-sm mb-4 text-primary">{sendStatus}</p>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4"><p className="text-xs text-surface-on-variant">Customers</p><p className="text-2xl font-bold mt-2">{dashboard.totals.customers}</p></Card>
        <Card className="p-4"><p className="text-xs text-surface-on-variant">Birthdays</p><p className="text-2xl font-bold mt-2 text-pink-600">{dashboard.totals.birthdays}</p></Card>
        <Card className="p-4"><p className="text-xs text-surface-on-variant">Anniversaries</p><p className="text-2xl font-bold mt-2 text-violet-600">{dashboard.totals.anniversaries}</p></Card>
        <Card className="p-4"><p className="text-xs text-surface-on-variant">Couples</p><p className="text-2xl font-bold mt-2 text-indigo-600">{dashboard.totals.couples}</p></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3"><Gift size={16} className="text-pink-600" /><h3 className="font-bold text-sm">Upcoming birthdays</h3></div>
          <div className="space-y-2">
            {dashboard.upcomingBirthdays.length ? dashboard.upcomingBirthdays.map((customer) => (
              <div key={customer.customerId} className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold">{customer.name}</p>
                  <p className="text-surface-on-variant">{customer.birthday}</p>
                </div>
                <span className="rounded-full bg-pink-100 text-pink-700 px-2 py-1 font-semibold">{customer.dateKey}</span>
              </div>
            )) : <p className="text-xs text-surface-on-variant">No birthday events scheduled.</p>}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3"><Heart size={16} className="text-violet-600" /><h3 className="font-bold text-sm">Couples and anniversaries</h3></div>
          <div className="space-y-2">
            {dashboard.upcomingAnniversaries.length ? dashboard.upcomingAnniversaries.map((customer) => (
              <div key={customer.customerId} className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold">{customer.name}</p>
                  <p className="text-surface-on-variant">{customer.anniversary}</p>
                </div>
                <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-1 font-semibold">Anniversary</span>
              </div>
            )) : <p className="text-xs text-surface-on-variant">No anniversary entries yet.</p>}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <div className="flex items-center gap-2 mb-3"><CalendarDays size={16} className="text-primary" /><h3 className="font-bold text-sm">Couples segment</h3></div>
        <div className="grid gap-2">
          {dashboard.couples.length ? dashboard.couples.map((customer) => (
            <div key={customer.id} className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs">
              <p className="font-semibold">{customer.name}</p>
              <span className="rounded-full bg-indigo-100 text-indigo-700 px-2 py-1 font-semibold">Couples</span>
            </div>
          )) : <p className="text-xs text-surface-on-variant">No couples segment customers in the system yet.</p>}
        </div>
      </Card>
    </div>
  );
}
