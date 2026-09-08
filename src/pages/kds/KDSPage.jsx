import { useEffect, useState, useRef } from 'react';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import useOrderStore from '../../store/useOrderStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import {
  Clock,
  ChefHat,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Volume2,
  VolumeX,
  Filter,
  Check,
} from 'lucide-react';

function playOrderChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Ignore audio autoplay restrictions
  }
}

function getTimeSinceMinutes(iso, now) {
  return Math.floor((now - new Date(iso).getTime()) / 60000);
}

function getOrderCountdown(order, now) {
  const itemMinutes = (order.items || []).map((item) =>
    Number(item.prep_time_minutes ?? item.prepTimeMinutes ?? 8)
  );
  const totalMinutes = Math.max(1, ...itemMinutes, 1);
  const elapsedMs = now - new Date(order.createdAt).getTime();
  const remainingMs = Math.max(0, totalMinutes * 60 * 1000 - elapsedMs);
  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);

  if (remainingMs <= 0) return { text: 'Overdue', isOverdue: true };
  return {
    text: `${remainingMinutes}:${String(remainingSeconds).padStart(2, '0')}`,
    isOverdue: false,
  };
}

function OrderCard({ order, onStatusChange, onPaymentConfirm, now }) {
  const elapsedMins = getTimeSinceMinutes(order.createdAt, now);
  const { text: countdownText, isOverdue } = getOrderCountdown(order, now);

  const isUrgent = elapsedMins >= 14 || isOverdue;
  const isWarning = !isUrgent && elapsedMins >= 8;

  const urgencyStyles = isUrgent
    ? 'border-2 border-[#b0003a] bg-[#fff7f8] shadow-[0_12px_30px_rgba(176,0,58,.14)] ring-2 ring-[#b0003a]/20'
    : isWarning
    ? 'border-2 border-[#e6ac29] bg-[#fffaf0] shadow-[0_10px_24px_rgba(230,172,41,.12)]'
    : 'border border-[#eadfd2] bg-white shadow-[0_8px_20px_rgba(55,28,20,.07)]';

  const progressSteps = ['pending', 'preparing', 'ready'];
  const progressIndex = progressSteps.indexOf(order.status);

  return (
    <div className={`kds-order-card group relative overflow-hidden rounded-[18px] transition-all duration-200 hover:-translate-y-1 ${urgencyStyles}`}>
      <div className={`h-1.5 ${order.status === 'pending' ? 'bg-[#e6ac29]' : order.status === 'preparing' ? 'bg-[#f27522]' : 'bg-[#227653]'}`} />
      {/* Card Header */}
      <div className="space-y-3.5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-black tracking-tight text-[#1f1d1b]">
              {order.id}
            </span>
            <StatusBadge status={order.status} />
          </div>

          <div
            className={
              'flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-black ' +
              (isUrgent
                ? 'bg-[#b0003a] text-white animate-pulse'
                : isWarning
                ? 'bg-[#e6ac29] text-[#24211e]'
                : 'bg-[#fbf6ee] text-[#746e67]')
            }
          >
            {isUrgent ? <AlertTriangle size={12} /> : <Clock size={12} />}
            <span>{countdownText}</span>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-[#eadfd2] pb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a7d73]">
          <span>{order.status === 'pending' ? 'Queued for kitchen' : order.status === 'preparing' ? 'On the line' : 'Pickup / pass'}</span>
          <span>{elapsedMins < 1 ? 'Just now' : `${elapsedMins} min active`}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          <span className="px-2 py-0.5 rounded-md bg-[#faeee2] text-[#ae002a] uppercase tracking-wider">
            {order.type}
          </span>
          {order.table && (
            <span className="px-2 py-0.5 rounded-md bg-[#e6ac29]/20 text-[#775a00]">
              Table {order.table}
            </span>
          )}
          {order.customer && (
            <span className="px-2 py-0.5 rounded-md bg-[#fbf6ee] text-[#554e46] truncate max-w-[120px]">
              {order.customer}
            </span>
          )}
        </div>

        {/* Order Items List */}
        <div className="space-y-2.5 border-b border-[#eee4d5]/70 pb-3">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#b0003a] text-sm font-black text-white shadow-sm">
                {item.qty}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black leading-tight text-[#1f1d1b]">{item.name}</p>
                {item.modifiers?.length > 0 && (
                  <p className="text-[10px] text-[#ae002a] font-bold mt-0.5">
                    + {item.modifiers.join(', ')}
                  </p>
                )}
                {(item.specialInstructions || item.special_instructions) && (
                  <p className="text-[10px] bg-[#fff4e5] border border-[#f5d777] text-[#8c5000] px-1.5 py-0.5 rounded font-semibold mt-1">
                    Note: {item.specialInstructions || item.special_instructions}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-0.5">
          {order.paymentMethod === 'lipa_namba' && order.paymentStatus !== 'paid' && (
            <button
              onClick={() => onPaymentConfirm(order.id)}
              className="flex-1 rounded-xl bg-[#227653] py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#1b5e43]"
            >
              <CheckCircle2 size={14} /> Confirm Payment
            </button>
          )}
          {order.status === 'pending' && (
            <button
              disabled={order.paymentMethod === 'lipa_namba' && order.paymentStatus !== 'paid'}
              onClick={() => onStatusChange(order.id, 'preparing')}
              className="flex-1 rounded-xl bg-[#b0003a] py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#920023]"
            >
              <ChefHat size={14} /> Start Cooking
            </button>
          )}
          {order.status === 'preparing' && (
            <button
              onClick={() => onStatusChange(order.id, 'ready')}
              className="flex-1 rounded-xl bg-[#e6ac29] py-2.5 text-xs font-bold text-[#24211e] shadow-sm transition-colors hover:bg-[#d99f20]"
            >
              <CheckCircle2 size={14} /> Mark Ready
            </button>
          )}
          {order.status === 'ready' && (
            <button
              onClick={() => onStatusChange(order.id, 'completed')}
              className="flex-1 rounded-xl bg-[#227653] py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#1b5e43]"
            >
              <Check size={14} /> Served &amp; Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const STATIONS = [
  { id: 'all', label: 'All Kitchen' },
  { id: 'wraps', label: 'Wraps & Rolls' },
  { id: 'grill', label: 'Burgers & Grill' },
  { id: 'sides', label: 'Sides & Salads' },
  { id: 'drinks', label: 'Beverages' },
];

export default function KDSPage() {
  const orders = useOrderStore((s) => s.orders);
  const fetchOrders = useOrderStore((s) => s.fetchOrders);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [activeStation, setActiveStation] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevCountRef = useRef(0);

  useEffect(() => {
    fetchOrders('pending,preparing,ready').finally(() => setLoading(false));
  }, [fetchOrders]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useWebSocket((event) => {
    if (event === 'order:created') {
      fetchOrders('pending,preparing,ready');
      if (soundEnabled) playOrderChime();
    }
  });

  const active = orders.filter((o) => ['pending', 'preparing', 'ready'].includes(o.status));

  // Sound alert check on new pending orders
  useEffect(() => {
    const pendingCount = active.filter((o) => o.status === 'pending').length;
    if (pendingCount > prevCountRef.current && prevCountRef.current > 0 && soundEnabled) {
      playOrderChime();
    }
    prevCountRef.current = pendingCount;
  }, [active, soundEnabled]);

  // Filter orders by station if selected
  const filteredOrders = active.filter((order) => {
    if (activeStation === 'all') return true;
    if (activeStation === 'wraps') {
      return order.items?.some((i) =>
        i.name?.toLowerCase().includes('wrap') || i.name?.toLowerCase().includes('roll')
      );
    }
    if (activeStation === 'grill') {
      return order.items?.some((i) =>
        i.name?.toLowerCase().includes('burger') || i.name?.toLowerCase().includes('pizza')
      );
    }
    if (activeStation === 'sides') {
      return order.items?.some((i) =>
        i.name?.toLowerCase().includes('salad') ||
        i.name?.toLowerCase().includes('fries') ||
        i.name?.toLowerCase().includes('extra')
      );
    }
    if (activeStation === 'drinks') {
      return order.items?.some((i) =>
        i.name?.toLowerCase().includes('coffee') ||
        i.name?.toLowerCase().includes('soda') ||
        i.name?.toLowerCase().includes('juice')
      );
    }
    return true;
  });

  const pending = filteredOrders.filter((o) => o.status === 'pending');
  const preparing = filteredOrders.filter((o) => o.status === 'preparing');
  const ready = filteredOrders.filter((o) => o.status === 'ready');

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePaymentConfirm = async (orderId) => {
    try {
      await api.updateOrderPaymentStatus(orderId, 'paid');
      await fetchOrders('pending,preparing,ready');
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm font-semibold text-[#746e67]">Loading kitchen orders...</p>
      </div>
    );
  }

  return (
    <div className="kds-page flex h-[calc(100vh-3.5rem)] flex-col bg-[#f3eee9]">
      {/* Kitchen Control Bar */}
      <div className="kds-command-bar mx-3 mt-3 flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-[#2f2925] bg-[#292522] px-5 py-4 text-white shadow-[0_14px_34px_rgba(36,33,30,.18)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#b0003a] text-white shadow-[0_8px_20px_rgba(176,0,58,.35)]">
            <Flame size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f5d777]">
              Kitchen Display
            </p>
            <h1 className="font-display text-base font-bold text-white sm:text-lg">
              Live Production Tickets
            </h1>
          </div>
        </div>

        {/* Station Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/10 p-1">
          {STATIONS.map((st) => (
            <button
              key={st.id}
              onClick={() => setActiveStation(st.id)}
              className={
                'px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ' +
                (activeStation === st.id
                  ? 'bg-[#f5d777] text-[#292522] shadow-sm'
                  : 'text-[#f3eee9] hover:bg-white/10')
              }
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 rounded-xl border border-white/10 p-2 text-xs font-bold transition-colors ${
              soundEnabled ? 'bg-[#b0003a] text-white' : 'bg-white/10 text-[#f3eee9]'
            }`}
            title={soundEnabled ? 'Mute chimes' : 'Enable audio alerts'}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            <span className="hidden sm:inline">{soundEnabled ? 'Chime ON' : 'Muted'}</span>
          </button>

          <span className="rounded-lg border border-[#f5d777]/30 bg-[#f5d777]/15 px-2.5 py-1 text-xs font-bold text-[#f5d777]">
            {pending.length} New
          </span>
          <span className="rounded-lg border border-[#f27522]/30 bg-[#f27522]/15 px-2.5 py-1 text-xs font-bold text-[#ffad78]">
            {preparing.length} Cooking
          </span>
          <span className="rounded-lg border border-[#65c98d]/30 bg-[#65c98d]/15 px-2.5 py-1 text-xs font-bold text-[#9ee6b8]">
            {ready.length} Ready
          </span>
        </div>
      </div>

      <div className="kds-workspace is-tickets">
        <div className="kds-ticket-board">
        {/* Lane 1: New Orders */}
        <div className="kds-lane kds-lane-new space-y-3 overflow-y-auto rounded-3xl p-3 bg-white/70 border border-[#ebdccb] md:col-span-5 shadow-sm">
          <div className="flex items-center justify-between px-1 sticky top-0 bg-white/90 backdrop-blur-sm py-1 z-10">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#e6ac29]" />
              <h2 className="font-display font-bold text-xs uppercase tracking-wider text-[#1f1d1b]">
                New Tickets ({pending.length})
              </h2>
            </div>
          </div>
          {pending.length ? (
            pending.map((o) => (
              <OrderCard key={o.id} order={o} now={now} onStatusChange={handleStatusChange} onPaymentConfirm={handlePaymentConfirm} />
            ))
          ) : (
            <p className="text-center py-10 text-xs text-[#746e67]">No new tickets waiting.</p>
          )}
        </div>

        {/* Lane 2: Cooking */}
        <div className="kds-lane kds-lane-cooking space-y-3 overflow-y-auto rounded-3xl p-3 bg-white/70 border border-[#ebdccb] md:col-span-4 shadow-sm">
          <div className="flex items-center justify-between px-1 sticky top-0 bg-white/90 backdrop-blur-sm py-1 z-10">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#fd7e14]" />
              <h2 className="font-display font-bold text-xs uppercase tracking-wider text-[#1f1d1b]">
                In Cooking ({preparing.length})
              </h2>
            </div>
          </div>
          {preparing.length ? (
            preparing.map((o) => (
              <OrderCard key={o.id} order={o} now={now} onStatusChange={handleStatusChange} onPaymentConfirm={handlePaymentConfirm} />
            ))
          ) : (
            <p className="text-center py-10 text-xs text-[#746e67]">No orders currently cooking.</p>
          )}
        </div>

        {/* Lane 3: Ready */}
        <div className="kds-lane kds-lane-ready space-y-3 overflow-y-auto rounded-3xl p-3 bg-white/70 border border-[#ebdccb] md:col-span-3 shadow-sm">
          <div className="flex items-center justify-between px-1 sticky top-0 bg-white/90 backdrop-blur-sm py-1 z-10">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#227653]" />
              <h2 className="font-display font-bold text-xs uppercase tracking-wider text-[#1f1d1b]">
                Ready to Serve ({ready.length})
              </h2>
            </div>
          </div>
          {ready.length ? (
            ready.map((o) => (
              <OrderCard key={o.id} order={o} now={now} onStatusChange={handleStatusChange} onPaymentConfirm={handlePaymentConfirm} />
            ))
          ) : (
            <p className="text-center py-10 text-xs text-[#746e67]">No orders waiting for pickup.</p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

