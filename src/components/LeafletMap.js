import React, { forwardRef, useImperativeHandle } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

const LeafletMap = forwardRef(({ height = 240 }, ref) => {
  useImperativeHandle(ref, () => ({
    setMarker: () => {},
    removeMarker: () => {},
    showRoute: () => {},
    clearRoute: () => {},
    drawLine: () => {},
    clearLine: () => {},
    setView: () => {},
    fit: () => {},
  }), []);

  return (
    <View style={{ height, borderRadius: 16, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
      <Ionicons name="map-outline" size={40} color={colors.primary} />
      <Text style={{ color: colors.gray, fontSize: 13, marginTop: 8 }}>Map view</Text>
    </View>
  );
});

export default LeafletMap;
