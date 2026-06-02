import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  Dimensions, ActivityIndicator, RefreshControl, FlatList, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppMode } from '../../src/components/SharedHeader';
import { getUserId } from '../../src/store';
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TILE_GAP = 12;
const TILE_WIDTH = (SCREEN_WIDTH - 32 - TILE_GAP) / 2; // 16 padding on each side + gap between
const TILE_HEIGHT = TILE_WIDTH * 1.35; // Aspect ratio for profile tiles
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  primary: '#E50914',
  primaryDark: '#B5070F',
  accent: '#FF6B6B',
  buddy: '#2196F3',
  bg: '#0A0A0A',
  bgCard: '#1A1A1A',
  bgSheet: '#1C1C1E',
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#666666',
  border: '#2A2A2A',
  success: '#00D26A',
  gold: '#FFD700',
};

const AVATAR_COLORS = ['#E50914', '#FFD700', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800'];

interface MatchProfile {
  user_id: string;
  name: string;
  age: number;
  gender: string;
  location: string;
  avatar?: string;
  bio: string;
  genres: string[];
  topMovies: { title: string; tmdb_id?: number }[];
  filmLanguages: string[];
  languagesSpoken: string[];
  movieFrequency: string;
  ottTheatre: string;
  match_level: string;
  explanation: string;
  shared_interests: string[];
  compatibility_score: number;
  relationshipIntent?: string[];
  zodiac?: string;
  smoking?: string;
  drinking?: string;
  exercise?: string;
  education?: string;
  workProfile?: string;
  pictures?: {
    picture_1?: string;
    picture_2?: string;
    picture_3?: string;
    picture_4?: string;
    picture_5?: string;
  };
  swipe_history?: {
    liked_genres?: string[];
    liked_actors?: string[];
    liked_directors?: string[];
  };
}

// ============ MATCH BADGE COMPONENT ============
const MatchBadge = ({ level, score }: { level: string; score: number }) => {
  const getBadgeStyle = () => {
    switch (level.toLowerCase()) {
      case 'perfect match':
        return { bg: ['#FFD700', '#FFA500'], icon: 'star', text: 'Perfect' };
      case 'great match':
        return { bg: ['#00D26A', '#00A854'], icon: 'heart', text: 'Great' };
      case 'good match':
        return { bg: ['#2196F3', '#1976D2'], icon: 'thumbs-up', text: 'Good' };
      default:
        return { bg: ['#9C27B0', '#7B1FA2'], icon: 'sparkles', text: 'Potential' };
    }
  };

  const style = getBadgeStyle();

  return (
    <LinearGradient colors={style.bg as any} style={styles.matchBadge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
      <Ionicons name={style.icon as any} size={10} color="#FFF" />
      <Text style={styles.matchBadgeText}>{style.text}</Text>
    </LinearGradient>
  );
};

// ============ PROFILE TILE COMPONENT ============
const ProfileTile = ({ 
  profile, 
  onPress, 
  index,
  mode 
}: { 
  profile: MatchProfile; 
  onPress: () => void;
  index: number;
  mode: string;
}) => {
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

  // Fetch profile picture
  useEffect(() => {
    const fetchPicture = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/user/pictures/${profile.user_id}`);
        if (response.ok) {
          const data = await response.json();
          if (data.pictures?.picture_1) {
            setProfilePicture(data.pictures.picture_1);
          }
        }
      } catch (error) {
        console.log('Error fetching picture:', error);
      }
    };
    fetchPicture();
  }, [profile.user_id]);

  return (
    <TouchableOpacity 
      style={styles.tile} 
      onPress={onPress}
      activeOpacity={0.9}
    >
      {/* Photo/Avatar */}
      <View style={styles.tilePhotoContainer}>
        {profilePicture ? (
          <Image source={{ uri: profilePicture }} style={styles.tilePhoto} />
        ) : (
          <LinearGradient
            colors={[avatarColor, `${avatarColor}99`]}
            style={styles.tileAvatar}
          >
            <Text style={styles.tileAvatarText}>
              {profile.name.charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
        )}
        
        {/* Gradient overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.tileGradient}
        />
        
        {/* Match Badge */}
        <View style={styles.tileBadgeContainer}>
          <MatchBadge level={profile.match_level} score={profile.compatibility_score} />
        </View>
        
        {/* Name & Age overlay */}
        <View style={styles.tileInfo}>
          <Text style={styles.tileName} numberOfLines={1}>
            {profile.name}, {profile.age}
          </Text>
          <View style={styles.tileLocationRow}>
            <Ionicons name="location" size={10} color={COLORS.textSecondary} />
            <Text style={styles.tileLocation} numberOfLines={1}>{profile.location}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ============ PHOTO CAROUSEL FOR BOTTOM SHEET ============
const ExpandedPhotoCarousel = ({ 
  photos, 
  name, 
  avatarColor 
}: { 
  photos: string[]; 
  name: string; 
  avatarColor: string;
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const PHOTO_HEIGHT = SCREEN_HEIGHT * 0.4;

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  // If no photos, show avatar placeholder
  if (photos.length === 0) {
    return (
      <View style={[styles.expandedPhotoContainer, { height: PHOTO_HEIGHT }]}>
        <LinearGradient
          colors={[avatarColor, `${avatarColor}88`]}
          style={styles.expandedAvatarPlaceholder}
        >
          <Text style={styles.expandedAvatarText}>{name.charAt(0).toUpperCase()}</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={[styles.expandedPhotoContainer, { height: PHOTO_HEIGHT }]}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {photos.map((photo, index) => (
          <Image
            key={index}
            source={{ uri: photo }}
            style={[styles.expandedPhoto, { width: SCREEN_WIDTH, height: PHOTO_HEIGHT }]}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
      
      {/* Photo indicators */}
      {photos.length > 1 && (
        <View style={styles.photoIndicators}>
          {photos.map((_, index) => (
            <View
              key={index}
              style={[
                styles.photoIndicator,
                currentIndex === index && styles.photoIndicatorActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// ============ LOADING STATE ============
const LoadingState = ({ mode }: { mode: string }) => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={mode === 'date' ? COLORS.primary : COLORS.buddy} />
    <Text style={styles.loadingText}>Finding your matches...</Text>
    <Text style={styles.loadingSubtext}>Our AI is analyzing movie tastes</Text>
  </View>
);

// ============ EMPTY STATE ============
const EmptyState = ({ mode, onRefresh }: { mode: string; onRefresh: () => void }) => (
  <View style={styles.emptyContainer}>
    <Ionicons 
      name={mode === 'date' ? 'heart-outline' : 'people-outline'} 
      size={64} 
      color={COLORS.textMuted} 
    />
    <Text style={styles.emptyTitle}>No matches yet</Text>
    <Text style={styles.emptySubtitle}>
      Complete your profile and movie preferences to get better matches
    </Text>
    <TouchableOpacity 
      style={[styles.refreshButton, { backgroundColor: mode === 'date' ? COLORS.primary : COLORS.buddy }]}
      onPress={onRefresh}
    >
      <Text style={styles.refreshButtonText}>Refresh Matches</Text>
    </TouchableOpacity>
  </View>
);

// ============ MAIN FEED SCREEN ============
export default function FeedScreen() {
  const { mode } = useAppMode();
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<MatchProfile | null>(null);
  const [selectedProfilePhotos, setSelectedProfilePhotos] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['85%'], []);

  // Fetch matches from API
  const fetchMatches = async (forceRefresh = false) => {
    try {
      const userId = await getUserId();
      const response = await fetch(`${API_BASE}/api/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          limit: 20,
          force_refresh: forceRefresh,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMatches(data.matches || []);
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMatches(true); // Force refresh to bypass cache
  }, []);

  // Open profile in bottom sheet
  const openProfile = async (profile: MatchProfile, index: number) => {
    setSelectedProfile(profile);
    setSelectedIndex(index);
    
    // Fetch all photos for this profile
    try {
      const response = await fetch(`${API_BASE}/api/user/pictures/${profile.user_id}`);
      if (response.ok) {
        const data = await response.json();
        const pics = data.pictures || {};
        const photoArray = [pics.picture_1, pics.picture_2, pics.picture_3, pics.picture_4, pics.picture_5]
          .filter(Boolean);
        setSelectedProfilePhotos(photoArray);
      } else {
        setSelectedProfilePhotos([]);
      }
    } catch (error) {
      setSelectedProfilePhotos([]);
    }
    
    bottomSheetRef.current?.expand();
  };

  const closeProfile = () => {
    bottomSheetRef.current?.close();
    setSelectedProfile(null);
  };

  const handleMessage = () => {
    // TODO: Navigate to chat
    console.log('Message:', selectedProfile?.name);
    closeProfile();
  };

  // Render backdrop
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.7}
      />
    ),
    []
  );

  // Loading state
  if (loading) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {mode === 'date' ? 'Matches' : 'Movie Buddies'}
            </Text>
            <Text style={styles.headerSubtitle}>Finding compatible profiles...</Text>
          </View>
          <LoadingState mode={mode} />
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  const avatarColor = selectedProfile ? AVATAR_COLORS[selectedIndex % AVATAR_COLORS.length] : COLORS.primary;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {mode === 'date' ? 'Matches' : 'Movie Buddies'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {matches.length > 0 
              ? `${matches.length} compatible ${mode === 'date' ? 'dates' : 'buddies'}`
              : 'Discover your matches'
            }
          </Text>
        </View>

        {/* Grid of profile tiles */}
        {matches.length === 0 ? (
          <EmptyState mode={mode} onRefresh={handleRefresh} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.gridContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={mode === 'date' ? COLORS.primary : COLORS.buddy}
              />
            }
          >
            <View style={styles.gridWrapper}>
              {matches.map((item, index) => (
                <ProfileTile
                  key={item.user_id}
                  profile={item}
                  index={index}
                  mode={mode}
                  onPress={() => openProfile(item, index)}
                />
              ))}
            </View>
          </ScrollView>
        )}

        {/* Bottom Sheet for expanded profile */}
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          backgroundStyle={styles.bottomSheetBackground}
          handleIndicatorStyle={styles.bottomSheetHandle}
          onChange={(index) => {
            if (index === -1) {
              setSelectedProfile(null);
            }
          }}
        >
          {selectedProfile && (
            <BottomSheetScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {/* Photo Carousel */}
              <ExpandedPhotoCarousel
                photos={selectedProfilePhotos}
                name={selectedProfile.name}
                avatarColor={avatarColor}
              />

              {/* Profile Info */}
              <View style={styles.profileInfo}>
                {/* Name & Basic Info */}
                <View style={styles.nameSection}>
                  <View style={styles.nameRow}>
                    <Text style={styles.profileName}>{selectedProfile.name}</Text>
                    <Text style={styles.profileAge}>, {selectedProfile.age}</Text>
                    {selectedProfile.workProfile && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.buddy} style={{ marginLeft: 6 }} />
                    )}
                  </View>
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.locationText}>{selectedProfile.location}</Text>
                    {selectedProfile.workProfile && (
                      <>
                        <Text style={styles.dotSeparator}>•</Text>
                        <Ionicons name="briefcase-outline" size={14} color={COLORS.textSecondary} />
                        <Text style={styles.locationText}>{selectedProfile.workProfile}</Text>
                      </>
                    )}
                  </View>
                </View>

                {/* Match Badge */}
                <View style={styles.matchSection}>
                  <MatchBadge level={selectedProfile.match_level} score={selectedProfile.compatibility_score} />
                  <Text style={styles.matchScore}>{selectedProfile.compatibility_score}% Match</Text>
                </View>

                {/* Bio */}
                {selectedProfile.bio && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>About</Text>
                    <Text style={styles.bioText}>{selectedProfile.bio}</Text>
                  </View>
                )}

                {/* AI Match Explanation */}
                {selectedProfile.explanation && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Why You Match</Text>
                    <View style={styles.explanationCard}>
                      <Ionicons name="sparkles" size={16} color={COLORS.gold} />
                      <Text style={styles.explanationText}>{selectedProfile.explanation}</Text>
                    </View>
                  </View>
                )}

                {/* Shared Interests */}
                {selectedProfile.shared_interests && selectedProfile.shared_interests.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Shared Interests</Text>
                    <View style={styles.tagsContainer}>
                      {selectedProfile.shared_interests.map((interest, idx) => (
                        <View key={idx} style={styles.tag}>
                          <Ionicons name="heart" size={12} color={COLORS.primary} />
                          <Text style={styles.tagText}>{interest}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Movie Preferences */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Movie Taste</Text>
                  <View style={styles.tagsContainer}>
                    {selectedProfile.genres?.slice(0, 5).map((genre, idx) => (
                      <View key={idx} style={styles.genreTag}>
                        <Text style={styles.genreTagText}>{genre}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Top Movies */}
                {selectedProfile.topMovies && selectedProfile.topMovies.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Favorite Movies</Text>
                    {selectedProfile.topMovies.slice(0, 3).map((movie, idx) => (
                      <View key={idx} style={styles.movieItem}>
                        <Ionicons name="film-outline" size={16} color={COLORS.textSecondary} />
                        <Text style={styles.movieTitle}>{movie.title}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Message Button */}
                <TouchableOpacity
                  style={[styles.messageButton, { backgroundColor: mode === 'date' ? COLORS.primary : COLORS.buddy }]}
                  onPress={handleMessage}
                >
                  <Ionicons name="chatbubble" size={20} color="#FFF" />
                  <Text style={styles.messageButtonText}>Send Message</Text>
                </TouchableOpacity>

                {/* Bottom spacing */}
                <View style={{ height: 40 }} />
              </View>
            </BottomSheetScrollView>
          )}
        </BottomSheet>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  
  // Header
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  // Loading State
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 20,
  },
  loadingSubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  refreshButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  refreshButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },

  // Grid Layout
  gridContainer: {
    padding: 16,
    paddingBottom: 100, // Extra padding for bottom nav
  },
  gridWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: TILE_GAP,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  // Profile Tile
  tile: {
    width: '48%', // Use percentage for better web compatibility
    aspectRatio: 0.75, // This creates a nice portrait ratio
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.bgCard,
    marginBottom: 12,
  },
  tilePhotoContainer: {
    flex: 1,
    position: 'relative',
  },
  tilePhoto: {
    width: '100%',
    height: '100%',
  },
  tileAvatar: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileAvatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFF',
  },
  tileGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  tileBadgeContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  tileInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
  },
  tileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  tileLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  tileLocation: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },

  // Match Badge
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  matchBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },

  // Bottom Sheet
  bottomSheetBackground: {
    backgroundColor: COLORS.bgSheet,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  bottomSheetHandle: {
    backgroundColor: COLORS.textMuted,
    width: 40,
  },
  sheetContent: {
    flex: 1,
  },

  // Expanded Photo Carousel
  expandedPhotoContainer: {
    width: SCREEN_WIDTH,
    position: 'relative',
  },
  expandedPhoto: {
    backgroundColor: COLORS.bgCard,
  },
  expandedAvatarPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedAvatarText: {
    fontSize: 80,
    fontWeight: 'bold',
    color: '#FFF',
  },
  photoIndicators: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  photoIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  photoIndicatorActive: {
    backgroundColor: '#FFF',
    width: 24,
  },

  // Profile Info
  profileInfo: {
    padding: 20,
  },
  nameSection: {
    marginBottom: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  profileName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  profileAge: {
    fontSize: 24,
    color: COLORS.textSecondary,
    fontWeight: '300',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  locationText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  dotSeparator: {
    color: COLORS.textMuted,
    marginHorizontal: 4,
  },

  // Match Section
  matchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  matchScore: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.success,
  },

  // Sections
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
  },
  bioText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },

  // Explanation Card
  explanationCard: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  explanationText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },

  // Tags
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  tagText: {
    fontSize: 13,
    color: COLORS.text,
  },
  genreTag: {
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  genreTagText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // Movie Item
  movieItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  movieTitle: {
    fontSize: 14,
    color: COLORS.text,
  },

  // Message Button
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 28,
    marginTop: 20,
    gap: 10,
  },
  messageButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
});
