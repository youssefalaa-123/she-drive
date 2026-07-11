import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { splitFare } from '../../utils/pricing';
import { useTheme } from '../../context/SettingsContext';
import WalletTopUpModal from '../../components/WalletTopUpModal';
import WithdrawalModal from '../../components/WithdrawalModal';

export default function EarningsScreen() {
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [tab, setTab] = useState('earnings');
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topUpVisible, setTopUpVisible] = useState(false);
  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const [walletHistory, setWalletHistory] = useState([]);
  const [walletHistoryLoading, setWalletHistoryLoading] = useState(true);
  const [reviewsMap, setReviewsMap] = useState({});

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', user.uid),
      where('status', '==', 'completed')
    );
    return onSnapshot(q,
      (snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setRides(sorted);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user]);

  // Fetch written comments from Supabase reviews table (historical comments live there)
  useEffect(() => {
    if (!user) return;
    supabase
      .from('reviews')
      .select('ride_id, rating, comment')
      .eq('driver_id', user.uid)
      .then(({ data, error }) => {
        if (error) { console.error('[EarningsScreen] Supabase reviews fetch failed:', error.message); return; }
        if (!data || data.length === 0) return;
        const map = {};
        data.forEach(r => { if (r.ride_id) map[r.ride_id] = r; });
        setReviewsMap(map);
      });
  }, [user?.uid]);

  // Sync totalTrips field whenever ride count doesn't match (catches any drift)
  useEffect(() => {
    if (!user || loading) return;
    if (rides.length !== (userProfile?.totalTrips || 0)) {
      updateDoc(doc(db, 'users', user.uid), { totalTrips: rides.length }).catch(() => {});
    }
  }, [rides.length, userProfile?.totalTrips, loading]);

  // Wallet history listener
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, 'users', user.uid, 'walletHistory'),
      (snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setWalletHistory(sorted);
        setWalletHistoryLoading(false);
      },
      () => setWalletHistoryLoading(false)
    );
  }, [user]);

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-EG', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-EG', { day: 'numeric', month: 'short' }) + ', ' +
      d.toLocaleTimeString('en-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const totalEarned = rides.reduce(
    (sum, r) => sum + splitFare(r.estimatedFare || 0, r.isFirstRide).driverAmount,
    0
  );

  return (
    <SafeAreaView style={styles.container}>
      <WalletTopUpModal
        visible={topUpVisible}
        onClose={() => setTopUpVisible(false)}
        userId={user?.uid}
        savedCards={userProfile?.savedCards || []}
        onCardAdded={() => {}}
      />
      <WithdrawalModal
        visible={withdrawVisible}
        onClose={() => setWithdrawVisible(false)}
        userId={user?.uid}
        currentBalance={userProfile?.wallet || 0}
      />
      <View style={styles.tabBar}>
        {[{ key: 'earnings', icon: 'stats-chart-outline' }, { key: 'wallet', icon: 'wallet-outline' }].map(({ key, icon }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key)}
          >
            <Ionicons
              name={icon}
              size={16}
              color={tab === key ? colors.primary : colors.gray}
            />
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {key === 'earnings' ? t('earnings') : t('wallet')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'earnings' ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('allTimeEarnings')}</Text>
            <Text style={styles.summaryAmount}>{totalEarned} EGP</Text>
            <Text style={styles.summaryTrips}>{rides.length} {t('tripsCompleted')}</Text>
          </View>

          <Text style={styles.sectionTitle}>{t('tripHistoryLabel')}</Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : rides.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🚗</Text>
              <Text style={styles.emptyText}>{t('noTripsDriver')}</Text>
            </View>
          ) : (
            rides.map((ride) => {
              const { driverAmount: earned, adminAmount: commission } = splitFare(ride.estimatedFare, ride.isFirstRide);
              const passengerComment = ride.passengerComment || reviewsMap[ride.id]?.comment || null;
              return (
                <View key={ride.id} style={styles.rideCard}>
                  <View style={styles.rideHeader}>
                    <Text style={styles.rideDate}>{formatDate(ride.createdAt)}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.rideEarning}>{earned} EGP</Text>
                      {!ride.isFirstRide && (
                        <Text style={styles.rideCommission}>-{commission} EGP commission</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.rideRoute}>
                    <View style={[styles.dot, { backgroundColor: colors.success }]} />
                    <Text style={styles.routeText} numberOfLines={1}>{ride.from}</Text>
                  </View>
                  <View style={styles.rideRoute}>
                    <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                    <Text style={styles.routeText} numberOfLines={1}>{ride.to}</Text>
                  </View>
                  <View style={styles.rideMeta}>
                    <Text style={styles.metaItem}>{ride.distanceKm} km</Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaItem}>{ride.paymentMethod}</Text>
                    {ride.passengerRating > 0 && (
                      <>
                        <Text style={styles.metaDot}>•</Text>
                        <Text style={[styles.metaItem, { color: colors.gold }]}>{'★'.repeat(ride.passengerRating)}</Text>
                      </>
                    )}
                  </View>
                  {passengerComment ? (
                    <View style={styles.reviewBubble}>
                      <Text style={styles.reviewText}>"{passengerComment}"</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>{t('walletBalance')}</Text>
            <Text style={styles.balanceAmount}>{userProfile?.wallet || 0} EGP</Text>
            <Text style={styles.balanceSub}>{t('commissionNote')}</Text>
            <TouchableOpacity style={styles.topUpBtn} onPress={() => setTopUpVisible(true)}>
              <Text style={styles.topUpText}>{t('topUpWalletBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.withdrawBtn} onPress={() => setWithdrawVisible(true)}>
              <Text style={styles.withdrawText}>{t('withdrawFundsBtn')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.historyTitle}>{t('walletHistory')}</Text>
          {walletHistoryLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginBottom: 16 }} />
          ) : walletHistory.length === 0 ? (
            <View style={[styles.empty, { marginTop: 0, marginBottom: 20 }]}>
              <Text style={styles.emptyText}>{t('noWalletHistory')}</Text>
            </View>
          ) : (
            walletHistory.map((entry) => (
              <View key={entry.id} style={styles.txCard}>
                <View style={[styles.txIcon, { backgroundColor: entry.amount >= 0 ? '#DCFCE7' : '#FEE2E2' }]}>
                  <Ionicons
                    name={entry.amount >= 0 ? 'arrow-down-outline' : 'arrow-up-outline'}
                    size={18}
                    color={entry.amount >= 0 ? colors.success : colors.error}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txDesc}>{entry.description}</Text>
                  <Text style={styles.txDate}>{formatDateTime(entry.createdAt)}</Text>
                </View>
                <Text style={[styles.txAmount, { color: entry.amount >= 0 ? colors.success : colors.error }]}>
                  {entry.amount >= 0 ? '+' : ''}{entry.amount} {t('egp')}
                </Text>
              </View>
            ))
          )}

          <View style={styles.commissionCard}>
            <Text style={styles.commTitle}>{t('commissionStructure')}</Text>
            <View style={styles.commRow}>
              <Text style={styles.commItem}>{t('cashPayments')}</Text>
              <Text style={styles.commValue}>{t('deductedWallet')}</Text>
            </View>
            <View style={styles.commRow}>
              <Text style={styles.commItem}>{t('cardWalletPayments')}</Text>
              <Text style={styles.commValue}>{t('creditedWallet')}</Text>
            </View>
            <View style={styles.commRow}>
              <Text style={styles.commItem}>{t('firstTimePassenger')}</Text>
              <Text style={[styles.commValue, { color: colors.success }]}>{t('noCommission')}</Text>
            </View>
          </View>

          <View style={styles.ratingCard}>
            <Ionicons name="star" size={24} color={colors.gold} />
            <Text style={styles.ratingValue}>
              {userProfile?.rating ? userProfile.rating.toFixed(1) : t('noRatingsYet')}
            </Text>
            <Text style={styles.ratingCount}>
              {userProfile?.ratingCount
                ? `Based on ${userProfile.ratingCount} rating${userProfile.ratingCount !== 1 ? 's' : ''}`
                : ''}
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primaryBg },
    tabBar: {
      flexDirection: 'row', backgroundColor: colors.white,
      paddingHorizontal: 20, paddingTop: 16,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    tab: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingBottom: 12, gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 14, color: colors.gray, fontWeight: '600' },
    tabTextActive: { color: colors.primary },
    scroll: { padding: 20, paddingBottom: 40 },
    summaryCard: {
      backgroundColor: colors.primary, borderRadius: 20, padding: 28,
      alignItems: 'center', marginBottom: 24, ...shadow.lg,
    },
    summaryLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
    summaryAmount: { fontSize: 44, fontWeight: '800', color: '#fff' },
    summaryTrips: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 6 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.dark, marginBottom: 14 },
    rideCard: { backgroundColor: colors.white, borderRadius: 14, padding: 16, marginBottom: 10, ...shadow.sm },
    rideHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    rideDate: { fontSize: 12, color: colors.gray },
    rideEarning: { fontSize: 16, fontWeight: '800', color: colors.primary },
    rideCommission: { fontSize: 11, color: colors.error },
    rideRoute: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    routeText: { fontSize: 13, color: colors.dark, flex: 1 },
    rideMeta: { flexDirection: 'row', marginTop: 8, gap: 4 },
    metaItem: { fontSize: 12, color: colors.gray },
    metaDot: { fontSize: 12, color: colors.border },
    reviewBubble: { backgroundColor: colors.primaryBg, borderRadius: 8, padding: 8, marginTop: 8 },
    reviewText: { fontSize: 12, color: colors.dark, fontStyle: 'italic' },
    empty: { alignItems: 'center', marginTop: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 16 },
    emptyText: { fontSize: 15, color: colors.gray, textAlign: 'center' },
    balanceCard: {
      backgroundColor: colors.primary, borderRadius: 20, padding: 28,
      alignItems: 'center', marginBottom: 16, ...shadow.lg,
    },
    balanceLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
    balanceAmount: { fontSize: 44, fontWeight: '800', color: '#fff' },
    balanceSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 },
    topUpBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24, marginTop: 14 },
    topUpText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    withdrawBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24, marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
    withdrawText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    commissionCard: { backgroundColor: colors.white, borderRadius: 16, padding: 20, marginBottom: 14, ...shadow.sm },
    commTitle: { fontSize: 15, fontWeight: '700', color: colors.dark, marginBottom: 14 },
    commRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    commItem: { fontSize: 13, color: colors.dark },
    commValue: { fontSize: 13, color: colors.gray, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 8 },
    ratingCard: { backgroundColor: colors.white, borderRadius: 16, padding: 20, alignItems: 'center', ...shadow.sm, gap: 6 },
    ratingValue: { fontSize: 32, fontWeight: '800', color: colors.dark },
    ratingCount: { fontSize: 13, color: colors.gray },
    historyTitle: { fontSize: 15, fontWeight: '700', color: colors.dark, marginBottom: 10 },
    txCard: { backgroundColor: colors.white, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.sm },
    txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    txDesc: { fontSize: 13, color: colors.dark, fontWeight: '600' },
    txDate: { fontSize: 11, color: colors.gray, marginTop: 2 },
    txAmount: { fontSize: 14, fontWeight: '800' },
  });
}
