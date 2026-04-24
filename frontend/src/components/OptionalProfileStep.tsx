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
const EDUCATION_OPTS = ['High School', 'Bachelor\'s', 'Master\'s', 'PhD', 'Other'];
const TRAVEL_OPTS = ['Frequently', 'Occasionally', 'Rarely', 'Never'];
const WORK_PROFILE_OPTS = ['IT/Software', 'Business Owner', 'Lawyer', 'Teacher', 'Others'];

// Height options
const FEET_OPTIONS = [4, 5, 6, 7];
const INCHES_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const CM_OPTIONS = Array.from({ length: 251 }, (_, i) => 50 + i); // 50 to 300 cm

type DropdownConfig = { field: string; label: string; options: string[] };

type Props = {
  data: ProfileData;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
};

export default function OptionalProfileStep({ data, onUpdate, onNext }: Props) {
  const [activeDropdown, setActiveDropdown] = useState<DropdownConfig | null>(null);
  const [heightUnit, setHeightUnit] = useState<'imperial' | 'metric'>('imperial');
  
  // Height state
  const [selectedFeet, setSelectedFeet] = useState(5);
  const [selectedInches, setSelectedInches] = useState(4);
  const [selectedCm, setSelectedCm] = useState(160);

  // Parse existing height if any
  React.useEffect(() => {
    if (data.height) {
      if (data.height.includes("'")) {
        const parts = data.height.match(/(\d+)'(\d+)/);
        if (parts) {
          setSelectedFeet(parseInt(parts[1]));
          setSelectedInches(parseInt(parts[2]));
          setHeightUnit('imperial');
        }
      } else if (data.height.includes('cm')) {
        const cm = parseInt(data.height);
        if (cm) {
          setSelectedCm(cm);
          setHeightUnit('metric');
        }
      }
    }
  }, []);

  const dropdowns: DropdownConfig[] = [
    { field: 'education', label: 'Education', options: EDUCATION_OPTS },
    { field: 'workProfile', label: 'Work Profile', options: WORK_PROFILE_OPTS },
    { field: 'travel', label: 'How Often Do You Travel?', options: TRAVEL_OPTS },
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

  const updateHeight = (feet: number, inches: number, cm: number, unit: 'imperial' | 'metric') => {
    if (unit === 'imperial') {
      onUpdate('height', `${feet}'${inches}"`);
    } else {
      onUpdate('height', `${cm} cm`);
    }
  };

  const handleFeetChange = (feet: number) => {
    setSelectedFeet(feet);
    updateHeight(feet, selectedInches, selectedCm, 'imperial');
  };

  const handleInchesChange = (inches: number) => {
    setSelectedInches(inches);
    updateHeight(selectedFeet, inches, selectedCm, 'imperial');
  };

  const handleCmChange = (cm: number) => {
    setSelectedCm(cm);
    updateHeight(selectedFeet, selectedInches, cm, 'metric');
  };

  const toggleHeightUnit = () => {
    const newUnit = heightUnit === 'imperial' ? 'metric' : 'imperial';
    setHeightUnit(newUnit);
    if (newUnit === 'metric') {
      const totalInches = selectedFeet * 12 + selectedInches;
      const cm = Math.round(totalInches * 2.54);
      setSelectedCm(cm);
      onUpdate('height', `${cm} cm`);
    } else {
      const totalInches = Math.round(selectedCm / 2.54);
      const feet = Math.floor(totalInches / 12);
      const inches = totalInches % 12;
      setSelectedFeet(feet);
      setSelectedInches(inches);
      onUpdate('height', `${feet}'${inches}"`);
    }
  };

  // Multi-select food preferences
  const foodPreferences = (data as any).foodPreferences || [];
  const toggleFoodPref = (pref: string) => {
    const current = foodPreferences as string[];
    const updated = current.includes(pref) 
      ? current.filter(p => p !== pref)
      : [...current, pref];
    onUpdate('foodPreferences', updated);
    onUpdate('foodPreference', updated.join(', '));
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Skip button at top */}
      <View style={styles.topBar}>
        <View style={styles.topBarSpacer} />
        <TouchableOpacity style={styles.skipBtnTop} onPress={onNext} testID="optional-skip-top-btn">
          <Text style={styles.skipBtnTopText}>Skip</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Almost there!</Text>
        <Text style={styles.subtitle}>Just a few more optional fields</Text>

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

        {/* Height with embedded scrollable picker */}
        <Text style={styles.label}>Height</Text>
        <View style={styles.heightUnitToggle}>
          <TouchableOpacity
            style={[styles.unitBtn, heightUnit === 'imperial' && styles.unitBtnActive]}
            onPress={() => heightUnit !== 'imperial' && toggleHeightUnit()}
          >
            <Text style={[styles.unitBtnText, heightUnit === 'imperial' && styles.unitBtnTextActive]}>ft / in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.unitBtn, heightUnit === 'metric' && styles.unitBtnActive]}
            onPress={() => heightUnit !== 'metric' && toggleHeightUnit()}
          >
            <Text style={[styles.unitBtnText, heightUnit === 'metric' && styles.unitBtnTextActive]}>cm</Text>
          </TouchableOpacity>
        </View>

        {/* Embedded height scrollers */}
        <View style={styles.heightContainer}>
          {heightUnit === 'imperial' ? (
            <View style={styles.heightScrollRow}>
              {/* Feet */}
              <View style={styles.heightColumn}>
                <Text style={styles.heightLabel}>Feet</Text>
                <ScrollView style={styles.heightScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {FEET_OPTIONS.map(f => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.heightItem, selectedFeet === f && styles.heightItemSelected]}
                      onPress={() => handleFeetChange(f)}
                    >
                      <Text style={[styles.heightItemText, selectedFeet === f && styles.heightItemTextSelected]}>
                        {f}'
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {/* Inches */}
              <View style={styles.heightColumn}>
                <Text style={styles.heightLabel}>Inches</Text>
                <ScrollView style={styles.heightScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {INCHES_OPTIONS.map(i => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.heightItem, selectedInches === i && styles.heightItemSelected]}
                      onPress={() => handleInchesChange(i)}
                    >
                      <Text style={[styles.heightItemText, selectedInches === i && styles.heightItemTextSelected]}>
                        {i}"
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          ) : (
            <View style={styles.heightScrollRow}>
              <View style={[styles.heightColumn, { flex: 1 }]}>
                <Text style={styles.heightLabel}>Centimeters</Text>
                <ScrollView style={styles.heightScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {CM_OPTIONS.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.heightItem, selectedCm === c && styles.heightItemSelected]}
                      onPress={() => handleCmChange(c)}
                    >
                      <Text style={[styles.heightItemText, selectedCm === c && styles.heightItemTextSelected]}>
                        {c} cm
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}
          <View style={styles.heightDisplay}>
            <Text style={styles.heightDisplayText}>
              {heightUnit === 'imperial' ? `${selectedFeet}'${selectedInches}"` : `${selectedCm} cm`}
            </Text>
          </View>
        </View>

        {/* Food Preference - Multi-select */}
        <Text style={styles.label}>Food Preference (Select all that apply)</Text>
        <View style={styles.chipsRow}>
          {FOOD_PREFS.map(f => {
            const isSelected = foodPreferences.includes(f) || data.foodPreference === f;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => toggleFoodPref(f)}
                testID={`food-${f.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{f}</Text>
              </TouchableOpacity>
            );
          })}
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
  topBar: { 
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    paddingHorizontal: SPACING.m, paddingTop: SPACING.s, paddingBottom: SPACING.xs,
  },
  topBarSpacer: { flex: 1 },
  skipBtnTop: { 
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: SPACING.xs, paddingHorizontal: SPACING.s,
  },
  skipBtnTopText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  scrollContent: { paddingBottom: SPACING.xxl, paddingHorizontal: SPACING.l },
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
  // Height embedded picker styles
  heightUnitToggle: { flexDirection: 'row', gap: SPACING.s, marginBottom: SPACING.m },
  unitBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgCard,
  },
  unitBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  unitBtnText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  unitBtnTextActive: { color: COLORS.white, fontWeight: '600' },
  heightContainer: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l, padding: SPACING.m,
    borderWidth: 1, borderColor: COLORS.border,
  },
  heightScrollRow: { flexDirection: 'row', gap: SPACING.m },
  heightColumn: { flex: 1 },
  heightLabel: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.xs },
  heightScroll: { height: 140 },
  heightItem: { paddingVertical: 10, alignItems: 'center', borderRadius: BORDER_RADIUS.s, marginVertical: 2 },
  heightItemSelected: { backgroundColor: COLORS.primary },
  heightItemText: { fontSize: 16, color: COLORS.textSecondary },
  heightItemTextSelected: { color: COLORS.white, fontWeight: '600' },
  heightDisplay: {
    marginTop: SPACING.m, paddingTop: SPACING.m, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: 'center',
  },
  heightDisplayText: { fontSize: 24, fontWeight: 'bold', color: COLORS.gold },
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
