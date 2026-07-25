import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import SheDriveLogo from '../../components/SheDriveLogo';

export default function SplashScreen({ navigation }) {
  const scale   = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => navigation.replace('Login'), 2400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity, transform: [{ scale }] }]}>
        <SheDriveLogo size={1.15} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F4F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { alignItems: 'center' },
});
