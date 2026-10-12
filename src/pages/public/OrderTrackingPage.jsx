import { useEffect, useState } from 'react';
import { CalendarClock, CircleCheck, Clock3, MapPin, PackageCheck, WalletCards } from 'lucide-react';
import { useParams } from 'react-router-dom';
import BrandLogo from '../../components/brand/BrandLogo';
import RoadsideTrackingPanel from '../../components/public/RoadsideTrackingPanel';
import { api } from '../../api/client';

const paymentLabel = (status) => ({
  paid: 'Paid',
  completed: 'Paid',
  manual_review: 'Payment submitted for verification',
  failed: 'Payment was not confirmed',
  pending: 'Awaiting payment',
}[status] || 'Payment status unavailable');

const orderLabel = (order) => {
  if (order.status === 'cancelled') return 'Order cancelled';
  if (order.status === 'completed') return order.fulfillmentMode === 'roadside_handoff' ? 'Handoff complete' : 'Order complete';
  if (order.reservationStatus === 'released') return 'Handoff team alerted';
  if (order.status === 'ready') return 'Ready';
  if (order.status === 'preparing') return 'Being prepared';
  if (order.status === 'confirmed') return order.fulfillmentMode === 'roadside_handoff' ? 'Handoff confirmed' : 'Order confirmed';
  if (order.status === 'pending_payment') return 'Awaiting payment';
  return 'Order received';
};

export default function OrderTrackingPage() {
  const { orderId } = useParams();
  const storageKey = `wraproll_customer_order_tracking_${orderId}`;
  const [token, setToken] = useState(() => window.location.hash.slice(1) || sessionStorage.getItem(storageKey) || '');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    sessionStorage.setItem(storageKey, token);
    if (window.location.hash) window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
  }, [storageKey, token]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.getCustomerOrderTracking(orderId, token);
        if (active) {
          setOrder(result);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError.message || 'This order link is unavailable.');
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 8000);
    return () => { active = false; window.clearInterval(interval); };
  }, [orderId, token]);

  const isRoadside = order?.fulfillmentMode === 'roadside_handoff';
  const canTrackRoadside = isRoadside && (['paid', 'completed'].includes(order?.paymentStatus) || order?.paymentTerms === 'invoice');

  return <main className="min-h-screen bg-[#faf7f2] px-4 py-5 text-[#24211e]">
    <div className="mx-auto max-w-xl">
      <a href="/" aria-label="Wrap and Roll home"><BrandLogo /></a>
      <section className="mt-6 rounded-xl border border-[#e5ded5] bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3"><PackageCheck size={21} className="mt-0.5 shrink-0 text-[#ae002a]" /><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ae002a]">Wrap &amp; Roll</p><h1 className="mt-1 text-xl font-bold">Order tracking</h1></div></div>
        {!token && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">This tracking link is incomplete. Ask the staff member to share the customer order link again.</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!order && token && !error && <p className="mt-4 text-sm text-[#746e67]">Loading order details…</p>}
        {order && <div aria-live="polite" className="mt-4 space-y-4 border-t border-[#eee4d5] pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-[#746e67]">Order number</p><p className="mt-1 text-sm font-bold">{order.orderNumber}</p></div><span className="rounded-full bg-[#f0f9f3] px-3 py-1.5 text-xs font-bold text-[#227653]">{orderLabel(order)}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-[#fbf6ee] p-3"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#746e67]"><WalletCards size={12} />Payment</p><p className="mt-1 text-xs font-semibold">{paymentLabel(order.paymentStatus)}</p></div>
            <div className="rounded-lg bg-[#fbf6ee] p-3"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#746e67]"><MapPin size={12} />Fulfillment</p><p className="mt-1 text-xs font-semibold capitalize">{isRoadside ? 'Roadside handoff' : String(order.type || 'order').replaceAll('-', ' ')}</p></div>
          </div>
          {order.scheduledFor && <p className="flex items-center gap-2 text-xs text-[#554e46]"><CalendarClock size={14} />Scheduled for {new Date(order.scheduledFor).toLocaleString()}</p>}
          {order.items?.length > 0 && <div><h2 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#746e67]">Order items</h2><ul className="space-y-1">{order.items.map((item, index) => <li key={`${item.name}-${index}`} className="flex justify-between gap-3 text-xs"><span>{item.qty}x {item.name}</span></li>)}</ul></div>}
          <p className="flex items-start gap-2 border-t border-[#eee4d5] pt-3 text-[11px] leading-5 text-[#746e67]"><Clock3 size={13} className="mt-0.5 shrink-0" />This page refreshes order status automatically.</p>
          {order.status === 'completed' && <p className="flex items-center gap-2 rounded-lg bg-[#eaf5ed] p-3 text-xs font-semibold text-[#227653]"><CircleCheck size={15} />This order is complete.</p>}
        </div>}
      </section>
      {canTrackRoadside && <div className="mt-4"><RoadsideTrackingPanel order={order} accessToken={token} /></div>}
      {isRoadside && order && !canTrackRoadside && <p className="mt-3 rounded-lg bg-[#fbf6ee] p-3 text-xs text-[#554e46]">Live location sharing becomes available after payment is verified. No location is collected unless you choose to share it.</p>}
    </div>
  </main>;
}