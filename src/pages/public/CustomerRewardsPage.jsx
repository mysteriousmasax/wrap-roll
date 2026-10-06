import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock3, Gift, KeyRound, Sparkles } from 'lucide-react';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/format';

export default function CustomerRewardsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState(() => searchParams.get('identifier') || localStorage.getItem('wraproll_customer_phone') || localStorage.getItem('wraproll_customer_email') || '');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('wraproll_customer_session');
    if (!token) return;
    let active = true;
    api.getPublicCustomerSession(token)
      .then((profile) => { if (active) setCustomer(profile); })
      .catch(() => {
        localStorage.removeItem('wraproll_customer_session');
        if (active) setCustomer(null);
      });
    return () => { active = false; };
  }, []);

  const requestCode = async (event) => {
    event.preventDefault();
    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier) return setError('Enter the email address or phone number on your customer profile.');
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await api.requestCustomerVerification(cleanIdentifier);
      setCodeSent(true);
      setNotice(result.message);
    } catch (requestError) {
      setError(requestError.message || 'We could not send a verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api.verifyCustomerCode(identifier.trim(), code.trim());
      localStorage.setItem('wraproll_customer_session', result.token);
      localStorage.setItem('wraproll_customer_name', result.customer.name || '');
      localStorage.setItem('wraproll_customer_phone', result.customer.phone || '');
      localStorage.setItem('wraproll_customer_email', result.customer.email || '');
      setCustomer(result.customer);
      setCodeSent(false);
      setNotice('This browser will remember your rewards for 30 days.');
    } catch (verifyError) {
      setError(verifyError.message || 'That code is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  const forgetCustomer = () => {
    localStorage.removeItem('wraproll_customer_session');
    setCustomer(null);
    setCode('');
    setCodeSent(false);
    setNotice('This browser no longer remembers your rewards profile.');
  };

  return (
    <main className="min-h-screen bg-[#fffaf8] px-4 py-10 text-slate-800">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 rounded-2xl bg-[#ae002a] px-6 py-5 text-white shadow-lg shadow-[#ae002a]/20">
          <p className="text-xs uppercase tracking-[0.18em] text-white/80">Wrap &amp; Roll</p>
          <h1 className="mt-2 text-2xl font-black">Your Roll Points</h1>
          <p className="mt-2 text-sm text-white/80">Verify your email or phone to see your points and saved favorites.</p>
        </header>

        {!customer ? (
          <section className="rounded-2xl border border-[#f2d9dd] bg-white p-5 shadow-sm">
            <form onSubmit={codeSent ? verifyCode : requestCode} className="space-y-3">
              <label className="block text-xs font-bold text-[#554e46]">
                Email or phone number
                <input
                  value={identifier}
                  onChange={(event) => { setIdentifier(event.target.value); setCodeSent(false); setCode(''); }}
                  placeholder="name@example.com or +255 712 345 678"
                  autoComplete="email tel"
                  className="mt-1 w-full rounded-xl border border-[#e5d5d9] bg-[#fff7f8] px-4 py-3 text-sm font-normal outline-none transition focus:border-[#ae002a]"
                />
              </label>
              {codeSent && (
                <label className="block text-xs font-bold text-[#554e46]">
                  Verification code
                  <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" className="mt-1 w-full rounded-xl border border-[#e5d5d9] bg-[#fff7f8] px-4 py-3 text-sm font-normal tracking-[0.18em] outline-none focus:border-[#ae002a]" />
                </label>
              )}
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
              {notice && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{notice}</p>}
              <button type="submit" disabled={loading || (codeSent && code.length !== 6)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#ae002a] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#8f0021] disabled:opacity-50 sm:w-auto">
                <KeyRound size={15} />{loading ? 'Please wait...' : codeSent ? 'Verify and remember me' : 'Send verification code'}
              </button>
              {codeSent && <button type="button" onClick={requestCode} disabled={loading} className="ml-2 min-h-11 rounded-xl px-3 text-xs font-bold text-[#ae002a] hover:bg-[#fff3ef]">Send another code</button>}
              {codeSent && <p className="text-[11px] text-slate-500">Codes can be resent after one minute. For phone sign-in, the code goes to the email on your profile.</p>}
              {codeSent && <p className="text-[11px] text-slate-500">If you have no email on file, ask staff to add one to your customer profile.</p>}
            </form>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-[#f2d9dd] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Welcome back</p>
                  <h2 className="mt-1 text-xl font-black text-[#ae002a]">{customer.name}</h2>
                </div>
                <div className="min-w-32 rounded-xl bg-[#ae002a]/10 px-4 py-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ae002a]">Roll Points</p>
                  <p className="mt-1 text-3xl font-black text-[#ae002a]">{customer.rollPoints}</p>
                </div>
              </div>
              {notice && <p className="mt-3 text-xs text-emerald-800" role="status">{notice}</p>}
              <button type="button" onClick={forgetCustomer} className="mt-4 text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4">Forget this device</button>
            </section>

            <section className="mt-6">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles size={17} className="text-[#ae002a]" />
                <h2 className="text-base font-black">Your usual order</h2>
              </div>
              {customer.favoriteOrders?.length ? (
                <div className="divide-y divide-[#eee4d5] rounded-2xl border border-[#eee4d5] bg-white">
                  {customer.favoriteOrders.map((order, index) => (
                    <article key={`${order.createdAt}-${index}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><Clock3 size={13} />Last ordered {new Date(order.createdAt).toLocaleDateString()}</p>
                        <p className="mt-1 text-sm font-bold">{order.items.map((item) => `${item.qty} × ${item.name}`).join(' · ')}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatCurrency(order.total)}</p>
                      </div>
                      <button type="button" onClick={() => navigate('/', { state: { favoriteOrder: order } })} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ae002a] px-4 py-2 text-xs font-bold text-white hover:bg-[#8f0021]">
                        <Gift size={14} /> Add to cart <ArrowRight size={13} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-[#e5d5d9] bg-white px-4 py-6 text-sm text-slate-500">Paid orders will appear here so you can reorder them in one tap.</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}