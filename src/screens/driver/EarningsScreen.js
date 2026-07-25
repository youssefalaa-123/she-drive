import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GREEN = '#059669';
const RED   = '#DC2626';

const DRIVER_TX_META = {
  trip_earnings:       { icon: 'trending-up',       isCredit: true,  labelKey: 'txTripEarnings' },
  commission_debit:    { icon: 'receipt-outline',   isCredit: false, labelKey: 'txCommissionDebit' },
  no_show_credit:      { icon: 'shield-checkmark',  isCredit: true,  labelKey: 'txNoShowCredit' },
  cancellation_credit: { icon: 'shield-checkmark',  isCredit: true,  label: 'Cancellation Credit' },
  admin_refund_debit:  { icon: 'shield-outline',    isCredit: false, label: 'Admin Adjustment' },
  topup:               { icon: 'arrow-down-circle', isCredit: true,  labelKey: 'txTopUp' },
  withdrawal:          { icon: 'arrow-up-circle',   isCredit: false, labelKey: 'txWithdrawal' },
  instant_withdrawal:  { icon: 'arrow-up-circle',   isCredit: false, labelKey: 'txWithdrawal' },
  standard_withdrawal: { icon: 'arrow-up-circle',   isCredit: false, labelKey: 'txWithdrawal' },
  refund:              { icon: 'refresh-circle',    isCredit: true,  labelKey: 'txRefund' },
};

import { supabase } from '../../lib/supabase';
import { toRide, toWalletEntry } from '../../lib/transforms';
import { useAuth } from '../../context/AuthContext';
import { splitFare } from '../../utils/pricing';
import { useTheme } from '../../context/SettingsContext';
import WalletTopUpModal from '../../components/WalletTopUpModal';
import WithdrawalModal from '../../components/WithdrawalModal';

