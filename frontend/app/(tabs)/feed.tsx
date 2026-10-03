import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  ActivityIndicator, RefreshControl,
  Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAppMode } from '../../src/components/SharedHeader';
import { apiUrl, getUserId } from '../../src/store';
import { formatLocationForPrivacy } from '../../src/utils/locationFormatter';
import { PremiumProfileView, normalizePictures } from '../../src/components/PremiumProfileView';
import { ReportModal } from '../../src/components/chat/ReportModal';

const TILE_GAP = 12;

// Friendly copy for a failed /api/matches call (429 = rate limited).
const matchesErrorMessage = (status?: number) =>
  status === 429
    ? 'Too many requests. Please try again shortly.'
    : "We couldn't load your matches. Check your connection and try again.";

// Friendly copy for a failed report / block request (429 = rate limited).
const safetyActionErrorMessage = (status?: number) =>
  status === 429
    ? 'Too many requests. Please try again shortly.'
    : 'Something went wrong. Check your connection and try again.';

const COLORS = {
  primary: '#E50914',
  primaryDark: '#B5070F',
  accent: '#FF6B6B',
  buddy: '#2196F3',
  bg: '#0A0A0A',
  bgCard: '#1A1A1A',
  bgSheet: '#1C1C1E',
  bgInput: '#2A2A2A',
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
  height?: string;
  religion?: string;
  personality?: string;
  /** Ordered photo URLs (backend contract: string[]). */
  pictures: string[];
  /** Primary photo on mock/legacy records. */
  profile_picture?: string;
  /** Seeded demo profile (backend MOCK_FEED_PROFILES). */
  is_mock?: boolean;
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
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

  // Get profile picture from the profile data itself
  // Fallback: profile_picture > pictures[0] > null (show initials).
  // normalizePictures also tolerates a missing list / legacy picture_N object.
  const profilePicture = profile.profile_picture || normalizePictures(profile.pictures)[0] || null;

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
            <Text style={styles.tileLocation} numberOfLines={1}>{formatLocationForPrivacy(profile.location)}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
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
interface EmptyStateReason {
  type: 'filters_restrictive' | 'insufficient_movies' | 'profile_incomplete' | 'no_matches';
}

// Pure: derived from the CURRENT matches / own profile / server reason on every
// render, so it can never read a stale userProfile captured by an old closure.
const determineEmptyReason = (
  matchCount: number,
  profile: any,
  serverReason: string | null,
): EmptyStateReason => {
  if (matchCount > 0) return { type: 'no_matches' };
  // Backend: POST /api/matches → { matches: [], reason: 'profile_incomplete' }
  if (serverReason === 'profile_incomplete') return { type: 'profile_incomplete' };
  // Own profile not loaded (yet / failed) → don't guess.
  if (!profile) return { type: 'no_matches' };

  // Check if user has enough movie data
  const topMovies = profile?.topMovies || [];
  const ratedMovies = profile?.library?.length || 0;

  if (topMovies.length < 3 && ratedMovies < 5) {
    return { type: 'insufficient_movies' };
  }

  // Check if filters might be too restrictive
  const preferences = profile?.preferences || {};
  const hasRestrictiveFilters =
    (preferences.ageRange && (preferences.ageRange.max - preferences.ageRange.min) < 10) ||
    (preferences.distance && preferences.distance < 50);

  if (hasRestrictiveFilters) {
    return { type: 'filters_restrictive' };
  }

  return { type: 'no_matches' };
};

// ============ ERROR STATE ============
// /api/matches failed — shown instead of (never disguised as) "No matches yet".
const ErrorState = ({ mode, message, onRetry }: {
  mode: string;
  message: string;
  onRetry: () => void;
}) => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyIconContainer}>
      <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
    </View>
    <Text style={styles.emptyTitle}>{"Couldn't load matches"}</Text>
    <Text style={styles.emptySubtitle}>{message}</Text>
    <TouchableOpacity
      style={[styles.emptyCTAButton, { backgroundColor: mode === 'date' ? COLORS.primary : COLORS.buddy }]}
      onPress={onRetry}
    >
      <Ionicons name="refresh-outline" size={20} color="#FFF" />
      <Text style={styles.emptyCTAButtonText}>Try Again</Text>
    </TouchableOpacity>
  </View>
);

