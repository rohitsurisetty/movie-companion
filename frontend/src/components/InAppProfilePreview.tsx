import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions, Modal } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { ProfileData, initialProfileData } from '../types';
import { getPartialLocation } from '../utils/location';
import { getProfile, saveProfile } from '../store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AVATAR_COLORS: Record<string, string> = {
  av1: '#E50914', av2: '#FFD700', av3: '#4CAF50', av4: '#2196F3',
  av5: '#9C27B0', av6: '#FF9800', av7: '#00BCD4', av8: '#F44336',
};
const AVATAR_ICONS: Record<string, any> = {
  av1: 'person', av2: 'happy', av3: 'leaf', av4: 'planet',
  av5: 'star', av6: 'sunny', av7: 'water', av8: 'heart',
};

// Visibility toggle fields configuration
const VISIBILITY_FIELDS = [
  { key: 'location', label: 'Location', icon: 'location-outline' },
  { key: 'bio', label: 'Bio', icon: 'document-text-outline' },
  { key: 'relationshipIntent', label: 'Looking For', icon: 'heart-outline' },
  { key: 'genres', label: 'Favourite Genres', icon: 'film-outline' },
  { key: 'filmLanguages', label: 'Languages I Watch', icon: 'language-outline' },
  { key: 'topMovies', label: 'Top Movies', icon: 'star-outline' },
  { key: 'movieFrequency', label: 'Movie Frequency', icon: 'time-outline' },
  { key: 'ottTheatre', label: 'OTT/Theatre Preference', icon: 'tv-outline' },
  { key: 'height', label: 'Height', icon: 'resize-outline' },
  { key: 'religion', label: 'Religion', icon: 'sparkles-outline' },
  { key: 'maritalStatus', label: 'Marital Status', icon: 'ellipse-outline' },
  { key: 'foodPreference', label: 'Food Preference', icon: 'restaurant-outline' },
  { key: 'zodiac', label: 'Zodiac Sign', icon: 'moon-outline' },
  { key: 'smoking', label: 'Smoking', icon: 'leaf-outline' },
  { key: 'drinking', label: 'Drinking', icon: 'wine-outline' },
  { key: 'exercise', label: 'Exercise', icon: 'fitness-outline' },
  { key: 'pets', label: 'Pets', icon: 'paw-outline' },
  { key: 'languagesSpoken', label: 'Languages I Speak', icon: 'chatbubble-outline' },
  { key: 'education', label: 'Education', icon: 'school-outline' },
  { key: 'workProfile', label: 'Work Profile', icon: 'briefcase-outline' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function InAppProfilePreview({ visible, onClose }: Props) {
  const [profileData, setProfileData] = useState<ProfileData>(initialProfileData);
  const [showVisibilityEditor, setShowVisibilityEditor] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load profile data when modal opens
  useEffect(() => {
    if (visible) {
      loadProfile();
    }
  }, [visible]);

  const loadProfile = async () => {
    setLoading(true);
    const data = await getProfile();
    if (data) {
      setProfileData(data);
    }
    setLoading(false);
  };

  // Handle visibility toggle change
  const handleToggleVisibility = async (key: string, value: boolean) => {
    const updatedData = {
      ...profileData,
      visibilityToggles: {
        ...profileData.visibilityToggles,
        [key]: value,
      },
    };
    setProfileData(updatedData);
    await saveProfile(updatedData);
  };

  // Check if a field should be visible
  const isVisible = (key: string, mandatory: boolean = false): boolean => {
    if (mandatory) return true;
    return profileData.visibilityToggles[key] !== false;
  };

  const topMovies = profileData?.topMovies || [];
  const partialLocation = getPartialLocation(profileData?.location);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Main Profile Preview */}
        {!showVisibilityEditor ? (
          <>
            {/* Header: Back (left) | Edit (right) */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.backBtn} onPress={onClose} testID="profile-preview-back">
                <Ionicons name="chevron-back" size={22} color={COLORS.text} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.editBtn} 
                onPress={() => setShowVisibilityEditor(true)} 
                testID="profile-preview-edit"
              >
                <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>

            {/* Title */}
            <View style={styles.titleSection}>
              <Text style={styles.title}>Public Profile Preview</Text>
              <Text style={styles.subtitle}>This is how your profile will appear to other users</Text>
            </View>

            {/* Scrollable Preview Card */}
            <ScrollView 
              style={styles.scrollContainer} 
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
            >
              {/* Profile Card */}
              <View style={styles.card}>
                {/* Card Header with Avatar */}
                <View style={styles.cardHeader}>
                  <View style={[styles.avatarLarge, { backgroundColor: AVATAR_COLORS[profileData.avatarId] || COLORS.primary }]}>
                    <Ionicons
                      name={(AVATAR_ICONS[profileData.avatarId] || 'person') as any}
                      size={60}
                      color={COLORS.white}
                    />
                  </View>
                  
                  <View style={styles.cardHeaderInfo}>
                    <Text style={styles.cardName}>
                      {profileData.name || 'Your Name'}{profileData.age > 0 ? `, ${profileData.age}` : ''}
                    </Text>
                    {isVisible('gender', true) && profileData.gender && (
                      <Text style={styles.cardGender}>{profileData.gender}</Text>
                    )}
                    {isVisible('location') && partialLocation && (
                      <View style={styles.locationRow}>
                        <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
                        <Text style={styles.cardLocation}>{partialLocation}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Bio Section */}
                {isVisible('bio') && profileData.bio && (
                  <View style={styles.section}>
                    <Text style={styles.bioText}>"{profileData.bio}"</Text>
                  </View>
                )}

                {/* Looking For */}
                {isVisible('relationshipIntent') && profileData.relationshipIntent && profileData.relationshipIntent.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="heart-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.sectionTitle}>Looking For</Text>
                    </View>
                    <View style={styles.tagsRow}>
                      {profileData.relationshipIntent.map((item, i) => (
                        <View key={i} style={styles.tag}>
                          <Text style={styles.tagText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Favourite Genres */}
                {isVisible('genres') && profileData.genres && profileData.genres.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="film-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.sectionTitle}>Favourite Genres</Text>
                    </View>
                    <View style={styles.tagsRow}>
                      {profileData.genres.map((genre, i) => (
                        <View key={i} style={styles.tag}>
                          <Text style={styles.tagText}>{genre}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Languages I Watch */}
                {isVisible('filmLanguages') && profileData.filmLanguages && profileData.filmLanguages.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="language-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.sectionTitle}>Languages I Watch</Text>
                    </View>
                    <View style={styles.tagsRow}>
                      {profileData.filmLanguages.map((lang, i) => (
                        <View key={i} style={styles.tag}>
                          <Text style={styles.tagText}>{lang}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Top 5 Movies */}
                {isVisible('topMovies') && topMovies.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="star-outline" size={16} color={COLORS.gold} />
                      <Text style={styles.sectionTitle}>Top {topMovies.length} Movies</Text>
                    </View>
                    <View style={styles.moviesGrid}>
                      {topMovies.map((movie, i) => (
                        <View key={i} style={styles.movieItem}>
                          <Image 
                            source={{ uri: `https://image.tmdb.org/t/p/w200${movie.poster_path}` }}
                            style={styles.moviePoster}
                            resizeMode="cover"
                          />
                          <Text style={styles.movieTitle} numberOfLines={2}>{movie.title}</Text>
                          <View style={styles.movieRating}>
                            <Ionicons name="star" size={10} color={COLORS.gold} />
                            <Text style={styles.ratingText}>{movie.rating}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Movie Preferences */}
                {(isVisible('movieFrequency') || isVisible('ottTheatre')) && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="videocam-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.sectionTitle}>Movie Preferences</Text>
                    </View>
                    {isVisible('movieFrequency') && profileData.movieFrequency && (
                      <View style={styles.infoRow}>
                        <Ionicons name="time-outline" size={16} color={COLORS.textMuted} />
                        <Text style={styles.infoText}>{profileData.movieFrequency}</Text>
                      </View>
                    )}
                    {isVisible('ottTheatre') && profileData.ottTheatre && (
                      <View style={styles.infoRow}>
                        <Ionicons name="tv-outline" size={16} color={COLORS.textMuted} />
                        <Text style={styles.infoText}>{profileData.ottTheatre}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Basic Info */}
                {(isVisible('height') || isVisible('religion') || isVisible('maritalStatus')) && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="person-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.sectionTitle}>About Me</Text>
                    </View>
                    <View style={styles.infoGrid}>
                      {isVisible('height') && profileData.height && (
                        <View style={styles.infoChip}>
                          <Ionicons name="resize-outline" size={14} color={COLORS.textSecondary} />
                          <Text style={styles.infoChipText}>{profileData.height}</Text>
                        </View>
                      )}
                      {isVisible('religion') && profileData.religion && (
                        <View style={styles.infoChip}>
                          <Ionicons name="sparkles-outline" size={14} color={COLORS.textSecondary} />
                          <Text style={styles.infoChipText}>{profileData.religion}</Text>
                        </View>
                      )}
                      {isVisible('maritalStatus') && profileData.maritalStatus && (
                        <View style={styles.infoChip}>
                          <Ionicons name="ellipse-outline" size={14} color={COLORS.textSecondary} />
                          <Text style={styles.infoChipText}>{profileData.maritalStatus}</Text>
                        </View>
                      )}
                      {isVisible('foodPreference') && profileData.foodPreference && (
                        <View style={styles.infoChip}>
                          <Ionicons name="restaurant-outline" size={14} color={COLORS.textSecondary} />
                          <Text style={styles.infoChipText}>{profileData.foodPreference}</Text>
                        </View>
                      )}
                      {isVisible('zodiac') && profileData.zodiac && (
                        <View style={styles.infoChip}>
                          <Ionicons name="moon-outline" size={14} color={COLORS.textSecondary} />
                          <Text style={styles.infoChipText}>{profileData.zodiac}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Lifestyle */}
                {(isVisible('smoking') || isVisible('drinking') || isVisible('exercise')) && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="leaf-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.sectionTitle}>Lifestyle</Text>
                    </View>
                    <View style={styles.infoGrid}>
                      {isVisible('smoking') && profileData.smoking && (
                        <View style={styles.infoChip}>
                          <Text style={styles.infoChipText}>🚬 {profileData.smoking}</Text>
                        </View>
                      )}
                      {isVisible('drinking') && profileData.drinking && (
                        <View style={styles.infoChip}>
                          <Text style={styles.infoChipText}>🍷 {profileData.drinking}</Text>
                        </View>
                      )}
                      {isVisible('exercise') && profileData.exercise && (
                        <View style={styles.infoChip}>
                          <Text style={styles.infoChipText}>💪 {profileData.exercise}</Text>
                        </View>
                      )}
                      {isVisible('pets') && profileData.pets && (
                        <View style={styles.infoChip}>
                          <Text style={styles.infoChipText}>🐾 {profileData.pets}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Languages Spoken */}
                {isVisible('languagesSpoken') && profileData.languagesSpoken && profileData.languagesSpoken.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="chatbubble-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.sectionTitle}>Languages I Speak</Text>
                    </View>
                    <View style={styles.tagsRow}>
                      {profileData.languagesSpoken.map((lang, i) => (
                        <View key={i} style={styles.tagSmall}>
                          <Text style={styles.tagSmallText}>{lang}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Work & Education */}
                {(isVisible('education') || isVisible('workProfile')) && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="briefcase-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.sectionTitle}>Work & Education</Text>
                    </View>
                    {isVisible('workProfile') && profileData.workProfile && (
                      <View style={styles.infoRow}>
                        <Ionicons name="business-outline" size={16} color={COLORS.textMuted} />
                        <Text style={styles.infoText}>{profileData.workProfile}</Text>
                      </View>
                    )}
                    {isVisible('education') && profileData.education && (
                      <View style={styles.infoRow}>
                        <Ionicons name="school-outline" size={16} color={COLORS.textMuted} />
                        <Text style={styles.infoText}>{profileData.education}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Bottom spacer */}
              <View style={{ height: SPACING.xl }} />
            </ScrollView>
          </>
        ) : (
          /* Visibility Editor Screen */
          <>
            {/* Header: Back to Preview | Done */}
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backBtn} 
                onPress={() => setShowVisibilityEditor(false)} 
                testID="visibility-back"
              >
                <Ionicons name="chevron-back" size={22} color={COLORS.text} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.doneBtn} 
                onPress={() => setShowVisibilityEditor(false)} 
                testID="visibility-done"
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Title */}
            <View style={styles.titleSection}>
              <Text style={styles.title}>Edit Visibility</Text>
              <Text style={styles.subtitle}>Choose what others can see on your profile</Text>
            </View>

            {/* Visibility Toggles */}
            <ScrollView 
              style={styles.scrollContainer}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
            >
              <View style={styles.togglesCard}>
                {VISIBILITY_FIELDS.map((field) => (
                  <View key={field.key} style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Ionicons name={field.icon as any} size={20} color={COLORS.textSecondary} />
                      <Text style={styles.toggleLabel}>{field.label}</Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.toggleSwitch,
                        profileData.visibilityToggles[field.key] !== false && styles.toggleSwitchActive,
                      ]}
                      onPress={() => handleToggleVisibility(field.key, profileData.visibilityToggles[field.key] === false)}
                    >
                      <View style={[
                        styles.toggleKnob,
                        profileData.visibilityToggles[field.key] !== false && styles.toggleKnobActive,
                      ]} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Info text */}
              <Text style={styles.infoNote}>
                Changes are saved automatically and will reflect across the app.
              </Text>

              {/* Bottom spacer */}
              <View style={{ height: SPACING.xl }} />
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.bg,
    paddingTop: 50, // Safe area
    paddingHorizontal: SPACING.l,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.m,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backBtnText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  editBtnText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  doneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  doneBtnText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '600',
  },
  titleSection: {
    marginBottom: SPACING.l,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.m,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  cardGender: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardLocation: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  section: {
    marginBottom: SPACING.l,
    paddingTop: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.s,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bioText: {
    fontSize: 16,
    fontStyle: 'italic',
    color: COLORS.text,
    lineHeight: 24,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
  },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: 'rgba(229,9,20,0.1)',
    borderWidth: 1,
    borderColor: COLORS.primaryDark,
  },
  tagText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '500',
  },
  tagSmall: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.bgInput,
  },
  tagSmallText: {
    fontSize: 12,
    color: COLORS.text,
  },
  moviesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
    justifyContent: 'flex-start',
  },
  movieItem: {
    width: 70,
    alignItems: 'center',
  },
  moviePoster: {
    width: 60,
    height: 90,
    borderRadius: BORDER_RADIUS.s,
    marginBottom: 4,
  },
  movieTitle: {
    fontSize: 10,
    textAlign: 'center',
    color: COLORS.text,
    marginBottom: 2,
  },
  movieRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: 10,
    color: COLORS.gold,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.s,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.text,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.bgInput,
  },
  infoChipText: {
    fontSize: 13,
    color: COLORS.text,
  },
  // Visibility Editor Styles
  togglesCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    color: COLORS.text,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.bgInput,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: COLORS.primary,
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  infoNote: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.l,
    paddingHorizontal: SPACING.l,
  },
});
