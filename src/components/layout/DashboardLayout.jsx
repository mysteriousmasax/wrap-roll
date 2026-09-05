import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { animate } from 'animejs';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useWebSocket } from '../../hooks/useWebSocket';
import useOrderStore from '../../store/useOrderStore';
import useNotificationStore from '../../store/useNotificationStore';
import ChatInbox from '../kds/ChatInbox';

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
  '/management/inventory': 'Inventory',
  '/management/reports': 'Financial Reports',
  '/management/staff': 'Staff Management',
  '/management/loyalty': 'Loyalty Items',
  '/management/campaigns': 'Birthday & Couples Campaigns',
  '/management/settings': 'System Settings',
  '/hr': 'HR & Staff Tracking',
  '/notifications': 'Notifications',
};

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const supportDrawerRef = useRef(null);
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Wrap & Roll';
  const upsertOrder = useOrderStore((s) => s.upsertOrder);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);

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
    if (event === 'notification:created') fetchNotifications();
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
      {!supportOpen && <button className="global-support-fab" onClick={() => setSupportOpen(true)} aria-label="Open customer support">Customer chats</button>}
      {supportOpen && <aside ref={supportDrawerRef} className="global-support-drawer"><ChatInbox onClose={() => setSupportOpen(false)} /></aside>}
    </div>
  );
}
