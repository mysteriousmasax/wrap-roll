import { useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { ApiError } from '../../api/client';
import BrandLogo from '../../components/brand/BrandLogo';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const attemptLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await login({ username: identifier, password });
      const role = useAuthStore.getState().currentUser?.role;
      const landingRoutes = {
        kitchen: '/kds',
        manager: '/analytics',
        executive: '/analytics',
        admin: '/pos',
        foh: '/pos',
      };
      navigate(landingRoutes[role] || '/pos');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please check your username and PIN/password.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!identifier || !password) {
      setError('Enter your username and PIN/password to continue.');
      return;
    }
    attemptLogin();
  };

  return (
    <div className="login-screen min-h-screen bg-[#fffaf3] px-4 py-8 text-[#1f1f1f]">
      <div className="mx-auto flex max-w-6xl overflow-hidden rounded-[30px] border border-[#f3e5d7] bg-white shadow-[0_30px_80px_rgba(36,33,30,0.12)]">
        <div className="hidden w-1/2 bg-[#161311] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-[#f2d77a] bg-white/5 px-3 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#f5d777]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5d777] text-[#1a120f] font-black">W</span>
              <BrandLogo className="login-brand-logo-on-dark" variant="dark" />
            </div>
            <h1 className="max-w-md font-[Georgia] text-5xl font-bold leading-none text-white">Fresh meals, better service.</h1>
            <p className="mt-5 max-w-md text-base text-[#f3e5d7]">
              Sign in to the restaurant operations portal and manage orders, kitchen flow, staff, and sales in one place.
            </p>
          </div>

        </div>

        <div className="flex w-full items-center justify-center bg-[#fffdf9] p-6 sm:p-10 lg:w-1/2">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:text-left">
              <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-[#f0d9a8] bg-[#fff3dc] px-4 py-2 shadow-sm lg:mx-0">
                <BrandLogo className="login-brand-logo" variant="light" />
              </div>
              <h2 className="text-3xl font-bold text-[#1d1a17]">Welcome back</h2>
              <p className="mt-2 text-sm text-[#665f5a]">Use your username and PIN or password to access your dashboard.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#665f5a]">Username or staff name</span>
                <div className="relative">
                  <UserRound size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a817a]" />
                  <input
                    autoComplete="username"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    className="w-full rounded-2xl border border-[#e5d4bf] bg-white py-3 pl-10 pr-4 text-sm text-[#1f1f1f] outline-none transition focus:border-[#e00000] focus:ring-4 focus:ring-[#f9d7d7]"
                    placeholder="e.g. adila.ismail or Adila Ismail"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#665f5a]">PIN or password</span>
                <div className="relative">
                  <LockKeyhole size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a817a]" />
                  <input
                    autoComplete="current-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-2xl border border-[#e5d4bf] bg-white py-3 pl-10 pr-4 text-sm text-[#1f1f1f] outline-none transition focus:border-[#e00000] focus:ring-4 focus:ring-[#f9d7d7]"
                    placeholder="Enter your PIN or password"
                  />
                </div>
              </label>

              {error && (
                <div className="rounded-2xl border border-[#f9d7d7] bg-[#fff1f1] px-3 py-2 text-sm font-medium text-[#b3261e]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e00000] px-5 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-white transition hover:bg-[#ba0000] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign in'}
                <ArrowRight size={16} />
              </button>
            </form>

            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#f0e7db] bg-[#fff7eb] px-3 py-2 text-xs text-[#574f49]">
              <ShieldCheck size={16} className="text-[#d5a726]" />
              Secure access for staff, managers, and administrators.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
