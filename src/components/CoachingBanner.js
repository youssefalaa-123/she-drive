import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useTheme } from '../context/SettingsContext';
import { useLatestCoaching, useMarkCoachingSeen } from '../hooks/useCoaching';
import { useAuth } from '../context/AuthContext';

export default function CoachingBanner() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { data: msg } = useLatestCoaching(user?.uid);
  const { mutate: markSeen } = useMarkCoachingSeen();
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (msg) {
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [msg?.id]);

  if (!msg) return null;

  return (
    <Animated.View style={[styles.banner, { backgroundColor: colors.primaryBg, borderColor: colors.primary, opacity }]}>
      <Text style={[styles.icon]}>🔥</Text>
      <Text style={[styles.text, { color: colors.dark }]}>{msg.message}</Text>
      <TouchableOpacity onPress={() => markSeen(msg.id)} style={styles.close}>
        <Text style={{ color: colors.gray, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  icon: { fontSize: 20 },
  text: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  close: { padding: 4 },
});
