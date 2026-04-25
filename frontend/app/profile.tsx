import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  Modal, Image, Switch, ActivityIndicator, Alert, Platform,
  ScrollView as RNScrollView,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { ProfileData, initialProfileData, MovieSelection } from '../src/types';
import { getProfile, saveProfile, clearAll } from '../src/store';
import { getPartialLocation } from '../src/utils/location';

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
const OTT_OPTIONS = ['OTT Person', 'Theatre Person', 'Both', 'None'];
const FILM_LANGUAGES = ['Hindi', 'English', 'Telugu', 'Tamil', 'Malayalam', 'Kannada', 'Korean', 'Others'];
const GENRES = ['Action', 'Romance', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi', 'Drama', 'Documentary'];
const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other', 'Prefer not to say'];
const MARITAL_STATUSES = ['Single', 'Divorced', 'Widowed', 'Separated'];
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
          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
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
                      <Text style={[modalStyles.heightItemText, feet === f && modalStyles.heightItemTextActive]}>{f}'</Text>
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
                      <Text style={[modalStyles.heightItemText, inches === i && modalStyles.heightItemTextActive]}>{i}"</Text>
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

// Profile Field Row Component
function ProfileField({
  icon, label, value, onPress, isArray = false, isEmpty = false,
}: {
  icon: string;
  label: string;
  value: string | string[];
  onPress: () => void;
  isArray?: boolean;
  isEmpty?: boolean;
}) {
  const displayValue = isArray && Array.isArray(value) ? value.join(', ') : value;
  
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

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData>(initialProfileData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editModal, setEditModal] = useState<EditModalType>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    const data = await getProfile();
    if (data) {
      setProfile(data);
    }
    setLoading(false);
  };

  const updateField = useCallback(async (field: string, value: any) => {
    const updatedProfile = { ...profile, [field]: value };
    setProfile(updatedProfile);
    setSaving(true);
    await saveProfile(updatedProfile);
    setSaving(false);
  }, [profile]);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout and clear all data?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: async () => {
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

  return (
    <SafeAreaView style={styles.container} testID="profile-screen">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        {saving ? (
          <ActivityIndicator size="small" color={COLORS.primary} style={styles.savingIndicator} />
        ) : (
          <View style={styles.savingIndicator} />
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <TouchableOpacity style={styles.profileHeader} onPress={() => setEditModal('avatar')} activeOpacity={0.8}>
          <View style={[styles.avatarLarge, { backgroundColor: getAvatarColor() }]}>
            <Ionicons name={getAvatarIcon() as any} size={44} color={COLORS.white} />
            <View style={styles.editAvatarBadge}>
              <Ionicons name="pencil" size={12} color={COLORS.white} />
            </View>
          </View>
          <Text style={styles.profileName}>{profile.name || 'Your Name'}</Text>
          {profile.age > 0 && <Text style={styles.profileAge}>{profile.age} years old</Text>}
          {profile.location && <Text style={styles.profileLocation}>{getPartialLocation(profile.location)}</Text>}
        </TouchableOpacity>

        {/* Basic Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          <ProfileField icon="person-outline" label="Name" value={profile.name} onPress={() => setEditModal('name')} isEmpty={!profile.name} />
          <ProfileField icon="male-female-outline" label="Gender" value={profile.gender} onPress={() => setEditModal('gender')} isEmpty={!profile.gender} />
          <ProfileField icon="location-outline" label="Location" value={getPartialLocation(profile.location)} onPress={() => setEditModal('location')} isEmpty={!profile.location} />
          <ProfileField icon="document-text-outline" label="Bio" value={profile.bio} onPress={() => setEditModal('bio')} isEmpty={!profile.bio} />
        </View>

        {/* Relationship Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dating Preferences</Text>
          <ProfileField icon="heart-outline" label="Looking For" value={profile.relationshipIntent} onPress={() => setEditModal('relationshipIntent')} isArray isEmpty={!profile.relationshipIntent?.length} />
          <ProfileField icon="people-outline" label="Want to Meet" value={profile.partnerPreference} onPress={() => setEditModal('partnerPreference')} isEmpty={!profile.partnerPreference} />
        </View>

        {/* Movie Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Movie Preferences</Text>
          <ProfileField icon="time-outline" label="Movie Frequency" value={profile.movieFrequency} onPress={() => setEditModal('movieFrequency')} isEmpty={!profile.movieFrequency} />
          <ProfileField icon="tv-outline" label="OTT vs Theatre" value={profile.ottTheatre} onPress={() => setEditModal('ottTheatre')} isEmpty={!profile.ottTheatre} />
          <ProfileField icon="globe-outline" label="Film Languages" value={profile.filmLanguages} onPress={() => setEditModal('filmLanguages')} isArray isEmpty={!profile.filmLanguages?.length} />
          <ProfileField icon="film-outline" label="Favourite Genres" value={profile.genres} onPress={() => setEditModal('genres')} isArray isEmpty={!profile.genres?.length} />
        </View>

        {/* Top Movies */}
        {profile.topMovies && profile.topMovies.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Top 5 Movies</Text>
            <View style={styles.moviesGrid}>
              {profile.topMovies.map((movie, i) => (
                <View key={i} style={styles.movieItem}>
                  <Image 
                    source={{ uri: `https://image.tmdb.org/t/p/w200${movie.poster_path}` }}
                    style={styles.moviePoster}
                    resizeMode="cover"
                  />
                  <Text style={styles.movieTitle} numberOfLines={2}>{movie.title}</Text>
                  <View style={styles.movieRating}>
                    <Ionicons name="star" size={12} color={COLORS.gold} />
                    <Text style={styles.ratingText}>{movie.rating}/5</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Languages Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Languages</Text>
          <ProfileField icon="chatbubble-outline" label="Languages Spoken" value={profile.languagesSpoken} onPress={() => setEditModal('languagesSpoken')} isArray isEmpty={!profile.languagesSpoken?.length} />
        </View>

        {/* Personal Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          <ProfileField icon="resize-outline" label="Height" value={profile.height} onPress={() => setEditModal('height')} isEmpty={!profile.height} />
          <ProfileField icon="moon-outline" label="Religion" value={profile.religion} onPress={() => setEditModal('religion')} isEmpty={!profile.religion} />
          <ProfileField icon="ellipse-outline" label="Marital Status" value={profile.maritalStatus} onPress={() => setEditModal('maritalStatus')} isEmpty={!profile.maritalStatus} />
          <ProfileField icon="restaurant-outline" label="Food Preference" value={profile.foodPreference} onPress={() => setEditModal('foodPreference')} isEmpty={!profile.foodPreference} />
        </View>

        {/* Lifestyle Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lifestyle</Text>
          <ProfileField icon="flame-outline" label="Smoking" value={profile.smoking} onPress={() => setEditModal('smoking')} isEmpty={!profile.smoking} />
          <ProfileField icon="beer-outline" label="Drinking" value={profile.drinking} onPress={() => setEditModal('drinking')} isEmpty={!profile.drinking} />
          <ProfileField icon="fitness-outline" label="Exercise" value={profile.exercise} onPress={() => setEditModal('exercise')} isEmpty={!profile.exercise} />
          <ProfileField icon="airplane-outline" label="Travel" value={profile.travel} onPress={() => setEditModal('travel')} isEmpty={!profile.travel} />
        </View>

        {/* More About You Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More About You</Text>
          <ProfileField icon="star-outline" label="Zodiac Sign" value={profile.zodiac} onPress={() => setEditModal('zodiac')} isEmpty={!profile.zodiac} />
          <ProfileField icon="paw-outline" label="Pets" value={profile.pets} onPress={() => setEditModal('pets')} isEmpty={!profile.pets} />
          <ProfileField icon="home-outline" label="Family Planning" value={profile.familyPlanning} onPress={() => setEditModal('familyPlanning')} isEmpty={!profile.familyPlanning} />
          <ProfileField icon="people-circle-outline" label="Siblings" value={profile.siblings} onPress={() => setEditModal('siblings')} isEmpty={!profile.siblings} />
          <ProfileField icon="school-outline" label="Education" value={profile.education} onPress={() => setEditModal('education')} isEmpty={!profile.education} />
          <ProfileField icon="briefcase-outline" label="Work Profile" value={profile.workProfile} onPress={() => setEditModal('workProfile')} isEmpty={!profile.workProfile} />
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color="#FF6B6B" />
          <Text style={styles.logoutText}>Logout & Clear Data</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Modals */}
      <AvatarSelectModal
        visible={editModal === 'avatar'}
        onClose={() => setEditModal(null)}
        selected={profile.avatarId}
        onSelect={(id) => updateField('avatarId', id)}
      />

      <TextInputModal
        visible={editModal === 'name'}
        onClose={() => setEditModal(null)}
        title="Edit Name"
        value={profile.name}
        onSave={(val) => updateField('name', val)}
        placeholder="Your full name"
        maxLength={50}
      />

      <SingleSelectModal
        visible={editModal === 'gender'}
        onClose={() => setEditModal(null)}
        title="Select Gender"
        options={GENDERS}
        selected={profile.gender}
        onSelect={(val) => updateField('gender', val)}
      />

      <TextInputModal
        visible={editModal === 'location'}
        onClose={() => setEditModal(null)}
        title="Edit Location"
        value={profile.location}
        onSave={(val) => updateField('location', val)}
        placeholder="Your city"
        maxLength={100}
      />

      <TextInputModal
        visible={editModal === 'bio'}
        onClose={() => setEditModal(null)}
        title="Edit Bio"
        value={profile.bio}
        onSave={(val) => updateField('bio', val)}
        placeholder="Tell people about yourself"
        multiline
        maxLength={300}
      />

      <MultiSelectModal
        visible={editModal === 'relationshipIntent'}
        onClose={() => setEditModal(null)}
        title="What are you looking for?"
        options={RELATIONSHIP_INTENTS}
        selected={profile.relationshipIntent || []}
        onSelect={(val) => updateField('relationshipIntent', val)}
      />

      <SingleSelectModal
        visible={editModal === 'partnerPreference'}
        onClose={() => setEditModal(null)}
        title="Who do you want to meet?"
        options={PARTNER_PREFS}
        selected={profile.partnerPreference}
        onSelect={(val) => updateField('partnerPreference', val)}
      />

      <MultiSelectModal
        visible={editModal === 'languagesSpoken'}
        onClose={() => setEditModal(null)}
        title="Languages you speak"
        options={LANGUAGES}
        selected={profile.languagesSpoken || []}
        onSelect={(val) => updateField('languagesSpoken', val)}
      />

      <SingleSelectModal
        visible={editModal === 'movieFrequency'}
        onClose={() => setEditModal(null)}
        title="How often do you watch movies?"
        options={MOVIE_FREQUENCIES}
        selected={profile.movieFrequency}
        onSelect={(val) => updateField('movieFrequency', val)}
      />

      <SingleSelectModal
        visible={editModal === 'ottTheatre'}
        onClose={() => setEditModal(null)}
        title="OTT or Theatre?"
        options={OTT_OPTIONS}
        selected={profile.ottTheatre}
        onSelect={(val) => updateField('ottTheatre', val)}
      />

      <MultiSelectModal
        visible={editModal === 'filmLanguages'}
        onClose={() => setEditModal(null)}
        title="Film languages you watch"
        options={FILM_LANGUAGES}
        selected={profile.filmLanguages || []}
        onSelect={(val) => updateField('filmLanguages', val)}
      />

      <MultiSelectModal
        visible={editModal === 'genres'}
        onClose={() => setEditModal(null)}
        title="Your favourite genres"
        options={GENRES}
        selected={profile.genres || []}
        onSelect={(val) => updateField('genres', val)}
      />

      <HeightEditModal
        visible={editModal === 'height'}
        onClose={() => setEditModal(null)}
        value={profile.height}
        onSave={(val) => updateField('height', val)}
      />

      <SingleSelectModal
        visible={editModal === 'religion'}
        onClose={() => setEditModal(null)}
        title="Religion"
        options={RELIGIONS}
        selected={profile.religion}
        onSelect={(val) => updateField('religion', val)}
      />

      <SingleSelectModal
        visible={editModal === 'maritalStatus'}
        onClose={() => setEditModal(null)}
        title="Marital Status"
        options={MARITAL_STATUSES}
        selected={profile.maritalStatus}
        onSelect={(val) => updateField('maritalStatus', val)}
      />

      <SingleSelectModal
        visible={editModal === 'foodPreference'}
        onClose={() => setEditModal(null)}
        title="Food Preference"
        options={FOOD_PREFS}
        selected={profile.foodPreference}
        onSelect={(val) => updateField('foodPreference', val)}
      />

      <SingleSelectModal
        visible={editModal === 'smoking'}
        onClose={() => setEditModal(null)}
        title="Smoking Habit"
        options={SMOKING_OPTS}
        selected={profile.smoking}
        onSelect={(val) => updateField('smoking', val)}
      />

      <SingleSelectModal
        visible={editModal === 'drinking'}
        onClose={() => setEditModal(null)}
        title="Drinking Habit"
        options={DRINKING_OPTS}
        selected={profile.drinking}
        onSelect={(val) => updateField('drinking', val)}
      />

      <SingleSelectModal
        visible={editModal === 'exercise'}
        onClose={() => setEditModal(null)}
        title="Exercise Habit"
        options={EXERCISE_OPTS}
        selected={profile.exercise}
        onSelect={(val) => updateField('exercise', val)}
      />

      <SingleSelectModal
        visible={editModal === 'travel'}
        onClose={() => setEditModal(null)}
        title="Travel Frequency"
        options={TRAVEL_OPTS}
        selected={profile.travel}
        onSelect={(val) => updateField('travel', val)}
      />

      <SingleSelectModal
        visible={editModal === 'zodiac'}
        onClose={() => setEditModal(null)}
        title="Zodiac Sign"
        options={ZODIAC_SIGNS}
        selected={profile.zodiac}
        onSelect={(val) => updateField('zodiac', val)}
      />

      <SingleSelectModal
        visible={editModal === 'pets'}
        onClose={() => setEditModal(null)}
        title="Pets Preference"
        options={PETS_OPTS}
        selected={profile.pets}
        onSelect={(val) => updateField('pets', val)}
      />

      <SingleSelectModal
        visible={editModal === 'familyPlanning'}
        onClose={() => setEditModal(null)}
        title="Family Planning"
        options={FAMILY_OPTS}
        selected={profile.familyPlanning}
        onSelect={(val) => updateField('familyPlanning', val)}
      />

      <SingleSelectModal
        visible={editModal === 'siblings'}
        onClose={() => setEditModal(null)}
        title="Siblings"
        options={SIBLINGS_OPTS}
        selected={profile.siblings}
        onSelect={(val) => updateField('siblings', val)}
      />

      <SingleSelectModal
        visible={editModal === 'education'}
        onClose={() => setEditModal(null)}
        title="Education"
        options={EDUCATION_OPTS}
        selected={profile.education}
        onSelect={(val) => updateField('education', val)}
      />

      <SingleSelectModal
        visible={editModal === 'workProfile'}
        onClose={() => setEditModal(null)}
        title="Work Profile"
        options={WORK_OPTS}
        selected={profile.workProfile}
        onSelect={(val) => updateField('workProfile', val)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.m, paddingVertical: SPACING.s, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: COLORS.text, textAlign: 'center' },
  savingIndicator: { width: 44 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xxl },
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
});
