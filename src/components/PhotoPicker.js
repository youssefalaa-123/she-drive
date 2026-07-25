import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, Platform, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

// Converts a base64 string to an ArrayBuffer without any external package.
// atob() is a global available in React Native 0.73+ (Expo SDK 54) and all browsers.
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Uploads an ArrayBuffer (decoded from base64) to Supabase Storage bucket 'avatars'.
// Returns the permanent public URL of the uploaded file.
async function uploadToStorage(base64, storagePath) {
  if (!base64) throw new Error('No image data received from picker. Ensure base64:true is set.');

  const arrayBuffer = base64ToArrayBuffer(base64);
  const filename = `${Date.now()}.jpg`;
  const path = `${storagePath}/${filename}`;

  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

  if (error) {
    console.error('[PhotoPicker] storage.upload error:', error);
    throw new Error(error.message || 'Upload to storage failed');
  }

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(data.path);
  console.log('[PhotoPicker] uploaded successfully:', publicUrl);
  return publicUrl;
}

async function launchPicker(useCamera) {
  if (useCamera) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Camera access is required.');
      return null;
    }
    return ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true, // required — we upload the base64 string, not the file:// URI
    });
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Photo library access is required.');
      return null;
    }
    return ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      // allowsEditing on web can silently return assets:[] in Expo SDK 54 — skip it on web
      allowsEditing: Platform.OS !== 'web',
      aspect: [1, 1],
      quality: 0.6,
      base64: true, // required — we upload the base64 string, not the file:// URI
    });
  }
}

export default function PhotoPicker({ label, value, onChange, storagePath, size = 100 }) {
  const [uploading, setUploading] = useState(false);
  const [localUri, setLocalUri] = useState(null);

  const handlePress = () => {
    if (Platform.OS === 'web') {
      runPick(false);
      return;
    }
    Alert.alert('Select Photo', 'Choose a source', [
      { text: '📷  Camera',  onPress: () => runPick(true) },
      { text: '🖼️  Gallery', onPress: () => runPick(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const runPick = async (useCamera) => {
    const result = await launchPicker(useCamera);
    if (!result || result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    // Show the local URI immediately as an optimistic preview
    setLocalUri(asset.uri);
    setUploading(true);

    try {
      // Upload the base64 data (not the URI) — this works on all platforms
      const url = await uploadToStorage(asset.base64, storagePath);
      setLocalUri(null); // parent will supply the confirmed remote URL via the value prop
      onChange(url);
    } catch (err) {
      console.error('[PhotoPicker] upload error:', err.message);
      setLocalUri(null);
      Alert.alert('Upload Failed', err.message || 'Could not upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const displayUri = localUri || value;

  return (
    <TouchableOpacity
      style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}
      onPress={handlePress}
    >
      {uploading ? (
        <View style={styles.inner}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.uploadText}>Uploading…</Text>
        </View>
      ) : displayUri ? (
        <Image
          source={{ uri: displayUri }}
          style={[styles.preview, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View style={styles.inner}>
          <Text style={styles.icon}>📷</Text>
          <Text style={styles.label} numberOfLines={2}>{label}</Text>
        </View>
      )}
      {!uploading && (
        <View style={styles.editBadge}>
          <Text style={{ fontSize: 10, color: '#fff' }}>✏️</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.lightGray,
    borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  inner:       { alignItems: 'center', padding: 6 },
  preview:     { resizeMode: 'cover' },
  icon:        { fontSize: 22, marginBottom: 3 },
  label:       { fontSize: 9, color: colors.gray, textAlign: 'center' },
  uploadText:  { fontSize: 9, color: colors.gray, marginTop: 4 },
  editBadge: {
    position: 'absolute', bottom: 3, right: 3,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
});
