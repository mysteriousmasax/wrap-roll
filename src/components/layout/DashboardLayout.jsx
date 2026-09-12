import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { animate } from 'animejs';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useWebSocket } from '../../hooks/useWebSocket';
import useOrderStore from '../../store/useOrderStore';
import useNotificationStore from '../../store/useNotificationStore';
import useSettingsStore from '../../store/useSettingsStore';
import useAuthStore from '../../store/useAuthStore';
import ChatInbox from '../kds/ChatInbox';
import { MessageCircle } from 'lucide-react';

const pageTitles = {
  '/pos': 'POS Till',
  '/pos/tables': 'Table Management',
  '/pos/payment': 'Payment',
  '/pos/success': 'Payment Success',
  '/kds': 'Kitchen Display',
  '/orders': 'All Orders',
  '/crm': 'CRM & Loyalty',
  '/crm/whatsapp': 'WhatsApp',
  '/analytics': 'Analytics Dashboard',
  '/management/menu': 'Menu Editor',
  '/management/operations': 'Operations Hub',
  '/management/reports': 'Financial Reports',
  '/assistant': 'Gemini Assistant',
  '/management/people': 'People & HR',
  '/management/loyalty': 'Loyalty Items',
  '/management/campaigns': 'Birthday & Couples Campaigns',
  '/management/settings': 'System Settings',
  '/notifications': 'Notifications',
};

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [liveNotice, setLiveNotice] = useState(null);
  const supportDrawerRef = useRef(null);
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Wrap & Roll';
  const upsertOrder = useOrderStore((s) => s.upsertOrder);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const currentUser = useAuthStore((s) => s.currentUser);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!supportOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!supportDrawerRef.current?.contains(event.target)) setSupportOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [supportOpen]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const scrollContainer = document.querySelector('.dashboard-column');
    const targets = document.querySelectorAll(
      '.dashboard-main .card, .dashboard-main [data-scroll-reveal], .dashboard-main .kds-lane, .dashboard-main .kds-order-card, .dashboard-main .pos-product-card, .dashboard-main .pos-toolbar, .dashboard-main .pos-cart-panel, .dashboard-main table tbody tr'
    );
    const animations = new Map();

    targets.forEach((target) => target.classList.add('scroll-reveal'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animations.get(entry.target)?.pause();
        const animation = animate(entry.target, {
          opacity: [0, 1],
          y: ['1.25rem', 0],
          scale: [0.98, 1],
          ease: 'out(4)',
          duration: 650,
        });
        animations.set(entry.target, animation);
      });
    }, { root: scrollContainer, threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    targets.forEach((target) => observer.observe(target));
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.revert());
      targets.forEach((target) => target.classList.remove('scroll-reveal'));
    };
  }, [location.pathname]);

  useWebSocket((event, data) => {
    if (event === 'order:created' || event === 'order:updated') upsertOrder(data);
    if (event === 'notification:created') {
      const roles = data?.audienceRoles || (data?.audienceRole ? [data.audienceRole] : []);
      const visible = (!data?.audienceUserId || data.audienceUserId === currentUser?.id)
        && (!roles.length || roles.includes(currentUser?.role) || currentUser?.role === 'admin');
      if (visible) {
        fetchNotifications();
        setLiveNotice({ title: data.title || 'Wrap & Roll update', message: data.message || 'You have a new update.' });
        window.setTimeout(() => setLiveNotice(null), 6000);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(data.title || 'Wrap & Roll update', { body: data.message || 'You have a new update.' });
        }
      }
    }
    if (event === 'settings:updated') useSettingsStore.setState((state) => ({ settings: { ...state.settings, ...data } }));
  });

  return (
    <div className="dashboard-shell flex h-screen overflow-hidden bg-surface">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        compact={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />
      <div className="dashboard-column flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden">
        <TopBar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="dashboard-main flex-none">
          <Outlet />
        </main>
      </div>
      {!supportOpen && <button className="global-support-fab" onClick={() => setSupportOpen(true)} aria-label="Open customer support" title="Customer chats"><MessageCircle size={19} /><span>Customer chats</span><i aria-hidden="true" /> </button>}
      {supportOpen && <aside ref={supportDrawerRef} className="global-support-drawer"><ChatInbox onClose={() => setSupportOpen(false)} /></aside>}
      {liveNotice && (
        <button type="button" onClick={() => { setLiveNotice(null); navigate('/notifications'); }} className="fixed right-5 top-20 z-[60] w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-primary/20 bg-white p-4 text-left shadow-elevated animate-slide-up">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Live notification</p>
          <p className="mt-1 text-sm font-bold text-surface-on">{liveNotice.title}</p>
          <p className="mt-1 text-xs text-surface-on-variant">{liveNotice.message}</p>
        </button>
      )}
    </div>
  );
}
