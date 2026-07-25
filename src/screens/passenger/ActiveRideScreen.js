import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator, Alert, Modal, ScrollView, Image, Linking, Platform,
  Animated,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { toRide } from '../../lib/transforms';
import { splitFare, GRACE_PERIOD_MINS, WAIT_FEE_PER_MIN, PENALTY_CANCEL_FEE, FREE_CANCEL_SECS, ETA_FAULT_BUFFER } from '../../utils/pricing';
import { useTheme } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useDriverReviews } from '../../hooks/useDriverReviews';
import LeafletMap from '../../components/LeafletMap';
import AnimatedPressable from '../../components/AnimatedPressable';

const STATUS_STEPS = ['accepted', 'arrived', 'in_progress', 'completed'];

// Straight-line distance in km between two GPS points (Haversine formula)
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatWalkDist(km) {
  if (km < 0.04) return 'You are at the pickup point ✓';
  if (km < 1)    return `${Math.round(km * 1000)} m to pickup`;
  return `${km.toFixed(1)} km to pickup`;
}

// Converts any timestamp shape from Supabase (ISO string), Firebase (toDate/toMillis),
// a JS Date, or a raw epoch number to epoch milliseconds. Returns null for unrecognised input.
function tsToMs(ts) {
  if (!ts) return null;
  const d = ts?.toDate?.();
  if (d instanceof Date) return d.getTime();
  const m = ts?.toMillis?.();
  if (typeof m === 'number') return m;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    return isNaN(ms) ? null : ms;
  }
  return null;
}

