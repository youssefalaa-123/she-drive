import React, { useState, useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function NetworkBanner() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showReconnected, setShowReconnected] = useState(false);
  const slideY = useRef(new Animated.Value(-56)).current;
  const reconnectTimer = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => setShowReconnected(false), 2800);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
      clearTimeout(reconnectTimer.current);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(reconnectTimer.current);
    };
  }, []);

  const shouldShow = !isOnline || showReconnected;

  useEffect(() => {
    Animated.spring(slideY, {
      toValue: shouldShow ? 0 : -56,
      useNativeDriver: true,
      speed: 18,
      bounciness: 0,
    }).start();
  }, [shouldShow]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        zIndex: 99999,
        transform: [{ translateY: slideY }],
        backgroundColor: isOnline ? '#10B981' : '#EF4444',
        paddingVertical: 11,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 10,
      }}
    >
      <Ionicons
        name={isOnline ? 'wifi' : 'wifi-outline'}
        size={16}
        color="#fff"
      />
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, flex: 1 }}>
        {isOnline
          ? '✓ Back online'
          : 'No internet connection — some features may not work'}
      </Text>
    </Animated.View>
  );
}
