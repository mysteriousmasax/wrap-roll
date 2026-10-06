import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import BrandLogo from '../../components/brand/BrandLogo';
import RoadsideTrackingPanel from '../../components/public/RoadsideTrackingPanel';
import { api } from '../../api/client';

export default function RoadsideTrackingPage() {
  const { orderId } = useParams();
  const storageKey = `wraproll_roadside_access_${orderId}`;
  const [accessToken, setAccessToken] = useState(() => {
    const hashToken = window.location.hash.slice(1);
    return hashToken || sessionStorage.getItem(storageKey) || '';
  });
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    sessionStorage.setItem(storageKey, accessToken);
    if (window.location.hash) window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
  }, [accessToken, storageKey]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.getCustomerRoadsideOrder(orderId, accessToken);
        if (active) {
          setOrder(result);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError.message || 'This tracking link is unavailable.');
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [orderId, accessToken]);

  return <main className="min-h-screen bg-[#faf7f2] px-4 py-5 text-[#24211e]">
    <div className="mx-auto max-w-xl">
      <a href="/" aria-label="Wrap and Roll home"><BrandLogo /></a>
      <section className="mt-6 rounded-xl border border-[#e5ded5] bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold">Roadside order tracking</h1>
        {!accessToken && <p className="mt-3 text-sm text-red-700">This tracking link is incomplete. Open the secure link from your order email.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {!order && accessToken && !error && <p className="mt-3 text-sm text-[#746e67]">Loading your order…</p>}
        {order && !['paid', 'completed'].includes(order.paymentStatus) && order.paymentTerms !== 'invoice' && <p className="mt-3 rounded-lg bg-[#fbf6ee] p-3 text-sm text-[#554e46]">Live tracking will be available after payment is verified.</p>}
      </section>
      {order && (order.paymentStatus === 'paid' || order.paymentTerms === 'invoice') && <div className="mt-4"><RoadsideTrackingPanel order={order} accessToken={accessToken} /></div>}
    </div>
  </main>;
}
