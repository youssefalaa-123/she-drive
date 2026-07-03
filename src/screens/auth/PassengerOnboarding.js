import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { useTheme } from '../../context/SettingsContext';
import PhotoPicker from '../../components/PhotoPicker';

export default function PassengerOnboarding({ navigation }) {
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [photoURL, setPhotoURL] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleRegister = async () => {
    const { name, email, phone, password } = form;
    const digits = phone.replace(/\D/g, '');
    if (!name || !email || !digits || !password) { Alert.alert(t('missingFields'), t('fillAllFieldsMsg')); return; }
    if (!email.includes('@')) { Alert.alert(t('invalidEmail') || 'Invalid Email', t('invalidEmailMsg') || t('enterValidEmail')); return; }
    if (digits.length < 10) { Alert.alert(t('invalidPhone'), t('invalidPhoneMsg')); return; }
    if (password.length < 6) { Alert.alert(t('weakPassword'), t('weakPasswordMsg')); return; }

    setLoading(true);
    let cred = null;
    try {
      cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name, email: email.trim().toLowerCase(), phone: digits,
        role: 'passenger', photoURL: photoURL || '',
        wallet: 0, totalTrips: 0, badges: 0,
        createdAt: serverTimestamp(),
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

  return (
    <View style={[{ flex: 1, backgroundColor: colors.primaryBg }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>{t('backArrow')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{t('passengerSignUp')}</Text>
        <Text style={styles.sub}>{t('passengerSignUpSub')}</Text>

        <View style={styles.photoRow}>
          <PhotoPicker
            label="Profile"
            value={photoURL}
            onChange={setPhotoURL}
            storagePath="passengers/photos"
            size={90}
          />
          <Text style={styles.photoHint}>{t('photoOptional')}</Text>
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

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
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
    photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
    photoHint: { fontSize: 13, color: colors.gray, lineHeight: 20 },
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
    button: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
