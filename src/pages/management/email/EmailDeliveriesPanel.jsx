import { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { api } from '../../../api/client';

const statusColor = (status) => status === 'sent' ? 'text-green-700' : status === 'failed' ? 'text-red-700' : 'text-amber-700';

export default function EmailDeliveriesPanel() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => { setLoading(true); api.getEmailDeliveries().then(setEvents).catch((exception) => setError(exception.message || 'Unable to load delivery history.')).finally(() => setLoading(false)); };
  useEffect(load, []);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Activity size={17} className="text-primary" /><div><h2 className="font-display text-base font-bold">Delivery history</h2><p className="mt-1 text-xs text-surface-on-variant">SMTP acceptance, failures, opens, and clicks. Opens may be affected by mail privacy protections.</p></div></div><Button size="sm" variant="secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</Button></div>
      {error && <p role="alert" className="mb-3 text-xs text-red-700">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-outline-variant text-surface-on-variant"><tr><th className="py-2 pr-3">Recipient</th><th className="py-2 pr-3">Source</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Status</th><th className="py-2">Time / response</th></tr></thead>
          <tbody className="divide-y divide-outline-variant">{events.map((event) => <tr key={`${event.source_type}-${event.id}`}><td className="py-3 pr-3 font-semibold">{event.email}</td><td className="py-3 pr-3">{event.source_name || 'Email'}</td><td className="py-3 pr-3 capitalize">{event.source_type}</td><td className={`py-3 pr-3 font-bold uppercase ${statusColor(event.status)}`}>{event.status}</td><td className="py-3"><p>{new Date(event.occurred_at).toLocaleString()}</p><p className="mt-1 max-w-md truncate text-[10px] text-surface-on-variant">{event.response || event.message_id || ''}</p></td></tr>)}</tbody>
        </table>
        {!loading && !events.length && <p className="py-8 text-center text-xs text-surface-on-variant">No email delivery events yet.</p>}
        {loading && <p className="py-8 text-center text-xs text-surface-on-variant">Loading delivery history...</p>}
      </div>
    </Card>
  );
}
