import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Modal, ScrollView, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, onSnapshot, doc,
  updateDoc, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { generateDriverSummary } from '../../hooks/useCoaching';
import { getDrivingRoute } from '../../utils/routing';
import { useTheme } from '../../context/SettingsContext';
import LeafletMap from '../../components/LeafletMap';
import AnimatedPressable from '../../components/AnimatedPressable';

export default function DriverHomeScreen({ navigation }) {
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [isOnline, setIsOnline] = useState(userProfile?.isOnline || false);
  const [incomingRide, setIncomingRide] = useState(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryPeriod, setSummaryPeriod] = useState('weekly');
  const [driverLocation, setDriverLocation] = useState(null);
  const [pickupRoute, setPickupRoute] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mapRef = useRef(null);
  const watchRef = useRef(null);
  const incomingRideRef = useRef(null);
  const lastLocFirestoreRef = useRef(0);
  const autoReportShownRef = useRef(false);

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

  useEffect(() => {
    if (!isOnline || !navigator?.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDriverLocation(loc);
        mapRef.current?.setMarker('me', loc.lat, loc.lng, 'me', 'You');
        const now2 = Date.now();
        if (now2 - lastLocFirestoreRef.current >= 5000) {
          lastLocFirestoreRef.current = now2;
          updateDoc(doc(db, 'users', user.uid), { currentLat: loc.lat, currentLng: loc.lng }).catch(() => {});
        }
      },
      null,
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); };
  }, [isOnline]);

  useEffect(() => {
    if (!driverLocation || !incomingRide?.fromLat || !incomingRide?.fromLon) {
      setPickupRoute(null);
      return;
    }
    const { fromLat, fromLon } = incomingRide;
    mapRef.current?.setMarker('pickup', fromLat, fromLon, 'pickup', 'Pickup location');
    mapRef.current?.showRoute(driverLocation.lat, driverLocation.lng, fromLat, fromLon, (info) => setPickupRoute(info));
    mapRef.current?.fit();
    getDrivingRoute(driverLocation.lat, driverLocation.lng, fromLat, fromLon)
      .then(setPickupRoute)
      .catch(() => {});
  }, [driverLocation?.lat, driverLocation?.lng, incomingRide?.id]);

  useEffect(() => {
    if (!isOnline || !user) return;
    const q = query(collection(db, 'rides'), where('status', '==', 'searching'));
    return onSnapshot(q, (snap) => {
      if (!snap.empty && !incomingRideRef.current) {
        const ride = { id: snap.docs[0].id, ...snap.docs[0].data() };
        incomingRideRef.current = ride;
        setIncomingRide(ride);
      } else if (snap.empty) {
        incomingRideRef.current = null;
        setIncomingRide(null);
        setPickupRoute(null);
        mapRef.current?.removeMarker('pickup');
        mapRef.current?.clearRoute();
      }
    });
  }, [isOnline, user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', user.uid),
      where('status', 'in', ['accepted', 'arrived', 'in_progress'])
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) navigation.navigate('ActiveTrip', { rideId: snap.docs[0].id });
    });
  }, [user]);

  useEffect(() => {
    if (!user || autoReportShownRef.current) return;
    autoReportShownRef.current = true;
    import('../../lib/supabase').then(({ supabase }) => {
      supabase.from('driver_summaries')
        .select('*').eq('driver_id', user.uid).eq('period_type', 'weekly')
        .order('created_at', { ascending: false }).limit(1)
        .then(({ data }) => {
          if (data && data[0]) {
            const ageMs = Date.now() - new Date(data[0].created_at).getTime();
            if (ageMs < 7 * 24 * 60 * 60 * 1000) {
              setSummaryData({ summary: data[0].summary, stats: data[0].stats });
              setSummaryPeriod('weekly');
              return;
            }
          }
          generateDriverSummary(user.uid, 'weekly').then(result => {
            if (result && !result.error) {
              setSummaryData(result);
              setSummaryPeriod('weekly');
            }
          }).catch(() => {});
        });
    });
  }, [user]);

  const DEBT_LIMIT = -300;

  const toggleOnline = async () => {
    const next = !isOnline;
    if (next) {
      const balance = userProfile?.wallet || 0;
      if (balance <= DEBT_LIMIT) {
        Alert.alert(
          t('cannotGoOnline'),
          t('debtLimitMsg').replace('%d', Math.abs(balance))
        );
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
                try { await updateDoc(doc(db, 'users', user.uid), { isOnline: true }); } catch (_) {}
              }
            },
          ]
        );
        return;
      }
    }
    setIsOnline(next);
    if (!next) { setIncomingRide(null); setPickupRoute(null); }
    try {
    await updateDoc(doc(db, 'users', user.uid), {
      isOnline: next,
      ...(next ? {} : { currentLat: null, currentLng: null })
    });
  } catch (_) {}
  };

  const acceptRide = async () => {
    if (!incomingRide) return;
    const rideRef = doc(db, 'rides', incomingRide.id);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(rideRef);
        if (!snap.exists() || snap.data().status !== 'searching') throw new Error('Ride no longer available');
        tx.update(rideRef, {
          status: 'accepted',
          driverId: user.uid,
          driverName: userProfile.name,
          driverCar: `${userProfile.carColor} ${userProfile.carModel}`,
          driverPlate: userProfile.plateNumber,
          driverPhone: userProfile.phone ?? '',
          driverPhotoUrl: userProfile.photoUrl ?? '',
          driverRating: userProfile.rating ?? 0,
          driverTotalTrips: userProfile.totalTrips ?? 0,
          acceptedAt: serverTimestamp(),
        });
      });
      incomingRideRef.current = null;
      setIncomingRide(null);
    } catch (err) {
      Alert.alert('Oops', err.message);
      incomingRideRef.current = null;
      setIncomingRide(null);
    }
  };

  const rejectRide = () => {
    incomingRideRef.current = null;
    setIncomingRide(null);
    setPickupRoute(null);
  };

  const handleGetSummary = async (period) => {
    setSummaryPeriod(period);
    setSummaryLoading(true);
    setSummaryVisible(true);
    setSummaryData(null);
    try {
      const result = await generateDriverSummary(user.uid, period);
      setSummaryData(result);
    } catch (_) {
      setSummaryData({ error: true });
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{t('hello')} {userProfile?.name?.split(' ')[0]} 👋</Text>
            <Text style={styles.greetingSub}>{isOnline ? t('online') + ' — ' + t('goOnlineSub') : t('goOnlineSub')}</Text>
          </View>
          <View style={styles.walletPill}>
            <Ionicons name="wallet-outline" size={14} color={colors.primary} />
            <Text style={styles.walletText}> {userProfile?.wallet || 0} EGP</Text>
          </View>
        </View>

        <LeafletMap
          ref={mapRef}
          center={{ lat: 30.0444, lng: 31.2357 }}
          zoom={12}
          height={200}
        />

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

        <View style={[styles.statusCard, { marginTop: 14 }]}>
          <View style={styles.statusLeft}>
            <Animated.View style={[
              styles.statusDot,
              { backgroundColor: isOnline ? colors.success : colors.gray },
              isOnline && { transform: [{ scale: pulseAnim }] },
            ]} />
            <View>
              <Text style={styles.statusLabel}>{isOnline ? t('online') : t('offline')}</Text>
              <Text style={styles.statusSub}>{isOnline ? t('newRide') : t('goOnlineSub')}</Text>
            </View>
          </View>
          <AnimatedPressable
            style={[styles.toggleBtn, isOnline && styles.toggleBtnActive]}
            onPress={toggleOnline}
          >
            <Text style={[styles.toggleText, isOnline && styles.toggleTextActive]}>
              {isOnline ? t('offline') : t('online')}
            </Text>
          </AnimatedPressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="car-outline" size={20} color={colors.primary} />
            <Text style={styles.statNum}>{userProfile?.totalTrips || 0}</Text>
            <Text style={styles.statLabel}>{t('tripsLabel')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="wallet-outline" size={20} color={colors.primary} />
            <Text style={styles.statNum}>{userProfile?.wallet || 0}</Text>
            <Text style={styles.statLabel}>{t('walletLabel')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="star-outline" size={20} color={colors.gold} />
            <Text style={styles.statNum}>{userProfile?.rating ? userProfile.rating.toFixed(1) : '—'}</Text>
            <Text style={styles.statLabel}>{t('yourRating')}</Text>
          </View>
        </View>

        <View style={styles.aiSection}>
          <Text style={styles.aiTitle}>{t('aiReportTitle')}</Text>
          {summaryData && !summaryData.error ? (
            <>
              {summaryData.stats && (
                <View style={styles.summaryStatsRow}>
                  <View style={styles.summaryStat}><Text style={styles.summaryStatNum}>{summaryData.stats.completed_rides}</Text><Text style={styles.summaryStatLabel}>{t('tripsLabel')}</Text></View>
                  <View style={styles.summaryStat}><Text style={styles.summaryStatNum}>{summaryData.stats.total_earnings} {t('egp')}</Text><Text style={styles.summaryStatLabel}>{t('earnedLabel')}</Text></View>
                  <View style={styles.summaryStat}><Text style={styles.summaryStatNum}>{summaryData.stats.avg_rating ?? '—'}</Text><Text style={styles.summaryStatLabel}>{t('avgRatingLabel')}</Text></View>
                </View>
              )}
              <Text style={styles.autoSummaryText} numberOfLines={4}>{summaryData.summary}</Text>
              <TouchableOpacity style={styles.viewFullBtn} onPress={() => setSummaryVisible(true)}>
                <Text style={styles.viewFullText}>{t('viewFullReport')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.aiSub}>{t('aiReportSub')}</Text>
              <View style={styles.aiRow}>
                <TouchableOpacity style={styles.aiBtn} onPress={() => handleGetSummary('weekly')}>
                  <Text style={styles.aiBtnText}>{t('thisWeek')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.aiBtn} onPress={() => handleGetSummary('monthly')}>
                  <Text style={styles.aiBtnText}>{t('thisMonth')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* AI Summary Modal */}
      <Modal visible={summaryVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.summarySheet}>
            <Text style={styles.summaryTitle}>
              {summaryPeriod === 'weekly' ? t('weeklyReport') : t('monthlyReport')}
            </Text>
            {summaryLoading && (
              <View style={{ alignItems: 'center', padding: 32 }}>
                <Text style={{ fontSize: 24, marginBottom: 12 }}>🤖</Text>
                <Text style={{ color: colors.gray, fontSize: 14 }}>{t('claudeAnalysing')}</Text>
              </View>
            )}
            {!summaryLoading && summaryData?.error && (
              <Text style={{ color: colors.error, textAlign: 'center', padding: 20 }}>
                {t('reportError')}
              </Text>
            )}
            {!summaryLoading && summaryData && !summaryData.error && (
              <ScrollView style={{ maxHeight: 320 }}>
                {summaryData.stats && (
                  <View style={styles.summaryStatsRow}>
                    <View style={styles.summaryStat}><Text style={styles.summaryStatNum}>{summaryData.stats.completed_rides}</Text><Text style={styles.summaryStatLabel}>{t('tripsLabel')}</Text></View>
                    <View style={styles.summaryStat}><Text style={styles.summaryStatNum}>{summaryData.stats.total_earnings} {t('egp')}</Text><Text style={styles.summaryStatLabel}>{t('earnedLabel')}</Text></View>
                    <View style={styles.summaryStat}><Text style={styles.summaryStatNum}>{summaryData.stats.avg_rating ?? '—'}</Text><Text style={styles.summaryStatLabel}>{t('avgRatingLabel')}</Text></View>
                  </View>
                )}
                <View style={styles.summaryTextBox}>
                  <Text style={styles.summaryText}>{summaryData.summary}</Text>
                </View>
              </ScrollView>
            )}
            <TouchableOpacity style={styles.summaryClose} onPress={() => setSummaryVisible(false)}>
              <Text style={styles.summaryCloseText}>{t('closeBtn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                <Text style={[styles.rideMetaValue, { color: pickupRoute ? colors.dark : colors.gray }]}>
                  {pickupRoute ? `${pickupRoute.distanceKm} km` : '…'}
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
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.rejectBtn} onPress={rejectRide}>
                <Text style={styles.rejectText}>{t('decline')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={acceptRide}>
                <Text style={styles.acceptText}>{t('accept')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    statusCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, ...shadow.md },
    statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    statusDot: { width: 14, height: 14, borderRadius: 7 },
    statusLabel: { fontSize: 16, fontWeight: '700', color: colors.dark },
    statusSub: { fontSize: 12, color: colors.gray },
    toggleBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, borderWidth: 1.5, borderColor: colors.primary },
    toggleBtnActive: { backgroundColor: colors.primary },
    toggleText: { fontSize: 13, fontWeight: '700', color: colors.primary },
    toggleTextActive: { color: '#fff' },
    statsRow: { flexDirection: 'row', gap: 10 },
    statCard: { flex: 1, backgroundColor: colors.white, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, ...shadow.sm },
    statNum: { fontSize: 20, fontWeight: '800', color: colors.dark },
    statLabel: { fontSize: 11, color: colors.gray },
    walletBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, marginTop: 14, borderWidth: 1 },
    walletBannerText: { fontSize: 13, fontWeight: '600', flex: 1 },
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
    pickupNoteBanner: { backgroundColor: colors.primaryBg, borderRadius: 10, padding: 10, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: colors.primary },
    pickupNoteText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
    etaBanner: { backgroundColor: '#FFF8E7', borderRadius: 10, padding: 10, marginBottom: 16, alignItems: 'center' },
    etaBannerText: { color: '#92600A', fontSize: 13, fontWeight: '600' },
    modalActions: { flexDirection: 'row', gap: 12 },
    rejectBtn: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border },
    rejectText: { fontSize: 15, fontWeight: '700', color: colors.gray },
    acceptBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
    acceptText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    // AI summary section
    aiSection: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginTop: 16, ...shadow.md },
    aiTitle: { fontSize: 16, fontWeight: '700', color: colors.dark },
    aiSub: { fontSize: 12, color: colors.gray, marginTop: 2, marginBottom: 12 },
    aiRow: { flexDirection: 'row', gap: 10 },
    aiBtn: { flex: 1, backgroundColor: colors.primaryBg, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.primary },
    aiBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    // Summary modal
    summarySheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    summaryTitle: { fontSize: 18, fontWeight: '800', color: colors.dark, marginBottom: 16 },
    summaryStatsRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.primaryBg, borderRadius: 14, padding: 16, marginBottom: 14 },
    summaryStat: { alignItems: 'center' },
    summaryStatNum: { fontSize: 18, fontWeight: '800', color: colors.primary },
    summaryStatLabel: { fontSize: 11, color: colors.gray, marginTop: 2 },
    summaryTextBox: { backgroundColor: colors.lightGray, borderRadius: 12, padding: 16 },
    summaryText: { fontSize: 14, color: colors.dark, lineHeight: 22 },
    summaryClose: { backgroundColor: colors.primary, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 16 },
    summaryCloseText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    autoSummaryText: { fontSize: 13, color: colors.gray, lineHeight: 20, marginTop: 8, marginBottom: 10 },
    viewFullBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 10, alignItems: 'center' },
    viewFullText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  });
}
