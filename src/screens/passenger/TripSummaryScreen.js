import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { doc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { supabase } from '../../lib/supabase';
import { generateCoachingMessage } from '../../hooks/useCoaching';
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
  const [comment, setComment] = useState('');
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

      // Payment settlement (fire individually so one failure doesn't block trip count)
      try {
        if (method === 'card') {
          await updateDoc(doc(db, 'users', ride.driverId), { wallet: increment(driverAmount) });
        } else if (method === 'wallet') {
          await updateDoc(doc(db, 'users', user.uid), { wallet: increment(-fare) });
          if (ride.driverId) await updateDoc(doc(db, 'users', ride.driverId), { wallet: increment(driverAmount) });
        } else if (method === 'wallet+card') {
          await updateDoc(doc(db, 'users', user.uid), { wallet: increment(-walletPaid) });
          if (ride.driverId) await updateDoc(doc(db, 'users', ride.driverId), { wallet: increment(driverAmount) });
        } else if (method === 'wallet+cash') {
          const walletDriverShare = Math.round(walletPaid * 0.85);
          const cashCommission = Math.round(cashOrCardPaid * 0.15);
          await updateDoc(doc(db, 'users', user.uid), { wallet: increment(-walletPaid) });
          if (ride.driverId) await updateDoc(doc(db, 'users', ride.driverId), { wallet: increment(walletDriverShare - cashCommission) });
        } else if (ride.driverId) {
          await updateDoc(doc(db, 'users', ride.driverId), { wallet: increment(-adminAmount) });
        }
      } catch (_) {}

      await updateDoc(doc(db, 'rides', rideId), {
        passengerRating: rating,
        finalFare: fare,
        completedAt: serverTimestamp(),
      });

      if (rating > 0 && ride.driverId) {
        try {
          const driverSnap = await getDoc(doc(db, 'users', ride.driverId));
          if (driverSnap.exists()) {
            const d = driverSnap.data();
            const newCount = (d.ratingCount || 0) + 1;
            const newRating = ((d.rating || 0) * (d.ratingCount || 0) + rating) / newCount;
            await updateDoc(doc(db, 'users', ride.driverId), { rating: newRating, ratingCount: newCount });
          }
        } catch (_) {}
      }

      const newBadges = Math.floor(newTotal / 10);
      const oldBadges = Math.floor((userProfile?.totalTrips || 0) / 10);
      // Always increment trip count — must not be inside a payment try/catch
      await updateDoc(doc(db, 'users', user.uid), { totalTrips: increment(1), badges: newBadges });
      if (ride.driverId) await updateDoc(doc(db, 'users', ride.driverId), { totalTrips: increment(1) });

      supabase.from('rides').upsert({
        id: rideId,
        passenger_id: user.uid,
        driver_id: ride.driverId,
        from_address: ride.from,
        to_address: ride.to,
        distance_km: ride.distanceKm,
        duration_mins: ride.durationMins,
        estimated_fare: ride.estimatedFare,
        final_fare: fare,
        base_fare: ride.baseFare,
        card_fee: ride.cardFee ?? 0,
        payment_method: ride.paymentMethod,
        status: 'completed',
        is_first_ride: ride.isFirstRide ?? false,
        driver_earnings: driverAmount,
        cancellation_fee: 0,
      }, { onConflict: 'id' }).then(() => {});

      // Save review (always, even without a comment)
      supabase.from('reviews').insert({
        ride_id: rideId,
        driver_id: ride.driverId,
        passenger_id: user.uid,
        passenger_name: userProfile?.name,
        rating: rating > 0 ? rating : null,
        comment: comment.trim() || null,
      }).then(() => {});

      // Update passenger streak
      const today = new Date().toISOString().split('T')[0];
      supabase.from('profiles').select('current_streak, longest_streak, last_ride_date').eq('id', user.uid).single()
        .then(({ data: p }) => {
          if (!p) return;
          const last = p.last_ride_date;
          const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          let newStreak = 1;
          if (last === today) return; // already counted today
          if (last === yesterdayStr) newStreak = (p.current_streak ?? 0) + 1;
          const newLongest = Math.max(p.longest_streak ?? 0, newStreak);
          supabase.from('profiles').update({ current_streak: newStreak, longest_streak: newLongest, last_ride_date: today })
            .eq('id', user.uid).then(() => {});
        });

      // Fire-and-forget coaching message from Claude
      generateCoachingMessage(user.uid);

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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
            <TextInput
              style={styles.commentInput}
              placeholder={t('leaveComment') || 'Leave a comment (optional)'}
              placeholderTextColor={colors.gray}
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={200}
            />
          </View>
        )}
      </ScrollView>
      {!submitted && (
        <View style={styles.stickyFooter}>
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
        <View style={styles.stickyFooter}>
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
            <Text style={styles.doneText}>{t('backToHome')}</Text>
          </TouchableOpacity>
        </View>
      )}
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
    scroll: { padding: 20, paddingBottom: 120 },
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
    commentInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.dark, minHeight: 72, textAlignVertical: 'top', marginBottom: 14 },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
    submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    doneBtn: { backgroundColor: colors.white, borderRadius: 12, padding: 16, alignItems: 'center', ...shadow.sm },
    doneText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
    stickyFooter: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10, backgroundColor: colors.primaryBg, borderTopWidth: 1, borderTopColor: colors.border },
  });
}
