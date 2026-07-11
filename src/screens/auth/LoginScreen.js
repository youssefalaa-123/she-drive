import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert,
  Image, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { useTheme } from '../../context/SettingsContext';

const friendlyError = (code, t) => {
  switch (code) {
    case 'auth/too-many-requests': return t('tooManyRequests');
    case 'auth/network-request-failed': return t('networkError');
    default: return t('invalidCredential');
  }
};

export default function LoginScreen({ navigation }) {
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const closeForgot = () => { setForgotVisible(false); setForgotEmail(''); setForgotError(''); };

  const handleForgotReset = async () => {
    const email = forgotEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { setForgotError(t('enterValidEmail')); return; }
    setForgotError('');
    setForgotLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert(
        t('resetEmailSent'),
        t('resetEmailBody'),
        [{ text: t('ok'), onPress: closeForgot }]
      );
    } catch (err) {
      setForgotError(
        err.code === 'auth/user-not-found'
          ? t('noSheDriveAccount')
          : err.message || t('resetFailed')
      );
    } finally {
      setForgotLoading(false);
    }
  };

  const handleLogin = async () => {
    const input = identifier.trim();
    if (!input || !password) {
      Alert.alert(t('missingFields'), t('enterEmailAndPassword'));
      return;
    }
    setLoading(true);
    try {
      let email = input;
      if (!input.includes('@')) {
        const digits = input.replace(/\D/g, '');
        const snap = await getDocs(query(collection(db, 'users'), where('phone', '==', digits)));
        // Use a generic error to avoid confirming whether a phone number is registered
        if (snap.empty) { Alert.alert(t('signInFailed'), t('invalidCredential')); setLoading(false); return; }
        email = snap.docs[0].data().email;
      }
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      Alert.alert(t('signInFailed'), friendlyError(err.code, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Image source={require('../../../assets/logo.jpg')} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>{t('welcomeBack')}</Text>
          <Text style={styles.sub}>{t('signInSub')}</Text>

          <TextInput
            style={styles.input}
            placeholder={t('emailOrPhone')}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            placeholderTextColor={colors.gray}
          />

          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholderTextColor={colors.gray}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.gray} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>{t('signIn')}</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setForgotVisible(true)} style={styles.forgotWrap}>
            <Text style={styles.forgotText}>{t('forgotPassword')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.footer}>
          <Text style={styles.footerText}>
            {t('noAccount')}{'  '}
            <Text style={styles.footerLink}>{t('register')}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={forgotVisible} transparent animationType="slide" onRequestClose={closeForgot}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('resetPassword')}</Text>
              <TouchableOpacity onPress={closeForgot}>
                <Ionicons name="close" size={22} color={colors.gray} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>{t('resetPasswordSub')}</Text>
            <Text style={styles.fieldLabel}>{t('emailAddress')}</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              value={forgotEmail}
              onChangeText={setForgotEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.gray}
            />
            {!!forgotError && <Text style={styles.errorText}>{forgotError}</Text>}
            <TouchableOpacity
              style={[styles.button, forgotLoading && styles.buttonDisabled]}
              onPress={handleForgotReset}
              disabled={forgotLoading}
            >
              {forgotLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>{t('sendResetLink')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flexGrow: 1, backgroundColor: colors.primaryBg, justifyContent: 'center', padding: 24 },
    logoWrap: { alignItems: 'center', marginBottom: 20 },
    logo: { width: 160, height: 240 },
    card: { backgroundColor: colors.white, borderRadius: 20, padding: 24, ...shadow.md },
    heading: { fontSize: 22, fontWeight: '700', color: colors.dark, marginBottom: 4 },
    sub: { fontSize: 14, color: colors.gray, marginBottom: 24 },
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
    forgotWrap: { marginTop: 14, alignItems: 'center' },
    forgotText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
    footer: { marginTop: 24, alignItems: 'center' },
    footerText: { fontSize: 14, color: colors.gray },
    footerLink: { color: colors.primary, fontWeight: '700' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: colors.dark },
    modalSub: { fontSize: 14, color: colors.gray, marginBottom: 20, lineHeight: 20 },
    fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    errorText: { fontSize: 13, color: colors.error, marginBottom: 10, textAlign: 'center', lineHeight: 18 },
  });
}
