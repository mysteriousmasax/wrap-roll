import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';

export default function CustomerRewardsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState(searchParams.get('identifier') || '');
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(Boolean(searchParams.get('identifier')));
  const [error, setError] = useState('');

  const lookupCustomer = async (nextIdentifier = identifier) => {
    const cleanValue = String(nextIdentifier || '').trim();
    if (!cleanValue) {
      setCustomer(null);
      setError('Enter your phone number, email, or NFC tag code.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await api.getPublicCustomerPoints(cleanValue);
      setCustomer(result);
      setSearchParams({ identifier: cleanValue }, { replace: true });
    } catch (err) {
      setCustomer(null);
      setError(err.message || 'We could not find a matching customer record.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialIdentifier = searchParams.get('identifier');
    if (initialIdentifier) {
      setIdentifier(initialIdentifier);
      lookupCustomer(initialIdentifier);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-10 text-slate-800">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 rounded-3xl bg-[#ae002a] px-6 py-5 text-white shadow-lg shadow-[#ae002a]/20">
          <p className="text-xs uppercase tracking-[0.24em] text-white/80">Wrap & Roll</p>
          <h1 className="mt-2 text-3xl font-black">Your loyalty rewards</h1>
          <p className="mt-2 text-sm text-white/80">Check your roll points without logging in. Use your phone number, email, or NFC tag code.</p>
        </div>

        <div className="rounded-3xl border border-[#f2d9dd] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && lookupCustomer()}
              placeholder="e.g. +255 712 345 678 or WR-9001"
              className="flex-1 rounded-2xl border border-[#e5d5d9] bg-[#fff7f8] px-4 py-3 text-sm outline-none ring-0 transition focus:border-[#ae002a]"
            />
            <button
              type="button"
              onClick={() => lookupCustomer()}
              className="rounded-2xl bg-[#ae002a] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#8f0021]"
              disabled={loading}
            >
              {loading ? 'Checking...' : 'Check points'}
            </button>
          </div>

          {error && <p className="mt-4 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        {customer && (
          <div className="mt-6 rounded-3xl border border-[#f2d9dd] bg-gradient-to-br from-[#fffaf8] to-[#fff] p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Member</p>
                <h2 className="mt-2 text-2xl font-black text-[#ae002a]">{customer.name}</h2>
              </div>
              <div className="rounded-2xl bg-[#ae002a]/10 px-4 py-3 text-center">
                <p className="text-xs uppercase tracking-[0.22em] text-[#ae002a]">Roll points</p>
                <p className="mt-1 text-3xl font-black text-[#ae002a]">{customer.rollPoints}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Phone</p>
                <p className="mt-2 text-sm font-semibold">{customer.phone || 'Not shared'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Email</p>
                <p className="mt-2 text-sm font-semibold">{customer.email || 'Not shared'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">NFC tag</p>
                <p className="mt-2 text-sm font-semibold">{customer.nfcTagCode || 'Not linked'}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="rounded-full bg-[#ae002a]/10 px-3 py-1 font-medium text-[#ae002a]">{customer.customerSegment || 'Regular'} member</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">{customer.preferredChannel || 'pos'} channel</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
