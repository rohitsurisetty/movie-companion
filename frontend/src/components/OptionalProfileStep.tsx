import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Modal, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { ProfileData } from '../types';

const AVATAR_OPTIONS = [
  { id: 'av1', color: '#E50914', icon: 'person' as const },
  { id: 'av2', color: '#FFD700', icon: 'happy' as const },
  { id: 'av3', color: '#4CAF50', icon: 'leaf' as const },
  { id: 'av4', color: '#2196F3', icon: 'planet' as const },
  { id: 'av5', color: '#9C27B0', icon: 'star' as const },
  { id: 'av6', color: '#FF9800', icon: 'sunny' as const },
  { id: 'av7', color: '#00BCD4', icon: 'water' as const },
  { id: 'av8', color: '#F44336', icon: 'heart' as const },
];

const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other', 'Prefer not to say'];
const MARITAL_STATUSES = ['Single', 'Divorced', 'Widowed', 'Separated'];
const FOOD_PREFS = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain'];
const SMOKING_OPTS = ['Never', 'Socially', 'Regularly', 'Trying to quit'];
const DRINKING_OPTS = ['Never', 'Socially', 'Regularly', 'Sober'];
const EXERCISE_OPTS = ['Daily', 'Often', 'Sometimes', 'Never'];
const ZODIAC_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const PETS_OPTS = ['Dog lover', 'Cat lover', 'Both', 'No pets', 'Other'];
const FAMILY_OPTS = ['Want kids', 'Don\'t want kids', 'Open to kids', 'Have kids'];
const SIBLINGS_OPTS = ['Only child', 'Have siblings'];

type DropdownConfig = { field: string; label: string; options: string[] };

type Props = {
  data: ProfileData;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
};

