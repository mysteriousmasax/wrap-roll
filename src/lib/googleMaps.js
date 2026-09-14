import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
let mapsPromise;

export function hasGoogleMapsKey() {
  return Boolean(apiKey);
}

export function loadGoogleMaps() {
  if (!apiKey) return Promise.reject(new Error('Google Maps API key is not configured.'));
  if (!mapsPromise) {
    setOptions({ key: apiKey, v: 'weekly' });
    mapsPromise = Promise.all([importLibrary('maps'), importLibrary('places'), importLibrary('geocoding'), importLibrary('marker')]);
  }
  return mapsPromise;
}

export function formatGooglePlace(place, fallback = '') {
  const components = place.address_components || [];
  const get = (type) => components.find((component) => component.types?.includes(type))?.long_name || '';
  const primary = place.name || get('premise') || get('street_number') && `${get('street_number')} ${get('route')}` || get('route') || get('sublocality') || get('locality') || fallback || 'Pinned location';
  const detail = [
    get('route') && get('route') !== primary ? get('route') : '',
    get('sublocality_level_2'),
    get('sublocality_level_1'),
    get('sublocality'),
    get('locality'),
    get('administrative_area_level_1'),
  ].filter(Boolean).filter((part, index, parts) => parts.indexOf(part) === index && part !== primary);
  return {
    address: [primary, ...detail].join(', ') || place.formatted_address || fallback,
    label: primary,
    detail: detail.join(', '),
    latitude: place.geometry?.location?.lat?.() ?? null,
    longitude: place.geometry?.location?.lng?.() ?? null,
  };
}

export async function reverseGoogleGeocode(latitude, longitude) {
  await loadGoogleMaps();
  const { Geocoder } = await importLibrary('geocoding');
  const result = await new Geocoder().geocode({ location: { lat: latitude, lng: longitude } });
  const place = result.results?.[0];
  if (!place) throw new Error('Location lookup failed');
  return formatGooglePlace(place, `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
}

export function getGoogleMapsUrl(latitude, longitude) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}
