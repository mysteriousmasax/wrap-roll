import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import useNotificationStore from '../../store/useNotificationStore';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { Bell, CheckCircle2, LogOut, Menu, Pencil, UserRound, WifiOff, Wifi, X } from 'lucide-react';
import EditProfileModal from './EditProfileModal';

const isImageAvatar = (value) => typeof value === 'string' && value.startsWith('data:image');

export default function TopBar({ title, onMenuClick }) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const unreadCount = useNotificationStore((s) => s.getUnreadCount());
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const logout = useAuthStore((s) => s.logout);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  const signOut = () => {
    logout();
    window.location.assign('/');
  };

  const initials = currentUser?.name?.split(' ').map((part) => part[0]).join('').slice(0, 2);

  return (
    <header className="dashboard-topbar h-14 bg-white border-b border-outline-variant flex items-center px-4 gap-3 z-30 shrink-0">
      <button
        onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg hover:bg-surface-container transition-colors"
      >
        <Menu size={20} />
      </button>

      {title && (
        <h2 className="font-display font-bold text-sm hidden sm:block truncate">{title}</h2>
      )}

      <div className="flex-1" />

      <div className={'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ' +
        (online ? 'bg-success/10 text-success' : 'bg-error/10 text-error')}>
        {online ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span className="hidden sm:inline">{online ? 'Online' : 'Offline'}</span>
      </div>

      <button
        onClick={() => navigate('/notifications')}
        className="relative p-2 rounded-lg hover:bg-surface-container transition-colors"
      >
        <Bell size={18} className="text-surface-on-variant" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-primary text-white text-xs font-bold h-[18px] min-w-[18px] px-1 rounded-full flex items-center justify-center text-[10px] leading-none">
            {unreadCount}
          </span>
        )}
      </button>

      <div className="relative flex items-center gap-2.5 pl-3 border-l border-outline-variant">
        <button
          onClick={() => setProfileOpen((open) => !open)}
          className="flex items-center gap-2.5 rounded-lg p-1 -mr-1 hover:bg-surface-container-low transition-colors"
          aria-expanded={profileOpen}
          aria-label="Open user profile"
        >
        {isImageAvatar(currentUser?.avatar) ? (
          <img
            src={currentUser.avatar}
            alt=""
            title={currentUser?.name}
            className="w-10 h-10 rounded-full object-cover shadow-sm ring-2 ring-white"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center font-display font-extrabold text-sm text-secondary shadow-sm ring-2 ring-white"
            title={currentUser?.name}
          >
            {currentUser?.avatar || initials}
          </div>
        )}
        <div className="hidden md:block">
          <p className="text-sm font-bold leading-tight">{currentUser?.name}</p>
          <p className="text-xs text-surface-on-variant capitalize leading-tight mt-0.5">{currentUser?.role}</p>
        </div>
        </button>

        {profileOpen && (
          <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-outline-variant bg-white shadow-elevated animate-slide-up">
            <div className="bg-primary px-5 py-5 text-white">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {isImageAvatar(currentUser?.avatar) ? (
                    <img src={currentUser.avatar} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-white/70" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-base font-extrabold text-secondary ring-2 ring-white/70">
                      {currentUser?.avatar || initials}
                    </div>
                  )}
                  <div>
                    <p className="font-display font-bold">{currentUser?.name}</p>
                    <p className="mt-0.5 text-xs capitalize text-white/75">{currentUser?.role} account</p>
                  </div>
                </div>
                <button onClick={() => setProfileOpen(false)} className="rounded-lg p-1 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Close profile"><X size={16} /></button>
              </div>
            </div>
            <div className="space-y-1 p-3">
              <button
                onClick={() => { setProfileOpen(false); setEditProfileOpen(true); }}
                className="flex w-full items-center gap-3 rounded-xl bg-surface-container-low px-3 py-3 text-left hover:bg-surface-container transition-colors"
              >
                <UserRound size={17} className="text-primary" />
                <div className="flex-1"><p className="text-xs font-semibold">Profile</p><p className="text-[10px] text-surface-on-variant">Your staff account</p></div>
                <Pencil size={14} className="text-surface-on-variant" />
              </button>
              <div className="flex items-center gap-3 px-3 py-3">
                <CheckCircle2 size={17} className="text-success" />
                <div><p className="text-xs font-semibold">Account active</p><p className="text-[10px] text-surface-on-variant">Ready for today&apos;s shift</p></div>
              </div>
              <button onClick={signOut} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-error hover:bg-error/5 transition-colors">
                <LogOut size={17} /><span className="text-xs font-semibold">Sign out</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <EditProfileModal
        isOpen={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        currentUser={currentUser}
        onSave={updateProfile}
      />
    </header>
  );
}
