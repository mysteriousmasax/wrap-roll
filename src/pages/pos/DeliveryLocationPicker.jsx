import { useEffect, useState } from 'react';
import { LocateFixed, MapPin, Search, LoaderCircle } from 'lucide-react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [-6.7924, 39.2083];

function MapClickHandler({ onSelect }) {
  useMapEvents({ click: (event) => onSelect(event.latlng.lat, event.latlng.lng) });
  return null;
}

function MapViewport({ point }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo(point, 16, { duration: 0.5 });
  }, [map, point]);
  return null;
}

async function reverseGeocode(latitude, longitude) {
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
  if (!response.ok) throw new Error('Location lookup failed');
  const data = await response.json();
  return data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export default function DeliveryLocationPicker({ value, latitude, longitude, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(value || '');
  const selectedPoint = latitude && longitude ? [Number(latitude), Number(longitude)] : null;

  useEffect(() => {
    if (value !== selectedAddress && value !== query) setQuery(value || '');
  }, [value, selectedAddress, query]);

  useEffect(() => {
    if (query.trim().length < 3 || query === selectedAddress) {
      setSuggestions([]);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=tz&q=${encodeURIComponent(query)}`);
        if (response.ok) setSuggestions(await response.json());
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [query, selectedAddress]);

  const selectLocation = async (nextLatitude, nextLongitude, fallbackAddress = '') => {
    const address = fallbackAddress || query;
    setSelectedAddress(address);
    onChange({ address, latitude: nextLatitude, longitude: nextLongitude });
    try {
      const resolvedAddress = fallbackAddress || await reverseGeocode(nextLatitude, nextLongitude);
      setQuery(resolvedAddress);
      setSelectedAddress(resolvedAddress);
      onChange({ address: resolvedAddress, latitude: nextLatitude, longitude: nextLongitude });
    } catch {
      setQuery(fallbackAddress || `${nextLatitude.toFixed(6)}, ${nextLongitude.toFixed(6)}`);
    }
    setSuggestions([]);
  };

  const chooseSuggestion = (suggestion) => selectLocation(Number(suggestion.lat), Number(suggestion.lon), suggestion.display_name);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => selectLocation(coords.latitude, coords.longitude).finally(() => setLocating(false)),
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-on-variant" />
        <input
          className="input-field pl-9 pr-10"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedAddress('');
            onChange({ address: event.target.value, latitude: null, longitude: null });
          }}
          placeholder="Search street, building, landmark or area"
          autoComplete="off"
          required
        />
        {searching && <LoaderCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
        {suggestions.length > 0 && <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-outline-variant bg-white shadow-lg">{suggestions.map((suggestion) => <button key={suggestion.place_id} type="button" onClick={() => chooseSuggestion(suggestion)} className="flex w-full items-start gap-2 border-b border-outline-variant/50 px-3 py-2.5 text-left text-xs last:border-0 hover:bg-surface-container-low"><MapPin size={14} className="mt-0.5 shrink-0 text-primary" /><span>{suggestion.display_name}</span></button>)}</div>}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-outline-variant">
        <MapContainer center={selectedPoint || DEFAULT_CENTER} zoom={selectedPoint ? 16 : 13} scrollWheelZoom className="h-52 w-full">
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapViewport point={selectedPoint} />
          <MapClickHandler onSelect={(lat, lon) => selectLocation(lat, lon)} />
          {selectedPoint && <CircleMarker center={selectedPoint} radius={9} pathOptions={{ color: '#ae002a', fillColor: '#ae002a', fillOpacity: 0.85 }} />}
        </MapContainer>
        <button type="button" onClick={useCurrentLocation} disabled={locating} className="absolute bottom-2 right-2 z-[400] inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-white px-2.5 py-2 text-xs font-bold text-primary shadow-md hover:bg-surface-container-low disabled:opacity-60"><LocateFixed size={14} /> {locating ? 'Locating...' : 'Use my location'}</button>
      </div>
      <p className="text-[11px] leading-snug text-surface-on-variant">Choose a suggestion or tap the map to pin the exact drop-off point. You can also type the address manually.</p>
    </div>
  );
}
