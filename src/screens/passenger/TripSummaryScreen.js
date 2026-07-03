import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { doc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { splitFare } from '../../utils/pricing';
import { useTheme } from '../../context/SettingsContext';
import RatingStars from '../../components/RatingStars';
import BadgeModal from '../../components/BadgeModal';

export default function TripSummaryScreen({ navigation, route }) {
  const { rideId } = route.params;
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [ride, setRide] = useState(null);
  const [rating, setRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [newTripCount, setNewTripCount] = useState(0);

  useEffect(() => {
    getDoc(doc(db, 'rides', rideId)).then((snap) => {
      if (snap.exists()) setRide({ id: snap.id, ...snap.data() });
    });
  }, [rideId]);

  const handleSubmit = async () => {
    if (!ride || submitting) return;
    setSubmitting(true);
    const fare = ride.estimatedFare;
    const { driverAmount, adminAmount } = splitFare(fare, ride.isFirstRide);
    const newTotal = (userProfile?.totalTrips || 0) + 1;

    try {
      const method = ride.paymentMethod;
      const walletPaid = ride.walletAmountPaid || 0;
      const cashOrCardPaid = ride.remainingAmount || 0;

      if (method === 'card') {
        await updateDoc(doc(db, 'users', ride.driverId), { wallet: increment(driverAmount) });
      } else if (method === 'wallet') {
        await updateDoc(doc(db, 'users', user.uid), { wallet: increment(-fare) });
        await updateDoc(doc(db, 'users', ride.driverId), { wallet: increment(driverAmount) });
      } else if (method === 'wallet+card') {
        await updateDoc(doc(db, 'users', user.uid), { wallet: increment(-walletPaid) });
        await updateDoc(doc(db, 'users', ride.driverId), { wallet: increment(driverAmount) });
      } else if (method === 'wallet+cash') {
        const walletDriverShare = Math.round(walletPaid * 0.85);
        const cashCommission = Math.round(cashOrCardPaid * 0.15);
        await updateDoc(doc(db, 'users', user.uid), { wallet: increment(-walletPaid) });
        await updateDoc(doc(db, 'users', ride.driverId), { wallet: increment(walletDriverShare - cashCommission) });
      } else {
        await updateDoc(doc(db, 'users', ride.driverId), { wallet: increment(-adminAmount) });
      }

      await updateDoc(doc(db, 'rides', rideId), {
        passengerRating: rating,
        finalFare: fare,
        completedAt: serverTimestamp(),
      });

      if (rating > 0) {
        const driverSnap = await getDoc(doc(db, 'users', ride.driverId));
        if (driverSnap.exists()) {
          const d = driverSnap.data();
          const newCount = (d.ratingCount || 0) + 1;
          const newRating = ((d.rating || 0) * (d.ratingCount || 0) + rating) / newCount;
          await updateDoc(doc(db, 'users', ride.driverId), { rating: newRating, ratingCount: newCount });
        }
      }

      const newBadges = Math.floor(newTotal / 10);
      const oldBadges = Math.floor((userProfile?.totalTrips || 0) / 10);
      await updateDoc(doc(db, 'users', user.uid), { totalTrips: increment(1), badges: newBadges });
      await updateDoc(doc(db, 'users', ride.driverId), { totalTrips: increment(1) });

      if (newBadges > oldBadges) {
        setNewTripCount(newTotal);
        setBadgeVisible(true);
      }
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      Alert.alert(t('error'), t('submissionFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => navigation.navigate('PassengerTabs');

  if (!ride) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <BadgeModal
        visible={badgeVisible}
        tripCount={newTripCount}
        onClose={() => { setBadgeVisible(false); handleDone(); }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.successBanner}>
          <Text style={styles.successEmoji}>✅</Text>
          <Text style={styles.successTitle}>{t('tripComplete')}</Text>
          <Text style={styles.successSub}>{t('arrivedSafely')}</Text>
        </View>

        <View style={styles.card}>
          <Row label={t('from')} value={ride.from} styles={styles} />
          <Row label={t('to')} value={ride.to} styles={styles} />
          <Row label={t('distance')} value={`${ride.distanceKm} ${t('km')}`} styles={styles} />
          <Row label={t('payment')} value={paymentLabel(ride.paymentMethod, t)} styles={styles} />
          {ride.paymentMethod === 'wallet+cash' && (
            <>
              <Row label={t('walletCharged')} value={`${ride.walletAmountPaid} ${t('egp')}`} styles={styles} />
              <Row label={t('cashToDriver')} value={`${ride.remainingAmount} ${t('egp')}`} styles={styles} />
            </>
          )}
          {ride.paymentMethod === 'wallet+card' && (
            <>
              <Row label={t('walletCharged')} value={`${ride.walletAmountPaid} ${t('egp')}`} styles={styles} />
              <Row label={t('cardCharged')} value={`${ride.remainingAmount} ${t('egp')}`} styles={styles} />
            </>
          )}
          {ride.isFirstRide && (
            <Row label={t('discount')} value={t('firstRideBadge')} highlight styles={styles} goldColor={colors.gold} />
          )}
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>{t('totalFare')}</Text>
            <Text style={styles.fareAmount}>{ride.estimatedFare} {t('egp')}</Text>
          </View>
        </View>

        {!submitted && (
          <View style={styles.card}>
            <Text style={styles.ratingTitle}>{t('rateDriver')}</Text>
            <Text style={styles.ratingDriverName}>{ride.driverName}</Text>
            <View style={{ alignItems: 'center', marginVertical: 16 }}>
              <RatingStars rating={rating} onRate={setRating} size={44} />
            </View>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>{rating === 0 ? t('skipFinish') : t('submitRating')}</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {submitted && !badgeVisible && (
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
            <Text style={styles.doneText}>{t('backToHome')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function paymentLabel(method, t) {
  switch (method) {
    case 'cash':        return t('paymentCash');
    case 'card':        return t('paymentCard');
    case 'wallet':      return t('paymentWallet');
    case 'wallet+cash': return t('paymentWalletCash');
    case 'wallet+card': return t('paymentWalletCard');
    default:            return method;
  }
}

function Row({ label, value, highlight, styles, goldColor }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && { color: goldColor, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primaryBg },
    scroll: { padding: 20, paddingBottom: 40 },
    successBanner: { alignItems: 'center', paddingVertical: 32 },
    successEmoji: { fontSize: 56, marginBottom: 12 },
    successTitle: { fontSize: 26, fontWeight: '800', color: colors.dark },
    successSub: { fontSize: 14, color: colors.gray, marginTop: 6 },
    card: { backgroundColor: colors.white, borderRadius: 20, padding: 20, marginBottom: 16, ...shadow.md },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLabel: { fontSize: 14, color: colors.gray },
    rowValue: { fontSize: 14, color: colors.dark, fontWeight: '600' },
    fareRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, marginTop: 4 },
    fareLabel: { fontSize: 16, fontWeight: '700', color: colors.dark },
    fareAmount: { fontSize: 22, fontWeight: '800', color: colors.primary },
    ratingTitle: { fontSize: 18, fontWeight: '700', color: colors.dark, textAlign: 'center' },
    ratingDriverName: { fontSize: 14, color: colors.gray, textAlign: 'center', marginTop: 4 },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
    submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    doneBtn: { backgroundColor: colors.white, borderRadius: 12, padding: 16, alignItems: 'center', ...shadow.sm },
    doneText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  });
}
