// Routing & Search utilities — 100% free, no API keys
// Routing: OSRM public server  |  Search: curated POIs + Photon (Cairo-only)

import { searchPOIs } from '../data/cairoPOIs';

// All-Egypt bounding box: minLon, minLat, maxLon, maxLat
const EGYPT_BBOX = '24.7,22.0,37.1,31.7';

// ── Autocomplete: curated POIs first, then Photon for Egypt-wide search ───────
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

  // 2. Photon geocoding — all Egypt (Sharm, Dahab, Sahel, etc.)
  let photon = [];
  try {
    const params = new URLSearchParams({
      q: query,
      limit: '7',
      lang: 'en',
      bbox: EGYPT_BBOX,
    });
    // Bias toward user location if available (doesn't restrict distant results)
    if (userLat != null && userLng != null) {
      params.set('lat', userLat);
      params.set('lon', userLng);
    }
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      headers: { 'User-Agent': 'SheDriveApp/1.0' },
    });
    const data = await res.json();
    photon = (data.features ?? [])
      .filter((f) => f.properties.country === 'Egypt')
      .map((f) => {
        const p = f.properties;
        const nameParts = [p.name, p.street, p.suburb || p.district, p.city, p.state]
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

  // Merge: curated first, then Photon (skip duplicates by proximity OR name similarity)
  const significantWords = (s) =>
    s.toLowerCase().replace(/[^a-z0-9؀-ۿ\s]/g, ' ')
      .split(/\s+/).filter((w) => w.length > 2);

  const nameSimilar = (a, b) => {
    const wa = new Set(significantWords(a));
    const overlap = significantWords(b).filter((w) => wa.has(w)).length;
    return overlap >= 2;
  };

  const merged = [...curated];
  for (const item of photon) {
    const isDupe = merged.some(
      (m) =>
        (Math.abs(m.lat - item.lat) < 0.001 && Math.abs(m.lng - item.lng) < 0.001) ||
        nameSimilar(m.name, item.name)
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
