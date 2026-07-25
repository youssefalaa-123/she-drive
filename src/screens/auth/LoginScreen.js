import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert,
  ActivityIndicator, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SheDriveLogo from '../../components/SheDriveLogo';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../context/SettingsContext';

// Races `promise` against a hard deadline so a hanging fetch never blocks the UI.
function withTimeout(promise, ms, label = 'Request') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s. Check your connection.`)),
        ms
      )
    ),
  ]);
}

const friendlyError = (msg, t) => {
  if (!msg) return t('invalidCredential');
  const m = msg.toLowerCase();
  // Keep human-readable mappings only for credential errors and rate-limiting.
  // Everything else — including timeouts, CORS, network failures — shows the raw
  // message so the exact failure reason is visible on the phone screen.
  if (m.includes('too many'))  return t('tooManyRequests');
  if (m.includes('not confirmed') || m.includes('email confirmation'))
    return t('emailNotConfirmed') || 'Please confirm your email before signing in.';
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('wrong password') || m.includes('user not found'))
    return t('invalidCredential');
  return msg;
};

export default function LoginScreen({ navigation }) {
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [identifier,    setIdentifier]   = useState('');
  const [password,      setPassword]     = useState('');
  const [showPassword,  setShowPassword] = useState(false);
  const [loading,       setLoading]      = useState(false);
  const [loginError,    setLoginError]   = useState('');
  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError,   setForgotError]   = useState('');

  const closeForgot = () => { setForgotVisible(false); setForgotEmail(''); setForgotError(''); };

  const handleForgotReset = async () => {
    const email = forgotEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { setForgotError(t('enterValidEmail')); return; }
    setForgotError('');
    setForgotLoading(true);
    try {
      await withTimeout(supabase.auth.resetPasswordForEmail(email), 12000, 'Password reset');
    } catch (_) {}
    setForgotLoading(false);
    Alert.alert(t('resetEmailSent'), t('resetEmailBody'), [{ text: t('ok'), onPress: closeForgot }]);
  };

  const stripInvisible = (str) => str.replace(/[​-‏‪-‮﻿ ]/g, '').trim();
  const normalizePhone = (raw) => {
    const d = raw.replace(/\D/g, '');
    return d.startsWith('20') && d.length === 12 ? '0' + d.slice(2) : d;
  };

  const handleLogin = async () => {
    const input = stripInvisible(identifier);
    const pass  = stripInvisible(password);
    if (!input || !pass) { setLoginError(t('enterEmailAndPassword')); return; }
    setLoginError('');
    setLoading(true);

    try {
      let email = input.toLowerCase();

      // Phone-based login: resolve the canonical email, which Supabase auth needs.
      // We cache the phone→email mapping locally so repeat logins are instant
      // (Supabase cold-starts on free-tier projects can take >10 s on first request).
      if (!input.includes('@')) {
        const phone = normalizePhone(input);
        const cacheKey = `@shedrive_pec_${phone}`;

        // 1. Try the local cache first — no network call on repeat logins.
        let cachedEmail = null;
        try { cachedEmail = await AsyncStorage.getItem(cacheKey); } catch {}

        if (cachedEmail) {
          email = cachedEmail;
        } else {
          // 2. Cache miss — query the server. No artificial timeout here:
          // Supabase free-tier cold starts can take 15-20 s, and the spinner
          // already shows the user that work is in progress. After one
          // successful lookup the result is cached, making future logins instant.
          console.log('[Phone Lookup] Querying phone_index for:', phone);
          try {
            const { data: foundEmail, error: lookupErr } = await supabase.rpc('lookup_email_by_phone', { p_phone: phone });
            if (lookupErr) throw lookupErr;
            if (!foundEmail) {
              setLoginError(t('invalidCredential'));
              return;
            }
            email = foundEmail;
            // Cache for future logins — phone→email never changes.
            try { await AsyncStorage.setItem(cacheKey, foundEmail); } catch {}
          } catch (lookupErr) {
            console.error('[Passenger Auth Error] phone lookup:', lookupErr);
            setLoginError(friendlyError(lookupErr.message, t));
            return;
          }
        }
      }

      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password: pass }),
        15000,
        'Sign-in'
      );

      if (error) {
        console.error('[Passenger Auth Error]:', error);
        setLoginError(friendlyError(error.message, t));
      }
      // On success the onAuthStateChange listener in AuthContext handles navigation.

    } catch (err) {
      console.error('[Passenger Auth Error]:', err);
      setLoginError(err?.message || err?.code || 'Sign-in failed. Please try again.');
    } finally {
      // Runs on success, error, timeout, and early return — spinner always stops.
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}><SheDriveLogo size={0.9} /></View>

        <View style={styles.card}>
          <Text style={styles.heading}>{t('welcomeBack')}</Text>
          <Text style={styles.sub}>{t('signInSub')}</Text>

          <TextInput
            style={styles.input} placeholder={t('emailOrPhone')}
            value={identifier} onChangeText={setIdentifier}
            autoCapitalize="none" autoCorrect={false}
            writingDirection="ltr" placeholderTextColor={colors.gray}
          />

          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput} placeholder={t('password')}
              value={password} onChangeText={setPassword}
              secureTextEntry={!showPassword} autoCapitalize="none"
              autoCorrect={false} placeholderTextColor={colors.gray}
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

          {!!loginError && <Text style={styles.loginError}>{loginError}</Text>}

          <TouchableOpacity onPress={() => setForgotVisible(true)} style={styles.forgotWrap}>
            <Text style={styles.forgotText}>{t('forgotPassword')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.footer}>
          <Text style={styles.footerText}>
            {t('noAccount')}{'  '}<Text style={styles.footerLink}>{t('register')}</Text>
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
              style={styles.input} placeholder="your@email.com"
              value={forgotEmail} onChangeText={setForgotEmail}
              keyboardType="email-address" autoCapitalize="none"
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
    container:      { flexGrow: 1, backgroundColor: colors.primaryBg, justifyContent: 'center', padding: 24 },
    logoWrap:       { alignItems: 'center', marginBottom: 28, marginTop: 8 },
    card:           { backgroundColor: colors.white, borderRadius: 20, padding: 24, ...shadow.md },
    heading:        { fontSize: 22, fontWeight: '700', color: colors.dark, marginBottom: 4 },
    sub:            { fontSize: 14, color: colors.gray, marginBottom: 24 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14,
      fontSize: 15, color: colors.dark, marginBottom: 14, backgroundColor: colors.lightGray,
      ...(Platform.OS === 'web' && { direction: 'ltr', textAlign: 'left' }),
    },
    passwordWrap: {
      flexDirection: 'row', alignItems: 'center', borderWidth: 1,
      borderColor: colors.border, borderRadius: 12,
      backgroundColor: colors.lightGray, marginBottom: 14,
      ...(Platform.OS === 'web' && { direction: 'ltr' }),
    },
    passwordInput: {
      flex: 1, padding: 14, fontSize: 15, color: colors.dark,
      ...(Platform.OS === 'web' && { direction: 'ltr', textAlign: 'left' }),
    },
    eyeBtn:         { paddingHorizontal: 14 },
    button:         { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
    buttonDisabled: { opacity: 0.6 },
    buttonText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
    loginError:     { fontSize: 13, color: '#EF4444', textAlign: 'center', marginTop: 10, lineHeight: 18 },
    forgotWrap:     { marginTop: 14, alignItems: 'center' },
    forgotText:     { fontSize: 13, color: colors.primary, fontWeight: '600' },
    footer:         { marginTop: 24, alignItems: 'center' },
    footerText:     { fontSize: 14, color: colors.gray },
    footerLink:     { color: colors.primary, fontWeight: '700' },
    modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet:     { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48 },
    modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle:     { fontSize: 20, fontWeight: '800', color: colors.dark },
    modalSub:       { fontSize: 14, color: colors.gray, marginBottom: 20, lineHeight: 20 },
    fieldLabel:     { fontSize: 11, fontWeight: '700', color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    errorText:      { fontSize: 13, color: colors.error, marginBottom: 10, textAlign: 'center', lineHeight: 18 },
  });
}
