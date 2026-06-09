import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { ProfileData, initialProfileData } from '../src/types';
import { getProfile } from '../src/store';

const VISIBILITY_KEY = 'visibility_settings';

type VisibilitySettings = {
  showAge: boolean;
  showLocation: boolean;
  showHeight: boolean;
  showReligion: boolean;
  showZodiac: boolean;
  showMoviePreferences: boolean;
  showTopMovies: boolean;
  showLifestyle: boolean;
  profileActive: boolean;
  showOnlineStatus: boolean;
};

const defaultVisibility: VisibilitySettings = {
  showAge: true,
  showLocation: true,
  showHeight: true,
  showReligion: true,
  showZodiac: true,
  showMoviePreferences: true,
  showTopMovies: true,
  showLifestyle: true,
  profileActive: true,
  showOnlineStatus: true,
};

const AVATAR_OPTIONS = [
  { id: 'av1', color: '#E50914', icon: 'person' as const },
  { id: 'av2', color: '#FFD700', icon: 'happy' as const },
  { id: 'av3', color: '#4CAF50', icon: 'leaf' as const },
  { id: 'av4', color: '#2196F3', icon: 'planet' as const },
  { id: 'av5', color: '#9C27B0', icon: 'star' as const },
  { id: 'av6', color: '#FF9800', icon: 'sunny' as const },
];