export default function EarningsScreen() {
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [rides, setRides] = useState([]);
  const [ridesLoading, setRidesLoading] = useState(true);
  const [topUpVisible, setTopUpVisible] = useState(false);
  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const [walletHistory, setWalletHistory] = useState([]);
  const [walletHistoryLoading, setWalletHistoryLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchRides = async () => {
      const { data } = await supabase
        .from('rides')
        .select('*')
        .eq('driver_id', user.uid)
        .eq('status', 'completed');
      if (data) setRides(data.map(toRide));
      setRidesLoading(false);
    };
    fetchRides();

    const channel = supabase
      .channel('earnings_rides_' + user.uid)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rides',
        filter: `driver_id=eq.${user.uid}`,
      }, fetchRides)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const fetchHistory = async () => {
      const { data } = await supabase
        .from('wallet_history')
        .select('*')
        .eq('user_id', user.uid)
        .order('created_at', { ascending: false });
      if (data) setWalletHistory(data.map(toWalletEntry));
      setWalletHistoryLoading(false);
    };
    fetchHistory();

    const channel = supabase
      .channel('earnings_wallet_' + user.uid)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'wallet_history',
        filter: `user_id=eq.${user.uid}`,
      }, fetchHistory)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const formatDateTime = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return (
      d.toLocaleDateString('en-EG', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' · ' +
      d.toLocaleTimeString('en-EG', { hour: '2-digit', minute: '2-digit', hour12: true })
    );
  };

  const getTxMeta = (type, amount) => {
    const base = DRIVER_TX_META[type];
    if (base) return base;
    return {
      icon: amount >= 0 ? 'arrow-down-circle' : 'arrow-up-circle',
      isCredit: amount >= 0,
      labelKey: null,
    };
  };

  const totalEarned = rides.reduce(
    (sum, r) => sum + splitFare(r.finalFare || r.estimatedFare || 0, r.isFirstRide).driverAmount,
    0
  );

  const currentBalance = userProfile?.wallet ?? 0;
  const trackedNet = useMemo(
    () => walletHistory.reduce((sum, e) => sum + (e.amount || 0), 0),
    [walletHistory]
  );
  const legacyGap = Math.round((currentBalance - trackedNet) * 100) / 100;

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

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{t('allTimeEarnings')}</Text>
          {ridesLoading ? (
            <ActivityIndicator color="#fff" style={{ marginVertical: 8 }} />
          ) : (
            <>
              <Text style={styles.summaryAmount}>{totalEarned} EGP</Text>
              <Text style={styles.summaryTrips}>{rides.length} {t('tripsCompleted')}</Text>
            </>
          )}
        </View>

        <View style={styles.walletCard}>
          <Text style={styles.walletLabel}>{t('walletBalance')}</Text>
          <Text style={styles.walletAmount}>{userProfile?.wallet || 0} EGP</Text>
          <Text style={styles.walletSub}>{t('commissionNote')}</Text>
          <View style={styles.walletActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setTopUpVisible(true)}>
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>  {t('topUpWalletBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnAlt} onPress={() => setWithdrawVisible(true)}>
              <Ionicons name="arrow-up-outline" size={18} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.primary }]}>  {t('withdrawFundsBtn')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.historyTitle}>{t('walletHistory')}</Text>
        {walletHistoryLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: 16 }} />
        ) : walletHistory.length === 0 && legacyGap <= 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={44} color={colors.border} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyText}>{t('noWalletHistory')}</Text>
          </View>
        ) : (
          <>
            {walletHistory.map((entry) => {
              const meta       = getTxMeta(entry.type, entry.amount);
              const isCredit   = meta.isCredit;
              const tint       = isCredit ? GREEN : RED;
              const iconBg     = isCredit ? '#DCFCE7' : '#FEE2E2';
              const label      = meta.labelKey ? t(meta.labelKey) : (meta.label ?? (isCredit ? 'Credit' : 'Debit'));
              const amtDisplay = `${isCredit ? '+' : ''}${entry.amount} ${t('egp')}`;
              return (
                <View key={entry.id} style={styles.txCard}>
                  <View style={[styles.txBar, { backgroundColor: tint }]} />
                  <View style={[styles.txIcon, { backgroundColor: iconBg }]}>
                    <Ionicons name={meta.icon} size={20} color={tint} />
                  </View>
                  <View style={styles.txBody}>
                    <Text style={styles.txLabel}>{label}</Text>
                    {!!entry.description && (
                      <Text style={styles.txDesc} numberOfLines={2}>{entry.description}</Text>
                    )}
                    <Text style={styles.txDate}>{formatDateTime(entry.createdAt)}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: tint }]}>{amtDisplay}</Text>
                </View>
              );
            })}

            {legacyGap > 0 && (
              <View style={[styles.txCard, { opacity: 0.65 }]}>
                <View style={[styles.txBar, { backgroundColor: colors.gray }]} />
                <View style={[styles.txIcon, { backgroundColor: colors.primaryBg }]}>
                  <Ionicons name="time-outline" size={20} color={colors.gray} />
                </View>
                <View style={styles.txBody}>
                  <Text style={[styles.txLabel, { color: colors.gray }]}>Earlier Earnings</Text>
                  <Text style={styles.txDesc}>
                    Earnings from trips completed before detailed tracking was enabled
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: colors.gray }]}>+{legacyGap} {t('egp')}</Text>
              </View>
            )}
          </>
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
          <View style={[styles.commRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.commItem}>{t('firstTimePassenger')}</Text>
            <Text style={[styles.commValue, { color: colors.success }]}>{t('noCommission')}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primaryBg },
    scroll: { padding: 20, paddingBottom: 48 },
    summaryCard: {
      backgroundColor: colors.primary, borderRadius: 20, padding: 28,
      alignItems: 'center', marginBottom: 16, ...shadow.lg,
    },
    summaryLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
    summaryAmount: { fontSize: 44, fontWeight: '800', color: '#fff' },
    summaryTrips: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 6 },
    walletCard: {
      backgroundColor: colors.white, borderRadius: 20, padding: 20,
      marginBottom: 16, alignItems: 'center', ...shadow.md,
    },
    walletLabel: { fontSize: 12, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.5 },
    walletAmount: { fontSize: 40, fontWeight: '800', color: colors.dark, marginVertical: 6 },
    walletSub: { fontSize: 12, color: colors.gray, marginBottom: 16, textAlign: 'center' },
    walletActions: { flexDirection: 'row', gap: 10, width: '100%' },
    actionBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12,
    },
    actionBtnAlt: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.primaryBg, borderRadius: 14, paddingVertical: 12,
      borderWidth: 1.5, borderColor: colors.primary + '80',
    },
    actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    historyTitle: { fontSize: 16, fontWeight: '700', color: colors.dark, marginBottom: 10 },
    txCard: {
      backgroundColor: colors.white, borderRadius: 14, marginBottom: 10,
      flexDirection: 'row', alignItems: 'center', overflow: 'hidden', ...shadow.sm,
    },
    txBar:  { width: 4, alignSelf: 'stretch' },
    txIcon: {
      width: 42, height: 42, borderRadius: 21,
      alignItems: 'center', justifyContent: 'center',
      marginLeft: 12, marginVertical: 14, flexShrink: 0,
    },
    txBody:   { flex: 1, paddingHorizontal: 12, paddingVertical: 14 },
    txLabel:  { fontSize: 13, fontWeight: '700', color: colors.dark, marginBottom: 2 },
    txDesc:   { fontSize: 12, color: colors.gray, lineHeight: 17, marginBottom: 3 },
    txDate:   { fontSize: 11, color: colors.gray, opacity: 0.7 },
    txAmount: { fontSize: 14, fontWeight: '800', paddingRight: 14, minWidth: 68, textAlign: 'right' },
    empty: { alignItems: 'center', paddingVertical: 32 },
    emptyText: { fontSize: 14, color: colors.gray, marginTop: 4 },
    commissionCard: {
      backgroundColor: colors.white, borderRadius: 16, padding: 20, marginTop: 8, ...shadow.sm,
    },
    commTitle: { fontSize: 15, fontWeight: '700', color: colors.dark, marginBottom: 14 },
    commRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    commItem: { fontSize: 13, color: colors.dark },
    commValue: {
      fontSize: 13, color: colors.gray, fontWeight: '600',
      textAlign: 'right', flex: 1, marginLeft: 8,
    },
  });
}
