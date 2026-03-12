import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay,
  Easing, withSequence,
} from 'react-native-reanimated';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SuccessScreen() {
  const leftCurtain = useSharedValue(0);
  const rightCurtain = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentScale = useSharedValue(0.8);
  const titleY = useSharedValue(30);
  const buttonOpacity = useSharedValue(0);

  useEffect(() => {
    // Curtain opening animation
    leftCurtain.value = withDelay(500, withTiming(-SCREEN_WIDTH / 2, {
      duration: 1200, easing: Easing.out(Easing.cubic),
    }));
    rightCurtain.value = withDelay(500, withTiming(SCREEN_WIDTH / 2, {
      duration: 1200, easing: Easing.out(Easing.cubic),
    }));

    // Content reveal
    contentOpacity.value = withDelay(1200, withTiming(1, { duration: 800 }));
    contentScale.value = withDelay(1200, withTiming(1, { duration: 800, easing: Easing.out(Easing.back(1.5)) }));
    titleY.value = withDelay(1400, withTiming(0, { duration: 600 }));
    buttonOpacity.value = withDelay(2000, withTiming(1, { duration: 600 }));
  }, []);

  const leftCurtainStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leftCurtain.value }],
  }));

  const rightCurtainStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightCurtain.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ scale: contentScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: titleY.value }],
    opacity: contentOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
  }));

  return (
    <SafeAreaView style={styles.container} testID="success-screen">
      {/* Content behind curtains */}
      <View style={styles.contentContainer}>
        <Animated.View style={[styles.centerContent, contentStyle]}>
          <View style={styles.iconGlow}>
            <Ionicons name="film-outline" size={64} color={COLORS.gold} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.titleContainer, titleStyle]}>
          <Text style={styles.title}>Let's Begin The Show!</Text>
          <View style={styles.goldLine} />
          <Text style={styles.subtitle}>Your movie journey starts now.</Text>
        </Animated.View>

        <Animated.View style={[styles.buttonContainer, buttonStyle]}>
          <TouchableOpacity style={styles.enterBtn} testID="enter-app-btn" activeOpacity={0.8}>
            <Ionicons name="play" size={20} color={COLORS.white} />
            <Text style={styles.enterBtnText}>Enter Film Companion</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Left Curtain */}
      <Animated.View style={[styles.curtain, styles.leftCurtain, leftCurtainStyle]}>
        <View style={styles.curtainInner}>
          {[...Array(8)].map((_, i) => (
            <View key={i} style={styles.curtainFold} />
          ))}
        </View>
      </Animated.View>

      {/* Right Curtain */}
      <Animated.View style={[styles.curtain, styles.rightCurtain, rightCurtainStyle]}>
        <View style={styles.curtainInner}>
          {[...Array(8)].map((_, i) => (
            <View key={i} style={styles.curtainFold} />
          ))}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    overflow: 'hidden',
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  centerContent: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  iconGlow: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,215,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,215,0,0.2)',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 1,
  },
  goldLine: {
    width: 80,
    height: 3,
    backgroundColor: COLORS.gold,
    borderRadius: 2,
    marginVertical: SPACING.m,
  },
  subtitle: {
    fontSize: 18,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 320,
  },
  enterBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 18,
    borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  enterBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    letterSpacing: 1,
  },
  curtain: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH / 2 + 10,
    zIndex: 10,
  },
  leftCurtain: {
    left: 0,
  },
  rightCurtain: {
    right: 0,
  },
  curtainInner: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#8B0000',
  },
  curtainFold: {
    flex: 1,
    backgroundColor: 'rgba(139,0,0,0.9)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(100,0,0,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
