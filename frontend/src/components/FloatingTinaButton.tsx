import React from 'react';
import {
  View,
  TouchableOpacity,
  Image,
  StyleSheet,
  Animated,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTina } from '../context/TinaContext';

// Tina avatar
const TINA_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face';

interface FloatingTinaButtonProps {
  // Optional custom positioning
  bottomOffset?: number;
  rightOffset?: number;
  // Hide on certain screens (deprecated - use shouldShowFloatingButton from context)
  visible?: boolean;
}

export default function FloatingTinaButton({
  bottomOffset = 80, // Above tab bar by default
  rightOffset = 16,
  visible = true,
}: FloatingTinaButtonProps) {
  const insets = useSafeAreaInsets();
  const { state, toggleTina, shouldShowFloatingButton } = useTina();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // Check if button should be visible based on context
  const isVisible = visible && shouldShowFloatingButton();

  // Pulse animation when there's an unread message
  React.useEffect(() => {
    if (state.hasUnreadMessage && isVisible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state.hasUnreadMessage, isVisible, pulseAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  // Hide if not visible or Tina is already open
  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: bottomOffset + insets.bottom,
          right: rightOffset,
          transform: [
            { scale: scaleAnim },
            { scale: state.hasUnreadMessage ? pulseAnim : 1 },
          ],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.button}
        onPress={toggleTina}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
      >
        {/* Glow effect */}
        <View style={styles.glowOuter} />
        <View style={styles.glowInner} />
        
        {/* Avatar */}
        <Image source={{ uri: TINA_AVATAR }} style={styles.avatar} />
        
        {/* Online indicator */}
        <View style={styles.onlineIndicator} />
        
        {/* Unread badge */}
        {state.hasUnreadMessage && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>!</Text>
          </View>
        )}
      </TouchableOpacity>
      
      {/* "Ask Tina" label */}
      {state.isMinimized && (
        <View style={styles.labelContainer}>
          <Text style={styles.label}>Tina</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 9999,
    alignItems: 'center',
  },
  button: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  glowOuter: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
  glowInner: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#1A1A1A',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1A1A1A',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  labelContainer: {
    marginTop: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
});
