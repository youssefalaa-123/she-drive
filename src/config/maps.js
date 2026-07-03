// ─── Map Configuration — 100% Free, No API Keys ──────────────────────────────
//
// Stack:
//   Map tiles  → Carto Voyager (OpenStreetMap data, English labels, free)
//   Routing    → OSRM public demo server (actual driving routes, free)
//   Search     → Photon by Komoot (OSM + Elasticsearch autocomplete, free)
//
// ─────────────────────────────────────────────────────────────────────────────

export const MAP_DEFAULTS = {
  center: { lat: 30.0444, lng: 31.2357 }, // Cairo
  zoom: 12,
};

// Carto Voyager — OpenStreetMap data rendered with English labels
export const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

export const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '© <a href="https://carto.com/attributions">CARTO</a>';

// Egypt bounding box for search restriction [minLon, minLat, maxLon, maxLat]
export const EGYPT_BBOX = [24.7, 22.0, 37.0, 31.7];
