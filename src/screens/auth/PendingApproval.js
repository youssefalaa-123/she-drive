import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useTheme } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';

export default function PendingApproval() {
  const { colors, t } = useTheme();
  const { signOut } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>⏳</Text>
        <Text style={styles.title}>{t('pendingTitle')}</Text>
        <Text style={styles.body}>{t('pendingBody')}</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{t('pendingWhatNext')}</Text>
          <Text style={styles.infoItem}>{t('pendingStep1')}</Text>
          <Text style={styles.infoItem}>{t('pendingStep2')}</Text>
          <Text style={styles.infoItem}>{t('pendingStep3')}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
          <Text style={styles.logoutText}>{t('signOut')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primaryBg },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    emoji: { fontSize: 64, marginBottom: 20 },
    title: { fontSize: 24, fontWeight: '800', color: colors.dark, textAlign: 'center', marginBottom: 16 },
    body: { fontSize: 15, color: colors.gray, textAlign: 'center', lineHeight: 24, marginBottom: 28 },
    infoBox: {
      backgroundColor: colors.white, borderRadius: 16, padding: 20,
      width: '100%', marginBottom: 32,
      borderLeftWidth: 4, borderLeftColor: colors.primary,
    },
    infoTitle: { fontSize: 14, fontWeight: '700', color: colors.dark, marginBottom: 12 },
    infoItem: { fontSize: 14, color: colors.gray, marginBottom: 6, lineHeight: 20 },
    logoutBtn: { paddingVertical: 12, paddingHorizontal: 32 },
    logoutText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  });
}
