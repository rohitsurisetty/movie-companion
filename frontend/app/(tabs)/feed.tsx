import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, FlatList,
  Modal, ScrollView, ActivityIndicator, RefreshControl, Dimensions,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SharedHeader, ModeSwitcher, useAppMode } from '../../src/components/SharedHeader';
import { getUserId } from '../../src/store';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = 110;  // Fixed width for 3 cards per row
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  primary: '#E50914',
  primaryLight: 'rgba(229,9,20,0.1)',
  buddy: '#2196F3',
  buddyLight: 'rgba(33,150,243,0.1)',
  bg: '#121212',
  bgCard: '#1E1E1E',
  bgDark: '#0A0A0A',
  text: '#FFFFFF',
  textSecondary: '#CCCCCC',
  textMuted: '#888888',
  border: '#333333',
  success: '#4CAF50',
  warning: '#FF9800',
};

const AVATAR_OPTIONS = [
  { id: 'av1', color: '#E50914', icon: 'person' as const },
  { id: 'av2', color: '#FFD700', icon: 'happy' as const },
  { id: 'av3', color: '#4CAF50', icon: 'leaf' as const },
  { id: 'av4', color: '#2196F3', icon: 'planet' as const },
  { id: 'av5', color: '#9C27B0', icon: 'star' as const },
  { id: 'av6', color: '#FF9800', icon: 'sunny' as const },
];

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
  swipe_history?: {
    liked_genres?: string[];
    liked_actors?: string[];
    liked_directors?: string[];
  };
}

// Match Level Badge Component
const MatchBadge = ({ level }: { level: string }) => {
  const getBadgeStyle = () => {
    switch (level) {
      case 'Perfect Match':
        return { bg: 'rgba(229,9,20,0.2)', color: '#E50914', icon: 'flame' as const };
      case 'Great Match':
        return { bg: 'rgba(76,175,80,0.2)', color: '#4CAF50', icon: 'star' as const };
      case 'Good Match':
        return { bg: 'rgba(33,150,243,0.2)', color: '#2196F3', icon: 'thumbs-up' as const };
      default:
        return { bg: 'rgba(255,152,0,0.2)', color: '#FF9800', icon: 'sparkles' as const };
    }
  };

  const style = getBadgeStyle();

  return (
    <View style={[styles.matchBadge, { backgroundColor: style.bg }]}>
      <Ionicons name={style.icon} size={10} color={style.color} />
      <Text style={[styles.matchBadgeText, { color: style.color }]}>{level}</Text>
    </View>
  );
};

// Profile Card in Grid
const ProfileCard = ({ profile, onPress, themeColor }: { 
  profile: MatchProfile; 
  onPress: () => void;
  themeColor: string;
}) => {
  const avatar = AVATAR_OPTIONS.find(a => a.id === profile.avatar) || AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)];

  return (
    <TouchableOpacity style={styles.profileCard} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.avatarContainer, { backgroundColor: avatar.color }]}>
        <Ionicons name={avatar.icon} size={36} color="white" />
      </View>
      <Text style={styles.profileName} numberOfLines={1}>{profile.name}</Text>
      <Text style={styles.profileAge}>{profile.age} • {profile.location?.split(',')[0]}</Text>
      <MatchBadge level={profile.match_level} />
    </TouchableOpacity>
  );
};

