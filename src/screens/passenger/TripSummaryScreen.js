import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { auth } from '../../firebase/config';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
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
    if (!ride || submitting || submitted) return;
    setSubmitting(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('settle-ride', {
        body: { rideId, rating, comment: comment.trim() },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) throw new Error(error.message || 'Settlement failed');

      const { newTotal, newBadges } = data;
      const oldBadges = Math.floor((userProfile?.totalTrips || 0) / 10);

      if (newBadges > oldBadges) {
        setNewTripCount(newTotal);
        setBadgeVisible(true);
      }
      setSubmitted(true);
    } catch (err) {
      console.error('[TripSummary] settle-ride error:', err.message);
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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
            <Text style={styles.fareAmount}>{ride.finalFare || ride.estimatedFare} {t('egp')}</Text>
          </View>
        </View>

        {!submitted && (
          <View style={styles.card}>
            <Text style={styles.ratingTitle}>{t('rateDriver')}</Text>
            <Text style={styles.ratingDriverName}>{ride.driverName}</Text>
            <View style={{ alignItems: 'center', marginVertical: 10 }}>
              <RatingStars rating={rating} onRate={setRating} size={36} />
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
    scroll: { padding: 12, paddingBottom: 60 },
    successBanner: { alignItems: 'center', paddingVertical: 8 },
    successEmoji: { fontSize: 28, marginBottom: 4 },
    successTitle: { fontSize: 18, fontWeight: '800', color: colors.dark },
    successSub: { fontSize: 12, color: colors.gray, marginTop: 2 },
    card: { backgroundColor: colors.white, borderRadius: 16, padding: 12, marginBottom: 8, ...shadow.md },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLabel: { fontSize: 12, color: colors.gray },
    rowValue: { fontSize: 12, color: colors.dark, fontWeight: '600' },
    fareRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 2 },
    fareLabel: { fontSize: 13, fontWeight: '700', color: colors.dark },
    fareAmount: { fontSize: 17, fontWeight: '800', color: colors.primary },
    ratingTitle: { fontSize: 14, fontWeight: '700', color: colors.dark, textAlign: 'center' },
    ratingDriverName: { fontSize: 12, color: colors.gray, textAlign: 'center', marginTop: 2 },
    commentInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 8, fontSize: 13, color: colors.dark, minHeight: 52, textAlignVertical: 'top', marginBottom: 8 },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 4 },
    submitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    doneBtn: { backgroundColor: colors.white, borderRadius: 12, padding: 12, alignItems: 'center', ...shadow.sm, marginTop: 8 },
    doneText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  });
}
