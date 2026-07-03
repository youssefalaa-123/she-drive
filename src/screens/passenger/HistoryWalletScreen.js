import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/SettingsContext';
import WalletTopUpModal from '../../components/WalletTopUpModal';

export default function HistoryWalletScreen() {
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [tab, setTab] = useState('history');
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topUpVisible, setTopUpVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'rides'),
      where('passengerId', '==', user.uid),
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
        {[{ key: 'history', icon: 'time-outline' }, { key: 'wallet', icon: 'wallet-outline' }].map(({ key, icon }) => (
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
              {key === 'history' ? t('history') : t('wallet')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'history' ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionTitle}>{t('tripHistory')}</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : rides.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🗺️</Text>
              <Text style={styles.emptyText}>{t('noTripsYet')}</Text>
            </View>
          ) : (
            rides.map((ride) => (
              <View key={ride.id} style={styles.rideCard}>
                <View style={styles.rideHeader}>
                  <Text style={styles.rideDate}>{formatDate(ride.createdAt)}</Text>
                  <Text style={styles.rideFare}>{ride.estimatedFare} EGP</Text>
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
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionTitle}>{t('myWallet')}</Text>

          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>{t('currentBalance')}</Text>
            <Text style={styles.balanceAmount}>{userProfile?.wallet || 0} EGP</Text>
            <TouchableOpacity style={styles.topupBtn} onPress={() => setTopUpVisible(true)}>
              <Ionicons name="add-circle-outline" size={18} color={colors.white} />
              <Text style={styles.topupText}>  {t('addFunds')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{userProfile?.totalTrips || 0}</Text>
              <Text style={styles.statLabel}>{t('totalTrips')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{userProfile?.badges || 0}</Text>
              <Text style={styles.statLabel}>🏅 {t('badgesLabel')}</Text>
            </View>
          </View>

          <View style={styles.howItWorksCard}>
            <Text style={styles.howTitle}>{t('howWalletWorks')}</Text>
            <Text style={styles.howItem}>{t('topUpToPay')}</Text>
            <Text style={styles.howItem}>{t('firstTripDiscount')}</Text>
            <Text style={styles.howItem}>{t('earnBadge')}</Text>
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
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 0,
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
    sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.dark, marginBottom: 16 },
    rideCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 12, ...shadow.sm },
    rideHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    rideDate: { fontSize: 12, color: colors.gray },
    rideFare: { fontSize: 16, fontWeight: '800', color: colors.primary },
    rideRoute: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    routeText: { fontSize: 13, color: colors.dark, flex: 1 },
    rideMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 },
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
    balanceAmount: { fontSize: 48, fontWeight: '800', color: '#fff', marginBottom: 20 },
    topupBtn: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
      paddingVertical: 10, paddingHorizontal: 20,
    },
    topupText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    statCard: { flex: 1, backgroundColor: colors.white, borderRadius: 16, padding: 20, alignItems: 'center', ...shadow.sm },
    statNum: { fontSize: 32, fontWeight: '800', color: colors.primary },
    statLabel: { fontSize: 13, color: colors.gray, marginTop: 4 },
    howItWorksCard: { backgroundColor: colors.white, borderRadius: 16, padding: 20, ...shadow.sm },
    howTitle: { fontSize: 15, fontWeight: '700', color: colors.dark, marginBottom: 12 },
    howItem: { fontSize: 14, color: colors.gray, marginBottom: 8, lineHeight: 20 },
  });
}