export default function OptionalProfileStep({ data, onUpdate, onNext }: Props) {
  const [activeDropdown, setActiveDropdown] = useState<DropdownConfig | null>(null);

  const dropdowns: DropdownConfig[] = [
    { field: 'religion', label: 'Religion', options: RELIGIONS },
    { field: 'maritalStatus', label: 'Marital Status', options: MARITAL_STATUSES },
    { field: 'smoking', label: 'Smoking Habit', options: SMOKING_OPTS },
    { field: 'drinking', label: 'Drinking Habit', options: DRINKING_OPTS },
    { field: 'exercise', label: 'Exercise Habit', options: EXERCISE_OPTS },
    { field: 'zodiac', label: 'Zodiac Sign', options: ZODIAC_SIGNS },
    { field: 'pets', label: 'Pets Preference', options: PETS_OPTS },
    { field: 'familyPlanning', label: 'Family Planning', options: FAMILY_OPTS },
    { field: 'siblings', label: 'Siblings', options: SIBLINGS_OPTS },
  ];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Almost there!</Text>
        <Text style={styles.subtitle}>Just a few more optional fields before we go into action</Text>

        {/* Avatar Selection */}
        <Text style={styles.sectionTitle}>Choose an Avatar</Text>
        <View style={styles.avatarGrid}>
          {AVATAR_OPTIONS.map(av => (
            <TouchableOpacity
              key={av.id}
              style={[styles.avatarItem, data.avatarId === av.id && styles.avatarActive]}
              onPress={() => onUpdate('avatarId', av.id)}
              testID={`avatar-${av.id}`}
            >
              <View style={[styles.avatarCircle, { backgroundColor: av.color }]}>
                <Ionicons name={av.icon} size={28} color={COLORS.white} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Height */}
        <Text style={styles.label}>Height (cm)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 170"
          placeholderTextColor={COLORS.textMuted}
          value={data.height}
          onChangeText={(t) => onUpdate('height', t.replace(/[^0-9]/g, '').slice(0, 3))}
          keyboardType="number-pad"
          testID="optional-height-input"
        />

        {/* Food Preference */}
        <Text style={styles.label}>Food Preference</Text>
        <View style={styles.chipsRow}>
          {FOOD_PREFS.map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, data.foodPreference === f && styles.chipActive]}
              onPress={() => onUpdate('foodPreference', f)}
              testID={`food-${f.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Text style={[styles.chipText, data.foodPreference === f && styles.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Dropdowns */}
        {dropdowns.map(dd => (
          <View key={dd.field}>
            <Text style={styles.label}>{dd.label}</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => setActiveDropdown(dd)}
              testID={`dropdown-${dd.field}`}
            >
              <Text style={[styles.dropdownText, !(data as any)[dd.field] && styles.placeholderText]}>
                {(data as any)[dd.field] || `Select ${dd.label.toLowerCase()}`}
              </Text>
              <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Bio */}
        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          placeholder="Tell people about yourself (300 chars max)"
          placeholderTextColor={COLORS.textMuted}
          value={data.bio}
          onChangeText={(t) => onUpdate('bio', t.slice(0, 300))}
          multiline
          maxLength={300}
          testID="optional-bio-input"
        />
        <Text style={styles.charCount}>{data.bio.length}/300</Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.skipBtn} onPress={onNext} testID="optional-skip-btn">
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.continueBtn} onPress={onNext} testID="optional-continue-btn">
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Dropdown Modal */}
      <Modal visible={!!activeDropdown} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActiveDropdown(null)}>
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>{activeDropdown?.label}</Text>
            <ScrollView style={styles.pickerScroll}>
              {activeDropdown?.options.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.pickerItem, (data as any)[activeDropdown.field] === opt && styles.pickerItemActive]}
                  onPress={() => { onUpdate(activeDropdown.field, opt); setActiveDropdown(null); }}
                  testID={`picker-${opt.toLowerCase().replace(/[\s']+/g, '-')}`}
                >
                  <Text style={[styles.pickerItemText, (data as any)[activeDropdown.field] === opt && styles.pickerItemTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xxl },
  title: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.s },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, marginBottom: SPACING.l },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.m },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.s, marginTop: SPACING.m },
  input: {
    backgroundColor: COLORS.bgInput, borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m, paddingVertical: 14, color: COLORS.text, fontSize: 16,
  },
  bioInput: { minHeight: 100, textAlignVertical: 'top' },
  charCount: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: SPACING.xs },
  dropdown: {
    backgroundColor: COLORS.bgInput, borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dropdownText: { fontSize: 16, color: COLORS.text },
  placeholderText: { color: COLORS.textMuted },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.m, marginBottom: SPACING.m },
  avatarItem: { borderRadius: BORDER_RADIUS.full, borderWidth: 3, borderColor: 'transparent', padding: 3 },
  avatarActive: { borderColor: COLORS.gold },
  avatarCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgCard,
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: SPACING.m, marginTop: SPACING.xl },
  skipBtn: {
    flex: 1, borderWidth: 1.5, borderColor: COLORS.border, paddingVertical: 16,
    borderRadius: BORDER_RADIUS.full, alignItems: 'center',
  },
  skipBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  continueBtn: {
    flex: 2, backgroundColor: COLORS.primary, paddingVertical: 16,
    borderRadius: BORDER_RADIUS.full, alignItems: 'center',
  },
  continueBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white, letterSpacing: 1 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center',
    alignItems: 'center', padding: SPACING.l,
  },
  pickerContent: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l, padding: SPACING.l,
    width: '100%', maxWidth: 340, maxHeight: '70%',
  },
  pickerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.m, textAlign: 'center' },
  pickerScroll: { maxHeight: 400 },
  pickerItem: { paddingVertical: 14, paddingHorizontal: SPACING.m, borderRadius: BORDER_RADIUS.m, marginBottom: SPACING.xs },
  pickerItemActive: { backgroundColor: 'rgba(229,9,20,0.15)' },
  pickerItemText: { fontSize: 16, color: COLORS.textSecondary },
  pickerItemTextActive: { color: COLORS.primary, fontWeight: '600' },
});
