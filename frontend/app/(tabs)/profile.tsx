import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  Modal, Image, ActivityIndicator, Alert,
  ScrollView as RNScrollView, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../../src/theme';
import { ProfileData, initialProfileData, MovieSelection } from '../../src/types';
import { apiUrl, getUserId, getProfile, saveProfile, clearAll, logout } from '../../src/store';
import { getPartialLocation, getSimplifiedLocation } from '../../src/utils/location';
import { SharedHeader, useAppMode } from '../../src/components/SharedHeader';
import { PremiumProfileView, normalizePictures, getProfilePhotos } from '../../src/components/PremiumProfileView';
import { LEGAL_URLS, openLegal } from '../../src/legal';
import {
  AVATAR_OPTIONS, RELATIONSHIP_INTENTS, PARTNER_PREFS, LANGUAGES,
  MOVIE_FREQUENCIES, FILM_LANGUAGES, GENRES, RELIGIONS, MARITAL_STATUSES,
  OTT_OPTIONS, FOOD_PREFS, SMOKING_OPTS, DRINKING_OPTS, EXERCISE_OPTS,
  ZODIAC_SIGNS, type EditModalType,
} from '../../src/components/profile/constants';
import ErrorBoundary from '../../src/components/ErrorBoundary';

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
      case 'maritalStatus': return 'Marital Status';
      case 'foodPreference': return 'Food Preference';
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
              <ProfileField icon="ellipse-outline" label="Marital Status" value={profile.maritalStatus} onPress={() => setEditModal('maritalStatus')} isEmpty={!profile.maritalStatus} />
              <ProfileField icon="restaurant-outline" label="Food Preference" value={profile.foodPreference} onPress={() => setEditModal('foodPreference')} isEmpty={!profile.foodPreference} />
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
      case 'maritalStatus':
        setSelectedValue(profile.maritalStatus || '');
        break;
      case 'foodPreference':
        setSelectedValue(profile.foodPreference || '');
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
      case 'maritalStatus':
        onSave('maritalStatus', selectedValue);
        break;
      case 'foodPreference':
        onSave('foodPreference', selectedValue);
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
  if (['movieFrequency', 'ottTheatre', 'partnerPreference', 'religion', 'maritalStatus', 'foodPreference', 'smoking', 'drinking', 'exercise', 'zodiac'].includes(editModal || '')) {
    const optionsMap: Record<string, string[]> = {
      movieFrequency: MOVIE_FREQUENCIES,
      ottTheatre: OTT_OPTIONS,
      partnerPreference: PARTNER_PREFS,
      religion: RELIGIONS,
      maritalStatus: MARITAL_STATUSES,
      foodPreference: FOOD_PREFS,
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

// ============ PROFILE SYNC HELPERS ============
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : [];

// Only well-formed movies (the backend requires a numeric id + title); the
// optional TMDB fields may be missing or mistyped in older local profiles.
const sanitizeTopMovies = (v: unknown): MovieSelection[] =>
  (Array.isArray(v) ? v : [])
    .filter((m): m is MovieSelection => !!m && typeof m === 'object' && typeof m.id === 'number' && !!m.title)
    .map(m => ({
      id: m.id,
      title: String(m.title),
      poster_path: str(m.poster_path),
      release_date: str(m.release_date),
      vote_average: Number(m.vote_average) || 0,
      rating: Number(m.rating) || 0,
      genres: strList(m.genres),
      reasons: strList(m.reasons),
    }));

// POST /api/user/profile overwrites every profile field, so always send the
// whole (sanitised) profile — never a partial body.
const buildProfilePayload = (userId: string, p: Partial<ProfileData>) => ({
  user_id: userId,
  name: str(p.name),
  age: Number(p.age) || 0,
  gender: str(p.gender),
  location: str(p.location),
  ...(p.dobDay && p.dobMonth && p.dobYear
    ? { dobDay: String(p.dobDay), dobMonth: String(p.dobMonth), dobYear: String(p.dobYear) }
    : {}),
  ...(typeof p.dob === 'string' && p.dob ? { dob: p.dob } : {}),
  ...(typeof p.locationFull === 'string' && p.locationFull ? { locationFull: p.locationFull } : {}),
  ...(typeof p.coordinates?.lat === 'number' && typeof p.coordinates?.lng === 'number'
    ? { coordinates: { lat: p.coordinates.lat, lng: p.coordinates.lng } }
    : {}),
  partnerPreference: str(p.partnerPreference),
  relationshipIntent: strList(p.relationshipIntent),
  genres: strList(p.genres),
  filmLanguages: strList(p.filmLanguages),
  languagesSpoken: strList(p.languagesSpoken),
  topMovies: sanitizeTopMovies(p.topMovies),
  movieFrequency: str(p.movieFrequency),
  ottTheatre: str(p.ottTheatre),
  height: str(p.height),
  religion: str(p.religion),
  maritalStatus: str(p.maritalStatus),
  foodPreference: str(p.foodPreference),
  bio: str(p.bio),
  smoking: str(p.smoking),
  drinking: str(p.drinking),
  exercise: str(p.exercise),
  zodiac: str(p.zodiac),
  pets: str(p.pets),
  familyPlanning: str(p.familyPlanning),
  siblings: str(p.siblings),
  education: str(p.education),
  workProfile: str(p.workProfile),
  travel: str(p.travel),
  movieBuddyMode: !!p.movieBuddyMode,
  movieDateMode: !!p.movieDateMode,
  // Omitted (server keeps its copy) rather than sent empty when never set.
  ...(p.visibilityToggles && typeof p.visibilityToggles === 'object'
    ? { visibilityToggles: p.visibilityToggles }
    : {}),
});

// Profile fields worth caching locally from GET /api/user/profile/{id}.
const SERVER_PROFILE_KEYS: string[] = [...Object.keys(initialProfileData), 'dob', 'locationFull', 'coordinates'];

/**
 * The locally stored profile, hydrated from the server when this device has
 * none yet (e.g. a returning user on a fresh install). Callers must check
 * `name` before syncing: a profile without it was never loaded, and POSTing
 * it would wipe the server copy.
 */
async function loadBaseProfile(userId: string): Promise<Partial<ProfileData> | null> {
  const local = await getProfile();
  if (local?.name) return local;
  try {
    const res = await fetch(apiUrl(`/api/user/profile/${encodeURIComponent(userId)}`));
    if (!res.ok) return local;
    const server = (await res.json())?.profile;
    if (!server || typeof server !== 'object' || !server.name) return local;
    const fromServer: Record<string, unknown> = {};
    SERVER_PROFILE_KEYS.forEach(key => {
      if (server[key] !== undefined && server[key] !== null) fromServer[key] = server[key];
    });
    fromServer.topMovies = sanitizeTopMovies(server.topMovies);
    const merged = { ...(local || {}), ...fromServer, userId };
    await saveProfile(merged);
    return merged;
  } catch {
    return local;
  }
}

export default function ProfileScreen() {
  return (
    <ErrorBoundary
      fallbackTitle="Profile failed to load"
      fallbackMessage="Tap below to retry. Your data is safe."
    >
      <ProfileScreenInner />
    </ErrorBoundary>
  );
}

function ProfileScreenInner() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData>(initialProfileData);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [editModal, setEditModal] = useState<EditModalType>(null);
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [userPhotos, setUserPhotos] = useState<string[]>([]);
  const hasLoadedRef = useRef(false);
  // Local read-merge-writes run one at a time so quick edits can't clobber each other.
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  // At most one POST /api/user/profile in flight; edits made meanwhile are
  // coalesced into one follow-up request carrying the newest profile.
  const syncStateRef = useRef<{ inFlight: Promise<void> | null; pending: boolean }>({
    inFlight: null,
    pending: false,
  });

  // Safe array extractions to prevent .map() errors
  const topMovies = Array.isArray(profile?.topMovies) ? profile.topMovies : [];

  // Mode and theme hooks
  const { mode, colors, setShowModeDrawer } = useAppMode();

  const loadProfile = useCallback(async () => {
    // Spinner only on the first load; focus reloads refresh in place.
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const userId = await getUserId();
      if (!userId) {
        router.replace('/');
        return;
      }
      await writeQueueRef.current; // let pending edits land first
      const data = await loadBaseProfile(userId);
      setProfile({ ...initialProfileData, ...(data || {}), userId });
    } catch (error) {
      console.log('[Profile] Error loading profile:', error);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [router]);

  const loadPhotos = useCallback(async () => {
    try {
      const userId = await getUserId();
      if (!userId) return; // loadProfile redirects to login
      const storedProfile = await getProfile();

      // The server is the source of truth for uploaded photos; the local copy
      // (kept in sync by photos.tsx) is only a fallback when it's unreachable.
      try {
        const response = await fetch(apiUrl(`/api/user/pictures/${encodeURIComponent(userId)}`));
        if (response.ok) {
          const data = await response.json();
          // string[] or the legacy { picture_1..picture_5 } object
          setUserPhotos(normalizePictures(data?.pictures));
          return;
        }
      } catch (apiError) {
        console.log('[Profile] Could not load pictures from the server:', apiError);
      }

      setUserPhotos(
        Array.isArray(storedProfile?.pictures)
          ? normalizePictures(storedProfile.pictures)
          : getProfilePhotos(storedProfile)
      );
    } catch (error) {
      console.log('[Profile] Error loading photos:', error);
      setUserPhotos([]);
    }
  }, []);

  // Reload on every focus (not only on mount): photos.tsx and visibility.tsx
  // write pictures / visibilityToggles to the stored profile.
  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadPhotos();
    }, [loadProfile, loadPhotos])
  );

  // Calculate profile completion percentage with weighted scoring
  const calculateProfileCompletion = useCallback(() => {
    // Weighted scoring system - total 100 points
    // Photos: 25 points (5 photos x 5 points each)
    // Essential fields: 50 points (10 fields x 5 points each)
    // Optional fields: 25 points (10 fields x 2.5 points each)
    
    let score = 0;
    
    // ===== PHOTOS (25 points total - 5 points each) =====
    // Require exactly 5 photos for full score
    const photoCount = Math.min(userPhotos.length, 5);
    score += photoCount * 5; // Max 25 points
    
    // ===== ESSENTIAL FIELDS (50 points total - 5 points each) =====
    const essentialFields = [
      { filled: !!profile.name, points: 5 },
      { filled: !!profile.gender, points: 5 },
      { filled: !!profile.bio, points: 5 },
      { filled: !!profile.location, points: 5 },
      { filled: (profile.genres?.length || 0) > 0, points: 5 },
      { filled: (profile.topMovies?.length || 0) > 0, points: 5 },
      { filled: (profile.filmLanguages?.length || 0) > 0, points: 5 },
      { filled: (profile.languagesSpoken?.length || 0) > 0, points: 5 },
      { filled: !!profile.movieFrequency, points: 5 },
      { filled: (profile.relationshipIntent?.length || 0) > 0, points: 5 },
    ];
    
    essentialFields.forEach(field => {
      if (field.filled) score += field.points;
    });
    
    // ===== OPTIONAL FIELDS (25 points total - 2.5 points each) =====
    const optionalFields = [
      { filled: !!profile.partnerPreference, points: 2.5 },
      { filled: !!profile.height, points: 2.5 },
      { filled: !!profile.religion, points: 2.5 },
      { filled: !!profile.maritalStatus, points: 2.5 },
      { filled: !!profile.foodPreference, points: 2.5 },
      { filled: !!profile.smoking, points: 2.5 },
      { filled: !!profile.drinking, points: 2.5 },
      { filled: !!profile.exercise, points: 2.5 },
      { filled: !!profile.zodiac, points: 2.5 },
      { filled: !!profile.ottTheatre, points: 2.5 },
    ];
    
    optionalFields.forEach(field => {
      if (field.filled) score += field.points;
    });
    
    return Math.round(score);
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

  // Sends the WHOLE profile (matching, recommendations and what others see).
  const syncProfileToBackend = async (profileData: Partial<ProfileData>) => {
    const userId = await getUserId();
    if (!userId) {
      router.replace('/');
      return;
    }
    try {
      const response = await fetch(apiUrl('/api/user/profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildProfilePayload(userId, profileData)),
      });
      // 401: the global fetch wrapper clears the session and routes to login.
      if (response.ok || response.status === 401) return;
      let detail = '';
      if (response.status < 500) {
        try {
          const body = await response.json();
          if (typeof body?.detail === 'string') detail = body.detail;
        } catch {
          // non-JSON error body
        }
      }
      Alert.alert(
        'Could not save',
        response.status === 429
          ? 'You are making changes too quickly. Please try again shortly.'
          : detail || 'Your change is saved on this device but could not be sent to the server. Please try again.'
      );
    } catch {
      Alert.alert(
        'Could not save',
        'Your change is saved on this device but could not reach the server. Check your connection and try again.'
      );
    }
  };

  const scheduleSync = (): Promise<void> => {
    const state = syncStateRef.current;
    if (state.inFlight) {
      state.pending = true;
      return state.inFlight;
    }
    const run = async () => {
      try {
        do {
          state.pending = false;
          const latest = await getProfile();
          if (latest?.name) await syncProfileToBackend(latest);
        } while (state.pending);
      } finally {
        state.inFlight = null;
      }
    };
    state.inFlight = run();
    return state.inFlight;
  };

  const updateField = (field: string, value: any) => {
    setProfile(prev => ({ ...prev, [field]: value })); // optimistic
    const write = async () => {
      try {
        const userId = await getUserId();
        if (!userId) {
          router.replace('/');
          return;
        }
        // Merge into the LATEST stored profile, not this screen's copy:
        // photos.tsx / visibility.tsx write pictures, profilePicture and
        // visibilityToggles there.
        const base = await loadBaseProfile(userId);
        if (!base?.name) {
          // Never loaded from the server (offline fresh install): a partial
          // profile must not be saved or sent, it would wipe the server copy.
          setProfile({ ...initialProfileData, ...(base || {}), userId });
          Alert.alert(
            'Could not save',
            'We could not load your profile yet. Check your connection and try again.'
          );
          return;
        }
        await saveProfile({ ...base, userId, [field]: value });
        scheduleSync().catch(error => console.log('[Profile] Profile sync failed:', error));
      } catch (error) {
        console.log('[Profile] Error saving profile:', error);
      }
    };
    writeQueueRef.current = writeQueueRef.current.then(write);
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout(); // revokes the server session + clears local data
          } finally {
            router.replace('/');
          }
        },
      },
    ]);
  };

  // Google Play requires in-app account deletion.
  const deleteAccount = async () => {
    const userId = await getUserId();
    if (!userId) {
      router.replace('/');
      return;
    }
    setDeleting(true);
    try {
      // Let queued edits and an in-flight profile save finish first, so they
      // can't re-create server data after the delete.
      await writeQueueRef.current;
      await syncStateRef.current.inFlight?.catch(() => undefined);
      const res = await fetch(apiUrl(`/api/user/${encodeURIComponent(userId)}/reset-all`), {
        method: 'DELETE',
      });
      if (res.status === 401) return; // session expired: the fetch wrapper routes to login
      if (!res.ok) {
        Alert.alert(
          'Could not delete account',
          res.status === 429
            ? 'Too many attempts. Please try again shortly.'
            : 'Something went wrong on our side. Your account was not deleted — please try again.'
        );
        return;
      }
      await clearAll();
      router.replace('/');
    } catch {
      Alert.alert('Could not delete account', 'Check your internet connection and try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAccount = () => {
    if (deleting) return;
    Alert.alert(
      'Delete account?',
      'This permanently deletes your profile, preferences and match history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: deleteAccount },
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
      <SafeAreaView style={styles.container} edges={['top']}>
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
    <SafeAreaView style={styles.container} edges={['top']} testID="profile-screen">
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

          {/* Match History - Trust & Safety Feature */}
          <TouchableOpacity 
            style={styles.settingsCard}
            onPress={() => router.push('/history')}
            activeOpacity={0.7}
          >
            <View style={[styles.settingsCardIcon, { backgroundColor: 'rgba(0, 150, 136, 0.15)' }]}>
              <Ionicons name="time-outline" size={24} color="#009688" />
            </View>
            <View style={styles.settingsCardContent}>
              <Text style={styles.settingsCardTitle}>History</Text>
              <Text style={styles.settingsCardDesc}>View all your past matches</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ========== LEGAL & SUPPORT (opens in the in-app browser) ========== */}
        <View style={styles.settingsSection}>
          <Text style={styles.settingsGroupTitle}>Legal & support</Text>

          <TouchableOpacity
            style={styles.settingsCard}
            onPress={() => openLegal(LEGAL_URLS.terms)}
            activeOpacity={0.7}
            testID="legal-terms"
          >
            <View style={[styles.settingsCardIcon, { backgroundColor: 'rgba(158, 158, 158, 0.15)' }]}>
              <Ionicons name="document-text-outline" size={24} color="#9E9E9E" />
            </View>
            <View style={styles.settingsCardContent}>
              <Text style={styles.settingsCardTitle}>Terms of Use</Text>
              <Text style={styles.settingsCardDesc}>The rules for using filmydating</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsCard}
            onPress={() => openLegal(LEGAL_URLS.guidelines)}
            activeOpacity={0.7}
            testID="legal-guidelines"
          >
            <View style={[styles.settingsCardIcon, { backgroundColor: 'rgba(255, 152, 0, 0.15)' }]}>
              <Ionicons name="people-outline" size={24} color="#FF9800" />
            </View>
            <View style={styles.settingsCardContent}>
              <Text style={styles.settingsCardTitle}>Community Guidelines</Text>
              <Text style={styles.settingsCardDesc}>How we keep the community safe</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsCard}
            onPress={() => openLegal(LEGAL_URLS.privacy)}
            activeOpacity={0.7}
            testID="legal-privacy"
          >
            <View style={[styles.settingsCardIcon, { backgroundColor: 'rgba(96, 125, 139, 0.15)' }]}>
              <Ionicons name="lock-closed-outline" size={24} color="#607D8B" />
            </View>
            <View style={styles.settingsCardContent}>
              <Text style={styles.settingsCardTitle}>Privacy Policy</Text>
              <Text style={styles.settingsCardDesc}>How we use and protect your data</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsCard}
            onPress={() => openLegal(LEGAL_URLS.contact)}
            activeOpacity={0.7}
            testID="legal-contact"
          >
            <View style={[styles.settingsCardIcon, { backgroundColor: 'rgba(3, 169, 244, 0.15)' }]}>
              <Ionicons name="help-circle-outline" size={24} color="#03A9F4" />
            </View>
            <View style={styles.settingsCardContent}>
              <Text style={styles.settingsCardTitle}>Help & Support</Text>
              <Text style={styles.settingsCardDesc}>Contact us or report a problem</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Log out (keeps the account) */}
        <TouchableOpacity style={styles.logoutBtnNew} onPress={handleLogout} activeOpacity={0.8} testID="logout-button">
          <Ionicons name="log-out-outline" size={20} color={COLORS.textSecondary} />
          <Text style={styles.logoutTextNew}>Log out</Text>
        </TouchableOpacity>

        {/* Delete account (permanent) */}
        <TouchableOpacity
          style={[styles.deleteAccountBtn, deleting && { opacity: 0.6 }]}
          onPress={handleDeleteAccount}
          disabled={deleting}
          activeOpacity={0.8}
          testID="delete-account-button"
        >
          {deleting ? (
            <ActivityIndicator size="small" color={COLORS.error} />
          ) : (
            <Ionicons name="trash-outline" size={20} color={COLORS.error} />
          )}
          <Text style={styles.deleteAccountText}>{deleting ? 'Deleting account…' : 'Delete account'}</Text>
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
            // No photos → PremiumProfileView shows an initial placeholder
            photos={userPhotos}
            mode={mode}
            onClose={() => setShowProfilePreview(false)}
            onSendMessage={async () => false}
            isOwnProfile
          />
        </View>
      </Modal>

      {/* NOTE: All edit modals removed - now handled inline within EditProfileModalContent to avoid React Native nested modal issues */}
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
  settingsGroupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginLeft: SPACING.xs,
    marginBottom: SPACING.xs,
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
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    marginHorizontal: SPACING.m,
    paddingVertical: 14,
  },
  deleteAccountText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.error,
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
});