export default function ActiveRideScreen({ navigation, route }) {
  const { rideId } = route.params;
  const { colors, shadow, t } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [ride, setRide] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [gpsStatus, setGpsStatus]   = useState('acquiring'); // 'acquiring'|'denied'|'timeout'|'active'|'fallback'
  const [walkInfo, setWalkInfo]     = useState(null);
  const [showDriverProfile, setShowDriverProfile] = useState(false);
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);
  const [sosVisible, setSosVisible] = useState(false);
  const [noticeModal, setNoticeModal] = useState({ visible: false, title: '', message: '' });
  const [waitingFeeBanner, setWaitingFeeBanner] = useState(false);
  const [copiedToast, setCopiedToast]         = useState(false);
  const [graceSecsLeft, setGraceSecsLeft]     = useState(null);
  const [waitMins, setWaitMins]               = useState(0);
  const [waitFeeAmt, setWaitFeeAmt]           = useState(0);
  const [freeCancelWindow, setFreeCancelWindow] = useState(true);
  const [faultWaiver, setFaultWaiver]         = useState(false);
  const [etaBannerMsg, setEtaBannerMsg]       = useState(null);
  const mapRef = useRef(null);
  const lastDriverPos = useRef(null);
  const acceptedShownRef = useRef(false);
  const navigatedToSummaryRef = useRef(false);
  const noShowHandledRef = useRef(false);
  const sosPulse = useRef(new Animated.Value(1)).current;
  const watchIdRef = useRef(null);
  const lastWalkFetchRef = useRef(null);
  const firstFitRef = useRef(false);
  const pickupRef              = useRef(null);  // latest pickup coords — kept in sync for the GPS fallback timer
  const gpsFallbackPendingRef  = useRef(false); // true when GPS failed before ride data was available
  // Locked once — the ms timestamp by which the driver promised to arrive (acceptedAt + initial OSRM ETA).
  // Used by Rule B: if now > promisedArrivalRef + ETA_FAULT_BUFFER min, the fee is waived.
  const promisedArrivalRef     = useRef(null);
  // Tracks the ride status at the last route draw so a status transition (e.g.
  // arrived → in_progress) always forces a reroute even if driver hasn't moved.
  const lastRouteStatusRef     = useRef(null);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulse, { toValue: 1.14, duration: 900, useNativeDriver: true }),
        Animated.timing(sosPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // GPS watch — three-layer fallback:
  //   Layer 1: real watchPosition fix (best)
  //   Layer 2: hard 10 s timer fires applyFallback if no real fix yet
  //   Layer 3: every subsequent watchPosition timeout also fires applyFallback
  // applyFallback never blocks on pickup coords — it uses the Cairo city centre if
  // pickupRef hasn't been populated yet, so currentPos is always set eventually.
  useEffect(() => {
    const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    let hasRealFix = false;
    let fallbackTimerId = null;

    const applyFallback = () => {
      if (hasRealFix) return;

      const pickup = pickupRef.current;
      if (!pickup) {
        // Ride data hasn't arrived yet — mark pending and show a wait label.
        // The pickup-sync effect will call applyFallback again once the ride loads.
        gpsFallbackPendingRef.current = true;
        setGpsStatus('waiting_for_ride');
        return;
      }

      const mockLat = pickup.lat - 0.002;
      const mockLng = pickup.lng - 0.002;
      console.warn('[GPS] applyFallback executed. Mock coords set:', { mockLat, mockLng });
      gpsFallbackPendingRef.current = false;
      setCurrentPos({ lat: mockLat, lng: mockLng, heading: 0 });
      setGpsStatus('fallback');
      mapRef.current?.setMarker('me', mockLat, mockLng, 'me', 'You (approx)');
      mapRef.current?.setCurrentPos(mockLat, mockLng);
    };

    const onSuccess = (pos) => {
      if (fallbackTimerId) { clearTimeout(fallbackTimerId); fallbackTimerId = null; }
      hasRealFix = true;
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      console.log('[GPS] position fix received:', loc);
      setCurrentPos(loc);
      setGpsStatus('active');
    };

    // Error codes: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
    const onError = (err) => {
      console.error('[GPS] error — code', err.code, ':', err.message,
        err.code === 1 ? '(PERMISSION_DENIED)' :
        err.code === 2 ? '(POSITION_UNAVAILABLE)' :
        err.code === 3 ? '(TIMEOUT)' : '');
      if (err.code === 1) {
        // User denied — cancel the hard timer, update status label, apply fallback coords.
        if (fallbackTimerId) { clearTimeout(fallbackTimerId); fallbackTimerId = null; }
        setGpsStatus('denied');
        applyFallback();
      } else if (err.code === 3) {
        // Timeout — update the label then apply fallback immediately.
        // HTTP localhost always blocks geolocation so we never wait for the hard timer here.
        setGpsStatus('timeout');
        applyFallback();
      }
      // code 2 (POSITION_UNAVAILABLE): transient hardware error — watchPosition retries automatically.
    };

    if (typeof navigator === 'undefined' || !navigator?.geolocation) {
      console.warn('[GPS] navigator.geolocation unavailable on this platform');
      applyFallback();
      return;
    }

    // Hard deadline as a safety net — fires in parallel with the watchPosition timeout.
    // Handles the edge case where the ride loads after both GPS calls error out and the
    // pickupRef was null on those first error callbacks (Cairo default would have been used).
    fallbackTimerId = setTimeout(() => {
      if (!hasRealFix) applyFallback();
    }, 10000);

    // One-shot: surfaces the permission dialog immediately and provides a fast cached fix.
    // watchPosition: streams continuous real-time updates as the passenger walks.
    navigator.geolocation.getCurrentPosition(onSuccess, onError, opts);
    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, opts);

    return () => {
      if (fallbackTimerId) { clearTimeout(fallbackTimerId); fallbackTimerId = null; }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // Keep pickupRef in sync. If the GPS fallback fired before ride data was available,
  // gpsFallbackPendingRef will be true — apply the fallback now that we have real coords.
  useEffect(() => {
    if (!ride?.fromLat || !ride?.fromLng) return;
    pickupRef.current = { lat: ride.fromLat, lng: ride.fromLng };

    if (gpsFallbackPendingRef.current) {
      const mockLat = ride.fromLat - 0.002;
      const mockLng = ride.fromLng - 0.002;
      console.warn('[GPS] applyFallback executed (deferred — ride data now available). Mock coords set:', { mockLat, mockLng });
      gpsFallbackPendingRef.current = false;
      setCurrentPos({ lat: mockLat, lng: mockLng, heading: 0 });
      setGpsStatus('fallback');
      mapRef.current?.setMarker('me', mockLat, mockLng, 'me', 'You (approx)');
      mapRef.current?.setCurrentPos(mockLat, mockLng);
    }
  }, [ride?.fromLat, ride?.fromLng]);

  // Blue dot + walking route: passenger → pickup while driver is en route or has arrived.
  // Reroutes every 50 m of deviation; updates straight-line distance on every GPS tick.
  const REROUTE_THRESHOLD_KM = 0.05;
  useEffect(() => {
    if (!currentPos || !ride?.fromLat || !ride?.fromLng) return;

    // Normalise status casing defensively — DB stores lowercase but guard anyway
    const status = (ride.status ?? '').toLowerCase();
    const walkingPhase = status === 'accepted' || status === 'arrived';

    console.log('[walk] GPS fix — status:', ride.status, '| walkingPhase:', walkingPhase, '| pos:', currentPos);

    mapRef.current?.setMarker('me', currentPos.lat, currentPos.lng, 'me', 'You');
    mapRef.current?.setCurrentPos(currentPos.lat, currentPos.lng);

    // First fix: fit map to show passenger + pickup; driver effect handles later fits
    if (!firstFitRef.current) {
      firstFitRef.current = true;
      mapRef.current?.fit();
    }

    if (!walkingPhase) {
      setWalkInfo(null);
      mapRef.current?.clearWalkRoute?.();
      return;
    }

    // Update straight-line distance immediately for instant UI feedback
    const straightKm = haversineKm(currentPos.lat, currentPos.lng, ride.fromLat, ride.fromLng);
    setWalkInfo(prev => prev
      ? { ...prev, distanceKm: straightKm }
      : { distanceKm: straightKm, durationMins: null });

    // Re-fetch walking route only when passenger has moved > 50 m from last fetch origin
    const last = lastWalkFetchRef.current;
    const needsRoute = !last || haversineKm(last.lat, last.lng, currentPos.lat, currentPos.lng) >= REROUTE_THRESHOLD_KM;
    if (needsRoute) {
      lastWalkFetchRef.current = currentPos;
      console.log('[walk] fetching route — from:', currentPos, 'to pickup:', { lat: ride.fromLat, lng: ride.fromLng });
      mapRef.current?.showWalkRoute?.(
        currentPos.lat, currentPos.lng,
        ride.fromLat, ride.fromLng,
        (info) => {
          console.log('[walk] route resolved:', info);
          setWalkInfo(info);
        }
      );
    }
  }, [currentPos, ride?.fromLat, ride?.fromLng, ride?.status]);

  const { data: driverReviews } = useDriverReviews(ride?.driverId, 3);

  const handleRideUpdate = useCallback((raw) => {
    const data = toRide(raw);
    if (data.driverLat != null && data.driverLng != null) {
      console.log('[Passenger] Received driver location from DB:', { driverLat: data.driverLat, driverLng: data.driverLng, status: data.status });
    } else {
      console.log('[Passenger] Ride update received — driver coords still null, status:', data.status);
    }
    // rides.driver_rating / driver_total_trips are always null — those fields come from a
    // separate profiles fetch and must survive every realtime override.
    setRide(prev => ({
      ...data,
      driverPhone:       data.driverPhone       ?? prev?.driverPhone,
      driverPhotoURL:    data.driverPhotoURL    ?? prev?.driverPhotoURL,
      driverRating:      data.driverRating      ?? prev?.driverRating,
      driverRatingCount: data.driverRatingCount ?? prev?.driverRatingCount,
      driverTotalTrips:  data.driverTotalTrips  ?? prev?.driverTotalTrips,
      driverCar:         data.driverCar         ?? prev?.driverCar,
      driverPlate:       data.driverPlate       ?? prev?.driverPlate,
    }));

    if (data.status === 'accepted' && !acceptedShownRef.current) {
      acceptedShownRef.current = true;
      setShowDriverProfile(true);
    }

    if (data.status === 'completed' && !navigatedToSummaryRef.current) {
      navigatedToSummaryRef.current = true;
      navigation.replace('TripSummary', { rideId });
    }

    if (data.status === 'cancelled') {
      // Passenger deducts no-show fee from their own wallet
      if (data.noShow && !data.passengerSettled && !noShowHandledRef.current && user?.uid) {
        const fee = data.noShowFee || data.cancellationFee;
        if (fee > 0) {
          noShowHandledRef.current = true;
          supabase.rpc('withdraw_own_wallet', {
            p_delta:   -fee,
            p_type:    'no_show_debit',
            p_desc:    'No-show fee — driver waited over 5 minutes',
            p_ride_id: rideId,
          }).then(() => {
            supabase.from('rides').update({ passenger_settled: true }).eq('id', rideId).catch(() => {});
          }).catch(() => {});
        }
      }
      setNoticeModal({ visible: true, title: t('rideCancelled'), message: t('driverCancelledTrip') });
    }

    if (data.status === 'searching') {
      setNoticeModal({ visible: true, title: t('rideCancelled'), message: t('driverSearchingAgain') });
    }
  }, [rideId, user, navigation, t]);

  useEffect(() => {
    // Initial fetch — always get the latest row including any driver coords already in the DB
    supabase.from('rides').select('*').eq('id', rideId).single()
      .then(({ data, error }) => {
        if (error) console.error('[Passenger] Initial ride fetch error:', error.message);
        if (data) handleRideUpdate(data);
      });

    const ch = supabase.channel('active-ride-' + rideId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` }, (payload) => {
        console.log('[Passenger] Realtime UPDATE received — driver_lat:', payload.new.driver_lat, 'driver_lng:', payload.new.driver_lng, 'status:', payload.new.status);
        handleRideUpdate(payload.new);
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Passenger] Realtime channel CONNECTED for ride:', rideId);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Passenger] Realtime channel ERROR:', err?.message ?? err);
        } else if (status === 'TIMED_OUT') {
          console.error('[Passenger] Realtime channel TIMED OUT — will rely on polling fallback');
        } else {
          console.log('[Passenger] Realtime channel status:', status);
        }
      });

    return () => { supabase.removeChannel(ch); };
  }, [rideId, handleRideUpdate]);

  // Polling fallback — re-fetches the ride every 10 s while driver coords are still missing.
  // Ensures the passenger screen recovers even if a realtime event is dropped.
  useEffect(() => {
    if (ride?.driverLat != null && ride?.driverLng != null) return; // coords already arrived
    if (ride?.status !== 'accepted') return;

    const iv = setInterval(() => {
      supabase.from('rides').select('*').eq('id', rideId).single()
        .then(({ data }) => {
          if (data?.driver_lat != null && data?.driver_lng != null) {
            console.log('[Passenger] Polling fallback — got driver coords:', data.driver_lat, data.driver_lng);
            handleRideUpdate(data);
          }
        });
    }, 10000);

    return () => clearInterval(iv);
  }, [rideId, ride?.driverLat, ride?.driverLng, ride?.status, handleRideUpdate]);

  // Fetch driver contact/vehicle info — not stored on the rides row; requires a profiles JOIN.
  // Runs once when driver_id is first assigned; merges into ride state so driverPhone etc. resolve.
  useEffect(() => {
    if (!ride?.driverId) return;
    supabase
      .from('public_driver_profiles')
      .select('phone, photo_url, rating, rating_count, total_trips, car_model, car_color, plate_number')
      .eq('id', ride.driverId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        console.log('[Passenger] Fetched Driver Profile:', data);
        setRide(prev => prev ? {
          ...prev,
          driverPhone:       data.phone,
          driverPhotoURL:    data.photo_url,
          driverRating:      data.rating,
          driverRatingCount: data.rating_count,
          driverTotalTrips:  data.total_trips,
          driverCar:         [data.car_model, data.car_color].filter(Boolean).join(' ') || prev.driverCar,
          driverPlate:       data.plate_number,
        } : null);
      });
  }, [ride?.driverId]);

  // Grace period countdown + wait fee
  useEffect(() => {
    if (!ride?.arrivedAt || ride.status !== 'arrived') {
      setGraceSecsLeft(null); setWaitMins(0); setWaitFeeAmt(0); return;
    }
    const arrivedMs = tsToMs(ride.arrivedAt) ?? Date.now();
    const GRACE_SECS = GRACE_PERIOD_MINS * 60;
    const tick = () => {
      const elapsed = (Date.now() - arrivedMs) / 1000;
      if (elapsed < GRACE_SECS) {
        setGraceSecsLeft(Math.ceil(GRACE_SECS - elapsed)); setWaitMins(0); setWaitFeeAmt(0);
      } else {
        setGraceSecsLeft(0);
        const m = Math.floor((elapsed - GRACE_SECS) / 60);
        setWaitMins(m);
        const newFee = Math.round(m * WAIT_FEE_PER_MIN * 10) / 10;
        setWaitFeeAmt(newFee);
        if (m >= 1) setWaitingFeeBanner(true);
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [ride?.arrivedAt, ride?.status]);

  // Free cancellation window
  useEffect(() => {
    if (!ride?.acceptedAt) { setFreeCancelWindow(true); return; }
    const acceptedMs = tsToMs(ride.acceptedAt) ?? Date.now();
    const tick = () => setFreeCancelWindow((Date.now() - acceptedMs) / 1000 < FREE_CANCEL_SECS);
    tick();
    const iv = setInterval(tick, 5000);
    return () => clearInterval(iv);
  }, [ride?.acceptedAt]);

  // Rule B — driver-late fee waiver.
  // Fault deadline = promisedArrivalTime (OSRM-locked) + ETA_FAULT_BUFFER minutes.
  // Falls back to ride.eta from DB if the OSRM result hasn't fired yet.
  useEffect(() => {
    if (!ride?.acceptedAt || (ride.status === 'arrived' || ride.status === 'in_progress')) {
      setFaultWaiver(false); return;
    }
    const acceptedMs = tsToMs(ride.acceptedAt) ?? Date.now();
    const check = () => {
      // promisedArrivalRef is set by the first OSRM callback; fall back to ride.eta from DB.
      const baseMs = promisedArrivalRef.current
        ?? (ride.eta ? acceptedMs + ride.eta * 60 * 1000 : null);
      if (!baseMs) { setFaultWaiver(false); return; }
      // Rule B: now > promisedArrival + ETA_FAULT_BUFFER → fee waived
      setFaultWaiver(Date.now() > baseMs + ETA_FAULT_BUFFER * 60 * 1000);
    };
    check();
    const iv = setInterval(check, 15000); // tighter poll so the waiver kicks in promptly
    return () => clearInterval(iv);
  }, [ride?.acceptedAt, ride?.eta, ride?.status]);

  // Bulletproof ETA fetch — direct OSRM call, independent of the LeafletMap postMessage bridge.
  // Re-runs on every driver coord update. AbortController enforces a strict 5-second deadline
  // so a slow/dropped network never leaves the UI permanently stuck.
  useEffect(() => {
    if (ride?.status !== 'accepted') { setEtaBannerMsg(null); return; }

    // Guard: driver GPS hasn't synced to Supabase yet after accepting.
    if (!ride?.driverLat || !ride?.driverLng) {
      setEtaBannerMsg('Waiting for driver location...');
      return;
    }
    if (!ride?.fromLat || !ride?.fromLng) return;

    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), 5000);
    setEtaBannerMsg('Calculating arrival time...');

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${ride.driverLng},${ride.driverLat};${ride.fromLng},${ride.fromLat}` +
      `?overview=false&steps=false`;

    fetch(url, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const seg = data.routes?.[0];
        if (!seg) throw new Error('OSRM returned no routes');
        const durationMins = Math.ceil(seg.duration / 60);
        const distanceKm   = (seg.distance / 1000).toFixed(1);
        setRouteInfo({ durationMins, distanceKm });
        // Lock the promised arrival time once for Rule B (driver-late fee waiver).
        if (!promisedArrivalRef.current && ride.acceptedAt) {
          const acceptedMs = tsToMs(ride.acceptedAt) ?? Date.now();
          promisedArrivalRef.current = acceptedMs + durationMins * 60 * 1000;
          console.log('[ETA] Promised arrival locked:', new Date(promisedArrivalRef.current).toLocaleTimeString(), '(OSRM:', durationMins, 'min)');
        }
        setEtaBannerMsg(`Driver arriving in ~${durationMins} min · ${distanceKm} km away`);
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          console.error('[ETA] OSRM timed out after 5 s — driver coords:', ride.driverLat, ride.driverLng);
        } else {
          console.error('[ETA] OSRM fetch error:', err);
        }
        // On any failure the next driver coord update (Supabase realtime) will retry automatically.
        setEtaBannerMsg('ETA unavailable');
      })
      .finally(() => {
        clearTimeout(timerId);
      });

    return () => {
      controller.abort();
      clearTimeout(timerId);
    };
  }, [ride?.driverLat, ride?.driverLng, ride?.fromLat, ride?.fromLng, ride?.status]);

  // Lock promisedArrivalRef once — first OSRM result during the 'accepted' phase.
  const lockPromisedArrival = (rideSnap, durationMins) => {
    if (promisedArrivalRef.current || rideSnap?.status !== 'accepted' || !rideSnap?.acceptedAt || !durationMins) return;
    const acceptedMs = tsToMs(rideSnap.acceptedAt) ?? Date.now();
    promisedArrivalRef.current = acceptedMs + durationMins * 60 * 1000;
    console.log('[ETA] Promised arrival locked:', new Date(promisedArrivalRef.current).toLocaleTimeString(), '(OSRM:', durationMins, 'min)');
  };

  // Map markers
  useEffect(() => {
    if (!ride?.fromLat || !ride?.fromLng) return;
    mapRef.current?.setMarker('pickup', ride.fromLat, ride.fromLng, 'pickup', 'Your Pickup');
    if (ride.driverLat && ride.driverLng) {
      const targetLat = ride.status === 'in_progress' ? (ride.toLat ?? ride.fromLat) : ride.fromLat;
      const targetLng = ride.status === 'in_progress' ? (ride.toLng ?? ride.fromLng) : ride.fromLng;
      mapRef.current?.setMarker('driver', ride.driverLat, ride.driverLng, 'driver', ride.driverName || 'Your Driver');
      mapRef.current?.showRoute(ride.driverLat, ride.driverLng, targetLat, targetLng, (info) => {
        setRouteInfo(info);
        lockPromisedArrival(ride, info.durationMins);
      });
      mapRef.current?.fit();
    } else {
      mapRef.current?.setView(ride.fromLat, ride.fromLng, 14);
    }
  }, [ride?.fromLat, ride?.fromLng]);

  useEffect(() => {
    if (!ride?.driverLat || !ride?.driverLng || !ride?.fromLat) return;
    const dLat = ride.driverLat; const dLng = ride.driverLng;
    const prev = lastDriverPos.current;
    const statusChanged = lastRouteStatusRef.current !== ride.status;
    // Skip redraw only when BOTH position is essentially unchanged AND status hasn't changed.
    // Without the statusChanged guard, switching to in_progress while the driver is still
    // at the pickup point would be swallowed by the position check and the route would
    // keep pointing to the pickup instead of the destination.
    if (prev && !statusChanged && Math.abs(prev.lat - dLat) < 0.0001 && Math.abs(prev.lng - dLng) < 0.0001) return;
    lastDriverPos.current = { lat: dLat, lng: dLng };
    lastRouteStatusRef.current = ride.status;
    mapRef.current?.setMarker('driver', dLat, dLng, 'driver', ride.driverName || 'Your Driver');
    if (ride.status === 'in_progress') {
      mapRef.current?.setMarker('pickup', ride.fromLat, ride.fromLng, 'pickup', ride.from || 'Pickup');
      if (ride.toLat && ride.toLng) {
        mapRef.current?.setMarker('dest', ride.toLat, ride.toLng, 'dest', ride.to || 'Destination');
        mapRef.current?.showRoute(dLat, dLng, ride.toLat, ride.toLng, (info) => setRouteInfo(info));
      }
      mapRef.current?.fit();
    } else {
      mapRef.current?.showRoute(dLat, dLng, ride.fromLat, ride.fromLng, (info) => {
        setRouteInfo(info);
        lockPromisedArrival(ride, info.durationMins);
      });
      mapRef.current?.fit();
    }
  }, [ride?.driverLat, ride?.driverLng, ride?.status]);

  const doCancel = async () => {
    setCancelConfirmVisible(false);
    const isFree  = freeCancelWindow || faultWaiver;
    const fee     = isFree ? 0 : PENALTY_CANCEL_FEE;
    const reason  = freeCancelWindow ? 'passenger_cancel_early' : faultWaiver ? 'passenger_cancel_fault' : 'passenger_cancel_late';
    try {
      await supabase.from('rides').update({
        status: 'cancelled',
        cancellation_fee: fee,
        cancel_reason: reason,
        cancelled_by: 'passenger',
        cancelled_at: new Date().toISOString(),
        ...(faultWaiver ? { fee_waived: true, fee_waived_reason: 'eta_missed' } : {}),
      }).eq('id', rideId);

      if (fee > 0 && user?.uid) {
        await supabase.rpc('withdraw_own_wallet', {
          p_delta:   -fee,
          p_type:    'cancellation_debit',
          p_desc:    `Cancellation fee (${reason.replace(/_/g, ' ')})`,
          p_ride_id: rideId,
        }).catch(() => {});  // non-fatal if passenger has insufficient funds
      }
    } catch (_) {}
    navigation.navigate('PassengerTabs');
  };

  const handleCancel = () => setCancelConfirmVisible(true);

  const handleOpenMaps = () => {
    const inProgress = ride?.status === 'in_progress';
    const lat = inProgress ? ride?.toLat   : ride?.fromLat;
    const lng = inProgress ? ride?.toLng   : ride?.fromLng;
    if (!lat || !lng) return;
    const googleDir = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    if (Platform.OS === 'web') { Linking.openURL(googleDir); }
    else if (Platform.OS === 'ios') { Linking.openURL(`maps://?daddr=${lat},${lng}&dirflg=d`).catch(() => Linking.openURL(googleDir)); }
    else { Linking.openURL(`google.navigation:q=${lat},${lng}`).catch(() => Linking.openURL(googleDir)); }
  };

  const handleCopyTripInfo = async () => {
    const lines = [
      '🚗 She Drive — Emergency Trip Info',
      `Driver: ${ride?.driverName || '—'}`,
      `Plate: ${ride?.driverPlate || '—'}`,
      `Car: ${ride?.driverCar || '—'}`,
      `Phone: ${ride?.driverPhone || '—'}`,
      `From: ${ride?.from || '—'}`,
      `To: ${ride?.to || '—'}`,
      `Time: ${new Date().toLocaleTimeString()}`,
    ];
    await Clipboard.setStringAsync(lines.join('\n'));
    Alert.alert(t('numberCopied'), t('tripInfoCopied'));
  };

  const handleShareRide = async () => {
    const eta = routeInfo ? `⏱ ETA: ~${routeInfo.durationMins} min` : '';
    const driver = ride?.driverName ? `Driver: ${ride.driverName}${ride.driverPlate ? ` · ${ride.driverPlate}` : ''}` : '';
    const lines = ['🚗 I\'m on a She Drive ride', `📍 From: ${ride?.from || '—'}`, `🎯 To: ${ride?.to || '—'}`, driver, eta, '— Shared via She Drive'].filter(Boolean);
    await Clipboard.setStringAsync(lines.join('\n'));
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2500);
  };

  if (!ride) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={noticeModal.visible} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={{ fontSize: 36, textAlign: 'center', marginBottom: 10 }}>😔</Text>
            <Text style={styles.confirmTitle}>{noticeModal.title}</Text>
            <Text style={styles.confirmMsg}>{noticeModal.message}</Text>
            <TouchableOpacity
              style={[styles.confirmYes, { marginTop: 4 }]}
              onPress={() => { setNoticeModal({ visible: false, title: '', message: '' }); navigation.navigate('PassengerTabs'); }}
            >
              <Text style={styles.confirmYesText}>{t('backToHome')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={cancelConfirmVisible} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>{t('cancelRide')}</Text>
            {/* Rules engine message — evaluated at the moment the modal opens. */}
            <Text style={styles.confirmMsg}>
              {(freeCancelWindow || faultWaiver)
                ? 'Are you sure you want to cancel? You will not be charged a fee.'
                : `Are you sure you want to cancel? A cancellation fee of ${PENALTY_CANCEL_FEE} L.E. will be applied.`}
            </Text>
            {/* Explain WHY there is no fee so the passenger understands. */}
            {freeCancelWindow && (
              <View style={styles.cancelReasonChip}>
                <Text style={styles.cancelReasonText}>⏱ You are within the 2-minute free cancellation window.</Text>
              </View>
            )}
            {faultWaiver && !freeCancelWindow && (
              <View style={styles.cancelReasonChip}>
                <Text style={styles.cancelReasonText}>🛡 The driver is significantly late — fee waived automatically.</Text>
              </View>
            )}
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmNo} onPress={() => setCancelConfirmVisible(false)}>
                <Text style={styles.confirmNoText}>{t('no')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmYes} onPress={doCancel}>
                <Text style={styles.confirmYesText}>{t('yesCancelRide')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDriverProfile} transparent animationType="slide">
        <View style={styles.profileOverlay}>
          <View style={styles.profileSheet}>
            <View style={styles.profileHeader}>
              {ride?.driverPhotoURL
                ? <Image source={{ uri: ride.driverPhotoURL }} style={styles.profileAvatarImg} />
                : <View style={styles.profileAvatar}><Text style={{ fontSize: 36 }}>👩</Text></View>
              }
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.profileName}>{ride?.driverName || t('yourDriver')}</Text>
                <Text style={styles.profileCar}>{ride?.driverCar || ''} {ride?.driverPlate ? `· ${ride.driverPlate}` : ''}</Text>
                <View style={styles.profileStats}>
                  <Text style={styles.statChip}>
                    ⭐ {ride?.driverRating != null ? Number(ride.driverRating).toFixed(1) : 'New'}
                    {ride?.driverRatingCount ? ` (${ride.driverRatingCount})` : ''}
                  </Text>
                  <Text style={styles.statChip}>🚗 {ride?.driverTotalTrips ?? 0} {t('tripsLabel')}</Text>
                </View>
                {ride?.driverPhone ? (
                  <TouchableOpacity style={styles.phoneRow} onPress={() => Linking.openURL(`tel:${ride.driverPhone}`)}>
                    <Text style={styles.phoneText}>📞 {ride.driverPhone}</Text>
                    <Text style={styles.copyBtn}>{t('call')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            {driverReviews && driverReviews.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.reviewsTitle}>{t('whatPassengersSay')}</Text>
                <ScrollView style={{ maxHeight: 180 }}>
                  {driverReviews.map((r, i) => (
                    <View key={i} style={styles.reviewItem}>
                      <Text style={styles.reviewStars}>{'⭐'.repeat(r.rating)}</Text>
                      <Text style={styles.reviewText}>{r.comment}</Text>
                      <Text style={styles.reviewAuthor}>— {r.passenger_name || t('passengerLabel')}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            <TouchableOpacity style={styles.profileClose} onPress={() => setShowDriverProfile(false)}>
              <Text style={styles.profileCloseText}>{t('gotItThanks')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.mapContainer}>
        <LeafletMap
          ref={mapRef}
          center={{ lat: ride.fromLat ?? 30.0444, lng: ride.fromLng ?? 31.2357 }}
          zoom={14}
          style={{ flex: 1 }}
        />
        {/* Walking overlay — visible as soon as ride status enters a walking phase.
            Shows "Acquiring GPS..." until the first position fix arrives, then
            switches to live distance. zIndex 999 ensures it renders above the
            Leaflet iframe, which creates its own stacking context. */}
        {(ride.status === 'accepted' || ride.status === 'arrived') && (
          <View style={styles.walkOverlay}>
            {currentPos == null ? (
              gpsStatus === 'denied' ? (
                <Text style={styles.walkText}>📍 Location permission denied. Please enable in settings.</Text>
              ) : gpsStatus === 'timeout' ? (
                <Text style={styles.walkText}>📍 GPS signal lost or timed out. Retrying...</Text>
              ) : gpsStatus === 'waiting_for_ride' ? (
                <Text style={styles.walkText}>📍 Loading ride details...</Text>
              ) : (
                <Text style={styles.walkText}>📍 Acquiring GPS location...</Text>
              )
            ) : (
              <>
                {gpsStatus === 'fallback' && (
                  <Text style={styles.walkSub}>⚠️ Approximate location (GPS unavailable)</Text>
                )}
                <Text style={styles.walkText}>🚶 {formatWalkDist(walkInfo?.distanceKm ?? 0)}</Text>
                {walkInfo?.durationMins != null && (
                  <Text style={styles.walkSub}>~{walkInfo.durationMins} min walk</Text>
                )}
              </>
            )}
          </View>
        )}
        {/* Driver ETA — bottom of map */}
        {routeInfo && (
          <View style={styles.etaOverlay}>
            <Text style={styles.etaText}>🚗 {routeInfo.distanceKm} km away · ~{routeInfo.durationMins} min</Text>
          </View>
        )}
      </View>

      {ride.status === 'arrived' && (
        <View style={styles.arrivalCard}>
          <View style={styles.arrivalHandle} />
          {graceSecsLeft !== null && (
            graceSecsLeft > 0 ? (
              <View style={styles.arrivalTimerWrap}>
                <Text style={[styles.arrivalTimer, graceSecsLeft < 30 && { color: '#DC2626' }]}>
                  {String(Math.floor(graceSecsLeft / 60)).padStart(2, '0')}:{String(graceSecsLeft % 60).padStart(2, '0')}
                </Text>
                <Text style={[styles.arrivalTimerLabel, graceSecsLeft < 30 && { color: '#DC2626' }]}>{t('gracePeriodFree')}</Text>
              </View>
            ) : (
              <View style={styles.arrivalWaitFeeWrap}>
                <Ionicons name="time" size={22} color="#DC2626" />
                <Text style={styles.arrivalWaitFeeAmt}>+{waitFeeAmt} EGP</Text>
                <Text style={styles.arrivalWaitFeeSub}>{t('waitFeeRunning')}</Text>
              </View>
            )
          )}
          <View style={styles.arrivalDivider} />
          <View style={styles.arrivalDriverRow}>
            <View style={styles.arrivalAvatar}><Text style={{ fontSize: 26 }}>👩</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.arrivalDriverName}>{ride.driverName || t('yourDriver')}</Text>
              <Text style={styles.arrivalDriverSub}>{ride.driverCar || ''}{ride.driverCar && ride.driverPlate ? '  ·  ' : ''}{ride.driverPlate || ''}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={styles.arrivalFare}>{ride.estimatedFare} EGP</Text>
              {ride.driverPhone ? (
                <TouchableOpacity style={styles.arrivalPhoneBtn} onPress={() => Linking.openURL(`tel:${ride.driverPhone}`)}>
                  <Ionicons name="call" size={18} color={colors.primary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <View style={styles.arrivalDivider} />
          <View style={styles.arrivalRoute}>
            <View style={styles.arrivalRouteRow}><View style={[styles.arrivalDot, { backgroundColor: colors.success }]} /><Text style={styles.arrivalRouteText} numberOfLines={1}>{ride.from}</Text></View>
            <View style={styles.arrivalRouteRow}><View style={[styles.arrivalDot, { backgroundColor: colors.primary }]} /><Text style={styles.arrivalRouteText} numberOfLines={1}>{ride.to}</Text></View>
          </View>
          <View style={styles.arrivalDivider} />
          {faultWaiver && (
            <View style={styles.arrivalFaultWaiver}>
              <Ionicons name="shield-checkmark" size={15} color="#059669" />
              <Text style={styles.arrivalFaultText}>{t('cancelFaultMsg')}</Text>
            </View>
          )}
          <View style={styles.arrivalActionsRow}>
            {ride.fromLat ? (
              <TouchableOpacity style={styles.arrivalAction} onPress={handleOpenMaps}>
                <Ionicons name="map-outline" size={20} color={colors.primary} />
                <Text style={[styles.arrivalActionLabel, { color: colors.primary }]}>{t('openInMaps')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.arrivalAction} onPress={handleShareRide}>
              <Ionicons name="share-social-outline" size={20} color={colors.primary} />
              <Text style={[styles.arrivalActionLabel, { color: colors.primary }]}>{t('shareRide')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.arrivalAction, styles.arrivalActionSOS]} onPress={() => setSosVisible(true)}>
              <Ionicons name="warning" size={20} color="#DC2626" />
              <Text style={[styles.arrivalActionLabel, { color: '#DC2626' }]}>SOS</Text>
            </TouchableOpacity>
          </View>
          {copiedToast && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, backgroundColor: '#D1FAE5', borderRadius: 8, padding: 8 }}>
              <Ionicons name="checkmark-circle" size={14} color="#059669" />
              <Text style={{ fontSize: 12, color: '#065F46', fontWeight: '600' }}>{t('shareRideCopied') || 'Copied!'}</Text>
            </View>
          )}
          <AnimatedPressable style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelText}>{t('cancelRide')}</Text>
          </AnimatedPressable>
        </View>
      )}

      {ride.status !== 'arrived' && (
        <View style={styles.bottomCard}>
          <View style={styles.bottomHandle} />
          <View style={styles.bottomStatusRow}>
            <View style={[styles.bottomStatusDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.bottomStatusText}>{ride.status === 'accepted' ? t('driverOnTheWay') : t('onYourWay')}</Text>
            {routeInfo && (
              <View style={styles.etaChip}><Text style={styles.etaChipText}>~{routeInfo.durationMins} min</Text></View>
            )}
          </View>
          {ride.status === 'accepted' && (
            <View style={styles.etaBanner}>
              <Ionicons name="car-outline" size={15} color={colors.primary} />
              <Text style={styles.etaBannerText}>{etaBannerMsg ?? 'Calculating arrival time...'}</Text>
            </View>
          )}
          <View style={styles.bottomDriverRow}>
            <View style={styles.bottomAvatar}><Text style={{ fontSize: 22 }}>👩</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bottomDriverName}>{ride.driverName || t('yourDriver')}</Text>
              <Text style={styles.bottomDriverSub}>{ride.driverCar || ''}{ride.driverCar && ride.driverPlate ? ' · ' : ''}{ride.driverPlate || ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <Text style={styles.bottomFare}>{ride.estimatedFare} EGP</Text>
              {ride.driverPhone ? (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${ride.driverPhone}`)}>
                  <Text style={styles.bottomPhone}>📞 {ride.driverPhone}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <View style={styles.bottomRoute}>
            <View style={styles.bottomRouteRow}><View style={[styles.bottomDot, { backgroundColor: colors.success }]} /><Text style={styles.bottomRouteText} numberOfLines={1}>{ride.from}</Text></View>
            <View style={styles.bottomRouteRow}><View style={[styles.bottomDot, { backgroundColor: colors.primary }]} /><Text style={styles.bottomRouteText} numberOfLines={1}>{ride.to}</Text></View>
          </View>
          <View style={styles.bottomDivider} />
          <View style={styles.bottomActionsRow}>
            {ride.fromLat ? (
              <TouchableOpacity style={styles.bottomAction} onPress={handleOpenMaps}>
                <Ionicons name="map-outline" size={17} color={colors.primary} />
                <Text style={[styles.bottomActionLabel, { color: colors.primary }]}>{t('openInMaps')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.bottomAction} onPress={handleShareRide}>
              <Ionicons name="share-social-outline" size={17} color={colors.primary} />
              <Text style={[styles.bottomActionLabel, { color: colors.primary }]}>{t('shareRide')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bottomAction, styles.bottomSOS]} onPress={() => setSosVisible(true)}>
              <Ionicons name="warning" size={17} color="#DC2626" />
              <Text style={[styles.bottomActionLabel, { color: '#DC2626' }]}>SOS</Text>
            </TouchableOpacity>
          </View>
          {copiedToast && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, backgroundColor: '#D1FAE5', borderRadius: 8, padding: 8 }}>
              <Ionicons name="checkmark-circle" size={14} color="#059669" />
              <Text style={{ fontSize: 12, color: '#065F46', fontWeight: '600' }}>{t('shareRideCopied') || 'Copied!'}</Text>
            </View>
          )}
          {faultWaiver && ride.status === 'accepted' && (
            <View style={styles.bottomFaultWaiver}>
              <Ionicons name="shield-checkmark" size={14} color="#059669" />
              <Text style={styles.bottomFaultText}>{t('cancelFaultMsg')}</Text>
            </View>
          )}
          {ride.status === 'accepted' && (
            <AnimatedPressable style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelText}>{t('cancelRide')}</Text>
            </AnimatedPressable>
          )}
        </View>
      )}

      <Modal visible={sosVisible} transparent animationType="fade">
        <View style={styles.sosOverlay}>
          <View style={styles.sosSheet}>
            <View style={styles.sosHeader}>
              <Text style={styles.sosHeaderTitle}>{t('emergencyHelp')}</Text>
              <Text style={styles.sosHeaderSub}>{t('stayCalm')}</Text>
            </View>
            <View style={styles.sosTripInfo}>
              {ride.driverName ? <Text style={styles.sosTripLine}>👩 {ride.driverName}{ride.driverPlate ? ` · ${ride.driverPlate}` : ''}</Text> : null}
              <Text style={styles.sosTripLine}>📍 {ride.from}</Text>
              <Text style={styles.sosTripLine}>🎯 {ride.to}</Text>
            </View>
            <TouchableOpacity style={[styles.sosAction, { backgroundColor: '#1D4ED8' }]} onPress={() => Linking.openURL('tel:122')}>
              <Text style={styles.sosActionIcon}>🚔</Text>
              <View style={{ flex: 1 }}><Text style={styles.sosActionTitle}>{t('callPolice')}</Text><Text style={styles.sosActionNum}>122</Text></View>
              <Text style={styles.sosActionCall}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sosAction, { backgroundColor: '#DC2626' }]} onPress={() => Linking.openURL('tel:123')}>
              <Text style={styles.sosActionIcon}>🚑</Text>
              <View style={{ flex: 1 }}><Text style={styles.sosActionTitle}>{t('callAmbulance')}</Text><Text style={styles.sosActionNum}>123</Text></View>
              <Text style={styles.sosActionCall}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sosCopyBtn} onPress={handleCopyTripInfo}>
              <Ionicons name="copy-outline" size={17} color={colors.primary} />
              <Text style={styles.sosCopyText}>{t('copyTripInfo')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sosCloseBtn} onPress={() => setSosVisible(false)}>
              <Text style={styles.sosCloseBtnText}>{t('imSafeClose')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: colors.white },
    // position:'relative' makes this the CSS containing block for the absolute overlays in RN Web.
    // Without it the browser may position absolute children relative to a higher ancestor.
    mapContainer: { flex: 1, position: 'relative' },
    // Walking distance pill — top of map, blue tint to match the walk polyline.
    // zIndex:999 is required because the Leaflet iframe creates an independent stacking context;
    // any sibling without explicit zIndex renders underneath it and becomes invisible.
    walkOverlay: {
      position: 'absolute', top: 10, left: 10, right: 10, zIndex: 999,
      backgroundColor: 'rgba(37,99,235,0.9)', borderRadius: 10,
      paddingVertical: 7, paddingHorizontal: 14, alignItems: 'center',
    },
    walkText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    walkSub:  { color: 'rgba(255,255,255,0.82)', fontSize: 11, marginTop: 2 },
    // Driver ETA pill — bottom of map
    etaOverlay: {
      position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 999,
      backgroundColor: 'rgba(26,26,46,0.85)', borderRadius: 10,
      paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center',
    },
    etaText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    cancelBtn: { marginHorizontal: 0, marginTop: 8, alignItems: 'center', borderWidth: 1.5, borderColor: colors.error, borderRadius: 14, paddingVertical: 13 },
    cancelText: { color: colors.error, fontSize: 15, fontWeight: '700' },
    bottomCard: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 14 },
    bottomHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 },
    bottomStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    bottomStatusDot: { width: 8, height: 8, borderRadius: 4 },
    bottomStatusText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.dark },
    etaChip: { backgroundColor: colors.primaryBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
    etaChipText: { fontSize: 12, fontWeight: '700', color: colors.primary },
    etaBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.primaryBg, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 10 },
    etaBannerText: { fontSize: 13, fontWeight: '700', color: colors.primary, flex: 1 },
    bottomDriverRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    bottomAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
    bottomDriverName: { fontSize: 15, fontWeight: '700', color: colors.dark },
    bottomDriverSub: { fontSize: 12, color: colors.gray, marginTop: 1 },
    bottomFare: { fontSize: 15, fontWeight: '800', color: colors.primary },
    bottomPhone: { fontSize: 11, color: colors.gray, fontWeight: '600' },
    bottomRoute: { gap: 5, marginBottom: 2 },
    bottomRouteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bottomDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
    bottomRouteText: { fontSize: 13, color: colors.dark, fontWeight: '500', flex: 1 },
    bottomDivider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
    bottomActionsRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
    bottomAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.primaryBg, borderRadius: 12, paddingVertical: 10 },
    bottomSOS: { backgroundColor: '#FEE2E2' },
    bottomActionLabel: { fontSize: 12, fontWeight: '700' },
    bottomFaultWaiver: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D1FAE5', borderRadius: 8, padding: 8, marginBottom: 6 },
    bottomFaultText: { fontSize: 12, color: '#065F46', fontWeight: '600', flex: 1 },
    arrivalCard: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 18 },
    arrivalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    arrivalTimerWrap: { alignItems: 'center', marginBottom: 4 },
    arrivalTimer: { fontSize: 52, fontWeight: '900', color: '#059669', fontVariant: ['tabular-nums'], lineHeight: 60 },
    arrivalTimerLabel: { fontSize: 11, fontWeight: '700', color: '#059669', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 },
    arrivalWaitFeeWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 },
    arrivalWaitFeeAmt: { fontSize: 32, fontWeight: '900', color: '#DC2626', fontVariant: ['tabular-nums'] },
    arrivalWaitFeeSub: { fontSize: 11, color: '#DC2626', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    arrivalDivider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
    arrivalDriverRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    arrivalAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
    arrivalDriverName: { fontSize: 15, fontWeight: '700', color: colors.dark },
    arrivalDriverSub: { fontSize: 12, color: colors.gray, marginTop: 1 },
    arrivalFare: { fontSize: 15, fontWeight: '800', color: colors.primary, alignSelf: 'center' },
    arrivalPhoneBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
    arrivalRoute: { gap: 6 },
    arrivalRouteRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    arrivalDot: { width: 8, height: 8, borderRadius: 4 },
    arrivalRouteText: { fontSize: 13, color: colors.dark, fontWeight: '500', flex: 1 },
    arrivalFaultWaiver: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D1FAE5', borderRadius: 8, padding: 8, marginBottom: 4 },
    arrivalFaultText: { fontSize: 12, color: '#065F46', fontWeight: '600', flex: 1 },
    arrivalActionsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    arrivalAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.primaryBg, borderRadius: 12, paddingVertical: 10 },
    arrivalActionSOS: { backgroundColor: '#FEE2E2' },
    arrivalActionLabel: { fontSize: 12, fontWeight: '700' },
    profileOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    profileSheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
    profileHeader: { flexDirection: 'row', alignItems: 'center' },
    profileAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
    profileAvatarImg: { width: 60, height: 60, borderRadius: 30 },
    phoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
    phoneText: { fontSize: 13, color: colors.dark, fontWeight: '600' },
    copyBtn: { fontSize: 11, color: colors.primary, fontWeight: '700', backgroundColor: colors.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    profileName: { fontSize: 18, fontWeight: '700', color: colors.dark },
    profileCar: { fontSize: 13, color: colors.gray, marginTop: 2 },
    profileStats: { flexDirection: 'row', gap: 8, marginTop: 6 },
    statChip: { fontSize: 13, fontWeight: '600', color: colors.dark, backgroundColor: colors.lightGray, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    reviewsTitle: { fontSize: 14, fontWeight: '700', color: colors.dark, marginBottom: 10 },
    reviewItem: { backgroundColor: colors.lightGray, borderRadius: 10, padding: 12, marginBottom: 8 },
    reviewStars: { fontSize: 12, marginBottom: 4 },
    reviewText: { fontSize: 13, color: colors.dark, lineHeight: 18 },
    reviewAuthor: { fontSize: 11, color: colors.gray, marginTop: 4 },
    profileClose: { backgroundColor: colors.primary, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 16 },
    profileCloseText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 28 },
    confirmBox: { backgroundColor: colors.white, borderRadius: 20, padding: 24, width: '100%' },
    confirmTitle: { fontSize: 18, fontWeight: '800', color: colors.dark, marginBottom: 10 },
    confirmMsg: { fontSize: 14, color: colors.gray, lineHeight: 20, marginBottom: 20 },
    confirmBtns: { flexDirection: 'row', gap: 12 },
    confirmNo: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border },
    confirmNoText: { fontSize: 15, fontWeight: '700', color: colors.gray },
    confirmYes: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: colors.error },
    confirmYesText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    cancelReasonChip: { backgroundColor: '#D1FAE5', borderRadius: 8, padding: 10, marginBottom: 12 },
    cancelReasonText: { fontSize: 12, color: '#065F46', fontWeight: '600', textAlign: 'center', lineHeight: 17 },
    sosOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    sosSheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
    sosHeader: { alignItems: 'center', marginBottom: 16 },
    sosHeaderTitle: { fontSize: 20, fontWeight: '900', color: '#DC2626', marginBottom: 4 },
    sosHeaderSub: { fontSize: 14, color: colors.gray, textAlign: 'center' },
    sosTripInfo: { backgroundColor: colors.lightGray, borderRadius: 12, padding: 14, marginBottom: 16, gap: 4 },
    sosTripLine: { fontSize: 13, color: colors.dark, fontWeight: '600', lineHeight: 20 },
    sosAction: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, marginBottom: 10, gap: 14 },
    sosActionIcon: { fontSize: 28 },
    sosActionTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
    sosActionNum: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 2 },
    sosActionCall: { fontSize: 13, fontWeight: '800', color: '#fff', backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
    sosCopyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.lightGray, borderRadius: 12, padding: 14, marginBottom: 12 },
    sosCopyText: { fontSize: 14, fontWeight: '700', color: colors.primary },
    sosCloseBtn: { alignItems: 'center', paddingVertical: 14 },
    sosCloseBtnText: { fontSize: 15, fontWeight: '700', color: colors.gray },
  });
}
