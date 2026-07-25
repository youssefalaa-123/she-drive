import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView,
  Alert, Modal, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useTheme, useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import TermsContent from '../components/TermsContent';
import { passengerTerms, driverTerms } from '../data/termsOfService';

const APP_VERSION = '1.0.0';

export default function SettingsScreen() {
  const { colors, shadow, t, isRTL } = useTheme();
  const { isDarkMode, setDarkMode, notifications, setNotifications, language, setLanguage } = useSettings();
  const { user, userProfile, signOut } = useAuth();

  const s = makeStyles(colors, shadow, isRTL);

  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSignOut = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(t('signOutMsg') || 'Are you sure you want to sign out?')) {
        signOut().catch(() => {});
      }
      return;
    }
    Alert.alert(t('signOutConfirm'), t('signOutMsg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('signOut'), style: 'destructive', onPress: () => signOut().catch(() => {}) },
    ]);
  };

  const handleSendFeedback = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert(t('missingFields'), t('enterSubjectAndMsg'));
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from('feedback').insert({
        user_id: user?.id,
        user_name: userProfile?.name || 'Unknown',
        subject: subject.trim(),
        message: message.trim(),
        role: userProfile?.role || 'user',
      });
      if (error) throw error;
      setSubject('');
      setMessage('');
      setFeedbackVisible(false);
      Alert.alert(t('thankYou'), t('feedbackSubmitted'));
    } catch (err) {
      Alert.alert(t('error'), err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Feedback Modal */}
      <Modal
        visible={feedbackVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFeedbackVisible(false)}
      >
        <View style={s.overlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t('helpFeedback')}</Text>
              <TouchableOpacity onPress={() => setFeedbackVisible(false)}>
                <Ionicons name="close" size={22} color={colors.gray} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalSub}>{t('feedbackSub')}</Text>
            <TextInput
              style={s.modalInput}
              placeholder={t('subject')}
              placeholderTextColor={colors.gray}
              value={subject}
              onChangeText={setSubject}
            />
            <TextInput
              style={[s.modalInput, s.modalTextarea]}
              placeholder={t('yourMessage')}
              placeholderTextColor={colors.gray}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[s.modalBtn, sending && { opacity: 0.6 }]}
              onPress={handleSendFeedback}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.modalBtnText}>{t('submitFeedback')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal
        visible={privacyVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPrivacyVisible(false)}
      >
        <View style={s.overlay}>
          <View style={s.policySheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t('privacyPolicy')}</Text>
              <TouchableOpacity onPress={() => setPrivacyVisible(false)}>
                <Ionicons name="close" size={22} color={colors.gray} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.policyText}>{t('privacyPolicyText')}</Text>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Terms of Service Modal */}
      <Modal
        visible={termsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTermsVisible(false)}
      >
        <View style={s.overlay}>
          <View style={s.policySheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t('termsOfService')}</Text>
              <TouchableOpacity onPress={() => setTermsVisible(false)}>
                <Ionicons name="close" size={22} color={colors.gray} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TermsContent terms={userProfile?.role === 'driver' ? driverTerms : passengerTerms} />
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={s.root}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.pageTitle}>{t('settings')}</Text>

        {/* APPEARANCE */}
        <Text style={s.sectionHeader}>{t('appearance')}</Text>
        <View style={s.card}>
          <Row
            icon="moon-outline"
            label={t('darkMode')}
            colors={colors}
            isRTL={isRTL}
            right={
              <Switch
                value={isDarkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            }
          />
        </View>

        {/* LANGUAGE */}
        <Text style={s.sectionHeader}>{t('language')}</Text>
        <View style={s.card}>
          <View style={s.langRow}>
            <Ionicons
              name="language-outline"
              size={20}
              color={colors.primary}
              style={isRTL ? s.rowIconRTL : s.rowIcon}
            />
            <View style={s.langBtns}>
              <TouchableOpacity
                style={[s.langBtn, language === 'en' && s.langBtnActive]}
                onPress={() => setLanguage('en')}
              >
                <Text style={[s.langBtnText, language === 'en' && s.langBtnTextActive]}>
                  English
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.langBtn, language === 'ar' && s.langBtnActive]}
                onPress={() => setLanguage('ar')}
              >
                <Text style={[s.langBtnText, language === 'ar' && s.langBtnTextActive]}>
                  العربية
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* NOTIFICATIONS */}
        <Text style={s.sectionHeader}>{t('notifications')}</Text>
        <View style={s.card}>
          <Row
            icon="notifications-outline"
            label={t('pushNotifications')}
            colors={colors}
            isRTL={isRTL}
            right={
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            }
          />
        </View>

        {/* SUPPORT */}
        <Text style={s.sectionHeader}>{t('support')}</Text>
        <View style={s.card}>
          <Row
            icon="chatbubble-ellipses-outline"
            label={t('helpFeedback')}
            colors={colors}
            isRTL={isRTL}
            onPress={() => setFeedbackVisible(true)}
            chevron
          />
        </View>

        {/* ABOUT */}
        <Text style={s.sectionHeader}>{t('about')}</Text>
        <View style={s.card}>
          <Row
            icon="information-circle-outline"
            label={t('appVersion')}
            colors={colors}
            isRTL={isRTL}
            right={<Text style={{ fontSize: 14, color: colors.gray }}>{APP_VERSION}</Text>}
          />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <Row
            icon="shield-checkmark-outline"
            label={t('privacyPolicy')}
            colors={colors}
            isRTL={isRTL}
            onPress={() => setPrivacyVisible(true)}
            chevron
          />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <Row
            icon="document-text-outline"
            label={t('termsOfService')}
            colors={colors}
            isRTL={isRTL}
            onPress={() => setTermsVisible(true)}
            chevron
          />
        </View>

        {/* SIGN OUT */}
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={s.signOutText}>{t('signOut')}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, right, chevron, onPress, colors, isRTL }) {
  // On web, CSS direction:rtl from root already reverses flex rows.
  // Only apply explicit row-reverse on native to avoid double reversal.
  const rtlFlip = isRTL && Platform.OS !== 'web';

  const content = (
    <View style={[rowStyle.row, rtlFlip && rowStyle.rowRTL]}>
      <Ionicons
        name={icon}
        size={20}
        color={colors.primary}
        style={isRTL ? rowStyle.iconRTL : rowStyle.icon}
      />
      <Text style={[rowStyle.label, { color: colors.dark }, isRTL && rowStyle.labelRTL]}>
        {label}
      </Text>
      <View style={[rowStyle.right, isRTL && Platform.OS === 'web' && { direction: 'ltr' }]}>
        {right}
        {chevron && (
          <Ionicons
            name={isRTL ? 'chevron-back-outline' : 'chevron-forward-outline'}
            size={18}
            color={colors.gray}
          />
        )}
      </View>
    </View>
  );

  if (onPress) return <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>;
  return content;
}

