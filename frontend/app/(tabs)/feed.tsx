import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  Dimensions, ActivityIndicator, RefreshControl, Animated, PanResponder,
  TextInput, KeyboardAvoidingView, Platform, Modal, FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppMode } from '../../src/components/SharedHeader';
import { getUserId } from '../../src/store';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_HEIGHT = SCREEN_HEIGHT * 0.72;
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  primary: '#E50914',
  primaryDark: '#B5070F',
  accent: '#FF6B6B',
  buddy: '#2196F3',
  bg: '#0A0A0A',
  bgCard: '#1A1A1A',
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

// Photo Carousel Component
const PhotoCarousel = ({ 
  photos, 
  name, 
  avatarColor,
  onPhotoChange 
}: { 
  photos: string[]; 
  name: string;
  avatarColor: string;
  onPhotoChange?: (index: number) => void;
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = (event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / SCREEN_WIDTH);
    if (index !== currentIndex) {
      setCurrentIndex(index);
      onPhotoChange?.(index);
    }
  };

  // If no photos, show avatar placeholder
  if (photos.length === 0) {
    return (
      <View style={styles.photoContainer}>
        <View style={[styles.avatarPlaceholder, { backgroundColor: avatarColor }]}>
          <Ionicons name="person" size={120} color="rgba(255,255,255,0.8)" />
          <Text style={styles.avatarName}>{name?.charAt(0) || '?'}</Text>
        </View>
        {/* Gradient overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.9)']}
          style={styles.photoGradient}
        />
      </View>
    );
  }

  return (
    <View style={styles.photoContainer}>
      <ScrollView
        ref={scrollRef}
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
            style={styles.photo}
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
                currentIndex === index && styles.photoIndicatorActive
              ]}
            />
          ))}
        </View>
      )}
      
      {/* Gradient overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.95)']}
        style={styles.photoGradient}
      />
    </View>
  );
};

// Match Badge Component
const MatchBadge = ({ level, score }: { level: string; score: number }) => {
  const getStyle = () => {
    switch (level) {
      case 'Perfect Match':
        return { bg: COLORS.primary, icon: 'flame' as const, text: 'Perfect Match' };
      case 'Great Match':
        return { bg: COLORS.success, icon: 'star' as const, text: 'Great Match' };
      case 'Good Match':
        return { bg: COLORS.buddy, icon: 'heart' as const, text: 'Good Match' };
      default:
        return { bg: COLORS.gold, icon: 'sparkles' as const, text: 'Potential' };
    }
  };
  const style = getStyle();

  return (
    <View style={[styles.matchBadge, { backgroundColor: style.bg }]}>
      <Ionicons name={style.icon} size={14} color="white" />
      <Text style={styles.matchBadgeText}>{style.text}</Text>
    </View>
  );
};

// Profile Card Component - Full Dating App Style
const ProfileCard = ({ 
  profile, 
  onMessage,
  isExpanded,
  onToggleExpand,
}: { 
  profile: MatchProfile;
  onMessage: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) => {
  const avatarColorIndex = profile.name?.charCodeAt(0) % AVATAR_COLORS.length || 0;
  const avatarColor = AVATAR_COLORS[avatarColorIndex];
  
  // Get photos array
  const photos: string[] = [];
  if (profile.pictures) {
    for (let i = 1; i <= 5; i++) {
      const pic = profile.pictures[`picture_${i}` as keyof typeof profile.pictures];
      if (pic) photos.push(pic);
    }
  }

  return (
    <View style={styles.cardContainer}>
      {/* Photo Section with overlay */}
      <View style={styles.photoSection}>
        <PhotoCarousel 
          photos={photos} 
          name={profile.name}
          avatarColor={avatarColor}
        />
        
        {/* Profile Info Overlay - inside photoSection for correct positioning */}
        <View style={styles.profileOverlay}>
          {/* Name, Age, Location */}
          <View style={styles.basicInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.profileName}>{profile.name}</Text>
              <Text style={styles.profileAge}>, {profile.age}</Text>
              {profile.workProfile && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.buddy} />
                </View>
              )}
            </View>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color={COLORS.textSecondary} />
              <Text style={styles.locationText}>{profile.location}</Text>
              {profile.workProfile && (
                <>
                  <Text style={styles.dotSeparator}>•</Text>
                  <Ionicons name="briefcase-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.locationText}>{profile.workProfile}</Text>
                </>
              )}
            </View>
          </View>

          {/* Match Badge */}
          <MatchBadge level={profile.match_level} score={profile.compatibility_score} />
        </View>
      </View>

      {/* Expandable Content */}
      <ScrollView 
        style={styles.detailsScroll}
        contentContainerStyle={styles.detailsContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Why You Match - AI Generated */}
        <View style={styles.matchReasonCard}>
          <View style={styles.matchReasonHeader}>
            <Ionicons name="sparkles" size={18} color={COLORS.primary} />
            <Text style={styles.matchReasonTitle}>Why You'd Click</Text>
          </View>
          <Text style={styles.matchReasonText}>{profile.explanation}</Text>
          {profile.shared_interests && profile.shared_interests.length > 0 && (
            <View style={styles.sharedInterests}>
              {profile.shared_interests.slice(0, 3).map((interest, idx) => (
                <View key={idx} style={styles.interestChip}>
                  <Text style={styles.interestChipText}>{interest}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Bio */}
        {profile.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        )}

        {/* Movie Taste */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Movie Taste</Text>
          <View style={styles.tagsContainer}>
            {profile.genres?.slice(0, 5).map((genre, idx) => (
              <View key={idx} style={styles.genreTag}>
                <Ionicons name="film" size={12} color={COLORS.primary} />
                <Text style={styles.genreTagText}>{genre}</Text>
              </View>
            ))}
          </View>
          {profile.topMovies && profile.topMovies.length > 0 && (
            <View style={styles.favMovies}>
              <Text style={styles.favMoviesLabel}>Favorites:</Text>
              <Text style={styles.favMoviesText}>
                {profile.topMovies.slice(0, 3).map(m => m.title).join(' • ')}
              </Text>
            </View>
          )}
        </View>

        {/* Favorite Directors */}
        {profile.swipe_history?.liked_directors && profile.swipe_history.liked_directors.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Favorite Directors</Text>
            <View style={styles.tagsContainer}>
              {profile.swipe_history.liked_directors.slice(0, 4).map((director, idx) => (
                <View key={idx} style={styles.directorTag}>
                  <Ionicons name="videocam" size={12} color={COLORS.buddy} />
                  <Text style={styles.directorTagText}>{director}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Lifestyle Quick Facts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lifestyle</Text>
          <View style={styles.lifestyleGrid}>
            {profile.zodiac && (
              <View style={styles.lifestyleItem}>
                <Ionicons name="star-outline" size={20} color={COLORS.textMuted} />
                <Text style={styles.lifestyleValue}>{profile.zodiac}</Text>
              </View>
            )}
            {profile.movieFrequency && (
              <View style={styles.lifestyleItem}>
                <Ionicons name="calendar-outline" size={20} color={COLORS.textMuted} />
                <Text style={styles.lifestyleValue}>{profile.movieFrequency}</Text>
              </View>
            )}
            {profile.ottTheatre && (
              <View style={styles.lifestyleItem}>
                <Ionicons name="tv-outline" size={20} color={COLORS.textMuted} />
                <Text style={styles.lifestyleValue}>{profile.ottTheatre}</Text>
              </View>
            )}
            {profile.drinking && (
              <View style={styles.lifestyleItem}>
                <Ionicons name="wine-outline" size={20} color={COLORS.textMuted} />
                <Text style={styles.lifestyleValue}>{profile.drinking}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Languages */}
        {profile.filmLanguages && profile.filmLanguages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Film Languages</Text>
            <Text style={styles.languagesText}>
              {profile.filmLanguages.join(' • ')}
            </Text>
          </View>
        )}

        {/* Bottom padding for scroll */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Message Button - Fixed at Bottom */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.messageButton} onPress={onMessage}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            style={styles.messageButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="chatbubble-ellipses" size={22} color="white" />
            <Text style={styles.messageButtonText}>Send Message</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Loading Skeleton - Simple Spinner with text
const LoadingState = ({ mode }: { mode: string }) => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={mode === 'date' ? COLORS.primary : COLORS.buddy} />
    <Text style={styles.loadingText}>Finding your matches...</Text>
    <Text style={styles.loadingSubtext}>Our AI is analyzing movie tastes</Text>
  </View>
);

// Main Feed Screen
export default function FeedScreen() {
  const { mode, colors } = useAppMode();
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<MatchProfile | null>(null);
  const [messageText, setMessageText] = useState('');
  const insets = useSafeAreaInsets();

  const themeColor = mode === 'date' ? COLORS.primary : COLORS.buddy;

  const fetchMatches = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);

    try {
      const userId = await getUserId();
      const response = await fetch(`${API_BASE}/api/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId || 'guest_user',
          limit: 15,
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch matches');

      const data = await response.json();
      
      // Fetch pictures for each match
      const matchesWithPictures = await Promise.all(
        (data.matches || []).map(async (match: MatchProfile) => {
          try {
            const picResponse = await fetch(`${API_BASE}/api/user/pictures/${match.user_id}`);
            const picData = await picResponse.json();
            return { ...match, pictures: picData.pictures };
          } catch {
            return match;
          }
        })
      );

      setMatches(matchesWithPictures);
    } catch (err) {
      console.error('Error fetching matches:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMatches(false);
  };

  const handleMessage = (profile: MatchProfile) => {
    setSelectedProfile(profile);
    setShowMessageModal(true);
  };

  const sendMessage = () => {
    if (messageText.trim() && selectedProfile) {
      // TODO: Implement actual messaging
      alert(`Message sent to ${selectedProfile.name}!\n\n"${messageText}"\n\nChat feature coming soon.`);
      setMessageText('');
      setShowMessageModal(false);
    }
  };

  const renderProfile = ({ item, index }: { item: MatchProfile; index: number }) => (
    <ProfileCard
      profile={item}
      onMessage={() => handleMessage(item)}
      isExpanded={false}
      onToggleExpand={() => {}}
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {mode === 'date' ? 'Matches' : 'Movie Buddies'}
          </Text>
          <Text style={styles.headerSubtitle}>Finding compatible profiles...</Text>
        </View>
        <LoadingState mode={mode} />
      </SafeAreaView>
    );
  }

  if (matches.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {mode === 'date' ? 'Matches' : 'Movie Buddies'}
          </Text>
        </View>
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: themeColor + '20' }]}>
            <Ionicons name="heart-outline" size={60} color={themeColor} />
          </View>
          <Text style={styles.emptyTitle}>No Matches Yet</Text>
          <Text style={styles.emptySubtitle}>
            Keep swiping movies in Discover to improve your taste profile and find better matches!
          </Text>
          <TouchableOpacity 
            style={[styles.refreshButton, { backgroundColor: themeColor }]}
            onPress={() => fetchMatches()}
          >
            <Ionicons name="refresh" size={20} color="white" />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {mode === 'date' ? 'Matches' : 'Movie Buddies'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {matches.length} compatible {mode === 'date' ? 'dates' : 'buddies'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshIcon}>
          <Ionicons name="refresh" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* Profile Cards - Vertical Scroll */}
      <FlatList
        data={matches}
        renderItem={renderProfile}
        keyExtractor={(item) => item.user_id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT - 150}
        decelerationRate="fast"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={themeColor}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      />

      {/* Message Modal */}
      <Modal visible={showMessageModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.messageModal}>
            <View style={styles.messageModalHeader}>
              <Text style={styles.messageModalTitle}>
                Message {selectedProfile?.name}
              </Text>
              <TouchableOpacity onPress={() => setShowMessageModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.messageModalHint}>
              Start with something about your shared movie taste!
            </Text>
            
            <TextInput
              style={styles.messageInput}
              placeholder="Type your message..."
              placeholderTextColor={COLORS.textMuted}
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={500}
            />
            
            <TouchableOpacity 
              style={[
                styles.sendButton, 
                !messageText.trim() && styles.sendButtonDisabled
              ]}
              onPress={sendMessage}
              disabled={!messageText.trim()}
            >
              <Text style={styles.sendButtonText}>Send Message</Text>
              <Ionicons name="send" size={18} color="white" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  headerSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  refreshIcon: { padding: 8 },
  
  // Card Container
  cardContainer: {
    width: SCREEN_WIDTH,
    minHeight: SCREEN_HEIGHT - 150,
  },
  
  // Photo Section wrapper
  photoSection: {
    width: SCREEN_WIDTH,
    height: CARD_HEIGHT,
    position: 'relative',
  },
  
  // Photo Container (inside PhotoCarousel)
  photoContainer: {
    width: SCREEN_WIDTH,
    height: CARD_HEIGHT,
    position: 'relative',
  },
  photo: {
    width: SCREEN_WIDTH,
    height: CARD_HEIGHT,
  },
  avatarPlaceholder: {
    width: SCREEN_WIDTH,
    height: CARD_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarName: {
    position: 'absolute',
    fontSize: 80,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.3)',
  },
  photoGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: CARD_HEIGHT * 0.5,
  },
  photoIndicators: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  photoIndicator: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
  },
  photoIndicatorActive: {
    backgroundColor: 'white',
  },
  
  // Profile Overlay (on photo)
  profileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    zIndex: 10,
  },
  basicInfo: { marginBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline' },
  profileName: { fontSize: 32, fontWeight: 'bold', color: 'white' },
  profileAge: { fontSize: 28, color: 'white', fontWeight: '300' },
  verifiedBadge: { marginLeft: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' },
  locationText: { fontSize: 15, color: COLORS.textSecondary, marginLeft: 4 },
  dotSeparator: { color: COLORS.textMuted, marginHorizontal: 8 },
  
  // Match Badge
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  matchBadgeText: { color: 'white', fontWeight: '700', fontSize: 14 },
  
  // Details Section
  detailsScroll: { flex: 1 },
  detailsContent: { padding: 20 },
  
  // Match Reason Card
  matchReasonCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  matchReasonHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  matchReasonTitle: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  matchReasonText: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22 },
  sharedInterests: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 8 },
  interestChip: {
    backgroundColor: 'rgba(229,9,20,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  interestChipText: { color: COLORS.primary, fontSize: 13, fontWeight: '500' },
  
  // Sections
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  bioText: { fontSize: 16, color: COLORS.text, lineHeight: 24 },
  
  // Tags
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229,9,20,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  genreTagText: { color: COLORS.text, fontSize: 14 },
  directorTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(33,150,243,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  directorTagText: { color: COLORS.text, fontSize: 14 },
  
  // Favorite Movies
  favMovies: { marginTop: 12 },
  favMoviesLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: 4 },
  favMoviesText: { fontSize: 15, color: COLORS.text, fontStyle: 'italic' },
  
  // Lifestyle Grid
  lifestyleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  lifestyleItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lifestyleValue: { fontSize: 14, color: COLORS.text },
  
  // Languages
  languagesText: { fontSize: 15, color: COLORS.textSecondary },
  
  // Action Bar
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: COLORS.bg,
  },
  messageButton: { borderRadius: 28, overflow: 'hidden' },
  messageButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  messageButtonText: { color: 'white', fontSize: 18, fontWeight: '700' },
  
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
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { 
    width: 120, 
    height: 120, 
    borderRadius: 60, 
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  emptySubtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    marginTop: 24,
    gap: 8,
  },
  refreshButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  
  // Message Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  messageModal: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  messageModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  messageModalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  messageModalHint: { fontSize: 14, color: COLORS.textMuted, marginBottom: 16 },
  messageInput: {
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    paddingVertical: 16,
    marginTop: 16,
    gap: 8,
  },
  sendButtonDisabled: { backgroundColor: COLORS.textMuted },
  sendButtonText: { color: 'white', fontSize: 17, fontWeight: '600' },
});
