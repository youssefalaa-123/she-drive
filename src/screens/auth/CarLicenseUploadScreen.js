import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native';
import { useTheme } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import PhotoPicker from '../../components/PhotoPicker';

export default function CarLicenseUploadScreen() {
  const { colors, shadow, t } = useTheme();
  const { user, refreshProfile } = useAuth();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [photoUrl, setPhotoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!photoUrl) {
      setError(t('photoCarLicense') + ' is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ car_license_photo_url: photoUrl })
        .eq('id', user.uid);
      if (updateErr) throw updateErr;
      setSubmitted(true);
      // Force-reload the profile so the Navigator re-evaluates the gate immediately
      await refreshProfile();
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.primaryBg, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontSize: 64, marginBottom: 20 }}>✅</Text>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.dark, textAlign: 'center', marginBottom: 12 }}>
          {t('carLicensePendingTitle')}
        </Text>
        <Text style={{ fontSize: 15, color: colors.gray, textAlign: 'center', lineHeight: 22 }}>
          {t('carLicensePendingBody')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.primaryBg }}
      contentContainerStyle={[styles.container, Platform.OS === 'web' && { paddingBottom: 120 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>🚘</Text>
      </View>

      <Text style={styles.title}>{t('uploadCarLicense')}</Text>
      <Text style={styles.sub}>{t('uploadCarLicenseSub')}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{t('photoCarLicense')}</Text>
        <View style={styles.pickerWrap}>
          <PhotoPicker
            label="📷"
            value={photoUrl}
            onChange={(url) => { setPhotoUrl(url); setError(''); }}
            storagePath="drivers/car-licenses"
            size={90}
          />
          {photoUrl ? (
            <Text style={styles.uploaded}>✓ {t('photoCarLicense')} uploaded</Text>
          ) : (
            <Text style={styles.hint}>Tap to upload a photo of your car license</Text>
          )}
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.btn, (!photoUrl || loading) && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={!photoUrl || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>{t('submit')}</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { padding: 24, alignItems: 'center', paddingBottom: 48 },
    iconWrap: { marginTop: 40, marginBottom: 20 },
    icon: { fontSize: 72 },
    title: { fontSize: 24, fontWeight: '800', color: colors.dark, textAlign: 'center', marginBottom: 10 },
    sub: { fontSize: 15, color: colors.gray, textAlign: 'center', lineHeight: 22, marginBottom: 32, paddingHorizontal: 8 },
    card: {
      width: '100%', maxWidth: 440,
      backgroundColor: colors.white,
      borderRadius: 20, padding: 24,
      alignItems: 'center',
      ...shadow.md,
    },
    label: {
      fontSize: 12, fontWeight: '700', color: colors.primary,
      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, alignSelf: 'flex-start',
    },
    pickerWrap: { alignItems: 'center', marginBottom: 20 },
    uploaded: { marginTop: 10, fontSize: 14, color: '#22C55E', fontWeight: '600' },
    hint: { marginTop: 10, fontSize: 13, color: colors.gray, textAlign: 'center' },
    errorText: { color: '#EF4444', fontSize: 14, marginBottom: 12, textAlign: 'center' },
    btn: {
      backgroundColor: colors.primary, borderRadius: 12,
      paddingVertical: 16, paddingHorizontal: 32,
      width: '100%', alignItems: 'center', marginTop: 4,
    },
    btnDisabled: { opacity: 0.45 },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
