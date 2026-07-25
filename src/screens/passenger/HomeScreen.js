import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Pressable,
  ScrollView, SafeAreaView, Alert, ActivityIndicator, TextInput, Image,
  Animated, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { toRide, toBid } from '../../lib/transforms';
import { useAuth } from '../../context/AuthContext';
import { calculateFare, applyFirstRideDiscount, getTimePeriodLabel } from '../../utils/pricing';
import { getDrivingRoute } from '../../utils/routing';
import { useTheme } from '../../context/SettingsContext';
import LeafletMap from '../../components/LeafletMap';
import LocationSearch from '../../components/LocationSearch';
import CardInputModal from '../../components/CardInputModal';
import AnimatedPressable from '../../components/AnimatedPressable';
import CoachingBanner from '../../components/CoachingBanner';
import { useDeepLink } from '../../hooks/useDeepLink';

// Fetch driving duration from a driver's current position to the passenger pickup.
// Always resolves — never throws — so Promise.allSettled never gets a rejection.
async function computeDriverEta(driver, pickupLat, pickupLng) {
  const { driverId, driverLat, driverLng } = driver;
  if (!driverLat || !driverLng) {
    return { driverId, status: 'no-location', mins: null };
  }
  try {
    const route = await getDrivingRoute(driverLat, driverLng, pickupLat, pickupLng);
    return { driverId, status: 'ok', mins: route.durationMins };
  } catch {
    return { driverId, status: 'error', mins: null };
  }
}

// Self-contained driver offer card — fetches its own ETA on mount so it never
// depends on parent batch-fetch timing or stale ref state.
function DriverOfferCard({ bid, pickupLat, pickupLng, onSelect, secsLeft, timerColor, pct, acceptingBid }) {
  const { colors, shadow, t } = useTheme();
  const [etaState, setEtaState] = useState({ status: 'loading', mins: null, errMsg: null });

  useEffect(() => {
    let cancelled = false;
    if (!bid.driverLat || !bid.driverLng) {
      setEtaState({ status: 'no-location', mins: null, errMsg: null });
      return;
    }
    if (!pickupLat || !pickupLng) {
      setEtaState({ status: 'error', mins: null, errMsg: 'Pickup coords missing' });
      return;
    }
    getDrivingRoute(bid.driverLat, bid.driverLng, pickupLat, pickupLng)
      .then(route => {
        if (!cancelled) {
          console.log('[DriverCard ETA] Driver:', bid.driverId, '→', route.durationMins, 'min');
          setEtaState({ status: 'ok', mins: route.durationMins, errMsg: null });
        }
      })
      .catch(err => {
        if (!cancelled) {
          const errMsg = err?.message || String(err);
          console.log('[DriverCard ETA] Driver:', bid.driverId, 'Error:', errMsg);
          setEtaState({ status: 'error', mins: null, errMsg });
        }
      });
    return () => { cancelled = true; };
  }, [bid.driverId]); // Only re-fetch when the actual driver changes

  const ok = colors.success;
  return (
    <View style={[{ backgroundColor: colors.white, borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, shadow.sm]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.lightGray, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' }}>
          {bid.driverPhoto
            ? <Image source={{ uri: bid.driverPhoto }} style={{ width: 52, height: 52, borderRadius: 26 }} />
            : <Text style={{ fontSize: 26 }}>👩</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark }}>{bid.driverName}</Text>
          <Text style={{ fontSize: 12, color: colors.gray, marginTop: 2 }}>{bid.driverCar}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: colors.dark }}>⭐ {bid.driverRating != null ? Math.min(5, bid.driverRating).toFixed(1) : '—'}</Text>
            <Text style={{ fontSize: 12, color: colors.dark, marginLeft: 8 }}>🚗 {bid.driverTotalTrips ?? 0}</Text>
          </View>

          {etaState.status === 'loading'     && <Text style={{ fontSize: 11, color: colors.gray, marginTop: 4, fontStyle: 'italic' }}>Calculating ETA…</Text>}
          {etaState.status === 'no-location' && <Text style={{ fontSize: 11, color: colors.gray, marginTop: 4 }}>📍 Location unavailable</Text>}
          {etaState.status === 'error'       && <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>ETA Error: {etaState.errMsg}</Text>}
          {etaState.status === 'ok'          && (
            <View style={{ backgroundColor: ok + '18', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, marginTop: 5, alignSelf: 'flex-start', borderWidth: 1, borderColor: ok + '55' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: ok }}>🕐 {etaState.mins} min away</Text>
            </View>
          )}

          <View style={{ height: 3, backgroundColor: colors.lightGray, borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
            <View style={{ height: 3, borderRadius: 2, width: `${Math.round(pct * 100)}%`, backgroundColor: timerColor }} />
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 3, color: timerColor }}>{secsLeft}s left</Text>
        </View>
      </View>
      {Platform.OS === 'web' ? (
        /* Raw HTML button bypasses React Native's gesture responder system, which
           the Leaflet iframe stacking context breaks on web. */
        <button
          disabled={acceptingBid}
          onClick={(e) => {
            e.stopPropagation();
            if (!acceptingBid) onSelect(bid);
          }}
          style={{
            backgroundColor: acceptingBid ? '#9CA3AF' : colors.primary,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: '700',
            minWidth: 72,
            cursor: acceptingBid ? 'not-allowed' : 'pointer',
          }}
        >
          {acceptingBid ? '…' : t('selectDriver')}
        </button>
      ) : (
        <Pressable
          style={({ pressed }) => ({
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 16,
            opacity: acceptingBid || pressed ? 0.6 : 1,
            minWidth: 72,
            alignItems: 'center',
            justifyContent: 'center',
          })}
          onPress={() => onSelect(bid)}
          disabled={acceptingBid}
        >
          {acceptingBid
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{t('selectDriver')}</Text>}
        </Pressable>
      )}
    </View>
  );
}