const EmptyState = ({
  mode,
  onRefresh,
  reason,
  onGoToFilters,
  onGoToLibrary,
  onCompleteProfile,
}: {
  mode: string;
  onRefresh: () => void;
  reason: EmptyStateReason;
  onGoToFilters: () => void;
  onGoToLibrary: () => void;
  onCompleteProfile: () => void;
}) => {
  const getEmptyStateContent = () => {
    switch (reason.type) {
      case 'profile_incomplete':
        return {
          icon: 'person-circle-outline' as const,
          title: 'Complete your profile',
          subtitle: 'Finish your profile so we can match you with people who share your taste in movies.',
          ctaText: 'Complete Profile',
          ctaAction: onCompleteProfile,
          ctaIcon: 'create-outline' as const,
        };
      case 'filters_restrictive':
        return {
          icon: 'options-outline' as const,
          title: 'Filters too restrictive',
          subtitle: "We couldn't find enough compatible profiles based on your current filters. Try expanding your preferences to discover more people.",
          ctaText: 'Filters & Preferences',
          ctaAction: onGoToFilters,
          ctaIcon: 'settings-outline' as const,
        };
      case 'insufficient_movies':
        return {
          icon: 'film-outline' as const,
          title: 'Help us know you better',
          subtitle: 'Add more movies you\'ve watched so we can improve your recommendations and find better matches for you.',
          ctaText: 'Go to Library',
          ctaAction: onGoToLibrary,
          ctaIcon: 'library-outline' as const,
        };
      default:
        return {
          icon: mode === 'date' ? 'heart-outline' : 'people-outline',
          title: 'No matches yet',
          subtitle: 'Complete your profile and movie preferences to get better matches',
          ctaText: 'Refresh Matches',
          ctaAction: onRefresh,
          ctaIcon: 'refresh-outline' as const,
        };
    }
  };

  const content = getEmptyStateContent();

  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons 
          name={content.icon as any} 
          size={48} 
          color={COLORS.textMuted} 
        />
      </View>
      <Text style={styles.emptyTitle}>{content.title}</Text>
      <Text style={styles.emptySubtitle}>{content.subtitle}</Text>
      
      <TouchableOpacity 
        style={[styles.emptyCTAButton, { backgroundColor: mode === 'date' ? COLORS.primary : COLORS.buddy }]}
        onPress={content.ctaAction}
      >
        <Ionicons name={content.ctaIcon as any} size={20} color="#FFF" />
        <Text style={styles.emptyCTAButtonText}>{content.ctaText}</Text>
      </TouchableOpacity>

      {reason.type !== 'no_matches' && (
        <TouchableOpacity 
          style={styles.emptySecondaryButton}
          onPress={onRefresh}
        >
          <Text style={styles.emptySecondaryButtonText}>Refresh anyway</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ============ MAIN FEED SCREEN ============
export default function FeedScreen() {
  const { mode } = useAppMode();
  const router = useRouter();
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Failed /api/matches load — distinct from a genuine empty result.
  const [matchesError, setMatchesError] = useState<string | null>(null);
  // Empty-result reason sent by the backend (e.g. 'profile_incomplete').
  const [serverReason, setServerReason] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<MatchProfile | null>(null);
  const [selectedProfilePhotos, setSelectedProfilePhotos] = useState<string[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Fetch user profile to determine empty state reason
  const fetchUserProfile = useCallback(async () => {
    try {
      const userId = await getUserId();
      if (!userId) return; // fetchMatches handles the logged-out redirect
      const response = await fetch(apiUrl(`/api/user/profile/${userId}`));
      if (response.ok) {
        const data = await response.json();
        setUserProfile(data.profile);
      }
    } catch {
      // Only used to pick a more helpful empty-state message.
    }
  }, []);

  // Recomputed from current state (see determineEmptyReason).
  const emptyReason = useMemo(
    () => determineEmptyReason(matches.length, userProfile, serverReason),
    [matches, userProfile, serverReason],
  );

  // Fetch matches from API. Keyed on `mode` so refresh/retry always use the
  // current state instead of a closure captured on first render.
  const fetchMatches = useCallback(async (forceRefresh = false) => {
    try {
      const userId = await getUserId();
      if (!userId) {
        router.replace('/');
        return;
      }
      const response = await fetch(apiUrl('/api/matches'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          limit: 20,
          force_refresh: forceRefresh,
          mode: mode, // Send current mode (buddy/date)
        }),
      });

      if (!response.ok) {
        // Keep whatever is already on screen; the error UI offers Retry.
        setMatchesError(matchesErrorMessage(response.status));
      } else {
        const data = await response.json();
        const rawMatches = data.matches || [];

        // Defensive de-dup: the candidate pool can occasionally return the
        // same user_id twice (e.g. a user that was both seeded as a mock
        // friend AND surfaced as a real signup, or a stale cache merging
        // with a fresh pool). React then throws "Encountered two children
        // with the same key" and the duplicate tile is silently omitted.
        // We dedup here so the UI always shows a clean unique list, and
        // log the collision count so backend regressions are visible.
        const seen = new Set<string>();
        const matchList: typeof rawMatches = [];
        let dupes = 0;
        for (const m of rawMatches) {
          const uid = m?.user_id;
          if (!uid) continue;
          if (seen.has(uid)) {
            dupes += 1;
            continue;
          }
          seen.add(uid);
          matchList.push(m);
        }
        if (dupes > 0) {
          console.warn(
            `[feed] backend returned ${dupes} duplicate user_id(s) in /matches — deduped client-side`,
          );
        }
        setMatches(matchList);
        setServerReason(typeof data.reason === 'string' ? data.reason : null);
        setMatchesError(null);
      }
    } catch {
      setMatchesError(matchesErrorMessage());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, router]);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]); // Re-fetch when mode changes (fetchMatches is keyed on mode)

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUserProfile(); // movies/profile may have changed → fresh empty-state reason
    fetchMatches(true); // Force refresh to bypass cache
  }, [fetchMatches, fetchUserProfile]);

  // Full-screen Retry after a failed load.
  const handleRetry = useCallback(() => {
    setMatchesError(null);
    setLoading(true);
    fetchMatches();
  }, [fetchMatches]);

  // Same destination as the header's filters button.
  const handleGoToFilters = () => {
    router.push('/filters');
  };

  const handleGoToLibrary = () => {
    router.push('/(tabs)/library');
  };

  const handleCompleteProfile = () => {
    router.push('/(tabs)/profile');
  };

  // Open profile in bottom sheet
  const openRequestRef = useRef(0);
  const openProfile = async (profile: MatchProfile) => {
    // A second tap while photos load must not show the first profile's photos.
    const requestId = ++openRequestRef.current;
    setSelectedProfile(profile);

    // Fetch all photos for this profile. No placeholder images: if none are
    // found, [] makes PremiumProfileView fall back to the match's own
    // `pictures`, then to initials.
    let photos: string[] = [];
    try {
      const response = await fetch(apiUrl(`/api/user/pictures/${profile.user_id}`));
      if (response.ok) {
        const data = await response.json();
        photos = normalizePictures(data.pictures);
      }
    } catch {
      photos = [];
    }
    if (requestId !== openRequestRef.current) return;
    setSelectedProfilePhotos(photos);

    setShowProfileModal(true);
  };

  const closeProfile = () => {
    setShowProfileModal(false);
    setSelectedProfile(null);
  };

  // ============ REPORT / BLOCK (from the profile's "more" button) ============
  const [showReportModal, setShowReportModal] = useState(false);
  // Profile being reported. Kept after the sheet closes so its title doesn't
  // change while it animates out; replaced when the next report starts.
  const [reportTarget, setReportTarget] = useState<MatchProfile | null>(null);
  const reportFiledRef = useRef(false);

  // A reported / blocked profile leaves the grid right away (the backend also
  // drops it from future /api/matches results) and its profile sheet closes.
  const removeFromFeed = (userId: string) => {
    setMatches((prev) => prev.filter((m) => m.user_id !== userId));
    closeProfile();
  };

  const blockProfile = async (profile: MatchProfile) => {
    let failure: string | null = null;
    try {
      const response = await fetch(apiUrl('/api/user/block'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked_user_id: profile.user_id }),
      });
      if (!response.ok) failure = safetyActionErrorMessage(response.status);
    } catch {
      failure = safetyActionErrorMessage();
    }
    if (failure) {
      Alert.alert('Could not block', failure);
      return;
    }
    removeFromFeed(profile.user_id);
  };

  const confirmBlock = (profile: MatchProfile) => {
    Alert.alert(
      `Block ${profile.name}?`,
      "They won't see your profile or be able to message you. They won't be told.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => { void blockProfile(profile); } },
      ],
    );
  };

  const startReport = (profile: MatchProfile) => {
    reportFiledRef.current = false;
    setReportTarget(profile);
    setShowReportModal(true);
  };

  const handleMoreActions = (profile: MatchProfile) => {
    Alert.alert(profile.name, undefined, [
      { text: 'Report', onPress: () => startReport(profile) },
      { text: 'Block', style: 'destructive', onPress: () => confirmBlock(profile) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Resolves once the report is filed (ReportModal then shows "Thank you");
  // rejects with user-facing copy so the modal shows it and stays open.
  // Works without a conversation, so any feed profile can be reported.
  const handleReport = async (reason: string, details?: string) => {
    const target = reportTarget;
    if (!target) throw new Error(safetyActionErrorMessage());
    const reporterId = await getUserId();
    let response: Response;
    try {
      response = await fetch(apiUrl('/api/chat/report'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporter_id: reporterId,
          reported_id: target.user_id,
          reason,
          details: details || null,
        }),
      });
    } catch {
      throw new Error(safetyActionErrorMessage());
    }
    if (!response.ok) throw new Error(safetyActionErrorMessage(response.status));
    reportFiledRef.current = true;
  };

  // After a filed report, closing the sheet also removes the profile.
  const handleReportClose = () => {
    setShowReportModal(false);
    if (reportFiledRef.current && reportTarget) {
      reportFiledRef.current = false;
      removeFromFeed(reportTarget.user_id);
    }
  };

  const [sendingMessage, setSendingMessage] = useState(false);
  const [sentRequestUserIds, setSentRequestUserIds] = useState<Set<string>>(new Set());

  // Check if we've already sent a request to this user
  const hasAlreadySentRequest = (userId: string) => sentRequestUserIds.has(userId);

  // Handler for sending message from within PremiumProfileView
  const handleSendMessage = async (message: string): Promise<boolean> => {
    if (!message.trim() || !selectedProfile) return false;
    
    setSendingMessage(true);
    try {
      const userId = await getUserId();
      if (!userId) {
        router.replace('/');
        return false;
      }
      const response = await fetch(apiUrl('/api/chat/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: userId,
          receiver_id: selectedProfile.user_id,
          content: message.trim(),
          message_type: 'text',
        }),
      });
      
      if (response.ok) {
        // Track that we sent a request to this user
        setSentRequestUserIds(prev => new Set([...prev, selectedProfile.user_id]));
        
        // Close the profile modal and navigate to chat
        closeProfile();
        
        // Navigate to chat - the message will be visible there
        // (whether as a pending request for them to accept, or as an active chat)
        router.push('/(tabs)/chat');
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    } finally {
      setSendingMessage(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Matches</Text>
          <Text style={styles.headerSubtitle}>Finding compatible profiles...</Text>
        </View>
        <LoadingState mode={mode} />
      </SafeAreaView>
    );
  }

  return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          {/* Top row with brand mark and Filters Icon */}
          <View style={styles.headerTopRow}>
            <View style={styles.brandMark}>
              <Ionicons name="film-outline" size={22} color={COLORS.primary} />
            </View>

            {/* Filters Icon - Top Right */}
            <TouchableOpacity
              style={styles.filtersBtn}
              onPress={() => router.push('/filters')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="options-outline" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          
          {/* Title and Subtitle */}
          <View style={styles.headerTitleSection}>
            <Text style={styles.headerTitle}>Matches</Text>
            <Text style={styles.headerSubtitle}>
              {matches.length > 0 
                ? `${matches.length} compatible profiles`
                : 'Discover your matches'
              }
            </Text>
          </View>
        </View>

        {/* Grid of profile tiles */}
        {matches.length === 0 && matchesError ? (
          <ErrorState mode={mode} message={matchesError} onRetry={handleRetry} />
        ) : matches.length === 0 ? (
          <EmptyState
            mode={mode}
            onRefresh={handleRefresh}
            reason={emptyReason}
            onGoToFilters={handleGoToFilters}
            onGoToLibrary={handleGoToLibrary}
            onCompleteProfile={handleCompleteProfile}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.gridContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={mode === 'date' ? COLORS.primary : COLORS.buddy}
                colors={[mode === 'date' ? COLORS.primary : COLORS.buddy]}
              />
            }
          >
            {/* Refresh failed: keep the stale grid, offer Retry */}
            {matchesError ? (
              <TouchableOpacity style={styles.errorBanner} onPress={handleRefresh}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.primary} />
                <Text style={styles.errorBannerText} numberOfLines={2}>{matchesError}</Text>
                <Text style={styles.errorBannerRetry}>Retry</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.gridWrapper}>
              {matches.map((item, index) => (
                <ProfileTile
                  key={item.user_id}
                  profile={item}
                  index={index}
                  mode={mode}
                  onPress={() => openProfile(item)}
                />
              ))}
            </View>
          </ScrollView>
        )}

        {/* Premium Profile View Modal */}
        <Modal 
          visible={showProfileModal} 
          animationType="fade" 
          onRequestClose={closeProfile}
          statusBarTranslucent
          transparent={false}
        >
          <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
            {selectedProfile && (
              <PremiumProfileView
                visible={showProfileModal}
                profile={{
                  user_id: selectedProfile.user_id,
                  name: selectedProfile.name,
                  age: selectedProfile.age,
                  gender: selectedProfile.gender || '',
                  location: selectedProfile.location || '',
                  bio: selectedProfile.bio,
                  genres: selectedProfile.genres,
                  topMovies: selectedProfile.topMovies,
                  filmLanguages: selectedProfile.filmLanguages,
                  languagesSpoken: selectedProfile.languagesSpoken,
                  movieFrequency: selectedProfile.movieFrequency,
                  ottTheatre: selectedProfile.ottTheatre,
                  match_level: selectedProfile.match_level,
                  explanation: selectedProfile.explanation,
                  shared_interests: selectedProfile.shared_interests,
                compatibility_score: selectedProfile.compatibility_score,
                relationshipIntent: selectedProfile.relationshipIntent,
                zodiac: selectedProfile.zodiac,
                smoking: selectedProfile.smoking,
                drinking: selectedProfile.drinking,
                exercise: selectedProfile.exercise,
                education: selectedProfile.education,
                workProfile: selectedProfile.workProfile,
                height: selectedProfile.height,
                religion: selectedProfile.religion,
                personality: selectedProfile.personality,
                // Fallback when `photos` is [] (pictures endpoint empty/failed);
                // nothing at all → PremiumProfileView shows initials.
                pictures: selectedProfile.pictures,
              }}
              photos={selectedProfilePhotos}
              mode={mode}
              onClose={closeProfile}
              onSendMessage={handleSendMessage}
              hasAlreadySentRequest={hasAlreadySentRequest(selectedProfile.user_id)}
              isSendingMessage={sendingMessage}
              onMoreActions={() => handleMoreActions(selectedProfile)}
            />
          )}
          {/* Inside the profile Modal's subtree so it stacks above the profile */}
          <ReportModal
            visible={showReportModal}
            onClose={handleReportClose}
            userName={reportTarget?.name || 'this user'}
            onReport={handleReport}
            secondaryActionLabel="Block instead"
            secondaryActionIcon="ban-outline"
            onUnmatchInstead={() => {
              if (reportTarget) confirmBlock(reportTarget);
            }}
          />
          </View>
        </Modal>
      </SafeAreaView>
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
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  filtersBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMark: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleSection: {
    marginTop: 4,
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
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  emptyCTAButton: {
    marginTop: 28,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyCTAButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  emptySecondaryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptySecondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },

  // Refresh-failed banner above a stale grid
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  errorBannerRetry: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
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
});