const rowStyle = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  rowRTL: { flexDirection: 'row-reverse' },
  icon: { marginRight: 12 },
  iconRTL: { marginLeft: 12, marginRight: 0 },
  label: { flex: 1, fontSize: 15 },
  labelRTL: { textAlign: 'right' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
});

function makeStyles(colors, shadow, isRTL) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.primaryBg },
    content: { padding: 20, paddingBottom: 40 },
    pageTitle: {
      fontSize: 28, fontWeight: '800', color: colors.dark,
      marginBottom: 24, textAlign: isRTL ? 'right' : 'left',
    },
    sectionHeader: {
      fontSize: 11, fontWeight: '700', color: colors.gray,
      textTransform: 'uppercase', letterSpacing: 1,
      marginBottom: 8, marginTop: 20,
      marginLeft: isRTL ? 0 : 4, marginRight: isRTL ? 4 : 0,
      textAlign: isRTL ? 'right' : 'left',
    },
    card: {
      backgroundColor: colors.white, borderRadius: 16,
      paddingHorizontal: 16, paddingVertical: 4, ...shadow.md,
    },
    langRow: {
      flexDirection: (isRTL && Platform.OS !== 'web') ? 'row-reverse' : 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    rowIcon: { marginRight: 12 },
    rowIconRTL: { marginLeft: 12, marginRight: 0 },
    langBtns: {
      flex: 1, flexDirection: 'row', gap: 8,
      marginLeft: isRTL ? 0 : 12, marginRight: isRTL ? 12 : 0,
    },
    langBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
      backgroundColor: colors.lightGray, borderWidth: 1, borderColor: colors.border,
    },
    langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    langBtnText: { fontSize: 14, fontWeight: '600', color: colors.gray },
    langBtnTextActive: { color: '#fff' },
    divider: {
      height: 1,
      marginLeft: isRTL ? 0 : 36,
      marginRight: isRTL ? 36 : 0,
    },
    signOutBtn: {
      flexDirection: (isRTL && Platform.OS !== 'web') ? 'row-reverse' : 'row',
      alignItems: 'center', justifyContent: 'center',
      marginTop: 28, paddingVertical: 16, borderRadius: 14,
      borderWidth: 1.5, borderColor: '#FF3B30', gap: 8,
      backgroundColor: colors.white,
    },
    signOutText: { fontSize: 16, fontWeight: '700', color: '#FF3B30' },
    // Modals
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: colors.white,
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      padding: 24, paddingBottom: 48,
    },
    policySheet: {
      backgroundColor: colors.white,
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      padding: 24, paddingBottom: 32, maxHeight: '85%',
    },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 16,
    },
    modalTitle: { fontSize: 20, fontWeight: '800', color: colors.dark },
    modalSub: { fontSize: 13, color: colors.gray, marginBottom: 16 },
    modalInput: {
      borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
      padding: 13, fontSize: 15, color: colors.dark,
      backgroundColor: colors.lightGray, marginBottom: 12,
    },
    modalTextarea: { height: 110 },
    modalBtn: {
      backgroundColor: colors.primary, borderRadius: 14,
      padding: 16, alignItems: 'center', marginTop: 4,
    },
    modalBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    policyText: { fontSize: 14, color: colors.dark, lineHeight: 22 },
  });
}