// Profile Detail Modal - Dating App Style Card Stack
const ProfileDetailModal = ({
  visible,
  profile,
  onClose,
  onMessage,
  themeColor,
}: {
  visible: boolean;
  profile: MatchProfile | null;
  onClose: () => void;
  onMessage: (message: string) => void;
  themeColor: string;
}) => {
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [messageText, setMessageText] = useState('');
  const insets = useSafeAreaInsets();

  if (!profile) return null;

  const avatar = AVATAR_OPTIONS.find(a => a.id === profile.avatar) || AVATAR_OPTIONS[0];

  const handleSendMessage = () => {
    if (messageText.trim()) {
      onMessage(messageText.trim());
      setMessageText('');
      setShowMessageInput(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.profileDetailContainer, { paddingBottom: insets.bottom }]}>
          {/* Header with close */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="chevron-down" size={28} color={COLORS.text} />
            </TouchableOpacity>
            <MatchBadge level={profile.match_level} />
            <View style={{ width: 40 }} />
          </View>

          <ScrollView 
            style={styles.profileScroll} 
            contentContainerStyle={styles.profileScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero Section - Avatar & Basic Info */}
            <View style={styles.heroSection}>
              <View style={[styles.largeAvatar, { backgroundColor: avatar.color }]}>
                <Ionicons name={avatar.icon} size={80} color="white" />
              </View>
              <Text style={styles.heroName}>{profile.name}, {profile.age}</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location" size={16} color={COLORS.textMuted} />
                <Text style={styles.locationText}>{profile.location}</Text>
              </View>
              {profile.workProfile && (
                <View style={styles.workRow}>
                  <Ionicons name="briefcase-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.workText}>{profile.workProfile}</Text>
                </View>
              )}
            </View>

            {/* Match Explanation Card */}
            <View style={[styles.matchCard, { borderColor: themeColor }]}>
              <View style={styles.matchCardHeader}>
                <Ionicons name="sparkles" size={20} color={themeColor} />
                <Text style={[styles.matchCardTitle, { color: themeColor }]}>Why You Match</Text>
              </View>
              <Text style={styles.matchExplanation}>{profile.explanation}</Text>
              {profile.shared_interests && profile.shared_interests.length > 0 && (
                <View style={styles.sharedInterests}>
                  {profile.shared_interests.map((interest, idx) => (
                    <View key={idx} style={[styles.interestPill, { backgroundColor: themeColor + '20' }]}>
                      <Text style={[styles.interestText, { color: themeColor }]}>{interest}</Text>
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

            {/* Movie Preferences */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Movie Preferences</Text>
              <View style={styles.pillsContainer}>
                {profile.genres?.slice(0, 5).map((genre, idx) => (
                  <View key={idx} style={styles.genrePill}>
                    <Ionicons name="film-outline" size={12} color={COLORS.primary} />
                    <Text style={styles.genreText}>{genre}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.prefsRow}>
                {profile.movieFrequency && (
                  <View style={styles.prefItem}>
                    <Ionicons name="calendar-outline" size={16} color={COLORS.textMuted} />
                    <Text style={styles.prefText}>{profile.movieFrequency}</Text>
                  </View>
                )}
                {profile.ottTheatre && (
                  <View style={styles.prefItem}>
                    <Ionicons name="tv-outline" size={16} color={COLORS.textMuted} />
                    <Text style={styles.prefText}>{profile.ottTheatre}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Top Movies */}
            {profile.topMovies && profile.topMovies.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Favorite Movies</Text>
                <View style={styles.moviesRow}>
                  {profile.topMovies.slice(0, 3).map((movie, idx) => (
                    <View key={idx} style={styles.movieChip}>
                      <Ionicons name="videocam" size={14} color={COLORS.primary} />
                      <Text style={styles.movieChipText} numberOfLines={1}>{movie.title}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Favorite Actors/Directors from Swipes */}
            {profile.swipe_history?.liked_directors && profile.swipe_history.liked_directors.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Favorite Directors</Text>
                <View style={styles.pillsContainer}>
                  {profile.swipe_history.liked_directors.slice(0, 4).map((director, idx) => (
                    <View key={idx} style={styles.directorPill}>
                      <Ionicons name="megaphone-outline" size={12} color={COLORS.buddy} />
                      <Text style={styles.directorText}>{director}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Languages */}
            {profile.filmLanguages && profile.filmLanguages.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Film Languages</Text>
                <View style={styles.pillsContainer}>
                  {profile.filmLanguages.map((lang, idx) => (
                    <View key={idx} style={styles.langPill}>
                      <Text style={styles.langText}>{lang}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Lifestyle */}
            {(profile.zodiac || profile.smoking || profile.drinking || profile.exercise) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Lifestyle</Text>
                <View style={styles.lifestyleGrid}>
                  {profile.zodiac && (
                    <View style={styles.lifestyleItem}>
                      <Ionicons name="star-outline" size={18} color={COLORS.textMuted} />
                      <Text style={styles.lifestyleLabel}>Zodiac</Text>
                      <Text style={styles.lifestyleValue}>{profile.zodiac}</Text>
                    </View>
                  )}
                  {profile.smoking && (
                    <View style={styles.lifestyleItem}>
                      <Ionicons name="leaf-outline" size={18} color={COLORS.textMuted} />
                      <Text style={styles.lifestyleLabel}>Smoking</Text>
                      <Text style={styles.lifestyleValue}>{profile.smoking}</Text>
                    </View>
                  )}
                  {profile.drinking && (
                    <View style={styles.lifestyleItem}>
                      <Ionicons name="wine-outline" size={18} color={COLORS.textMuted} />
                      <Text style={styles.lifestyleLabel}>Drinking</Text>
                      <Text style={styles.lifestyleValue}>{profile.drinking}</Text>
                    </View>
                  )}
                  {profile.exercise && (
                    <View style={styles.lifestyleItem}>
                      <Ionicons name="fitness-outline" size={18} color={COLORS.textMuted} />
                      <Text style={styles.lifestyleLabel}>Exercise</Text>
                      <Text style={styles.lifestyleValue}>{profile.exercise}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Looking For */}
            {profile.relationshipIntent && profile.relationshipIntent.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Looking For</Text>
                <View style={styles.pillsContainer}>
                  {profile.relationshipIntent.map((intent, idx) => (
                    <View key={idx} style={styles.intentPill}>
                      <Ionicons name="heart-outline" size={12} color={COLORS.primary} />
                      <Text style={styles.intentText}>{intent}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Message Input or Button */}
          {showMessageInput ? (
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.messageInputContainer}
            >
              <TextInput
                style={styles.messageInput}
                placeholder="Type a message..."
                placeholderTextColor={COLORS.textMuted}
                value={messageText}
                onChangeText={setMessageText}
                multiline
                autoFocus
              />
              <TouchableOpacity 
                style={[styles.sendBtn, { backgroundColor: themeColor }]}
                onPress={handleSendMessage}
              >
                <Ionicons name="send" size={20} color="white" />
              </TouchableOpacity>
            </KeyboardAvoidingView>
          ) : (
            <TouchableOpacity 
              style={[styles.messageBtn, { backgroundColor: themeColor }]}
              onPress={() => setShowMessageInput(true)}
            >
              <Ionicons name="chatbubble-outline" size={20} color="white" />
              <Text style={styles.messageBtnText}>Send Message</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

// Main Feed Screen
export default function FeedScreen() {
  const { mode, setMode, colors, showModeDrawer, setShowModeDrawer } = useAppMode();
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<MatchProfile | null>(null);
  const [showProfileDetail, setShowProfileDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const themeColor = mode === 'date' ? COLORS.primary : COLORS.buddy;

  const fetchMatches = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);

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

      if (!response.ok) {
        throw new Error('Failed to fetch matches');
      }

      const data = await response.json();
      setMatches(data.matches || []);
    } catch (err) {
      console.error('Error fetching matches:', err);
      setError('Unable to load matches. Pull down to retry.');
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

  const handleProfilePress = (profile: MatchProfile) => {
    setSelectedProfile(profile);
    setShowProfileDetail(true);
  };

  const handleMessage = (message: string) => {
    // TODO: Implement actual messaging via chat system
    console.log('Message to', selectedProfile?.name, ':', message);
    alert(`Message sent to ${selectedProfile?.name}!\n\nChat feature coming soon.`);
  };

  const renderProfileCard = ({ item }: { item: MatchProfile }) => (
    <ProfileCard 
      profile={item} 
      onPress={() => handleProfilePress(item)}
      themeColor={themeColor}
    />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: themeColor + '20' }]}>
        <Ionicons name="search" size={48} color={themeColor} />
      </View>
      <Text style={styles.emptyTitle}>Finding Your Matches</Text>
      <Text style={styles.emptySubtitle}>
        Our AI is analyzing movie preferences to find your perfect companions.
        {'\n\n'}Keep swiping in Discover to improve your matches!
      </Text>
      <TouchableOpacity 
        style={[styles.retryBtn, { backgroundColor: themeColor }]}
        onPress={() => fetchMatches()}
      >
        <Ionicons name="refresh" size={18} color="white" />
        <Text style={styles.retryBtnText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        {/* Shared Header with Mode Switcher */}
        <SharedHeader
          title={mode === 'date' ? 'Your Matches' : 'Movie Buddies'}
          showModeIcon={true}
          onMenuPress={() => setShowModeDrawer(true)}
          colors={colors}
        />

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themeColor} />
            <Text style={styles.loadingText}>Finding compatible profiles...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity 
              style={[styles.retryBtn, { backgroundColor: themeColor }]}
              onPress={() => fetchMatches()}
            >
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView 
            style={styles.scrollContainer}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={themeColor}
              />
            }
          >
            {matches.length > 0 ? (
              <>
                <View style={styles.resultsHeader}>
                  <Ionicons name="sparkles" size={16} color={themeColor} />
                  <Text style={styles.resultsText}>
                    {matches.length} AI-matched {mode === 'date' ? 'dates' : 'buddies'} found
                  </Text>
                </View>
                <View style={styles.gridContainer}>
                  {matches.map((profile) => (
                    <ProfileCard
                      key={profile.user_id}
                      profile={profile}
                      onPress={() => handleProfilePress(profile)}
                      themeColor={themeColor}
                    />
                  ))}
                </View>
              </>
            ) : (
              renderEmptyState()
            )}
          </ScrollView>
        )}
      </View>

      {/* Mode Switcher Modal */}
      <ModeSwitcher
        visible={showModeDrawer}
        onClose={() => setShowModeDrawer(false)}
        currentMode={mode}
        onModeChange={setMode}
        colors={colors}
      />

      {/* Profile Detail Modal */}
      <ProfileDetailModal
        visible={showProfileDetail}
        profile={selectedProfile}
        onClose={() => setShowProfileDetail(false)}
        onMessage={handleMessage}
        themeColor={themeColor}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1 },
  
  // Loading & Error States
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: 16, fontSize: 14 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { color: COLORS.textMuted, marginTop: 16, marginBottom: 24, textAlign: 'center' },
  
  // Grid Layout
  scrollContainer: { flex: 1 },
  gridContent: { padding: 12, paddingBottom: 100 },
  gridContainer: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    justifyContent: 'flex-start',
    gap: 12,
  },
  gridRow: { justifyContent: 'flex-start', gap: 12 },
  resultsHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
  },
  resultsText: { color: COLORS.textSecondary, fontSize: 13 },
  
  // Profile Card
  profileCard: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  profileName: { fontSize: 14, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  profileAge: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  
  // Match Badge
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
    gap: 3,
  },
  matchBadgeText: { fontSize: 9, fontWeight: '600' },
  
  // Empty State
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { 
    width: 100, 
    height: 100, 
    borderRadius: 50, 
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  emptySubtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
  retryBtn: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24, 
    paddingVertical: 12, 
    borderRadius: 24,
    marginTop: 24,
    gap: 8,
  },
  retryBtnText: { color: 'white', fontWeight: '600', fontSize: 15 },
  
  // Profile Detail Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)' },
  profileDetailContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    marginTop: 40,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeBtn: { padding: 4 },
  profileScroll: { flex: 1 },
  profileScrollContent: { padding: 20, paddingBottom: 40 },
  
  // Hero Section
  heroSection: { alignItems: 'center', marginBottom: 24 },
  largeAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroName: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 },
  locationText: { fontSize: 14, color: COLORS.textMuted },
  workRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  workText: { fontSize: 13, color: COLORS.textSecondary },
  
  // Match Card
  matchCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  matchCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  matchCardTitle: { fontSize: 16, fontWeight: '600' },
  matchExplanation: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  sharedInterests: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 8 },
  interestPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  interestText: { fontSize: 12, fontWeight: '500' },
  
  // Sections
  section: { marginBottom: 20 },
  sectionTitle: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: COLORS.textMuted, 
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  bioText: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 24 },
  
  // Pills
  pillsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genrePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  genreText: { fontSize: 12, color: COLORS.text },
  directorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.buddyLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  directorText: { fontSize: 12, color: COLORS.text },
  langPill: { backgroundColor: COLORS.bgCard, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  langText: { fontSize: 12, color: COLORS.text },
  intentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  intentText: { fontSize: 12, color: COLORS.text },
  
  // Preferences
  prefsRow: { flexDirection: 'row', marginTop: 12, gap: 16 },
  prefItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prefText: { fontSize: 13, color: COLORS.textSecondary },
  
  // Movies Row
  moviesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  movieChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
    maxWidth: '48%',
  },
  movieChipText: { fontSize: 12, color: COLORS.text, flex: 1 },
  
  // Lifestyle Grid
  lifestyleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  lifestyleItem: {
    width: '47%',
    backgroundColor: COLORS.bgCard,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  lifestyleLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  lifestyleValue: { fontSize: 13, color: COLORS.text, fontWeight: '500', marginTop: 2 },
  
  // Message Button & Input
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    padding: 16,
    borderRadius: 28,
    gap: 8,
  },
  messageBtnText: { color: 'white', fontSize: 16, fontWeight: '600' },
  messageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  messageInput: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
