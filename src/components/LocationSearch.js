// Native fallback — plain TextInput (no autocomplete)
// For full native autocomplete, install: react-native-google-places-autocomplete

import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function LocationSearch({
  placeholder,
  value,
  onChange,
  dotColor = colors.primary,
  rightElement,
  style,
}) {
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.gray}
        value={value?.address || ''}
        onChangeText={(text) => onChange(text ? { address: text, lat: null, lng: null } : null)}
        autoCapitalize="none"
      />
      {rightElement}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 14, flexShrink: 0 },
  input: { flex: 1, fontSize: 15, color: colors.dark },
});
