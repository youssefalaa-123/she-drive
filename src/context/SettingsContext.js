import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import { colors as lightColors, shadow as lightShadow } from '../theme';
import { t as translate } from '../translations';

const darkColors = {
  primary: '#E91E63',
  primaryLight: '#F06292',
  primaryBg: '#1A0A10',
  white: '#1C1C1E',
  dark: '#F2F2F7',
  gray: '#8E8E93',
  lightGray: '#2C2C2E',
  border: '#3A3A3C',
  success: '#30D158',
  gold: '#FFD60A',
  error: '#FF453A',
};

const darkShadow = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 8 },
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [language, setLangState] = useState('en');
  const [isDarkMode, setDarkState] = useState(false);
  const [notifications, setNotifState] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(['language', 'darkMode', 'notifications'])
      .then((pairs) => {
        const map = Object.fromEntries(pairs.map(([k, v]) => [k, v]));
        if (map.language) setLangState(map.language);
        if (map.darkMode !== null) setDarkState(map.darkMode === 'true');
        if (map.notifications !== null) setNotifState(map.notifications !== 'false');
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setLanguage = async (lang) => {
    setLangState(lang);
    await AsyncStorage.setItem('language', lang).catch(() => {});
    const shouldBeRTL = lang === 'ar';
    if (I18nManager.isRTL !== shouldBeRTL) {
      I18nManager.allowRTL(shouldBeRTL);
      I18nManager.forceRTL(shouldBeRTL);
    }
  };

  const setDarkMode = async (val) => {
    setDarkState(val);
    await AsyncStorage.setItem('darkMode', String(val)).catch(() => {});
  };

  const setNotifications = async (val) => {
    setNotifState(val);
    await AsyncStorage.setItem('notifications', String(val)).catch(() => {});
  };

  const value = useMemo(
    () => ({ language, isDarkMode, notifications, setLanguage, setDarkMode, setNotifications, loaded }),
    [language, isDarkMode, notifications, loaded],
  );

  if (!loaded) return null;

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

export function useTheme() {
  const { language, isDarkMode } = useSettings();
  return useMemo(() => ({
    colors: isDarkMode ? darkColors : lightColors,
    shadow: isDarkMode ? darkShadow : lightShadow,
    isRTL: language === 'ar',
    language,
    isDarkMode,
    t: (key) => translate(language, key),
  }), [language, isDarkMode]);
}
