import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, ImageStyle, StyleProp, ViewStyle } from 'react-native';

// Bundled Tina avatar (app logo) — no network fetch, and no stock photo of a
// real person posing as the AI matchmaker. If the image ever fails to decode,
// we fall back to a stylized red circle with the letter "T" so the UI never breaks.
const TINA_AVATAR = require('../../assets/images/filmydating-logo.png');

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  borderColor?: string;
  borderWidth?: number;
};

export default function TinaAvatar({ size = 32, style, borderColor, borderWidth = 0 }: Props) {
  const [failed, setFailed] = useState(false);

  const wrapperStyle: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      overflow: 'hidden',
      backgroundColor: '#FF6B6B',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth,
      borderColor: borderColor || 'transparent',
    },
    style,
  ];

  if (failed) {
    return (
      <View style={wrapperStyle}>
        <Text style={[styles.letter, { fontSize: Math.max(size * 0.42, 12) }]}>T</Text>
      </View>
    );
  }

  return (
    <View style={wrapperStyle}>
      <Image
        source={TINA_AVATAR}
        style={{ width: size, height: size } as ImageStyle}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  letter: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
