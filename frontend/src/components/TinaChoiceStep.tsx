import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';

const { width, height } = Dimensions.get('window');

// Tina avatar - friendly AI assistant
const TINA_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face';

type Props = {
  userName: string;
  onChatWithTina: () => void;
  onContinueManually: () => void;
};

export default function TinaChoiceStep({ userName, onChatWithTina, onContinueManually }: Props) {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Create Your Profile</Text>
        <Text style={styles.subtitle}>Choose how you&apos;d like to continue</Text>
      </View>

      {/* Tina Card */}
      <TouchableOpacity style={styles.tinaCard} onPress={onChatWithTina} activeOpacity={0.9}>
        <LinearGradient
          colors={['#FF6B9D', '#E50914']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tinaGradient}
        >
          {/* Tina Avatar */}
          <View style={styles.tinaAvatarContainer}>
            <Image source={{ uri: TINA_AVATAR }} style={styles.tinaAvatar} />
            <View style={styles.tinaOnlineDot} />
          </View>

          {/* Tina Info */}
          <View style={styles.tinaInfo}>
            <View style={styles.tinaNameRow}>
              <Text style={styles.tinaName}>Chat with Tina</Text>
              <Text style={styles.tinaSparkle}>✨</Text>
            </View>
            <Text style={styles.tinaDescription}>
              Let Tina get to know you and help create your profile through a fun conversation.
            </Text>
          </View>

          {/* Arrow */}
          <View style={styles.tinaArrow}>
            <Ionicons name="chatbubble-ellipses" size={28} color="#FFF" />
          </View>
        </LinearGradient>

        {/* Features */}
        <View style={styles.tinaFeatures}>
          <View style={styles.featureItem}>
            <Ionicons name="sparkles" size={16} color={COLORS.primary} />
            <Text style={styles.featureText}>AI-powered</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="happy" size={16} color={COLORS.primary} />
            <Text style={styles.featureText}>Fun &amp; casual</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="time" size={16} color={COLORS.primary} />
            <Text style={styles.featureText}>~3 mins</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Or Divider */}
      <View style={styles.dividerContainer}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Manual Option */}
      <TouchableOpacity style={styles.manualCard} onPress={onContinueManually} activeOpacity={0.8}>
        <View style={styles.manualIcon}>
          <Ionicons name="create-outline" size={24} color={COLORS.textSecondary} />
        </View>
        <View style={styles.manualInfo}>
          <Text style={styles.manualTitle}>Continue Filling Manually</Text>
          <Text style={styles.manualDescription}>
            Traditional step-by-step profile setup
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={COLORS.textMuted} />
      </TouchableOpacity>

      {/* Bottom hint */}
      <View style={styles.bottomHint}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
        <Text style={styles.hintText}>
          You can switch between methods anytime. Progress is saved automatically.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  header: {
    marginBottom: SPACING.xl,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  tinaCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  tinaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  tinaAvatarContainer: {
    position: 'relative',
  },
  tinaAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#FFF',
  },
  tinaOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  tinaInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  tinaNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tinaName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
  },
  tinaSparkle: {
    fontSize: 20,
    marginLeft: SPACING.xs,
  },
  tinaDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: SPACING.xs,
    lineHeight: 20,
  },
  tinaArrow: {
    marginLeft: SPACING.sm,
  },
  tinaFeatures: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  featureText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginHorizontal: SPACING.md,
    fontWeight: '600',
  },
  manualCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  manualIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  manualTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  manualDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  bottomHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.xs,
  },
  hintText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
