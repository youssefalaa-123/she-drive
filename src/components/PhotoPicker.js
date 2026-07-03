import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, Platform, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme';

const CLOUD_NAME = 'dy1gikshg';
const UPLOAD_PRESET = 'hlsbpqhn';
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

async function uploadToCloudinary(uri, folder) {
  const formData = new FormData();
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    formData.append('file', blob, 'photo.jpg');
  } else {
    formData.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' });
  }
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);
  const res = await fetch(UPLOAD_URL, { method: 'POST', body: formData });
  const data = await res.json();
  if (data.secure_url) return data.secure_url;
  throw new Error(data.error?.message || 'Upload failed');
}

async function launchPicker(useCamera) {
  if (useCamera) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Camera access is required.');
      return null;
    }
    return ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.75 });
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Photo library access is required.');
      return null;
    }
    return ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.75,
    });
  }
}

export default function PhotoPicker({ label, value, onChange, storagePath, size = 100 }) {
  const [uploading, setUploading] = useState(false);

  const handlePress = () => {
    if (Platform.OS === 'web') {
      runPick(false);
      return;
    }
    Alert.alert('Select Photo', 'Choose a source', [
      { text: '📷  Camera', onPress: () => runPick(true) },
      { text: '🖼️  Gallery', onPress: () => runPick(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const runPick = async (useCamera) => {
    const result = await launchPicker(useCamera);
    if (!result || result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(result.assets[0].uri, storagePath);
      onChange(url);
    } catch (err) {
      Alert.alert('Upload Failed', err.message);
    } finally {
      setUploading(false);
    }
  };

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
      ) : value ? (
        <Image source={{ uri: value }} style={[styles.preview, { width: size, height: size, borderRadius: size / 2 }]} />
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
  inner: { alignItems: 'center', padding: 6 },
  preview: { resizeMode: 'cover' },
  icon: { fontSize: 22, marginBottom: 3 },
  label: { fontSize: 9, color: colors.gray, textAlign: 'center' },
  uploadText: { fontSize: 9, color: colors.gray, marginTop: 4 },
  editBadge: {
    position: 'absolute', bottom: 3, right: 3,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
});
