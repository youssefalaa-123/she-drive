import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator, Alert, Modal, ScrollView, Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useDriverReviews } from '../../hooks/useDriverReviews';
import LeafletMap from '../../components/LeafletMap';
import AnimatedPressable from '../../components/AnimatedPressable';

const STATUS_STEPS = ['accepted', 'arrived', 'in_progress', 'completed'];

export default function ActiveRideScreen({ navigation, route }) {
  const { rideId } = route.params;
  const { colors, shadow, t } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [ride, setRide] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [showDriverProfile, setShowDriverProfile] = useState(false);
  const [waitSecsLeft, setWaitSecsLeft] = useState(null);
  const mapRef = useRef(null);
  const lastDriverPos = useRef(null);
  const acceptedShownRef = useRef(false);
  const waitFeeAppliedRef = useRef(false);

  const { data: driverReviews } = useDriverReviews(ride?.driverId, 3);

  useEffect(() => {
    return onSnapshot(doc(db, 'rides', rideId), (snap) => {
      if (!snap.exists()) return;
      const data = { id: snap.id, ...snap.data() };
      setRide(data);
      if (data.status === 'accepted' && !acceptedShownRef.current) {
        acceptedShownRef.current = true;
        setShowDriverProfile(true);
      }
      if (data.status === 'completed') navigation.replace('TripSummary', { rideId });
      if (data.status === 'cancelled') {
        Alert.alert(t('rideCancelled'), t('driverCancelledTrip'));
        navigation.navigate('PassengerTabs');
      }
      if (data.status === 'searching') {
        Alert.alert(t('rideCancelled'), t('driverSearchingAgain'));
        navigation.navigate('PassengerTabs');
      }
    });
  }, [rideId]);

  // Waiting timer — starts from arrivedAt timestamp so it survives remounts
  useEffect(() => {
    if (!ride?.arrivedAt || ride.status !== 'arrived') {
      setWaitSecsLeft(null);
      return;
    }
    if (ride.waitingFee) {
      waitFeeAppliedRef.current = true;
      setWaitSecsLeft(0);
      return;
    }
    const arrivedMs = ride.arrivedAt.toMillis ? ride.arrivedAt.toMillis() : Date.now();
    const elapsed = Math.floor((Date.now() - arrivedMs) / 1000);
    setWaitSecsLeft(Math.max(0, 300 - elapsed));
  }, [ride?.status, ride?.arrivedAt?.toMillis?.()]);

  useEffect(() => {
    if (waitSecsLeft === null || waitSecsLeft <= 0) return;
    const tid = setTimeout(() => setWaitSecsLeft((s) => s - 1), 1000);
    return () => clearTimeout(tid);
  }, [waitSecsLeft]);

  useEffect(() => {
    if (waitSecsLeft !== 0 || waitFeeAppliedRef.current || !ride || ride.waitingFee) return;
    waitFeeAppliedRef.current = true;
    updateDoc(doc(db, 'rides', rideId), {
      estimatedFare: (ride.estimatedFare || 0) + 10,
      waitingFee: 10,
    }).catch(() => {});
    Alert.alert('', t('waitingFeeApplied'));
  }, [waitSecsLeft]);

  useEffect(() => {
    if (!ride?.fromLat || !ride?.fromLon) return;
    mapRef.current?.setMarker('pickup', ride.fromLat, ride.fromLon, 'pickup', 'Your Pickup');
    if (ride.driverLat && ride.driverLng) {
      const targetLat = ride.status === 'in_progress' ? (ride.toLat ?? ride.fromLat) : ride.fromLat;
      const targetLon = ride.status === 'in_progress' ? (ride.toLon ?? ride.fromLon) : ride.fromLon;
      mapRef.current?.setMarker('driver', ride.driverLat, ride.driverLng, 'driver', ride.driverName || 'Your Driver');
      mapRef.current?.showRoute(ride.driverLat, ride.driverLng, targetLat, targetLon, (info) => setRouteInfo(info));
      mapRef.current?.fit();
    } else {
      mapRef.current?.setView(ride.fromLat, ride.fromLon, 14);
    }
  }, [ride?.fromLat, ride?.fromLon]);

  useEffect(() => {
    if (!ride?.driverLat || !ride?.driverLng || !ride?.fromLat) return;
    const dLat = ride.driverLat;
    const dLng = ride.driverLng;
    const prev = lastDriverPos.current;
    if (prev && Math.abs(prev.lat - dLat) < 0.0001 && Math.abs(prev.lng - dLng) < 0.0001) return;
    lastDriverPos.current = { lat: dLat, lng: dLng };
    mapRef.current?.setMarker('driver', dLat, dLng, 'driver', ride.driverName || 'Your Driver');
    const targetLat = ride.status === 'in_progress' ? (ride.toLat ?? ride.fromLat) : ride.fromLat;
    const targetLon = ride.status === 'in_progress' ? (ride.toLon ?? ride.fromLon) : ride.fromLon;
    mapRef.current?.showRoute(dLat, dLng, targetLat, targetLon, (info) => setRouteInfo(info));
    mapRef.current?.fit();
  }, [ride?.driverLat, ride?.driverLng, ride?.status]);

  const CANCEL_FEE = 10;

  const handleCancel = async () => {
    Alert.alert(
      t('cancelRide'),
      t('cancelRideFeeMsg').replace('%d', CANCEL_FEE),
      [
        { text: t('no'), style: 'cancel' },
        {
          text: t('yesCancelRide'), style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all([
                updateDoc(doc(db, 'rides', rideId), {
                  status: 'cancelled',
                  cancellationFee: CANCEL_FEE,
                  cancelledBy: 'passenger',
                }),
                updateDoc(doc(db, 'users', user.uid), {
                  wallet: increment(-CANCEL_FEE),
                }),
                ...(ride.driverId ? [updateDoc(doc(db, 'users', ride.driverId), {
                  wallet: increment(CANCEL_FEE),
                })] : []),
              ]);
              supabase.from('rides').upsert({
                id: rideId,
                status: 'cancelled',
                cancelled_by: 'passenger',
                cancellation_fee: CANCEL_FEE,
              }, { onConflict: 'id' }).then(() => {});
            } catch (_) {}
            navigation.navigate('PassengerTabs');
          },
        },
      ]
    );
  };

  if (!ride) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const stepIdx = STATUS_STEPS.indexOf(ride.status);

  return (
    <SafeAreaView style={styles.container}>
      {/* Driver profile modal shown on acceptance */}
      <Modal visible={showDriverProfile} transparent animationType="slide">
        <View style={styles.profileOverlay}>
          <View style={styles.profileSheet}>
            <View style={styles.profileHeader}>
              {ride?.driverPhotoUrl
                ? <Image source={{ uri: ride.driverPhotoUrl }} style={styles.profileAvatarImg} />
                : <View style={styles.profileAvatar}><Text style={{ fontSize: 36 }}>👩</Text></View>
              }
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.profileName}>{ride?.driverName || t('yourDriver')}</Text>
                <Text style={styles.profileCar}>{ride?.driverCar || ''} {ride?.driverPlate ? `· ${ride.driverPlate}` : ''}</Text>
                <View style={styles.profileStats}>
                  <Text style={styles.statChip}>⭐ {ride?.driverRating?.toFixed(1) ?? '—'}</Text>
                  <Text style={styles.statChip}>🚗 {ride?.driverTotalTrips ?? '—'} {t('tripsLabel')}</Text>
                </View>
                {ride?.driverPhone ? (
                  <TouchableOpacity
                    style={styles.phoneRow}
                    onPress={() => { Clipboard.setStringAsync(ride.driverPhone); Alert.alert(t('numberCopied')); }}
                  >
                    <Text style={styles.phoneText}>📞 {ride.driverPhone}</Text>
                    <Text style={styles.copyBtn}>{t('copyNumber')}</Text>
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

      <View style={styles.mapWrap}>
        <LeafletMap
          ref={mapRef}
          center={{ lat: ride.fromLat ?? 30.0444, lng: ride.fromLon ?? 31.2357 }}
          zoom={14}
          height={260}
        />
        {routeInfo && (
          <View style={styles.etaOverlay}>
            <Text style={styles.etaText}>
              🚗 {routeInfo.distanceKm} km away · ~{routeInfo.durationMins} min
            </Text>
          </View>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={styles.stepsRow}>
        {STATUS_STEPS.map((s, i) => (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.stepDot, i <= stepIdx && styles.stepDotActive]} />
            {i < STATUS_STEPS.length - 1 && (
              <View style={[styles.stepLine, i < stepIdx && styles.stepLineActive]} />
            )}
          </View>
        ))}
      </View>
      <Text style={styles.statusLabel}>{
        ride.status === 'accepted'    ? t('driverOnTheWay') :
        ride.status === 'arrived'     ? t('driverArrived') :
        ride.status === 'in_progress' ? t('onYourWay') :
        ride.status === 'completed'   ? t('arrivedDestination') : '…'
      }</Text>

      <View style={styles.driverCard}>
        <View style={styles.driverAvatar}><Text style={{ fontSize: 32 }}>👩</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.driverName}>{ride.driverName || t('yourDriver')}</Text>
          <Text style={styles.driverCar}>{ride.driverCar || '—'}</Text>
          <Text style={styles.driverPlate}>{ride.driverPlate || ''}</Text>
        </View>
        <View style={styles.fareBox}>
          <Text style={styles.fareLabel}>{t('fareLabel')}</Text>
          <Text style={styles.fareAmount}>{ride.estimatedFare} EGP</Text>
        </View>
      </View>

      {ride.driverPhone ? (
        <TouchableOpacity
          style={styles.phoneCard}
          onPress={() => { Clipboard.setStringAsync(ride.driverPhone); Alert.alert(t('numberCopied')); }}
        >
          <Text style={styles.phoneCardLabel}>{t('driverPhone')}</Text>
          <Text style={styles.phoneCardNum}>📞 {ride.driverPhone}</Text>
          <Text style={styles.phoneCardCopy}>{t('copyNumber')}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.tripInfo}>
        <View style={styles.tripRow}>
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
          <Text style={styles.tripText}>{ride.from}</Text>
        </View>
        <View style={styles.tripRow}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <Text style={styles.tripText}>{ride.to}</Text>
        </View>
      </View>

      {ride.status === 'arrived' && waitSecsLeft !== null && (
        <View style={styles.waitTimerBox}>
          <Text style={styles.waitTimerLabel}>{t('waitingTimerLabel')}</Text>
          <Text style={[styles.waitTimerValue, waitSecsLeft <= 60 && styles.waitTimerRed]}>
            {Math.floor(waitSecsLeft / 60)}:{String(waitSecsLeft % 60).padStart(2, '0')}
          </Text>
          {waitSecsLeft === 0 && <Text style={styles.waitFeeNote}>+10 EGP</Text>}
        </View>
      )}

      {(ride.status === 'accepted' || ride.status === 'arrived') && (
        <AnimatedPressable style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelText}>{t('cancelRide')}</Text>
        </AnimatedPressable>
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.white },
    mapWrap: { position: 'relative', margin: 16 },
    etaOverlay: {
      position: 'absolute', bottom: 10, left: 10, right: 10,
      backgroundColor: 'rgba(26,26,46,0.85)', borderRadius: 10,
      paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center',
    },
    etaText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    stepsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginTop: 4 },
    stepItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.border },
    stepDotActive: { backgroundColor: colors.primary },
    stepLine: { flex: 1, height: 2, backgroundColor: colors.border },
    stepLineActive: { backgroundColor: colors.primary },
    statusLabel: { textAlign: 'center', fontSize: 15, fontWeight: '700', color: colors.dark, marginTop: 10, marginBottom: 12 },
    driverCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.white, marginHorizontal: 16,
      borderRadius: 16, padding: 16, ...shadow.md, marginBottom: 10,
    },
    driverAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryBg, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    driverName: { fontSize: 16, fontWeight: '700', color: colors.dark },
    driverCar: { fontSize: 13, color: colors.gray, marginTop: 2 },
    driverPlate: { fontSize: 12, color: colors.gray },
    fareBox: { alignItems: 'flex-end' },
    fareLabel: { fontSize: 11, color: colors.gray },
    fareAmount: { fontSize: 18, fontWeight: '800', color: colors.primary },
    tripInfo: { marginHorizontal: 16, backgroundColor: colors.lightGray, borderRadius: 12, padding: 14, gap: 8, marginBottom: 12 },
    tripRow: { flexDirection: 'row', alignItems: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
    tripText: { fontSize: 14, color: colors.dark, flex: 1 },
    waitTimerBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: '#FFF8E7', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#F0C040' },
    waitTimerLabel: { fontSize: 13, color: '#92600A', fontWeight: '600' },
    waitTimerValue: { fontSize: 18, fontWeight: '800', color: '#92600A' },
    waitTimerRed: { color: colors.error },
    waitFeeNote: { fontSize: 12, color: colors.error, fontWeight: '700' },
    cancelBtn: { marginHorizontal: 16, marginBottom: 20, alignItems: 'center' },
    cancelText: { color: colors.error, fontSize: 15, fontWeight: '600' },
    phoneCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.white, borderRadius: 12, padding: 12, gap: 8 },
    phoneCardLabel: { fontSize: 11, color: colors.gray },
    phoneCardNum: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.dark },
    phoneCardCopy: { fontSize: 12, color: colors.primary, fontWeight: '700' },
    // Driver profile modal
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
  });
}
