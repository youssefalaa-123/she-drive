// Routing & Search utilities — 100% free, no API keys
// Routing: OSRM public server  |  Search: curated POIs + Photon (Cairo-only)

import { searchPOIs } from '../data/cairoPOIs';

// Greater Cairo bounding box: minLon, minLat, maxLon, maxLat
const CAIRO_BBOX = '30.7,29.7,32.2,30.6';

// ── Autocomplete: curated POIs first, then Photon for addresses ───────────────
export async function getAutocompleteSuggestions(query, userLat, userLng) {
  if (!query || query.trim().length < 2) return [];

  // 1. Search curated famous places (always accurate)
  const curated = searchPOIs(query).map((p) => ({
    isCurated: true,
    name: p.name,
    secondary: p.address,
    lat: p.lat,
    lng: p.lng,
  }));

  // 2. Photon geocoding — Cairo-only bbox
  let photon = [];
  try {
    const params = new URLSearchParams({
      q: query,
      limit: '5',
      lang: 'en',
      bbox: CAIRO_BBOX,
    });
    if (userLat != null && userLng != null) {
      params.set('lat', userLat);
      params.set('lon', userLng);
    }
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      headers: { 'User-Agent': 'SheDriveApp/1.0' },
    });
    const data = await res.json();
    photon = (data.features ?? [])
      .filter((f) => {
        // Strict Cairo filter
        const c = f.properties.country;
        const state = (f.properties.state || '').toLowerCase();
        return c === 'Egypt' && (
          state.includes('cairo') || state.includes('giza') ||
          state.includes('قاهرة') || state.includes('جيزة')
        );
      })
      .map((f) => {
        const p = f.properties;
        const nameParts = [p.name, p.street, p.suburb || p.district, p.city]
          .filter(Boolean);
        return {
          isCurated: false,
          name: p.name || p.street || 'Location',
          secondary: nameParts.slice(1, 3).join(', '),
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
        };
      });
  } catch {
    // Photon unavailable — curated results are still shown
  }

  // Merge: curated first, then Photon (skip duplicates by proximity)
  const merged = [...curated];
  for (const item of photon) {
    const isDupe = merged.some(
      (m) => Math.abs(m.lat - item.lat) < 0.001 && Math.abs(m.lng - item.lng) < 0.001
    );
    if (!isDupe) merged.push(item);
  }
  return merged.slice(0, 6);
}

// ── Driving route via OSRM public server ─────────────────────────────────────
export async function getDrivingRoute(fromLat, fromLng, toLat, toLng) {
  const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
  const url =
    `https://router.project-osrm.org/route/v1/driving/${coords}` +
    `?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SheDriveApp/1.0' } });
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found');
  const route = data.routes[0];
  return {
    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
    durationMins: Math.ceil(route.duration / 60),
    geometry: route.geometry,
  };
}
