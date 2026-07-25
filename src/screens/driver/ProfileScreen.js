import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/SettingsContext';
import PhotoPicker from '../../components/PhotoPicker';
import RatingStars from '../../components/RatingStars';

export default function DriverProfileScreen({ navigation }) {
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);
  const [actualTripCount, setActualTripCount] = useState(null);
  const [savingPhoto, setSavingPhoto] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('rides')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', user.id)
      .eq('status', 'completed')
      .then(({ count }) => {
        if (count !== null) {
          setActualTripCount(count);
        }
      });
  }, [user?.id]);

  const handlePhotoChange = async (field, url) => {
    setSavingPhoto(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [field]: url })
        .eq('id', user.id);
      if (error) throw error;
    } catch (err) {
      Alert.alert('Error', 'Could not save photo. Please try again.');
    } finally {
      setSavingPhoto(false);
    }
  };

  const ratingCount = userProfile?.ratingCount || 0;
  const tripCount   = actualTripCount ?? userProfile?.totalTrips ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        <View style={styles.profileCard}>
          <PhotoPicker
            label="Profile Photo"
            value={userProfile?.photoURL || ''}
            onChange={(url) => handlePhotoChange('photo_url', url)}
            storagePath="driver-profiles"
            size={90}
          />
          <Text style={styles.name}>{userProfile?.name || '—'}</Text>
          <Text style={styles.email}>{userProfile?.email || ''}</Text>
          <View style={styles.approvedBadge}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <Text style={styles.approvedText}> {t('approvedDriver')}</Text>
          </View>
        </View>

        <View style={styles.ratingCard}>
          <Text style={styles.ratingLabel}>{t('yourRating')}</Text>
          <Text style={styles.ratingNum}>
            {userProfile?.rating ? Math.min(5, userProfile.rating).toFixed(1) : '—'}
          </Text>
          <RatingStars
            rating={userProfile?.rating ? Math.min(5, Math.round(userProfile.rating)) : 0}
            readonly
            size={28}
          />
          <Text style={styles.ratingCount}>
            {ratingCount} {ratingCount !== 1 ? t('ratings') : t('rating')}
          </Text>
        </View>

        {/* Vehicle data is read-only. Submitted at registration; changes require Admin approval. */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('carDetailsTitle')}</Text>
          <DetailRow icon="car-outline"           label={t('model')}   value={userProfile?.carModel}      colors={colors} styles={styles} />
          <DetailRow icon="color-palette-outline" label={t('color')}   value={userProfile?.carColor}      colors={colors} styles={styles} />
          <DetailRow icon="reader-outline"        label={t('plate')}   value={userProfile?.plateNumber}   colors={colors} styles={styles} />
          <DetailRow icon="card-outline"          label={t('license')} value={userProfile?.licenseNumber} colors={colors} styles={styles} last />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{tripCount}</Text>
            <Text style={styles.statLabel}>{t('tripsLabel')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{userProfile?.wallet || 0}</Text>
            <Text style={styles.statLabel}>{t('walletLabel')}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.settingsRow}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={20} color={colors.gray} style={{ marginRight: 12 }} />
          <Text style={styles.settingsText}>{t('settings')}</Text>
          <Ionicons name="chevron-forward-outline" size={18} color={colors.gray} />
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// Vehicle detail rows are display-only. Missing values show a neutral
// "Awaiting Admin Approval" label — drivers cannot edit these fields.
function DetailRow({ icon, label, value, colors, styles, last }) {
  const missing = !value;
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Ionicons
        name={icon}
        size={18}
        color={missing ? colors.gray : colors.primary}
        style={{ marginRight: 10 }}
      />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, missing && styles.detailValueMissing]}>
        {missing ? 'Awaiting Admin Approval' : value}
      </Text>
    </View>
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
    name:  { fontSize: 22, fontWeight: '800', color: '#fff' },
    email: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
    approvedBadge: {
      flexDirection: 'row', alignItems: 'center', marginTop: 10,
      backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12,
      paddingVertical: 4, paddingHorizontal: 10,
    },
    approvedText: { color: '#fff', fontSize: 12, fontWeight: '700' },

    ratingCard: {
      backgroundColor: colors.white, borderRadius: 16, padding: 20,
      alignItems: 'center', marginBottom: 14, ...shadow.sm, gap: 8,
    },
    ratingLabel: { fontSize: 13, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.5 },
    ratingNum:   { fontSize: 40, fontWeight: '800', color: colors.dark },
    ratingCount: { fontSize: 12, color: colors.gray },

    card: {
      backgroundColor: colors.white, borderRadius: 20,
      padding: 20, marginBottom: 14, ...shadow.md,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: colors.dark, marginBottom: 14 },

    detailRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    detailRowLast: { borderBottomWidth: 0 },
    detailLabel:   { fontSize: 14, color: colors.gray, flex: 1 },
    detailValue:   { fontSize: 14, color: colors.dark, fontWeight: '600' },
    detailValueMissing: { color: colors.gray, fontStyle: 'italic', fontWeight: '400', fontSize: 13 },

    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
    statBox: {
      flex: 1, backgroundColor: colors.white, borderRadius: 14,
      padding: 16, alignItems: 'center', ...shadow.sm,
    },
    statNum:   { fontSize: 28, fontWeight: '800', color: colors.primary },
    statLabel: { fontSize: 12, color: colors.gray, marginTop: 4 },

    photoRow: {
      flexDirection: 'row', justifyContent: 'space-around', marginTop: 4,
    },
    photoCell: { alignItems: 'center', gap: 6 },

    settingsRow: {
      backgroundColor: colors.white, borderRadius: 14,
      padding: 16, flexDirection: 'row', alignItems: 'center', ...shadow.sm,
    },
    settingsText: { flex: 1, fontSize: 15, color: colors.dark, fontWeight: '600' },
  });
}
