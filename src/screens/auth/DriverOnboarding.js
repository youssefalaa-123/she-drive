import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Platform, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../context/SettingsContext';
import PhotoPicker from '../../components/PhotoPicker';
import TermsContent from '../../components/TermsContent';
import { driverTerms } from '../../data/termsOfService';

const friendlySignupError = (msg, t) => {
  if (!msg) return t('genericError') || 'Registration failed. Please try again.';
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists') || m.includes('duplicate'))
    return t('emailAlreadyInUse');
  if (m.includes('network') || m.includes('fetch'))
    return t('networkError') || 'Network error. Check your connection.';
  if (m.includes('rate') || m.includes('too many'))
    return t('tooManyRequests') || 'Too many attempts. Try again later.';
  if (m.includes('password') && m.includes('weak'))
    return t('weakPasswordMsg') || 'Password is too weak.';
  return t('genericError') || 'Registration failed. Please try again.';
};

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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const setPhoto = (key, val) => setPhotos((p) => ({ ...p, [key]: val }));

  const handleRegister = async () => {
    if (!termsAccepted) {
      Alert.alert(t('termsOfService'), t('pleaseAcceptTerms'));
      return;
    }
    const { name, email, phone, password, carModel, carColor, plateNumber, licenseNumber } = form;
    const digits = phone.replace(/\D/g, '');
    if (!name || !email || !digits || !password || !carModel || !carColor || !plateNumber || !licenseNumber) {
      Alert.alert(t('missingFields'), t('fillAllFieldsMsg')); return;
    }
    if (!email.includes('@')) { Alert.alert(t('invalidEmail') || 'Invalid Email', t('enterValidEmail')); return; }
    if (digits.length < 10) { Alert.alert(t('invalidPhone'), t('invalidPhoneMsg')); return; }
    if (password.length < 8) { Alert.alert(t('weakPassword'), t('weakPasswordMsg')); return; }
    if (!photos.profile || !photos.vehicle || !photos.nationalId || !photos.licenseId) {
      Alert.alert(t('allPhotosRequired'), t('allPhotosRequiredMsg')); return;
    }

    setLoading(true);
    const normEmail = email.trim().toLowerCase();
    const normPhone = digits.startsWith('20') && digits.length === 12 ? '0' + digits.slice(2) : digits;

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normEmail,
        password,
      });
      if (signUpError) throw signUpError;

      const uid = signUpData.user?.id;
      if (!uid) throw new Error('No user ID returned from sign up');

      const { error: profileError } = await supabase.from('profiles').insert({
        id: uid,
        name,
        email: normEmail,
        phone: normPhone,
        role: 'driver',
        approved: false,
        rejected: false,
        photo_url: photos.profile,
        car_photo_url: photos.vehicle,
        national_id_photo_url: photos.nationalId,
        license_photo_url: photos.licenseId,
        car_model: carModel,
        car_color: carColor,
        plate_number: plateNumber,
        license_number: licenseNumber,
        wallet: 0,
        total_trips: 0,
        rating: 0,
        rating_count: 0,
        is_online: false,
      });

      if (profileError) {
        await supabase.auth.signOut();
        throw profileError;
      }

      const { error: phoneError } = await supabase.from('phone_index').insert({
        phone: normPhone,
        email: normEmail,
        user_id: uid,
      });

      if (phoneError && !phoneError.message?.toLowerCase().includes('duplicate')) {
        await supabase.auth.signOut();
        throw phoneError;
      }
    } catch (err) {
      Alert.alert(t('registrationFailed'), friendlySignupError(err.message, t));
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

  const isWeb = Platform.OS === 'web';

  return (
    <View style={[{ flex: 1, backgroundColor: colors.primaryBg }, isWeb && { height: '100vh' }]}>
      {/* Terms Modal */}
      <Modal
        visible={termsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTermsVisible(false)}
      >
        <View style={styles.termsOverlay}>
          <View style={styles.termsSheet}>
            <View style={styles.termsHeader}>
              <Text style={styles.termsHeaderTitle}>{t('termsOfService')}</Text>
              <TouchableOpacity onPress={() => setTermsVisible(false)}>
                <Ionicons name="close" size={22} color={colors.gray} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <TermsContent terms={driverTerms} />
              <View style={{ height: 32 }} />
            </ScrollView>
            <TouchableOpacity
              style={styles.acceptFromModalBtn}
              onPress={() => { setTermsAccepted(true); setTermsVisible(false); }}
            >
              <Text style={styles.acceptFromModalText}>{t('iAgreeToTerms')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, isWeb && styles.scrollWeb]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>{t('backArrow')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{t('driverSignUp')}</Text>
        <Text style={styles.sub}>{t('driverSignUpSub')}</Text>

        <View style={[styles.card, isWeb && { padding: 14 }]}>
          <Text style={styles.section}>{t('photos')}  <Text style={styles.reqNote}>{t('photosRequired')}</Text></Text>
          <View style={[styles.photosGrid, isWeb && styles.photosGridWeb]}>
            {photoSlots.map(({ key, label, path, icon }) => (
              <View key={key} style={[styles.photoCell, isWeb && styles.photoCellWeb]}>
                <PhotoPicker
                  label={icon}
                  value={photos[key]}
                  onChange={(url) => setPhoto(key, url)}
                  storagePath={path}
                  size={isWeb ? 60 : 82}
                />
                <Text style={[styles.photoLabel, !photos[key] && styles.photoLabelMissing]}>
                  {photos[key] ? '✓ ' : '✗ '}{label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={isWeb && styles.twoCol}>
          <View style={[styles.card, { marginTop: 14 }, isWeb && { padding: 12, flex: 1 }]}>
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

          <View style={[styles.card, { marginTop: 14, marginBottom: 8 }, isWeb && { padding: 12, flex: 1 }]}>
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

            {/* Terms acceptance */}
            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => setTermsAccepted(v => !v)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={termsAccepted ? 'checkbox' : 'square-outline'}
                size={22}
                color={termsAccepted ? colors.primary : colors.gray}
              />
              <Text style={styles.termsRowText}>
                {t('iAgreePrefix')}{' '}
                <Text
                  style={[styles.termsRowLink, { color: colors.primary }]}
                  onPress={(e) => { e.stopPropagation?.(); setTermsVisible(true); }}
                >
                  {t('termsOfService')}
                </Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, (!termsAccepted || loading) && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading || !termsAccepted}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>{t('submitApplication')}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    scroll: { padding: 24, paddingBottom: 56 },
    scrollWeb: { padding: 12, paddingBottom: 20, maxWidth: 860, alignSelf: 'center', width: '100%' },
    twoCol: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    back: { marginBottom: 8 },
    backText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
    title: { fontSize: Platform.OS === 'web' ? 18 : 26, fontWeight: '800', color: colors.dark, marginBottom: 2 },
    sub: { fontSize: 12, color: colors.gray, marginBottom: 10 },
    card: { backgroundColor: colors.white, borderRadius: 20, padding: 20, ...shadow.md },
    section: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },
    reqNote: { fontSize: 11, fontWeight: '400', color: colors.gray, textTransform: 'none', letterSpacing: 0 },
    photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between' },
    photosGridWeb: { flexWrap: 'nowrap', gap: 8, justifyContent: 'space-around' },
    photoCell: { alignItems: 'center', width: '45%', gap: 6, marginBottom: 4 },
    photoCellWeb: { width: 'auto', flex: 1 },
    photoLabel: { fontSize: 11, color: '#22C55E', textAlign: 'center', fontWeight: '600' },
    photoLabelMissing: { color: '#EF4444' },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      padding: Platform.OS === 'web' ? 9 : 14, fontSize: 14, color: colors.dark, marginBottom: 10,
      backgroundColor: colors.lightGray,
    },
    passwordWrap: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      backgroundColor: colors.lightGray, marginBottom: 14,
    },
    passwordInput: { flex: 1, padding: Platform.OS === 'web' ? 9 : 14, fontSize: 14, color: colors.dark },
    eyeBtn: { paddingHorizontal: 14 },
    termsRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginBottom: 14, paddingVertical: 4,
    },
    termsRowText: { flex: 1, fontSize: 13, color: colors.dark, lineHeight: 20 },
    termsRowLink: { fontWeight: '700', textDecorationLine: 'underline' },
    button: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
    buttonDisabled: { opacity: 0.45 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    // Terms modal
    termsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    termsSheet: {
      backgroundColor: colors.white,
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      padding: 24, paddingBottom: 16, maxHeight: '88%',
      flex: 0,
    },
    termsHeader: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 16,
    },
    termsHeaderTitle: { fontSize: 18, fontWeight: '800', color: colors.dark },
    acceptFromModalBtn: {
      backgroundColor: colors.primary, borderRadius: 14,
      padding: 16, alignItems: 'center', marginTop: 12,
    },
    acceptFromModalText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
