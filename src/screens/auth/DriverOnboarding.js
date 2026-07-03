import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { useTheme } from '../../context/SettingsContext';
import PhotoPicker from '../../components/PhotoPicker';

export default function DriverOnboarding({ navigation }) {
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '',
    carModel: '', carColor: '', plateNumber: '', licenseNumber: '',
  });
  const [photos, setPhotos] = useState({ profile: '', vehicle: '', nationalId: '', licenseId: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const setPhoto = (key, val) => setPhotos((p) => ({ ...p, [key]: val }));

  const handleRegister = async () => {
    const { name, email, phone, password, carModel, carColor, plateNumber, licenseNumber } = form;
    const digits = phone.replace(/\D/g, '');
    if (!name || !email || !digits || !password || !carModel || !carColor || !plateNumber || !licenseNumber) {
      Alert.alert(t('missingFields'), t('fillAllFieldsMsg')); return;
    }
    if (!email.includes('@')) { Alert.alert(t('invalidEmail') || 'Invalid Email', t('enterValidEmail')); return; }
    if (digits.length < 10) { Alert.alert(t('invalidPhone'), t('invalidPhoneMsg')); return; }
    if (password.length < 6) { Alert.alert(t('weakPassword'), t('weakPasswordMsg')); return; }
    if (!photos.profile || !photos.vehicle || !photos.nationalId || !photos.licenseId) {
      Alert.alert(t('allPhotosRequired'), t('allPhotosRequiredMsg')); return;
    }

    setLoading(true);
    let cred = null;
    try {
      cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name, email: email.trim().toLowerCase(), phone: digits,
        role: 'driver', approved: false, rejected: false,
        photoURL: photos.profile, carPhotoURL: photos.vehicle,
        nationalIdPhotoURL: photos.nationalId, licensePhotoURL: photos.licenseId,
        carModel, carColor, plateNumber, licenseNumber,
        wallet: 0, totalTrips: 0, rating: 0, ratingCount: 0,
        isOnline: false, createdAt: serverTimestamp(),
      });
    } catch (err) {
      if (cred) { try { await signOut(auth); } catch (_) {} }
      Alert.alert(t('registrationFailed'),
        err.code === 'auth/email-already-in-use'
          ? t('emailAlreadyInUse')
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  const photoSlots = [
    { key: 'profile',    label: t('photoProfile'),       path: 'drivers/photos',       icon: '🤳' },
    { key: 'vehicle',    label: t('photoVehicle'),        path: 'drivers/vehicles',     icon: '🚗' },
    { key: 'nationalId', label: t('photoNationalId'),     path: 'drivers/national-ids', icon: '🪪' },
    { key: 'licenseId',  label: t('photoDriversLicense'), path: 'drivers/licenses',     icon: '📋' },
  ];

  return (
    <View style={[{ flex: 1, backgroundColor: colors.primaryBg }, Platform.OS === 'web' && { height: '100vh' }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>{t('backArrow')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{t('driverSignUp')}</Text>
        <Text style={styles.sub}>{t('driverSignUpSub')}</Text>

        <View style={styles.card}>
          <Text style={styles.section}>{t('photos')}  <Text style={styles.reqNote}>{t('photosRequired')}</Text></Text>
          <View style={styles.photosGrid}>
            {photoSlots.map(({ key, label, path, icon }) => (
              <View key={key} style={styles.photoCell}>
                <PhotoPicker
                  label={icon}
                  value={photos[key]}
                  onChange={(url) => setPhoto(key, url)}
                  storagePath={path}
                  size={82}
                />
                <Text style={[styles.photoLabel, !photos[key] && styles.photoLabelMissing]}>
                  {photos[key] ? '✓ ' : '✗ '}{label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={styles.section}>{t('personalInfo')}</Text>
          {[
            { key: 'name',  placeholder: t('fullName'),    auto: 'words' },
            { key: 'email', placeholder: t('emailAddress'), keyboard: 'email-address' },
            { key: 'phone', placeholder: t('phoneNumber'),  keyboard: 'phone-pad' },
          ].map(({ key, placeholder, auto, keyboard }) => (
            <TextInput
              key={key}
              style={styles.input}
              placeholder={placeholder}
              value={form[key]}
              onChangeText={(v) => set(key, v)}
              autoCapitalize={auto || 'none'}
              keyboardType={keyboard || 'default'}
              placeholderTextColor={colors.gray}
            />
          ))}
          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('passwordMin')}
              value={form.password}
              onChangeText={(v) => set('password', v)}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              placeholderTextColor={colors.gray}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.gray} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { marginTop: 14, marginBottom: 8 }]}>
          <Text style={styles.section}>{t('carDetails')}</Text>
          {[
            { key: 'carModel',      placeholder: t('carModel'),      auto: 'words' },
            { key: 'carColor',      placeholder: t('carColor'),      auto: 'words' },
            { key: 'plateNumber',   placeholder: t('plateNumber'),   auto: 'characters' },
            { key: 'licenseNumber', placeholder: t('licenseNumber'), auto: 'characters' },
          ].map(({ key, placeholder, auto }) => (
            <TextInput
              key={key}
              style={styles.input}
              placeholder={placeholder}
              value={form[key]}
              onChangeText={(v) => set(key, v)}
              autoCapitalize={auto || 'none'}
              placeholderTextColor={colors.gray}
            />
          ))}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>{t('submitApplication')}</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    scroll: { padding: 24, paddingBottom: 56 },
    back: { marginBottom: 16 },
    backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
    title: { fontSize: 26, fontWeight: '800', color: colors.dark, marginBottom: 6 },
    sub: { fontSize: 14, color: colors.gray, marginBottom: 20 },
    card: { backgroundColor: colors.white, borderRadius: 20, padding: 20, ...shadow.md },
    section: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },
    reqNote: { fontSize: 11, fontWeight: '400', color: colors.gray, textTransform: 'none', letterSpacing: 0 },
    photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between' },
    photoCell: { alignItems: 'center', width: '45%', gap: 6, marginBottom: 4 },
    photoLabel: { fontSize: 11, color: '#22C55E', textAlign: 'center', fontWeight: '600' },
    photoLabelMissing: { color: '#EF4444' },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      padding: 14, fontSize: 15, color: colors.dark, marginBottom: 14,
      backgroundColor: colors.lightGray,
    },
    passwordWrap: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      backgroundColor: colors.lightGray, marginBottom: 14,
    },
    passwordInput: { flex: 1, padding: 14, fontSize: 15, color: colors.dark },
    eyeBtn: { paddingHorizontal: 14 },
    button: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
