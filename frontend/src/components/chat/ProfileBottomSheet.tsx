import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../Avatar';
import { normalizePictures } from '../PremiumProfileView';
import { formatLocationForPrivacy } from '../../utils/locationFormatter';
import { apiUrl } from '../../store';
import { COLORS, SCREEN_WIDTH, SCREEN_HEIGHT } from './theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

const profileErrorMessage = (status?: number) => {
  if (status === 404) return 'This profile is no longer available.';
  if (status === 429) return 'Too many requests. Please try again shortly.';
  return "Couldn't load this profile. Check your connection and try again.";
};

export const ProfileBottomSheet: React.FC<Props> = ({ visible, onClose, userId, userName }) => {
  const [profile, setProfile] = useState<any>(null);
  const [pictures, setPictures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPicIndex, setCurrentPicIndex] = useState(0);

  useEffect(() => {
    if (visible && userId) {
      fetchProfileData();
    }
  }, [visible, userId]);

  const fetchProfileData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [profileRes, picsRes] = await Promise.all([
        fetch(apiUrl(`/api/user/profile/${encodeURIComponent(userId)}`)),
        // Photos are optional: a failure here just means no photos.
        fetch(apiUrl(`/api/user/pictures/${encodeURIComponent(userId)}`)).catch(() => null),
      ]);
      if (!profileRes.ok) {
        setProfile(null);
        setPictures([]);
        setLoadError(profileErrorMessage(profileRes.status));
        return;
      }
      const data = await profileRes.json();
      const picsData = picsRes?.ok ? await picsRes.json().catch(() => null) : null;
      setProfile(data?.profile || null);
      // Pictures may be string[] or the legacy { picture_1 … picture_5 } object.
      const photos = normalizePictures(picsData?.pictures);
      setPictures(photos.length > 0 ? photos : normalizePictures(data?.profile?.pictures));
      setCurrentPicIndex(0);
    } catch {
      setLoadError(profileErrorMessage());
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.profileModal}>
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={onClose} style={styles.profileCloseBtn}>
            <Ionicons name="chevron-down" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.profileHeaderTitle}>Profile</Text>
          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <View style={styles.profileLoading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : loadError ? (
          <View style={styles.profileLoading}>
            <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchProfileData}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={styles.profileContent} showsVerticalScrollIndicator={false}>
            <View style={styles.photoCarousel}>
              {pictures.length > 0 ? (
                <>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={(e) => {
                      const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                      setCurrentPicIndex(index);
                    }}
                    scrollEventThrottle={16}
                  >
                    {pictures.map((pic, index) => (
                      <Image key={index} source={{ uri: pic }} style={styles.profilePhoto} resizeMode="cover" />
                    ))}
                  </ScrollView>
                  {pictures.length > 1 && (
                    <View style={styles.photoIndicators}>
                      {pictures.map((_, index) => (
                        <View
                          key={index}
                          style={[styles.photoIndicator, currentPicIndex === index && styles.photoIndicatorActive]}
                        />
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.noPhotoPlaceholder}>
                  <Avatar name={userName} size={120} />
                </View>
              )}
            </View>

            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {profile?.name || userName}{profile?.age ? `, ${profile.age}` : ''}
              </Text>

              {profile?.location && (
                <View style={styles.profileLocationRow}>
                  <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.profileLocation}>{formatLocationForPrivacy(profile.location)}</Text>
                </View>
              )}

              {profile?.workProfile && (
                <View style={styles.profileLocationRow}>
                  <Ionicons name="briefcase-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.profileLocation}>{profile.workProfile}</Text>
                </View>
              )}

              {profile?.bio && <Text style={styles.profileBio}>{profile.bio}</Text>}

              {profile?.genres && profile.genres.length > 0 && (
                <View style={styles.profileSection}>
                  <Text style={styles.profileSectionTitle}>Movie Taste</Text>
                  <View style={styles.tagsContainer}>
                    {profile.genres.map((genre: string, idx: number) => (
                      <View key={idx} style={styles.tag}>
                        <Text style={styles.tagText}>{genre}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {Array.isArray(profile?.topMovies) && profile.topMovies.length > 0 && (
                <View style={styles.profileSection}>
                  <Text style={styles.profileSectionTitle}>Favorite Movies</Text>
                  {profile.topMovies.slice(0, 5).map((movie: any, idx: number) => (
                    <View key={idx} style={styles.movieItem}>
                      <Ionicons name="film-outline" size={18} color={COLORS.primary} />
                      <Text style={styles.movieTitle}>{movie.title}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  profileModal: { flex: 1, backgroundColor: COLORS.bg },
  profileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  profileCloseBtn: { padding: 8 },
  profileHeaderTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  profileLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12, paddingHorizontal: 32, lineHeight: 22 },
  retryBtn: { marginTop: 20, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, backgroundColor: COLORS.primary },
  retryBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  profileContent: { flex: 1 },
  photoCarousel: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.45 },
  profilePhoto: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.45 },
  noPhotoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bgCard },
  photoIndicators: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  photoIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  photoIndicatorActive: { backgroundColor: '#FFF', width: 24 },
  profileInfo: { padding: 20 },
  profileName: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  profileLocationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  profileLocation: { fontSize: 14, color: COLORS.textSecondary },
  profileBio: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22, marginTop: 16 },
  profileSection: { marginTop: 24 },
  profileSectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: COLORS.bgCard, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  tagText: { fontSize: 13, color: COLORS.text },
  movieItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  movieTitle: { fontSize: 15, color: COLORS.text },
});
