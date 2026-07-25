import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../context/SettingsContext';
import PhotoPicker from '../../components/PhotoPicker';
import TermsContent from '../../components/TermsContent';
import { passengerTerms } from '../../data/termsOfService';

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

export default function PassengerOnboarding({ navigation }) {
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [photoURL, setPhotoURL] = useState('');
  const [nationalIdPhotoURL, setNationalIdPhotoURL] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleRegister = async () => {
    if (!termsAccepted) {
      Alert.alert(t('termsOfService'), t('pleaseAcceptTerms'));
      return;
    }
    const { name, email, phone, password } = form;
    const digits = phone.replace(/\D/g, '');
    if (!photoURL || !nationalIdPhotoURL) { Alert.alert(t('allPhotosRequired'), t('passengerPhotosRequiredMsg')); return; }
    if (!name || !email || !digits || !password) { Alert.alert(t('missingFields'), t('fillAllFieldsMsg')); return; }
    if (!email.includes('@')) { Alert.alert(t('invalidEmail') || 'Invalid Email', t('invalidEmailMsg') || t('enterValidEmail')); return; }
    if (digits.length < 10) { Alert.alert(t('invalidPhone'), t('invalidPhoneMsg')); return; }
    if (password.length < 8) { Alert.alert(t('weakPassword'), t('weakPasswordMsg')); return; }

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
        role: 'passenger',
        photo_url: photoURL,
        national_id_photo_url: nationalIdPhotoURL,
        wallet: 0,
        total_trips: 0,
        badges: 0,
      });

      if (profileError) {
        await supabase.auth.signOut();
        throw profileError;
      }

      // Grant 50 EGP early earnings via SECURITY DEFINER RPC (increment_wallet is service-role only)
      await supabase.rpc('topup_own_wallet', {
        p_delta:   50,
        p_type:    'early_earnings',
        p_desc:    'Early Earnings',
        p_ride_id: null,
      });

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

  return (
    <View style={[{ flex: 1, backgroundColor: colors.primaryBg }]}>
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
              <TermsContent terms={passengerTerms} />
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

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>{t('backArrow')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{t('passengerSignUp')}</Text>
        <Text style={styles.sub}>{t('passengerSignUpSub')}</Text>

        <View style={styles.photosSection}>
          <Text style={styles.photosTitle}>{t('requiredPhotos') || 'Required Photos'}</Text>
          <View style={styles.photosRow}>
            <View style={styles.photoCell}>
              <PhotoPicker
                label={t('photoProfile') || 'Profile Photo'}
                value={photoURL}
                onChange={setPhotoURL}
                storagePath="passengers/photos"
                size={80}
              />
              {!photoURL && <Text style={styles.photoRequired}>*{t('required') || 'Required'}</Text>}
            </View>
            <View style={styles.photoCell}>
              <PhotoPicker
                label={t('photoNationalId') || 'National ID'}
                value={nationalIdPhotoURL}
                onChange={setNationalIdPhotoURL}
                storagePath="passengers/ids"
                size={80}
              />
              {!nationalIdPhotoURL && <Text style={styles.photoRequired}>*{t('required') || 'Required'}</Text>}
            </View>
          </View>
        </View>

        <View style={styles.card}>
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
              : <Text style={styles.buttonText}>{t('createAccount')}</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    scroll: { padding: 24, paddingBottom: 48 },
    back: { marginBottom: 16 },
    backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
    title: { fontSize: 26, fontWeight: '800', color: colors.dark, marginBottom: 6 },
    sub: { fontSize: 14, color: colors.gray, marginBottom: 24 },
    photosSection: { marginBottom: 24 },
    photosTitle: { fontSize: 14, fontWeight: '700', color: colors.dark, marginBottom: 12 },
    photosRow: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
    photoCell: { alignItems: 'center', gap: 6 },
    photoRequired: { fontSize: 11, color: colors.error || '#EF4444', fontWeight: '600' },
    card: { backgroundColor: colors.white, borderRadius: 20, padding: 24, ...shadow.md },
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
    termsRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginBottom: 16, paddingVertical: 4,
    },
    termsRowText: { flex: 1, fontSize: 14, color: colors.dark, lineHeight: 20 },
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
