import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../firebase/config';
import CardInputModal from '../../components/CardInputModal';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/SettingsContext';

export default function ProfileScreen() {
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [cardModalVisible, setCardModalVisible] = useState(false);

  const savedCards = userProfile?.savedCards || [];

  const handleSaveCard = async (cardData) => {
    await updateDoc(doc(db, 'users', user.uid), { savedCards: arrayUnion(cardData) });
  };

  const handleRemoveCard = (card) => {
    Alert.alert(t('removeCard'), t('removeCardConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('remove'), style: 'destructive', onPress: async () => {
          try {
            await updateDoc(doc(db, 'users', user.uid), { savedCards: arrayRemove(card) });
          } catch (e) { Alert.alert(t('error'), e.message); }
        }
      },
    ]);
  };

  const badges = userProfile?.badges || 0;
  const totalTrips = userProfile?.totalTrips || 0;
  const nextBadgeIn = 10 - (totalTrips % 10);

  return (
    <SafeAreaView style={styles.container}>
      <CardInputModal
        visible={cardModalVisible}
        onClose={() => setCardModalVisible(false)}
        onSave={handleSaveCard}
        title={t('addPaymentCard')}
        actionLabel={t('saveCard')}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 40 }}>👩</Text>
          </View>
          <Text style={styles.name}>{userProfile?.name || '—'}</Text>
          <Text style={styles.email}>{userProfile?.email || ''}</Text>
          <Text style={styles.phone}>{userProfile?.phone || ''}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{totalTrips}</Text>
            <Text style={styles.statLabel}>{t('tripsLabel')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{badges}</Text>
            <Text style={styles.statLabel}>{t('badgesLabel')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{userProfile?.wallet || 0}</Text>
            <Text style={styles.statLabel}>{t('walletLabel')}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('myBadges')}</Text>
          {badges > 0 ? (
            <View style={styles.badgesWrap}>
              {Array.from({ length: badges }).map((_, i) => (
                <Text key={i} style={styles.badgeEmoji}>🏅</Text>
              ))}
            </View>
          ) : (
            <Text style={styles.noBadge}>
              {t('noBadgeYet')} {nextBadgeIn} {t('noBadgeMid')}
            </Text>
          )}
          {badges > 0 && (
            <Text style={styles.nextBadge}>{nextBadgeIn} {t('nextBadgeMid')}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('paymentCards')}</Text>
          <Text style={styles.cardSub}>{t('savedCardsNote')}</Text>
          {savedCards.length === 0 && (
            <Text style={styles.noCardText}>{t('noCardsSaved')}</Text>
          )}
          {savedCards.map((c) => (
            <View key={c.id} style={styles.cardChip}>
              <Ionicons name="card" size={20} color={colors.primary} />
              <View style={styles.cardChipInfo}>
                <Text style={styles.cardChipTitle}>{c.cardType}  ••••  {c.lastFour}</Text>
                <Text style={styles.cardChipSub}>{c.name} · Expires {c.expiry}</Text>
              </View>
              <TouchableOpacity onPress={() => handleRemoveCard(c)}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addCardBtn} onPress={() => setCardModalVisible(true)}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.addCardText}>  {t('addNewCard')}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primaryBg },
    scroll: { padding: 20, paddingBottom: 48 },
    profileCard: {
      backgroundColor: colors.primary, borderRadius: 20, padding: 28,
      alignItems: 'center', marginBottom: 16, ...shadow.lg,
    },
    avatar: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: 'rgba(255,255,255,0.25)',
      justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    },
    name: { fontSize: 22, fontWeight: '800', color: '#fff' },
    email: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
    phone: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    statBox: { flex: 1, backgroundColor: colors.white, borderRadius: 14, padding: 14, alignItems: 'center', ...shadow.sm },
    statNum: { fontSize: 24, fontWeight: '800', color: colors.primary },
    statLabel: { fontSize: 11, color: colors.gray, marginTop: 4, textAlign: 'center' },
    card: { backgroundColor: colors.white, borderRadius: 20, padding: 20, marginBottom: 16, ...shadow.md },
    cardTitle: { fontSize: 17, fontWeight: '700', color: colors.dark, marginBottom: 6 },
    cardSub: { fontSize: 13, color: colors.gray, marginBottom: 16, lineHeight: 18 },
    badgesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    badgeEmoji: { fontSize: 32 },
    noBadge: { fontSize: 14, color: colors.gray, lineHeight: 20, marginTop: 8 },
    nextBadge: { fontSize: 12, color: colors.gray, marginTop: 12, textAlign: 'center' },
    noCardText: { fontSize: 13, color: colors.gray, marginBottom: 12 },
    cardChip: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
      borderRadius: 12, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.lightGray, marginBottom: 8,
    },
    cardChipInfo: { flex: 1 },
    cardChipTitle: { fontSize: 14, fontWeight: '700', color: colors.dark },
    cardChipSub: { fontSize: 12, color: colors.gray, marginTop: 2 },
    addCardBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 4 },
    addCardText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  });
}
