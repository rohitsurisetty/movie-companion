import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { ProfileData } from '../types';

type Props = {
  data: ProfileData;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
};

export default function ModeSelectionStep({ data, onUpdate, onNext }: Props) {
  const isValid = data.movieBuddyMode || data.movieDateMode;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Your Mode</Text>
      <Text style={styles.subtitle}>How do you want to use Film Companion?</Text>

      {/* Movie Buddy Mode */}
      <View style={[styles.modeCard, data.movieBuddyMode && styles.modeCardActive]}>
        <View style={styles.modeHeader}>
          <View style={[styles.modeIcon, { backgroundColor: '#2196F3' }]}>
            <Ionicons name="people-outline" size={28} color={COLORS.white} />
          </View>
          <View style={styles.modeInfo}>
            <Text style={styles.modeTitle}>Movie Buddy Mode</Text>
            <Text style={styles.modeDesc}>Find friends who love similar films</Text>
          </View>
          <Switch
            value={data.movieBuddyMode}
            onValueChange={(v) => onUpdate('movieBuddyMode', v)}
            trackColor={{ false: COLORS.border, true: '#1565C0' }}
            thumbColor={data.movieBuddyMode ? '#2196F3' : COLORS.textMuted}
            testID="mode-buddy-switch"
          />
        </View>
        <View style={styles.modeFeatures}>
          <View style={styles.featureRow}>
            <Ionicons name="chatbubble-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.featureText}>Discuss movies with like-minded people</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="ticket-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.featureText}>Find companions to watch movies with</Text>
          </View>
        </View>
      </View>

      {/* Movie Date Mode */}
      <View style={[styles.modeCard, data.movieDateMode && styles.modeCardActiveRed]}>
        <View style={styles.modeHeader}>
          <View style={[styles.modeIcon, { backgroundColor: COLORS.primary }]}>
            <Ionicons name="heart-outline" size={28} color={COLORS.white} />
          </View>
          <View style={styles.modeInfo}>
            <Text style={styles.modeTitle}>Movie Date Mode</Text>
            <Text style={styles.modeDesc}>Find romantic connections through movies</Text>
          </View>
          <Switch
            value={data.movieDateMode}
            onValueChange={(v) => onUpdate('movieDateMode', v)}
            trackColor={{ false: COLORS.border, true: COLORS.primaryDark }}
            thumbColor={data.movieDateMode ? COLORS.primary : COLORS.textMuted}
            testID="mode-date-switch"
          />
        </View>
        <View style={styles.modeFeatures}>
          <View style={styles.featureRow}>
            <Ionicons name="sparkles-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.featureText}>Match based on movie taste compatibility</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="film-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.featureText}>Plan movie dates with your matches</Text>
          </View>
        </View>
      </View>

      {data.movieBuddyMode && data.movieDateMode && (
        <View style={styles.bothModeBadge}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.gold} />
          <Text style={styles.bothModeText}>
            You can toggle between modes from the top left anytime you feel like
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.continueBtn, !isValid && styles.continueBtnDisabled]}
        onPress={onNext}
        disabled={!isValid}
        testID="mode-continue-btn"
      >
        <Text style={styles.continueBtnText}>
          {data.movieBuddyMode && data.movieDateMode ? 'Enter as Movie Buddy' : 'Continue'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.s },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, marginBottom: SPACING.xl },
  modeCard: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l, marginBottom: SPACING.m, borderWidth: 2, borderColor: COLORS.border,
  },
  modeCardActive: { borderColor: '#2196F3', backgroundColor: 'rgba(33,150,243,0.06)' },
  modeCardActiveRed: { borderColor: COLORS.primary, backgroundColor: 'rgba(229,9,20,0.06)' },
  modeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.m },
  modeIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  modeInfo: { flex: 1, marginHorizontal: SPACING.m },
  modeTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.text },
  modeDesc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  modeFeatures: { gap: SPACING.s, paddingLeft: SPACING.xs },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  featureText: { fontSize: 13, color: COLORS.textSecondary },
  bothModeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.s,
    backgroundColor: 'rgba(255,215,0,0.08)', padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m, marginBottom: SPACING.m,
  },
  bothModeText: { fontSize: 13, color: COLORS.gold, flex: 1 },
  continueBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: BORDER_RADIUS.full,
    alignItems: 'center', marginTop: SPACING.l,
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white, letterSpacing: 1 },
});
