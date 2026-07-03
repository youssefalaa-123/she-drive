import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, addDoc, query, where, onSnapshot,
  serverTimestamp, doc, updateDoc, arrayUnion,
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
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [activeRideId, setActiveRideId] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef(null);

  const isFirstRide = (userProfile?.totalTrips ?? 0) === 0;
  const baseFare = routeInfo ? calculateFare(routeInfo.distanceKm) : 0;
  const displayFare = isFirstRide ? applyFirstRideDiscount(baseFare) : baseFare;
  const CARD_FEE_PCT = 3;
  const cardFee = (paymentMethod === 'card' || paymentMethod.startsWith('wallet+card')) && routeInfo
    ? Math.round(displayFare * CARD_FEE_PCT / 100)
    : 0;
  const finalFare = displayFare + cardFee;
  const walletBalance = userProfile?.wallet || 0;
  const walletShortfall = routeInfo ? Math.max(0, finalFare - walletBalance) : 0;
  const walletAmountPaid = Math.min(walletBalance, finalFare);
  const remainingAmount = finalFare - walletAmountPaid;
  const savedCards = userProfile?.savedCards || [];
  const defaultCard = savedCards[0] || null;

  useEffect(() => {
    if (!navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      null,
      { timeout: 6000 }
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
    if (!user) return;
    const q = query(
      collection(db, 'rides'),
      where('passengerId', '==', user.uid),
      where('status', 'in', ['searching', 'accepted', 'arrived', 'in_progress'])
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const ride = { id: snap.docs[0].id, ...snap.docs[0].data() };
        if (ride.status === 'searching') { setSearching(true); setActiveRideId(ride.id); }
        else { setSearching(false); navigation.navigate('ActiveRide', { rideId: ride.id }); }
      } else { setSearching(false); setActiveRideId(null); }
    });
  }, [user]);

  const handleMapClick = useCallback(async (lat, lng) => {
    const address = await reverseGeocode(lat, lng);
    const place = { address, lat, lng };
    if (mapMode === 'pickup') setPickup(place);
    else setDestination(place);
  }, [mapMode]);

  const handleUseMyLocation = () => {
    if (!navigator?.geolocation) { Alert.alert('Not supported', 'Geolocation is not available.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const address = await reverseGeocode(lat, lng);
        setPickup({ address, lat, lng });
        setUserLocation({ lat, lng });
        setLocating(false);
      },
      () => { setLocating(false); Alert.alert('Denied', 'Please allow location access.'); },
      { timeout: 8000 }
    );
  };

  const handleRequest = async () => {
    if (!pickup || !destination) { Alert.alert(t('missingInfo'), t('missingInfoMsg')); return; }
    if (!routeInfo) { Alert.alert(t('loading'), 'Please wait for the route to be calculated.'); return; }
    if (paymentMethod === 'wallet' && walletBalance < displayFare) {
      Alert.alert(t('insufficientWallet'), t('insufficientWalletMsg'));
      return;
    }
    try {
      const rideRef = await addDoc(collection(db, 'rides'), {
        passengerId: user.uid, passengerName: userProfile.name,
        from: pickup.address, to: destination.address,
        fromLat: pickup.lat, fromLon: pickup.lng,
        toLat: destination.lat, toLon: destination.lng,
        distanceKm: routeInfo.distanceKm, durationMins: routeInfo.durationMins,
        estimatedFare: finalFare, baseFare: displayFare, cardFee,
        paymentMethod,
        walletAmountPaid: paymentMethod.startsWith('wallet') ? walletAmountPaid : 0,
        remainingAmount: paymentMethod.startsWith('wallet+') ? remainingAmount : 0,
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

  const handleSaveCard = async (cardData) => {
    await updateDoc(doc(db, 'users', user.uid), { savedCards: arrayUnion(cardData) });
  };

  const handleCancel = async () => {
    if (activeRideId) {
      try { await updateDoc(doc(db, 'rides', activeRideId), { status: 'cancelled' }); } catch (_) {}
    }
    setSearching(false);
    setActiveRideId(null);
  };

  if (searching) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.searchingWrap}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 24 }} />
          <Text style={styles.searchTitle}>{t('findingDriver')}</Text>
          <Text style={styles.searchSub}>{t('connectingDriver')}</Text>
          <View style={styles.searchCard}>
            <Text style={styles.searchRoute}>📍 {pickup?.address}</Text>
            <Text style={[styles.searchRoute, { color: colors.primary }]}>🎯 {destination?.address}</Text>
            {routeInfo && <Text style={styles.searchMeta}>{routeInfo.distanceKm} km · ~{routeInfo.durationMins} min</Text>}
            <Text style={styles.searchFare}>{displayFare} EGP{isFirstRide ? '  🎉' : ''}</Text>
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
          <LeafletMap ref={mapRef} zoom={12} height={270} onMapClick={handleMapClick} />
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
                  style={[styles.splitBtn, paymentMethod === 'wallet+cash' && styles.splitBtnActive]}
                  onPress={() => setPaymentMethod('wallet+cash')}
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
                    {t('card')}{'\n'}{walletShortfall} EGP
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
    locateBtn: { padding: 6, marginLeft: 4 },
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
    searchRoute: { fontSize: 16, color: colors.dark, marginBottom: 6 },
    searchMeta: { fontSize: 13, color: colors.gray, marginTop: 4 },
    searchFare: { fontSize: 22, fontWeight: '800', color: colors.primary, marginTop: 8 },
    cancelBtn: { paddingVertical: 12, paddingHorizontal: 32 },
    cancelText: { color: colors.error, fontSize: 16, fontWeight: '600' },
  });
}
