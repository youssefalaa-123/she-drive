import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

// Module-level flag so getInitialURL() is consumed only once per app session,
// even if the hook re-mounts (e.g. tab navigator remounts the screen).
let initialURLConsumed = false;

// Follow a short-URL redirect to get the final destination URL.
// Needed for maps.app.goo.gl links, which carry no coordinates directly.
async function resolveRedirect(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
    return res.url || url;
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * parseLocationFromURL — synchronous, pure.
 * Returns { lat, lng } for any recognisable format, or null.
 *
 * Handled formats:
 *   geo:30.0444,31.2357              (WhatsApp, other apps)
 *   geo:30.0444,31.2357?q=Label
 *   https://maps.google.com/maps?q=30.0444,31.2357
 *   https://www.google.com/maps/@30.0444,31.2357,15z
 *   shedriveapp://location?lat=30.0444&lng=31.2357
 */
export function parseLocationFromURL(url) {
  if (!url) return null;
  try {
    // geo:lat,lng  or  geo:lat,lng?q=...
    const geoMatch = url.match(/^geo:(-?\d+\.?\d*),(-?\d+\.?\d*)/i);
    if (geoMatch) {
      const lat = parseFloat(geoMatch[1]);
      const lng = parseFloat(geoMatch[2]);
      if (isFinite(lat) && isFinite(lng) && lat !== 0 && lng !== 0) return { lat, lng };
    }

    // ?q=lat,lng  or  ?q=lat,lng(Label)  — Google Maps share links
    const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/i);
    if (qMatch) {
      const lat = parseFloat(qMatch[1]);
      const lng = parseFloat(qMatch[2]);
      if (isFinite(lat) && isFinite(lng)) return { lat, lng };
    }

    // /@lat,lng,zoom  — Google Maps permalink  (/maps/@30.044,31.235,15z)
    const atMatch = url.match(/\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/i);
    if (atMatch) {
      const lat = parseFloat(atMatch[1]);
      const lng = parseFloat(atMatch[2]);
      if (isFinite(lat) && isFinite(lng)) return { lat, lng };
    }

    // shedriveapp://location?lat=...&lng=...  — custom scheme
    const latMatch = url.match(/[?&]lat=(-?\d+\.?\d*)/i);
    const lngMatch = url.match(/[?&]lng=(-?\d+\.?\d*)/i);
    if (latMatch && lngMatch) {
      const lat = parseFloat(latMatch[1]);
      const lng = parseFloat(lngMatch[1]);
      if (isFinite(lat) && isFinite(lng)) return { lat, lng };
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveAndParse(url) {
  if (!url) return null;
  const direct = parseLocationFromURL(url);
  if (direct) return direct;
  // Short link — follow the redirect chain then re-parse the final URL
  if (url.includes('goo.gl') || url.includes('maps.app')) {
    const resolved = await resolveRedirect(url);
    if (resolved !== url) return parseLocationFromURL(resolved);
  }
  return null;
}

/**
 * useDeepLink — listens for incoming geo / map URLs and returns the parsed location.
 *
 * Usage:
 *   const { location, clearLocation } = useDeepLink();
 *   // location: { lat, lng } | null
 */
export function useDeepLink() {
  const [location, setLocation] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // Cold-start: app launched by tapping a link (fires once per session)
    if (!initialURLConsumed) {
      initialURLConsumed = true;
      Linking.getInitialURL().then(async (url) => {
        if (cancelled || !url) return;
        console.log('[DeepLink] getInitialURL:', url);
        const loc = await resolveAndParse(url);
        if (loc && !cancelled) {
          console.log('[DeepLink] parsed location:', loc);
          setLocation(loc);
        }
      }).catch((err) => console.warn('[DeepLink] getInitialURL error:', err));
    }

    // Warm-start: link arrives while the app is already foregrounded
    const sub = Linking.addEventListener('url', async ({ url }) => {
      if (cancelled || !url) return;
      console.log('[DeepLink] addEventListener url:', url);
      const loc = await resolveAndParse(url);
      if (loc && !cancelled) {
        console.log('[DeepLink] parsed location:', loc);
        setLocation(loc);
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const clearLocation = () => setLocation(null);
  return { location, clearLocation };
}
