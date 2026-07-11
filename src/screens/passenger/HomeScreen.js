import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Alert, ActivityIndicator, TextInput, Image,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, addDoc, query, where, onSnapshot,
  serverTimestamp, doc, updateDoc, arrayUnion, getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { calculateFare, applyFirstRideDiscount, getTimePeriodLabel } from '../../utils/pricing';
import { getDrivingRoute } from '../../utils/routing';
import { useTheme } from '../../context/SettingsContext';
import LeafletMap from '../../components/LeafletMap';
import LocationSearch from '../../components/LocationSearch';
import CardInputModal from '../../components/CardInputModal';
import AnimatedPressable from '../../components/AnimatedPressable';
import CoachingBanner from '../../components/CoachingBanner';

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
  const [countdownSecs, setCountdownSecs] = useState(null);
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [activeRideId, setActiveRideId] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [pickupNote, setPickupNote] = useState('');
  const mapRef = useRef(null);
  const countdownRef = useRef(null);
  const countdownStartedRef = useRef(false);
  const handleTimeoutRef = useRef(null);
  // Searching pulse animation
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;
  // Countdown urgency pulse
  const countdownScale = useRef(new Animated.Value(1)).current;

  const isFirstRide = (userProfile?.totalTrips ?? 0) === 0;
  const baseFare = routeInfo ? calculateFare(routeInfo.distanceKm) : 0;
  const displayFare = isFirstRide ? applyFirstRideDiscount(baseFare) : baseFare;
  const CARD_FEE_PCT = 3;
  const walletBalance = userProfile?.wallet || 0;
  const savedCards = userProfile?.savedCards || [];
  const defaultCard = savedCards[0] || null;

  // Platform commission — wallet+cash is only offered when wallet covers at least this much,
  // so the driver always receives exactly driverAmount in cash (no post-trip wallet debit).
  const adminAmount = routeInfo ? Math.round(displayFare * COMMISSION_RATE * 100) / 100 : 0;
  const walletCashEligible = walletBalance >= adminAmount && walletBalance < displayFare;

  // Wallet pays up to its balance for wallet-based methods (applied against base fare, no card fee yet)
  const walletAmountPaid = paymentMethod.startsWith('wallet') && routeInfo
    ? Math.min(walletBalance, displayFare)
    : 0;

  // Card fee: for pure 'card' → 3% of full fare; for 'wallet+card' → 3% of card portion ONLY
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
  // remainingAmount is what the passenger pays by cash or card (after wallet deduction)
  const remainingAmount = routeInfo ? finalFare - walletAmountPaid : 0;

  // Shortfall UI: triggers when wallet can't cover the base fare
  const walletShortfall = routeInfo ? Math.max(0, displayFare - walletBalance) : 0;
  // Card split button label: 3% fee on the card-only portion (= walletShortfall)
  const cardSplitShortfall = routeInfo ? Math.round(walletShortfall * (1 + CARD_FEE_PCT / 100)) : 0;

  useEffect(() => {
    if (!navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng });
        // Seed the Leaflet iframe so the recenter button has a position from the start
        mapRef.current?.setCurrentPos(lat, lng);
      },
      null,
      { timeout: 6000, maximumAge: 60000, enableHighAccuracy: false }
    );
  }, []);

  useEffect(() => {
    if (!pickup?.lat || !destination?.lat) {
      setRouteInfo(null);
      setCalcStatus('');
      mapRef.current?.clearRoute();
      return;
    }
    setCalcStatus('loading');
    getDrivingRoute(pickup.lat, pickup.lng, destination.lat, destination.lng)
      .then((info) => {
        setRouteInfo(info);
        setCalcStatus('done');
        mapRef.current?.showRoute(pickup.lat, pickup.lng, destination.lat, destination.lng);
      })
      .catch(() => { setCalcStatus('error'); setRouteInfo(null); });
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng]);

  useEffect(() => {
    if (pickup?.lat) {
      mapRef.current?.setMarker('pickup', pickup.lat, pickup.lng, 'pickup', 'Pickup');
      mapRef.current?.setView(pickup.lat, pickup.lng, 14);
    } else {
      mapRef.current?.removeMarker('pickup');
    }
  }, [pickup?.lat, pickup?.lng]);

  useEffect(() => {
    if (destination?.lat) {
      mapRef.current?.setMarker('dest', destination.lat, destination.lng, 'dest', 'Destination');
    } else {
      mapRef.current?.removeMarker('dest');
    }
    if (pickup?.lat && destination?.lat) mapRef.current?.fit();
  }, [destination?.lat, destination?.lng]);

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'driver'),
      where('isOnline', '==', true)
    );
    return onSnapshot(q, (snap) => {
      const cars = snap.docs
        .filter(d => d.data().currentLat && d.data().currentLng)
        .map(d => ({ id: d.id, lat: d.data().currentLat, lng: d.data().currentLng, name: d.data().name }));
      mapRef.current?.setCars(cars);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'rides'),
      where('passengerId', '==', user.uid),
      where('status', 'in', ['searching', 'bidding', 'accepted', 'arrived', 'in_progress'])
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const ride = { id: snap.docs[0].id, ...snap.docs[0].data() };
        if (ride.status === 'searching') {
          setSearching(true);
          setBidding(false);
          setBiddingRide(null);
          setActiveRideId(ride.id);
          setSearchingRide(ride);
        } else if (ride.status === 'bidding') {
          setSearching(false);
          setBidding(true);
          setBiddingRide(ride);
          setActiveRideId(ride.id);
          setSearchingRide(null);
        } else {
          setSearching(false);
          setBidding(false);
          setBiddingRide(null);
          setSearchingRide(null);
          navigation.navigate('ActiveRide', { rideId: ride.id });
        }
      } else {
        setSearching(false);
        setBidding(false);
        setBiddingRide(null);
        setSearchingRide(null);
        setActiveRideId(null);
      }
    });
  }, [user]);

  // Bids subcollection listener (active only while bidding)
  useEffect(() => {
    if (!bidding || !activeRideId) {
      setBidDrivers([]);
      return;
    }
    const bidsRef = collection(db, 'rides', activeRideId, 'bids');
    return onSnapshot(bidsRef, (snap) => {
      const pending = snap.docs
        .map(d => ({ driverId: d.id, ...d.data() }))
        .filter(b => b.status === 'pending')
        .sort((a, b) => (a.biddedAt?.toMillis?.() ?? 0) - (b.biddedAt?.toMillis?.() ?? 0));
      setBidDrivers(pending);
      if (pending.length > 0 && !countdownStartedRef.current) {
        countdownStartedRef.current = true;
        let secs = 20;
        setCountdownSecs(20);
        countdownRef.current = setInterval(() => {
          secs--;
          setCountdownSecs(secs);
          if (secs <= 0) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
            handleTimeoutRef.current?.();
          }
        }, 1000);
      }
    });
  }, [bidding, activeRideId]);

  // Pulsing rings animation while searching for a driver
  useEffect(() => {
    if (!searching) {
      pulse1.setValue(0); pulse2.setValue(0); pulse3.setValue(0);
      return;
    }
    const makeRing = (val, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(val, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    const a = makeRing(pulse1, 0);
    const b = makeRing(pulse2, 600);
    const c = makeRing(pulse3, 1200);
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, [searching]);

  // Countdown urgency pulse when ≤ 5 seconds remain
  useEffect(() => {
    if (countdownSecs === null || countdownSecs > 5) {
      countdownScale.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(countdownScale, { toValue: 1.12, duration: 280, useNativeDriver: true }),
        Animated.timing(countdownScale, { toValue: 1, duration: 280, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => { pulse.stop(); countdownScale.setValue(1); };
  }, [countdownSecs !== null && countdownSecs <= 5]);

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

    // Chrome blocks geolocation on non-localhost HTTP — warn user and stop
    if (isHttpOverLan) {
      Alert.alert(
        'Location Blocked',
        'Chrome requires HTTPS to access location on a phone.\n\n• Open Chrome on your phone → go to chrome://flags/#unsafely-treat-insecure-origin-as-secure → add http://' + window.location.host + ' → Enable → Relaunch\n\nOr ask your developer to start the server with --tunnel for HTTPS.'
      );
      return;
    }

    // Immediately use cached location if we have it (near-instant UX)
    if (userLocation) {
      reverseGeocode(userLocation.lat, userLocation.lng).then((address) => {
        setPickup({ address, lat: userLocation.lat, lng: userLocation.lng });
        mapRef.current?.setView(userLocation.lat, userLocation.lng, 15);
        mapRef.current?.setCurrentPos(userLocation.lat, userLocation.lng);
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
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (!userLocation) {
          Alert.alert(
            t('error'),
            err.code === 1
              ? 'Please allow location access in your browser settings.'
              : 'Could not determine your location. Please try again.'
          );
        }
      },
      { timeout: 5000, maximumAge: 30000, enableHighAccuracy: false }
    );
  };

  const handleRecenter = useCallback(() => {
    // Use cached location immediately — no waiting for GPS
    if (userLocation) {
      mapRef.current?.setCurrentPos(userLocation.lat, userLocation.lng);
      mapRef.current?.setView(userLocation.lat, userLocation.lng, 15);
      return; // cached location is good enough; don't call GPS on phone (blocked on HTTP)
    }
    if (!navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLocation({ lat, lng });
        mapRef.current?.setCurrentPos(lat, lng);
        mapRef.current?.setView(lat, lng, 15);
      },
      null,
      { timeout: 5000, maximumAge: 30000, enableHighAccuracy: false }
    );
  }, [userLocation]);

  const doBook = async () => {
    try {
      const rideRef = await addDoc(collection(db, 'rides'), {
        passengerId: user.uid, passengerName: userProfile.name,
        passengerPhone: userProfile.phone ?? '',
        passengerPhotoUrl: userProfile.photoUrl ?? '',
        from: pickup.address, to: destination.address,
        fromLat: pickup.lat, fromLon: pickup.lng,
        toLat: destination.lat, toLon: destination.lng,
        distanceKm: routeInfo.distanceKm, durationMins: routeInfo.durationMins,
        estimatedFare: finalFare, baseFare: displayFare, cardFee,
        paymentMethod,
        walletAmountPaid: paymentMethod.startsWith('wallet') ? walletAmountPaid : 0,
        remainingAmount: paymentMethod.startsWith('wallet+') ? remainingAmount : 0,
        pickupNote: pickupNote.trim(),
        isFirstRide, status: 'searching', createdAt: serverTimestamp(),
      });
      supabase.from('rides').insert({
        id: rideRef.id,
        passenger_id: user.uid,
        from_address: pickup.address,
        to_address: destination.address,
        distance_km: routeInfo.distanceKm,
        duration_mins: routeInfo.durationMins,
        estimated_fare: finalFare,
        base_fare: displayFare,
        card_fee: cardFee,
        payment_method: paymentMethod,
        status: 'searching',
        is_first_ride: isFirstRide,
      }).then(() => {});
    } catch (err) { Alert.alert('Error', err.message); }
  };

  const handleRequest = () => {
    if (!pickup || !destination) { Alert.alert(t('missingInfo'), t('missingInfoMsg')); return; }
    if (!routeInfo) { Alert.alert(t('loading'), 'Please wait for the route to be calculated.'); return; }
    if (paymentMethod === 'wallet' && walletBalance < displayFare) {
      Alert.alert(t('insufficientWallet'), t('insufficientWalletMsg'));
      return;
    }
    if (paymentMethod === 'wallet+cash') {
      // Show breakdown before booking so passenger knows exactly how much cash to prepare
      Alert.alert(
        t('confirmSplitPayment'),
        `${t('walletCharged').trim()}: ${walletAmountPaid} ${t('egp')}\n${t('cashToDriver').trim()}: ${remainingAmount} ${t('egp')}\n\n${t('totalFare')}: ${finalFare} ${t('egp')}`,
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('confirm'), onPress: doBook },
        ]
      );
      return;
    }
    doBook();
  };

  const handleSaveCard = async (cardData) => {
    await updateDoc(doc(db, 'users', user.uid), { savedCards: arrayUnion(cardData) });
  };

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    countdownStartedRef.current = false;
    setCountdownSecs(null);
  }, []);

  const handleTimeoutOrReject = useCallback(async () => {
    stopCountdown();
    const rideId = activeRideId;
    setBidding(false);
    setBiddingRide(null);
    setBidDrivers([]);
    if (!rideId) return;
    try {
      const bidsSnap = await getDocs(collection(db, 'rides', rideId, 'bids'));
      await Promise.all(bidsSnap.docs.map(d => updateDoc(d.ref, { status: 'rejected' })));
      await updateDoc(doc(db, 'rides', rideId), { status: 'searching' });
    } catch (_) {}
  }, [activeRideId, stopCountdown]);

  // Keep ref current so countdown interval can call it without stale closure
  handleTimeoutRef.current = handleTimeoutOrReject;

  const handleSelectDriver = useCallback(async (bid) => {
    stopCountdown();
    const rideId = activeRideId;
    setBidding(false);
    setBiddingRide(null);
    setBidDrivers([]);
    if (!rideId) return;
    try {
      await updateDoc(doc(db, 'rides', rideId), {
        status: 'accepted',
        driverId: bid.driverId,
        driverName: bid.driverName,
        driverPhotoUrl: bid.driverPhoto ?? '',
        driverRating: bid.driverRating ?? 0,
        driverTotalTrips: bid.driverTotalTrips ?? 0,
        driverCar: bid.driverCar ?? '',
        driverPlate: bid.driverPlate ?? '',
        driverPhone: bid.driverPhone ?? '',
        acceptedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'rides', rideId, 'bids', bid.driverId), { status: 'accepted' });
      const bidsSnap = await getDocs(collection(db, 'rides', rideId, 'bids'));
      await Promise.all(
        bidsSnap.docs
          .filter(d => d.id !== bid.driverId)
          .map(d => updateDoc(d.ref, { status: 'rejected' }))
      );
    } catch (err) {
      Alert.alert(t('error'), err.message);
    }
  }, [activeRideId, stopCountdown, t]);

  const handleCancel = async () => {
    stopCountdown();
    if (activeRideId) {
      try { await updateDoc(doc(db, 'rides', activeRideId), { status: 'cancelled' }); } catch (_) {}
    }
    setSearching(false);
    setBidding(false);
    setBiddingRide(null);
    setBidDrivers([]);
    setActiveRideId(null);
  };

  if (bidding) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.biddingWrap}>
          <Text style={styles.biddingTitle}>{t('choosingDriver')}</Text>
          <Text style={styles.biddingSubtitle}>{t('choosingDriverSub')}</Text>

          {countdownSecs !== null && (() => {
            const cdColor = countdownSecs > 10 ? colors.primary : countdownSecs > 5 ? '#F59E0B' : '#EF4444';
            return (
              <Animated.View style={[styles.countdownCircle, { backgroundColor: cdColor, transform: [{ scale: countdownScale }] }]}>
                <Text style={styles.countdownNum}>{countdownSecs}</Text>
                <Text style={styles.countdownLabel}>s</Text>
              </Animated.View>
            );
          })()}

          <View style={styles.bidTripCard}>
            <Text style={styles.bidTripFrom}>📍 {biddingRide?.from || pickup?.address}</Text>
            <Text style={styles.bidTripTo}>🎯 {biddingRide?.to || destination?.address}</Text>
            <Text style={styles.bidTripFare}>{biddingRide?.estimatedFare || displayFare} EGP</Text>
          </View>

          {bidDrivers.length === 0 ? (
            <View style={styles.noBidsWrap}>
              <ActivityIndicator color={colors.primary} style={{ marginBottom: 12 }} />
              <Text style={styles.noBidsText}>{t('waitingDriversBid')}</Text>
            </View>
          ) : (
            <ScrollView style={styles.driversList} showsVerticalScrollIndicator={false}>
              {bidDrivers.map((bid) => (
                <View key={bid.driverId} style={styles.driverBidCard}>
                  <View style={styles.driverBidLeft}>
                    <View style={styles.driverBidAvatar}>
                      {bid.driverPhoto ? (
                        <Image source={{ uri: bid.driverPhoto }} style={styles.driverBidAvatarImg} />
                      ) : (
                        <Text style={{ fontSize: 26 }}>👩</Text>
                      )}
                    </View>
                    <View style={styles.driverBidInfo}>
                      <Text style={styles.driverBidName}>{bid.driverName}</Text>
                      <Text style={styles.driverBidCar}>{bid.driverCar}</Text>
                      <View style={styles.driverBidStats}>
                        <Text style={styles.driverBidStat}>⭐ {bid.driverRating?.toFixed(1) ?? '—'}</Text>
                        <Text style={[styles.driverBidStat, { marginLeft: 8 }]}>🚗 {bid.driverTotalTrips ?? 0}</Text>
                        {bid.eta != null && (
                          <Text style={[styles.driverBidStat, { marginLeft: 8, color: colors.primary }]}>{bid.eta} min</Text>
                        )}
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.selectBtn} onPress={() => handleSelectDriver(bid)}>
                    <Text style={styles.selectBtnText}>{t('selectDriver')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.cancelBidBtn} onPress={handleCancel}>
            <Text style={styles.cancelBidText}>{t('cancelSearch')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
            <View style={styles.pulseCore}>
              <Text style={{ fontSize: 34 }}>🚗</Text>
            </View>
          </View>
          <Text style={styles.searchTitle}>{t('findingDriver')}</Text>
          <Text style={styles.searchSub}>{t('connectingDriver')}</Text>
          <View style={styles.searchCard}>
            <Text style={styles.searchRoute}>📍 {searchingRide?.from || pickup?.address}</Text>
            <Text style={[styles.searchRoute, { color: colors.primary }]}>🎯 {searchingRide?.to || destination?.address}</Text>
            {(searchingRide || routeInfo) && (
              <Text style={styles.searchMeta}>
                {searchingRide?.distanceKm || routeInfo?.distanceKm} km · ~{searchingRide?.durationMins || routeInfo?.durationMins} min
              </Text>
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
          <LeafletMap ref={mapRef} zoom={12} height={270} onMapClick={handleMapClick} onRecenter={handleRecenter} />
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, mapMode === 'pickup' && styles.modeBtnPickup]}
              onPress={() => setMapMode('pickup')}
            >
              <Text style={styles.modeBtnText}>🟢 {t('setPickup')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mapMode === 'dest' && styles.modeBtnDest]}
              onPress={() => setMapMode('dest')}
            >
              <Text style={styles.modeBtnText}>🎯 {t('setDest')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.mapHint}>
            {mapMode === 'pickup' ? t('tapSetsPickup') : t('tapSetsDest')}
          </Text>
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
                {locating
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Ionicons name="locate" size={18} color={colors.primary} />
                }
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
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>  {t('calculatingRoute')}</Text>
            </View>
          )}
          {calcStatus === 'error' && (
            <View style={styles.statusRow}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={[styles.statusText, { color: colors.error }]}>  {t('routeError')}</Text>
            </View>
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
              <Text style={styles.shortfallSub}>
                {walletAmountPaid} EGP {t('walletSplitNote')} {walletShortfall} EGP:
              </Text>
              <View style={styles.splitRow}>
                <TouchableOpacity
                  style={[styles.splitBtn, paymentMethod === 'wallet+cash' && styles.splitBtnActive, !walletCashEligible && styles.splitBtnDisabled]}
                  onPress={() => {
                    if (!walletCashEligible) {
                      Alert.alert(t('insufficientWallet'), t('walletNotEnoughForSplit'));
                      return;
                    }
                    setPaymentMethod('wallet+cash');
                  }}
                >
                  <Text style={styles.splitEmoji}>💵</Text>
                  <Text style={[styles.splitLabel, paymentMethod === 'wallet+cash' && styles.splitLabelActive]}>
                    {t('cash')}{'\n'}{walletShortfall} EGP
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.splitBtn, paymentMethod === 'wallet+card' && styles.splitBtnActive]}
                  onPress={() => setPaymentMethod('wallet+card')}
                >
                  <Text style={styles.splitEmoji}>💳</Text>
                  <Text style={[styles.splitLabel, paymentMethod === 'wallet+card' && styles.splitLabelActive]}>
                    {t('card')}{'\n'}{cardSplitShortfall} EGP{'\n'}(+3% fee)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {paymentMethod === 'card' && (
            <View style={styles.savedCardBox}>
              {defaultCard ? (
                <View style={styles.savedCardRow}>
                  <Ionicons name="card" size={20} color={colors.primary} />
                  <Text style={styles.savedCardLabel}>
                    {defaultCard.cardType}  ••••  {defaultCard.lastFour}
                    {'   '}<Text style={styles.savedCardExpiry}>Exp {defaultCard.expiry}</Text>
                  </Text>
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
            style={[styles.requestBtn, !canRequest && styles.requestBtnDisabled]}
            onPress={handleRequest}
            disabled={!canRequest}
          >
            <Ionicons name="car" size={20} color="#fff" />
            <Text style={styles.requestBtnText}>  {t('requestRide')}</Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
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
    searchingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    searchTitle: { fontSize: 24, fontWeight: '800', color: colors.dark, marginBottom: 8, textAlign: 'center' },
    searchSub: { fontSize: 14, color: colors.gray, textAlign: 'center', marginBottom: 28 },
    searchCard: { backgroundColor: colors.white, borderRadius: 16, padding: 20, width: '100%', marginBottom: 32, ...shadow.md },
    // Pulse ring animation
    pulseWrap: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
    pulseRing: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: colors.primary },
    pulseCore: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: colors.primary },
    searchRoute: { fontSize: 16, color: colors.dark, marginBottom: 6 },
    searchMeta: { fontSize: 13, color: colors.gray, marginTop: 4 },
    searchFare: { fontSize: 22, fontWeight: '800', color: colors.primary, marginTop: 8 },
    cancelBtn: { paddingVertical: 12, paddingHorizontal: 32 },
    cancelText: { color: colors.error, fontSize: 16, fontWeight: '600' },
    // Bidding
    biddingWrap: { flex: 1, padding: 20 },
    biddingTitle: { fontSize: 22, fontWeight: '800', color: colors.dark, textAlign: 'center', marginTop: 12 },
    biddingSubtitle: { fontSize: 13, color: colors.gray, textAlign: 'center', marginBottom: 16 },
    countdownCircle: { alignSelf: 'center', width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    countdownNum: { fontSize: 28, fontWeight: '900', color: '#fff', lineHeight: 32 },
    countdownLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
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
  });
}
