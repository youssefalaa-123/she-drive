import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Catch misconfigured builds immediately — physical devices cannot reach localhost.
if (!SUPABASE_URL || /localhost|127\.0\.0\.1/.test(SUPABASE_URL)) {
  console.error('[Supabase] EXPO_PUBLIC_SUPABASE_URL is missing or points to localhost:', SUPABASE_URL);
}
if (!SUPABASE_ANON_KEY) {
  console.error('[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY is not set');
}

// Safari Private Browsing restricts localStorage to a 0-byte quota. Writes
// throw a QuotaExceededError, which would propagate through the Supabase client
// and crash session persistence. This wrapper swallows storage failures so the
// auth flow degrades gracefully (session is not persisted, but sign-in works).
const safeAsyncStorage = {
  getItem: async (key) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (err) {
      console.warn('[storage] getItem failed:', err?.message);
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (err) {
      console.warn('[storage] setItem failed (session will not persist):', err?.message);
    }
  },
  removeItem: async (key) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.warn('[storage] removeItem failed:', err?.message);
    }
  },
};

// On native, store the Supabase JWT in expo-secure-store (Android Keystore /
// iOS Secure Enclave) rather than plain AsyncStorage, so a rooted device cannot
// extract the token from a plaintext SQLite file (Finding #9 fix).
// SecureStore keys must be <= 2048 bytes; Supabase keys are short UUIDs — safe.
// SecureStore is unavailable on web: fall back to safeAsyncStorage there.
const secureStorage = Platform.OS === 'web' ? safeAsyncStorage : {
  getItem: async (key) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      console.warn('[secureStorage] getItem failed, falling back to AsyncStorage:', err?.message);
      return safeAsyncStorage.getItem(key);
    }
  },
  setItem: async (key, value) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (err) {
      console.warn('[secureStorage] setItem failed, falling back to AsyncStorage:', err?.message);
      await safeAsyncStorage.setItem(key, value);
    }
  },
  removeItem: async (key) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      console.warn('[secureStorage] removeItem failed, falling back to AsyncStorage:', err?.message);
      await safeAsyncStorage.removeItem(key);
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:            secureStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    // On web the SDK reads the #access_token hash from the redirect URL automatically.
    // On native, deep-link handling is done manually via Linking.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
