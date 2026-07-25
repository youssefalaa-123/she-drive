import React from 'react';
import { Image, View } from 'react-native';

const BASE = 160;

export default function SheDriveLogo({ size = 1 }) {
  const dim = BASE * size;
  return (
    <View style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={require('../../assets/logo.png')}
        style={{ width: dim, height: dim }}
        resizeMode="contain"
      />
    </View>
  );
}
