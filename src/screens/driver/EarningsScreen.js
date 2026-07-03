import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { splitFare } from '../../utils/pricing';
import { useTheme } from '../../context/SettingsContext';
import WalletTopUpModal from '../../components/WalletTopUpModal';

export default function EarningsScreen() {
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [tab, setTab] = useState('earnings');
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topUpVisible, setTopUpVisible] = useState(false);

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

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-EG', { day: 'numeric', month: 'short', year: 'numeric' });
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
                        <Text style={styles.metaItem}>{'★'.repeat(ride.passengerRating)}</Text>
                      </>
                    )}
                  </View>
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
          </View>

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
              {userProfile?.rating ? userProfile.rating.toFixed(1) : 'No ratings yet'}
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
    commissionCard: { backgroundColor: colors.white, borderRadius: 16, padding: 20, marginBottom: 14, ...shadow.sm },
    commTitle: { fontSize: 15, fontWeight: '700', color: colors.dark, marginBottom: 14 },
    commRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    commItem: { fontSize: 13, color: colors.dark },
    commValue: { fontSize: 13, color: colors.gray, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 8 },
    ratingCard: { backgroundColor: colors.white, borderRadius: 16, padding: 20, alignItems: 'center', ...shadow.sm, gap: 6 },
    ratingValue: { fontSize: 32, fontWeight: '800', color: colors.dark },
    ratingCount: { fontSize: 13, color: colors.gray },
  });
}
