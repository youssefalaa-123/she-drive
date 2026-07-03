import { GOOGLE_MAPS_API_KEY } from '../config/maps';

// ── Script loader (idempotent — loads once, reuses promise) ──────────────────
let _loadPromise = null;

export function loadGoogleMaps() {
  if (window.google?.maps?.places) return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.places) { resolve(); return; }
    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js` +
      `?key=${GOOGLE_MAPS_API_KEY}` +
      `&libraries=places` +
      `&language=en` +
      `&region=EG`;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Google Maps failed to load. Check your API key.'));
    document.head.appendChild(script);
  });
  return _loadPromise;
}

// ── Autocomplete — Egypt only, biased by user GPS ────────────────────────────
export async function getAutocompleteSuggestions(input, userLat, userLng) {
  if (!input || input.length < 2) return [];
  await loadGoogleMaps();
  return new Promise((resolve) => {
    const svc = new window.google.maps.places.AutocompleteService();
    const opts = {
      input,
      componentRestrictions: { country: 'eg' },
      language: 'en',
    };
    if (userLat != null && userLng != null) {
      opts.location = new window.google.maps.LatLng(userLat, userLng);
      opts.radius = 80000;
    }
    svc.getPlacePredictions(opts, (predictions, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
        resolve(predictions.slice(0, 5));
      } else {
        resolve([]);
      }
    });
  });
}

// ── Place details — coordinates from a place_id ──────────────────────────────
export async function getPlaceDetails(placeId) {
  await loadGoogleMaps();
  return new Promise((resolve, reject) => {
    const div = document.createElement('div');
    const svc = new window.google.maps.places.PlacesService(div);
    svc.getDetails(
      { placeId, fields: ['geometry', 'formatted_address', 'name'] },
      (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK) {
          resolve({
            address: place.formatted_address || place.name,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
        } else {
          reject(new Error(`Place details failed: ${status}`));
        }
      }
    );
  });
}

// ── Actual driving distance via Directions API ────────────────────────────────
export async function getDrivingRoute(fromLat, fromLng, toLat, toLng) {
  await loadGoogleMaps();
  return new Promise((resolve, reject) => {
    const svc = new window.google.maps.DirectionsService();
    svc.route(
      {
        origin: { lat: fromLat, lng: fromLng },
        destination: { lat: toLat, lng: toLng },
        travelMode: window.google.maps.TravelMode.DRIVING,
        region: 'EG',
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          const leg = result.routes[0].legs[0];
          resolve({
            distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
            durationMins: Math.ceil(leg.duration.value / 60),
          });
        } else {
          reject(new Error(`Directions failed: ${status}`));
        }
      }
    );
  });
}