const PAYMENT_IDS = [
  { id: 'cash',   label: '💵' },
  { id: 'card',   label: '💳' },
  { id: 'wallet', label: '👜' },
];

const COMMISSION_RATE = 0.15;

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'User-Agent': 'SheDriveApp/1.0' } }
    );
    const data = await res.json();
    const a = data.address;
    return a?.suburb || a?.neighbourhood || a?.town || a?.city || data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

export default function HomeScreen({ navigation }) {
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [mapMode, setMapMode] = useState('pickup');
  const [routeInfo, setRouteInfo] = useState(null);
  const [calcStatus, setCalcStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [searching, setSearching] = useState(false);
  const [searchingRide, setSearchingRide] = useState(null);
  const [bidding, setBidding] = useState(false);
  const [biddingRide, setBiddingRide] = useState(null);
  const [bidDrivers, setBidDrivers] = useState([]);
  const [tickCounter, setTickCounter] = useState(0);
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [activeRideId, setActiveRideId] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState('');
  const [acceptingBid, setAcceptingBid] = useState(false);
  const acceptingBidRef = useRef(false);
  const [pickupNote, setPickupNote] = useState('');
  const mapRef = useRef(null);
  const handleTimeoutRef = useRef(null);
  const driverExpiresRef = useRef({});
  const bidDriversRef = useRef([]);
  const tickRef = useRef(null);
  // Ride IDs the passenger has explicitly cancelled. Stale Realtime events that arrive
  // after cancel (queued before the DB write completed) are dropped here so the bidding
  // screen cannot resurrect itself.
  const cancelledRideIdsRef = useRef(new Set());
  // Mirrors bidding + searchingRide in refs so the bid subscription callback can read
  // current values without being a stale closure and without re-subscribing on every change.
  const biddingRef = useRef(false);
  const searchingRideRef = useRef(null);
  useEffect(() => { biddingRef.current = bidding; });
  useEffect(() => { searchingRideRef.current = searchingRide; });
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;

  const isFirstRide = (userProfile?.totalTrips ?? 0) === 0;
  const baseFare = routeInfo ? calculateFare(routeInfo.distanceKm) : 0;
  const displayFare = isFirstRide ? applyFirstRideDiscount(baseFare) : baseFare;
  const CARD_FEE_PCT = 3;
  const walletBalance = userProfile?.wallet || 0;
  const savedCards = userProfile?.savedCards || [];
  const defaultCard = savedCards[0] || null;

  const adminAmount = routeInfo ? Math.round(displayFare * COMMISSION_RATE * 100) / 100 : 0;
  const walletCashEligible = walletBalance >= adminAmount && walletBalance < displayFare;
  const walletAmountPaid = paymentMethod.startsWith('wallet') && routeInfo
    ? Math.min(walletBalance, displayFare) : 0;

  let cardFee = 0;
  if (routeInfo) {
    if (paymentMethod === 'card') {
      cardFee = Math.round(displayFare * CARD_FEE_PCT / 100);
    } else if (paymentMethod === 'wallet+card') {
      const cardPortion = displayFare - walletAmountPaid;
      cardFee = Math.round(cardPortion * CARD_FEE_PCT / 100);
    }
  }

  const finalFare = routeInfo ? displayFare + cardFee : 0;
  const remainingAmount = routeInfo ? finalFare - walletAmountPaid : 0;
  const walletShortfall = routeInfo ? Math.max(0, displayFare - walletBalance) : 0;
  const cardSplitShortfall = routeInfo ? Math.round(walletShortfall * (1 + CARD_FEE_PCT / 100)) : 0;

  // Seed GPS on mount — places blue "me" dot and centers map on first fix
  useEffect(() => {
    if (!navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng });
        mapRef.current?.setCurrentPos(lat, lng);
        mapRef.current?.setMarker('me', lat, lng, 'me', 'You');
        mapRef.current?.setView(lat, lng, 14);
      },
      null,
      { timeout: 6000, maximumAge: 60000, enableHighAccuracy: false }
    );
  }, []);

  // Deep-link handler — geo: / Google Maps URLs shared from WhatsApp / other apps
  const { location: deepLinkLocation, clearLocation: clearDeepLink } = useDeepLink();
  useEffect(() => {
    if (!deepLinkLocation) return;
    const { lat, lng } = deepLinkLocation;
    clearDeepLink();
    reverseGeocode(lat, lng).then((address) => {
      setDestination({ address, lat, lng });
      mapRef.current?.setMarker('dest', lat, lng, 'dest', address);
      mapRef.current?.setView(lat, lng, 14);
    });
  }, [deepLinkLocation]);

  // Route calculation
  useEffect(() => {
    if (!pickup?.lat || !destination?.lat) {
      setRouteInfo(null); setCalcStatus('');
      mapRef.current?.clearRoute();
      return;
    }
    setCalcStatus('loading');
    getDrivingRoute(pickup.lat, pickup.lng, destination.lat, destination.lng)
      .then((info) => { setRouteInfo(info); setCalcStatus('done'); mapRef.current?.showRoute(pickup.lat, pickup.lng, destination.lat, destination.lng); })
      .catch(() => { setCalcStatus('error'); setRouteInfo(null); });
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng]);

  // Pickup marker
  useEffect(() => {
    if (pickup?.lat) { mapRef.current?.setMarker('pickup', pickup.lat, pickup.lng, 'pickup', 'Pickup'); mapRef.current?.setView(pickup.lat, pickup.lng, 14); }
    else mapRef.current?.removeMarker('pickup');
  }, [pickup?.lat, pickup?.lng]);

  // Destination marker
  useEffect(() => {
    if (destination?.lat) mapRef.current?.setMarker('dest', destination.lat, destination.lng, 'dest', 'Destination');
    else mapRef.current?.removeMarker('dest');
    if (pickup?.lat && destination?.lat) mapRef.current?.fit();
  }, [destination?.lat, destination?.lng]);

  // Live online drivers on map — gated on user for RLS; periodic refresh guards against missed events
  useEffect(() => {
    if (!user) return;

    const toCarList = (data) =>
      (data || [])
        .filter(d => d.current_lat && d.current_lng)
        .map(d => ({ id: d.id, lat: d.current_lat, lng: d.current_lng, name: d.name }));

    const fetchAndRender = () =>
      supabase
        .from('public_driver_profiles')
        .select('id, name, current_lat, current_lng')
        .eq('role', 'driver')
        .eq('is_online', true)
        .then(({ data, error }) => {
          if (error) { console.error('[map] driver fetch:', error.message, error); return; }
          mapRef.current?.setCars(toCarList(data));
        });

    fetchAndRender();

    // No server-side row filter — some Supabase builds drop events when the filter
    // column isn't in REPLICA IDENTITY. Re-fetch on any profiles UPDATE, filter client-side.
    const ch = supabase
      .channel('online-drivers')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        if (payload.new?.role === 'driver') fetchAndRender();
      })
      .subscribe();

    // Periodic fallback: re-fetch every 15 s in case Realtime events are missed
    const timer = setInterval(fetchAndRender, 15000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(timer);
    };
  }, [user]);

  // My active ride listener
  useEffect(() => {
    if (!user) return;
    const activeStatuses = ['searching', 'bidding', 'accepted', 'arrived', 'in_progress'];

    // Initial check — only restore transient states created within the last 15 minutes.
    // Accepted/in_progress rides are handled by the Realtime channel below.
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    supabase.from('rides').select('*').eq('passenger_id', user.id)
      .in('status', ['searching', 'bidding']).gte('created_at', cutoff).limit(1)
      .then(({ data }) => { if (data?.length > 0) applyRideStatus(toRide(data[0])); });

    // Cancel any stale open rides older than the cutoff (ghost rides left in DB
    // from sessions that ended before the local cancel could write to the DB).
    supabase.from('rides')
      .update({ status: 'cancelled' })
      .eq('passenger_id', user.id)
      .in('status', ['searching', 'bidding'])
      .lt('created_at', cutoff)
      .then(({ error }) => { if (error) console.error('[rides] stale cleanup failed:', error.message); });

    const ch = supabase.channel('my-rides-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `passenger_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          clearRideState();
          return;
        }
        const ride = toRide(payload.new);
        if (activeStatuses.includes(ride.status)) {
          applyRideStatus(ride);
        } else {
          clearRideState();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const applyRideStatus = useCallback((ride) => {
    // Drop stale Realtime events that arrive after the passenger cancelled this ride.
    if (cancelledRideIdsRef.current.has(ride.id)) return;
    if (ride.status === 'searching') {
      setSearching(true); setBidding(false); setBiddingRide(null);
      setActiveRideId(ride.id); setSearchingRide(ride);
    } else if (ride.status === 'bidding') {
      setSearching(false); setBidding(true); setBiddingRide(ride);
      setActiveRideId(ride.id); setSearchingRide(null);
    } else {
      setSearching(false); setBidding(false); setBiddingRide(null);
      setSearchingRide(null);
      navigation.navigate('ActiveRide', { rideId: ride.id });
    }
  }, [navigation]);

  const clearRideState = useCallback(() => {
    setSearching(false); setBidding(false); setBiddingRide(null);
    setSearchingRide(null); setActiveRideId(null);
  }, []);

  // Bid drivers listener — activates as soon as activeRideId is known (not gated on bidding).
  // This lets the passenger see driver offers even if rides.status never changes to 'bidding'.
  useEffect(() => {
    if (!activeRideId) { setBidDrivers([]); return; }

    let effectCancelled = false;

    const fetchBids = async () => {
      if (effectCancelled || cancelledRideIdsRef.current.has(activeRideId)) return;
      const { data } = await supabase
        .from('bids')
        .select('id, driver_id, status, created_at, profiles(name, photo_url, rating, total_trips, car_model, car_color, plate_number, phone, current_lat, current_lng)')
        .eq('ride_id', activeRideId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      // Re-check after async gap: cancel may have happened while we were awaiting.
      if (effectCancelled || cancelledRideIdsRef.current.has(activeRideId)) return;
      if (!data) return;

      // If the first bid has just arrived and we are still on the 'searching' screen,
      // transition to the bidding UI without waiting for rides.status to update in Postgres.
      if (data.length > 0 && !biddingRef.current) {
        setSearching(false);
        setBidding(true);
        setBiddingRide(searchingRideRef.current);
      }

      const now = Date.now();
      const drivers = data.map(b => ({
        driverId:         b.driver_id,
        driverName:       b.profiles?.name,
        driverPhoto:      b.profiles?.photo_url,
        driverRating:     b.profiles?.rating,
        driverTotalTrips: b.profiles?.total_trips,
        driverCar:        [b.profiles?.car_model, b.profiles?.car_color].filter(Boolean).join(' '),
        driverPlate:      b.profiles?.plate_number,
        driverPhone:      b.profiles?.phone,
        driverLat:        b.profiles?.current_lat,
        driverLng:        b.profiles?.current_lng,
        expiresAt:        driverExpiresRef.current[b.driver_id] ?? (now + 15000),
      }));
      drivers.forEach(d => { driverExpiresRef.current[d.driverId] = d.expiresAt; });
      bidDriversRef.current = drivers;
      setBidDrivers(drivers);

      if (!tickRef.current) {
        tickRef.current = setInterval(() => {
          const ts = Date.now();
          const active = bidDriversRef.current.filter(d => d.expiresAt > ts);
          if (active.length !== bidDriversRef.current.length) {
            bidDriversRef.current = active;
            setBidDrivers([...active]);
          }
          setTickCounter(c => c + 1);
        }, 500);
      }
    };

    fetchBids();

    const ch = supabase.channel('bids-' + activeRideId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bids', filter: `ride_id=eq.${activeRideId}` }, fetchBids)
      .subscribe();

    return () => {
      effectCancelled = true;
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      driverExpiresRef.current = {};
      bidDriversRef.current = [];
      setTickCounter(0);
      supabase.removeChannel(ch);
    };
  }, [activeRideId]); // intentionally excludes `bidding` — state managed via biddingRef to avoid re-subscribing

  // Pulsing rings animation while searching
  useEffect(() => {
    if (!searching) { pulse1.setValue(0); pulse2.setValue(0); pulse3.setValue(0); return; }
    const makeRing = (val, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(val, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    const a = makeRing(pulse1, 0); const b = makeRing(pulse2, 600); const c = makeRing(pulse3, 1200);
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, [searching]);



  const handleMapClick = useCallback(async (lat, lng) => {
    const address = await reverseGeocode(lat, lng);
    const place = { address, lat, lng };
    if (mapMode === 'pickup') setPickup(place);
    else setDestination(place);
  }, [mapMode]);

  const isHttpOverLan = typeof window !== 'undefined'
    && window.location.protocol === 'http:'
    && window.location.hostname !== 'localhost'
    && window.location.hostname !== '127.0.0.1';

  const handleUseMyLocation = () => {
    if (!navigator?.geolocation) { Alert.alert('Not supported', 'Geolocation is not available.'); return; }
    if (isHttpOverLan) {
      Alert.alert('Location Blocked', 'Chrome requires HTTPS to access location on a phone.\n\n• Open Chrome on your phone → go to chrome://flags/#unsafely-treat-insecure-origin-as-secure → add http://' + window.location.host + ' → Enable → Relaunch\n\nOr ask your developer to start the server with --tunnel for HTTPS.');
      return;
    }
    if (userLocation) {
      reverseGeocode(userLocation.lat, userLocation.lng).then((address) => {
        setPickup({ address, lat: userLocation.lat, lng: userLocation.lng });
        mapRef.current?.setView(userLocation.lat, userLocation.lng, 15);
        mapRef.current?.setCurrentPos(userLocation.lat, userLocation.lng);
        mapRef.current?.setMarker('me', userLocation.lat, userLocation.lng, 'me', 'You');
      });
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const address = await reverseGeocode(lat, lng);
        setPickup({ address, lat, lng });
        setUserLocation({ lat, lng });
        mapRef.current?.setView(lat, lng, 15);
        mapRef.current?.setCurrentPos(lat, lng);
        mapRef.current?.setMarker('me', lat, lng, 'me', 'You');
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (!userLocation) Alert.alert(t('error'), err.code === 1 ? 'Please allow location access in your browser settings.' : 'Could not determine your location. Please try again.');
      },
      { timeout: 5000, maximumAge: 30000, enableHighAccuracy: false }
    );
  };

  const handleRecenter = useCallback(() => {
    if (userLocation) {
      mapRef.current?.setCurrentPos(userLocation.lat, userLocation.lng);
      mapRef.current?.setView(userLocation.lat, userLocation.lng, 15);
      mapRef.current?.setMarker('me', userLocation.lat, userLocation.lng, 'me', 'You');
      return;
    }
    if (!navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLocation({ lat, lng });
        mapRef.current?.setCurrentPos(lat, lng);
        mapRef.current?.setView(lat, lng, 15);
        mapRef.current?.setMarker('me', lat, lng, 'me', 'You');
      },
      null, { timeout: 5000, maximumAge: 30000, enableHighAccuracy: false }
    );
  }, [userLocation]);

  const doBook = async () => {
    setBooking(true);
    setBookError('');
    if ((userProfile?.wallet ?? 0) < 0) { setBookError(t('debtLockedMsg')); setBooking(false); return; }
    try {
      const { error } = await supabase.from('rides').insert({
        passenger_id:       user.id,
        passenger_name:     userProfile.name,
        passenger_phone:    userProfile.phone ?? '',
        passenger_photo_url: userProfile.photoURL ?? '',
        from_address:       pickup.address,
        to_address:         destination.address,
        from_lat:           pickup.lat,
        from_lng:           pickup.lng,
        to_lat:             destination.lat,
        to_lng:             destination.lng,
        distance_km:        routeInfo.distanceKm,
        duration_mins:      routeInfo.durationMins,
        estimated_fare:     finalFare,
        base_fare:          displayFare,
        card_fee:           cardFee,
        payment_method:     paymentMethod,
        wallet_amount_paid: paymentMethod.startsWith('wallet') ? walletAmountPaid : 0,
        remaining_amount:   paymentMethod.startsWith('wallet+') ? remainingAmount : 0,
        pickup_note:        pickupNote.trim(),
        is_first_ride:      isFirstRide,
        status:             'searching',
      });
      if (error) throw error;
    } catch (err) {
      console.error('[ride insert] error:', err);
      setBookError(err.message || t('genericError') || 'Failed to request ride. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  const handleRequest = () => {
    setBookError('');
    if (!pickup || !destination) { setBookError(t('missingInfoMsg')); return; }
    if (!routeInfo) { setBookError('Please wait for the route to be calculated.'); return; }
    if (paymentMethod === 'wallet' && walletBalance < displayFare) { setBookError(t('insufficientWalletMsg')); return; }
    doBook();
  };

  const handleSaveCard = async (cardData) => {
    const current = userProfile?.savedCards ?? [];
    const updated = [...current.filter(c => c.id !== cardData.id), cardData];
    await supabase.from('profiles').update({ saved_cards: updated }).eq('id', user.id);
  };

  const stopTick = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    driverExpiresRef.current = {};
    bidDriversRef.current = [];
  }, []);

  const handleTimeoutOrReject = useCallback(async () => {
    stopTick();
    const rideId = activeRideId;
    setBidding(false); setBiddingRide(null); setBidDrivers([]);
    if (!rideId) return;
    try {
      const { data: pendingBids } = await supabase.from('bids').select('id, driver_id').eq('ride_id', rideId).eq('status', 'pending');
      if (pendingBids?.length) {
        await Promise.all(pendingBids.map(b => supabase.rpc('reject_bid', { p_ride_id: rideId, p_driver_id: b.driver_id, p_passenger_id: user.id })));
      }
      await supabase.from('rides').update({ status: 'cancelled' }).eq('id', rideId);
    } catch (_) {}
  }, [activeRideId, stopTick, user]);

  handleTimeoutRef.current = handleTimeoutOrReject;

  const handleSelectDriver = useCallback(async (bid) => {
    console.log('[SELECT] button pressed — acceptingBidRef:', acceptingBidRef.current, 'activeRideId:', activeRideId, 'bid.driverId:', bid?.driverId);
    if (acceptingBidRef.current) { console.log('[SELECT] blocked by acceptingBidRef'); return; }
    const rideId = activeRideId;
    if (!rideId) {
      console.error('[SELECT] activeRideId is null — cannot accept bid');
      Alert.alert('Error', 'No active ride found. Please cancel and request a new ride.');
      return;
    }
    acceptingBidRef.current = true;
    setAcceptingBid(true);
    try {
      console.log('[SELECT] calling accept_bid RPC', { rideId, driverId: bid.driverId, passengerId: user.id });
      const { data, error } = await supabase.rpc('accept_bid', {
        p_ride_id:       rideId,
        p_bid_driver_id: bid.driverId,
        p_passenger_id:  user.id,
      });
      console.log('[SELECT] accept_bid response — data:', JSON.stringify(data), 'error:', error);
      // accept_bid returns jsonb — business-logic errors come in data.error, not in error.
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // RPC confirmed — stop the timer and clear the bidding UI.
      stopTick();
      setBidding(false);
      setBiddingRide(null);
      setBidDrivers([]);
    } catch (err) {
      console.error('[SELECT] accept_bid failed:', err.message);
      Alert.alert('Error', err.message || 'Could not select driver. Please try again.');
    } finally {
      acceptingBidRef.current = false;
      setAcceptingBid(false);
    }
  }, [activeRideId, stopTick, user]);

  const handleCancel = async () => {
    stopTick();
    const rideId = activeRideId;

    // 1. Register the cancellation BEFORE any async work so every Realtime event that
    //    arrives during the await is silently dropped by applyRideStatus / fetchBids.
    if (rideId) cancelledRideIdsRef.current.add(rideId);

    // 2. Clear UI immediately — passenger should not be stuck waiting for a network call.
    clearRideState();
    setPickup(null);
    setDestination(null);
    setRouteInfo(null);

    // 3. Persist cancellation to DB in the background.
    if (rideId) {
      try {
        const { error } = await supabase
          .from('rides')
          .update({ status: 'cancelled' })
          .eq('id', rideId);
        if (error) throw error;
      } catch (err) {
        console.error('[handleCancel] DB update failed:', err.message);
      }
    }
  };

  if (searching) {
    const ringScale = (val) => val.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] });
    const ringOpacity = (val) => val.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.5, 0] });
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.searchingWrap}>
          <View style={styles.pulseWrap}>
            {[pulse1, pulse2, pulse3].map((p, i) => (
              <Animated.View key={i} style={[styles.pulseRing, { transform: [{ scale: ringScale(p) }], opacity: ringOpacity(p) }]} />
            ))}
            <View style={styles.pulseCore}><Text style={{ fontSize: 34 }}>🚗</Text></View>
          </View>
          <Text style={styles.searchTitle}>{t('findingDriver')}</Text>
          <Text style={styles.searchSub}>{t('connectingDriver')}</Text>
          <View style={styles.searchCard}>
            <Text style={styles.searchRoute}>📍 {searchingRide?.from || pickup?.address}</Text>
            <Text style={[styles.searchRoute, { color: colors.primary }]}>🎯 {searchingRide?.to || destination?.address}</Text>
            {(searchingRide || routeInfo) && (
              <Text style={styles.searchMeta}>{searchingRide?.distanceKm || routeInfo?.distanceKm} km · ~{searchingRide?.durationMins || routeInfo?.durationMins} min</Text>
            )}
            <Text style={styles.searchFare}>{searchingRide?.estimatedFare || displayFare} EGP{isFirstRide ? '  🎉' : ''}</Text>
          </View>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelText}>{t('cancelSearch')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const canRequest = pickup?.lat && destination?.lat && routeInfo;

  return (
    <SafeAreaView style={styles.container}>
      <CardInputModal
        visible={cardModalVisible}
        onClose={() => setCardModalVisible(false)}
        onSave={handleSaveCard}
        title={defaultCard ? t('replaceCard') : t('addCard')}
        actionLabel={t('saveCard')}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{t('hello')} {userProfile?.name?.split(' ')[0] || ''} 👋</Text>
            <Text style={styles.greetingSub}>{t('whereAreYouGoing')}</Text>
          </View>
          <View style={styles.walletPill}>
            <Ionicons name="wallet-outline" size={14} color={colors.primary} />
            <Text style={styles.walletText}> {userProfile?.wallet || 0} EGP</Text>
          </View>
        </View>

        <CoachingBanner />

        <View style={styles.mapWrap}>
          {!bidding && <LeafletMap ref={mapRef} zoom={12} height={270} onMapClick={handleMapClick} onRecenter={handleRecenter} />}
          <View style={styles.modeRow}>
            <TouchableOpacity style={[styles.modeBtn, mapMode === 'pickup' && styles.modeBtnPickup]} onPress={() => setMapMode('pickup')}>
              <Text style={styles.modeBtnText}>🟢 {t('setPickup')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modeBtn, mapMode === 'dest' && styles.modeBtnDest]} onPress={() => setMapMode('dest')}>
              <Text style={styles.modeBtnText}>🎯 {t('setDest')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.mapHint}>{mapMode === 'pickup' ? t('tapSetsPickup') : t('tapSetsDest')}</Text>
        </View>

        <View style={styles.card}>
          {isFirstRide && (
            <View style={styles.firstRideBanner}>
              <Text style={styles.firstRideText}>{t('firstRideBanner')}</Text>
            </View>
          )}

          <LocationSearch
            placeholder={t('pickupLocation')}
            value={pickup}
            onChange={setPickup}
            userLocation={userLocation}
            dotColor={colors.success}
            rightElement={
              <TouchableOpacity onPress={handleUseMyLocation} style={styles.locateBtn} disabled={locating}>
                {locating ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="locate" size={18} color={colors.primary} />}
              </TouchableOpacity>
            }
          />
          <View style={styles.divider} />
          <LocationSearch
            placeholder={t('destination')}
            value={destination}
            onChange={setDestination}
            userLocation={userLocation}
            dotColor={colors.primary}
          />

          {calcStatus === 'loading' && (
            <View style={styles.statusRow}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.statusText}>  {t('calculatingRoute')}</Text></View>
          )}
          {calcStatus === 'error' && (
            <View style={styles.statusRow}><Ionicons name="alert-circle" size={16} color={colors.error} /><Text style={[styles.statusText, { color: colors.error }]}>  {t('routeError')}</Text></View>
          )}

          {routeInfo && (
            <View style={styles.priceRow}>
              <View>
                <Text style={styles.priceLabel}>{t('estimatedFare')}</Text>
                {isFirstRide && <Text style={styles.strikeFare}>{baseFare} EGP</Text>}
                <Text style={styles.fare}>{finalFare} EGP</Text>
                {cardFee > 0 && <Text style={styles.cardFeeNote}>incl. {cardFee} EGP card fee (3%)</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.priceLabel}>{routeInfo.distanceKm} km driving</Text>
                <Text style={styles.rateText}>~{routeInfo.durationMins} min · {getTimePeriodLabel()}</Text>
              </View>
            </View>
          )}

          <Text style={styles.sectionLabel}>{t('paymentMethodLabel')}</Text>
          <View style={styles.paymentRow}>
            {PAYMENT_IDS.map(({ id, label }) => {
              const isActive = paymentMethod === id || paymentMethod.startsWith(id + '+') || (id === 'wallet' && paymentMethod.startsWith('wallet'));
              const isWalletEmpty = id === 'wallet' && walletBalance <= 0;
              const title = id === 'cash' ? t('cash') : id === 'card' ? t('card') : t('wallet');
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.payBtn, isActive && styles.payBtnActive, isWalletEmpty && styles.payBtnDisabled]}
                  onPress={() => {
                    if (isWalletEmpty) { Alert.alert(t('insufficientWallet'), t('insufficientWalletMsg')); return; }
                    setPaymentMethod(id);
                  }}
                >
                  <Text style={styles.payEmoji}>{label}</Text>
                  <Text style={[styles.payTitle, isActive && styles.payTitleActive]}>
                    {id === 'wallet' ? `${title}\n${walletBalance} EGP` : title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {paymentMethod.startsWith('wallet') && walletShortfall > 0 && routeInfo && (
            <View style={styles.shortfallBox}>
              <Text style={styles.shortfallTitle}>⚠️ {t('walletShortNote')} {walletShortfall} EGP</Text>
              <Text style={styles.shortfallSub}>{walletAmountPaid} EGP {t('walletSplitNote')} {walletShortfall} EGP:</Text>
              <View style={styles.splitRow}>
                <TouchableOpacity
                  style={[styles.splitBtn, paymentMethod === 'wallet+cash' && styles.splitBtnActive, !walletCashEligible && styles.splitBtnDisabled]}
                  onPress={() => { if (!walletCashEligible) { Alert.alert(t('insufficientWallet'), t('walletNotEnoughForSplit')); return; } setPaymentMethod('wallet+cash'); }}
                >
                  <Text style={styles.splitEmoji}>💵</Text>
                  <Text style={[styles.splitLabel, paymentMethod === 'wallet+cash' && styles.splitLabelActive]}>{t('cash')}{'\n'}{walletShortfall} EGP</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.splitBtn, paymentMethod === 'wallet+card' && styles.splitBtnActive]} onPress={() => setPaymentMethod('wallet+card')}>
                  <Text style={styles.splitEmoji}>💳</Text>
                  <Text style={[styles.splitLabel, paymentMethod === 'wallet+card' && styles.splitLabelActive]}>{t('card')}{'\n'}{cardSplitShortfall} EGP{'\n'}(+3% fee)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {paymentMethod === 'card' && (
            <View style={styles.savedCardBox}>
              {defaultCard ? (
                <View style={styles.savedCardRow}>
                  <Ionicons name="card" size={20} color={colors.primary} />
                  <Text style={styles.savedCardLabel}>{defaultCard.cardType}  ••••  {defaultCard.lastFour}{'   '}<Text style={styles.savedCardExpiry}>Exp {defaultCard.expiry}</Text></Text>
                  <TouchableOpacity onPress={() => setCardModalVisible(true)}>
                    <Text style={styles.changeCardText}>{t('change')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.addCardPrompt} onPress={() => setCardModalVisible(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={styles.addCardPromptText}>{t('addCardPrompt')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TextInput
            style={styles.pickupNoteInput}
            placeholder={t('pickupNotePlaceholder') || 'Additional pickup info (e.g. near the bus station)'}
            placeholderTextColor={colors.gray}
            value={pickupNote}
            onChangeText={setPickupNote}
            maxLength={100}
          />

          <AnimatedPressable
            style={[styles.requestBtn, (!canRequest || booking) && styles.requestBtnDisabled]}
            onPress={handleRequest}
            disabled={!canRequest || booking}
          >
            {booking
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="car" size={20} color="#fff" /><Text style={styles.requestBtnText}>  {t('requestRide')}</Text></>
            }
          </AnimatedPressable>
          {!!bookError && <Text style={styles.bookError}>{bookError}</Text>}
        </View>
      </ScrollView>

      {/* Bidding overlay — LAST child so it sits on top of every sibling in the DOM.
          pointerEvents="auto" on every wrapper so RNW never inherits pointer-events:none. */}
      {bidding && (
        <View
          pointerEvents="auto"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.primaryBg, zIndex: 99999, elevation: 99999 }]}
        >
          <SafeAreaView pointerEvents="auto" style={{ flex: 1 }}>
            <View pointerEvents="auto" style={styles.biddingWrap}>
              <Text style={styles.biddingTitle}>{t('choosingDriver')}</Text>
              <Text style={styles.biddingSubtitle}>{t('choosingDriverSub')}</Text>

              <View style={styles.bidTripCard}>
                <Text style={styles.bidTripFrom}>📍 {biddingRide?.from || pickup?.address}</Text>
                <Text style={styles.bidTripTo}>🎯 {biddingRide?.to || destination?.address}</Text>
                <Text style={styles.bidTripFare}>{biddingRide?.estimatedFare || displayFare} EGP</Text>
              </View>

              <FlatList
                data={bidDrivers}
                extraData={tickCounter}
                keyExtractor={bid => bid.driverId}
                style={styles.driversList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                renderItem={({ item: bid }) => {
                  const secsLeft = Math.max(0, Math.ceil((bid.expiresAt - Date.now()) / 1000));
                  const pct = secsLeft / 15;
                  const timerColor = secsLeft > 10 ? colors.success : secsLeft > 5 ? '#F59E0B' : '#EF4444';
                  return (
                    <DriverOfferCard
                      bid={bid}
                      pickupLat={biddingRide?.fromLat ?? pickup?.lat}
                      pickupLng={biddingRide?.fromLng ?? pickup?.lng}
                      onSelect={handleSelectDriver}
                      secsLeft={secsLeft}
                      timerColor={timerColor}
                      pct={pct}
                      acceptingBid={acceptingBid}
                    />
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.noBidsWrap}>
                    <ActivityIndicator color={colors.primary} style={{ marginBottom: 12 }} />
                    <Text style={styles.noBidsText}>{t('waitingDriversBid')}</Text>
                  </View>
                }
              />

              <TouchableOpacity style={styles.cancelBidBtn} onPress={handleCancel}>
                <Text style={styles.cancelBidText}>{t('cancelSearch')}</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primaryBg },
    scroll: { padding: 20, paddingBottom: 40 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    greeting: { fontSize: 22, fontWeight: '800', color: colors.dark },
    greetingSub: { fontSize: 13, color: colors.gray, marginTop: 2 },
    walletPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, ...shadow.sm },
    walletText: { fontSize: 13, fontWeight: '700', color: colors.primary },
    mapWrap: { marginBottom: 16 },
    modeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    modeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
    modeBtnPickup: { borderColor: colors.success, backgroundColor: colors.success + '22' },
    modeBtnDest: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    modeBtnText: { fontSize: 13, fontWeight: '600', color: colors.dark },
    mapHint: { fontSize: 11, color: colors.gray, textAlign: 'center', marginTop: 4 },
    card: { backgroundColor: colors.white, borderRadius: 20, padding: 20, ...shadow.md },
    firstRideBanner: { backgroundColor: '#FFF8E7', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.gold },
    firstRideText: { color: '#92600A', fontSize: 13, fontWeight: '600', textAlign: 'center' },
    divider: { height: 1, backgroundColor: colors.border, marginLeft: 24 },
    locateBtn: { padding: 6, marginStart: 4 },
    pickupNoteInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.dark, marginTop: 12, marginBottom: 4 },
    statusRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.lightGray, borderRadius: 10, padding: 10, marginTop: 8 },
    statusText: { fontSize: 13, color: colors.gray },
    priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', backgroundColor: colors.primaryBg, borderRadius: 12, padding: 14, marginTop: 12 },
    priceLabel: { fontSize: 11, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.5 },
    strikeFare: { fontSize: 14, color: colors.gray, textDecorationLine: 'line-through' },
    fare: { fontSize: 24, fontWeight: '800', color: colors.primary },
    cardFeeNote: { fontSize: 11, color: colors.gray, marginTop: 2 },
    rateText: { fontSize: 12, color: colors.dark, fontWeight: '600', textAlign: 'right' },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 10 },
    paymentRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    payBtn: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.lightGray },
    payBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    payBtnDisabled: { opacity: 0.4 },
    payEmoji: { fontSize: 20, marginBottom: 4 },
    payTitle: { fontSize: 11, color: colors.gray, textAlign: 'center' },
    payTitleActive: { color: colors.primary, fontWeight: '700' },
    shortfallBox: { backgroundColor: '#FFF8E7', borderRadius: 12, padding: 14, marginBottom: 4, borderWidth: 1, borderColor: '#F0C040' },
    shortfallTitle: { fontSize: 13, fontWeight: '700', color: '#92600A', marginBottom: 4 },
    shortfallSub: { fontSize: 12, color: '#92600A', marginBottom: 10 },
    splitRow: { flexDirection: 'row', gap: 8 },
    splitBtn: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#E0C070', backgroundColor: '#FFFBF0' },
    splitBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    splitBtnDisabled: { opacity: 0.4 },
    splitEmoji: { fontSize: 18, marginBottom: 3 },
    splitLabel: { fontSize: 11, color: colors.gray, textAlign: 'center' },
    splitLabelActive: { color: colors.primary, fontWeight: '700' },
    savedCardBox: { backgroundColor: colors.primaryBg, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.primary + '40' },
    savedCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    savedCardLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.dark },
    savedCardExpiry: { fontSize: 12, fontWeight: '400', color: colors.gray },
    changeCardText: { fontSize: 13, color: colors.primary, fontWeight: '700' },
    addCardPrompt: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 4 },
    addCardPromptText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
    requestBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    requestBtnDisabled: { opacity: 0.4 },
    requestBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    bookError: { fontSize: 13, color: colors.error, textAlign: 'center', marginTop: 10, lineHeight: 18 },
    searchingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    searchTitle: { fontSize: 24, fontWeight: '800', color: colors.dark, marginBottom: 8, textAlign: 'center' },
    searchSub: { fontSize: 14, color: colors.gray, textAlign: 'center', marginBottom: 28 },
    searchCard: { backgroundColor: colors.white, borderRadius: 16, padding: 20, width: '100%', marginBottom: 32, ...shadow.md },
    pulseWrap: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
    pulseRing: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: colors.primary },
    pulseCore: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: colors.primary },
    searchRoute: { fontSize: 16, color: colors.dark, marginBottom: 6 },
    searchMeta: { fontSize: 13, color: colors.gray, marginTop: 4 },
    searchFare: { fontSize: 22, fontWeight: '800', color: colors.primary, marginTop: 8 },
    cancelBtn: { paddingVertical: 12, paddingHorizontal: 32 },
    cancelText: { color: colors.error, fontSize: 16, fontWeight: '600' },
    biddingWrap: { flex: 1, padding: 20 },
    biddingTitle: { fontSize: 22, fontWeight: '800', color: colors.dark, textAlign: 'center', marginTop: 12 },
    biddingSubtitle: { fontSize: 13, color: colors.gray, textAlign: 'center', marginBottom: 16 },
    bidTripCard: { backgroundColor: colors.white, borderRadius: 14, padding: 14, marginBottom: 16, ...shadow.sm },
    bidTripFrom: { fontSize: 14, color: colors.dark, marginBottom: 4 },
    bidTripTo: { fontSize: 14, color: colors.primary, marginBottom: 8 },
    bidTripFare: { fontSize: 20, fontWeight: '800', color: colors.dark },
    noBidsWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    noBidsText: { fontSize: 14, color: colors.gray, textAlign: 'center' },
    driversList: { flex: 1, marginBottom: 8 },
    driverBidCard: { backgroundColor: colors.white, borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...shadow.sm },
    driverBidLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    driverBidAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.lightGray, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
    driverBidAvatarImg: { width: 52, height: 52, borderRadius: 26 },
    driverBidInfo: { flex: 1 },
    driverBidName: { fontSize: 15, fontWeight: '700', color: colors.dark },
    driverBidCar: { fontSize: 12, color: colors.gray, marginTop: 2 },
    driverBidStats: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    driverBidStat: { fontSize: 12, color: colors.dark },
    selectBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
    selectBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    cancelBidBtn: { alignItems: 'center', paddingVertical: 14 },
    cancelBidText: { color: colors.error, fontSize: 15, fontWeight: '600' },
    etaLoading: { fontSize: 11, color: colors.gray, marginTop: 4, fontStyle: 'italic' },
    etaWarn:    { fontSize: 11, color: colors.gray, marginTop: 4 },
    etaPill:    { backgroundColor: colors.success + '18', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, marginTop: 5, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.success + '55' },
    etaText:    { fontSize: 12, fontWeight: '700', color: colors.success },
    timerTrack: { height: 3, backgroundColor: colors.lightGray, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
    timerFill:  { height: 3, borderRadius: 2 },
    timerSecs:  { fontSize: 11, fontWeight: '700', marginTop: 3 },
  });
}
