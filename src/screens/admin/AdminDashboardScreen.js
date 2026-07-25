import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/SettingsContext';

export default function AdminDashboardScreen() {
  const { colors, shadow, t } = useTheme();
  const { user, signOut, userProfile } = useAuth();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  if (!userProfile || userProfile.role !== 'admin') {
    return null;
  }

  const [adminWallet, setAdminWallet] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('wallet');
  const [reconcilingId, setReconcilingId] = useState(null);
  const [reconcileResult, setReconcileResult] = useState(null);

  useEffect(() => {
    supabase
      .from('admin_wallet')
      .select('balance')
      .eq('id', 'admin')
      .single()
      .then(({ data }) => setAdminWallet(data || { balance: 0 }));

    const channel = supabase
      .channel('admin_wallet_watch')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'admin_wallet',
        filter: 'id=eq.admin',
      }, ({ new: row }) => setAdminWallet(row))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const loadReviews = async () => {
    setReviewsLoading(true);
    const { data, error } = await supabase
      .from('reviews')
      .select('id, ride_id, driver_id, passenger_id, passenger_name, rating, comment, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) setReviews(data);
    setReviewsLoading(false);
  };

  const loadDrivers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone, wallet, total_trips, approved')
      .eq('role', 'driver')
      .eq('approved', true)
      .order('wallet', { ascending: true });
    if (data) {
      setDrivers(data.map(d => ({
        uid:        d.id,
        name:       d.name,
        phone:      d.phone,
        wallet:     d.wallet ?? 0,
        totalTrips: d.total_trips ?? 0,
      })));
    }
  };

  useEffect(() => {
    loadReviews();
    loadDrivers();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    setReconcileResult(null);
    await Promise.all([loadReviews(), loadDrivers()]);
    setRefreshing(false);
  };

  const handleReconcile = async (driver) => {
    setReconcilingId(driver.uid);
    setReconcileResult(null);
    const { data, error } = await supabase.rpc('reconcile_wallet', {
      p_user_id:  driver.uid,
      p_admin_id: user.uid,
    });
    setReconcilingId(null);
    if (error) {
      Alert.alert('Reconcile Failed', error.message);
      return;
    }
    await loadDrivers();
    setReconcileResult({
      driverName: driver.name,
      previous:   data.previous_balance,
      corrected:  data.corrected_balance,
      delta:      data.delta,
    });
  };

  const totalDebt = drivers.reduce((s, d) => s + Math.min(0, d.wallet ?? 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🛡️ {t('adminDashboard')}</Text>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.signOutText}>{t('signOut')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.walletCard}>
        <View style={styles.walletRow}>
          <View>
            <Text style={styles.walletLabel}>{t('adminWalletBalance')}</Text>
            <Text style={styles.walletAmount}>{adminWallet?.balance ?? '…'} {t('egp')}</Text>
          </View>
          <Ionicons name="wallet" size={32} color={colors.primary} />
        </View>
        <View style={styles.walletDivider} />
        <View style={styles.walletRow}>
          <Text style={styles.walletSubLabel}>{t('totalDriverDebt')}</Text>
          <Text style={[styles.walletSubVal, { color: totalDebt < 0 ? colors.error : colors.success }]}>
            {Math.abs(totalDebt)} {t('egp')} {t('owed')}
          </Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {['wallet', 'reviews', 'drivers'].map(k => (
          <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabActive]} onPress={() => setTab(k)}>
            <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{t('adminTab_' + k)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {tab === 'wallet' && (
          <View>
            <Text style={styles.sectionTitle}>{t('adminCommissionHistory')}</Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoText}>{t('adminWalletNote')}</Text>
            </View>
            <View style={styles.statGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statNum}>{adminWallet?.balance ?? 0}</Text>
                <Text style={styles.statLabel}>{t('egp')} {t('earned')}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: colors.error }]}>{Math.abs(totalDebt)}</Text>
                <Text style={styles.statLabel}>{t('egp')} {t('pendingCollection')}</Text>
              </View>
            </View>
          </View>
        )}

        {tab === 'reviews' && (
          <View>
            <Text style={styles.sectionTitle}>{t('passengerReviews')}</Text>
            {reviewsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : reviews.length === 0 ? (
              <Text style={styles.emptyText}>{t('noReviews')}</Text>
            ) : reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewStars}>{'⭐'.repeat(r.rating || 0)}{r.rating ? '' : '—'}</Text>
                  <Text style={styles.reviewDate}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</Text>
                </View>
                {r.comment ? (
                  <Text style={styles.reviewComment}>{r.comment}</Text>
                ) : (
                  <Text style={[styles.reviewComment, { color: colors.gray, fontStyle: 'italic' }]}>{t('noComment')}</Text>
                )}
                <Text style={styles.reviewMeta}>
                  👩 {r.passenger_name || t('passenger')} → {t('driver')}: {r.driver_id?.slice(0, 8)}…
                </Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'drivers' && (
          <View>
            <Text style={styles.sectionTitle}>{t('driverCommissions')}</Text>

            {/* Reconcile result banner */}
            {reconcileResult && (
              <View style={[
                styles.reconcileBanner,
                { backgroundColor: reconcileResult.delta === 0 ? '#F0FDF4' : '#FEF3C7' },
              ]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Ionicons
                    name={reconcileResult.delta === 0 ? 'checkmark-circle' : 'refresh-circle'}
                    size={18}
                    color={reconcileResult.delta === 0 ? '#059669' : '#D97706'}
                  />
                  <Text style={[styles.reconcileBannerTitle, {
                    color: reconcileResult.delta === 0 ? '#059669' : '#92400E',
                  }]}>
                    {reconcileResult.delta === 0
                      ? `${reconcileResult.driverName} — balance is correct`
                      : `${reconcileResult.driverName} — balance corrected`}
                  </Text>
                </View>
                {reconcileResult.delta !== 0 && (
                  <Text style={styles.reconcileBannerDetail}>
                    {reconcileResult.previous} EGP → {reconcileResult.corrected} EGP
                    {'  '}({reconcileResult.delta > 0 ? '+' : ''}{reconcileResult.delta} EGP drift fixed)
                  </Text>
                )}
                <TouchableOpacity
                  onPress={() => setReconcileResult(null)}
                  style={{ position: 'absolute', top: 10, right: 10 }}
                >
                  <Ionicons name="close" size={16} color={colors.gray} />
                </TouchableOpacity>
              </View>
            )}

            {drivers.length === 0 ? (
              <Text style={styles.emptyText}>{t('noDrivers')}</Text>
            ) : drivers.map((d) => (
              <View key={d.uid} style={styles.driverRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverName}>{d.name}</Text>
                  <Text style={styles.driverPhone}>{d.phone || '—'}</Text>
                  <Text style={styles.driverTrips}>{d.totalTrips} {t('tripsLabel')}</Text>
                </View>
                <View style={styles.driverWalletBox}>
                  <Text style={[
                    styles.driverWallet,
                    d.wallet < 0 ? { color: colors.error } : { color: colors.success },
                  ]}>
                    {d.wallet} {t('egp')}
                  </Text>
                  {d.wallet < 0 && (
                    <Text style={styles.driverOwes}>{t('owes')} {Math.abs(d.wallet)} {t('egp')}</Text>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.reconcileBtn,
                      reconcilingId === d.uid && { opacity: 0.5 },
                    ]}
                    onPress={() => handleReconcile(d)}
                    disabled={reconcilingId !== null}
                  >
                    {reconcilingId === d.uid
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <>
                          <Ionicons name="sync-outline" size={12} color={colors.primary} />
                          <Text style={styles.reconcileBtnText}>Reconcile</Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primaryBg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 8 },
    headerTitle: { fontSize: 22, fontWeight: '800', color: colors.dark },
    signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.lightGray },
    signOutText: { fontSize: 13, fontWeight: '600', color: colors.error },
    walletCard: { margin: 16, backgroundColor: colors.primary, borderRadius: 20, padding: 20, ...shadow.md },
    walletRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    walletLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
    walletAmount: { fontSize: 32, fontWeight: '800', color: '#fff' },
    walletDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 12 },
    walletSubLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
    walletSubVal: { fontSize: 15, fontWeight: '700' },
    tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: colors.lightGray, borderRadius: 12, padding: 4 },
    tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
    tabActive: { backgroundColor: colors.white, ...shadow.sm },
    tabText: { fontSize: 13, fontWeight: '600', color: colors.gray },
    tabTextActive: { color: colors.primary },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.dark, marginBottom: 12 },
    infoCard: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, marginBottom: 16 },
    infoText: { fontSize: 13, color: '#1D4ED8', lineHeight: 20 },
    statGrid: { flexDirection: 'row', gap: 12 },
    statBox: { flex: 1, backgroundColor: colors.white, borderRadius: 14, padding: 16, alignItems: 'center', ...shadow.sm },
    statNum: { fontSize: 26, fontWeight: '800', color: colors.primary },
    statLabel: { fontSize: 11, color: colors.gray, marginTop: 4, textAlign: 'center' },
    reviewCard: { backgroundColor: colors.white, borderRadius: 14, padding: 16, marginBottom: 12, ...shadow.sm },
    reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    reviewStars: { fontSize: 14 },
    reviewDate: { fontSize: 11, color: colors.gray },
    reviewComment: { fontSize: 14, color: colors.dark, lineHeight: 20, marginBottom: 8 },
    reviewMeta: { fontSize: 11, color: colors.gray },
    driverRow: { backgroundColor: colors.white, borderRadius: 14, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', ...shadow.sm },
    driverName: { fontSize: 15, fontWeight: '700', color: colors.dark },
    driverPhone: { fontSize: 12, color: colors.gray, marginTop: 2 },
    driverTrips: { fontSize: 12, color: colors.primary, marginTop: 2 },
    driverWalletBox: { alignItems: 'flex-end' },
    driverWallet: { fontSize: 18, fontWeight: '800' },
    driverOwes: { fontSize: 11, color: colors.error, marginTop: 2, fontWeight: '600' },
    reconcileBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      marginTop: 8, paddingVertical: 5, paddingHorizontal: 10,
      borderRadius: 8, borderWidth: 1.5, borderColor: colors.primary,
      backgroundColor: colors.primaryBg, minWidth: 80, justifyContent: 'center',
    },
    reconcileBtnText: { fontSize: 11, fontWeight: '700', color: colors.primary },
    reconcileBanner: {
      borderRadius: 14, padding: 16, marginBottom: 14,
      borderWidth: 1, borderColor: '#D1FAE5', position: 'relative',
    },
    reconcileBannerTitle: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
    reconcileBannerDetail: { fontSize: 12, color: '#92400E', lineHeight: 18 },
    emptyText: { textAlign: 'center', color: colors.gray, fontSize: 14, marginTop: 24 },
  });
}
