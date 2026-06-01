import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { ProfileData, initialProfileData } from '../src/types';
import { getProfile } from '../src/store';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const saved = await getProfile();
      if (saved) setProfile(saved);
      setLoading(false);
    })();
  }, []);

  const avatar = AVATAR_OPTIONS.find(a => a.id === profile.avatar) || AVATAR_OPTIONS[0];

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile Preview</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Preview Card */}
        <View style={styles.previewCard}>
          {/* Avatar */}
          <View style={[styles.avatarContainer, { backgroundColor: avatar.color }]}>
            <Ionicons name={avatar.icon} size={60} color="white" />
          </View>

          {/* Name & Age */}
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile.name || 'Your Name'}</Text>
            {getAge() && <Text style={styles.age}>, {getAge()}</Text>}
          </View>

          {/* Location */}
          {profile.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color={COLORS.textMuted} />
              <Text style={styles.locationText}>{profile.location}</Text>
            </View>
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
            {formatHeight() && (
              <View style={styles.pill}>
                <Ionicons name="resize-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pillText}>{formatHeight()}</Text>
              </View>
            )}
            {profile.relationshipIntent && (
              <View style={styles.pill}>
                <Ionicons name="heart-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pillText}>{profile.relationshipIntent}</Text>
              </View>
            )}
            {profile.zodiac && (
              <View style={styles.pill}>
                <Ionicons name="star-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pillText}>{profile.zodiac}</Text>
              </View>
            )}
          </View>

          {/* Movie Preferences */}
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

          {/* Top Movies */}
          {profile.topMovies && profile.topMovies.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Favorite Movies</Text>
              <View style={styles.moviesRow}>
                {profile.topMovies.slice(0, 3).map((movie, idx) => (
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
          <Text style={styles.infoText}>This is how your profile appears to potential matches</Text>
        </View>
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
  previewCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.l,
    alignItems: 'center',
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.m,
  },
  nameRow: { flexDirection: 'row', alignItems: 'baseline' },
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
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.l,
    gap: SPACING.xs,
  },
  infoText: { fontSize: 13, color: COLORS.textMuted },
});