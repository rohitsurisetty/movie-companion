import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../Avatar';
import { formatLocationForPrivacy } from '../../utils/locationFormatter';
import { API_BASE, COLORS, SCREEN_WIDTH, SCREEN_HEIGHT } from './theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export const ProfileBottomSheet: React.FC<Props> = ({ visible, onClose, userId, userName }) => {
  const [profile, setProfile] = useState<any>(null);
  const [pictures, setPictures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPicIndex, setCurrentPicIndex] = useState(0);

  useEffect(() => {
    if (visible && userId) {
      fetchProfileData();
    }
  }, [visible, userId]);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      const profileRes = await fetch(`${API_BASE}/api/user/profile/${userId}`);
      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.profile);
      }
      const picsRes = await fetch(`${API_BASE}/api/user/pictures/${userId}`);
      if (picsRes.ok) {
        const data = await picsRes.json();
        const pics = data.pictures || {};
        const photoArray = [pics.picture_1, pics.picture_2, pics.picture_3, pics.picture_4, pics.picture_5]
          .filter(Boolean);
        setPictures(photoArray);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
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
