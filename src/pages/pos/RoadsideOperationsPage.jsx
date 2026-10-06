import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Check, Clock3, Link2, MapPin, Navigation, RefreshCw, Star, Truck, UserRound } from 'lucide-react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import PageHeader from '../../components/layout/PageHeader';
import { api } from '../../api/client';
import useAuthStore from '../../store/useAuthStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { formatCurrency } from '../../utils/format';
import useSettingsStore from '../../store/useSettingsStore';
import { hasGoogleMapsKey, loadGoogleMaps } from '../../lib/googleMaps';

const DEFAULT_CENTER = [-6.7594617, 39.2517226];
const satelliteTileUrl = import.meta.env.VITE_SATELLITE_TILE_URL || '';
const satelliteAttribution = import.meta.env.VITE_SATELLITE_TILE_ATTRIBUTION || 'Satellite imagery provider';

function FollowTrip({ point }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 15), { animate: true });
  }, [map, point]);
  return null;
}

function GoogleHybridTripMap({ trip, branchPoint }) {
  const element = useRef(null);
  const mapRef = useRef(null);
  const branchMarker = useRef(null);
  const customerMarker = useRef(null);
  const trailLine = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    loadGoogleMaps().then(([maps]) => {
      if (!active || !element.current) return;
      const map = new maps.Map(element.current, {
        center: { lat: branchPoint[0], lng: branchPoint[1] },
        zoom: 14,
        mapTypeId: maps.MapTypeId.HYBRID,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
      });
      mapRef.current = map;
      branchMarker.current = new maps.Marker({ map, position: { lat: branchPoint[0], lng: branchPoint[1] }, title: 'Wrap & Roll pickup point', label: 'R' });
      customerMarker.current = new maps.Marker({ map, title: 'Customer location', label: 'C' });
      trailLine.current = new maps.Polyline({ map, path: [], strokeColor: '#ae002a', strokeOpacity: 0.9, strokeWeight: 5 });
      setReady(true);
    }).catch((mapError) => setError(mapError.message || 'Google Maps hybrid view is unavailable.'));
    return () => {
      active = false;
      branchMarker.current?.setMap(null);
      customerMarker.current?.setMap(null);
      trailLine.current?.setMap(null);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const customerPoint = trip?.latitude != null && trip?.longitude != null
      ? { lat: Number(trip.latitude), lng: Number(trip.longitude) }
      : null;
    const trail = (trip?.trail || []).map((entry) => ({ lat: Number(entry.latitude), lng: Number(entry.longitude) }));
    if (customerPoint && (!trail.length || trail.at(-1).lat !== customerPoint.lat || trail.at(-1).lng !== customerPoint.lng)) trail.push(customerPoint);
    customerMarker.current?.setPosition(customerPoint);
    customerMarker.current?.setMap(customerPoint ? mapRef.current : null);
    trailLine.current?.setPath(trail);
    if (customerPoint) mapRef.current.panTo(customerPoint);
  }, [ready, trip]);

  return <div className="relative h-[min(58vh,520px)] min-h-72 overflow-hidden rounded-lg border border-outline-variant">
    <div ref={element} className="h-full w-full" />
    {error && <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-5 text-sm text-red-700">{error}</div>}
  </div>;
}

