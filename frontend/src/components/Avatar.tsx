/**
 * Shared circular avatar.
 * If `imageUrl` is a valid http(s) URL the image is rendered, otherwise a
 * gradient initial badge is shown. Extracted from chat.tsx + history.tsx
 * to avoid duplication.
 */
import React from 'react';
import { Image, Text, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface AvatarProps {
  name: string;
  size?: number;
  imageUrl?: string | null;
  primaryColor?: string;     // gradient start
  secondaryColor?: string;   // gradient end
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  size = 50,
  imageUrl,
  primaryColor = '#E50914',
  secondaryColor = '#FF6B6B',
}) => {
  const round = { width: size, height: size, borderRadius: size / 2 } as const;

  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    return <Image source={{ uri: imageUrl }} style={round} />;
  }

  return (
    <LinearGradient
      colors={[primaryColor, secondaryColor]}
      style={[round, styles.center]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>
        {name?.charAt(0).toUpperCase() || '?'}
      </Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#FFF',
    fontWeight: 'bold',
  },
});

export default Avatar;
