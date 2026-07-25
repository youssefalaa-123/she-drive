import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/SettingsContext';
import CardInputModal from './CardInputModal';

const PRESETS = [50, 100, 200, 500];

function CardNetworkBadge({ cardType }) {
  const lower = (cardType || '').toLowerCase();
  if (lower === 'visa') {
    return (
      <View style={{ backgroundColor: '#1A1F71', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff', fontStyle: 'italic', letterSpacing: 0.5 }}>
          VISA
        </Text>
      </View>
    );
  }
  if (lower === 'mastercard') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#EB001B', opacity: 0.9, marginRight: -6 }} />
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#F79E1B', opacity: 0.9 }} />
      </View>
    );
  }
  if (lower === 'meeza') {
    return (
      <View style={{ backgroundColor: '#0066CC', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>meeza</Text>
      </View>
    );
  }
  return <Ionicons name="card" size={18} color="#6B7280" />;
}

function SavedCardRow({ card, selected, onPress, colors, styles, expiresLabel }) {
  return (
    <TouchableOpacity
      style={[styles.cardRow, selected && styles.cardRowActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <CardNetworkBadge cardType={card.cardType} />
      <View style={styles.cardRowInfo}>
        <Text style={[styles.cardRowTitle, selected && { color: colors.primary }]}>
          {card.cardType} •••• {card.lastFour}
        </Text>
        <Text style={styles.cardRowSub}>{card.name} · {expiresLabel} {card.expiry}</Text>
      </View>
      {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
    </TouchableOpacity>
  );
}

export default function WalletTopUpModal({ visible, onClose, userId, savedCards = [], onCardAdded }) {
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [preset, setPreset]             = useState(null);
  const [custom, setCustom]             = useState('');
  const [selectedCard, setSelectedCard] = useState(savedCards[0] || null);
  const [addCardVisible, setAddCardVisible] = useState(false);
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState('');
  const [succeeded, setSucceeded]       = useState(false);
  const [lastTopUp, setLastTopUp]       = useState(null);

  const amount = preset || (+custom || 0);

  const close = () => {
    setPreset(null); setCustom(''); setError('');
    setSucceeded(false); setLastTopUp(null);
    onClose();
  };

  const handleAddCard = async (cardData) => {
    const updated = [...savedCards, cardData];
    await supabase.from('profiles').update({ saved_cards: updated }).eq('id', userId);
    if (onCardAdded) onCardAdded(cardData);
    setSelectedCard(cardData);
  };

  const handleTopUp = async () => {
    setError('');
    if (!amount || amount < 10) { setError(t('amountTooLowMsg')); return; }
    if (!selectedCard)          { setError(t('noCardSelectedMsg')); return; }
    setBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc('topup_own_wallet', {
        p_user_id: userId,
        p_delta:   amount,
        p_type:    'topup',
        p_desc:    `Wallet top-up · ${selectedCard.cardType} •••• ${selectedCard.lastFour}`,
        p_ride_id: null,
      });
      if (rpcError) throw rpcError;
      setLastTopUp({ amount, card: selectedCard });
      setSucceeded(true);
      setPreset(null); setCustom('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>

            {succeeded ? (
              <View style={styles.successWrap}>
                <View style={styles.successCircle}>
                  <Ionicons name="checkmark" size={36} color="#fff" />
                </View>
                <Text style={styles.successTitle}>
                  {t('walletTopUpSuccess')
                    .replace('%d', lastTopUp?.amount)
                    .replace('%s', `${lastTopUp?.card?.cardType} •••• ${lastTopUp?.card?.lastFour}`)}
                </Text>
                <TouchableOpacity style={styles.confirmBtn} onPress={close}>
                  <Text style={styles.confirmText}>{t('ok')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.header}>
                  <Text style={styles.title}>{t('topUpWallet')}</Text>
                  <TouchableOpacity onPress={close}>
                    <Ionicons name="close" size={22} color={colors.gray} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>{t('chooseAmountLabel')}</Text>
                <View style={styles.presetRow}>
                  {PRESETS.map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.preset, preset === p && styles.presetActive]}
                      onPress={() => { setPreset(p); setCustom(''); setError(''); }}
                    >
                      <Text style={[styles.presetText, preset === p && styles.presetTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.customRow}>
                  <Text style={styles.orLabel}>{t('orEnterAmount')}</Text>
                  <TextInput
                    style={styles.customInput}
                    value={custom}
                    onChangeText={v => { setCustom(v.replace(/\D/g, '')); setPreset(null); setError(''); }}
                    placeholder="e.g. 350"
                    keyboardType="numeric"
                    placeholderTextColor={colors.gray}
                  />
                </View>

                <Text style={[styles.label, { marginTop: 4 }]}>{t('payFromCard')}</Text>
                {savedCards.length === 0 && (
                  <Text style={styles.noCardHint}>{t('noCardHint')}</Text>
                )}
                {savedCards.map(c => (
                  <SavedCardRow
                    key={c.id}
                    card={c}
                    selected={selectedCard?.id === c.id}
                    onPress={() => { setSelectedCard(c); setError(''); }}
                    colors={colors}
                    styles={styles}
                    expiresLabel={t('expiresShort')}
                  />
                ))}

                <TouchableOpacity style={styles.addCardBtn} onPress={() => setAddCardVisible(true)}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                  <Text style={styles.addCardText}>{t('addNewCard')}</Text>
                </TouchableOpacity>

                {amount > 0 && selectedCard && (
                  <View style={styles.summary}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                    <Text style={styles.summaryText}>
                      {amount} {t('egp')} — {selectedCard.cardType} •••• {selectedCard.lastFour}
                    </Text>
                  </View>
                )}

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.confirmBtn, (!amount || !selectedCard || busy) && styles.confirmBtnDisabled]}
                  onPress={handleTopUp}
                  disabled={!amount || !selectedCard || busy}
                >
                  {busy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.confirmText}>{t('addEgpToWallet').replace('%d', amount || 0)}</Text>
                  }
                </TouchableOpacity>
              </>
            )}

          </View>
        </View>
      </Modal>

      <CardInputModal
        visible={addCardVisible}
        onClose={() => setAddCardVisible(false)}
        onSave={handleAddCard}
        title={t('addPaymentCard')}
        actionLabel={t('saveAndUseCard')}
      />
    </>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet:   { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48 },
    header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title:   { fontSize: 20, fontWeight: '800', color: colors.dark },

    label:         { fontSize: 11, fontWeight: '700', color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    presetRow:     { flexDirection: 'row', gap: 10, marginBottom: 14 },
    preset:        { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.lightGray },
    presetActive:  { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    presetText:    { fontSize: 16, fontWeight: '700', color: colors.gray },
    presetTextActive: { color: colors.primary },

    customRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    orLabel:     { fontSize: 13, color: colors.gray, flexShrink: 0 },
    customInput: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 11, fontSize: 15, color: colors.dark, backgroundColor: colors.lightGray },

    noCardHint:    { fontSize: 13, color: colors.gray, marginBottom: 10 },
    cardRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.lightGray, marginBottom: 8 },
    cardRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    cardRowInfo:   { flex: 1 },
    cardRowTitle:  { fontSize: 14, fontWeight: '700', color: colors.dark },
    cardRowSub:    { fontSize: 12, color: colors.gray, marginTop: 2 },

    addCardBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, justifyContent: 'center' },
    addCardText: { color: colors.primary, fontWeight: '700', fontSize: 14 },

    summary:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryBg, borderRadius: 12, padding: 12, marginBottom: 12 },
    summaryText: { fontSize: 13, color: colors.primary, flex: 1 },

    errorText: { color: '#DC2626', fontSize: 13, textAlign: 'center', marginBottom: 10 },

    confirmBtn:         { backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 },
    confirmBtnDisabled: { opacity: 0.4 },
    confirmText:        { color: '#fff', fontSize: 16, fontWeight: '700' },

    successWrap:   { alignItems: 'center', paddingVertical: 16 },
    successCircle: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
    },
    successTitle: { fontSize: 15, fontWeight: '700', color: colors.dark, marginBottom: 28, textAlign: 'center', lineHeight: 22 },
  });
}
