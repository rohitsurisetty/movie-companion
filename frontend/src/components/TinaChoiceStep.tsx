import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';

// Tina avatar
const TINA_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face';

type Props = {
  userName: string;
  onChatWithTina: () => void;
  onContinueManually: () => void;
};

export default function TinaChoiceStep({ userName, onChatWithTina, onContinueManually }: Props) {
  return (
    <View style={styles.container}>
      {/* Tina Avatar & Intro */}
      <View style={styles.introSection}>
        <View style={styles.avatarContainer}>
          <Image source={{ uri: TINA_AVATAR }} style={styles.avatar} />
          <View style={styles.onlineDot} />
        </View>
        <Text style={styles.greeting}>Hey {userName || 'there'}!</Text>
        <Text style={styles.introText}>
          I&apos;m Tina, your profile assistant. I can help you create an amazing profile through a quick chat - no boring forms!
        </Text>
      </View>

      {/* Options */}
      <View style={styles.optionsSection}>
        {/* Chat with Tina - Primary */}
        <TouchableOpacity 
          style={styles.primaryOption} 
          onPress={onChatWithTina}
          activeOpacity={0.8}
        >
          <View style={styles.optionContent}>
            <View style={styles.optionIcon}>
              <Ionicons name="chatbubbles" size={24} color="#FFF" />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.primaryOptionTitle}>Chat with Tina</Text>
              <Text style={styles.primaryOptionSubtitle}>Quick, fun &amp; personalized</Text>
            </View>
          </View>
          <Ionicons name="arrow-forward" size={20} color="#FFF" />
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Manual Option - Secondary */}
        <TouchableOpacity 
          style={styles.secondaryOption} 
          onPress={onContinueManually}
          activeOpacity={0.8}
        >
          <View style={styles.optionContent}>
            <View style={styles.secondaryOptionIcon}>
              <Ionicons name="list" size={22} color={COLORS.textSecondary} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.secondaryOptionTitle}>Fill form manually</Text>
              <Text style={styles.secondaryOptionSubtitle}>Traditional step-by-step</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Features */}
      <View style={styles.features}>
        <View style={styles.featureItem}>
          <Ionicons name="time-outline" size={18} color={COLORS.primary} />
          <Text style={styles.featureText}>~2 min</Text>
        </View>
        <View style={styles.featureDot} />
        <View style={styles.featureItem}>
          <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
          <Text style={styles.featureText}>Private</Text>
        </View>
        <View style={styles.featureDot} />
        <View style={styles.featureItem}>
          <Ionicons name="save-outline" size={18} color={COLORS.primary} />
          <Text style={styles.featureText}>Auto-save</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: SPACING.xl,
  },
  introSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl * 1.5,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.lg,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
    borderWidth: 3,
    borderColor: COLORS.bg,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  introText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SPACING.md,
  },
  optionsSection: {
    marginBottom: SPACING.xl,
  },
  primaryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  optionText: {
    flex: 1,
  },
  primaryOptionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  primaryOptionSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginHorizontal: SPACING.md,
  },
  secondaryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgCard,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  secondaryOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  secondaryOptionSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featureText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  featureDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textMuted,
    marginHorizontal: SPACING.md,
  },
});