function TripMap({ trip, layer, branchPoint }) {
  if (layer === 'google-hybrid' && hasGoogleMapsKey()) return <GoogleHybridTripMap trip={trip} branchPoint={branchPoint} />;
  const point = trip?.latitude != null && trip?.longitude != null
    ? { latitude: Number(trip.latitude), longitude: Number(trip.longitude) }
    : null;
  const path = (trip?.trail || []).map((entry) => [Number(entry.latitude), Number(entry.longitude)]);
  const center = point ? [point.latitude, point.longitude] : branchPoint;
  const satelliteReady = layer === 'satellite' && satelliteTileUrl;
  return <div className="relative h-[min(58vh,520px)] min-h-72 overflow-hidden rounded-lg border border-outline-variant">
    <MapContainer center={center} zoom={point ? 15 : 12} scrollWheelZoom className="h-full w-full">
      <TileLayer attribution={satelliteReady ? satelliteAttribution : '&copy; OpenStreetMap contributors'} url={satelliteReady ? satelliteTileUrl : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'} />
      <FollowTrip point={point} />
      <CircleMarker center={branchPoint} radius={10} pathOptions={{ color: '#227653', weight: 3, fillColor: '#fff', fillOpacity: 1 }}><Tooltip permanent direction="top">Wrap &amp; Roll</Tooltip></CircleMarker>
      {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#ae002a', weight: 5, opacity: 0.85 }} />}
      {point && <CircleMarker center={center} radius={10} pathOptions={{ color: '#ae002a', weight: 3, fillColor: '#fff', fillOpacity: 1 }} />}
    </MapContainer>
    {!point && <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-white/50 text-sm font-semibold text-surface-on-variant">Choose an active order with a location update</div>}
    {point && <div className="absolute bottom-2 left-2 z-[500] rounded bg-white/95 px-2 py-1 text-[11px] font-semibold text-surface-on shadow">Accuracy {trip.accuracy ? `${Math.round(trip.accuracy)} m` : 'unknown'} · {trip.locationAt ? new Date(trip.locationAt).toLocaleTimeString() : 'No timestamp'}</div>}
  </div>;
}

function localDateTimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function RoadsideOperationsPage() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const settings = useSettingsStore((state) => state.settings);
  const canManageTerms = ['admin', 'manager'].includes(String(currentUser?.role || '').toLowerCase());
  const [tab, setTab] = useState('trips');
  const [trips, setTrips] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [companyTerms, setCompanyTerms] = useState([]);
  const [staff, setStaff] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [layer, setLayer] = useState('street');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [workingId, setWorkingId] = useState('');
  const [termsEdit, setTermsEdit] = useState({});

  const refresh = async () => {
    const requests = [api.getRoadsideTrips(), api.getReservations(), api.getStaff()];
    if (canManageTerms) requests.push(api.getCompanyTerms());
    const results = await Promise.allSettled(requests);
    const [tripResult, reservationResult, staffResult, termsResult] = results;
    if (tripResult.status === 'fulfilled') setTrips(tripResult.value);
    if (reservationResult.status === 'fulfilled') setReservations(reservationResult.value);
    if (staffResult.status === 'fulfilled') setStaff(staffResult.value);
    if (termsResult?.status === 'fulfilled') setCompanyTerms(termsResult.value);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) setError(failed.reason?.message || 'Some roadside data could not load.');
    else setError('');
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [canManageTerms]);
  useEffect(() => {
    const timer = window.setInterval(refresh, 10000);
    return () => window.clearInterval(timer);
  }, [canManageTerms]);
  useWebSocket((event) => {
    if (event === 'roadside:updated' || event === 'order:updated' || event === 'order:created') refresh();
  });

  const selectedTrip = useMemo(() => trips.find((trip) => String(trip.orderId) === String(selectedOrderId)) || trips[0] || null, [trips, selectedOrderId]);
  const branchPoint = [Number(settings.roadside_pickup_latitude || DEFAULT_CENTER[0]), Number(settings.roadside_pickup_longitude || DEFAULT_CENTER[1])];
  const availableRunners = staff.filter((entry) => entry.userId && ['foh', 'admin', 'manager'].includes(String(entry.role || '').toLowerCase()));

  const runAction = async (id, action, successMessage) => {
    setWorkingId(id);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      await refresh();
    } catch (actionError) {
      setError(actionError.message || 'The action could not be completed.');
    } finally {
      setWorkingId('');
    }
  };

  const changeReservation = async (order, action) => {
    if (action === 'cancel' && ['paid', 'completed'].includes(order.paymentStatus)
      && !window.confirm('Cancel this paid order? The cancellation will not automatically refund the payment; management will need to arrange or record the refund separately.')) return;
    if (action === 'reschedule') {
      const defaultTime = localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000));
      const value = window.prompt('Choose the new local pickup / delivery time (YYYY-MM-DDTHH:mm):', order.scheduledFor ? localDateTimeValue(new Date(order.scheduledFor)) : defaultTime);
      if (!value) return;
      await runAction(order.id, () => api.updateReservation(order.id, { action, scheduledFor: new Date(value).toISOString() }), `Reservation ${order.id} rescheduled.`);
      return;
    }
    await runAction(order.id, () => api.updateReservation(order.id, { action }), action === 'confirm' ? `Reservation ${order.id} confirmed.` : `Reservation ${order.id} cancelled.`);
  };

  const saveTerms = async (company) => {
    const values = termsEdit[company.customerId] || {};
    const status = values.status || company.status;
    const creditLimit = Number(values.creditLimit ?? company.creditLimit);
    await runAction(String(company.customerId), async () => {
      await api.updateCompanyTerms(company.customerId, { status, creditLimit });
    }, `${company.companyName || company.name} terms updated.`);
  };

  return <div className="space-y-5 p-4 sm:p-6">
    <PageHeader title="Roadside & Reservations" subtitle="Live handoffs, paid preorders, and approved company accounts" />
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{notice}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant">
      <div className="flex gap-1 overflow-x-auto">{[
        ['trips', 'Live roadside'], ['reservations', `Reservations (${reservations.length})`], ...(canManageTerms ? [['companies', 'Company terms']] : []),
      ].map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === id ? 'border-primary text-primary' : 'border-transparent text-surface-on-variant hover:text-surface-on'}`}>{label}</button>)}</div>
      <button type="button" onClick={refresh} className="mb-2 inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-white px-3 py-2 text-xs font-semibold"><RefreshCw size={14} /> Refresh</button>
    </div>

    {tab === 'trips' && <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <section className="min-w-0">
        <h2 className="mb-2 text-sm font-bold">Recent customer trips <span className="text-surface-on-variant">{trips.length}</span></h2>
        <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
          {loading && <p className="p-4 text-sm text-surface-on-variant">Loading roadside trips…</p>}
          {!loading && trips.length === 0 && <p className="rounded-lg border border-outline-variant bg-white p-5 text-sm text-surface-on-variant">No recent roadside trips.</p>}
          {trips.map((trip) => <button key={trip.orderId} type="button" onClick={() => setSelectedOrderId(trip.orderId)} className={`w-full rounded-lg border p-3 text-left ${String(selectedTrip?.orderId) === String(trip.orderId) ? 'border-primary bg-primary/5' : 'border-outline-variant bg-white hover:bg-surface-container-low'}`}>
            <div className="flex items-start justify-between gap-2"><span className="text-sm font-bold">{trip.orderNumber}</span><span className="rounded bg-surface-container-low px-2 py-1 text-[10px] font-semibold capitalize">{trip.status.replaceAll('_', ' ')}</span></div>
            <p className="mt-1 text-xs text-surface-on-variant">{trip.customer || 'Customer'} · {trip.customerPhone || 'No phone'}</p>
            <p className="mt-2 flex items-center gap-1 text-[11px] text-surface-on-variant"><MapPin size={12} />{trip.latitude == null ? 'Waiting for first GPS update' : `Last location ${new Date(trip.locationAt).toLocaleTimeString()}`}</p>
            {trip.order?.items?.length > 0 && <p className="mt-2 line-clamp-2 text-xs">{trip.order.items.map((item) => `${item.qty}x ${item.name}`).join(', ')}</p>}
          </button>)}
        </div>
      </section>
      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Customer journey</h2><div className="flex items-center gap-2"><span className="text-xs text-surface-on-variant">Map layer</span><select value={layer} onChange={(event) => setLayer(event.target.value)} className="rounded-lg border border-outline-variant bg-white px-2 py-1.5 text-xs"><option value="street">OpenStreetMap streets</option>{hasGoogleMapsKey() && <option value="google-hybrid">Google satellite hybrid</option>}{satelliteTileUrl && <option value="satellite">Satellite tile layer</option>}</select></div></div>
        <TripMap trip={selectedTrip} layer={layer} branchPoint={branchPoint} />
        {selectedTrip && <div className="grid gap-3 rounded-lg border border-outline-variant bg-white p-3 sm:grid-cols-2">
          <div><p className="text-xs font-bold">{selectedTrip.customer || 'Customer'} · {selectedTrip.orderNumber}</p><p className="mt-1 text-xs text-surface-on-variant">{selectedTrip.customerPhone || 'Phone unavailable'} · {selectedTrip.paymentStatus}</p><p className="mt-1 text-xs text-surface-on-variant">{selectedTrip.order?.scheduledFor ? `Handoff ${new Date(selectedTrip.order.scheduledFor).toLocaleString()}` : 'Handoff time not scheduled'}</p></div>
          <label className="text-xs font-semibold">Runner<select value={selectedTrip.runnerUserId || ''} disabled={workingId === selectedTrip.orderId} onChange={(event) => runAction(selectedTrip.orderId, () => api.assignRoadsideRunner(selectedTrip.orderId, event.target.value || null), 'Runner assignment updated.')} className="mt-1 w-full rounded-lg border border-outline-variant bg-white px-2 py-2"><option value="">Unassigned</option>{availableRunners.map((runner) => <option key={runner.userId} value={runner.userId}>{runner.name} · {runner.role}</option>)}</select></label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">{selectedTrip.order?.reservationStatus === 'confirmed' && !selectedTrip.order?.kitchenReleasedAt && <button type="button" disabled={workingId === selectedTrip.orderId} onClick={() => runAction(selectedTrip.orderId, () => api.releaseRoadsideToKitchen(selectedTrip.orderId), 'Order released to the kitchen.')} className="inline-flex items-center gap-2 rounded-lg bg-[#227653] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Navigation size={14} /> Release to kitchen now</button>}{selectedTrip.order?.kitchenReleasedAt && <span className="text-xs font-semibold text-[#227653]">Kitchen alerted {new Date(selectedTrip.order.kitchenReleasedAt).toLocaleTimeString()}</span>}{selectedTrip.status !== 'completed' && <button type="button" disabled={workingId === selectedTrip.orderId} onClick={() => runAction(selectedTrip.orderId, async () => { const result = await api.getRoadsideShareLink(selectedTrip.orderId); await navigator.clipboard.writeText(result.url); }, 'Private customer tracking link copied.')} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-xs font-semibold disabled:opacity-50"><Link2 size={14} /> Copy customer link</button>}{selectedTrip.status !== 'completed' && <button type="button" disabled={workingId === selectedTrip.orderId} onClick={() => runAction(selectedTrip.orderId, () => api.completeRoadsideHandoff(selectedTrip.orderId), 'Handoff completed. Customer can now rate the service.')} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check size={14} /> Mark handoff complete</button>}<span className="text-[11px] text-surface-on-variant">{selectedTrip.trail?.length || 0} recent location points · exact GPS is fetched over the protected staff API</span></div>
          {selectedTrip.rating != null && <p className="flex items-center gap-2 text-xs font-semibold text-[#8c5a00] sm:col-span-2"><Star size={14} fill="#e6ac29" /> Customer rating: {selectedTrip.rating}/5 {selectedTrip.ratingComment ? `· ${selectedTrip.ratingComment}` : ''}</p>}
        </div>}
      </section>
    </div>}

    {tab === 'reservations' && <section className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-surface-on-variant"><CalendarClock size={15} /> Requests are only confirmed after verified payment or approved company terms.</div>
      {reservations.length === 0 ? <p className="rounded-lg border border-outline-variant bg-white p-6 text-sm text-surface-on-variant">No reservations yet.</p> : reservations.map((order) => <article key={order.id} className="grid gap-3 rounded-lg border border-outline-variant bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{order.id}</h3><span className="rounded bg-surface-container-low px-2 py-1 text-[10px] capitalize">{String(order.reservationStatus).replaceAll('_', ' ')}</span><span className="text-[10px] font-semibold capitalize text-surface-on-variant">{order.paymentStatus} · {order.paymentTerms} · {order.orderSource}</span></div>
          <p className="mt-1 text-xs">{order.customer || 'Customer'} · {order.customerPhone || 'No phone'} · {formatCurrency(order.total || 0)}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-surface-on-variant"><Clock3 size={12} />{order.scheduledFor ? new Date(order.scheduledFor).toLocaleString() : 'ASAP'} · {order.type} · {order.fulfillmentMode === 'roadside_handoff' ? 'Roadside handoff' : order.deliveryAddress || 'Pickup'}</p>
          <p className="mt-2 line-clamp-2 text-xs text-surface-on-variant">{(order.items || []).map((item) => `${item.qty}x ${item.name}`).join(', ')}</p></div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">{order.reservationStatus === 'awaiting_payment' && <span className="mr-1 text-[11px] font-semibold text-[#8c5a00]">Payment required</span>}{order.reservationStatus === 'confirmed' && <button type="button" onClick={() => changeReservation(order, 'reschedule')} disabled={workingId === order.id} className="rounded-lg border border-outline-variant px-3 py-2 text-xs font-semibold">Reschedule</button>}{!['cancelled', 'fulfilled'].includes(order.reservationStatus) && <button type="button" onClick={() => changeReservation(order, 'cancel')} disabled={workingId === order.id} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Cancel</button>}</div>
      </article>)}
    </section>}

    {tab === 'companies' && canManageTerms && <section className="space-y-3">
      <p className="text-xs text-surface-on-variant">Company status and credit limit are enforced on the server at order placement.</p>
      {companyTerms.length === 0 ? <p className="rounded-lg border border-outline-variant bg-white p-6 text-sm text-surface-on-variant">Company customers appear here after their first order.</p> : companyTerms.map((company) => {
        const values = termsEdit[company.customerId] || {};
        return <article key={company.customerId} className="grid gap-3 rounded-lg border border-outline-variant bg-white p-4 md:grid-cols-[minmax(0,1fr)_160px_170px_auto] md:items-end">
          <div><p className="text-sm font-bold">{company.companyName || company.name}</p><p className="mt-1 text-xs text-surface-on-variant">TIN {company.tin || 'not recorded'} · {company.phone || company.email || 'No contact'}</p><p className="mt-1 text-[10px] text-surface-on-variant">{company.approvedBy ? `Updated by ${company.approvedBy}` : 'No invoice terms approval yet'}</p></div>
          <label className="text-xs font-semibold">Terms<select value={values.status ?? company.status} onChange={(event) => setTermsEdit((current) => ({ ...current, [company.customerId]: { ...current[company.customerId], status: event.target.value } }))} className="mt-1 w-full rounded-lg border border-outline-variant bg-white px-2 py-2"><option value="pending">Pending</option><option value="approved">Approved</option><option value="revoked">Revoked</option></select></label>
          <label className="text-xs font-semibold">Credit limit (TZS)<input type="number" min="0" value={values.creditLimit ?? company.creditLimit} onChange={(event) => setTermsEdit((current) => ({ ...current, [company.customerId]: { ...current[company.customerId], creditLimit: event.target.value } }))} className="mt-1 w-full rounded-lg border border-outline-variant px-2 py-2" /></label>
          <button type="button" onClick={() => saveTerms(company)} disabled={workingId === String(company.customerId)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Save terms</button>
        </article>;
      })}
    </section>}
  </div>;
}
