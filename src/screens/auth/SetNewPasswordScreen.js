import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/SettingsContext';
import SheDriveLogo from '../../components/SheDriveLogo';

export default function SetNewPasswordScreen() {
  const { colors, shadow, t } = useTheme();
  const { exitRecovery } = useAuth();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [done,        setDone]        = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (password.length < 8) { setError(t('weakPasswordMsg') || 'Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError(t('passwordsDoNotMatch') || 'Passwords do not match.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
  };

  if (done) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>
          <Text style={styles.successTitle}>
            {t('passwordUpdated') || 'Password updated!'}
          </Text>
          <Text style={styles.successSub}>
            {t('passwordUpdatedSub') || 'You can now use this password to sign in.'}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={exitRecovery}>
            <Text style={styles.btnText}>{t('continueTo') || 'Continue to app'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.container}>
        <View style={styles.logoWrap}>
          <SheDriveLogo size={0.8} />
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>{t('setNewPassword') || 'Set new password'}</Text>
          <Text style={styles.sub}>{t('setNewPasswordSub') || 'Choose a strong password for your account.'}</Text>

          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('newPassword') || 'New password (min 8 chars)'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              placeholderTextColor={colors.gray}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass(v => !v)}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.gray} />
            </TouchableOpacity>
          </View>

          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('confirmPassword') || 'Confirm password'}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              placeholderTextColor={colors.gray}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirm(v => !v)}>
              <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.gray} />
            </TouchableOpacity>
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.btn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>{t('setPassword') || 'Set password'}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container:     { flex: 1, backgroundColor: colors.primaryBg, justifyContent: 'center', padding: 24 },
    logoWrap:      { alignItems: 'center', marginBottom: 24 },
    card:          { backgroundColor: colors.white, borderRadius: 20, padding: 24, ...shadow.md },
    heading:       { fontSize: 22, fontWeight: '700', color: colors.dark, marginBottom: 4 },
    sub:           { fontSize: 14, color: colors.gray, marginBottom: 24, lineHeight: 20 },
    passwordWrap:  {
      flexDirection: 'row', alignItems: 'center', borderWidth: 1,
      borderColor: colors.border, borderRadius: 12,
      backgroundColor: colors.lightGray, marginBottom: 14,
    },
    passwordInput: { flex: 1, padding: 14, fontSize: 15, color: colors.dark },
    eyeBtn:        { paddingHorizontal: 14 },
    errorText:     { color: '#DC2626', fontSize: 13, textAlign: 'center', marginBottom: 12 },
    btn:           { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
    btnText:       { color: '#fff', fontSize: 16, fontWeight: '700' },
    successCircle: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center',
      alignSelf: 'center', marginBottom: 20,
    },
    successTitle: { fontSize: 20, fontWeight: '800', color: colors.dark, textAlign: 'center', marginBottom: 8 },
    successSub:   { fontSize: 14, color: colors.gray, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  });
}
