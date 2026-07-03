import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Audio } from 'expo-av';
import { useTheme } from '../context/SettingsContext';

const PARTICLES = Array.from({ length: 12 }, (_, i) => i);

export default function BadgeModal({ visible, tripCount, onClose }) {
  const { colors, t } = useTheme();
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const particles = useRef(PARTICLES.map(() => ({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    op: new Animated.Value(1),
  }))).current;

  useEffect(() => {
    if (!visible) return;

    scale.setValue(0);
    opacity.setValue(0);
    particles.forEach((p) => { p.x.setValue(0); p.y.setValue(0); p.op.setValue(1); });

    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ...particles.map((p, i) => {
        const angle = (i / PARTICLES.length) * 2 * Math.PI;
        const dist = 80 + Math.random() * 60;
        return Animated.parallel([
          Animated.timing(p.x, { toValue: Math.cos(angle) * dist, duration: 800, useNativeDriver: true }),
          Animated.timing(p.y, { toValue: Math.sin(angle) * dist, duration: 800, useNativeDriver: true }),
          Animated.timing(p.op, { toValue: 0, duration: 800, delay: 300, useNativeDriver: true }),
        ]);
      }),
    ]).start();

    playChime();
  }, [visible]);

  const playChime = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://assets.mixkit.co/sfx/preview/mixkit-achievement-bell-600.mp3' },
        { shouldPlay: true }
      );
      setTimeout(() => sound.unloadAsync(), 4000);
    } catch (_) {}
  };

  const particleColors = [colors.gold, colors.primary, colors.primaryLight, '#FFD700', '#FF6B9D'];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.container, { backgroundColor: colors.white, opacity, transform: [{ scale }] }]}>
          {particles.map((p, i) => (
            <Animated.View
              key={i}
              style={[
                styles.particle,
                {
                  backgroundColor: particleColors[i % particleColors.length],
                  opacity: p.op,
                  transform: [{ translateX: p.x }, { translateY: p.y }],
                },
              ]}
            />
          ))}

          <Text style={styles.badge}>🏅</Text>
          <Text style={[styles.title, { color: colors.dark }]}>{t('newBadgeEarned')}</Text>
          <Text style={[styles.body, { color: colors.gray }]}>
            {t('badgeBodyPre')}<Text style={[styles.highlight, { color: colors.primary }]}>{tripCount} {t('tripsLabel')}</Text>{t('badgeBodyPost')}
          </Text>

          <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={onClose}>
            <Text style={[styles.buttonText, { color: colors.white }]}>{t('awesomeBtn')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  container: {
    borderRadius: 24, padding: 36,
    alignItems: 'center', width: 300, overflow: 'visible',
  },
  particle: {
    position: 'absolute', width: 10, height: 10, borderRadius: 5,
  },
  badge: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  highlight: { fontWeight: '700' },
  button: {
    borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 32,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
});
