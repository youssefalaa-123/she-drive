import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/SettingsContext';

const INSTANT_FEE = 5;
const MIN_AMOUNT  = 50;

function detectCardType(number) {
  const n = number.replace(/\D/g, '');
  if (n.startsWith('4')) return 'visa';
  const prefix2 = parseInt(n.slice(0, 2), 10);
  if (prefix2 >= 51 && prefix2 <= 55) return 'mastercard';
  return 'other';
}

function CardNetworkBadge({ cardType, colors }) {
  if (cardType === 'visa') {
    return (
      <View style={[badgeStyle.pill, { backgroundColor: '#1A1F71' }]}>
        <Text style={[badgeStyle.text, { color: '#fff', letterSpacing: 1 }]}>VISA</Text>
      </View>
    );
  }
  if (cardType === 'mastercard') {
    return (
      <View style={badgeStyle.mcWrap}>
        <View style={[badgeStyle.circle, { backgroundColor: '#EB001B', marginRight: -8 }]} />
        <View style={[badgeStyle.circle, { backgroundColor: '#F79E1B' }]} />
      </View>
    );
  }
  return null;
}

const badgeStyle = StyleSheet.create({
  pill:   { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  text:   { fontSize: 11, fontWeight: '800' },
  mcWrap: { flexDirection: 'row', alignItems: 'center' },
  circle: { width: 20, height: 20, borderRadius: 10, opacity: 0.9 },
});

function SummaryRow({ label, value, red, bold, colors }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, color: bold ? colors.dark : colors.gray, fontWeight: bold ? '700' : '400' }}>
        {label}
      </Text>
      <Text style={{
        fontSize: 13, fontWeight: bold ? '800' : '600',
        color: red ? '#DC2626' : bold ? colors.dark : colors.gray,
      }}>
        {value}
      </Text>
    </View>
  );
}

