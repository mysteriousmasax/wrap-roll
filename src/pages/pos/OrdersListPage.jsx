import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import SplitFlapText from '../../components/ui/SplitFlapText';
import { formatCurrency } from '../../utils/format';
import useOrderStore from '../../store/useOrderStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { CalendarDays, ChevronRight, Clock3, CreditCard, MapPin, Search, ShoppingBag, UserRound, Utensils } from 'lucide-react';

const filters = [
  { id: 'all', label: 'All orders' },
  { id: 'pending', label: 'Pending' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'completed', label: 'Completed' },
];

function OrderTypeIcon({ type }) {
  return type === 'delivery' ? <MapPin size={15} /> : type === 'dine-in' ? <Utensils size={15} /> : <ShoppingBag size={15} />;
}

function getWaitingTime(createdAt, now) {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getCountdownText(order, now) {
  const itemPrep = (order.items || []).map((item) => Number(item.prep_time_minutes ?? item.prepTimeMinutes ?? 8));
  const maxPrep = itemPrep.length ? Math.max(...itemPrep) : 8;
  const elapsedMs = now - new Date(order.createdAt).getTime();
  const remainingMs = Math.max(0, maxPrep * 60 * 1000 - elapsedMs);
  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);

  if (order.status === 'ready') return 'Ready now';
  if (order.status === 'completed') return 'Completed';
  if (remainingMs <= 0) return 'Ready now';
  if (remainingMinutes > 0) return `${remainingMinutes}:${String(remainingSeconds).padStart(2, '0')}`;
  return `0:${String(remainingSeconds).padStart(2, '0')}`;
}

