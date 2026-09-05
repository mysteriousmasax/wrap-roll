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
  MessageCircle,
} from 'lucide-react';
import ChatInbox from '../../components/kds/ChatInbox';

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

function OrderCard({ order, onStatusChange, now }) {
  const elapsedMins = getTimeSinceMinutes(order.createdAt, now);
  const { text: countdownText, isOverdue } = getOrderCountdown(order, now);

  const isUrgent = elapsedMins >= 14 || isOverdue;
  const isWarning = !isUrgent && elapsedMins >= 8;

  const urgencyStyles = isUrgent
    ? 'border-2 border-[#ae002a] bg-[#fff8f8] shadow-md ring-2 ring-[#ae002a]/20'
    : isWarning
    ? 'border-2 border-[#e6ac29] bg-[#fffdf7]'
    : 'border border-[#ebdccb] bg-white';

  const progressSteps = ['pending', 'preparing', 'ready'];
  const progressIndex = progressSteps.indexOf(order.status);

  return (
    <div
      className={`kds-order-card rounded-2xl overflow-hidden transition-all duration-200 ${urgencyStyles}`}
    >
      {/* Card Header */}
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display font-black text-sm text-[#1f1d1b] tracking-tight">
              {order.id}
            </span>
            <StatusBadge status={order.status} />
          </div>

          <div
            className={
              'flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-full ' +
              (isUrgent
                ? 'bg-[#ae002a] text-white animate-pulse'
                : isWarning
                ? 'bg-[#e6ac29] text-[#24211e]'
                : 'bg-[#fbf6ee] text-[#746e67]')
            }
          >
            {isUrgent ? <AlertTriangle size={12} /> : <Clock size={12} />}
            <span>{countdownText}</span>
          </div>
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
        <div className="space-y-2 py-1 border-t border-b border-[#eee4d5]/70">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="bg-[#ae002a] text-white text-xs font-black w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                {item.qty}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#1f1d1b] leading-tight">{item.name}</p>
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
        <div className="flex gap-2 pt-1">
          {order.status === 'pending' && (
            <button
              onClick={() => onStatusChange(order.id, 'preparing')}
              className="flex-1 py-2 rounded-xl bg-[#ae002a] hover:bg-[#920023] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
            >
              <ChefHat size={14} /> Start Cooking
            </button>
          )}
          {order.status === 'preparing' && (
            <button
              onClick={() => onStatusChange(order.id, 'ready')}
              className="flex-1 py-2 rounded-xl bg-[#e6ac29] hover:bg-[#d99f20] text-[#24211e] text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
            >
              <CheckCircle2 size={14} /> Mark Ready
            </button>
          )}
          {order.status === 'ready' && (
            <button
              onClick={() => onStatusChange(order.id, 'completed')}
              className="flex-1 py-2 rounded-xl bg-[#227653] hover:bg-[#1b5e43] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
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
  const [supportOpen, setSupportOpen] = useState(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm font-semibold text-[#746e67]">Loading kitchen orders...</p>
      </div>
    );
  }

  return (
    <div className="kds-page h-[calc(100vh-3.5rem)] flex flex-col bg-[#faf7f2]">
      {/* Kitchen Control Bar */}
      <div className="kds-command-bar flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border border-[#ebdccb] rounded-2xl mx-3 mt-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#ae002a] text-white flex items-center justify-center shadow-sm">
            <Flame size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ae002a]">
              Kitchen Display
            </p>
            <h1 className="font-display text-sm sm:text-base font-bold text-[#1f1d1b]">
              Live Production Tickets
            </h1>
          </div>
        </div>

        {/* Station Tabs */}
        <div className="flex items-center gap-1 bg-[#fbf6ee] p-1 rounded-xl border border-[#ebdccb] overflow-x-auto">
          {STATIONS.map((st) => (
            <button
              key={st.id}
              onClick={() => setActiveStation(st.id)}
              className={
                'px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ' +
                (activeStation === st.id
                  ? 'bg-[#ae002a] text-white shadow-sm'
                  : 'text-[#746e67] hover:bg-white')
              }
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border border-[#ebdccb] text-xs font-bold flex items-center gap-1.5 transition-colors ${
              soundEnabled ? 'bg-[#faeee2] text-[#ae002a]' : 'bg-white text-[#746e67]'
            }`}
            title={soundEnabled ? 'Mute chimes' : 'Enable audio alerts'}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            <span className="hidden sm:inline">{soundEnabled ? 'Chime ON' : 'Muted'}</span>
          </button>

          <span className="px-2.5 py-1 rounded-full bg-[#fbf6ee] border border-[#ebdccb] text-xs font-bold text-[#775a00]">
            {pending.length} New
          </span>
          <span className="px-2.5 py-1 rounded-full bg-[#fff5ea] border border-[#fd7e14]/30 text-xs font-bold text-[#c05600]">
            {preparing.length} Cooking
          </span>
          <span className="px-2.5 py-1 rounded-full bg-[#f0f9f3] border border-[#227653]/30 text-xs font-bold text-[#227653]">
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
              <OrderCard key={o.id} order={o} now={now} onStatusChange={handleStatusChange} />
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
              <OrderCard key={o.id} order={o} now={now} onStatusChange={handleStatusChange} />
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
              <OrderCard key={o.id} order={o} now={now} onStatusChange={handleStatusChange} />
            ))
          ) : (
            <p className="text-center py-10 text-xs text-[#746e67]">No orders waiting for pickup.</p>
          )}
        </div>
        </div>
      </div>
      <button className="kds-support-fab" onClick={() => setSupportOpen(true)} aria-label="Open customer support"><MessageCircle size={19} /><span>Customer chats</span></button>
      {supportOpen && <aside className="kds-support-drawer"><ChatInbox onClose={() => setSupportOpen(false)} /></aside>}
    </div>
  );
}

