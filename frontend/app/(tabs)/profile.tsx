import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  Modal, Image, Switch, ActivityIndicator, Alert, Platform,
  ScrollView as RNScrollView, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../../src/theme';
import { ProfileData, initialProfileData, MovieSelection } from '../../src/types';
import { getProfile, saveProfile, clearAll } from '../../src/store';
import { getPartialLocation, getSimplifiedLocation } from '../../src/utils/location';
import { formatLocationForPrivacy } from '../../src/utils/locationFormatter';
import { SharedHeader, ModeSwitcher, useAppMode } from '../../src/components/SharedHeader';
import { PremiumProfileView } from '../../src/components/PremiumProfileView';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Avatar options
const AVATAR_OPTIONS = [
  { id: 'av1', color: '#E50914', icon: 'person' as const },
  { id: 'av2', color: '#FFD700', icon: 'happy' as const },
  { id: 'av3', color: '#4CAF50', icon: 'leaf' as const },
  { id: 'av4', color: '#2196F3', icon: 'planet' as const },
  { id: 'av5', color: '#9C27B0', icon: 'star' as const },
  { id: 'av6', color: '#FF9800', icon: 'sunny' as const },
];

// Options for various fields
const GENDERS = ['Man', 'Woman', 'Non-binary', 'Prefer not to say', 'Other'];
const RELATIONSHIP_INTENTS = ['Casual', 'Friendship', 'Serious relationship', 'Exploring'];
const PARTNER_PREFS = ['Men', 'Women', 'Anyone'];
const LANGUAGES = ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu'];
const MOVIE_FREQUENCIES = ['More than twice a week', 'Twice a week', 'Once a week', 'Twice a month', 'Once a month', 'Rarely'];
const FILM_LANGUAGES = ['Hindi', 'English', 'Telugu', 'Tamil', 'Malayalam', 'Kannada', 'Korean', 'Others'];
const GENRES = ['Action', 'Romance', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi', 'Drama', 'Documentary'];
const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Atheist', 'Other', 'Prefer not to say'];
const MARITAL_STATUSES = ['Single', 'Divorced', 'Widowed', 'Separated'];
const OTT_OPTIONS = ['OTT Person', 'Theatre Person', 'Both OTT & Theatre', 'Neither'];
const FOOD_PREFS = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain'];
const SMOKING_OPTS = ['Never', 'Socially', 'Regularly', 'Trying to quit'];
const DRINKING_OPTS = ['Never', 'Socially', 'Regularly', 'Sober'];
const EXERCISE_OPTS = ['Daily', 'Often', 'Sometimes', 'Never'];
const ZODIAC_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const PETS_OPTS = ['Dog lover', 'Cat lover', 'Both', 'No pets', 'Other'];
const FAMILY_OPTS = ['Want kids', "Don't want kids", 'Open to kids', 'Have kids'];
const SIBLINGS_OPTS = ['Only child', 'Have siblings'];
const EDUCATION_OPTS = ['High School', "Bachelor's", "Master's", 'PhD', 'Other'];
const TRAVEL_OPTS = ['Frequently', 'Occasionally', 'Rarely', 'Never'];
const WORK_OPTS = ['IT/Software', 'Business Owner', 'Lawyer', 'Teacher', 'Others'];

type EditModalType = 
  | 'avatar' | 'name' | 'gender' | 'location' | 'bio'
  | 'relationshipIntent' | 'partnerPreference' | 'languagesSpoken'
  | 'movieFrequency' | 'ottTheatre' | 'filmLanguages' | 'genres'
  | 'height' | 'religion' | 'maritalStatus' | 'foodPreference'
  | 'smoking' | 'drinking' | 'exercise' | 'zodiac' | 'pets'
  | 'familyPlanning' | 'siblings' | 'education' | 'travel' | 'workProfile'
  | 'topMovies' | null;

// Single Select Modal
function SingleSelectModal({
  visible, onClose, title, options, selected, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: string[];
  selected: string;
  onSelect: (val: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={modalStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={modalStyles.container}>
          <Text style={modalStyles.title}>{title}</Text>
          <RNScrollView style={modalStyles.scroll} showsVerticalScrollIndicator={false}>
            {options.map(opt => (
              <TouchableOpacity
                key={opt}
                style={[modalStyles.option, selected === opt && modalStyles.optionActive]}
                onPress={() => { onSelect(opt); onClose(); }}
              >
                <Text style={[modalStyles.optionText, selected === opt && modalStyles.optionTextActive]}>
                  {opt}
                </Text>
                {selected === opt && <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </RNScrollView>
          <TouchableOpacity style={modalStyles.singleCancelBtn} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// Multi Select Modal
function MultiSelectModal({
  visible, onClose, title, options, selected, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: string[];
  selected: string[];
  onSelect: (val: string[]) => void;
}) {
  const [tempSelected, setTempSelected] = useState<string[]>(selected);

  useEffect(() => {
    setTempSelected(selected);
  }, [selected, visible]);

  const toggle = (opt: string) => {
    setTempSelected(prev => 
      prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
    );
  };

  const handleSave = () => {
    onSelect(tempSelected);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={modalStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={modalStyles.container}>
          <Text style={modalStyles.title}>{title}</Text>
          <Text style={modalStyles.subtitle}>Select all that apply</Text>
          <RNScrollView style={modalStyles.scroll} showsVerticalScrollIndicator={false}>
            <View style={modalStyles.chipsContainer}>
              {options.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[modalStyles.chip, tempSelected.includes(opt) && modalStyles.chipActive]}
                  onPress={() => toggle(opt)}
                >
                  <Text style={[modalStyles.chipText, tempSelected.includes(opt) && modalStyles.chipTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </RNScrollView>
          <View style={modalStyles.buttonRow}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.saveBtn} onPress={handleSave}>
              <Text style={modalStyles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// Text Input Modal
function TextInputModal({
  visible, onClose, title, value, onSave, placeholder, multiline = false, maxLength = 100,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onSave: (val: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value, visible]);

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={modalStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={modalStyles.container}>
          <Text style={modalStyles.title}>{title}</Text>
          <TextInput
            style={[modalStyles.textInput, multiline && modalStyles.textInputMultiline]}
            value={text}
            onChangeText={(t) => setText(t.slice(0, maxLength))}
            placeholder={placeholder}
            placeholderTextColor={COLORS.textMuted}
            multiline={multiline}
            maxLength={maxLength}
          />
          <Text style={modalStyles.charCount}>{text.length}/{maxLength}</Text>
          <View style={modalStyles.buttonRow}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.saveBtn} onPress={handleSave}>
              <Text style={modalStyles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// Avatar Select Modal
function AvatarSelectModal({
  visible, onClose, selected, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={modalStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={modalStyles.container}>
          <Text style={modalStyles.title}>Choose Avatar</Text>
          <View style={modalStyles.avatarGrid}>
            {AVATAR_OPTIONS.map(av => (
              <TouchableOpacity
                key={av.id}
                style={[modalStyles.avatarItem, selected === av.id && modalStyles.avatarItemActive]}
                onPress={() => { onSelect(av.id); onClose(); }}
              >
                <View style={[modalStyles.avatarCircle, { backgroundColor: av.color }]}>
                  <Ionicons name={av.icon} size={32} color={COLORS.white} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// Height Edit Modal
function HeightEditModal({
  visible, onClose, value, onSave,
}: {
  visible: boolean;
  onClose: () => void;
  value: string;
  onSave: (val: string) => void;
}) {
  const [unit, setUnit] = useState<'imperial' | 'metric'>('imperial');
  const [feet, setFeet] = useState(5);
  const [inches, setInches] = useState(6);
  const [cm, setCm] = useState(168);

  useEffect(() => {
    if (value) {
      if (value.includes("'")) {
        const parts = value.match(/(\d+)'(\d+)/);
        if (parts) {
          setFeet(parseInt(parts[1]));
          setInches(parseInt(parts[2]));
          setUnit('imperial');
        }
      } else if (value.includes('cm')) {
        const cmVal = parseInt(value);
        if (cmVal) {
          setCm(cmVal);
          setUnit('metric');
        }
      }
    }
  }, [value, visible]);

  const handleSave = () => {
    const height = unit === 'imperial' ? `${feet}'${inches}"` : `${cm} cm`;
    onSave(height);
    onClose();
  };

  const feetOptions = [4, 5, 6, 7];
  const inchOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const cmOptions = Array.from({ length: 101 }, (_, i) => 120 + i);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={modalStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={modalStyles.container}>
          <Text style={modalStyles.title}>Edit Height</Text>
          
          <View style={modalStyles.unitToggle}>
            <TouchableOpacity
              style={[modalStyles.unitBtn, unit === 'imperial' && modalStyles.unitBtnActive]}
              onPress={() => setUnit('imperial')}
            >
              <Text style={[modalStyles.unitText, unit === 'imperial' && modalStyles.unitTextActive]}>ft/in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.unitBtn, unit === 'metric' && modalStyles.unitBtnActive]}
              onPress={() => setUnit('metric')}
            >
              <Text style={[modalStyles.unitText, unit === 'metric' && modalStyles.unitTextActive]}>cm</Text>
            </TouchableOpacity>
          </View>

          {unit === 'imperial' ? (
            <View style={modalStyles.heightPickerRow}>
              <View style={modalStyles.heightColumn}>
                <Text style={modalStyles.heightLabel}>Feet</Text>
                <RNScrollView style={modalStyles.heightScroll} showsVerticalScrollIndicator={false}>
                  {feetOptions.map(f => (
                    <TouchableOpacity
                      key={f}
                      style={[modalStyles.heightItem, feet === f && modalStyles.heightItemActive]}
                      onPress={() => setFeet(f)}
                    >
                      <Text style={[modalStyles.heightItemText, feet === f && modalStyles.heightItemTextActive]}>{f}&apos;</Text>
                    </TouchableOpacity>
                  ))}
                </RNScrollView>
              </View>
              <View style={modalStyles.heightColumn}>
                <Text style={modalStyles.heightLabel}>Inches</Text>
                <RNScrollView style={modalStyles.heightScroll} showsVerticalScrollIndicator={false}>
                  {inchOptions.map(i => (
                    <TouchableOpacity
                      key={i}
                      style={[modalStyles.heightItem, inches === i && modalStyles.heightItemActive]}
                      onPress={() => setInches(i)}
                    >
                      <Text style={[modalStyles.heightItemText, inches === i && modalStyles.heightItemTextActive]}>{i}&quot;</Text>
                    </TouchableOpacity>
                  ))}
                </RNScrollView>
              </View>
            </View>
          ) : (
            <RNScrollView style={modalStyles.cmScroll} showsVerticalScrollIndicator={false}>
              {cmOptions.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[modalStyles.heightItem, cm === c && modalStyles.heightItemActive]}
                  onPress={() => setCm(c)}
                >
                  <Text style={[modalStyles.heightItemText, cm === c && modalStyles.heightItemTextActive]}>{c} cm</Text>
                </TouchableOpacity>
              ))}
            </RNScrollView>
          )}

          <View style={modalStyles.heightDisplay}>
            <Text style={modalStyles.heightDisplayText}>
              {unit === 'imperial' ? `${feet}'${inches}"` : `${cm} cm`}
            </Text>
          </View>

          <View style={modalStyles.buttonRow}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.saveBtn} onPress={handleSave}>
              <Text style={modalStyles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: SPACING.l },
  container: { backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.xl, padding: SPACING.l, width: '100%', maxWidth: 360, maxHeight: '80%' },
  title: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.s, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.m, textAlign: 'center' },
  scroll: { maxHeight: 350 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: SPACING.m, borderRadius: BORDER_RADIUS.m, marginBottom: SPACING.xs },
  optionActive: { backgroundColor: 'rgba(229,9,20,0.1)' },
  optionText: { fontSize: 16, color: COLORS.textSecondary },
  optionTextActive: { color: COLORS.primary, fontWeight: '600' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: BORDER_RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgCard },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white, fontWeight: '600' },
  textInput: { backgroundColor: COLORS.bgInput, borderRadius: BORDER_RADIUS.m, paddingHorizontal: SPACING.m, paddingVertical: 14, color: COLORS.text, fontSize: 16, marginBottom: SPACING.xs },
  textInputMultiline: { minHeight: 100, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginBottom: SPACING.m },
  buttonRow: { flexDirection: 'row', gap: SPACING.m, marginTop: SPACING.m },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: BORDER_RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' },
  singleCancelBtn: { paddingVertical: 14, borderRadius: BORDER_RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', marginTop: SPACING.m },
  cancelText: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.primary, alignItems: 'center' },
  saveText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.m, justifyContent: 'center', marginBottom: SPACING.l },
  avatarItem: { borderRadius: BORDER_RADIUS.full, borderWidth: 3, borderColor: 'transparent', padding: 3 },
  avatarItemActive: { borderColor: COLORS.gold },
  avatarCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  unitToggle: { flexDirection: 'row', gap: SPACING.s, marginBottom: SPACING.m, justifyContent: 'center' },
  unitBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: BORDER_RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border },
  unitBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  unitText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  unitTextActive: { color: COLORS.white },
  heightPickerRow: { flexDirection: 'row', gap: SPACING.m },
  heightColumn: { flex: 1 },
  heightLabel: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.xs },
  heightScroll: { height: 150, backgroundColor: COLORS.bgInput, borderRadius: BORDER_RADIUS.m },
  cmScroll: { height: 200, backgroundColor: COLORS.bgInput, borderRadius: BORDER_RADIUS.m },
  heightItem: { paddingVertical: 12, alignItems: 'center', borderRadius: BORDER_RADIUS.s, marginVertical: 2, marginHorizontal: 4 },
  heightItemActive: { backgroundColor: COLORS.primary },
  heightItemText: { fontSize: 16, color: COLORS.textSecondary },
  heightItemTextActive: { color: COLORS.white, fontWeight: '600' },
  heightDisplay: { alignItems: 'center', paddingVertical: SPACING.m, marginTop: SPACING.m, borderTopWidth: 1, borderTopColor: COLORS.border },
  heightDisplayText: { fontSize: 24, fontWeight: 'bold', color: COLORS.gold },
});

// ============ ACCORDION SECTION COMPONENT ============
function AccordionSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const rotateAnim = React.useRef(new Animated.Value(expanded ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotateAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={accordionStyles.container}>
      <TouchableOpacity style={accordionStyles.header} onPress={onToggle} activeOpacity={0.7}>
        <View style={accordionStyles.headerLeft}>
          <View style={accordionStyles.iconContainer}>
            <Ionicons name={icon as any} size={20} color={COLORS.primary} />
          </View>
          <Text style={accordionStyles.title}>{title}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
          <Ionicons name="chevron-down" size={22} color={COLORS.textMuted} />
        </Animated.View>
      </TouchableOpacity>
      {expanded && (
        <View style={accordionStyles.content}>
          {children}
        </View>
      )}
    </View>
  );
}

const accordionStyles = StyleSheet.create({
  container: {
    marginBottom: SPACING.s,
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.m,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  content: {
    paddingHorizontal: SPACING.m,
    paddingBottom: SPACING.m,
  },
});

// Profile Field Row Component
function ProfileField({
  icon, label, value, onPress, isArray = false, isEmpty = false, disabled = false,
}: {
  icon: string;
  label: string;
  value: string | string[];
  onPress?: () => void;
  isArray?: boolean;
  isEmpty?: boolean;
  disabled?: boolean;
}) {
  const displayValue = isArray && Array.isArray(value) ? value.join(', ') : value;
  
  // If disabled, render as non-interactive View
  if (disabled) {
    return (
      <View style={[fieldStyles.container, { opacity: 0.7 }]}>
        <View style={fieldStyles.iconContainer}>
          <Ionicons name={icon as any} size={20} color={COLORS.textMuted} />
        </View>
        <View style={fieldStyles.content}>
          <Text style={fieldStyles.label}>{label}</Text>
          {isEmpty || !displayValue ? (
            <Text style={fieldStyles.placeholder}>Not set</Text>
          ) : (
            <Text style={fieldStyles.value}>{displayValue}</Text>
          )}
        </View>
        <Ionicons name="lock-closed" size={16} color={COLORS.textMuted} />
      </View>
    );
  }
  
  return (
    <TouchableOpacity style={fieldStyles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={fieldStyles.iconContainer}>
        <Ionicons name={icon as any} size={20} color={COLORS.textMuted} />
      </View>
      <View style={fieldStyles.content}>
        <Text style={fieldStyles.label}>{label}</Text>
        {isEmpty || !displayValue ? (
          <Text style={fieldStyles.placeholder}>Tap to add</Text>
        ) : isArray && Array.isArray(value) ? (
          <View style={fieldStyles.tagsRow}>
            {value.slice(0, 4).map((v, i) => (
              <View key={i} style={fieldStyles.tag}>
                <Text style={fieldStyles.tagText}>{v}</Text>
              </View>
            ))}
            {value.length > 4 && (
              <Text style={fieldStyles.moreText}>+{value.length - 4} more</Text>
            )}
          </View>
        ) : (
          <Text style={fieldStyles.value}>{displayValue}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const fieldStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.m, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconContainer: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bgInput, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.m },
  content: { flex: 1 },
  label: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  value: { fontSize: 15, color: COLORS.text },
  placeholder: { fontSize: 15, color: COLORS.textMuted, fontStyle: 'italic' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, alignItems: 'center' },
  tag: { backgroundColor: 'rgba(229,9,20,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: BORDER_RADIUS.s },
  tagText: { fontSize: 12, color: COLORS.primary },
  moreText: { fontSize: 12, color: COLORS.textMuted },
});

// ============ EDIT PROFILE MODAL CONTENT ============
// Single modal approach - edit forms shown inline to avoid nested modal z-index issues
function EditProfileModalContent({
  visible,
  onClose,
  profile,
  topMovies,
  expandedSections,
  toggleSection,
  editModal,
  setEditModal,
  updateField,
}: {
  visible: boolean;
  onClose: () => void;
  profile: ProfileData;
  topMovies: MovieSelection[];
  expandedSections: Set<string>;
  toggleSection: (section: string) => void;
  editModal: EditModalType;
  setEditModal: (type: EditModalType) => void;
  updateField: (field: string, value: any) => void;
}) {
  const insets = useSafeAreaInsets();
  
  if (!visible) return null;

  // Get title for edit mode
  const getEditTitle = () => {
    switch (editModal) {
      case 'location': return 'Edit Location';
      case 'bio': return 'Edit Bio';
      case 'movieFrequency': return 'Movie Frequency';
      case 'ottTheatre': return 'OTT vs Theatre';
      case 'genres': return 'Favourite Genres';
      case 'filmLanguages': return 'Film Languages';
      case 'languagesSpoken': return 'Languages Spoken';
      case 'relationshipIntent': return 'Looking For';
      case 'partnerPreference': return 'Want to Meet';
      case 'height': return 'Edit Height';
      case 'religion': return 'Religion';
      case 'smoking': return 'Smoking';
      case 'drinking': return 'Drinking';
      case 'exercise': return 'Exercise';
      case 'zodiac': return 'Zodiac Sign';
      default: return 'Edit Profile';
    }
  };

  // Handle back button - go back to list or close modal
  const handleBack = () => {
    if (editModal) {
      setEditModal(null);
    } else {
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleBack}>
      <View style={[editModalStyles.container, { paddingTop: insets.top }]}>
        {/* Header with back arrow */}
        <View style={editModalStyles.header}>
          <TouchableOpacity onPress={handleBack} style={editModalStyles.closeBtn}>
            <Ionicons name="arrow-back" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={editModalStyles.title}>{editModal ? getEditTitle() : 'Edit Profile'}</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Show edit form OR accordion list based on editModal state */}
        {editModal ? (
          <InlineEditForm
            editModal={editModal}
            profile={profile}
            onSave={(field, value) => {
              updateField(field, value);
              setEditModal(null);
            }}
            onCancel={() => setEditModal(null)}
          />
        ) : (
          <RNScrollView style={editModalStyles.scroll} showsVerticalScrollIndicator={false}>
            {/* Basic Information */}
            <AccordionSection 
              title="Basic Information"
              icon="person-outline"
              expanded={expandedSections.has('basic')}
              onToggle={() => toggleSection('basic')}
            >
              <ProfileField icon="person-outline" label="Name" value={profile.name} disabled isEmpty={!profile.name} />
              <ProfileField icon="male-female-outline" label="Gender" value={profile.gender} disabled isEmpty={!profile.gender} />
              <ProfileField icon="location-outline" label="Location" value={getPartialLocation(profile.location)} onPress={() => setEditModal('location')} isEmpty={!profile.location} />
            </AccordionSection>

            {/* Bio */}
            <AccordionSection 
              title="Bio"
              icon="document-text-outline"
              expanded={expandedSections.has('bio')}
              onToggle={() => toggleSection('bio')}
            >
              <ProfileField icon="document-text-outline" label="About Me" value={profile.bio} onPress={() => setEditModal('bio')} isEmpty={!profile.bio} />
            </AccordionSection>

            {/* Movie Personality */}
            <AccordionSection 
              title="Movie Personality"
              icon="film-outline"
              expanded={expandedSections.has('movie')}
              onToggle={() => toggleSection('movie')}
            >
              <ProfileField icon="time-outline" label="Movie Frequency" value={profile.movieFrequency} onPress={() => setEditModal('movieFrequency')} isEmpty={!profile.movieFrequency} />
              <ProfileField icon="tv-outline" label="OTT vs Theatre" value={profile.ottTheatre} onPress={() => setEditModal('ottTheatre')} isEmpty={!profile.ottTheatre} />
            </AccordionSection>

            {/* Favorite Genres */}
            <AccordionSection 
              title="Favorite Genres"
              icon="heart-outline"
              expanded={expandedSections.has('genres')}
              onToggle={() => toggleSection('genres')}
            >
              <ProfileField icon="film-outline" label="Favourite Genres" value={profile.genres} onPress={() => setEditModal('genres')} isArray isEmpty={!profile.genres?.length} />
            </AccordionSection>

            {/* Top Movies */}
            <AccordionSection 
              title="Top Movies"
              icon="star-outline"
              expanded={expandedSections.has('topmovies')}
              onToggle={() => toggleSection('topmovies')}
            >
              {topMovies.length > 0 ? (
                <View style={editModalStyles.moviesGrid}>
                  {topMovies.map((movie, i) => (
                    <View key={i} style={editModalStyles.movieItem}>
                      <Image 
                        source={{ uri: `https://image.tmdb.org/t/p/w200${movie.poster_path}` }}
                        style={editModalStyles.moviePoster}
                        resizeMode="cover"
                      />
                      <Text style={editModalStyles.movieTitle} numberOfLines={2}>{movie.title}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={editModalStyles.emptyHint}>Add your top 5 movies during signup</Text>
              )}
            </AccordionSection>

            {/* Languages */}
            <AccordionSection 
              title="Languages"
              icon="globe-outline"
              expanded={expandedSections.has('languages')}
              onToggle={() => toggleSection('languages')}
            >
              <ProfileField icon="globe-outline" label="Film Languages" value={profile.filmLanguages} onPress={() => setEditModal('filmLanguages')} isArray isEmpty={!profile.filmLanguages?.length} />
              <ProfileField icon="chatbubble-outline" label="Languages Spoken" value={profile.languagesSpoken} onPress={() => setEditModal('languagesSpoken')} isArray isEmpty={!profile.languagesSpoken?.length} />
            </AccordionSection>

            {/* Dating Preferences */}
            <AccordionSection 
              title="Dating Preferences"
              icon="heart-outline"
              expanded={expandedSections.has('dating')}
              onToggle={() => toggleSection('dating')}
            >
              <ProfileField icon="heart-outline" label="Looking For" value={profile.relationshipIntent} onPress={() => setEditModal('relationshipIntent')} isArray isEmpty={!profile.relationshipIntent?.length} />
              <ProfileField icon="people-outline" label="Want to Meet" value={profile.partnerPreference} onPress={() => setEditModal('partnerPreference')} isEmpty={!profile.partnerPreference} />
            </AccordionSection>

            {/* Optional Information */}
            <AccordionSection 
              title="Optional Information"
              icon="information-circle-outline"
              expanded={expandedSections.has('optional')}
              onToggle={() => toggleSection('optional')}
            >
              <ProfileField icon="resize-outline" label="Height" value={profile.height} onPress={() => setEditModal('height')} isEmpty={!profile.height} />
              <ProfileField icon="moon-outline" label="Religion" value={profile.religion} onPress={() => setEditModal('religion')} isEmpty={!profile.religion} />
              <ProfileField icon="flame-outline" label="Smoking" value={profile.smoking} onPress={() => setEditModal('smoking')} isEmpty={!profile.smoking} />
              <ProfileField icon="beer-outline" label="Drinking" value={profile.drinking} onPress={() => setEditModal('drinking')} isEmpty={!profile.drinking} />
              <ProfileField icon="fitness-outline" label="Exercise" value={profile.exercise} onPress={() => setEditModal('exercise')} isEmpty={!profile.exercise} />
              <ProfileField icon="star-outline" label="Zodiac Sign" value={profile.zodiac} onPress={() => setEditModal('zodiac')} isEmpty={!profile.zodiac} />
            </AccordionSection>

            <View style={{ height: 40 }} />
          </RNScrollView>
        )}
      </View>
    </Modal>
  );
}

// ============ INLINE EDIT FORM ============
// Renders the appropriate edit form inside the same modal
function InlineEditForm({
  editModal,
  profile,
  onSave,
  onCancel,
}: {
  editModal: EditModalType;
  profile: ProfileData;
  onSave: (field: string, value: any) => void;
  onCancel: () => void;
}) {
  const [textValue, setTextValue] = useState('');
  const [selectedValue, setSelectedValue] = useState('');
  const [selectedArray, setSelectedArray] = useState<string[]>([]);
  const [heightUnit, setHeightUnit] = useState<'imperial' | 'metric'>('imperial');
  const [feet, setFeet] = useState(5);
  const [inches, setInches] = useState(6);
  const [cm, setCm] = useState(168);

  // Initialize values when editModal changes
  useEffect(() => {
    switch (editModal) {
      case 'location':
        setTextValue(profile.location || '');
        break;
      case 'bio':
        setTextValue(profile.bio || '');
        break;
      case 'movieFrequency':
        setSelectedValue(profile.movieFrequency || '');
        break;
      case 'ottTheatre':
        setSelectedValue(profile.ottTheatre || '');
        break;
      case 'partnerPreference':
        setSelectedValue(profile.partnerPreference || '');
        break;
      case 'religion':
        setSelectedValue(profile.religion || '');
        break;
      case 'smoking':
        setSelectedValue(profile.smoking || '');
        break;
      case 'drinking':
        setSelectedValue(profile.drinking || '');
        break;
      case 'exercise':
        setSelectedValue(profile.exercise || '');
        break;
      case 'zodiac':
        setSelectedValue(profile.zodiac || '');
        break;
      case 'genres':
        setSelectedArray(profile.genres || []);
        break;
      case 'filmLanguages':
        setSelectedArray(profile.filmLanguages || []);
        break;
      case 'languagesSpoken':
        setSelectedArray(profile.languagesSpoken || []);
        break;
      case 'relationshipIntent':
        setSelectedArray(profile.relationshipIntent || []);
        break;
      case 'height':
        if (profile.height) {
          if (profile.height.includes("'")) {
            const parts = profile.height.match(/(\d+)'(\d+)/);
            if (parts) {
              setFeet(parseInt(parts[1]));
              setInches(parseInt(parts[2]));
              setHeightUnit('imperial');
            }
          } else if (profile.height.includes('cm')) {
            const cmVal = parseInt(profile.height);
            if (cmVal) {
              setCm(cmVal);
              setHeightUnit('metric');
            }
          }
        }
        break;
    }
  }, [editModal, profile]);

  const handleSave = () => {
    switch (editModal) {
      case 'location':
        onSave('location', textValue);
        break;
      case 'bio':
        onSave('bio', textValue);
        break;
      case 'movieFrequency':
        onSave('movieFrequency', selectedValue);
        break;
      case 'ottTheatre':
        onSave('ottTheatre', selectedValue);
        break;
      case 'partnerPreference':
        onSave('partnerPreference', selectedValue);
        break;
      case 'religion':
        onSave('religion', selectedValue);
        break;
      case 'smoking':
        onSave('smoking', selectedValue);
        break;
      case 'drinking':
        onSave('drinking', selectedValue);
        break;
      case 'exercise':
        onSave('exercise', selectedValue);
        break;
      case 'zodiac':
        onSave('zodiac', selectedValue);
        break;
      case 'genres':
        onSave('genres', selectedArray);
        break;
      case 'filmLanguages':
        onSave('filmLanguages', selectedArray);
        break;
      case 'languagesSpoken':
        onSave('languagesSpoken', selectedArray);
        break;
      case 'relationshipIntent':
        onSave('relationshipIntent', selectedArray);
        break;
      case 'height':
        const height = heightUnit === 'imperial' ? `${feet}'${inches}"` : `${cm} cm`;
        onSave('height', height);
        break;
    }
  };

  const toggleArrayItem = (item: string) => {
    setSelectedArray(prev => 
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  // Text input fields
  if (editModal === 'location' || editModal === 'bio') {
    const isMultiline = editModal === 'bio';
    const maxLength = editModal === 'bio' ? 300 : 100;
    const placeholder = editModal === 'bio' ? 'Tell people about yourself...' : 'Your city';
    
    return (
      <View style={inlineEditStyles.container}>
        <TextInput
          style={[inlineEditStyles.textInput, isMultiline && inlineEditStyles.textInputMultiline]}
          value={textValue}
          onChangeText={(t) => setTextValue(t.slice(0, maxLength))}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          multiline={isMultiline}
          maxLength={maxLength}
          autoFocus
        />
        <Text style={inlineEditStyles.charCount}>{textValue.length}/{maxLength}</Text>
        <View style={inlineEditStyles.buttonRow}>
          <TouchableOpacity style={inlineEditStyles.cancelBtn} onPress={onCancel}>
            <Text style={inlineEditStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={inlineEditStyles.saveBtn} onPress={handleSave}>
            <Text style={inlineEditStyles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Single select fields
  if (['movieFrequency', 'ottTheatre', 'partnerPreference', 'religion', 'smoking', 'drinking', 'exercise', 'zodiac'].includes(editModal || '')) {
    const optionsMap: Record<string, string[]> = {
      movieFrequency: MOVIE_FREQUENCIES,
      ottTheatre: OTT_OPTIONS,
      partnerPreference: PARTNER_PREFS,
      religion: RELIGIONS,
      smoking: SMOKING_OPTS,
      drinking: DRINKING_OPTS,
      exercise: EXERCISE_OPTS,
      zodiac: ZODIAC_SIGNS,
    };
    const options = optionsMap[editModal || ''] || [];

    return (
      <View style={inlineEditStyles.container}>
        <RNScrollView style={inlineEditStyles.optionsScroll} showsVerticalScrollIndicator={false}>
          {options.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[inlineEditStyles.option, selectedValue === opt && inlineEditStyles.optionActive]}
              onPress={() => {
                setSelectedValue(opt);
                onSave(editModal || '', opt);
              }}
            >
              <Text style={[inlineEditStyles.optionText, selectedValue === opt && inlineEditStyles.optionTextActive]}>
                {opt}
              </Text>
              {selectedValue === opt && <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />}
            </TouchableOpacity>
          ))}
        </RNScrollView>
      </View>
    );
  }

  // Multi select fields
  if (['genres', 'filmLanguages', 'languagesSpoken', 'relationshipIntent'].includes(editModal || '')) {
    const optionsMap: Record<string, string[]> = {
      genres: GENRES,
      filmLanguages: FILM_LANGUAGES,
      languagesSpoken: LANGUAGES,
      relationshipIntent: RELATIONSHIP_INTENTS,
    };
    const options = optionsMap[editModal || ''] || [];

    return (
      <View style={inlineEditStyles.container}>
        <Text style={inlineEditStyles.subtitle}>Select all that apply</Text>
        <RNScrollView style={inlineEditStyles.optionsScroll} showsVerticalScrollIndicator={false}>
          <View style={inlineEditStyles.chipsContainer}>
            {options.map(opt => (
              <TouchableOpacity
                key={opt}
                style={[inlineEditStyles.chip, selectedArray.includes(opt) && inlineEditStyles.chipActive]}
                onPress={() => toggleArrayItem(opt)}
              >
                <Text style={[inlineEditStyles.chipText, selectedArray.includes(opt) && inlineEditStyles.chipTextActive]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </RNScrollView>
        <View style={inlineEditStyles.buttonRow}>
          <TouchableOpacity style={inlineEditStyles.cancelBtn} onPress={onCancel}>
            <Text style={inlineEditStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={inlineEditStyles.saveBtn} onPress={handleSave}>
            <Text style={inlineEditStyles.saveText}>Save ({selectedArray.length})</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Height picker
  if (editModal === 'height') {
    const feetOptions = [4, 5, 6, 7];
    const inchOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const cmOptions = Array.from({ length: 101 }, (_, i) => 120 + i);

    return (
      <View style={inlineEditStyles.container}>
        <View style={inlineEditStyles.unitToggle}>
          <TouchableOpacity
            style={[inlineEditStyles.unitBtn, heightUnit === 'imperial' && inlineEditStyles.unitBtnActive]}
            onPress={() => setHeightUnit('imperial')}
          >
            <Text style={[inlineEditStyles.unitText, heightUnit === 'imperial' && inlineEditStyles.unitTextActive]}>ft/in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[inlineEditStyles.unitBtn, heightUnit === 'metric' && inlineEditStyles.unitBtnActive]}
            onPress={() => setHeightUnit('metric')}
          >
            <Text style={[inlineEditStyles.unitText, heightUnit === 'metric' && inlineEditStyles.unitTextActive]}>cm</Text>
          </TouchableOpacity>
        </View>

        {heightUnit === 'imperial' ? (
          <View style={inlineEditStyles.heightPickerRow}>
            <View style={inlineEditStyles.heightColumn}>
              <Text style={inlineEditStyles.heightLabel}>Feet</Text>
              <RNScrollView style={inlineEditStyles.heightScroll} showsVerticalScrollIndicator={false}>
                {feetOptions.map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[inlineEditStyles.heightItem, feet === f && inlineEditStyles.heightItemActive]}
                    onPress={() => setFeet(f)}
                  >
                    <Text style={[inlineEditStyles.heightItemText, feet === f && inlineEditStyles.heightItemTextActive]}>{f}&apos;</Text>
                  </TouchableOpacity>
                ))}
              </RNScrollView>
            </View>
            <View style={inlineEditStyles.heightColumn}>
              <Text style={inlineEditStyles.heightLabel}>Inches</Text>
              <RNScrollView style={inlineEditStyles.heightScroll} showsVerticalScrollIndicator={false}>
                {inchOptions.map(i => (
                  <TouchableOpacity
                    key={i}
                    style={[inlineEditStyles.heightItem, inches === i && inlineEditStyles.heightItemActive]}
                    onPress={() => setInches(i)}
                  >
                    <Text style={[inlineEditStyles.heightItemText, inches === i && inlineEditStyles.heightItemTextActive]}>{i}&quot;</Text>
                  </TouchableOpacity>
                ))}
              </RNScrollView>
            </View>
          </View>
        ) : (
          <RNScrollView style={inlineEditStyles.cmScroll} showsVerticalScrollIndicator={false}>
            {cmOptions.map(c => (
              <TouchableOpacity
                key={c}
                style={[inlineEditStyles.heightItem, cm === c && inlineEditStyles.heightItemActive]}
                onPress={() => setCm(c)}
              >
                <Text style={[inlineEditStyles.heightItemText, cm === c && inlineEditStyles.heightItemTextActive]}>{c} cm</Text>
              </TouchableOpacity>
            ))}
          </RNScrollView>
        )}

        <View style={inlineEditStyles.heightDisplay}>
          <Text style={inlineEditStyles.heightDisplayText}>
            {heightUnit === 'imperial' ? `${feet}'${inches}"` : `${cm} cm`}
          </Text>
        </View>

        <View style={inlineEditStyles.buttonRow}>
          <TouchableOpacity style={inlineEditStyles.cancelBtn} onPress={onCancel}>
            <Text style={inlineEditStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={inlineEditStyles.saveBtn} onPress={handleSave}>
            <Text style={inlineEditStyles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

const inlineEditStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: SPACING.l,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.m,
    textAlign: 'center',
  },
  textInput: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textInputMultiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginBottom: SPACING.m,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.m,
    marginTop: SPACING.m,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  saveText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  optionsScroll: {
    flex: 1,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.xs,
    backgroundColor: COLORS.bgCard,
  },
  optionActive: {
    backgroundColor: 'rgba(229,9,20,0.1)',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.text,
  },
  optionTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  chipText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  unitToggle: {
    flexDirection: 'row',
    gap: SPACING.s,
    marginBottom: SPACING.m,
    justifyContent: 'center',
  },
  unitBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  unitBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  unitText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  unitTextActive: {
    color: COLORS.white,
  },
  heightPickerRow: {
    flexDirection: 'row',
    gap: SPACING.m,
    flex: 1,
  },
  heightColumn: {
    flex: 1,
  },
  heightLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  heightScroll: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.m,
  },
  cmScroll: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.m,
  },
  heightItem: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.s,
    marginVertical: 2,
    marginHorizontal: 4,
  },
  heightItemActive: {
    backgroundColor: COLORS.primary,
  },
  heightItemText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  heightItemTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  heightDisplay: {
    alignItems: 'center',
    paddingVertical: SPACING.m,
    marginTop: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  heightDisplayText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gold,
  },
});

const editModalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  scroll: {
    flex: 1,
    padding: SPACING.m,
  },
  moviesGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: SPACING.s, 
    paddingVertical: SPACING.s 
  },
  movieItem: { 
    width: '18%', 
    alignItems: 'center' 
  },
  moviePoster: { 
    width: '100%', 
    aspectRatio: 0.67, 
    borderRadius: BORDER_RADIUS.s, 
    marginBottom: 4 
  },
  movieTitle: { 
    fontSize: 10, 
    textAlign: 'center', 
    color: COLORS.text, 
    marginBottom: 2 
  },
  emptyHint: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.m,
  },
});

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData>(initialProfileData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editModal, setEditModal] = useState<EditModalType>(null);
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [userPhotos, setUserPhotos] = useState<string[]>([]);
  
  // Safe array extractions to prevent .map() errors
  const topMovies = Array.isArray(profile?.topMovies) ? profile.topMovies : [];
  
  // Mode and theme hooks
  const { mode, setMode, colors, showModeDrawer, setShowModeDrawer } = useAppMode();

  useEffect(() => {
    loadProfile();
    loadPhotos();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const data = await getProfile();
      const auth = await import('../../src/store').then(m => m.getAuth());
      
      if (data) {
        // Ensure userId is set from auth if not in profile
        const profileWithUserId = {
          ...data,
          userId: data.userId || auth?.user_id,
        };
        setProfile(profileWithUserId);
        console.log('[Profile] Loaded profile for userId:', profileWithUserId.userId);
      } else if (auth?.user_id) {
        // No profile data but we have auth - create minimal profile
        setProfile({ ...initialProfileData, userId: auth.user_id });
      }
    } catch (error) {
      console.log('[Profile] Error loading profile:', error);
    }
    setLoading(false);
  };

  const loadPhotos = async () => {
    try {
      const storedProfile = await getProfile();
      const auth = await import('../../src/store').then(m => m.getAuth());
      const userId = storedProfile?.userId || auth?.user_id;
      
      console.log('[Profile] Loading photos for userId:', userId);
      
      let backendPhotos: string[] = [];
      let localPhotos: string[] = [];
      
      // First, try to get photos from backend
      if (userId) {
        try {
          const response = await fetch(`${BACKEND_URL}/api/user/pictures/${userId}`);
          if (response.ok) {
            const data = await response.json();
            console.log('[Profile] Backend pictures response:', JSON.stringify(data));
            
            // Backend returns { success: true, pictures: { picture_1: url, picture_2: url } }
            const picturesObj = data.pictures || {};
            backendPhotos = [
              picturesObj.picture_1,
              picturesObj.picture_2,
              picturesObj.picture_3,
              picturesObj.picture_4,
              picturesObj.picture_5,
            ].filter((url): url is string => Boolean(url) && typeof url === 'string');
            
            console.log('[Profile] Valid backend photos:', backendPhotos.length);
          }
        } catch (apiError) {
          console.log('[Profile] Backend API error:', apiError);
        }
      }
      
      // Also check local storage
      if (storedProfile?.profilePicture) {
        localPhotos.push(storedProfile.profilePicture);
      }
      if (storedProfile?.pictures && Array.isArray(storedProfile.pictures)) {
        const validLocalPics = storedProfile.pictures.filter(Boolean);
        localPhotos = [...localPhotos, ...validLocalPics];
      }
      
      console.log('[Profile] Local photos found:', localPhotos.length);
      
      // Merge and dedupe - prefer backend photos, then local
      const allPhotos = [...new Set([...backendPhotos, ...localPhotos])];
      
      console.log('[Profile] Total unique photos:', allPhotos.length);
      setUserPhotos(allPhotos);
      
    } catch (error) {
      console.log('[Profile] Error loading photos:', error);
      setUserPhotos([]);
    }
  };

  // Calculate profile completion percentage
  const calculateProfileCompletion = useCallback(() => {
    const fields = [
      profile.name,
      profile.gender,
      profile.bio,
      profile.location,
      profile.genres?.length > 0,
      profile.topMovies?.length > 0,
      profile.filmLanguages?.length > 0,
      profile.languagesSpoken?.length > 0,
      profile.movieFrequency,
      profile.relationshipIntent?.length > 0,
      profile.partnerPreference,
      userPhotos.length > 0,
    ];
    const completed = fields.filter(Boolean).length;
    return Math.round((completed / fields.length) * 100);
  }, [profile, userPhotos]);

  const completionPercentage = calculateProfileCompletion();

  // Toggle accordion section
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  // Sync profile to backend recommendation engine
  const syncProfileToBackend = async (profileData: ProfileData) => {
    try {
      const userId = profileData.userId || `user_${Date.now()}`;
      
      // Build the payload with ALL profile fields
      const payload = {
        user_id: userId,
        name: profileData.name || '',
        age: profileData.age || 0,
        gender: profileData.gender || '',
        location: profileData.location || '',
        partnerPreference: profileData.partnerPreference || '',
        relationshipIntent: profileData.relationshipIntent || [],
        genres: profileData.genres || [],
        filmLanguages: profileData.filmLanguages || [],
        languagesSpoken: profileData.languagesSpoken || [],
        topMovies: (profileData.topMovies || []).map(m => ({
          id: m.id,
          title: m.title,
          poster_path: m.poster_path || '',
          release_date: m.release_date || '',
          vote_average: m.vote_average || 0,
          rating: m.rating || 0,
          genres: m.genres || [],
          reasons: m.reasons || [],
        })),
        movieFrequency: profileData.movieFrequency || '',
        ottTheatre: profileData.ottTheatre || '',
        height: profileData.height || '',
        religion: profileData.religion || '',
        maritalStatus: profileData.maritalStatus || '',
        foodPreference: profileData.foodPreference || '',
        bio: profileData.bio || '',
        smoking: profileData.smoking || '',
        drinking: profileData.drinking || '',
        exercise: profileData.exercise || '',
        zodiac: profileData.zodiac || '',
        pets: profileData.pets || '',
        familyPlanning: profileData.familyPlanning || '',
        siblings: profileData.siblings || '',
        education: profileData.education || '',
        workProfile: profileData.workProfile || '',
        travel: profileData.travel || '',
        movieBuddyMode: profileData.movieBuddyMode || false,
        movieDateMode: profileData.movieDateMode || false,
      };
      
      const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Profile synced to backend:', result.signals_used);
      }
    } catch (error) {
      console.log('Error syncing profile to backend:', error);
      // Non-critical, don't show error to user
    }
  };

  const updateField = useCallback(async (field: string, value: any) => {
    const updatedProfile = { ...profile, [field]: value };
    setProfile(updatedProfile);
    setSaving(true);
    
    // Save locally
    await saveProfile(updatedProfile);
    
    // Sync to backend for recommendation engine (debounced for important fields)
    const importantFields = [
      'genres', 'filmLanguages', 'languagesSpoken', 'topMovies',
      'movieFrequency', 'ottTheatre', 'relationshipIntent'
    ];
    if (importantFields.includes(field)) {
      await syncProfileToBackend(updatedProfile);
    }
    
    setSaving(false);
  }, [profile]);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout and clear all data? This will delete your profile, preferences, and swipe history.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout & Delete Data', 
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete user data from backend first
              if (profile.userId) {
                await fetch(`${BACKEND_URL}/api/user/${profile.userId}/reset-all`, {
                  method: 'DELETE',
                });
                console.log('Deleted user data from backend');
              }
            } catch (error) {
              console.log('Error deleting backend data:', error);
              // Continue with logout even if backend delete fails
            }
            
            // Clear local storage
            await clearAll();
            router.replace('/');
          }
        },
      ]
    );
  };

  const getAvatarColor = () => {
    const av = AVATAR_OPTIONS.find(a => a.id === profile.avatarId);
    return av?.color || COLORS.primary;
  };

  const getAvatarIcon = () => {
    const av = AVATAR_OPTIONS.find(a => a.id === profile.avatarId);
    return av?.icon || 'person';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Get primary photo or avatar
  const primaryPhoto = userPhotos.length > 0 ? userPhotos[0] : null;
  const avatarColor = getAvatarColor();
  const avatarIcon = getAvatarIcon();

  return (
    <SafeAreaView style={styles.container} testID="profile-screen">
      {/* Shared Header with Mode Switcher */}
      <SharedHeader
        title="Profile"
        showModeIcon={true}
        onMenuPress={() => setShowModeDrawer(true)}
        colors={colors}
      />

      <RNScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ========== BUMBLE-INSPIRED PROFILE HEADER ========== */}
        <View style={styles.profileHeaderNew}>
          {/* Profile Picture with Completion Ring */}
          <TouchableOpacity 
            style={styles.profilePicContainer}
            onPress={() => setShowProfilePreview(true)}
            activeOpacity={0.8}
          >
            {/* Completion Ring */}
            <View style={styles.completionRing}>
              <View style={[styles.completionRingFill, { 
                borderColor: completionPercentage === 100 ? COLORS.success : COLORS.primary,
              }]} />
              <View style={styles.completionRingBg} />
            </View>
            
            {/* Profile Picture */}
            {primaryPhoto ? (
              <Image source={{ uri: primaryPhoto }} style={styles.profilePicNew} />
            ) : (
              <View style={[styles.profilePicNew, styles.avatarFallback, { backgroundColor: avatarColor }]}>
                <Ionicons name={avatarIcon as any} size={48} color={COLORS.white} />
              </View>
            )}
            
            {/* Completion Badge */}
            <View style={[styles.completionBadge, { 
              backgroundColor: completionPercentage === 100 ? COLORS.success : COLORS.primary 
            }]}>
              <Text style={styles.completionBadgeText}>{completionPercentage}%</Text>
            </View>
          </TouchableOpacity>

          {/* Name and Info */}
          <View style={styles.profileInfoNew}>
            <Text style={styles.profileNameNew}>{profile.name || 'Your Name'}</Text>
            {profile.age > 0 && profile.location && (
              <Text style={styles.profileSubtitleNew}>{profile.age} • {getSimplifiedLocation(profile.location)}</Text>
            )}
          </View>

          {/* Complete Profile Button - Always show if not 100% */}
          {completionPercentage < 100 ? (
            <TouchableOpacity 
              style={styles.completeProfileBtn}
              onPress={() => setShowEditProfile(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles" size={18} color="#FFF" />
              <Text style={styles.completeProfileBtnText}>Complete Profile</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.completeProfileBtn, { backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border }]}
              onPress={() => setShowEditProfile(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={18} color={COLORS.text} />
              <Text style={[styles.completeProfileBtnText, { color: COLORS.text }]}>Edit Profile</Text>
            </TouchableOpacity>
          )}

          {/* View as Others See You hint */}
          <Text style={styles.profileHint}>Tap photo to preview your profile</Text>
        </View>

        {/* ========== MAIN SETTINGS CARDS ========== */}
        <View style={styles.settingsSection}>
          {/* Edit Photos */}
          <TouchableOpacity 
            style={styles.settingsCard}
            onPress={() => router.push('/photos?from=profile')}
            activeOpacity={0.7}
          >
            <View style={[styles.settingsCardIcon, { backgroundColor: 'rgba(76, 175, 80, 0.15)' }]}>
              <Ionicons name="images" size={24} color="#4CAF50" />
            </View>
            <View style={styles.settingsCardContent}>
              <Text style={styles.settingsCardTitle}>Edit Photos</Text>
              <Text style={styles.settingsCardDesc}>{userPhotos.length} photo{userPhotos.length !== 1 ? 's' : ''} uploaded</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* Preferences & Filters */}
          <TouchableOpacity 
            style={styles.settingsCard}
            onPress={() => router.push('/filters?from=profile')}
            activeOpacity={0.7}
          >
            <View style={[styles.settingsCardIcon, { backgroundColor: 'rgba(33, 150, 243, 0.15)' }]}>
              <Ionicons name="options" size={24} color="#2196F3" />
            </View>
            <View style={styles.settingsCardContent}>
              <Text style={styles.settingsCardTitle}>Preferences & Filters</Text>
              <Text style={styles.settingsCardDesc}>Age, distance, and more</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* Profile Visibility */}
          <TouchableOpacity 
            style={styles.settingsCard}
            onPress={() => router.push('/visibility')}
            activeOpacity={0.7}
          >
            <View style={[styles.settingsCardIcon, { backgroundColor: 'rgba(156, 39, 176, 0.15)' }]}>
              <Ionicons name="shield-checkmark" size={24} color="#9C27B0" />
            </View>
            <View style={styles.settingsCardContent}>
              <Text style={styles.settingsCardTitle}>Profile Visibility</Text>
              <Text style={styles.settingsCardDesc}>Control who sees your profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtnNew} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.textSecondary} />
          <Text style={styles.logoutTextNew}>Logout & Clear Data</Text>
        </TouchableOpacity>
      </RNScrollView>

      {/* ========== EDIT PROFILE ACCORDION MODAL ========== */}
      <EditProfileModalContent
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        profile={profile}
        topMovies={topMovies}
        expandedSections={expandedSections}
        toggleSection={toggleSection}
        editModal={editModal}
        setEditModal={setEditModal}
        updateField={updateField}
      />

      {/* ========== PROFILE PREVIEW MODAL (Reusing PremiumProfileView) ========== */}
      <Modal visible={showProfilePreview} animationType="fade" onRequestClose={() => setShowProfilePreview(false)}>
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <PremiumProfileView
            visible={showProfilePreview}
            profile={{
              user_id: profile.userId || '',
              name: profile.name || 'Your Name',
              age: profile.age || 0,
              gender: profile.gender || '',
              location: profile.location || '',
              bio: profile.bio || '',
              genres: profile.genres || [],
              topMovies: topMovies.map(m => ({ title: m.title, tmdb_id: m.id, poster_path: m.poster_path })),
              filmLanguages: profile.filmLanguages || [],
              languagesSpoken: profile.languagesSpoken || [],
              movieFrequency: profile.movieFrequency || '',
              ottTheatre: profile.ottTheatre || '',
              match_level: 'Your Profile',
              explanation: 'This is how others see your profile',
              shared_interests: [],
            }}
            photos={userPhotos.length > 0 ? userPhotos : ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800']}
            mode={mode}
            onClose={() => setShowProfilePreview(false)}
            onSendMessage={async () => false}
            hasAlreadySentRequest={true}
            isSendingMessage={false}
          />
        </View>
      </Modal>

      {/* NOTE: All edit modals removed - now handled inline within EditProfileModalContent to avoid React Native nested modal issues */}

      {/* Mode Switcher Modal */}
      <ModeSwitcher
        visible={showModeDrawer}
        onClose={() => setShowModeDrawer(false)}
        currentMode={mode}
        onModeChange={setMode}
        colors={colors}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, overflow: 'scroll' as any },
  scrollContent: { paddingBottom: 120 },
  
  // ========== BUMBLE-INSPIRED PROFILE HEADER ==========
  profileHeaderNew: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.l,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  profilePicContainer: {
    position: 'relative',
    marginBottom: SPACING.m,
  },
  completionRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 60,
    overflow: 'hidden',
  },
  completionRingFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 3,
    borderRadius: 60,
  },
  completionRingBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 3,
    borderRadius: 60,
    borderColor: COLORS.border,
  },
  profilePicNew: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
    borderColor: COLORS.bg,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.bg,
  },
  completionBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
  },
  profileInfoNew: {
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  profileNameNew: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  profileSubtitleNew: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  completeProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
    marginBottom: SPACING.s,
  },
  completeProfileBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  profileHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  
  // ========== SETTINGS CARDS ==========
  settingsSection: {
    padding: SPACING.m,
    gap: SPACING.s,
  },
  settingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
    gap: SPACING.m,
  },
  settingsCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsCardContent: {
    flex: 1,
  },
  settingsCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  settingsCardDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  
  // ========== LOGOUT BUTTON ==========
  logoutBtnNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    marginHorizontal: SPACING.m,
    marginTop: SPACING.l,
    paddingVertical: 14,
  },
  logoutTextNew: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  
  // ========== EDIT PROFILE MODAL ==========
  editModalContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  editModalClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  editModalScroll: {
    flex: 1,
    padding: SPACING.m,
  },
  emptyHint: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.m,
  },
  
  // ========== LEGACY STYLES ==========
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.m, paddingVertical: SPACING.s, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: COLORS.text, textAlign: 'center' },
  savingIndicator: { width: 44 },
  profileHeader: { alignItems: 'center', paddingVertical: SPACING.xl, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  avatarLarge: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.m },
  editAvatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.bg },
  profileName: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.xs },
  profileAge: { fontSize: 16, color: COLORS.textSecondary },
  profileLocation: { fontSize: 14, color: COLORS.textMuted, marginTop: SPACING.xs },
  section: { paddingHorizontal: SPACING.l, paddingTop: SPACING.l },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.primary, marginBottom: SPACING.s, textTransform: 'uppercase', letterSpacing: 1 },
  moviesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s, paddingVertical: SPACING.s },
  movieItem: { width: '18%', alignItems: 'center' },
  moviePoster: { width: '100%', aspectRatio: 0.67, borderRadius: BORDER_RADIUS.s, marginBottom: 4 },
  movieTitle: { fontSize: 10, textAlign: 'center', color: COLORS.text, marginBottom: 2 },
  movieRating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 10, fontWeight: '600', color: COLORS.gold },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.s, marginHorizontal: SPACING.l, marginTop: SPACING.xl, paddingVertical: 16, borderRadius: BORDER_RADIUS.full, borderWidth: 2, borderColor: '#FF6B6B' },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#FF6B6B' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.m, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  settingsIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(229, 9, 20, 0.1)', alignItems: 'center', justifyContent: 'center', marginRight: SPACING.m },
  settingsInfo: { flex: 1 },
  settingsLabel: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  settingsDesc: { fontSize: 13, color: COLORS.textMuted },
});
