import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Modal, ScrollView, Alert, Animated, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { toRide } from '../../lib/transforms';
import { splitFare, CASH_DEBT_LIMIT } from '../../utils/pricing';
import { useAuth } from '../../context/AuthContext';
import { getDrivingRoute } from '../../utils/routing';
import * as Location from 'expo-location';
import { useTheme } from '../../context/SettingsContext';
import LeafletMap from '../../components/LeafletMap';
import AnimatedPressable from '../../components/AnimatedPressable';

export default function DriverHomeScreen({ navigation }) {
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [isOnline, setIsOnline] = useState(userProfile?.isOnline || false);
  const [incomingRide, setIncomingRide] = useState(null);
  const [bidPlaced, setBidPlaced] = useState(false);
  const [bidRideId, setBidRideId] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [pickupRoute, setPickupRoute] = useState(null);
  const [bidError, setBidError] = useState('');
  const [bidRejectedMsg, setBidRejectedMsg] = useState('');
  const [recentTrips, setRecentTrips] = useState([]);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [otherDrivers, setOtherDrivers] = useState([]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mapRef = useRef(null);
  const incomingRideRef = useRef(null);
  const lastLocUpdateRef = useRef(0);
  // Set true when a bid is accepted so the next driver-searching subscription cycle
  // doesn't immediately show a stale ride modal on top of the ActiveTrip screen.
  const justAcceptedRef = useRef(false);

  // Online indicator pulse animation
  useEffect(() => {
    if (isOnline) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isOnline]);

  // Get GPS on mount and place the initial "me" marker
  useEffect(() => {
    (async () => {
      try {
        const { status: fg } = await Location.requestForegroundPermissionsAsync();
        if (fg !== 'granted') return;

        // Request background permission so the OS keeps GPS alive when the app
        // is minimised mid-trip. Non-blocking — the app works on foreground-only.
        Location.requestBackgroundPermissionsAsync().catch(() => {});

        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, precise: true };
        setDriverLocation(loc);
        mapRef.current?.setView(loc.lat, loc.lng, 15);
        mapRef.current?.setMarker('me', loc.lat, loc.lng, 'me', 'You');
        mapRef.current?.setCurrentPos(loc.lat, loc.lng);
        // Seed profiles on first fix so bid payloads carry coords before watchPosition fires.
        if (user) supabase.from('profiles').update({ current_lat: loc.lat, current_lng: loc.lng }).eq('id', user.uid).catch(() => {});
      } catch {}
    })();
  }, []);

  // Continuous GPS tracking while online.
  // Uses polling (getCurrentPositionAsync + setInterval) instead of watchPositionAsync
  // because watchPositionAsync's subscription.remove() internally calls the removed
  // LocationEventEmitter.removeSubscription API in expo-location SDK 54, causing a
  // fatal crash. Polling sidesteps the subscription lifecycle entirely.
  useEffect(() => {
    if (!isOnline || !user) return;
    let timer = null;
    let mounted = true;
    let firstFix = true;

    const poll = async () => {
      if (!mounted) return;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (!mounted) return;
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDriverLocation(loc);
        mapRef.current?.setMarker('me', loc.lat, loc.lng, 'me', 'You');
        mapRef.current?.setCurrentPos(loc.lat, loc.lng);
        if (firstFix) {
          firstFix = false;
          mapRef.current?.setView(loc.lat, loc.lng, 15);
        }
        const now = Date.now();
        if (now - lastLocUpdateRef.current >= 5000) {
          lastLocUpdateRef.current = now;
          supabase.from('profiles').update({ current_lat: loc.lat, current_lng: loc.lng }).eq('id', user.uid).catch(() => {});
        }
      } catch { /* permissions denied or GPS unavailable */ }
    };

    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted' || !mounted) return;
      poll(); // immediate first fix
      timer = setInterval(poll, 5000);
    });

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [isOnline, user]);

  // Draw route to incoming pickup
  useEffect(() => {
    if (!incomingRide?.fromLat || !incomingRide?.fromLng) {
      setPickupRoute(null);
      mapRef.current?.removeMarker('pickup');
      mapRef.current?.clearRoute();
      return;
    }
    const { fromLat, fromLng } = incomingRide;
    mapRef.current?.setMarker('pickup', fromLat, fromLng, 'pickup', 'Pickup location');

    const computeRoute = (dLat, dLng) => {
      mapRef.current?.showRoute(dLat, dLng, fromLat, fromLng, (info) => setPickupRoute(info));
      mapRef.current?.fit();
      getDrivingRoute(dLat, dLng, fromLat, fromLng).then(setPickupRoute).catch(() => {});
    };

    if (driverLocation) {
      computeRoute(driverLocation.lat, driverLocation.lng);
    } else {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, precise: true };
          setDriverLocation(loc);
          computeRoute(loc.lat, loc.lng);
        } catch {}
      })();
    }
  }, [driverLocation?.lat, driverLocation?.lng, incomingRide?.id]);

  // Listen for available rides while online
  useEffect(() => {
    if (!isOnline || !user || bidPlaced) return;

    // Initial fetch — only pick up rides created in the last 15 minutes to avoid
    // showing stale phantom requests from previous sessions.
    const rideCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    supabase.from('rides').select('*').eq('status', 'searching').gte('created_at', rideCutoff).limit(1).then(({ data }) => {
      const blocked = justAcceptedRef.current;
      justAcceptedRef.current = false;
      if (data?.length > 0 && !incomingRideRef.current && !blocked) {
        const ride = toRide(data[0]);
        incomingRideRef.current = ride;
        setBidError('');
        setIncomingRide(ride);
      }
    });

    const ch = supabase
      .channel('driver-searching-' + user.uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides', filter: 'status=eq.searching' }, (payload) => {
        if (!incomingRideRef.current && !justAcceptedRef.current) {
          const ride = toRide(payload.new);
          incomingRideRef.current = ride;
          setBidError('');
          setIncomingRide(ride);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides' }, (payload) => {
        if (incomingRideRef.current?.id === payload.new.id && payload.new.status !== 'searching') {
          incomingRideRef.current = null;
          setIncomingRide(null);
          setPickupRoute(null);
          mapRef.current?.removeMarker('pickup');
          mapRef.current?.clearRoute();
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rides' }, (payload) => {
        if (incomingRideRef.current?.id === payload.old?.id) {
          incomingRideRef.current = null;
          setIncomingRide(null);
          setPickupRoute(null);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [isOnline, user, bidPlaced]);

  // Watch bid acceptance/rejection AND passenger cancellation
  useEffect(() => {
    if (!bidPlaced || !bidRideId || !user) return;

    const ch = supabase
      .channel('my-bid-' + bidRideId + user.uid)
      // Bid status: accepted or rejected by the passenger selecting a different driver
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bids', filter: `ride_id=eq.${bidRideId}` }, (payload) => {
        if (payload.new.driver_id !== user.uid) return;
        if (payload.new.status === 'accepted') {
          justAcceptedRef.current = true;
          navigation.navigate('ActiveTrip', { rideId: payload.new.ride_id });
          setBidPlaced(false);
          setBidRideId(null);
        } else if (payload.new.status === 'rejected' || payload.new.status === 'cancelled') {
          setBidRejectedMsg(t('notSelectedMsg'));
          setBidPlaced(false);
          setBidRideId(null);
        }
      })
      // Ride cancellation: when the passenger cancels the ride entirely, the ride
      // row changes to 'cancelled' but individual bid rows are never updated.
      // We must detect this from the rides table directly.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${bidRideId}` }, (payload) => {
        if (payload.new.status === 'cancelled') {
          Alert.alert(
            t('rideCancelled') || 'Ride Cancelled',
            t('passengerCancelledMsg') || 'The passenger cancelled the request.'
          );
          setBidPlaced(false);
          setBidRideId(null);
        }
      })
      // Ride hard-deleted (rare, but handle it)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rides' }, (payload) => {
        if (payload.old?.id === bidRideId) {
          setBidPlaced(false);
          setBidRideId(null);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [bidPlaced, bidRideId, user]);

  // Navigate to active trip when one is assigned
  useEffect(() => {
    if (!user) return;

    const activeStatuses = ['accepted', 'arrived', 'in_progress'];

    // Initial check
    supabase.from('rides').select('id').eq('driver_id', user.uid).in('status', activeStatuses).limit(1)
      .then(({ data }) => { if (data?.length > 0) navigation.navigate('ActiveTrip', { rideId: data[0].id }); });

    const ch = supabase
      .channel('driver-active-' + user.uid)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `driver_id=eq.${user.uid}` }, (payload) => {
        if (activeStatuses.includes(payload.new.status)) {
          navigation.navigate('ActiveTrip', { rideId: payload.new.id });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Live feed of completed trips for metrics
  useEffect(() => {
    if (!user) return;

    const fetchCompleted = async () => {
      const { data } = await supabase.from('rides').select('*').eq('driver_id', user.uid).eq('status', 'completed').order('completed_at', { ascending: false }).limit(20);
      if (!data) return;
      const rides = data.map(toRide);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayTrips = rides.filter(r => {
        const ts = r.completedAt?.toDate?.() ?? null;
        return ts && ts >= todayStart;
      });
      const earned = todayTrips.reduce((s, r) => s + splitFare(r.estimatedFare || 0, r.isFirstRide).driverAmount, 0);
      setTodayEarnings(Math.round(earned));
      setRecentTrips(rides.slice(0, 5));
    };

    fetchCompleted();

    const ch = supabase
      .channel('driver-completed-' + user.uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `driver_id=eq.${user.uid}` }, fetchCompleted)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Fetch and subscribe to other online drivers for the map
  useEffect(() => {
    if (!user) return;

    const loadOthers = async () => {
      const { data } = await supabase
        .from('public_driver_profiles')
        .select('id, name, current_lat, current_lng')
        .eq('role', 'driver')
        .eq('is_online', true)
        .neq('id', user.uid)
        .not('current_lat', 'is', null);
      if (data) {
        setOtherDrivers(
          data
            .filter(d => d.current_lat && d.current_lng)
            .map(d => ({ id: d.id, name: d.name, lat: d.current_lat, lng: d.current_lng }))
        );
      }
    };
    loadOthers();

    const ch = supabase
      .channel('map-other-drivers')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: 'role=eq.driver',
      }, (payload) => {
        const row = payload.new;
        if (row.id === user.uid) return;
        setOtherDrivers(prev => {
          const gone = !row.is_online || !row.current_lat || !row.current_lng;
          if (gone) return prev.filter(d => d.id !== row.id);
          const entry = { id: row.id, name: row.name, lat: row.current_lat, lng: row.current_lng };
          return prev.some(d => d.id === row.id)
            ? prev.map(d => d.id === row.id ? entry : d)
            : [...prev, entry];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Push other drivers to map whenever the list changes
  useEffect(() => {
    mapRef.current?.setCars(otherDrivers);
  }, [otherDrivers]);

  const DEBT_LIMIT = -300;

  const toggleOnline = async () => {
    const next = !isOnline;
    if (next) {
      const balance = userProfile?.wallet || 0;
      if (balance <= DEBT_LIMIT) {
        Alert.alert(t('cannotGoOnline'), t('debtLimitMsg').replace('%d', Math.abs(balance)));
        return;
      }
      if (balance < 0) {
        Alert.alert(
          t('outstandingCommission'),
          t('outstandingMsg').replace('%d', Math.abs(balance)),
          [
            { text: t('cancel'), style: 'cancel' },
            {
              text: t('goOnlineAnyway'), onPress: async () => {
                setIsOnline(true);
                supabase.from('profiles').update({ is_online: true }).eq('id', user.uid).catch(() => {});
              }
            },
          ]
        );
        return;
      }
    }
    setIsOnline(next);
    if (!next) { setIncomingRide(null); setPickupRoute(null); }
    supabase.from('profiles').update({
      is_online: next,
      ...(next ? {} : { current_lat: null, current_lng: null }),
    }).eq('id', user.uid).catch(() => {});
  };

  const addBid = async () => {
    if (!incomingRide) return;
    setBidError('');
    if (incomingRide.paymentMethod === 'cash') {
      const driverWallet = userProfile?.wallet ?? 0;
      if (driverWallet <= CASH_DEBT_LIMIT) {
        setBidError(t('cashDebtLimitMsg'));
        return;
      }
    }

    // Optimistic update: show the waiting screen immediately so the driver gets
    // instant feedback without waiting for the network round-trip.
    const rideId = incomingRide.id;
    setBidPlaced(true);
    setBidRideId(rideId);
    incomingRideRef.current = null;
    setIncomingRide(null);
    setPickupRoute(null);

    try {
      // Flush current coordinates so the passenger's fetchBids JOIN sees non-null coords.
      if (driverLocation?.lat && driverLocation?.lng) {
        await supabase.from('profiles')
          .update({ current_lat: driverLocation.lat, current_lng: driverLocation.lng })
          .eq('id', user.uid);
      }

      const { data, error } = await supabase.rpc('add_bid', {
        p_ride_id:   rideId,
        p_driver_id: user.uid,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    } catch (err) {
      // Rollback the optimistic update so the driver can try again.
      setBidPlaced(false);
      setBidRideId(null);
      setBidError(err.message?.includes('longer available')
        ? t('rideNoLongerAvailable') || 'This ride is no longer available.'
        : err.message || 'Failed to place bid. Please try again.');
    }
  };

  const cancelBid = async () => {
    const rideId = bidRideId;
    setBidPlaced(false);
    setBidRideId(null);
    if (!rideId || !user) return;
    supabase.rpc('cancel_bid', { p_ride_id: rideId, p_driver_id: user.uid }).catch(() => {});
  };

  const rejectRide = () => {
    incomingRideRef.current = null;
    setIncomingRide(null);
    setPickupRoute(null);
    mapRef.current?.removeMarker('pickup');
    mapRef.current?.clearRoute();
    if (driverLocation) {
      mapRef.current?.setView(driverLocation.lat, driverLocation.lng, 15);
    }
  };

  const driverLat = driverLocation?.lat ?? userProfile?.currentLat;
  const driverLng = driverLocation?.lng ?? userProfile?.currentLng;
  const driverLocPrecise = driverLocation?.precise ?? (userProfile?.currentLat != null);
  const pickupDistKm = pickupRoute?.distanceKm != null
    ? { value: pickupRoute.distanceKm, approx: false }
    : (driverLat != null && driverLng != null && incomingRide?.fromLat != null)
      ? { value: haversineKm(driverLat, driverLng, incomingRide.fromLat, incomingRide.fromLng), approx: !driverLocPrecise }
      : null;

  if (bidPlaced) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.waitingBidWrap}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 24 }} />
          <Text style={styles.waitingBidTitle}>{t('bidPlaced')}</Text>
          <Text style={styles.waitingBidSub}>{t('waitingPassengerChoice')}</Text>
          <TouchableOpacity style={styles.cancelBidBtn} onPress={cancelBid}>
            <Text style={styles.cancelBidText}>{t('cancelBid')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{t('hello')} {userProfile?.name?.split(' ')[0]} 👋</Text>
            <Text style={styles.greetingSub}>{isOnline ? t('online') : t('goOnlineSub')}</Text>
          </View>
          <View style={styles.walletPill}>
            <Ionicons name="wallet-outline" size={14} color={colors.primary} />
            <Text style={styles.walletText}> {userProfile?.wallet || 0} EGP</Text>
          </View>
        </View>

        {/* ── Map ────────────────────────────────────────────────────────── */}
        <LeafletMap
          ref={mapRef}
          center={{ lat: 30.0444, lng: 31.2357 }}
          zoom={12}
          height={180}
          onMapClick={(lat, lng) => {
            if (!driverLocation?.precise) {
              const loc = { lat, lng, precise: false };
              setDriverLocation(loc);
              mapRef.current?.setMarker('me', lat, lng, 'me', 'Your location');
            }
          }}
          onRecenter={() => {
            if (driverLocation) {
              mapRef.current?.setCurrentPos(driverLocation.lat, driverLocation.lng);
              mapRef.current?.setView(driverLocation.lat, driverLocation.lng, 16);
            } else {
              (async () => {
                try {
                  const { status } = await Location.requestForegroundPermissionsAsync();
                  if (status !== 'granted') return;
                  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                  const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                  setDriverLocation(loc);
                  mapRef.current?.setCurrentPos(loc.lat, loc.lng);
                  mapRef.current?.setView(loc.lat, loc.lng, 16);
                } catch {}
              })();
            }
          }}
        />

        {!driverLocation?.precise && (
          <View style={styles.locationHint}>
            <Ionicons name="location-outline" size={14} color={driverLocation ? colors.primary : '#92600A'} />
            <Text style={[styles.locationHintText, { color: driverLocation ? colors.primary : '#92600A' }]}>
              {driverLocation ? '📍 Location set — tap map to update' : '📍 Tap the map to mark your location'}
            </Text>
          </View>
        )}

        {/* ── Wallet warnings ─────────────────────────────────────────────── */}
        {(userProfile?.wallet || 0) < 0 && (
          <View style={[styles.walletBanner, { backgroundColor: '#FDECEA', borderColor: colors.error }]}>
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={[styles.walletBannerText, { color: colors.error }]}>
              {t('walletWarningDebt')} ({Math.abs(userProfile.wallet)} EGP)
            </Text>
          </View>
        )}
        {(userProfile?.wallet || 0) >= 0 && (userProfile?.wallet || 0) < 50 && (
          <View style={[styles.walletBanner, { backgroundColor: '#FFF8E7', borderColor: '#F0C040' }]}>
            <Ionicons name="warning" size={16} color="#92600A" />
            <Text style={[styles.walletBannerText, { color: '#92600A' }]}>
              {t('walletWarningLow')} ({userProfile?.wallet || 0} EGP)
            </Text>
          </View>
        )}

        {!!bidRejectedMsg && (
          <TouchableOpacity style={styles.rejectedBanner} onPress={() => setBidRejectedMsg('')}>
            <Ionicons name="information-circle-outline" size={18} color="#92600A" />
            <Text style={styles.rejectedBannerText}>{bidRejectedMsg}</Text>
            <Ionicons name="close" size={16} color="#92600A" />
          </TouchableOpacity>
        )}

        {/* ── Status / Toggle ─────────────────────────────────────────────── */}
        <View style={[styles.statusCard, isOnline && styles.statusCardOnline]}>
          <View style={styles.statusLeft}>
            <Animated.View style={[
              styles.statusDot,
              { backgroundColor: isOnline ? '#10B981' : '#9CA3AF' },
              isOnline && { transform: [{ scale: pulseAnim }] },
            ]} />
            <View>
              <Text style={[styles.statusLabel, isOnline ? styles.statusLabelOn : styles.statusLabelOff]}>
                {isOnline ? t('online') : t('offline')}
              </Text>
              <Text style={styles.statusSub}>
                {isOnline ? t('newRide') : t('goOnlineSub')}
              </Text>
            </View>
          </View>
          <AnimatedPressable
            style={[styles.toggleBtn, isOnline ? styles.toggleBtnRed : styles.toggleBtnGreen]}
            onPress={toggleOnline}
          >
            <Text style={styles.toggleText}>
              {isOnline ? t('offline') : t('online')}
            </Text>
          </AnimatedPressable>
        </View>

        {/* ── Metrics grid (2 × 2) ────────────────────────────────────────── */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Ionicons name="cash-outline" size={22} color="#059669" />
              <Text style={[styles.metricValue, { color: '#059669' }]}>{todayEarnings}</Text>
              <Text style={styles.metricUnit}>EGP</Text>
              <Text style={styles.metricLabel}>{t('todayEarnings')}</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="car-sport-outline" size={22} color={colors.primary} />
              <Text style={[styles.metricValue, { color: colors.primary }]}>{userProfile?.totalTrips || 0}</Text>
              <Text style={styles.metricLabel}>{t('tripsLabel')}</Text>
            </View>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Ionicons name="star" size={22} color="#D97706" />
              <Text style={[styles.metricValue, { color: '#D97706' }]}>
                {userProfile?.rating ? Math.min(5, userProfile.rating).toFixed(1) : '—'}
              </Text>
              <Text style={styles.metricLabel}>{t('yourRating')}</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="wallet-outline" size={22} color={colors.dark} />
              <Text style={[styles.metricValue, { color: colors.dark }]}>{userProfile?.wallet || 0}</Text>
              <Text style={styles.metricUnit}>EGP</Text>
              <Text style={styles.metricLabel}>{t('walletLabel')}</Text>
            </View>
          </View>
        </View>

        {/* ── Recent trips ────────────────────────────────────────────────── */}
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>{t('recentTripsLabel')}</Text>
          {recentTrips.length === 0 ? (
            <Text style={styles.emptyText}>{t('noTripsDriver')}</Text>
          ) : (
            recentTrips.map(trip =>
              <TripRow key={trip.id} trip={trip} colors={colors} styles={styles} />
            )
          )}
        </View>

      </ScrollView>

      {/* ── Incoming ride modal ─────────────────────────────────────────── */}
      <Modal visible={!!incomingRide} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.rideModal}>
            <Text style={styles.modalTitle}>🚗 {t('newRide')}</Text>
            <View style={styles.rideDetail}>
              <View style={styles.rideDetailRow}>
                <View style={[styles.dot, { backgroundColor: colors.success }]} />
                <Text style={styles.rideDetailText}>{incomingRide?.from}</Text>
              </View>
              <View style={styles.rideDetailRow}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <Text style={styles.rideDetailText}>{incomingRide?.to}</Text>
              </View>
            </View>
            <View style={styles.rideMetaRow}>
              <View style={styles.rideMeta}>
                <Text style={styles.rideMetaLabel}>{t('distance')}</Text>
                <Text style={styles.rideMetaValue}>{incomingRide?.distanceKm} km</Text>
              </View>
              <View style={styles.rideMeta}>
                <Text style={styles.rideMetaLabel}>{t('fareLabel')}</Text>
                <Text style={[styles.rideMetaValue, { color: colors.primary }]}>
                  {incomingRide ? Math.round(incomingRide.estimatedFare * 0.85) : 0} EGP
                </Text>
              </View>
              <View style={styles.rideMeta}>
                <Text style={styles.rideMetaLabel}>{t('distanceAway')}</Text>
                <Text style={[styles.rideMetaValue, { color: colors.dark }]}>
                  {pickupDistKm
                    ? `${pickupDistKm.approx ? '~' : ''}${pickupDistKm.value} km`
                    : `${incomingRide?.durationMins ?? '—'} min`}
                </Text>
              </View>
            </View>
            {incomingRide?.pickupNote ? (
              <View style={styles.pickupNoteBanner}>
                <Text style={styles.pickupNoteText}>📍 {incomingRide.pickupNote}</Text>
              </View>
            ) : null}
            {pickupRoute?.durationMins != null && (
              <View style={styles.etaBanner}>
                <Text style={styles.etaBannerText}>~{pickupRoute.durationMins} min to reach passenger pickup point</Text>
              </View>
            )}
            {!!bidError && (
              <View style={{ backgroundColor: '#FDECEA', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#B91C1C', fontSize: 13, textAlign: 'center' }}>{bidError}</Text>
              </View>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.rejectBtn} onPress={rejectRide}>
                <Text style={styles.rejectText}>{t('decline')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={addBid}>
                <Text style={styles.acceptText}>{t('offerToDrive')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TripRow({ trip, colors, styles }) {
  const earnings = Math.round(splitFare(trip.estimatedFare || 0, trip.isFirstRide).driverAmount);
  const date = trip.completedAt?.toDate?.() ?? trip.createdAt?.toDate?.();
  const dateStr = date
    ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    : '';
  return (
    <View style={styles.tripRow}>
      <View style={styles.tripRouteBlock}>
        <View style={styles.routeIndicator}>
          <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
          <View style={styles.routeLine} />
          <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
        </View>
        <View style={styles.routeLabels}>
          <Text style={styles.routeFrom} numberOfLines={1}>{trip.from || '—'}</Text>
          <Text style={styles.routeTo} numberOfLines={1}>{trip.to || '—'}</Text>
        </View>
      </View>
      <View style={styles.tripEarningsBlock}>
        <Text style={styles.tripEarnings}>+{earnings} EGP</Text>
        {!!dateStr && <Text style={styles.tripDate}>{dateStr}</Text>}
      </View>
    </View>
  );
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return Math.round(Math.sqrt(a) * 2 * R * 10) / 10;
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
    locationHint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#FFF8E7', borderRadius: 8, marginTop: 6 },
    locationHintText: { fontSize: 12, fontWeight: '600', flex: 1 },
    walletBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, marginTop: 14, borderWidth: 1 },
    walletBannerText: { fontSize: 13, fontWeight: '600', flex: 1 },
    rejectedBanner: { backgroundColor: '#FFF8E7', borderRadius: 12, padding: 12, marginTop: 14, borderWidth: 1, borderColor: '#F0C040', flexDirection: 'row', alignItems: 'center', gap: 8 },
    rejectedBannerText: { flex: 1, fontSize: 13, color: '#92600A', fontWeight: '600' },
    statusCard: { backgroundColor: colors.white, borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, ...shadow.md },
    statusCardOnline: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC' },
    statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    statusDot: { width: 16, height: 16, borderRadius: 8 },
    statusLabel: { fontSize: 18, fontWeight: '800' },
    statusLabelOn: { color: '#059669' },
    statusLabelOff: { color: colors.gray },
    statusSub: { fontSize: 12, color: colors.gray, marginTop: 2 },
    toggleBtn: { paddingVertical: 13, paddingHorizontal: 22, borderRadius: 14 },
    toggleBtnGreen: { backgroundColor: '#10B981' },
    toggleBtnRed: { backgroundColor: '#EF4444' },
    toggleText: { fontSize: 14, fontWeight: '800', color: '#fff' },
    metricsGrid: { marginTop: 14, gap: 10 },
    metricRow: { flexDirection: 'row', gap: 10 },
    metricCard: { flex: 1, backgroundColor: colors.white, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center', gap: 3, ...shadow.sm },
    metricValue: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
    metricUnit: { fontSize: 11, fontWeight: '700', color: colors.gray, marginTop: -2 },
    metricLabel: { fontSize: 11, color: colors.gray, textAlign: 'center', marginTop: 2 },
    recentSection: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginTop: 14, ...shadow.md },
    recentTitle: { fontSize: 15, fontWeight: '700', color: colors.dark, marginBottom: 4 },
    emptyText: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingVertical: 16 },
    tripRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    tripRouteBlock: { flex: 1, flexDirection: 'row', gap: 10, marginRight: 12 },
    routeIndicator: { alignItems: 'center', paddingTop: 2 },
    routeDot: { width: 8, height: 8, borderRadius: 4 },
    routeLine: { width: 1.5, flex: 1, backgroundColor: '#D1D5DB', marginVertical: 3 },
    routeLabels: { flex: 1, gap: 10 },
    routeFrom: { fontSize: 13, fontWeight: '600', color: colors.dark },
    routeTo: { fontSize: 13, color: colors.gray },
    tripEarningsBlock: { alignItems: 'flex-end' },
    tripEarnings: { fontSize: 14, fontWeight: '800', color: '#059669' },
    tripDate: { fontSize: 11, color: colors.gray, marginTop: 3 },
    waitingBidWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    waitingBidTitle: { fontSize: 24, fontWeight: '800', color: colors.dark, marginBottom: 10, textAlign: 'center' },
    waitingBidSub: { fontSize: 14, color: colors.gray, textAlign: 'center', marginBottom: 36 },
    cancelBidBtn: { paddingVertical: 12, paddingHorizontal: 32 },
    cancelBidText: { color: colors.error, fontSize: 16, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    rideModal: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: colors.dark, marginBottom: 16 },
    rideDetail: { backgroundColor: colors.lightGray, borderRadius: 12, padding: 14, marginBottom: 16 },
    rideDetailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
    rideDetailText: { fontSize: 15, color: colors.dark, fontWeight: '500', flex: 1 },
    rideMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    rideMeta: { alignItems: 'center', flex: 1 },
    rideMetaLabel: { fontSize: 11, color: colors.gray, marginBottom: 4, textAlign: 'center' },
    rideMetaValue: { fontSize: 18, fontWeight: '800', color: colors.dark },
    pickupNoteBanner: { backgroundColor: colors.primaryBg, borderRadius: 10, padding: 10, marginBottom: 10 },
    pickupNoteText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
    etaBanner: { backgroundColor: '#FFF8E7', borderRadius: 10, padding: 10, marginBottom: 16, alignItems: 'center' },
    etaBannerText: { color: '#92600A', fontSize: 13, fontWeight: '600' },
    modalActions: { flexDirection: 'row', gap: 12 },
    rejectBtn: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border },
    rejectText: { fontSize: 15, fontWeight: '700', color: colors.gray },
    acceptBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
    acceptText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  });
}
