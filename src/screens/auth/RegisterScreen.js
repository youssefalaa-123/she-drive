import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { useTheme } from '../../context/SettingsContext';

export default function RegisterScreen({ navigation }) {
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>{t('backArrow')}</Text>
      </TouchableOpacity>

      <View style={styles.logoWrap}>
        <Image
          source={require('../../../assets/logo.jpg')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <Text style={styles.title}>{t('joinSheDrive')}</Text>
      <Text style={styles.sub}>{t('iWantToSignUpAs')}</Text>

      <TouchableOpacity
        style={styles.roleCard}
        onPress={() => navigation.navigate('PassengerOnboarding')}
      >
        <Text style={styles.roleEmoji}>👩</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.roleName}>{t('passenger')}</Text>
          <Text style={styles.roleDesc}>{t('bookSafeRides')}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.roleCard}
        onPress={() => navigation.navigate('DriverOnboarding')}
      >
        <Text style={styles.roleEmoji}>🚗</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.roleName}>{t('driver')}</Text>
          <Text style={styles.roleDesc}>{t('driveEarn')}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flexGrow: 1, backgroundColor: colors.primaryBg, padding: 24 },
    back: { marginBottom: 8, paddingTop: 8 },
    backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
    logoWrap: { alignItems: 'center', marginBottom: 16 },
    logo: { width: 130, height: 195 },
    title: { fontSize: 26, fontWeight: '800', color: colors.dark, marginBottom: 6 },
    sub: { fontSize: 15, color: colors.gray, marginBottom: 24 },
    roleCard: {
      backgroundColor: colors.white, borderRadius: 16, padding: 20,
      flexDirection: 'row', alignItems: 'center', marginBottom: 14, ...shadow.md,
    },
    roleEmoji: { fontSize: 36, marginRight: 16 },
    roleName: { fontSize: 18, fontWeight: '700', color: colors.dark, marginBottom: 4 },
    roleDesc: { fontSize: 13, color: colors.gray },
    arrow: { fontSize: 26, color: colors.primary },
  });
}