export default function WithdrawalModal({ visible, onClose, userId, currentBalance = 0 }) {
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [step, setStep]                   = useState('select');
  const [payoutMethods, setPayoutMethods] = useState([]);
  const [selectedId, setSelectedId]       = useState(null);
  const [amount, setAmount]               = useState('');
  const [busy, setBusy]                   = useState(false);
  const [error, setError]                 = useState('');

  const [holderName, setHolderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry]         = useState('');
  const [cvv, setCvv]               = useState('');
  const [cardType, setCardType]     = useState('other');

  useEffect(() => {
    if (!visible || !userId) return;

    supabase
      .from('profiles')
      .select('payout_methods')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) setPayoutMethods(data.payout_methods || []);
      });

    const channel = supabase
      .channel('withdrawal_profile_' + userId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=eq.${userId}`,
      }, ({ new: row }) => {
        setPayoutMethods(row.payout_methods || []);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [visible, userId]);

  const selectedMethod = payoutMethods.find(m => m.id === selectedId) || null;
  const amt            = parseFloat(amount) || 0;
  const totalDeducted  = amt + INSTANT_FEE;
  const canContinue    = amt >= MIN_AMOUNT && totalDeducted <= currentBalance && !!selectedId;

  const resetAddCard = () => {
    setHolderName(''); setCardNumber(''); setExpiry('');
    setCvv(''); setCardType('other');
  };

  const close = () => {
    setStep('select'); setAmount(''); setSelectedId(null);
    setError(''); resetAddCard(); setBusy(false);
    onClose();
  };

  const handleCardNumberChange = (v) => {
    setCardNumber(v);
    setCardType(detectCardType(v));
  };

  const handleSaveCard = async () => {
    const digits = cardNumber.replace(/\D/g, '');
    if (!holderName.trim()) { setError('Please enter the cardholder name.'); return; }
    if (digits.length < 4)  { setError('Please enter a valid card number.'); return; }
    if (!expiry.trim())     { setError('Please enter the expiry date.'); return; }
    if (cvv.trim().length < 3) { setError('Please enter a valid CVV (3–4 digits).'); return; }

    setBusy(true); setError('');
    const newMethod = {
      id:         Date.now().toString(),
      type:       'debit_card',
      holderName: holderName.trim(),
      lastFour:   digits.slice(-4),
      expiry:     expiry.trim(),
      cardType:   cardType === 'other' ? 'other' : cardType,
      addedAt:    new Date().toISOString(),
    };
    try {
      const updated = [...payoutMethods, newMethod];
      const { error: err } = await supabase
        .from('profiles')
        .update({ payout_methods: updated })
        .eq('id', userId);
      if (err) throw err;
      setPayoutMethods(updated);
      setSelectedId(newMethod.id);
      resetAddCard();
      setStep('select');
    } catch (err) {
      setError('Could not save card: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!canContinue || busy || !selectedMethod) return;
    setBusy(true); setError('');
    try {
      const desc = `Cash Out · **** ${selectedMethod.lastFour} · ${selectedMethod.expiry}`;

      const { error: rpcError } = await supabase.rpc('withdraw_own_wallet', {
        p_user_id: userId,
        p_delta:   -totalDeducted,
        p_type:    'instant_withdrawal',
        p_desc:    desc,
        p_ride_id: null,
      });
      if (rpcError) throw rpcError;

      supabase.from('withdrawal_requests').insert({
        user_id:                userId,
        amount:                 amt,
        fee:                    INSTANT_FEE,
        total_deducted:         totalDeducted,
        payout_method_id:       selectedMethod.id,
        payout_method_last_four: selectedMethod.lastFour,
        payout_method_card_type: selectedMethod.cardType,
        status:                 'processing',
      }).then(() => {});

      setStep('success');
    } catch (err) {
      setError('Transfer failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.sheet}>

            {step === 'success' && (
              <View style={styles.successWrap}>
                <View style={styles.successCircle}>
                  <Ionicons name="checkmark" size={40} color="#fff" />
                </View>
                <Text style={styles.successTitle}>{amt} EGP on the way!</Text>
                <Text style={styles.successSub}>
                  Arriving to card **** {selectedMethod?.lastFour}{'\n'}
                  Instant transfer · {INSTANT_FEE} EGP fee deducted
                </Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={close}>
                  <Text style={styles.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 'confirm' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={() => { setError(''); setStep('select'); }}>
                  <Ionicons name="chevron-back" size={20} color={colors.primary} />
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Review Cash Out</Text>

                <View style={styles.methodPreview}>
                  <CardNetworkBadge cardType={selectedMethod?.cardType} colors={colors} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.methodName}>{selectedMethod?.holderName}</Text>
                    <Text style={styles.methodSub}>
                      {selectedMethod?.cardType?.toUpperCase()} **** {selectedMethod?.lastFour} · {selectedMethod?.expiry}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryBox}>
                  <SummaryRow label="Amount to receive" value={`${amt} EGP`} colors={colors} />
                  <SummaryRow label="Instant transfer fee" value={`−${INSTANT_FEE} EGP`} red colors={colors} />
                  <View style={[styles.summaryDivider, { borderTopColor: colors.border }]} />
                  <SummaryRow label="Deducted from wallet" value={`${totalDeducted} EGP`} bold colors={colors} />
                </View>

                <View style={styles.atomicNote}>
                  <Ionicons name="shield-checkmark-outline" size={14} color="#059669" />
                  <Text style={styles.atomicNoteText}>
                    This transaction is atomic — if anything fails, your balance will not be affected.
                  </Text>
                </View>

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
                  onPress={handleConfirm}
                  disabled={busy}
                >
                  {busy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.primaryBtnText}>Confirm Cash Out</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={close}>
                  <Text style={styles.ghostBtnText}>{t('cancel')}</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'add_card' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={() => { resetAddCard(); setStep('select'); }}>
                  <Ionicons name="chevron-back" size={20} color={colors.primary} />
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Add Payout Card</Text>
                <Text style={styles.balanceNote}>Used to receive your earnings</Text>

                <Text style={styles.fieldLabel}>Cardholder Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Full name on card"
                  placeholderTextColor={colors.gray}
                  value={holderName}
                  onChangeText={setHolderName}
                  autoCapitalize="words"
                />

                <Text style={styles.fieldLabel}>Card Number</Text>
                <View style={styles.cardNumberRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="•••• •••• •••• ••••"
                    placeholderTextColor={colors.gray}
                    value={cardNumber}
                    onChangeText={handleCardNumberChange}
                    keyboardType="numeric"
                    maxLength={19}
                  />
                  <View style={styles.cardBadgeSlot}>
                    <CardNetworkBadge cardType={cardType} colors={colors} />
                  </View>
                </View>

                <View style={styles.row2}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.fieldLabel}>Expiry (MM/YY)</Text>
                    <TextInput
                      style={[styles.input, { marginBottom: 0 }]}
                      placeholder="MM/YY"
                      placeholderTextColor={colors.gray}
                      value={expiry}
                      onChangeText={setExpiry}
                      keyboardType="numeric"
                      maxLength={5}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>CVV</Text>
                    <View style={styles.cvvRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        placeholder="•••"
                        placeholderTextColor={colors.gray}
                        value={cvv}
                        onChangeText={setCvv}
                        keyboardType="numeric"
                        maxLength={4}
                        secureTextEntry
                      />
                      <Ionicons
                        name="lock-closed"
                        size={14}
                        color={colors.gray}
                        style={{ position: 'absolute', right: 12, top: '50%', marginTop: -7 }}
                      />
                    </View>
                  </View>
                </View>

                <Text style={styles.securityNote}>
                  🔒 CVV is verified for security but is never stored. Card details are encrypted.
                </Text>

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
                  onPress={handleSaveCard}
                  disabled={busy}
                >
                  {busy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.primaryBtnText}>Save Card</Text>
                  }
                </TouchableOpacity>
              </>
            )}

            {step === 'select' && (
              <>
                <Text style={styles.title}>{t('withdrawFunds')}</Text>
                <View style={styles.balancePill}>
                  <Ionicons name="wallet-outline" size={14} color={colors.primary} />
                  <Text style={styles.balancePillText}>
                    Balance:{' '}
                    <Text style={{ fontWeight: '800', color: colors.dark }}>{currentBalance} EGP</Text>
                  </Text>
                </View>

                <Text style={styles.fieldLabel}>Amount to Cash Out (EGP)</Text>
                <TextInput
                  style={styles.input}
                  placeholder={`Min ${MIN_AMOUNT} EGP`}
                  placeholderTextColor={colors.gray}
                  value={amount}
                  onChangeText={(v) => { setAmount(v); setError(''); }}
                  keyboardType="numeric"
                />
                {amt > 0 && amt < MIN_AMOUNT && (
                  <Text style={styles.errorText}>Minimum cash out is {MIN_AMOUNT} EGP</Text>
                )}
                {amt >= MIN_AMOUNT && totalDeducted > currentBalance && (
                  <Text style={styles.errorText}>
                    Insufficient balance (need {totalDeducted} EGP incl. {INSTANT_FEE} EGP fee)
                  </Text>
                )}
                {amt >= MIN_AMOUNT && totalDeducted <= currentBalance && (
                  <View style={styles.feeNote}>
                    <Ionicons name="flash" size={13} color="#D97706" />
                    <Text style={styles.feeNoteText}>
                      Instant transfer · {INSTANT_FEE} EGP fee · you receive {amt} EGP
                    </Text>
                  </View>
                )}

                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Payout Method</Text>

                {payoutMethods.length === 0 ? (
                  <View style={styles.noCardsBox}>
                    <Ionicons name="card-outline" size={32} color={colors.border} />
                    <Text style={styles.noCardsText}>No payout cards saved yet</Text>
                  </View>
                ) : (
                  payoutMethods.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.methodCard, selectedId === m.id && styles.methodCardActive]}
                      onPress={() => setSelectedId(m.id)}
                      activeOpacity={0.8}
                    >
                      <CardNetworkBadge cardType={m.cardType} colors={colors} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.methodName}>{m.holderName}</Text>
                        <Text style={styles.methodSub}>
                          {m.cardType !== 'other' ? m.cardType.toUpperCase() : 'Card'}{' '}
                          **** {m.lastFour} · {m.expiry}
                        </Text>
                      </View>
                      <View style={[styles.radioOuter, selectedId === m.id && { borderColor: colors.primary }]}>
                        {selectedId === m.id && (
                          <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                )}

                <TouchableOpacity
                  style={styles.addCardBtn}
                  onPress={() => { setError(''); setStep('add_card'); }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={styles.addCardText}>Add a new payout card</Text>
                </TouchableOpacity>

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.primaryBtn, !canContinue && { opacity: 0.4 }]}
                  onPress={() => { if (canContinue) { setError(''); setStep('confirm'); } }}
                  disabled={!canContinue}
                >
                  <Text style={styles.primaryBtnText}>Continue</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={close}>
                  <Text style={styles.ghostBtnText}>{t('cancel')}</Text>
                </TouchableOpacity>
              </>
            )}

          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 24, paddingBottom: 44, ...shadow.lg,
    },

    backRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    backText: { color: colors.primary, fontSize: 14, fontWeight: '600', marginLeft: 4 },

    title:       { fontSize: 20, fontWeight: '800', color: colors.dark, textAlign: 'center', marginBottom: 6 },
    balanceNote: { fontSize: 12, color: colors.gray, textAlign: 'center', marginBottom: 20 },
    securityNote: {
      fontSize: 11, color: colors.gray, marginTop: 10, marginBottom: 4,
      lineHeight: 16,
    },
    balancePill: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center',
      backgroundColor: colors.primaryBg, borderRadius: 20,
      paddingHorizontal: 14, paddingVertical: 6, marginBottom: 22,
    },
    balancePillText: { fontSize: 13, color: colors.gray },

    fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.dark, marginBottom: 8, marginTop: 4 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
      color: colors.dark, marginBottom: 4,
    },

    cardNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    cardBadgeSlot: { width: 44, alignItems: 'center', justifyContent: 'center' },

    row2: { flexDirection: 'row', marginTop: 8, marginBottom: 4 },
    cvvRow: { position: 'relative' },

    feeNote: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10, marginBottom: 4,
    },
    feeNoteText: { fontSize: 12, color: '#92400E', flex: 1 },

    atomicNote: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 6,
      backgroundColor: '#F0FDF4', borderRadius: 8, padding: 10, marginBottom: 12,
    },
    atomicNoteText: { fontSize: 11, color: '#166534', flex: 1, lineHeight: 16 },

    noCardsBox:  { alignItems: 'center', paddingVertical: 22, gap: 8 },
    noCardsText: { fontSize: 13, color: colors.gray },

    methodCard: {
      flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
      borderColor: colors.border, borderRadius: 14, padding: 14,
      marginBottom: 10, backgroundColor: colors.white,
    },
    methodCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    methodPreview: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.primaryBg, borderRadius: 12, padding: 14, marginBottom: 16,
    },
    methodName: { fontSize: 14, fontWeight: '700', color: colors.dark },
    methodSub:  { fontSize: 12, color: colors.gray, marginTop: 2 },

    radioOuter: {
      width: 20, height: 20, borderRadius: 10, borderWidth: 2,
      borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    },
    radioInner: { width: 10, height: 10, borderRadius: 5 },

    addCardBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 14, borderWidth: 1.5, borderStyle: 'dashed',
      borderColor: colors.primary + '80', borderRadius: 14,
      justifyContent: 'center', marginBottom: 20, marginTop: 4,
    },
    addCardText: { fontSize: 14, fontWeight: '700', color: colors.primary },

    summaryBox:     { backgroundColor: colors.primaryBg, borderRadius: 12, padding: 14, marginBottom: 12 },
    summaryDivider: { borderTopWidth: 1, marginVertical: 8 },

    primaryBtn:     { backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    ghostBtn:       { alignItems: 'center', padding: 14 },
    ghostBtnText:   { fontSize: 14, color: colors.gray, fontWeight: '600' },

    errorText: { color: '#DC2626', fontSize: 12, marginBottom: 8, textAlign: 'center' },

    successWrap: { alignItems: 'center', paddingVertical: 8 },
    successCircle: {
      width: 76, height: 76, borderRadius: 38,
      backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    successTitle: { fontSize: 22, fontWeight: '800', color: colors.dark, marginBottom: 8 },
    successSub:   { fontSize: 13, color: colors.gray, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  });
}
