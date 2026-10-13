import { useEffect, useRef, useState } from 'react';
import { CalendarClock, CircleCheck, Clock3, Mail, MapPin, PackageCheck, Phone, Save, WalletCards } from 'lucide-react';
import { useParams } from 'react-router-dom';
import BrandLogo from '../../components/brand/BrandLogo';
import RoadsideTrackingPanel from '../../components/public/RoadsideTrackingPanel';
import CustomerChat from '../../components/public/CustomerChat';
import { api } from '../../api/client';
import useTranslation from '../../i18n/useTranslation';
import { normalizeTanzanianPhone } from '../../../shared/phone.js';

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
  const [token, setToken] = useState(() => window.location.hash.slice(1) || localStorage.getItem(storageKey) || '');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [contact, setContact] = useState(() => ({
    name: localStorage.getItem('wraproll_customer_name') || '',
    phone: normalizeTanzanianPhone(localStorage.getItem('wraproll_customer_phone') || ''),
    email: localStorage.getItem('wraproll_customer_email') || '',
  }));
  const [contactDirty, setContactDirty] = useState(false);
  const contactDirtyRef = useRef(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [contactError, setContactError] = useState('');
  const [now, setNow] = useState(Date.now());
  const t = useTranslation(localStorage.getItem('wraproll_language') || 'English');

  useEffect(() => {
    if (!token) return;
    localStorage.setItem(storageKey, token);
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
          if (!contactDirtyRef.current) {
            const nextContact = {
              name: result.customerName || localStorage.getItem('wraproll_customer_name') || '',
              phone: normalizeTanzanianPhone(result.customerPhone || localStorage.getItem('wraproll_customer_phone') || ''),
              email: result.customerEmail || localStorage.getItem('wraproll_customer_email') || '',
            };
            setContact(nextContact);
            localStorage.setItem('wraproll_customer_name', nextContact.name);
            if (nextContact.phone) localStorage.setItem('wraproll_customer_phone', nextContact.phone);
            if (nextContact.email) localStorage.setItem('wraproll_customer_email', nextContact.email);
          }
        }
      } catch (requestError) {
        if (active) setError(requestError.message || 'This order link is unavailable.');
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 8000);
    return () => { active = false; window.clearInterval(interval); };
  }, [orderId, token]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const updateContactField = (field, value) => {
    contactDirtyRef.current = true;
    setContactDirty(true);
    setContactMessage('');
    setContactError('');
    setContact((current) => ({ ...current, [field]: value }));
  };

  const saveContact = async (event) => {
    event.preventDefault();
    const nextContact = {
      name: contact.name.trim(),
      phone: normalizeTanzanianPhone(contact.phone),
      email: contact.email.trim().toLowerCase(),
    };
    if (!nextContact.phone && !nextContact.email) {
      setContactError('Add a phone number or email address so we can contact you about this order.');
      return;
    }
    setSavingContact(true);
    setContactError('');
    setContactMessage('');
    try {
      const saved = await api.updateCustomerOrderTracking(orderId, token, nextContact);
      const savedContact = { name: saved.customerName, phone: saved.customerPhone, email: saved.customerEmail };
      setContact(savedContact);
      setOrder((current) => current ? { ...current, ...savedContact } : current);
      localStorage.setItem('wraproll_customer_name', savedContact.name || '');
      localStorage.setItem('wraproll_customer_phone', savedContact.phone || '');
      localStorage.setItem('wraproll_customer_email', savedContact.email || '');
      contactDirtyRef.current = false;
      setContactDirty(false);
      setContactMessage('Contact details saved and remembered on this browser.');
    } catch (saveError) {
      setContactError(saveError.message || 'Unable to save your contact details.');
    } finally {
      setSavingContact(false);
    }
  };

  const isRoadside = order?.fulfillmentMode === 'roadside_handoff';
  const canTrackRoadside = isRoadside && (['paid', 'completed'].includes(order?.paymentStatus) || order?.paymentTerms === 'invoice');
  const elapsedEnd = order?.status === 'completed' ? new Date(order.updatedAt || now).getTime() : now;
  const elapsedSeconds = order?.createdAt ? Math.max(0, Math.floor((elapsedEnd - new Date(order.createdAt).getTime()) / 1000)) : 0;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const prepMinutes = Math.max(15, ...(order?.items || []).map((item) => Number(item.prepTimeMinutes || 15)));
  const etaMinutes = prepMinutes + 5;
  const remainingMinutes = Math.max(0, etaMinutes - elapsedMinutes);
  const overdue = order && !['ready', 'completed', 'cancelled'].includes(order.status) && elapsedMinutes >= etaMinutes;
  const chatProfile = {
    name: contact.name || order?.customerName || '',
    phone: contact.phone || order?.customerPhone || '',
    email: contact.email || order?.customerEmail || '',
  };

  return <main className="min-h-screen bg-[#faf7f2] px-4 py-5 text-[#24211e]">
    <div className="mx-auto max-w-xl">
      <a href="/" aria-label="Wrap and Roll home"><BrandLogo /></a>
      <section className="mt-6 overflow-hidden rounded-xl border border-[#e5ded5] bg-white shadow-sm">
        <div className="bg-[#ae002a] px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><PackageCheck size={21} className="mt-0.5 shrink-0" /><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">Wrap &amp; Roll</p><h1 className="mt-1 text-xl font-bold">Order tracking</h1></div></div>{order && <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">{orderLabel(order)}</span>}</div>
          {order && <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-white/70">Order number</p><p className="mt-1 text-sm font-bold">{order.orderNumber}</p></div><div className="text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-white/70">Time elapsed</p><p className="mt-1 text-lg font-bold tabular-nums">{elapsedMinutes} min {String(elapsedSeconds % 60).padStart(2, '0')} sec</p></div></div>}
        </div>
        {!token && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">This tracking link is incomplete. Ask the staff member to share the customer order link again.</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!order && token && !error && <p className="p-5 text-sm text-[#746e67]">Loading order details…</p>}
        {order && <div aria-live="polite" className="space-y-5 p-5">
          <div className={`rounded-lg p-3 text-sm font-semibold ${order.status === 'ready' ? 'bg-[#eaf5ed] text-[#227653]' : overdue ? 'bg-amber-50 text-amber-900' : 'bg-[#fbf6ee] text-[#554e46]'}`}>
            {order.status === 'ready' ? 'Ready now. Please collect your order.' : order.status === 'completed' ? 'This order is complete.' : order.status === 'cancelled' ? 'This order was cancelled.' : overdue ? 'Taking longer than expected. Please check with our staff.' : `Estimated ready in about ${remainingMinutes} min (around ${new Date(new Date(order.createdAt).getTime() + etaMinutes * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-[#fbf6ee] p-3"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#746e67]"><WalletCards size={12} />Payment</p><p className="mt-1 text-xs font-semibold">{paymentLabel(order.paymentStatus)}</p></div>
            <div className="rounded-lg bg-[#fbf6ee] p-3"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#746e67]"><MapPin size={12} />Fulfillment</p><p className="mt-1 text-xs font-semibold capitalize">{isRoadside ? 'Roadside handoff' : String(order.type || 'order').replaceAll('-', ' ')}</p></div>
          </div>
          {order.scheduledFor && <p className="flex items-center gap-2 text-xs text-[#554e46]"><CalendarClock size={14} />Scheduled for {new Date(order.scheduledFor).toLocaleString()}</p>}
          {order.items?.length > 0 && <div><h2 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#746e67]">Order items</h2><ul className="space-y-1">{order.items.map((item, index) => <li key={`${item.name}-${index}`} className="flex justify-between gap-3 text-xs"><span>{item.qty}x {item.name}</span></li>)}</ul></div>}
          <p className="flex items-start gap-2 border-t border-[#eee4d5] pt-3 text-[11px] leading-5 text-[#746e67]"><Clock3 size={13} className="mt-0.5 shrink-0" />Order status refreshes automatically.</p>
          {order.status === 'completed' && <p className="flex items-center gap-2 rounded-lg bg-[#eaf5ed] p-3 text-xs font-semibold text-[#227653]"><CircleCheck size={15} />This order is complete.</p>}
          <form onSubmit={saveContact} className="space-y-3 border-t border-[#eee4d5] pt-4">
            <div><h2 className="text-sm font-bold">Your contact details</h2><p className="mt-1 text-xs text-[#746e67]">Add a phone number or email so we can reach you about this order. This browser will remember your details.</p></div>
            <label className="block text-xs font-semibold text-[#554e46]">Name<input value={contact.name} onChange={(event) => updateContactField('name', event.target.value)} className="mt-1 w-full rounded-lg border border-[#e5ded5] px-3 py-2.5 text-sm" autoComplete="name" /></label>
            <label className="block text-xs font-semibold text-[#554e46]"><span className="inline-flex items-center gap-1"><Phone size={12} />Phone (optional)</span><input type="tel" value={contact.phone} onChange={(event) => updateContactField('phone', event.target.value)} onBlur={(event) => setContact((current) => ({ ...current, phone: normalizeTanzanianPhone(event.target.value) }))} className="mt-1 w-full rounded-lg border border-[#e5ded5] px-3 py-2.5 text-sm" placeholder="0712 345 678 or +255 712 345 678" autoComplete="tel" /></label>
            <label className="block text-xs font-semibold text-[#554e46]"><span className="inline-flex items-center gap-1"><Mail size={12} />Email (optional)</span><input type="email" value={contact.email} onChange={(event) => updateContactField('email', event.target.value)} className="mt-1 w-full rounded-lg border border-[#e5ded5] px-3 py-2.5 text-sm" placeholder="you@example.com" autoComplete="email" /></label>
            {contactError && <p className="text-xs text-red-700" role="alert">{contactError}</p>}
            {contactMessage && <p className="text-xs font-semibold text-green-700" role="status">{contactMessage}</p>}
            <button type="submit" disabled={savingContact || (!contactDirty && Boolean(order.customerPhone || order.customerEmail))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#ae002a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save size={15} />{savingContact ? 'Saving…' : 'Save contact details'}</button>
          </form>
        </div>}
      </section>
      {canTrackRoadside && <div className="mt-4"><RoadsideTrackingPanel order={order} accessToken={token} /></div>}
      {isRoadside && order && !canTrackRoadside && <p className="mt-3 rounded-lg bg-[#fbf6ee] p-3 text-xs text-[#554e46]">Live location sharing becomes available after payment is verified. No location is collected unless you choose to share it.</p>}
      {order && <CustomerChat key={orderId} t={t} initialProfile={chatProfile} conversationKey={`order_${orderId}`} />}
    </div>
  </main>;
}