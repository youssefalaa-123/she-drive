import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/SettingsContext';

function detectCardType(num) {
  const n = num.replace(/\s/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'Mastercard';
  if (/^506/.test(n)) return 'Meeza';
  return null;
}

function formatNumber(val) {
  return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(val) {
  const d = val.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

function cardPreviewNumber(digits) {
  const padded = digits.padEnd(16, '•');
  return [padded.slice(0, 4), padded.slice(4, 8), padded.slice(8, 12), padded.slice(12, 16)].join('  ');
}

export default function CardInputModal({ visible, onClose, onSave, title, actionLabel }) {
  const { colors, shadow, t } = useTheme();
  const s = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);
  const modalTitle = title ?? t('addCard');
  const modalAction = actionLabel ?? t('saveCard');

  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const digits = number.replace(/\s/g, '');
  const cardType = detectCardType(number) || 'Card';

  const reset = () => { setNumber(''); setExpiry(''); setCvv(''); setName(''); };
  const close = () => { reset(); onClose(); };

  const handleSave = async () => {
    if (digits.length < 16) { Alert.alert(t('invalidCard'), t('invalidCardMsg')); return; }
    if (expiry.length < 5) { Alert.alert(t('invalidExpiry'), t('invalidExpiryMsg')); return; }
    const [mm, yy] = expiry.split('/');
    const now = new Date();
    const expYear = 2000 + +yy, expMonth = +mm;
    if (expMonth < 1 || expMonth > 12 || expYear < now.getFullYear() ||
        (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
      Alert.alert(t('cardExpired'), t('cardExpiredMsg')); return;
    }
    if (cvv.length < 3) { Alert.alert(t('invalidCvv'), t('invalidCvvMsg')); return; }
    if (!name.trim()) { Alert.alert(t('nameRequired'), t('nameRequiredMsg')); return; }
    setBusy(true);
    try {
      await onSave({ id: Date.now().toString(), lastFour: digits.slice(-4), expiry, cardType, name: name.trim().toUpperCase() });
      reset();
      onClose();
    } catch (e) {
      Alert.alert(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={s.overlay}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.sheet}>
            <View style={s.header}>
              <Text style={s.title}>{modalTitle}</Text>
              <TouchableOpacity onPress={close} style={s.closeBtn}>
                <Ionicons name="close" size={22} color={colors.gray} />
              </TouchableOpacity>
            </View>

            <View style={s.cardWrap}>
              <View style={s.cardFace}>
                <View style={s.cardTopRow}>
                  <View style={s.cardChip} />
                  <Text style={s.cardTypeText}>{cardType}</Text>
                </View>
                <Text style={s.cardNumberText}>{cardPreviewNumber(digits)}</Text>
                <View style={s.cardBottomRow}>
                  <View>
                    <Text style={s.cardSmallLabel}>{t('cardholderLabel')}</Text>
                    <Text style={s.cardSmallVal}>{name.toUpperCase() || t('yourNamePlaceholder')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.cardSmallLabel}>{t('expiresLabel')}</Text>
                    <Text style={s.cardSmallVal}>{expiry || 'MM/YY'}</Text>
                  </View>
                </View>
              </View>
            </View>

            <Text style={s.fieldLabel}>{t('cardNumberLabel')}</Text>
            <TextInput style={s.input} value={number} onChangeText={v => setNumber(formatNumber(v))} placeholder="1234 5678 9012 3456" keyboardType="numeric" maxLength={19} placeholderTextColor={colors.gray} />

            <View style={s.twoCol}>
              <View style={s.colLeft}>
                <Text style={s.fieldLabel}>{t('expiryLabel')}</Text>
                <TextInput style={s.input} value={expiry} onChangeText={v => setExpiry(formatExpiry(v))} placeholder="MM/YY" keyboardType="numeric" maxLength={5} placeholderTextColor={colors.gray} />
              </View>
              <View style={s.colRight}>
                <Text style={s.fieldLabel}>{t('cvvLabel')}</Text>
                <TextInput style={s.input} value={cvv} onChangeText={v => setCvv(v.replace(/\D/g, '').slice(0, 4))} placeholder="•••" keyboardType="numeric" maxLength={4} secureTextEntry placeholderTextColor={colors.gray} />
              </View>
            </View>

            <Text style={s.fieldLabel}>{t('cardholderNameLabel')}</Text>
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder={t('asOnCardPlaceholder')} autoCapitalize="characters" placeholderTextColor={colors.gray} />

            <View style={s.secureRow}>
              <Ionicons name="lock-closed" size={13} color={colors.gray} />
              <Text style={s.secureText}>{t('cvvSecureNote')}</Text>
            </View>

            <TouchableOpacity style={[s.btn, busy && s.btnBusy]} onPress={handleSave} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{modalAction}</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    scrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 20, fontWeight: '800', color: colors.dark },
    closeBtn: { padding: 4 },
    cardWrap: { borderRadius: 20, overflow: 'hidden', marginBottom: 24, ...shadow.lg },
    cardFace: { backgroundColor: colors.primary, padding: 22, minHeight: 170, justifyContent: 'space-between' },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardChip: { width: 38, height: 28, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.35)' },
    cardTypeText: { fontSize: 15, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
    cardNumberText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 2, marginVertical: 16 },
    cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between' },
    cardSmallLabel: { fontSize: 9, color: 'rgba(255,255,255,0.65)', letterSpacing: 1.2, textTransform: 'uppercase' },
    cardSmallVal: { fontSize: 13, color: '#fff', fontWeight: '700', marginTop: 3 },
    fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 13, fontSize: 15, color: colors.dark, backgroundColor: colors.lightGray, marginBottom: 14 },
    twoCol: { flexDirection: 'row', gap: 12 },
    colLeft: { flex: 1 },
    colRight: { flex: 1 },
    secureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    secureText: { fontSize: 12, color: colors.gray },
    btn: { backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
    btnBusy: { opacity: 0.6 },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
