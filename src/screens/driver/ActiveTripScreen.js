import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Alert, ActivityIndicator, Modal, Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { splitFare } from '../../utils/pricing';
import { useTheme } from '../../context/SettingsContext';
import LeafletMap from '../../components/LeafletMap';
import AnimatedPressable from '../../components/AnimatedPressable';

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ActiveTripScreen({ navigation, route }) {
  const { rideId } = route.params;
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [ride, setRide] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [driverLoc, setDriverLoc] = useState(null);
  const mapRef = useRef(null);
  const watchRef = useRef(null);
  const lastFirestoreRef = useRef(0);
  const lastRouteUpdateRef = useRef(0);

  useEffect(() => {
    return onSnapshot(doc(db, 'rides', rideId), (snap) => {
      if (!snap.exists()) return;
      const data = { id: snap.id, ...snap.data() };
      setRide(data);
      if (data.status === 'cancelled') {
        Alert.alert(t('rideCancelled'), t('passengerCancelledTrip'));
        navigation.navigate('DriverTabs');
      }
    });
  }, [rideId]);

  useEffect(() => {
    if (!ride) return;
    if (ride.fromLat && ride.fromLon)
      mapRef.current?.setMarker('pickup', ride.fromLat, ride.fromLon, 'pickup', `${t('pickupLabel')}: ${ride.from}`);
    if (ride.toLat && ride.toLon)
      mapRef.current?.setMarker('dropoff', ride.toLat, ride.toLon, 'dest', `${t('dropoffLabel')}: ${ride.to}`);
    if (ride.driverLat && ride.driverLng) {
      const targetLat = ride.status === 'in_progress' ? ride.toLat : ride.fromLat;
      const targetLon = ride.status === 'in_progress' ? ride.toLon : ride.fromLon;
      if (targetLat && targetLon) {
        mapRef.current?.setMarker('driver', ride.driverLat, ride.driverLng, 'driver', 'You');
        mapRef.current?.showRoute(ride.driverLat, ride.driverLng, targetLat, targetLon);
        mapRef.current?.fit();
      }
    }
  }, [ride?.id]);

  useEffect(() => {
    if (!navigator?.geolocation || !rideId) return;
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setDriverLoc({ lat, lng });
        mapRef.current?.setMarker('driver', lat, lng, 'driver', 'You');
        const now = Date.now();
        if (ride && now - lastRouteUpdateRef.current >= 15000) {
          lastRouteUpdateRef.current = now;
          const targetLat = ride.status === 'in_progress' ? ride.toLat : ride.fromLat;
          const targetLon = ride.status === 'in_progress' ? ride.toLon : ride.fromLon;
          if (targetLat && targetLon) {
            mapRef.current?.showRoute(lat, lng, targetLat, targetLon);
            mapRef.current?.fit();
          }
        }
        if (now - lastFirestoreRef.current >= 5000) {
          lastFirestoreRef.current = now;
          try { await updateDoc(doc(db, 'rides', rideId), { driverLat: lat, driverLng: lng }); } catch (_) {}
        }
      },
      null,
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); };
  }, [rideId, ride?.status]);

  useEffect(() => {
    if (!ride || !driverLoc) return;
    const targetLat = ride.status === 'in_progress' ? ride.toLat : ride.fromLat;
    const targetLon = ride.status === 'in_progress' ? ride.toLon : ride.fromLon;
    if (targetLat && targetLon) {
      mapRef.current?.showRoute(driverLoc.lat, driverLoc.lng, targetLat, targetLon);
      mapRef.current?.fit();
      lastRouteUpdateRef.current = Date.now();
    }
  }, [ride?.status]);

  const handleDriverCancel = () => {
    Alert.alert(t('cancelRide'), t('driverCancelConfirmMsg'), [
      { text: t('no'), style: 'cancel' },
      {
        text: t('yesCancelDriverRide'), style: 'destructive',
        onPress: async () => {
          try {
            await updateDoc(doc(db, 'rides', rideId), {
              status: 'searching',
              driverId: null, driverName: null,
              driverPhone: null, driverPhotoUrl: null,
              driverCar: null, driverPlate: null,
              driverRating: null, driverTotalTrips: null,
              driverLat: null, driverLng: null,
            });
          } catch (_) {}
          navigation.navigate('DriverTabs');
        },
      },
    ]);
  };

  const markArrived = () =>
    updateDoc(doc(db, 'rides', rideId), { status: 'arrived', arrivedAt: serverTimestamp() });
  const startTrip = () =>
    updateDoc(doc(db, 'rides', rideId), { status: 'in_progress', startedAt: serverTimestamp() });
  const completeTrip = async () => {
    await updateDoc(doc(db, 'rides', rideId), {
      status: 'completed', finalFare: ride.estimatedFare, completedAt: serverTimestamp(),
    });
    setShowConfirm(true);
  };

  if (!ride) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const { driverAmount, adminAmount } = splitFare(ride.estimatedFare, ride.isFirstRide);

  let navInfo = null;
  if (driverLoc) {
    const targetLat = ride.status === 'in_progress' ? ride.toLat : ride.fromLat;
    const targetLon = ride.status === 'in_progress' ? ride.toLon : ride.fromLon;
    if (targetLat && targetLon) {
      const km = haversineKm(driverLoc.lat, driverLoc.lng, targetLat, targetLon);
      navInfo = { km: km.toFixed(1), mins: Math.max(1, Math.round((km / 30) * 60)) };
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={showConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <Text style={styles.confirmEmoji}>✅</Text>
            <Text style={styles.confirmTitle}>{t('tripCompleted')}</Text>
            <View style={styles.earningsBreakdown}>
              <TripRow label={t('tripPrice')} value={`${ride.estimatedFare} ${t('egp')}`} styles={styles} />
              <TripRow label={t('commission15')} value={`- ${adminAmount} ${t('egp')}`} color={colors.error} styles={styles} />
              <View style={styles.earningsTotal}>
                <Text style={styles.earningsTotalLabel}>{t('yourEarnings')}</Text>
                <Text style={styles.earningsTotalValue}>{driverAmount} {t('egp')}</Text>
              </View>
            </View>
            {ride.paymentMethod === 'cash'
              ? <Text style={styles.paymentNote}>💵 {t('cashCollectedNote')}</Text>
              : <Text style={styles.paymentNote}>💳 {t('earningsAddedNote')}</Text>
            }
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => { setShowConfirm(false); navigation.navigate('DriverTabs'); }}
            >
              <Text style={styles.doneBtnText}>{t('backToHome')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.mapWrap}>
        <LeafletMap
          ref={mapRef}
          center={{ lat: ride.fromLat ?? 30.0444, lng: ride.fromLon ?? 31.2357 }}
          zoom={14}
          height={280}
        />
        {navInfo && (
          <View style={styles.navOverlay}>
            <Text style={styles.navText}>
              {ride.status === 'in_progress' ? '🎯' : '🟢'} {navInfo.km} {t('km')} · ~{navInfo.mins} {t('min')}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.passengerCard}>
        {ride.passengerPhotoUrl
          ? <Image source={{ uri: ride.passengerPhotoUrl }} style={styles.passengerAvatarImg} />
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
          <Text style={{ fontSize: 12, color: colors.primary, marginLeft: 18, marginTop: 2, marginBottom: 4 }}>
            📍 {ride.pickupNote}
          </Text>
        ) : null}
        <View style={[styles.routeRow, { marginTop: 8 }]}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <Text style={styles.routeText}>{ride.to}</Text>
        </View>
      </View>

      <View style={styles.actionArea}>
        {ride.status === 'accepted' && (
          <AnimatedPressable style={styles.actionBtn} onPress={markArrived}>
            <Ionicons name="location" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>  {t('iArrivedAtPickup')}</Text>
          </AnimatedPressable>
        )}
        {ride.status === 'arrived' && (
          <AnimatedPressable style={styles.actionBtn} onPress={startTrip}>
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>  {t('startTrip')}</Text>
          </AnimatedPressable>
        )}
        {ride.status === 'in_progress' && (
          <AnimatedPressable style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={completeTrip}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>  {t('completeTrip')}</Text>
          </AnimatedPressable>
        )}
        {(ride.status === 'accepted' || ride.status === 'arrived') && (
          <TouchableOpacity style={styles.cancelDriverBtn} onPress={handleDriverCancel}>
            <Text style={styles.cancelDriverText}>{t('cancelRide')}</Text>
          </TouchableOpacity>
        )}
      </View>
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
    navOverlay: {
      position: 'absolute', bottom: 10, left: 10, right: 10,
      backgroundColor: 'rgba(26,26,46,0.85)', borderRadius: 10,
      paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center',
    },
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
    actionArea: { marginHorizontal: 16, marginBottom: 24 },
    actionBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    confirmModal: { backgroundColor: colors.white, borderRadius: 24, padding: 28, width: '100%', alignItems: 'center' },
    confirmEmoji: { fontSize: 56, marginBottom: 12 },
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
    cancelDriverBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
    cancelDriverText: { color: colors.error, fontSize: 14, fontWeight: '600' },
  });
}
