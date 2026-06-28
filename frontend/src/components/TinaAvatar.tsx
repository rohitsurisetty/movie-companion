import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, ImageStyle, StyleProp, ViewStyle } from 'react-native';

// Remote Tina avatar (works in preview + APK if the network can reach Unsplash).
// If the request fails (rate-limit / no network / region block), we gracefully fall
// back to a stylized red circle with the letter "T" so the UI never breaks.
const REMOTE = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face';

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
        source={{ uri: REMOTE }}
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
