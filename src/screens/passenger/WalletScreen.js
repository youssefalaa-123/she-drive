import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { toWalletEntry } from '../../lib/transforms';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/SettingsContext';
import WalletTopUpModal from '../../components/WalletTopUpModal';

const TX_META = {
  early_earnings:     { icon: 'gift',              isCredit: true,  labelKey: 'txEarlyEarnings' },
  topup:              { icon: 'arrow-down-circle', isCredit: true,  labelKey: 'txTopUp' },
  ride_payment:       { icon: 'car',               isCredit: false, labelKey: 'txTripPayment' },
  cancellation_debit: { icon: 'close-circle',      isCredit: false, labelKey: 'txCancellationFee' },
  no_show_debit:      { icon: 'time',              isCredit: false, labelKey: 'txNoShowFee' },
  wait_fee_debit:     { icon: 'hourglass',         isCredit: false, labelKey: 'txWaitFee' },
  refund:             { icon: 'refresh-circle',    isCredit: true,  labelKey: 'txRefund' },
  admin_refund:       { icon: 'shield-checkmark',  isCredit: true,  labelKey: 'txAdminRefund' },
};

const GREEN = '#059669';
const RED   = '#DC2626';

export default function PassengerWalletScreen() {
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [topUpVisible, setTopUpVisible]   = useState(false);
  const [walletHistory, setWalletHistory] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [filter, setFilter]               = useState('all');

  useEffect(() => {
    if (!user) return;

    const fetchHistory = async () => {
      const { data } = await supabase
        .from('wallet_history')
        .select('*')
        .eq('user_id', user.uid)
        .order('created_at', { ascending: false });
      if (data) setWalletHistory(data.map(toWalletEntry));
      setLoading(false);
    };
    fetchHistory();

    const channel = supabase
      .channel('wallet_history_' + user.uid)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'wallet_history',
        filter: `user_id=eq.${user.uid}`,
      }, fetchHistory)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const currentBalance = userProfile?.wallet ?? 0;

  const totalAdded = useMemo(
    () => walletHistory.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0),
    [walletHistory]
  );

  const totalSpent = Math.max(0, totalAdded - currentBalance);

  const trackedDebits = useMemo(
    () => walletHistory.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0),
    [walletHistory]
  );
  const legacyGap = Math.round((totalSpent - trackedDebits) * 100) / 100;

  const filtered = useMemo(() => {
    if (filter === 'credit') return walletHistory.filter(e => e.amount > 0);
    if (filter === 'debit')  return walletHistory.filter(e => e.amount < 0);
    return walletHistory;
  }, [walletHistory, filter]);

  const formatDateTime = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return (
      d.toLocaleDateString('en-EG', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' · ' +
      d.toLocaleTimeString('en-EG', { hour: '2-digit', minute: '2-digit', hour12: true })
    );
  };

  const getMeta = (type, amount) => {
    const base = TX_META[type];
    if (base) return base;
    return {
      icon: amount >= 0 ? 'arrow-down-circle' : 'arrow-up-circle',
      isCredit: amount >= 0,
      labelKey: null,
    };
  };

  const FILTERS = [
    { key: 'all',    label: t('allTx') },
    { key: 'credit', label: t('moneyIn') },
    { key: 'debit',  label: t('moneyOut') },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <WalletTopUpModal
        visible={topUpVisible}
        onClose={() => setTopUpVisible(false)}
        userId={user?.uid}
        savedCards={userProfile?.savedCards || []}
        onCardAdded={() => {}}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t('currentBalance')}</Text>
          <Text style={styles.balanceAmount}>{currentBalance} EGP</Text>

          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Ionicons name="arrow-down-circle-outline" size={15} color="rgba(255,255,255,0.7)" style={{ marginBottom: 3 }} />
              <Text style={styles.statLabel}>{t('totalAdded')}</Text>
              <Text style={styles.statValue}>+{totalAdded} EGP</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statBlock}>
              <Ionicons name="arrow-up-circle-outline" size={15} color="rgba(255,255,255,0.7)" style={{ marginBottom: 3 }} />
              <Text style={styles.statLabel}>{t('totalSpent')}</Text>
              <Text style={styles.statValue}>−{totalSpent} EGP</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.topupBtn} onPress={() => setTopUpVisible(true)} activeOpacity={0.85}>
            <Ionicons name="add-circle" size={19} color={colors.primary} />
            <Text style={styles.topupText}>{t('addFunds')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>{t('walletHistory')}</Text>
          <View style={styles.filterRow}>
            {FILTERS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, filter === key && styles.chipActive]}
                onPress={() => setFilter(key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={52} color={colors.border} />
            <Text style={styles.emptyTitle}>
              {filter === 'all' ? t('noWalletHistory') : t('noWalletHistoryFilter')}
            </Text>
            {filter === 'all' && (
              <Text style={styles.emptyHint}>Top up your wallet to get started.</Text>
            )}
          </View>
        ) : (
          <>
            {filtered.map((entry) => {
              const meta       = getMeta(entry.type, entry.amount);
              const isCredit   = meta.isCredit;
              const tint       = isCredit ? GREEN : RED;
              const iconBg     = isCredit ? '#DCFCE7' : '#FEE2E2';
              const label      = meta.labelKey ? t(meta.labelKey) : (isCredit ? 'Credit' : 'Debit');
              const amtDisplay = `${isCredit ? '+' : ''}${entry.amount} EGP`;

              return (
                <View key={entry.id} style={styles.txCard}>
                  <View style={[styles.txBar, { backgroundColor: tint }]} />
                  <View style={[styles.txIcon, { backgroundColor: iconBg }]}>
                    <Ionicons name={meta.icon} size={22} color={tint} />
                  </View>
                  <View style={styles.txContent}>
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

            {legacyGap > 0 && (filter === 'all' || filter === 'debit') && (
              <View style={[styles.txCard, styles.txCardLegacy]}>
                <View style={[styles.txBar, { backgroundColor: colors.gray }]} />
                <View style={[styles.txIcon, { backgroundColor: colors.primaryBg }]}>
                  <Ionicons name="time-outline" size={22} color={colors.gray} />
                </View>
                <View style={styles.txContent}>
                  <Text style={[styles.txLabel, { color: colors.gray }]}>Earlier Payments</Text>
                  <Text style={styles.txDesc}>Payments made before detailed tracking was enabled</Text>
                </View>
                <Text style={[styles.txAmount, { color: colors.gray }]}>−{legacyGap} EGP</Text>
              </View>
            )}
          </>
        )}

        <View style={styles.howCard}>
          <Text style={styles.howTitle}>{t('howWalletWorks')}</Text>
          <HowRow icon="arrow-down-circle-outline" color={GREEN}          text={t('topUpToPay')} />
          <HowRow icon="gift-outline"              color={colors.primary} text={t('firstTripDiscount')} />
          <HowRow icon="ribbon-outline"            color="#F59E0B"        text={t('earnBadge')} />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function HowRow({ icon, color, text }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
      <Ionicons name={icon} size={17} color={color} style={{ marginTop: 1 }} />
      <Text style={{ fontSize: 13, color: '#666', flex: 1, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primaryBg },
    scroll:    { padding: 20, paddingBottom: 52 },

    balanceCard: {
      backgroundColor: colors.primary,
      borderRadius: 24,
      padding: 24,
      marginBottom: 24,
      ...shadow.lg,
    },
    balanceLabel: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.75)',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    balanceAmount: {
      fontSize: 48,
      fontWeight: '800',
      color: '#fff',
      marginBottom: 20,
      letterSpacing: -1,
    },
    statsRow: {
      flexDirection: 'row',
      backgroundColor: 'rgba(0,0,0,0.15)',
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 10,
      marginBottom: 18,
    },
    statBlock: { flex: 1, alignItems: 'center' },
    statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.3, marginBottom: 3 },
    statValue: { fontSize: 16, fontWeight: '700', color: '#fff' },
    statSep:   { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 6 },
    topupBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fff',
      borderRadius: 14,
      paddingVertical: 13,
      gap: 8,
    },
    topupText: { color: colors.primary, fontWeight: '700', fontSize: 15 },

    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
      flexWrap: 'wrap',
      gap: 8,
    },
    historyTitle: { fontSize: 17, fontWeight: '800', color: colors.dark },
    filterRow:    { flexDirection: 'row', gap: 6 },
    chip: {
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText:       { fontSize: 12, fontWeight: '600', color: colors.gray },
    chipTextActive: { color: '#fff' },

    txCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.white,
      borderRadius: 16,
      marginBottom: 10,
      overflow: 'hidden',
      ...shadow.sm,
    },
    txCardLegacy: { opacity: 0.65 },
    txBar:     { width: 4, alignSelf: 'stretch' },
    txIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 12,
      marginVertical: 14,
      flexShrink: 0,
    },
    txContent: { flex: 1, paddingHorizontal: 12, paddingVertical: 14 },
    txLabel:   { fontSize: 14, fontWeight: '700', color: colors.dark, marginBottom: 2 },
    txDesc:    { fontSize: 12, color: colors.gray, lineHeight: 17, marginBottom: 4 },
    txDate:    { fontSize: 11, color: colors.gray, opacity: 0.7 },
    txAmount:  { fontSize: 15, fontWeight: '800', paddingRight: 14, minWidth: 72, textAlign: 'right' },

    empty: { alignItems: 'center', paddingVertical: 52, gap: 10 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.dark, textAlign: 'center' },
    emptyHint:  { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 32 },

    howCard: {
      backgroundColor: colors.white,
      borderRadius: 16,
      padding: 18,
      marginTop: 8,
      ...shadow.sm,
    },
    howTitle: { fontSize: 14, fontWeight: '700', color: colors.dark, marginBottom: 12 },
  });
}
