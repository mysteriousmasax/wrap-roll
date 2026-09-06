import { useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import useAuthStore from '../../store/useAuthStore';
import BrandLogo from '../brand/BrandLogo';
import {
  LayoutGrid, ShoppingBag, ChefHat, Users, BarChart3, ClipboardList,
  Package, UserCog, Settings, Bell, LogOut, TrendingUp, Calendar, X,
  ChevronLeft, ChevronRight, Gift, WalletCards, Sparkles
} from 'lucide-react';

const navItems = [
  { path: '/pos', label: 'POS Till', icon: LayoutGrid, roles: ['admin', 'foh'] },
  { path: '/pos/tables', label: 'Tables', icon: ClipboardList, roles: ['admin', 'foh'] },
  { path: '/kds', label: 'Kitchen', icon: ChefHat, roles: ['admin', 'kitchen'] },
  { path: '/orders', label: 'Orders', icon: ShoppingBag, roles: ['admin', 'foh', 'manager'] },
  { path: '/crm', label: 'CRM & Loyalty', icon: Users, roles: ['admin', 'manager', 'executive'] },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'executive', 'manager'] },
  { path: '/management/menu', label: 'Menu Editor', icon: Package, roles: ['admin', 'manager'] },
  { path: '/management/operations', label: 'Operations', icon: WalletCards, roles: ['admin', 'manager', 'executive'] },
  { path: '/management/people', label: 'People & HR', icon: UserCog, roles: ['admin'] },
  { path: '/management/loyalty', label: 'Loyalty Items', icon: Gift, roles: ['admin', 'manager'] },
  { path: '/management/campaigns', label: 'Campaigns', icon: Calendar, roles: ['admin', 'manager', 'executive'] },
  { path: '/management/reports', label: 'Reports', icon: TrendingUp, roles: ['admin', 'executive'] },
  { path: '/assistant', label: 'Gemini Assistant', icon: Sparkles, roles: ['admin', 'executive', 'manager', 'foh', 'kitchen'] },
  { path: '/notifications', label: 'Notifications', icon: Bell, roles: ['admin', 'manager', 'foh'] },
  { path: '/management/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

const isImageAvatar = (value) => typeof value === 'string' && /^data:image\/(png|jpe?g|webp);base64,/i.test(value);

export default function Sidebar({ isOpen, onClose, compact, onToggleCollapse }) {
  const { currentUser, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef(null);

  const filteredNav = navItems.filter(
    (item) => currentUser && item.roles.includes(currentUser.role)
  );

  useEffect(() => {
    if (isOpen) onClose && onClose();
  }, [location.pathname]);

  useEffect(() => {
    const collapseOnOutsideClick = (event) => {
      if (window.innerWidth < 768 || compact || sidebarRef.current?.contains(event.target)) return;
      onToggleCollapse?.();
    };
    document.addEventListener('pointerdown', collapseOnOutsideClick);
    return () => document.removeEventListener('pointerdown', collapseOnOutsideClick);
  }, [compact, onToggleCollapse]);

  const sidebarContent = (
    <>
      <div className="p-4 border-b border-outline-variant flex items-center justify-between">
        <div className="min-w-0">
          <BrandLogo className="dashboard-brand-logo" variant="light" />
          {!compact && <p className="text-xs text-surface-on-variant mt-0.5">Point of Sale</p>}
        </div>
        <div className="flex items-center gap-1">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex p-1.5 rounded-lg hover:bg-surface-container text-surface-on-variant transition-colors"
              title={compact ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {compact ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          )}
          {onClose && (
              <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-surface-container">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5" onClick={() => onClose?.()}>
        {filteredNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg text-sm font-medium transition-all',
                compact ? 'px-2 py-2.5 justify-center' : 'px-3 py-2.5',
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-surface-on hover:bg-surface-container-low'
              )
            }
            title={compact ? item.label : undefined}
          >
            <item.icon size={18} className="shrink-0" />
            {!compact && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={clsx('p-3 border-t border-outline-variant', compact && 'px-2')}>
        <div className={clsx('flex items-center gap-2 mb-2', compact && 'justify-center')}>
          {isImageAvatar(currentUser?.avatar) ? (
            <img src={currentUser.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-container text-xs font-bold text-secondary">
              {currentUser?.avatar || currentUser?.name?.split(' ').map((part) => part[0]).join('').slice(0, 2)}
            </div>
          )}
          {!compact && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{currentUser?.name}</p>
              <p className="text-xs text-surface-on-variant capitalize">{currentUser?.role}</p>
            </div>
          )}
        </div>
        <button
          onClick={() => { logout(); window.location.assign('/'); }}
          className={clsx(
            'flex items-center gap-2 rounded-lg text-xs text-surface-on-variant hover:bg-surface-container-low transition-colors',
            compact ? 'w-full justify-center px-2 py-2' : 'w-full px-3 py-2'
          )}
          title={compact ? 'Sign Out' : undefined}
        >
          <LogOut size={14} />
          {!compact && <span>Sign Out</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        </div>
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={clsx(
          'dashboard-sidebar bg-white border-r border-outline-variant flex flex-col h-screen z-50 transition-all duration-300',
          compact ? 'dashboard-sidebar-compact' : '',
          compact ? 'w-16' : 'w-60',
          compact ? 'relative' : '',
          // Mobile: fixed overlay that slides in/out
          // Desktop: relative, always visible in flow
          'fixed md:relative',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}