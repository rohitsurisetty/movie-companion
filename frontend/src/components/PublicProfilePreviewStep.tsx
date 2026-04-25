import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { ProfileData } from '../types';
import { getPartialLocation } from '../utils/location';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - SPACING.l * 2;

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
  onEdit: () => void;
  onContinue: () => void;
};

export default function PublicProfilePreviewStep({ data, onEdit, onContinue }: Props) {
  // Filter fields based on visibility toggles
  const isVisible = (key: string, mandatory: boolean = false): boolean => {
    if (mandatory) return true;
    return data.visibilityToggles[key] !== false;
  };

  const topMovies = data.topMovies || [];
  const partialLocation = getPartialLocation(data.location);

  return (
    <View style={styles.container}>
      {/* Header with navigation */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerBtn} onPress={onEdit} testID="public-preview-back">
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            <Text style={styles.headerBtnText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={onEdit} testID="public-preview-edit">
            <Ionicons name="create-outline" size={18} color={COLORS.primary} />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.continueBtn} onPress={onContinue} testID="public-preview-continue">
          <Text style={styles.continueBtnText}>Done & Continue</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.white} />
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
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card - Similar to Swipe Card Design */}
        <View style={styles.card}>
          {/* Card Header with Avatar */}
          <View style={styles.cardHeader}>
            <View style={[styles.avatarLarge, { backgroundColor: AVATAR_COLORS[data.avatarId] || COLORS.primary }]}>
              <Ionicons
                name={(AVATAR_ICONS[data.avatarId] || 'person') as any}
                size={60}
                color={COLORS.white}
              />
            </View>
            
            {/* Name, Age, Gender, Location */}
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardName}>
                {data.name || 'Your Name'}{data.age > 0 ? `, ${data.age}` : ''}
              </Text>
              {isVisible('gender', true) && data.gender && (
                <Text style={styles.cardGender}>{data.gender}</Text>
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
          {isVisible('bio') && data.bio && (
            <View style={styles.section}>
              <Text style={styles.bioText}>"{data.bio}"</Text>
            </View>
          )}

          {/* Looking For */}
          {isVisible('relationshipIntent') && data.relationshipIntent && data.relationshipIntent.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="heart-outline" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Looking For</Text>
              </View>
              <View style={styles.tagsRow}>
                {data.relationshipIntent.map((item, i) => (
                  <View key={i} style={styles.tag}>
                    <Text style={styles.tagText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Favourite Genres */}
          {isVisible('genres') && data.genres && data.genres.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="film-outline" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Favourite Genres</Text>
              </View>
              <View style={styles.tagsRow}>
                {data.genres.map((genre, i) => (
                  <View key={i} style={styles.tag}>
                    <Text style={styles.tagText}>{genre}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Languages I Watch */}
          {isVisible('filmLanguages') && data.filmLanguages && data.filmLanguages.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="language-outline" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Languages I Watch</Text>
              </View>
              <View style={styles.tagsRow}>
                {data.filmLanguages.map((lang, i) => (
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
              {isVisible('movieFrequency') && data.movieFrequency && (
                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={16} color={COLORS.textMuted} />
                  <Text style={styles.infoText}>{data.movieFrequency}</Text>
                </View>
              )}
              {isVisible('ottTheatre') && data.ottTheatre && (
                <View style={styles.infoRow}>
                  <Ionicons name="tv-outline" size={16} color={COLORS.textMuted} />
                  <Text style={styles.infoText}>{data.ottTheatre}</Text>
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
                {isVisible('height') && data.height && (
                  <View style={styles.infoChip}>
                    <Ionicons name="resize-outline" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.infoChipText}>{data.height}</Text>
                  </View>
                )}
                {isVisible('religion') && data.religion && (
                  <View style={styles.infoChip}>
                    <Ionicons name="sparkles-outline" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.infoChipText}>{data.religion}</Text>
                  </View>
                )}
                {isVisible('maritalStatus') && data.maritalStatus && (
                  <View style={styles.infoChip}>
                    <Ionicons name="ellipse-outline" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.infoChipText}>{data.maritalStatus}</Text>
                  </View>
                )}
                {isVisible('foodPreference') && data.foodPreference && (
                  <View style={styles.infoChip}>
                    <Ionicons name="restaurant-outline" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.infoChipText}>{data.foodPreference}</Text>
                  </View>
                )}
                {isVisible('zodiac') && data.zodiac && (
                  <View style={styles.infoChip}>
                    <Ionicons name="moon-outline" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.infoChipText}>{data.zodiac}</Text>
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
                {isVisible('smoking') && data.smoking && (
                  <View style={styles.infoChip}>
                    <Text style={styles.infoChipText}>🚬 {data.smoking}</Text>
                  </View>
                )}
                {isVisible('drinking') && data.drinking && (
                  <View style={styles.infoChip}>
                    <Text style={styles.infoChipText}>🍷 {data.drinking}</Text>
                  </View>
                )}
                {isVisible('exercise') && data.exercise && (
                  <View style={styles.infoChip}>
                    <Text style={styles.infoChipText}>💪 {data.exercise}</Text>
                  </View>
                )}
                {isVisible('pets') && data.pets && (
                  <View style={styles.infoChip}>
                    <Text style={styles.infoChipText}>🐾 {data.pets}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Languages Spoken */}
          {isVisible('languagesSpoken') && data.languagesSpoken && data.languagesSpoken.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="chatbubble-outline" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Languages I Speak</Text>
              </View>
              <View style={styles.tagsRow}>
                {data.languagesSpoken.map((lang, i) => (
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
              {isVisible('workProfile') && data.workProfile && (
                <View style={styles.infoRow}>
                  <Ionicons name="business-outline" size={16} color={COLORS.textMuted} />
                  <Text style={styles.infoText}>{data.workProfile}</Text>
                </View>
              )}
              {isVisible('education') && data.education && (
                <View style={styles.infoRow}>
                  <Ionicons name="school-outline" size={16} color={COLORS.textMuted} />
                  <Text style={styles.infoText}>{data.education}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Bottom spacer */}
        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.m,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerBtnText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  editBtnText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.full,
  },
  continueBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
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
});
