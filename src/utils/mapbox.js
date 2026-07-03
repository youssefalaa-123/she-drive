import { MAPBOX_TOKEN } from '../config/maps';

const BASE = 'https://api.mapbox.com';

// ── Session token (groups suggest calls into one billing event) ───────────────
export function newSessionToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Autocomplete — Search Box API v1 (much more accurate than legacy v5) ──────
// Egypt-only, proximity-sorted, English results
export async function getAutocompleteSuggestions(input, userLat, userLng, sessionToken) {
  if (!input || input.length < 2) return [];
  const params = new URLSearchParams({
    q: input,
    access_token: MAPBOX_TOKEN,
    session_token: sessionToken,
    country: 'EG',
    language: 'en',
    limit: '5',
    types: 'place,neighborhood,address,poi,street,locality,district',
  });
  if (userLat != null && userLng != null) {
    params.set('proximity', `${userLng},${userLat}`);
  }
  try {
    const res = await fetch(`${BASE}/search/searchbox/v1/suggest?${params}`);
    const data = await res.json();
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

// ── Retrieve full place details (coordinates) for a selected suggestion ────────
export async function retrievePlace(mapboxId, sessionToken) {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    session_token: sessionToken,
  });
  const res = await fetch(`${BASE}/search/searchbox/v1/retrieve/${mapboxId}?${params}`);
  const data = await res.json();
  const feat = data.features?.[0];
  if (!feat) throw new Error('Place not found');
  return {
    address: feat.properties.full_address || feat.properties.name,
    lat: feat.geometry.coordinates[1],
    lng: feat.geometry.coordinates[0],
  };
}

// ── Actual driving distance via Mapbox Directions API ─────────────────────────
export async function getDrivingRoute(fromLat, fromLng, toLat, toLng) {
  const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
  const url =
    `${BASE}/directions/v5/mapbox/driving/${coords}` +
    `?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.routes?.length) throw new Error('No route found');
  const route = data.routes[0];
  return {
    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
    durationMins: Math.ceil(route.duration / 60),
    geometry: route.geometry,
  };
}
