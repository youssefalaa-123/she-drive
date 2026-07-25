import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Alert, ActivityIndicator, Modal, Image, ScrollView,
  Platform, Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { toRide } from '../../lib/transforms';
import { splitFare, calculateFare, GRACE_PERIOD_MINS, WAIT_FEE_PER_MIN, NO_SHOW_UNLOCK_MINS, PENALTY_CANCEL_FEE } from '../../utils/pricing';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/SettingsContext';
import LeafletMap from '../../components/LeafletMap';
import AnimatedPressable from '../../components/AnimatedPressable';

function maneuverEmoji(step) {
  if (!step) return '⬆️';
  const type = step.maneuver?.type || '';
  const mod = step.maneuver?.modifier || '';
  if (type === 'arrive') return '🏁';
  if (type === 'depart') return '🚀';
  if (type === 'roundabout' || type === 'rotary') return '🔄';
  if (mod === 'left' || mod === 'sharp left') return '⬅️';
  if (mod === 'right' || mod === 'sharp right') return '➡️';
  if (mod === 'slight left') return '↖️';
  if (mod === 'slight right') return '↗️';
  if (mod === 'uturn') return '↩️';
  return '⬆️';
}
function maneuverText(step, t) {
  if (!step) return '';
  const type = step.maneuver?.type || '';
  const mod = step.maneuver?.modifier || '';
  const name = step.name || '';
  if (type === 'arrive') return name ? `${t('navArriveAt')} ${name}` : t('navArrive');
  if (type === 'depart') return name ? `${t('navDepartTo')} ${name}` : t('navDepart');
  if (mod === 'left') return name ? `${t('navTurnLeftOnto')} ${name}` : t('navTurnLeft');
  if (mod === 'right') return name ? `${t('navTurnRightOnto')} ${name}` : t('navTurnRight');
  if (mod === 'slight left') return name ? `${t('navKeepLeftOnto')} ${name}` : t('navKeepLeft');
  if (mod === 'slight right') return name ? `${t('navKeepRightOnto')} ${name}` : t('navKeepRight');
  if (mod === 'straight') return name ? `${t('navContinueOn')} ${name}` : t('navContinue');
  return name ? `${t('navContinueOn')} ${name}` : t('navContinueAhead');
}
function fmtStepDist(meters, t) {
  if (!meters) return '';
  return meters < 1000 ? `${Math.round(meters)} ${t('m')}` : `${(meters/1000).toFixed(1)} ${t('km')}`;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

export default function ActiveTripScreen({ navigation, route }) {
  const { rideId } = route.params;
  const { colors, shadow, t } = useTheme();
  const { user, userProfile } = useAuth();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [ride, setRide] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [tripFinalFare, setTripFinalFare] = useState(null);
  const [cashToCollect, setCashToCollect] = useState(0);
  const [finalWalletPaid, setFinalWalletPaid] = useState(0);
  const settlementRef = useRef(null);
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);
  const [passengerCancelledVisible, setPassengerCancelledVisible] = useState(false);
  const [graceSecsLeft, setGraceSecsLeft]             = useState(null);
  const [waitMins, setWaitMins]                        = useState(0);
  const [waitFeeAmt, setWaitFeeAmt]                    = useState(0);
  const [noShowUnlocked, setNoShowUnlocked]            = useState(false);
  const [noShowConfirmVisible, setNoShowConfirmVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [driverLoc, setDriverLoc] = useState(null);
  const [navSteps, setNavSteps] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const mapRef = useRef(null);
  const watchRef = useRef(null);
  const lastDbUpdateRef = useRef(0);
  const lastRouteUpdateRef = useRef(0);
  const routeCoordsRef = useRef([]);
  const offRouteCheckRef = useRef(0);
  const actualDistanceKmRef = useRef(0);
  const lastGPSLocRef = useRef(null);
  const passengerCancelHandledRef = useRef(false);

  // Ride listener
  useEffect(() => {
    supabase.from('rides').select('*').eq('id', rideId).single()
      .then(({ data }) => { if (data) setRide(toRide(data)); });

    const ch = supabase.channel('driver-active-trip-' + rideId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` }, (payload) => {
        const data = toRide(payload.new);
        setRide(data);

        if (data.status === 'cancelled') {
          // Cancellation fee credit is now handled server-side by the
          // handle_driver_cancellation_credit DB trigger (fires on status='cancelled').
          // No client-side increment_wallet call is needed or allowed.
          setPassengerCancelledVisible(true);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [rideId, user]);

  // Initial map markers when ride loads
  useEffect(() => {
    if (!ride) return;
    if (ride.fromLat && ride.fromLng)
      mapRef.current?.setMarker('pickup', ride.fromLat, ride.fromLng, 'pickup', `${t('pickupLabel')}: ${ride.from}`);
    if (ride.toLat && ride.toLng)
      mapRef.current?.setMarker('dropoff', ride.toLat, ride.toLng, 'dest', `${t('dropoffLabel')}: ${ride.to}`);
    if (ride.driverLat && ride.driverLng) {
      const targetLat = ride.status === 'in_progress' ? ride.toLat : ride.fromLat;
      const targetLng = ride.status === 'in_progress' ? ride.toLng : ride.fromLng;
      if (targetLat && targetLng) {
        mapRef.current?.setMarker('driver', ride.driverLat, ride.driverLng, 'driver', 'You');
        mapRef.current?.showRoute(ride.driverLat, ride.driverLng, targetLat, targetLng, (info) => {
          if (info?.coords) routeCoordsRef.current = info.coords;
        });
        mapRef.current?.fit();
      }
    }
  }, [ride?.id]);

  // GPS tracking
  useEffect(() => {
    if (!navigator?.geolocation || !rideId) return;
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setDriverLoc({ lat, lng });
        mapRef.current?.setMarker('driver', lat, lng, 'driver', 'You');

        if (ride?.status === 'in_progress') {
          if (lastGPSLocRef.current) {
            const d = haversineKm(lastGPSLocRef.current.lat, lastGPSLocRef.current.lng, lat, lng);
            if (d < 0.5) actualDistanceKmRef.current += d;
          }
          lastGPSLocRef.current = { lat, lng };
        }
        mapRef.current?.setCurrentPos(lat, lng);

        if (navSteps.length > 0) {
          const next = navSteps[currentStepIdx];
          if (next?.maneuver?.location) {
            const [sLng, sLat] = next.maneuver.location;
            if (Math.abs(lat - sLat) < 0.0003 && Math.abs(lng - sLng) < 0.0003 && currentStepIdx < navSteps.length - 1) {
              setCurrentStepIdx(idx => idx + 1);
            }
          }
        }

        const now = Date.now();
        const targetLat = ride?.status === 'in_progress' ? ride.toLat : ride.fromLat;
        const targetLng = ride?.status === 'in_progress' ? ride.toLng : ride.fromLng;

        if (ride && routeCoordsRef.current.length > 0 && now - offRouteCheckRef.current >= 5000) {
          offRouteCheckRef.current = now;
          const minDistM = routeCoordsRef.current.reduce((min, pt) => Math.min(min, haversineKm(lat, lng, pt.lat, pt.lng) * 1000), Infinity);
          if (minDistM > 80 && targetLat && targetLng && now - lastRouteUpdateRef.current >= 10000) {
            lastRouteUpdateRef.current = now;
            mapRef.current?.showRoute(lat, lng, targetLat, targetLng, (info) => {
              if (info?.steps?.length) { setNavSteps(info.steps); setCurrentStepIdx(0); }
              if (info?.coords) routeCoordsRef.current = info.coords;
            });
          }
        }

        if (ride && now - lastRouteUpdateRef.current >= 15000) {
          lastRouteUpdateRef.current = now;
          if (targetLat && targetLng) {
            mapRef.current?.showRoute(lat, lng, targetLat, targetLng, (info) => {
              if (info?.steps?.length) { setNavSteps(info.steps); setCurrentStepIdx(0); }
              if (info?.coords) routeCoordsRef.current = info.coords;
            });
            mapRef.current?.fit();
          }
        }

        if (now - lastDbUpdateRef.current >= 5000) {
          lastDbUpdateRef.current = now;
          console.log('[Driver GPS] Pushing location to DB:', { lat, lng, rideId, status: ride?.status });
          supabase.from('rides')
            .update({ driver_lat: lat, driver_lng: lng })
            .eq('id', rideId)
            .then(({ error }) => {
              if (error) console.error('[Driver GPS] DB update FAILED:', error.message, '| code:', error.code, '| hint:', error.hint);
              else console.log('[Driver GPS] DB update OK — lat:', lat, 'lng:', lng);
            })
            .catch((err) => console.error('[Driver GPS] DB update network error:', err?.message));
        }
      },
      (err) => {
        console.error('[Driver GPS] watchPosition error — code', err.code, ':', err.message,
          err.code === 1 ? '(PERMISSION_DENIED — check browser settings)' :
          err.code === 2 ? '(POSITION_UNAVAILABLE)' :
          err.code === 3 ? '(TIMEOUT)' : '');
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); };
  }, [rideId, ride?.status]);

  // Reroute on status change
  useEffect(() => {
    if (!ride || !driverLoc) return;
    const targetLat = ride.status === 'in_progress' ? ride.toLat : ride.fromLat;
    const targetLng = ride.status === 'in_progress' ? ride.toLng : ride.fromLng;
    if (targetLat && targetLng) {
      mapRef.current?.showRoute(driverLoc.lat, driverLoc.lng, targetLat, targetLng, (info) => {
        if (info?.steps?.length) { setNavSteps(info.steps); setCurrentStepIdx(0); }
        if (info?.coords) routeCoordsRef.current = info.coords;
      });
      mapRef.current?.fit();
      lastRouteUpdateRef.current = Date.now();
    }
  }, [ride?.status]);

  useEffect(() => {
    if (ride?.status === 'in_progress') { actualDistanceKmRef.current = 0; lastGPSLocRef.current = null; }
  }, [ride?.status]);

  // Wait time / no-show timer
  useEffect(() => {
    if (!ride?.arrivedAt || ride.status !== 'arrived') {
      setGraceSecsLeft(null); setWaitMins(0); setWaitFeeAmt(0); setNoShowUnlocked(false); return;
    }
    const arrivedMs = tsToMs(ride.arrivedAt) ?? Date.now();
    const GRACE_SECS   = GRACE_PERIOD_MINS   * 60;
    const NO_SHOW_SECS = NO_SHOW_UNLOCK_MINS * 60;
    const tick = () => {
      const elapsed = (Date.now() - arrivedMs) / 1000;
      if (elapsed < GRACE_SECS) {
        setGraceSecsLeft(Math.ceil(GRACE_SECS - elapsed)); setWaitMins(0); setWaitFeeAmt(0); setNoShowUnlocked(false);
      } else {
        setGraceSecsLeft(0);
        const overMin = Math.floor((elapsed - GRACE_SECS) / 60);
        setWaitMins(overMin);
        setWaitFeeAmt(Math.round(overMin * WAIT_FEE_PER_MIN * 10) / 10);
        setNoShowUnlocked(elapsed >= NO_SHOW_SECS);
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [ride?.arrivedAt, ride?.status]);

  const doDriverCancel = async () => {
    setCancelConfirmVisible(false);
    try {
      await supabase.from('rides').update({
        status: 'searching',
        driver_id: null, driver_name: null,
        driver_phone: null, driver_photo_url: null,
        driver_car: null, driver_plate: null,
        driver_rating: null, driver_total_trips: null,
        driver_lat: null, driver_lng: null,
      }).eq('id', rideId);
    } catch (_) {}
    navigation.navigate('DriverTabs');
  };

  const handleDriverCancel = () => setCancelConfirmVisible(true);

  const doNoShowCancel = async () => {
    setNoShowConfirmVisible(false);
    const fee = PENALTY_CANCEL_FEE;
    try {
      await supabase.from('rides').update({
        status: 'cancelled',
        cancel_reason: 'passenger_no_show',
        cancellation_fee: fee,
        no_show: true,
        wait_time_fee: 0,
        wait_time_minutes: waitMins,
        cancelled_at: new Date().toISOString(),
      }).eq('id', rideId);

      // Credit driver immediately for no-show (100% goes to driver, no admin commission)
      if (ride?.driverId && user?.uid) {
        await supabase.rpc('topup_own_wallet', {
          p_delta:   fee,
          p_type:    'no_show_credit',
          p_desc:    `No-show fee received (100%) — passenger didn't arrive`,
          p_ride_id: rideId,
        });
      }
    } catch (_) {}
    navigation.navigate('DriverTabs');
  };

  const markArrived = async () => {
    console.log('[markArrived] pressed — rideId:', rideId);
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase
        .from('rides')
        .update({ status: 'arrived', arrived_at: new Date().toISOString() })
        .eq('id', rideId)
        .select()
        .single();
      if (error) {
        console.error('[markArrived] FAILED:', error.message, error.code);
        Alert.alert('Update failed', error.message);
      } else {
        console.log('[markArrived] OK — row returned, status:', data?.status);
        setRide(toRide(data));
      }
    } catch (err) {
      console.error('[markArrived] exception:', err?.message);
      Alert.alert('Network error', err?.message ?? 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const startTrip = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase
        .from('rides')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
          wait_time_fee: waitFeeAmt,
          wait_time_minutes: waitMins,
        })
        .eq('id', rideId)
        .select()
        .single();
      if (error) {
        console.error('[startTrip] FAILED:', error.message, error.code);
        Alert.alert('Update failed', error.message);
      } else {
        setRide(toRide(data));
      }
    } catch (err) {
      console.error('[startTrip] exception:', err?.message);
      Alert.alert('Network error', err?.message ?? 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const completeTrip = async () => {
    setActionLoading(true);
    try {
      // Delegate ALL settlement to the complete-trip Edge Function (service_role).
      // This fixes three findings simultaneously:
      //   Finding #1: protect_ride_fare trigger blocked client-side fare writes
      //   Finding #5: increment_wallet is no longer callable by authenticated clients
      //   Finding #7: fare calculation authority moved from client to server
      const { data, error } = await supabase.functions.invoke('complete-trip', {
        body: {
          trip_id:            rideId,
          actual_distance_km: actualDistanceKmRef.current > 0.5
            ? actualDistanceKmRef.current
            : undefined,
        },
      });

      if (error) {
        // FunctionsHttpError wraps the HTTP body in error.context
        let errMsg = error.message || String(error);
        try {
          const body = await error.context?.json?.();
          if (body?.error) errMsg = body.error;
        } catch { /* use raw message */ }
        console.error('[completeTrip] Edge Function error:', errMsg);
        Alert.alert('Could not complete trip', errMsg);
        return;
      }

      const s = data?.settlement ?? {};
      const {
        method        = ride.paymentMethod || 'cash',
        total_charged: totalCharged = 0,
        final_base_fare: finalBaseFare = 0,
        wait_time_fee: storedWaitFee = ride.waitTimeFee || 0,
        promo_discount: promoDiscount = 0,
        driver_amount: driverAmount = 0,
        admin_amount: adminAmount = 0,
        wallet_paid: walletPaid = 0,
        cash_paid: cashAmount = 0,
        is_first_ride: isFirst = false,
      } = s;

      const cashToShow   = method === 'cash' ? totalCharged : method === 'wallet+cash' ? cashAmount : 0;
      const walletCredit = method === 'wallet+cash' && cashAmount < driverAmount - 0.01
        ? driverAmount - cashAmount : 0;
      const storedWaitMins = ride.waitTimeMinutes || 0;
      const cardFee        = ride.cardFee || 0;

      settlementRef.current = {
        totalCharged, finalBaseFare, promoDiscount,
        waitFeeAmt: storedWaitFee, waitMins: storedWaitMins,
        method, isFirst, cashToShow,
        driverAmount, adminAmount, cardFee,
        walletPaid, cashAmount, walletCreditToDriver: walletCredit,
      };
      setTripFinalFare(totalCharged);
      setCashToCollect(cashToShow);
      setFinalWalletPaid(walletPaid);
      setShowConfirm(true);
    } catch (err) {
      console.error('[completeTrip] unexpected error:', err?.message);
      Alert.alert('Network error', err?.message ?? 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!ride) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const chipBaseFare = ride.baseFare || ride.estimatedFare || 0;
  const chipWaitFee  = ride.waitTimeFee || 0;
  const { driverAmount, adminAmount } = splitFare(chipBaseFare, chipWaitFee, ride.isFirstRide);

  const openInMaps = (provider) => {
    const isPickup = ride.status === 'accepted' || ride.status === 'arrived';
    const lat = isPickup ? ride.fromLat : ride.toLat;
    const lng = isPickup ? ride.fromLng : ride.toLng;
    if (!lat || !lng) return;
    let url;
    if (provider === 'apple') url = `maps://?daddr=${lat},${lng}&dirflg=d`;
    else url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    Linking.openURL(url).catch(() => Alert.alert('Maps unavailable', 'Could not open the maps app.'));
  };

  const handleOpenMaps = () => {
    if (Platform.OS === 'ios') {
      Alert.alert('Open navigation', 'Choose your maps app', [
        { text: 'Apple Maps', onPress: () => openInMaps('apple') },
        { text: 'Google Maps', onPress: () => openInMaps('google') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      openInMaps('google');
    }
  };

  let navInfo = null;
  if (driverLoc) {
    const targetLat = ride.status === 'in_progress' ? ride.toLat : ride.fromLat;
    const targetLng = ride.status === 'in_progress' ? ride.toLng : ride.fromLng;
    if (targetLat && targetLng) {
      const km = haversineKm(driverLoc.lat, driverLoc.lng, targetLat, targetLng);
      navInfo = { km: km.toFixed(1), mins: Math.max(1, Math.round((km / 30) * 60)) };
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={passengerCancelledVisible} transparent animationType="fade">
        <View style={styles.cancelOverlay}>
          <View style={styles.cancelBox}>
            <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>😔</Text>
            <Text style={styles.cancelTitle}>{t('rideCancelled')}</Text>
            <Text style={styles.cancelMsg}>{t('passengerCancelledTrip')}</Text>
            <TouchableOpacity style={[styles.cancelYes, { marginTop: 4 }]} onPress={() => { setPassengerCancelledVisible(false); navigation.navigate('DriverTabs'); }}>
              <Text style={styles.cancelYesText}>{t('backToHome')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={noShowConfirmVisible} transparent animationType="fade">
        <View style={styles.cancelOverlay}>
          <View style={styles.cancelBox}>
            <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>⏳</Text>
            <Text style={styles.cancelTitle}>{t('noShowBtn')}</Text>
            <Text style={styles.cancelMsg}>{t('noShowConfirmMsg').replace('%d1', String(waitMins + GRACE_PERIOD_MINS)).replace('%d2', String(PENALTY_CANCEL_FEE))}</Text>
            <View style={styles.cancelBtns}>
              <TouchableOpacity style={styles.cancelNo} onPress={() => setNoShowConfirmVisible(false)}><Text style={styles.cancelNoText}>{t('no')}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.cancelYes, { backgroundColor: '#DC2626' }]} onPress={doNoShowCancel}><Text style={styles.cancelYesText}>Cancel Ride</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={cancelConfirmVisible} transparent animationType="fade">
        <View style={styles.cancelOverlay}>
          <View style={styles.cancelBox}>
            <Text style={styles.cancelTitle}>{t('cancelRide')}</Text>
            <Text style={styles.cancelMsg}>{t('driverCancelConfirmMsg')}</Text>
            <View style={styles.cancelBtns}>
              <TouchableOpacity style={styles.cancelNo} onPress={() => setCancelConfirmVisible(false)}><Text style={styles.cancelNoText}>{t('no')}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.cancelYes} onPress={doDriverCancel}><Text style={styles.cancelYesText}>{t('yesCancelDriverRide')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            {(() => {
              const s = settlementRef.current;
              if (!s) return null;
              const isCash = s.cashToShow > 0;
              return (
                <>
                  {isCash ? (
                    <View style={styles.cashBanner}>
                      <Text style={styles.cashBannerEmoji}>💵</Text>
                      <Text style={styles.cashBannerLabel}>{t('collectFromPassenger')}</Text>
                      <Text style={styles.cashBannerAmt}>{s.cashToShow} {t('egp')}</Text>
                      {s.method === 'wallet+cash' && s.walletPaid > 0 && (
                        <Text style={styles.cashBannerSub}>({s.walletPaid} {t('egp')} {t('coveredByWallet')})</Text>
                      )}
                    </View>
                  ) : (
                    <View style={styles.digitalBanner}>
                      <Ionicons name="checkmark-circle" size={28} color="#059669" />
                      <Text style={styles.digitalLabel}>{t('tripPaidDigitally')}</Text>
                      <Text style={styles.doNotCollect}>{t('doNotCollectCash')}</Text>
                    </View>
                  )}
                  <Text style={styles.confirmTitle}>{t('tripCompleted')}</Text>
                  <View style={styles.earningsBreakdown}>
                    <TripRow label="Base Fare" value={`${s.finalBaseFare} ${t('egp')}`} styles={styles} />
                    {s.isFirst && s.promoDiscount > 0 && (
                      <TripRow label="First-Ride Promo (−15%)" value={`−${s.promoDiscount} ${t('egp')}`} color="#10B981" styles={styles} />
                    )}
                    {s.waitFeeAmt > 0 && (
                      <TripRow label={`${t('waitFeeLabel')} (${s.waitMins} min)`} value={`+${s.waitFeeAmt} ${t('egp')}`} color={colors.warning || '#D97706'} styles={styles} />
                    )}
                    <TripRow label={t('tripPrice')} value={`${s.totalCharged} ${t('egp')}`} styles={styles} />
                    {!s.isFirst && s.adminAmount > 0 && (
                      <TripRow label={t('commission15')} value={`−${s.adminAmount} ${t('egp')}`} color={colors.error} styles={styles} />
                    )}
                    {s.method === 'wallet+cash' && (
                      <>
                        <TripRow label={t('cashCollectedLabel')} value={`${s.cashAmount} ${t('egp')}`} styles={styles} />
                        {s.walletCreditToDriver > 0 && (
                          <TripRow label={t('walletTopUpLabel')} value={`+${s.walletCreditToDriver} ${t('egp')}`} color={colors.success || '#059669'} styles={styles} />
                        )}
                      </>
                    )}
                    <View style={styles.earningsTotal}>
                      <Text style={styles.earningsTotalLabel}>{t('yourEarnings')}</Text>
                      <Text style={styles.earningsTotalValue}>{s.driverAmount} {t('egp')}</Text>
                    </View>
                  </View>
                  <Text style={styles.paymentNote}>
                    {s.method === 'cash' && !s.isFirst && s.adminAmount > 0
                      ? `💰 ${t('commissionDeducted').replace('%d', String(s.adminAmount))}`
                      : s.method === 'wallet+cash' && s.walletCreditToDriver > 0
                      ? `💰 +${s.walletCreditToDriver} ${t('egp')} ${t('walletTopUpLabel').toLowerCase()}`
                      : `💳 ${t('earningsAddedNote')}`}
                  </Text>
                  <TouchableOpacity style={styles.doneBtn} onPress={() => { setShowConfirm(false); navigation.navigate('DriverTabs'); }}>
                    <Text style={styles.doneBtnText}>{t('backToHome')}</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      <View style={styles.mapWrap}>
        <LeafletMap ref={mapRef} center={{ lat: ride.fromLat ?? 30.0444, lng: ride.fromLng ?? 31.2357 }} zoom={14} height={280} />
        {navInfo && (
          <View style={styles.navOverlay}>
            <Text style={styles.navText}>{ride.status === 'in_progress' ? '🎯' : '🟢'} {navInfo.km} {t('km')} · ~{navInfo.mins} {t('min')}</Text>
          </View>
        )}
        {navSteps.length > 0 && navSteps[currentStepIdx] && (
          <View style={styles.stepOverlay}>
            <Text style={styles.stepIcon}>{maneuverEmoji(navSteps[currentStepIdx])}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepText} numberOfLines={2}>{maneuverText(navSteps[currentStepIdx], t)}</Text>
              <Text style={styles.stepDist}>{fmtStepDist(navSteps[currentStepIdx].distance, t)}</Text>
            </View>
          </View>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.passengerCard}>
          {ride.passengerPhotoURL
            ? <Image source={{ uri: ride.passengerPhotoURL }} style={styles.passengerAvatarImg} />
            : <View style={styles.passengerAvatar}><Text style={{ fontSize: 28 }}>👩</Text></View>
          }
          <View style={{ flex: 1 }}>
            <Text style={styles.passengerName}>{ride.passengerName || t('passenger')}</Text>
            {ride.passengerPhone ? (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}
                onPress={() => { Clipboard.setStringAsync(ride.passengerPhone); Alert.alert(t('numberCopied')); }}
              >
                <Text style={{ fontSize: 12, color: colors.dark }}>📞 {ride.passengerPhone}</Text>
                <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>{t('copyNumber')}</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.pickupLabel}>
              {ride.status === 'accepted' || ride.status === 'arrived'
                ? `${t('pickupLabel')}: ${ride.from}`
                : `${t('dropoffLabel')}: ${ride.to}`}
            </Text>
          </View>
          <View style={styles.fareChip}>
            <Text style={styles.fareChipText}>{driverAmount} {t('egp')}</Text>
          </View>
        </View>

        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={styles.routeText}>{ride.from}</Text>
          </View>
          {ride.pickupNote ? (
            <Text style={{ fontSize: 12, color: colors.primary, marginLeft: 18, marginTop: 2, marginBottom: 4 }}>📍 {ride.pickupNote}</Text>
          ) : null}
          <View style={[styles.routeRow, { marginTop: 8 }]}>
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            <Text style={styles.routeText}>{ride.to}</Text>
          </View>
        </View>

        <View style={styles.actionArea}>
          {ride.status === 'accepted' && (
            <AnimatedPressable
              style={[styles.actionBtn, actionLoading && { opacity: 0.6 }]}
              onPress={markArrived}
              disabled={actionLoading}
            >
              {actionLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Ionicons name="location" size={20} color="#fff" /><Text style={styles.actionBtnText}>  {t('iArrivedAtPickup')}</Text></>
              }
            </AnimatedPressable>
          )}
          {ride.status === 'arrived' && (
            <>
              {graceSecsLeft !== null && graceSecsLeft > 0 && (
                <View style={styles.graceBar}>
                  <Ionicons name="timer-outline" size={18} color="#059669" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.graceText}>{t('graceDriverHeading').replace('%d', String(Math.ceil(graceSecsLeft / 60)))}</Text>
                    <Text style={styles.graceTimer}>{String(Math.floor(graceSecsLeft / 60)).padStart(2, '0')}:{String(graceSecsLeft % 60).padStart(2, '0')} remaining · free grace period</Text>
                  </View>
                </View>
              )}
              {graceSecsLeft === 0 && waitFeeAmt > 0 && (
                <View style={styles.waitBar}>
                  <Ionicons name="time-outline" size={18} color="#DC2626" />
                  <Text style={styles.waitText}>{t('waitFeeDriver').replace('%s', String(waitFeeAmt)).replace('%d', String(waitMins))}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, actionLoading && { opacity: 0.6 }]}
                onPress={startTrip}
                disabled={actionLoading}
                activeOpacity={0.75}
              >
                {actionLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="play" size={20} color="#fff" />
                      <Text style={styles.actionBtnText}>  {t('startTrip')}</Text>
                    </View>
                }
              </TouchableOpacity>
              {noShowUnlocked && (
                <TouchableOpacity style={styles.noShowBtn} onPress={() => setNoShowConfirmVisible(true)}>
                  <Ionicons name="person-remove-outline" size={16} color="#DC2626" />
                  <Text style={styles.noShowText}>{t('noShowBtn')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {ride.status === 'in_progress' && (
            <AnimatedPressable style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={completeTrip}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.actionBtnText}>  {t('completeTrip')}</Text>
            </AnimatedPressable>
          )}
          <TouchableOpacity style={styles.mapsBtn} onPress={handleOpenMaps}>
            <Text style={styles.mapsBtnText}>🗺️  {t('openInMaps')}</Text>
          </TouchableOpacity>
          {(ride.status === 'accepted' || ride.status === 'arrived') && (
            <TouchableOpacity style={styles.cancelDriverBtn} onPress={handleDriverCancel}>
              <Text style={styles.cancelDriverText}>{t('cancelRide')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TripRow({ label, value, color, styles }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={[styles.breakdownValue, color && { color }]}>{value}</Text>
    </View>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.white },
    mapWrap: { position: 'relative', margin: 16, marginBottom: 0 },
    navOverlay: { position: 'absolute', bottom: 10, left: 10, right: 10, backgroundColor: 'rgba(26,26,46,0.85)', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
    navText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    passengerCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, backgroundColor: colors.white, borderRadius: 16, padding: 16, ...shadow.md, marginBottom: 10, marginTop: 14 },
    passengerAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primaryBg, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    passengerAvatarImg: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
    passengerName: { fontSize: 16, fontWeight: '700', color: colors.dark },
    pickupLabel: { fontSize: 12, color: colors.gray, marginTop: 2 },
    fareChip: { backgroundColor: colors.primaryBg, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 12 },
    fareChipText: { fontSize: 15, fontWeight: '800', color: colors.primary },
    routeCard: { marginHorizontal: 16, backgroundColor: colors.lightGray, borderRadius: 12, padding: 14, marginBottom: 14 },
    routeRow: { flexDirection: 'row', alignItems: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
    routeText: { fontSize: 14, color: colors.dark, flex: 1 },
    actionArea: { marginHorizontal: 16, marginTop: 4 },
    stepOverlay: { position: 'absolute', top: 10, left: 10, right: 10, zIndex: 10, backgroundColor: 'rgba(26,26,46,0.9)', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    stepIcon: { fontSize: 24, minWidth: 32, textAlign: 'center' },
    stepText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    stepDist: { color: 'rgba(255,255,255,.7)', fontSize: 11, marginTop: 2 },
    actionBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    confirmModal: { backgroundColor: colors.white, borderRadius: 24, padding: 28, width: '100%', alignItems: 'center' },
    confirmTitle: { fontSize: 22, fontWeight: '800', color: colors.dark, marginBottom: 20 },
    earningsBreakdown: { width: '100%', marginBottom: 16 },
    breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    breakdownLabel: { fontSize: 14, color: colors.gray },
    breakdownValue: { fontSize: 14, fontWeight: '700', color: colors.dark },
    earningsTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14 },
    earningsTotalLabel: { fontSize: 16, fontWeight: '700', color: colors.dark },
    earningsTotalValue: { fontSize: 22, fontWeight: '800', color: colors.primary },
    paymentNote: { fontSize: 13, color: colors.gray, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
    doneBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
    doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    cashBanner: { width: '100%', backgroundColor: '#FFF3CD', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16, borderWidth: 2, borderColor: '#F59E0B' },
    cashBannerEmoji: { fontSize: 36, marginBottom: 4 },
    cashBannerLabel: { fontSize: 13, fontWeight: '700', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5 },
    cashBannerAmt: { fontSize: 32, fontWeight: '900', color: '#92400E', marginTop: 2 },
    cashBannerSub: { fontSize: 12, color: '#B45309', marginTop: 4 },
    digitalBanner: { width: '100%', backgroundColor: '#D1FAE5', borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: '#6EE7B7', gap: 4 },
    digitalLabel: { fontSize: 15, fontWeight: '800', color: '#065F46', marginTop: 4 },
    doNotCollect: { fontSize: 13, fontWeight: '700', color: '#059669' },
    mapsBtn: { marginTop: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary, paddingVertical: 14, alignItems: 'center' },
    mapsBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
    cancelDriverBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
    cancelDriverText: { color: colors.error, fontSize: 14, fontWeight: '600' },
    graceBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#D1FAE5', borderRadius: 12, padding: 12, marginBottom: 10 },
    graceText: { fontSize: 13, fontWeight: '700', color: '#065F46' },
    graceTimer: { fontSize: 12, color: '#047857', marginTop: 2 },
    waitBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12, marginBottom: 10 },
    waitText: { fontSize: 13, fontWeight: '700', color: '#DC2626', flex: 1 },
    noShowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#DC2626' },
    noShowText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
    cancelOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 28 },
    cancelBox: { backgroundColor: colors.white, borderRadius: 20, padding: 24, width: '100%' },
    cancelTitle: { fontSize: 18, fontWeight: '800', color: colors.dark, marginBottom: 10 },
    cancelMsg: { fontSize: 14, color: colors.gray, lineHeight: 20, marginBottom: 20 },
    cancelBtns: { flexDirection: 'row', gap: 12 },
    cancelNo: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border },
    cancelNoText: { fontSize: 15, fontWeight: '700', color: colors.gray },
    cancelYes: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: colors.error },
    cancelYesText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  });
}