export default function ProfilePreviewScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData>(initialProfileData);
  const [visibility, setVisibility] = useState<VisibilitySettings>(defaultVisibility);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [savedProfile, savedVisibility] = await Promise.all([
        getProfile(),
        AsyncStorage.getItem(VISIBILITY_KEY),
      ]);
      if (savedProfile) setProfile(savedProfile);
      if (savedVisibility) setVisibility(JSON.parse(savedVisibility));
      setLoading(false);
    })();
  }, []);

  const avatar = AVATAR_OPTIONS.find(a => a.id === profile.avatar) || AVATAR_OPTIONS[0];
  
  // Safe access to arrays that might be undefined from backend
  const topMovies = Array.isArray(profile?.topMovies) ? profile.topMovies : [];

  const getAge = () => {
    if (!profile.dateOfBirth) return null;
    const today = new Date();
    const birth = new Date(profile.dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const formatHeight = () => {
    if (!profile.heightFeet) return null;
    return `${profile.heightFeet}'${profile.heightInches || 0}"`;
  };

  // Show hidden indicator for fields that are hidden
  const HiddenBadge = () => (
    <View style={styles.hiddenBadge}>
      <Ionicons name="eye-off" size={12} color={COLORS.textMuted} />
      <Text style={styles.hiddenText}>Hidden</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile Preview</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Profile Active Status */}
        {!visibility.profileActive && (
          <View style={styles.inactiveWarning}>
            <Ionicons name="warning-outline" size={20} color="#FF9800" />
            <Text style={styles.inactiveText}>Your profile is currently hidden from other users</Text>
          </View>
        )}

        {/* Preview Card */}
        <View style={styles.previewCard}>
          {/* Avatar with Online Status */}
          <View style={styles.avatarWrapper}>
            <View style={[styles.avatarContainer, { backgroundColor: avatar.color }]}>
              <Ionicons name={avatar.icon} size={60} color="white" />
            </View>
            {visibility.showOnlineStatus && (
              <View style={styles.onlineIndicator} />
            )}
          </View>

          {/* Name & Age */}
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile.name || 'Your Name'}</Text>
            {visibility.showAge && getAge() ? (
              <Text style={styles.age}>, {getAge()}</Text>
            ) : !visibility.showAge && getAge() ? (
              <HiddenBadge />
            ) : null}
          </View>

          {/* Location */}
          {profile.location && (
            visibility.showLocation ? (
              <View style={styles.locationRow}>
                <Ionicons name="location" size={16} color={COLORS.textMuted} />
                <Text style={styles.locationText}>{profile.location}</Text>
              </View>
            ) : (
              <View style={styles.locationRow}>
                <HiddenBadge />
              </View>
            )
          )}

          {/* Bio */}
          {profile.bio && (
            <Text style={styles.bio}>{profile.bio}</Text>
          )}

          {/* Quick Info Pills */}
          <View style={styles.pillsContainer}>
            {profile.gender && (
              <View style={styles.pill}>
                <Ionicons name="person-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pillText}>{profile.gender}</Text>
              </View>
            )}
            {visibility.showHeight && formatHeight() ? (
              <View style={styles.pill}>
                <Ionicons name="resize-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pillText}>{formatHeight()}</Text>
              </View>
            ) : !visibility.showHeight && formatHeight() ? (
              <View style={[styles.pill, styles.hiddenPill]}>
                <Ionicons name="resize-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.hiddenPillText}>Height hidden</Text>
              </View>
            ) : null}
            {profile.relationshipIntent && (
              <View style={styles.pill}>
                <Ionicons name="heart-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pillText}>{profile.relationshipIntent}</Text>
              </View>
            )}
            {visibility.showZodiac && profile.zodiac ? (
              <View style={styles.pill}>
                <Ionicons name="star-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pillText}>{profile.zodiac}</Text>
              </View>
            ) : !visibility.showZodiac && profile.zodiac ? (
              <View style={[styles.pill, styles.hiddenPill]}>
                <Ionicons name="star-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.hiddenPillText}>Zodiac hidden</Text>
              </View>
            ) : null}
            {visibility.showReligion && profile.religion ? (
              <View style={styles.pill}>
                <Ionicons name="heart-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pillText}>{profile.religion}</Text>
              </View>
            ) : !visibility.showReligion && profile.religion ? (
              <View style={[styles.pill, styles.hiddenPill]}>
                <Ionicons name="heart-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.hiddenPillText}>Religion hidden</Text>
              </View>
            ) : null}
          </View>

          {/* Movie Preferences */}
          {visibility.showMoviePreferences ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Movie Preferences</Text>
              <View style={styles.pillsContainer}>
                {profile.movieFrequency && (
                  <View style={styles.pill}>
                    <Ionicons name="film-outline" size={14} color={COLORS.accent} />
                    <Text style={styles.pillText}>{profile.movieFrequency}</Text>
                  </View>
                )}
                {profile.ottTheatre && (
                  <View style={styles.pill}>
                    <Ionicons name="tv-outline" size={14} color={COLORS.accent} />
                    <Text style={styles.pillText}>{profile.ottTheatre}</Text>
                  </View>
                )}
              </View>
              {profile.genres && profile.genres.length > 0 && (
                <View style={styles.tagsRow}>
                  {profile.genres.map(g => (
                    <View key={g} style={styles.tag}>
                      <Text style={styles.tagText}>{g}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.section}>
              <View style={styles.hiddenSection}>
                <Ionicons name="eye-off-outline" size={20} color={COLORS.textMuted} />
                <Text style={styles.hiddenSectionText}>Movie Preferences hidden</Text>
              </View>
            </View>
          )}

          {/* Top Movies */}
          {topMovies.length > 0 && (
            visibility.showTopMovies ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Favorite Movies</Text>
                <View style={styles.moviesRow}>
                  {topMovies.slice(0, 3).map((movie, idx) => (
                    <View key={idx} style={styles.movieCard}>
                      {movie.poster ? (
                        <Image source={{ uri: movie.poster }} style={styles.moviePoster} />
                      ) : (
                        <View style={[styles.moviePoster, styles.moviePlaceholder]}>
                          <Ionicons name="film" size={24} color={COLORS.textMuted} />
                        </View>
                      )}
                      <Text style={styles.movieTitle} numberOfLines={2}>{movie.title}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.section}>
                <View style={styles.hiddenSection}>
                  <Ionicons name="eye-off-outline" size={20} color={COLORS.textMuted} />
                  <Text style={styles.hiddenSectionText}>Favorite Movies hidden</Text>
                </View>
              </View>
            )
          )}

          {/* Lifestyle */}
          {visibility.showLifestyle ? (
            (profile.smoking || profile.drinking || profile.exercise) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Lifestyle</Text>
                <View style={styles.pillsContainer}>
                  {profile.smoking && (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{profile.smoking}</Text>
                    </View>
                  )}
                  {profile.drinking && (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{profile.drinking}</Text>
                    </View>
                  )}
                  {profile.exercise && (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{profile.exercise}</Text>
                    </View>
                  )}
                </View>
              </View>
            )
          ) : (profile.smoking || profile.drinking || profile.exercise) && (
            <View style={styles.section}>
              <View style={styles.hiddenSection}>
                <Ionicons name="eye-off-outline" size={20} color={COLORS.textMuted} />
                <Text style={styles.hiddenSectionText}>Lifestyle hidden</Text>
              </View>
            </View>
          )}

          {/* Languages */}
          {profile.languagesSpoken && profile.languagesSpoken.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Languages</Text>
              <View style={styles.tagsRow}>
                {profile.languagesSpoken.map(l => (
                  <View key={l} style={styles.tag}>
                    <Text style={styles.tagText}>{l}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Info Note */}
        <View style={styles.infoNote}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.textMuted} />
          <Text style={styles.infoText}>
            This is how your profile appears to potential matches. 
            {'\n'}Fields marked "Hidden" are controlled by your visibility settings.
          </Text>
        </View>

        {/* Edit Visibility Button */}
        <TouchableOpacity 
          style={styles.editVisibilityBtn} 
          onPress={() => router.push('/visibility')}
        >
          <Ionicons name="eye-outline" size={20} color={COLORS.primary} />
          <Text style={styles.editVisibilityText}>Edit Visibility Settings</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  placeholder: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.m, paddingBottom: 100 },
  inactiveWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,152,0,0.15)',
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
    gap: SPACING.s,
  },
  inactiveText: { flex: 1, fontSize: 13, color: '#FF9800' },
  previewCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.l,
    alignItems: 'center',
  },
  avatarWrapper: { position: 'relative', marginBottom: SPACING.m },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
    borderWidth: 3,
    borderColor: COLORS.bgCard,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  name: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  age: { fontSize: 24, color: COLORS.textSecondary, marginLeft: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs },
  locationText: { fontSize: 14, color: COLORS.textMuted, marginLeft: 4 },
  bio: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.m,
    lineHeight: 22,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: SPACING.m,
    gap: SPACING.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229,9,20,0.1)',
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: 4,
  },
  pillText: { fontSize: 13, color: COLORS.text },
  hiddenPill: {
    backgroundColor: 'rgba(128,128,128,0.2)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  hiddenPillText: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },
  hiddenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(128,128,128,0.2)',
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.s,
    marginLeft: SPACING.xs,
    gap: 2,
  },
  hiddenText: { fontSize: 10, color: COLORS.textMuted },
  section: {
    width: '100%',
    marginTop: SPACING.l,
    paddingTop: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: SPACING.s,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hiddenSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
    gap: SPACING.s,
  },
  hiddenSectionText: { fontSize: 14, color: COLORS.textMuted, fontStyle: 'italic' },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  tag: {
    backgroundColor: COLORS.bgDark,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.m,
  },
  tagText: { fontSize: 13, color: COLORS.text },
  moviesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.s,
  },
  movieCard: { alignItems: 'center', width: 80 },
  moviePoster: {
    width: 70,
    height: 100,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.bgDark,
  },
  moviePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  movieTitle: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center', marginTop: 4 },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: SPACING.l,
    gap: SPACING.xs,
    paddingHorizontal: SPACING.s,
  },
  infoText: { flex: 1, fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
  editVisibilityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229,9,20,0.1)',
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
    marginTop: SPACING.m,
    gap: SPACING.s,
  },
  editVisibilityText: { fontSize: 15, fontWeight: '500', color: COLORS.primary },
});
