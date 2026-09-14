import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Search, LoaderCircle } from 'lucide-react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { formatGooglePlace, hasGoogleMapsKey, loadGoogleMaps, reverseGoogleGeocode } from '../../lib/googleMaps';

const DEFAULT_CENTER = { lat: -6.7924, lng: 39.2083 };

function FallbackMap({ selectedPoint, onSelect }) {
  function ClickHandler() {
    useMapEvents({ click: (event) => onSelect(event.latlng.lat, event.latlng.lng) });
    return null;
  }
  function Viewport() {
    const map = useMap();
    useEffect(() => { if (selectedPoint) map.flyTo([selectedPoint.lat, selectedPoint.lng], 16, { duration: 0.4 }); }, [map, selectedPoint]);
    return null;
  }
  const center = selectedPoint ? [selectedPoint.lat, selectedPoint.lng] : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];
  return <MapContainer center={center} zoom={selectedPoint ? 16 : 13} scrollWheelZoom className="h-52 w-full"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Viewport /><ClickHandler />{selectedPoint && <CircleMarker center={center} radius={9} pathOptions={{ color: '#ae002a', fillColor: '#ae002a', fillOpacity: 0.85 }} />}</MapContainer>;
}

export default function DeliveryLocationPicker({ value, latitude, longitude, onChange }) {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const placesRef = useRef(null);
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const selectedPoint = latitude != null && longitude != null ? { lat: Number(latitude), lng: Number(longitude) } : null;

  useEffect(() => {
    if (value !== query && value !== '') setQuery(value);
  }, [value, query]);

  useEffect(() => {
    let disposed = false;
    loadGoogleMaps().then(async ([{ Map }, { PlacesService }]) => {
      if (disposed || !mapElement.current) return;
      const initialCenter = selectedPoint || DEFAULT_CENTER;
      const map = new Map(mapElement.current, {
        center: initialCenter,
        zoom: selectedPoint ? 16 : 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      mapRef.current = map;
      placesRef.current = new PlacesService(map);
      map.addListener('click', ({ latLng }) => selectCoordinates(latLng.lat(), latLng.lng()));
      setMapReady(true);
    }).catch((error) => {
      if (!disposed) setMapError(error.message || 'Google Maps could not load. Using OpenStreetMap instead.');
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !selectedPoint) return;
    mapRef.current.panTo(selectedPoint);
    mapRef.current.setZoom(16);
    updateMarker(selectedPoint);
  }, [latitude, longitude]);

  const updateMarker = (point) => {
    if (!window.google?.maps || !mapRef.current) return;
    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({ map: mapRef.current, position: point, title: 'Drop-off location' });
    } else {
      markerRef.current.setPosition(point);
      markerRef.current.setMap(mapRef.current);
    }
  };

  const selectCoordinates = async (nextLatitude, nextLongitude, place = null) => {
    const resolved = place ? formatGooglePlace(place) : await reverseGoogleGeocode(nextLatitude, nextLongitude).catch(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${nextLatitude}&lon=${nextLongitude}`);
        const result = await response.json();
        return { address: result.display_name || `${nextLatitude.toFixed(6)}, ${nextLongitude.toFixed(6)}` };
      } catch { return { address: `${nextLatitude.toFixed(6)}, ${nextLongitude.toFixed(6)}` }; }
    });
    const address = resolved.address || `${nextLatitude.toFixed(6)}, ${nextLongitude.toFixed(6)}`;
    setQuery(address);
    setSuggestions([]);
    updateMarker({ lat: nextLatitude, lng: nextLongitude });
    mapRef.current?.panTo({ lat: nextLatitude, lng: nextLongitude });
    mapRef.current?.setZoom(16);
    onChange({ address, latitude: nextLatitude, longitude: nextLongitude });
  };

  useEffect(() => {
    if ((!mapReady && !mapError) || query.trim().length < 3) {
      setSuggestions([]);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      if (mapError) {
        fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=en&viewbox=38.8,-6.6,39.5,-7.1&bounded=0&q=${encodeURIComponent(query)}`)
          .then((response) => response.ok ? response.json() : [])
          .then((results) => setSuggestions(results.map((result) => ({ place_id: result.place_id, description: result.display_name, fallback: result, lat: Number(result.lat), lon: Number(result.lon) }))))
          .catch(() => setSuggestions([])).finally(() => setSearching(false));
        return;
      }
      const service = new window.google.maps.places.AutocompleteService();
      service.getPlacePredictions({ input: query, componentRestrictions: { country: 'tz' }, locationBias: { center: DEFAULT_CENTER, radius: 50000 } }, (results, status) => { setSuggestions(status === window.google.maps.places.PlacesServiceStatus.OK ? results || [] : []); setSearching(false); });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, mapReady]);

  const chooseSuggestion = (suggestion) => {
    if (suggestion.fallback) return selectCoordinates(suggestion.lat, suggestion.lon);
    placesRef.current?.getDetails({ placeId: suggestion.place_id, fields: ['name', 'formatted_address', 'address_components', 'geometry'] }, (place, status) => {
      if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) return;
      selectCoordinates(place.geometry.location.lat(), place.geometry.location.lng(), place);
    });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => selectCoordinates(coords.latitude, coords.longitude).finally(() => setLocating(false)),
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
            setSuggestions([]);
            onChange({ address: event.target.value, latitude: null, longitude: null });
          }}
          placeholder="Search street, building, landmark or area"
          autoComplete="off"
          required
        />
        {searching && <LoaderCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
        {suggestions.length > 0 && <div className="absolute left-0 right-0 top-full z-[1000] mt-1 overflow-hidden rounded-xl border border-outline-variant bg-white shadow-lg">{suggestions.map((suggestion) => <button key={suggestion.place_id} type="button" onClick={() => chooseSuggestion(suggestion)} className="flex w-full items-start gap-2 border-b border-outline-variant/50 px-3 py-2.5 text-left last:border-0 hover:bg-surface-container-low"><MapPin size={14} className="mt-0.5 shrink-0 text-primary" /><span className="min-w-0"><strong className="block truncate text-xs font-bold text-surface-on">{suggestion.structured_formatting?.main_text || suggestion.description}</strong><span className="block truncate text-[11px] text-surface-on-variant">{suggestion.structured_formatting?.secondary_text || ''}</span></span></button>)}</div>}
        {!searching && query.trim().length >= 3 && (mapReady || mapError) && suggestions.length === 0 && <div className="absolute left-0 right-0 top-full z-[1000] mt-1 rounded-xl border border-outline-variant bg-white px-3 py-3 text-xs text-surface-on-variant shadow-lg">No matching locations. Try a nearby street, landmark, or area.</div>}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-outline-variant">
        {mapReady ? <div ref={mapElement} className="h-52 w-full" /> : <FallbackMap selectedPoint={selectedPoint} onSelect={selectCoordinates} />}
        {!mapReady && !mapError && <div className="absolute inset-0 flex items-center justify-center bg-surface-container-low/60 text-xs text-surface-on-variant">Loading Google Maps...</div>}
        {mapError && <p className="absolute left-2 top-2 z-[500] rounded bg-white/90 px-2 py-1 text-[10px] text-surface-on-variant shadow">Google Maps unavailable, using OpenStreetMap</p>}
        <button type="button" onClick={useCurrentLocation} disabled={locating} className="absolute bottom-2 right-2 z-[400] inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-white px-2.5 py-2 text-xs font-bold text-primary shadow-md hover:bg-surface-container-low disabled:opacity-60"><LocateFixed size={14} /> {locating ? 'Locating...' : 'Use my location'}</button>
      </div>
      {!hasGoogleMapsKey() && <p className="text-xs text-error">Google Maps is not configured. Add the local API key to the environment.</p>}
      <p className="text-[11px] leading-snug text-surface-on-variant">Choose a Google Maps suggestion or tap the map to pin the exact drop-off point.</p>
    </div>
  );
}
