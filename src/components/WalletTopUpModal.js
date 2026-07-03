import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc, increment, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTheme } from '../context/SettingsContext';
import CardInputModal from './CardInputModal';

const PRESETS = [50, 100, 200, 500];

function SavedCardRow({ card, selected, onPress, colors, styles, expiresLabel }) {
  return (
    <TouchableOpacity
      style={[styles.cardRow, selected && styles.cardRowActive]}
      onPress={onPress}
    >
      <Ionicons name="card" size={22} color={selected ? colors.primary : colors.gray} />
      <View style={styles.cardRowInfo}>
        <Text style={[styles.cardRowTitle, selected && { color: colors.primary }]}>
          {card.cardType}  •••• {card.lastFour}
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

  const [preset, setPreset] = useState(null);
  const [custom, setCustom] = useState('');
  const [selectedCard, setSelectedCard] = useState(savedCards[0] || null);
  const [addCardVisible, setAddCardVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const amount = preset || (+custom || 0);

  const close = () => { setPreset(null); setCustom(''); onClose(); };

  const handleAddCard = async (cardData) => {
    await updateDoc(doc(db, 'users', userId), { savedCards: arrayUnion(cardData) });
    if (onCardAdded) onCardAdded(cardData);
    setSelectedCard(cardData);
  };

  const handleTopUp = async () => {
    if (!amount || amount < 10) { Alert.alert(t('amountTooLow'), t('amountTooLowMsg')); return; }
    if (!selectedCard) { Alert.alert(t('noCardSelected'), t('noCardSelectedMsg')); return; }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', userId), { wallet: increment(amount) });
      Alert.alert(t('ok'), t('walletTopUpSuccess').replace('%d', amount).replace('%s', `${selectedCard.cardType} •••• ${selectedCard.lastFour}`));
      setPreset(null); setCustom('');
      close();
    } catch (e) {
      Alert.alert(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
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
                  onPress={() => { setPreset(p); setCustom(''); }}
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
                onChangeText={v => { setCustom(v.replace(/\D/g, '')); setPreset(null); }}
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
                onPress={() => setSelectedCard(c)}
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

            <TouchableOpacity
              style={[styles.confirmBtn, (!amount || !selectedCard || busy) && styles.confirmBtnDisabled]}
              onPress={handleTopUp}
              disabled={!amount || !selectedCard || busy}
            >
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmText}>{t('addEgpToWallet').replace('%d', amount || 0)}</Text>}
            </TouchableOpacity>
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
    sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 20, fontWeight: '800', color: colors.dark },
    label: { fontSize: 11, fontWeight: '700', color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    presetRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    preset: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.lightGray },
    presetActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    presetText: { fontSize: 16, fontWeight: '700', color: colors.gray },
    presetTextActive: { color: colors.primary },
    customRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    orLabel: { fontSize: 13, color: colors.gray, flexShrink: 0 },
    customInput: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 11, fontSize: 15, color: colors.dark, backgroundColor: colors.lightGray },
    noCardHint: { fontSize: 13, color: colors.gray, marginBottom: 10 },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.lightGray, marginBottom: 8 },
    cardRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    cardRowInfo: { flex: 1 },
    cardRowTitle: { fontSize: 14, fontWeight: '700', color: colors.dark },
    cardRowSub: { fontSize: 12, color: colors.gray, marginTop: 2 },
    addCardBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, justifyContent: 'center' },
    addCardText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
    summary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryBg, borderRadius: 12, padding: 12, marginBottom: 16 },
    summaryText: { fontSize: 13, color: colors.primary, flex: 1 },
    confirmBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
    confirmBtnDisabled: { opacity: 0.4 },
    confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
