import { useEffect, useRef, useState } from 'react';
import { CircleStop, MapPin, Navigation, Star } from 'lucide-react';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../../api/client';

const DEFAULT_CENTER = [-6.7594617, 39.2517226];

function FollowLatestPoint({ point }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 15), { animate: true });
  }, [map, point]);
  return null;
}

export default function RoadsideTrackingPanel({ order, accessToken }) {
  const [tracking, setTracking] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [position, setPosition] = useState(null);
  const [trail, setTrail] = useState([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submittedRating, setSubmittedRating] = useState(false);
  const watcher = useRef(null);
  const lastSentAt = useRef(0);
  const latestPoint = position ? [position.latitude, position.longitude] : DEFAULT_CENTER;
  const isComplete = order.status === 'completed';

  useEffect(() => () => {
    if (watcher.current != null) navigator.geolocation?.clearWatch(watcher.current);
  }, []);

  const startTracking = async () => {
    setError('');
    setNotice('');
    if (!navigator.geolocation) {
      setError('Live location is not supported by this browser. You can still complete the order without it.');
      return;
    }
    setWorking(true);
    try {
      await api.startRoadsideTracking(order.id, accessToken);
      const watchId = navigator.geolocation.watchPosition(async ({ coords }) => {
        const point = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          heading: coords.heading,
          speed: coords.speed,
        };
        setPosition(point);
        setTrail((current) => [...current, [point.latitude, point.longitude]].slice(-120));
        if (Date.now() - lastSentAt.current < 5500) return;
        lastSentAt.current = Date.now();
        try {
          await api.updateRoadsideLocation(order.id, accessToken, point);
          setError('');
        } catch (locationError) {
          setError(locationError.message || 'Location update could not be sent. Check your connection.');
        }
      }, (locationError) => {
        setTracking(false);
        setError(locationError.code === 1
          ? 'Location permission was denied. You can still complete the order without sharing location.'
          : 'We could not read your location. Check GPS and try again.');
        if (watcher.current != null) navigator.geolocation.clearWatch(watcher.current);
        watcher.current = null;
        api.stopRoadsideTracking(order.id, accessToken).catch(() => {});
      }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
      watcher.current = watchId;
      setTracking(true);
      setNotice('Sharing this order’s location with Wrap & Roll staff. Keep this page open while driving.');
    } catch (startError) {
      setError(startError.message || 'Could not start roadside tracking.');
    } finally {
      setWorking(false);
    }
  };

  const stopTracking = async () => {
    setWorking(true);
    setError('');
    try {
      await api.stopRoadsideTracking(order.id, accessToken);
      if (watcher.current != null) navigator.geolocation?.clearWatch(watcher.current);
      watcher.current = null;
      setTracking(false);
      setNotice('Location sharing stopped.');
    } catch (stopError) {
      setError(stopError.message || 'Could not stop location sharing.');
    } finally {
      setWorking(false);
    }
  };

  const submitRating = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await api.rateRoadsideHandoff(order.id, accessToken, { rating, comment });
      setSubmittedRating(true);
    } catch (ratingError) {
      setError(ratingError.message || 'Could not submit your rating.');
    }
  };

  return (
    <section className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-h-[78vh] w-full max-w-xl overflow-y-auto rounded-xl border border-[#e5ded5] bg-white shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5">
      <div className="flex items-start justify-between gap-3 border-b border-[#eee4d5] p-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-[#24211e]"><Navigation size={16} className="text-[#ae002a]" /> Roadside handoff</p>
          <p className="mt-1 text-xs text-[#746e67]">Order {order.orderNumber || order.id}</p>
        </div>
        {tracking && <button type="button" onClick={stopTracking} disabled={working} title="Stop sharing location" className="inline-flex items-center gap-1 rounded-lg border border-[#ebdccb] px-2.5 py-2 text-xs font-semibold text-[#ae002a] disabled:opacity-50"><CircleStop size={15} /> Stop sharing</button>}
      </div>
      {!isComplete && <div className="p-4">
        {!tracking && <div className="mb-3 rounded-lg bg-[#fbf6ee] p-3 text-xs leading-5 text-[#554e46]">Share your live location only for this order so staff can meet you safely near the restaurant. You can stop sharing at any time. Keep this page open while driving; browser GPS may pause in the background.</div>}
        <div className="relative h-52 overflow-hidden rounded-lg border border-[#e5ded5]">
          <MapContainer center={latestPoint} zoom={position ? 15 : 13} scrollWheelZoom={false} className="h-full w-full">
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FollowLatestPoint point={position} />
            {trail.length > 0 && <><Polyline positions={trail} pathOptions={{ color: '#ae002a', weight: 5 }} /><CircleMarker center={latestPoint} radius={8} pathOptions={{ color: '#ae002a', fillColor: '#fff', fillOpacity: 1 }} /></>}
          </MapContainer>
          {!position && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/55 text-xs font-semibold text-[#554e46]"><MapPin size={15} className="mr-1 text-[#ae002a]" /> Location appears after sharing starts</div>}
        </div>
        {position && <p className="mt-2 text-[11px] text-[#746e67]">GPS accuracy about {Math.round(position.accuracy)} m · updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>}
        {order.reservationStatus === 'released' && <p className="mt-2 rounded-lg bg-[#eaf5ed] p-3 text-xs font-semibold text-[#227653]">You’re near the restaurant. Our kitchen and handoff team have been alerted.</p>}
        {error && <p className="mt-2 text-xs font-semibold text-red-700" role="alert">{error}</p>}
        {notice && <p className="mt-2 text-xs text-[#227653]" role="status">{notice}</p>}
        {!tracking && <button type="button" disabled={working} onClick={startTracking} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#ae002a] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Navigation size={16} /> {working ? 'Starting…' : 'Share live location for this order'}</button>}
      </div>}
      {isComplete && <div className="p-4">
        <p className="text-sm font-semibold text-[#227653]">Handoff complete. Thank you.</p>
        {submittedRating ? <p className="mt-3 text-sm text-[#554e46]">Thanks for rating the service.</p> : <form onSubmit={submitRating} className="mt-3 space-y-3">
          <div className="flex gap-1" aria-label="Rate your roadside handoff">
            {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} star${value === 1 ? '' : 's'}`} aria-pressed={rating === value} className="p-1"><Star size={24} fill={rating >= value ? '#e6ac29' : 'none'} color={rating >= value ? '#ae002a' : '#746e67'} /></button>)}
          </div>
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} rows={2} placeholder="Anything we should know? (optional)" className="w-full rounded-lg border border-[#ebdccb] p-3 text-sm" />
          <button type="submit" disabled={!rating} className="rounded-lg bg-[#ae002a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Send rating</button>
          {error && <p className="text-xs font-semibold text-red-700" role="alert">{error}</p>}
        </form>}
      </div>}
    </section>
  );
}