function OrderDetails({ order, onClose }) {
  if (!order) return null;

  const customerPhone = order.customerPhone || 'Not provided';
  const customerEmail = order.customerEmail || 'Not provided';

  return (
    <Modal isOpen={!!order} onClose={onClose} title={`Order ${order.id}`}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3">
          <div className="text-[15px] font-bold text-surface-on">
            {new Date(order.createdAt).toLocaleDateString()} at {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-xl border border-outline-variant bg-white p-3 text-center">
            <div className="flex justify-center text-surface-on-variant"><OrderTypeIcon type={order.type} /></div>
            <p className="mt-2 text-surface-on-variant">Order type</p>
            <p className="mt-1 text-base font-bold capitalize text-surface-on">{order.type}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-white p-3 text-center">
            <div className="flex justify-center text-surface-on-variant"><UserRound size={15} /></div>
            <p className="mt-2 text-surface-on-variant">Customer</p>
            <p className="mt-1 text-base font-bold text-surface-on">{order.customer || 'Walk-in customer'}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-white p-3 text-center">
            <div className="flex justify-center text-surface-on-variant"><CreditCard size={15} /></div>
            <p className="mt-2 text-surface-on-variant">Payment</p>
            <p className="mt-1 text-base font-bold capitalize text-surface-on">{order.paymentMethod || 'Pending'}</p>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl bg-surface-container-low p-3 text-xs sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-white p-3">
            <div className="mt-0.5 shrink-0 text-primary"><UserRound size={16} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-surface-on">Customer</p>
              <p className="mt-2 text-sm font-semibold text-surface-on">{order.customer || 'Walk-in customer'}</p>
              <p className="mt-1 text-surface-on-variant">Phone: {customerPhone}</p>
              <p className="mt-1 text-surface-on-variant">Email: {customerEmail}</p>
            </div>
          </div>

          {order.deliveryAddress && (
            <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-white p-3">
              <div className="mt-0.5 shrink-0 text-primary"><MapPin size={16} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-surface-on">Delivery address</p>
                <p className="mt-2 text-sm text-surface-on-variant">{order.deliveryAddress}</p>
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xl font-bold text-surface-on">Order items</h3>
          <div className="divide-y divide-outline-variant rounded-xl border border-outline-variant bg-white">
            {order.items?.map((item, index) => (
              <div className="flex items-start justify-between gap-4 p-3" key={`${item.name}-${index}`}>
                <div className="flex min-w-0 items-start gap-3">
                  <div className="order-item-photo" style={{ backgroundImage: `url(${item.image || 'https://wrapandrolltz.com/uploads/photo_gallery/d706fc0ef56440dd131465fd75aae870.jpg'})` }} />
                  <div>
                    <p className="text-sm font-semibold"><span className="mr-2 text-primary">{item.qty}x</span>{item.name}</p>
                    {item.modifiers?.length > 0 && <p className="mt-1 text-xs text-secondary">{item.modifiers.join(', ')}</p>}
                    {item.specialInstructions && <p className="mt-1 text-xs italic text-surface-on-variant">Note: {item.specialInstructions}</p>}
                  </div>
                </div>
                <span className="whitespace-nowrap text-sm font-bold">{formatCurrency(item.price * item.qty)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-outline-variant pt-3 text-sm">
          <div className="flex justify-between text-surface-on-variant"><span>Subtotal</span><span>{formatCurrency(order.subtotal || 0)}</span></div>
          <div className="flex justify-between text-surface-on-variant"><span>Tax</span><span>{formatCurrency(order.tax || 0)}</span></div>
          <div className="flex justify-between border-t border-outline-variant pt-2 text-base font-bold">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(order.total || 0)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function OrderCard({ order, now, onSelect }) {
  const itemCount = order.items?.reduce((sum, item) => sum + item.qty, 0) || 0;
  return <article className="flex min-h-[285px] flex-col rounded-2xl border border-outline-variant bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-surface-on">{order.id}</p><p className="mt-1 text-[10px] text-surface-on-variant">{itemCount} item{itemCount === 1 ? '' : 's'}</p></div><StatusBadge status={order.status} /></div>
    <div className="mt-4 flex items-start gap-2"><span className="mt-0.5 text-primary"><OrderTypeIcon type={order.type} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{order.customer || 'Walk-in customer'}</p><p className="mt-1 text-xs capitalize text-surface-on-variant">{order.type}{order.table ? ` · Table ${order.table}` : ''}</p>{order.deliveryAddress && <p className="mt-1 truncate text-[10px] text-surface-on-variant">{order.deliveryAddress}</p>}</div></div>
    <div className="mt-4 flex-1 rounded-xl bg-surface-container-low p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-surface-on-variant">Items</p>{order.items?.length ? <p className="mt-1 line-clamp-3 text-xs text-surface-on">{order.items.map((item) => `${item.qty}x ${item.name}`).join(', ')}</p> : <p className="mt-1 text-xs text-surface-on-variant">No item details recorded</p>}</div>
    <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-[10px] text-surface-on-variant">Placed</p><p className="mt-1 text-xs font-semibold">{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p><p className="mt-1 text-[10px] text-surface-on-variant">{new Date(order.createdAt).toLocaleDateString()}</p></div><div className="text-right"><p className="text-lg font-bold text-primary">{formatCurrency(order.total || 0)}</p><p className="mt-1 text-[10px] font-semibold text-warning">{getCountdownText(order, now)}</p></div></div>
    <button onClick={() => onSelect(order)} className="mt-4 flex w-full items-center justify-center gap-1 rounded-xl border border-outline-variant px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5">View details <ChevronRight size={14} /></button>
  </article>;
}

export default function OrdersListPage() {
  const orders = useOrderStore((s) => s.orders);
  const fetchOrders = useOrderStore((s) => s.fetchOrders);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetchOrders().finally(() => setLoading(false));
  }, [fetchOrders]);

  useWebSocket((event) => {
    if (event === 'order:created' || event === 'order:updated') fetchOrders();
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const visibleOrders = useMemo(() => orders.filter((order) => {
    const searchText = `${order.id} ${order.customer || ''} ${order.type || ''} ${(order.items || []).map((item) => item.name).join(' ')}`.toLowerCase();
    return (activeFilter === 'all' || order.status === activeFilter) && searchText.includes(search.toLowerCase());
  }), [orders, activeFilter, search]);
  const statusCount = (status) => orders.filter((order) => order.status === status).length;

  return (
    <div className="orders-page p-4 sm:p-6">
      <PageHeader title="All Orders" subtitle="Track every order from the website, FOH, and delivery channel" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="orders-summary-card border-l-4 border-primary"><p>All orders</p><strong>{orders.length}</strong><span>Across all channels</span></div><div className="orders-summary-card border-l-4 border-secondary"><p>Pending</p><strong>{statusCount('pending')}</strong><span>Waiting for kitchen</span></div><div className="orders-summary-card border-l-4 border-warning"><p>Preparing</p><strong>{statusCount('preparing')}</strong><span>Currently cooking</span></div><div className="orders-summary-card border-l-4 border-success"><p>Ready</p><strong>{statusCount('ready')}</strong><span>Ready to serve</span></div></div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex gap-2 overflow-x-auto">{filters.map((filter) => <button key={filter.id} onClick={() => setActiveFilter(filter.id)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-colors ${activeFilter === filter.id ? 'bg-primary text-white' : 'bg-white text-surface-on hover:bg-surface-container-low'}`}>{filter.label}{filter.id !== 'all' && <span className="ml-2 opacity-70">{statusCount(filter.id)}</span>}</button>)}</div><div className="relative w-full lg:w-72"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, item..." className="input-field pl-9" /></div></div>
      <div>
        {loading ? <div className="card p-6 text-sm text-surface-on-variant">Loading orders...</div> : visibleOrders.length === 0 ? <div className="card p-10 text-center"><ShoppingBag size={30} className="mx-auto mb-2 text-outline" /><p className="text-sm font-semibold">No orders found</p><p className="mt-1 text-xs text-surface-on-variant">Try another search or status filter.</p></div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleOrders.map((order) => <OrderCard key={order.id} order={order} now={now} onSelect={setSelectedOrder} />)}
        </div>}
      </div>
      <OrderDetails order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}
