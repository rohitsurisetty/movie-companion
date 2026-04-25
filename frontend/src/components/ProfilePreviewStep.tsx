import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { ProfileData } from '../types';
import { getPartialLocation } from '../utils/location';

const AVATAR_COLORS: Record<string, string> = {
  av1: '#E50914', av2: '#FFD700', av3: '#4CAF50', av4: '#2196F3',
  av5: '#9C27B0', av6: '#FF9800', av7: '#00BCD4', av8: '#F44336',
};
const AVATAR_ICONS: Record<string, any> = {
  av1: 'person', av2: 'happy', av3: 'leaf', av4: 'planet',
  av5: 'star', av6: 'sunny', av7: 'water', av8: 'heart',
};

type Props = {
  data: ProfileData;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
};

type FieldDef = { key: string; label: string; type: 'text' | 'array' | 'movies'; mandatory?: boolean };

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', mandatory: true },
  { key: 'gender', label: 'Gender', type: 'text', mandatory: true },
  { key: 'age', label: 'Age', type: 'text', mandatory: true },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'relationshipIntent', label: 'Looking For', type: 'array' },
  { key: 'partnerPreference', label: 'Want to Meet', type: 'text' },
  { key: 'languagesSpoken', label: 'Languages', type: 'array' },
  { key: 'movieFrequency', label: 'Movie Frequency', type: 'text' },
  { key: 'ottTheatre', label: 'Preference', type: 'text' },
  { key: 'filmLanguages', label: 'Film Languages', type: 'array' },
  { key: 'genres', label: 'Genres', type: 'array' },
  { key: 'topMovies', label: 'Top Movies', type: 'movies' },
  { key: 'height', label: 'Height', type: 'text' },
  { key: 'religion', label: 'Religion', type: 'text' },
  { key: 'maritalStatus', label: 'Marital Status', type: 'text' },
  { key: 'foodPreference', label: 'Food', type: 'text' },
  { key: 'bio', label: 'Bio', type: 'text' },
  { key: 'smoking', label: 'Smoking', type: 'text' },
  { key: 'drinking', label: 'Drinking', type: 'text' },
  { key: 'exercise', label: 'Exercise', type: 'text' },
  { key: 'zodiac', label: 'Zodiac', type: 'text' },
  { key: 'pets', label: 'Pets', type: 'text' },
  { key: 'familyPlanning', label: 'Family Planning', type: 'text' },
  { key: 'siblings', label: 'Siblings', type: 'text' },
  { key: 'education', label: 'Education', type: 'text' },
  { key: 'workProfile', label: 'Work', type: 'text' },
  { key: 'travel', label: 'Travel', type: 'text' },
];

export default function ProfilePreviewStep({ data, onUpdate, onNext }: Props) {
  const toggleVisibility = (key: string) => {
    const updated = { ...data.visibilityToggles, [key]: !data.visibilityToggles[key] };
    onUpdate('visibilityToggles', updated);
  };

  const getValue = (field: FieldDef): string => {
    const val = (data as any)[field.key];
    if (field.type === 'array' && Array.isArray(val)) return val.join(', ');
    if (field.type === 'movies' && Array.isArray(val)) return val.map((m: any) => m.title).join(', ');
    if (val === 0 || val === '') return '';
    return String(val);
  };

  const filledFields = FIELDS.filter(f => {
    const v = getValue(f);
    return v && v !== '0';
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Header with Continue button */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Profile Preview</Text>
          <Text style={styles.subtitle}>Toggle visibility for each field</Text>
        </View>
        <TouchableOpacity style={styles.continueBtnTop} onPress={onNext} testID="preview-continue-top">
          <Text style={styles.continueBtnTopText}>Done</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Avatar & Name Header */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatarLarge, { backgroundColor: AVATAR_COLORS[data.avatarId] || COLORS.primary }]}>
          <Ionicons
            name={(AVATAR_ICONS[data.avatarId] || 'person') as any}
            size={40}
            color={COLORS.white}
          />
        </View>
        <Text style={styles.profileName}>{data.name || 'Your Name'}</Text>
        {data.age > 0 && <Text style={styles.profileAge}>{data.age} years old</Text>}
        {data.location ? <Text style={styles.profileLocation}>{getPartialLocation(data.location)}</Text> : null}
      </View>

      {/* Fields with toggles */}
      {filledFields.map(field => (
        <View key={field.key} style={styles.fieldRow}>
          <View style={styles.fieldInfo}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>{field.label}</Text>
              {field.mandatory && <Text style={styles.mandatoryBadge}>Always visible</Text>}
            </View>
            {field.type === 'array' || field.type === 'movies' ? (
              <View style={styles.chipsRow}>
                {(Array.isArray((data as any)[field.key]) ? (data as any)[field.key] : []).map((item: any, i: number) => (
                  <View key={i} style={styles.previewChip}>
                    <Text style={styles.previewChipText}>
                      {typeof item === 'string' ? item : item.title}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.fieldValue}>{getValue(field)}</Text>
            )}
          </View>
          {!field.mandatory && (
            <Switch
              value={data.visibilityToggles[field.key] !== false}
              onValueChange={() => toggleVisibility(field.key)}
              trackColor={{ false: COLORS.border, true: COLORS.primaryDark }}
              thumbColor={data.visibilityToggles[field.key] !== false ? COLORS.primary : COLORS.textMuted}
              testID={`toggle-${field.key}`}
            />
          )}
        </View>
      ))}

      <TouchableOpacity style={styles.continueBtn} onPress={onNext} testID="preview-continue-btn">
        <Text style={styles.continueBtnText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xxl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.m },
  headerLeft: { flex: 1 },
  title: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.s },
  subtitle: { fontSize: 15, color: COLORS.textSecondary },
  continueBtnTop: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: BORDER_RADIUS.full,
  },
  continueBtnTopText: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  profileHeader: { alignItems: 'center', marginBottom: SPACING.xl },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.m },
  profileName: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  profileAge: { fontSize: 16, color: COLORS.textSecondary, marginTop: SPACING.xs },
  profileLocation: { fontSize: 14, color: COLORS.textMuted, marginTop: SPACING.xs },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.m, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  fieldInfo: { flex: 1, marginRight: SPACING.m },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s, marginBottom: SPACING.xs },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  mandatoryBadge: { fontSize: 10, color: COLORS.gold, fontWeight: '500', backgroundColor: 'rgba(255,215,0,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  fieldValue: { fontSize: 15, color: COLORS.text },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  previewChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: BORDER_RADIUS.full,
    backgroundColor: 'rgba(229,9,20,0.12)', borderWidth: 1, borderColor: COLORS.primaryDark,
  },
  previewChipText: { fontSize: 12, color: COLORS.primary, fontWeight: '500' },
  continueBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: BORDER_RADIUS.full,
    alignItems: 'center', marginTop: SPACING.xl,
  },
  continueBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white, letterSpacing: 1 },
});
