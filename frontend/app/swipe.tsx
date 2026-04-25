import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Image, TouchableOpacity,
  ActivityIndicator, Modal, Pressable, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import {
  SPACING, BORDER_RADIUS, getThemeColors,
  LEFT_SWIPE_REASONS, RIGHT_SWIPE_REASONS,
} from '../src/theme';
import {
  FeedMovie, SwipeState, SwipeRecord, initialSwipeState, TMDB_GENRE_MAP, ProfileData, MovieDetail, initialProfileData,
} from '../src/types';
import { saveSwipeState, getSwipeState, getFilters, getProfile, saveMode, getMode, AppMode, clearAll } from '../src/store';
import InAppProfilePreview from '../src/components/InAppProfilePreview';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.88;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.55;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const REQUIRED_SWIPES = 20;

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Movie Details Bottom Sheet - Uses @gorhom/bottom-sheet for proper scroll + swipe handling
function MovieDetailsBottomSheet({
  visible, onClose, movieId, colors,
}: {
  visible: boolean;
  onClose: () => void;
  movieId: number;
  colors: ReturnType<typeof getThemeColors>;
}) {
  const [details, setDetails] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  
  // Snap points for bottom sheet - 85% of screen height
  const snapPoints = useMemo(() => ['85%'], []);

  useEffect(() => {
    if (visible && movieId > 0) {
      fetchDetails();
      // Expand the sheet when visible
      bottomSheetRef.current?.expand();
    } else {
      // Close the sheet when not visible
      bottomSheetRef.current?.close();
    }
  }, [visible, movieId]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/tmdb/movie/${movieId}`);
      if (resp.ok) {
        const data = await resp.json();
        setDetails(data);
      }
    } catch (e) {
      console.error('Error fetching movie details:', e);
    } finally {
      setLoading(false);
    }
  };

  // Handle sheet close
  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      onClose();
    }
  }, [onClose]);

  // Custom backdrop
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.7}
        pressBehavior="close"
      />
    ),
    []
  );

  if (!visible) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.bgCard }}
      handleIndicatorStyle={{ backgroundColor: '#555', width: 48, height: 5 }}
      style={detailStyles.bottomSheet}
    >
      <View style={detailStyles.handleArea}>
        <Text style={[detailStyles.swipeHint, { color: colors.textMuted }]}>
          Pull down to close
        </Text>
      </View>
      
      {loading ? (
        <View style={detailStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[detailStyles.loadingText, { color: colors.textSecondary }]}>Loading details...</Text>
        </View>
      ) : details ? (
        <BottomSheetScrollView 
          style={detailStyles.scroll}
          contentContainerStyle={detailStyles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          {/* Header with poster and title */}
          <View style={detailStyles.header}>
            {details.poster_path && (
              <Image 
                source={{ uri: `${TMDB_IMAGE_BASE}${details.poster_path}` }}
                style={detailStyles.poster}
                resizeMode="cover"
              />
            )}
            <View style={detailStyles.headerInfo}>
              <Text style={[detailStyles.title, { color: colors.text }]} numberOfLines={3}>{details.title}</Text>
              {details.release_date && (
                <Text style={[detailStyles.year, { color: colors.textSecondary }]}>
                  {details.release_date.split('-')[0]}
                </Text>
              )}
              {details.runtime > 0 && (
                <View style={detailStyles.runtimeRow}>
                  <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                  <Text style={[detailStyles.runtime, { color: colors.textMuted }]}>
                    {Math.floor(details.runtime / 60)}h {details.runtime % 60}m
                  </Text>
                </View>
              )}
              {details.vote_average > 0 && (
                <View style={detailStyles.ratingRow}>
                  <Ionicons name="star" size={16} color={colors.gold} />
                  <Text style={[detailStyles.rating, { color: colors.gold }]}>
                    {details.vote_average.toFixed(1)}/10
                  </Text>
                  {details.vote_count && (
                    <Text style={[detailStyles.voteCount, { color: colors.textMuted }]}>
                      ({details.vote_count.toLocaleString()} votes)
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Genres */}
          {details.genres && details.genres.length > 0 && (
            <View style={detailStyles.section}>
              <View style={detailStyles.genresRow}>
                {details.genres.map((genre, i) => (
                  <View key={i} style={[detailStyles.genreChip, { borderColor: colors.primary }]}>
                    <Text style={[detailStyles.genreText, { color: colors.primary }]}>{genre}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Synopsis */}
          {details.overview && (
            <View style={detailStyles.section}>
              <Text style={[detailStyles.sectionTitle, { color: colors.textSecondary }]}>Synopsis</Text>
              <Text style={[detailStyles.synopsis, { color: colors.text }]}>{details.overview}</Text>
            </View>
          )}

          {/* Directors */}
          {details.directors && details.directors.length > 0 && (
            <View style={detailStyles.section}>
              <Text style={[detailStyles.sectionTitle, { color: colors.textSecondary }]}>
                Director{details.directors.length > 1 ? 's' : ''}
              </Text>
              <Text style={[detailStyles.directors, { color: colors.text }]}>
                {details.directors.join(', ')}
              </Text>
            </View>
          )}

          {/* Cast */}
          {details.cast && details.cast.length > 0 && (
            <View style={detailStyles.section}>
              <Text style={[detailStyles.sectionTitle, { color: colors.textSecondary }]}>Cast</Text>
              <View style={detailStyles.castList}>
                {details.cast.slice(0, 10).map((member, i) => (
                  <View key={i} style={detailStyles.castItem}>
                    <View style={[detailStyles.castAvatar, { backgroundColor: colors.bgInput }]}>
                      <Ionicons name="person" size={18} color={colors.textMuted} />
                    </View>
                    <View style={detailStyles.castInfo}>
                      <Text style={[detailStyles.castName, { color: colors.text }]} numberOfLines={1}>
                        {member.name}
                      </Text>
                      {member.character && (
                        <Text style={[detailStyles.castCharacter, { color: colors.textMuted }]} numberOfLines={1}>
                          as {member.character}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
          
          {/* Close Button */}
          <TouchableOpacity
            style={[detailStyles.closeBtn, { backgroundColor: colors.primary }]}
            onPress={onClose}
            testID="close-details-btn"
          >
            <Ionicons name="chevron-down" size={20} color="#FFF" />
            <Text style={detailStyles.closeBtnText}>Close</Text>
          </TouchableOpacity>
          
          {/* Bottom padding for scroll */}
          <View style={{ height: 40 }} />
        </BottomSheetScrollView>
      ) : (
        <View style={detailStyles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={[detailStyles.errorText, { color: colors.textSecondary }]}>
            Could not load movie details
          </Text>
        </View>
      )}
    </BottomSheet>
  );
}

const detailStyles = StyleSheet.create({
  bottomSheet: { 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  handleArea: { 
    alignItems: 'center', 
    paddingBottom: SPACING.s,
    paddingHorizontal: SPACING.l,
  },
  handle: { width: 48, height: 5, backgroundColor: '#555', borderRadius: 3, marginBottom: SPACING.xs },
  swipeHint: { fontSize: 11, fontStyle: 'italic' },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xxl },
  loadingText: { marginTop: SPACING.m, fontSize: 14 },
  scroll: { flex: 1, paddingHorizontal: SPACING.l },
  scrollContent: { paddingBottom: SPACING.m },
  header: { flexDirection: 'row', marginBottom: SPACING.l, paddingTop: SPACING.s },
  poster: { width: 110, height: 165, borderRadius: BORDER_RADIUS.m },
  headerInfo: { flex: 1, marginLeft: SPACING.m, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: SPACING.xs },
  year: { fontSize: 14, marginBottom: SPACING.s },
  runtimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.xs },
  runtime: { fontSize: 13 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  rating: { fontSize: 16, fontWeight: '600' },
  voteCount: { fontSize: 12, marginLeft: 4 },
  section: { marginBottom: SPACING.l },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: SPACING.s, textTransform: 'uppercase', letterSpacing: 1 },
  genresRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  genreChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BORDER_RADIUS.full, borderWidth: 1 },
  genreText: { fontSize: 12, fontWeight: '500' },
  synopsis: { fontSize: 14, lineHeight: 22 },
  directors: { fontSize: 15, fontWeight: '500' },
  castList: { gap: SPACING.s },
  castItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  castAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  castInfo: { flex: 1 },
  castName: { fontSize: 14, fontWeight: '500' },
  castCharacter: { fontSize: 12 },
  errorContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xxl },
  errorText: { marginTop: SPACING.m, fontSize: 14 },
  closeBtn: { 
    paddingVertical: 14, 
    borderRadius: BORDER_RADIUS.full, 
    alignItems: 'center', 
    marginTop: SPACING.m,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  closeBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
});

// Left Swipe Reason Modal
function LeftSwipeModal({
  visible, onClose, onSubmit, movieTitle, colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reasons: string[], didntWatch: boolean) => void;
  movieTitle: string;
  colors: ReturnType<typeof getThemeColors>;
}) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const didntWatch = selectedReasons.includes('not_watched');

  const toggleReason = (id: string) => {
    if (id === 'not_watched') {
      // If selecting "Didn't watch", clear all other reasons and only keep this one
      if (!didntWatch) {
        setSelectedReasons(['not_watched']);
      } else {
        setSelectedReasons([]);
      }
    } else {
      // If "Didn't watch" is already selected, don't allow other selections
      if (didntWatch) return;
      
      setSelectedReasons(prev =>
        prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
      );
    }
  };

  const handleSubmit = () => {
    onSubmit(selectedReasons, didntWatch);
    setSelectedReasons([]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={[modalStyles.container, { backgroundColor: colors.bgCard }]} onPress={(e) => e.stopPropagation()}>
          <View style={modalStyles.header}>
            <Ionicons name="close-circle" size={28} color="#FF6B6B" />
            <Text style={[modalStyles.title, { color: colors.text }]}>Not for you?</Text>
          </View>
          <Text style={[modalStyles.movieTitle, { color: colors.gold }]} numberOfLines={2}>{movieTitle}</Text>
          <Text style={[modalStyles.subtitle, { color: colors.textSecondary }]}>Tell us why (optional)</Text>

          <View style={modalStyles.reasonsContainer}>
            {LEFT_SWIPE_REASONS.map((reason) => {
              const isDisabled = didntWatch && reason.id !== 'not_watched';
              return (
                <TouchableOpacity
                  key={reason.id}
                  style={[
                    modalStyles.reasonChip,
                    { borderColor: colors.border },
                    selectedReasons.includes(reason.id) && { borderColor: '#FF6B6B', backgroundColor: 'rgba(255,107,107,0.15)' },
                    isDisabled && { opacity: 0.4 }
                  ]}
                  onPress={() => toggleReason(reason.id)}
                  testID={`left-reason-${reason.id}`}
                  disabled={isDisabled}
                >
                  <Ionicons
                    name={reason.icon as any}
                    size={18}
                    color={selectedReasons.includes(reason.id) ? '#FF6B6B' : colors.textMuted}
                  />
                  <Text style={[
                    modalStyles.reasonText,
                    { color: selectedReasons.includes(reason.id) ? '#FF6B6B' : colors.textSecondary }
                  ]}>{reason.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {didntWatch && (
            <Text style={[modalStyles.didntWatchNote, { color: colors.textMuted }]}>
              This movie won't affect your taste profile
            </Text>
          )}

          <TouchableOpacity
            style={[modalStyles.submitBtn, { backgroundColor: '#FF6B6B' }]}
            onPress={handleSubmit}
            testID="left-swipe-submit-btn"
            activeOpacity={0.8}
          >
            <Text style={modalStyles.submitBtnText}>Skip Movie</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Right Swipe Rating Modal with Reasons
function RatingModal({
  visible, onClose, onSubmit, movieTitle, colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (rating: number, reasons: string[]) => void;
  movieTitle: string;
  colors: ReturnType<typeof getThemeColors>;
}) {
  const [rating, setRating] = useState(3);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);

  const toggleReason = (id: string) => {
    setSelectedReasons(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    onSubmit(rating, selectedReasons);
    setRating(3);
    setSelectedReasons([]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={[modalStyles.container, { backgroundColor: colors.bgCard }]} onPress={(e) => e.stopPropagation()}>
          <View style={modalStyles.header}>
            <Ionicons name="heart" size={28} color={colors.primary} />
            <Text style={[modalStyles.title, { color: colors.text }]}>You liked it!</Text>
          </View>
          <Text style={[modalStyles.movieTitle, { color: colors.gold }]} numberOfLines={2}>{movieTitle}</Text>
          <Text style={[modalStyles.subtitle, { color: colors.textSecondary }]}>Rate this movie</Text>

          <View style={modalStyles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                testID={`rating-star-${star}`}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
              >
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={40}
                  color={star <= rating ? colors.gold : colors.border}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[modalStyles.ratingLabel, { color: colors.textMuted }]}>
            {rating === 1 && 'Not for me'}
            {rating === 2 && 'It was okay'}
            {rating === 3 && 'Liked it'}
            {rating === 4 && 'Really good'}
            {rating === 5 && 'Masterpiece!'}
          </Text>

          <Text style={[modalStyles.optionalLabel, { color: colors.textSecondary }]}>What did you love? (optional)</Text>
          <View style={modalStyles.reasonsContainer}>
            {RIGHT_SWIPE_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.id}
                style={[
                  modalStyles.reasonChip,
                  { borderColor: colors.border },
                  selectedReasons.includes(reason.id) && { borderColor: colors.primary, backgroundColor: `${colors.primary}20` }
                ]}
                onPress={() => toggleReason(reason.id)}
                testID={`right-reason-${reason.id}`}
              >
                <Ionicons
                  name={reason.icon as any}
                  size={16}
                  color={selectedReasons.includes(reason.id) ? colors.primary : colors.textMuted}
                />
                <Text style={[
                  modalStyles.reasonText,
                  { color: selectedReasons.includes(reason.id) ? colors.primary : colors.textSecondary }
                ]}>{reason.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[modalStyles.submitBtn, { backgroundColor: colors.primary }]}
            onPress={handleSubmit}
            testID="rating-submit-btn"
            activeOpacity={0.8}
          >
            <Text style={modalStyles.submitBtnText}>Confirm Rating</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Mode Switcher Drawer
function ModeSwitcher({
  visible, onClose, currentMode, onModeChange, colors,
}: {
  visible: boolean;
  onClose: () => void;
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  colors: ReturnType<typeof getThemeColors>;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={drawerStyles.overlay} onPress={onClose}>
        <Pressable style={[drawerStyles.container, { backgroundColor: colors.bgCard }]} onPress={(e) => e.stopPropagation()}>
          <View style={drawerStyles.handle} />
          <Text style={[drawerStyles.title, { color: colors.text }]}>Switch Mode</Text>
          
          <TouchableOpacity
            style={[
              drawerStyles.modeOption,
              currentMode === 'date' && { borderColor: '#E50914', backgroundColor: 'rgba(229,9,20,0.1)' }
            ]}
            onPress={() => { onModeChange('date'); onClose(); }}
            testID="mode-date-btn"
          >
            <View style={[drawerStyles.modeIcon, { backgroundColor: 'rgba(229,9,20,0.2)' }]}>
              <Ionicons name="heart" size={28} color="#E50914" />
            </View>
            <View style={drawerStyles.modeInfo}>
              <Text style={[drawerStyles.modeName, { color: colors.text }]}>Movie Date</Text>
              <Text style={[drawerStyles.modeDesc, { color: colors.textSecondary }]}>Find romantic movie partners</Text>
            </View>
            {currentMode === 'date' && (
              <Ionicons name="checkmark-circle" size={24} color="#E50914" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              drawerStyles.modeOption,
              currentMode === 'buddy' && { borderColor: '#2196F3', backgroundColor: 'rgba(33,150,243,0.1)' }
            ]}
            onPress={() => { onModeChange('buddy'); onClose(); }}
            testID="mode-buddy-btn"
          >
            <View style={[drawerStyles.modeIcon, { backgroundColor: 'rgba(33,150,243,0.2)' }]}>
              <Ionicons name="people" size={28} color="#2196F3" />
            </View>
            <View style={drawerStyles.modeInfo}>
              <Text style={[drawerStyles.modeName, { color: colors.text }]}>Movie Buddy</Text>
              <Text style={[drawerStyles.modeDesc, { color: colors.textSecondary }]}>Find friends to watch with</Text>
            </View>
            {currentMode === 'buddy' && (
              <Ionicons name="checkmark-circle" size={24} color="#2196F3" />
            )}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const drawerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  container: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.l, paddingBottom: SPACING.xxl },
  handle: { width: 40, height: 4, backgroundColor: '#555', borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.l },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: SPACING.l, textAlign: 'center' },
  modeOption: {
    flexDirection: 'row', alignItems: 'center', padding: SPACING.m,
    borderRadius: BORDER_RADIUS.l, borderWidth: 2, borderColor: '#333', marginBottom: SPACING.m,
  },
  modeIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.m },
  modeInfo: { flex: 1 },
  modeName: { fontSize: 18, fontWeight: '600', marginBottom: 2 },
  modeDesc: { fontSize: 13 },
});

// Profile Drawer Component - Fully Scrollable with Swipe Dismiss
function ProfileDrawer({
  visible, onClose, onLogout, colors, onFilters, onViewProfile, onProfilePreview,
}: {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  colors: ReturnType<typeof getThemeColors>;
  onFilters: () => void;
  onViewProfile: () => void;
  onProfilePreview: () => void;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['90%'], []);

  useEffect(() => {
    if (visible) {
      getProfile().then(setProfile);
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible]);

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      onClose();
    }
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
        pressBehavior="close"
      />
    ),
    []
  );

  // Helper to extract partial location (City, State, Country)
  const getPartialLocationLocal = (fullLocation: string | undefined) => {
    if (!fullLocation) return '';
    // Split by comma and take last 3 parts (typically City, State, Country)
    const parts = fullLocation.split(',').map(p => p.trim());
    if (parts.length <= 3) return fullLocation;
    // Take last 3 parts
    return parts.slice(-3).join(', ');
  };

  const topMovies = profile?.topMovies || [];

  if (!visible) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.bgCard }}
      handleIndicatorStyle={{ backgroundColor: '#555', width: 48, height: 5 }}
    >
      <BottomSheetScrollView 
        style={profileStyles.scroll}
        contentContainerStyle={profileStyles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Header - Clickable to view full profile */}
        <TouchableOpacity style={profileStyles.header} onPress={onViewProfile} activeOpacity={0.8}>
          <View style={[profileStyles.avatarCircle, { backgroundColor: colors.primary }]}>
            <Ionicons name="person" size={32} color="#FFF" />
          </View>
          <View style={profileStyles.headerInfo}>
            <Text style={[profileStyles.name, { color: colors.text }]}>
              {profile?.name || 'User'}{profile?.age ? `, ${profile.age}` : ''}
            </Text>
            {profile?.gender && (
              <Text style={[profileStyles.genderText, { color: colors.textSecondary }]}>{profile.gender}</Text>
            )}
            {profile?.location && (
              <Text style={[profileStyles.locationText, { color: colors.textMuted }]}>
                {getPartialLocationLocal(profile.location)}
              </Text>
            )}
            <Text style={[profileStyles.viewProfileText, { color: colors.primary }]}>View & Edit Profile →</Text>
          </View>
        </TouchableOpacity>

        {/* Favourite Genres */}
        {profile?.genres && profile.genres.length > 0 && (
          <View style={profileStyles.section}>
            <Text style={[profileStyles.sectionTitle, { color: colors.textSecondary }]}>Favourite Genres</Text>
            <View style={profileStyles.tagsRow}>
              {profile.genres.slice(0, 5).map((genre, i) => (
                <View key={i} style={[profileStyles.tag, { borderColor: colors.border }]}>
                  <Text style={[profileStyles.tagText, { color: colors.text }]}>{genre}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Languages I Watch */}
        {profile?.filmLanguages && profile.filmLanguages.length > 0 && (
          <View style={profileStyles.section}>
            <Text style={[profileStyles.sectionTitle, { color: colors.textSecondary }]}>Languages I Watch</Text>
            <View style={profileStyles.tagsRow}>
              {profile.filmLanguages.map((lang, i) => (
                <View key={i} style={[profileStyles.tag, { borderColor: colors.border }]}>
                  <Text style={[profileStyles.tagText, { color: colors.text }]}>{lang}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Top 5 Movies */}
        {topMovies.length > 0 && (
          <View style={profileStyles.section}>
            <Text style={[profileStyles.sectionTitle, { color: colors.textSecondary }]}>Your Top 5 Movies</Text>
            <View style={profileStyles.moviesGrid}>
              {topMovies.map((movie, i) => (
                <View key={i} style={profileStyles.movieItem}>
                  <Image 
                    source={{ uri: `https://image.tmdb.org/t/p/w200${movie.poster_path}` }}
                    style={profileStyles.moviePoster}
                    resizeMode="cover"
                  />
                  <Text style={[profileStyles.movieTitle, { color: colors.text }]} numberOfLines={2}>{movie.title}</Text>
                  <View style={profileStyles.movieRating}>
                    <Ionicons name="star" size={12} color={colors.gold} />
                    <Text style={[profileStyles.ratingText, { color: colors.gold }]}>{movie.rating}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Other Profile Info - Preferences */}
        {(profile?.ottTheatre || profile?.movieFrequency) && (
          <View style={profileStyles.section}>
            <Text style={[profileStyles.sectionTitle, { color: colors.textSecondary }]}>Preferences</Text>
            {profile?.ottTheatre && (
              <View style={profileStyles.infoRow}>
                <Ionicons name="tv-outline" size={18} color={colors.textMuted} />
                <Text style={[profileStyles.infoText, { color: colors.text }]}>{profile.ottTheatre}</Text>
              </View>
            )}
            {profile?.movieFrequency && (
              <View style={profileStyles.infoRow}>
                <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                <Text style={[profileStyles.infoText, { color: colors.text }]}>{profile.movieFrequency}</Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={profileStyles.buttonsContainer}>
          {/* Profile Preview Button - NEW */}
          <TouchableOpacity
            style={[profileStyles.previewBtn, { backgroundColor: colors.gold }]}
            onPress={onProfilePreview}
            testID="profile-preview-btn"
            activeOpacity={0.8}
          >
            <Ionicons name="eye-outline" size={20} color="#000" />
            <Text style={profileStyles.previewBtnText}>Profile Preview</Text>
          </TouchableOpacity>

          {/* View Full Profile Button */}
          <TouchableOpacity
            style={[profileStyles.viewProfileBtn, { backgroundColor: colors.primary }]}
            onPress={onViewProfile}
            testID="view-profile-btn"
            activeOpacity={0.8}
          >
            <Ionicons name="person-circle-outline" size={20} color="#FFF" />
            <Text style={profileStyles.viewProfileBtnText}>View & Edit Full Profile</Text>
          </TouchableOpacity>

          {/* Preferences & Filters Button */}
          <TouchableOpacity
            style={[profileStyles.filtersBtn, { borderColor: colors.primary }]}
            onPress={onFilters}
            testID="filters-btn"
            activeOpacity={0.7}
          >
            <Ionicons name="options-outline" size={20} color={colors.primary} />
            <Text style={[profileStyles.filtersBtnText, { color: colors.primary }]}>Preferences & Filters</Text>
          </TouchableOpacity>

          {/* Logout Button */}
          <TouchableOpacity
            style={[profileStyles.logoutBtn, { borderColor: '#FF6B6B' }]}
            onPress={onLogout}
            testID="logout-btn"
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color="#FF6B6B" />
            <Text style={profileStyles.logoutText}>Logout & Start Over</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const profileStyles = StyleSheet.create({
  scroll: { flex: 1, paddingHorizontal: SPACING.l },
  scrollContent: { paddingBottom: SPACING.l },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.l, paddingTop: SPACING.s },
  avatarCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.m },
  headerInfo: { flex: 1 },
  name: { fontSize: 22, fontWeight: 'bold', marginBottom: 2 },
  genderText: { fontSize: 14, marginBottom: 2 },
  locationText: { fontSize: 13, marginBottom: SPACING.xs },
  viewProfileText: { fontSize: 12, fontWeight: '600', marginTop: SPACING.xs },
  section: { marginBottom: SPACING.l },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: SPACING.s, textTransform: 'uppercase', letterSpacing: 1 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BORDER_RADIUS.full, borderWidth: 1 },
  tagText: { fontSize: 13 },
  moviesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  movieItem: { width: 80, alignItems: 'center' },
  moviePoster: { width: 70, height: 100, borderRadius: BORDER_RADIUS.s, marginBottom: 4 },
  movieTitle: { fontSize: 10, textAlign: 'center', marginBottom: 2 },
  movieRating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 11, fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s, marginBottom: SPACING.s },
  infoText: { fontSize: 14 },
  buttonsContainer: { marginTop: SPACING.m },
  previewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.s,
    paddingVertical: 14, borderRadius: BORDER_RADIUS.full, marginBottom: SPACING.m,
  },
  previewBtnText: { fontSize: 16, fontWeight: '600', color: '#000' },
  viewProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.s,
    paddingVertical: 14, borderRadius: BORDER_RADIUS.full, marginBottom: SPACING.m,
  },
  viewProfileBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  filtersBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.s,
    paddingVertical: 14, borderRadius: BORDER_RADIUS.full, borderWidth: 2, marginBottom: SPACING.m,
  },
  filtersBtnText: { fontSize: 16, fontWeight: '600' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.s,
    paddingVertical: 14, borderRadius: BORDER_RADIUS.full, borderWidth: 2,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#FF6B6B' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: SPACING.l },
  container: { borderRadius: BORDER_RADIUS.xl, padding: SPACING.l, width: '100%', maxWidth: 360, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s, marginBottom: SPACING.s, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: 'bold' },
  movieTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: SPACING.m },
  subtitle: { fontSize: 14, marginBottom: SPACING.m, textAlign: 'center' },
  starsContainer: { flexDirection: 'row', gap: SPACING.s, marginBottom: SPACING.s, justifyContent: 'center' },
  ratingLabel: { fontSize: 14, marginBottom: SPACING.m, textAlign: 'center' },
  optionalLabel: { fontSize: 13, marginBottom: SPACING.s, textAlign: 'center' },
  reasonsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s, marginBottom: SPACING.l, justifyContent: 'center' },
  reasonChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1.5,
  },
  reasonText: { fontSize: 12, fontWeight: '500' },
  submitBtn: { paddingVertical: 14, borderRadius: BORDER_RADIUS.full, width: '100%' },
  submitBtnText: { fontSize: 16, fontWeight: 'bold', color: '#FFF', textAlign: 'center' },
  didntWatchNote: { fontSize: 12, textAlign: 'center', marginBottom: SPACING.m, fontStyle: 'italic' },
});

function SwipeCard({
  movie, isTop, onSwipe, onInfo, colors,
}: {
  movie: FeedMovie;
  isTop: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
  onInfo: () => void;
  colors: ReturnType<typeof getThemeColors>;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotation = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY * 0.3;
      rotation.value = interpolate(
        translateX.value,
        [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
        [-15, 0, 15],
        Extrapolation.CLAMP
      );
    })
    .onEnd((event) => {
      if (Math.abs(translateX.value) > SWIPE_THRESHOLD) {
        const direction = translateX.value > 0 ? 'right' : 'left';
        const toValue = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
        translateX.value = withTiming(toValue, { duration: 250 }, () => {
          runOnJS(onSwipe)(direction);
        });
        translateY.value = withTiming(event.velocityY * 0.1, { duration: 250 });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        rotation.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const nopeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const year = movie.release_date?.split('-')[0] || '';
  const genres = movie.genre_ids
    ?.slice(0, 3)
    .map((id) => TMDB_GENRE_MAP[id])
    .filter(Boolean)
    .join(' • ') || '';

  if (!isTop) {
    return (
      <View style={[styles.card, styles.cardBehind]} testID={`card-behind-${movie.id}`}>
        <Image source={{ uri: `${TMDB_IMAGE_BASE}${movie.poster_path}` }} style={styles.poster} resizeMode="cover" />
      </View>
    );
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, cardStyle]} testID={`swipe-card-${movie.id}`}>
        <Image source={{ uri: `${TMDB_IMAGE_BASE}${movie.poster_path}` }} style={styles.poster} resizeMode="cover" />

        {/* Info Button */}
        <TouchableOpacity
          style={styles.infoBtn}
          onPress={onInfo}
          testID="movie-info-btn"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="information-circle" size={32} color="#FFF" />
        </TouchableOpacity>

        <Animated.View style={[styles.stamp, styles.likeStamp, { borderColor: colors.primary }, likeStyle]}>
          <Text style={[styles.stampText, { color: colors.primary }]}>LIKED</Text>
        </Animated.View>

        <Animated.View style={[styles.stamp, styles.nopeStamp, nopeStyle]}>
          <Text style={[styles.stampText, styles.nopeText]}>NOPE</Text>
        </Animated.View>

        <View style={styles.infoContainer}>
          <Text style={styles.movieTitle} numberOfLines={2}>{movie.title}</Text>
          <View style={styles.metaRow}>
            {year ? <Text style={styles.year}>{year}</Text> : null}
            {movie.vote_average > 0 && (
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <Text style={styles.ratingText}>{movie.vote_average.toFixed(1)}</Text>
              </View>
            )}
          </View>
          {genres ? <Text style={styles.genres}>{genres}</Text> : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export default function SwipeScreen() {
  const router = useRouter();
  const [movies, setMovies] = useState<FeedMovie[]>([]);
  const [swipeState, setSwipeState] = useState<SwipeState>(initialSwipeState);
  const [loading, setLoading] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showLeftModal, setShowLeftModal] = useState(false);
  const [showModeDrawer, setShowModeDrawer] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedMovieId, setSelectedMovieId] = useState(0);
  const [pendingMovie, setPendingMovie] = useState<FeedMovie | null>(null);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<AppMode>('date');
  const fetchingRef = useRef(false);

  const colors = getThemeColors(mode);
  const remainingSwipes = Math.max(0, REQUIRED_SWIPES - swipeState.totalSwipes);
  const isProfileComplete = swipeState.totalSwipes >= REQUIRED_SWIPES;

  // Load saved state
  useEffect(() => {
    (async () => {
      const [savedSwipes, savedMode] = await Promise.all([getSwipeState(), getMode()]);
      if (savedSwipes) setSwipeState(savedSwipes);
      if (savedMode) setMode(savedMode);
    })();
  }, []);

  const handleModeChange = async (newMode: AppMode) => {
    setMode(newMode);
    await saveMode(newMode);
  };

  const handleLogout = async () => {
    await clearAll();
    setShowProfileDrawer(false);
    router.replace('/');
  };

  // Handle opening profile preview from profile drawer
  const handleOpenProfilePreview = () => {
    setShowProfileDrawer(false);
    setShowProfilePreview(true);
  };

  // Handle closing profile preview - returns to profile drawer
  const handleCloseProfilePreview = () => {
    setShowProfilePreview(false);
    setShowProfileDrawer(true);
  };

  const handleShowDetails = (movieId: number) => {
    setSelectedMovieId(movieId);
    setShowDetailsModal(true);
  };

  // Fetch movie feed
  const fetchMovies = useCallback(async (pageNum: number) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const [filters, profile] = await Promise.all([getFilters(), getProfile()]);
      const excludeIds = swipeState.swipedMovieIds.join(',');
      const genres = filters?.genres?.selected?.join(',') || profile?.genres?.join(',') || '';
      const languages = filters?.languages?.selected?.join(',') || '';

      const likedGenres: number[] = [];
      swipeState.swipes
        .filter((s) => s.direction === 'right' && s.rating >= 4)
        .forEach((s) => {
          s.genreIds.forEach((g) => {
            if (!likedGenres.includes(g)) likedGenres.push(g);
          });
        });

      const recentLiked = swipeState.swipes
        .filter((s) => s.direction === 'right' && s.rating >= 4)
        .slice(-1)[0];
      const seedMovieId = recentLiked?.movieId || 0;

      const params = new URLSearchParams({
        genres, languages, page: String(pageNum), exclude: excludeIds,
        seed_movie_id: String(seedMovieId), liked_genres: likedGenres.slice(0, 5).join(','),
      });

      const res = await fetch(`${BACKEND_URL}/api/tmdb/feed?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch feed');
      const data = await res.json();

      const newMovies: FeedMovie[] = data.results.filter(
        (m: FeedMovie) => !swipeState.swipedMovieIds.includes(m.id)
      );

      setMovies((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const filtered = newMovies.filter((m: FeedMovie) => !existingIds.has(m.id));
        return [...prev, ...filtered];
      });
    } catch (err) {
      console.error('Error fetching movies:', err);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [swipeState.swipedMovieIds, swipeState.swipes]);

  useEffect(() => { fetchMovies(page); }, [page]);

  useEffect(() => {
    if (movies.length < 5 && !loading) setPage((p) => p + 1);
  }, [movies.length, loading]);

  const handleSwipe = useCallback((direction: 'left' | 'right', movie: FeedMovie) => {
    setPendingMovie(movie);
    if (direction === 'right') {
      setShowRatingModal(true);
    } else {
      setShowLeftModal(true);
    }
    setMovies((prev) => prev.filter((m) => m.id !== movie.id));
  }, []);

  const recordSwipe = useCallback(async (
    movie: FeedMovie, direction: 'left' | 'right', rating: number, reasons: string[], didntWatch: boolean = false
  ) => {
    const record: SwipeRecord = {
      movieId: movie.id, title: movie.title, direction, rating, reasons,
      genreIds: movie.genre_ids || [], timestamp: new Date().toISOString(),
    };

    // If user didn't watch the movie, don't count it toward taste profile
    const countsForProfile = !didntWatch;
    
    const newState: SwipeState = {
      swipes: [...swipeState.swipes, record],
      // Only increment totalSwipes if the movie counts for taste profiling
      totalSwipes: countsForProfile ? swipeState.totalSwipes + 1 : swipeState.totalSwipes,
      swipedMovieIds: [...swipeState.swipedMovieIds, movie.id],
    };

    setSwipeState(newState);
    await saveSwipeState(newState);
  }, [swipeState]);

  const handleRatingSubmit = useCallback((rating: number, reasons: string[]) => {
    if (pendingMovie) {
      recordSwipe(pendingMovie, 'right', rating, reasons);
      setPendingMovie(null);
    }
    setShowRatingModal(false);
  }, [pendingMovie, recordSwipe]);

  const handleLeftSubmit = useCallback((reasons: string[], didntWatch: boolean) => {
    if (pendingMovie) {
      // If user didn't watch the movie, don't count it for taste profiling
      recordSwipe(pendingMovie, 'left', 0, reasons, didntWatch);
      setPendingMovie(null);
    }
    setShowLeftModal(false);
  }, [pendingMovie, recordSwipe]);

  const currentMovie = movies[0];
  const nextMovie = movies[1];

  const dynamicStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    headerBorder: { borderBottomColor: colors.border },
    counterBadge: { backgroundColor: colors.primary },
    progressFill: { backgroundColor: colors.gold },
    likeBtn: { borderColor: `${colors.primary}60`, backgroundColor: `${colors.primary}15` },
    dislikeBtn: { borderColor: 'rgba(255,107,107,0.4)', backgroundColor: 'rgba(255,107,107,0.1)' },
  });

  return (
    <SafeAreaView style={dynamicStyles.container} testID="swipe-screen">
      {/* Header */}
      <View style={[styles.header, dynamicStyles.headerBorder]}>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => setShowModeDrawer(true)}
          testID="menu-btn"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name={colors.modeIcon} size={22} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>{colors.modeName}</Text>
        </View>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => setShowProfileDrawer(true)}
          testID="profile-btn"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="person-circle-outline" size={28} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Progress indicator */}
      {!isProfileComplete && (
        <View style={styles.progressContainer}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            Swipe {remainingSwipes} more to build your taste profile
          </Text>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, dynamicStyles.progressFill, { width: `${(swipeState.totalSwipes / REQUIRED_SWIPES) * 100}%` }]} />
          </View>
        </View>
      )}

      {/* Cards stack */}
      <View style={styles.cardsContainer}>
        {loading && movies.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading movies...</Text>
          </View>
        ) : movies.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="film-outline" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No more movies to show</Text>
            <TouchableOpacity
              style={[styles.refreshBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setPage(1); setLoading(true); fetchMovies(1); }}
              testID="refresh-movies-btn"
            >
              <Text style={styles.refreshBtnText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {nextMovie && <SwipeCard key={nextMovie.id} movie={nextMovie} isTop={false} onSwipe={() => {}} onInfo={() => {}} colors={colors} />}
            {currentMovie && (
              <SwipeCard 
                key={currentMovie.id} 
                movie={currentMovie} 
                isTop={true} 
                onSwipe={(dir) => handleSwipe(dir, currentMovie)} 
                onInfo={() => handleShowDetails(currentMovie.id)}
                colors={colors} 
              />
            )}
          </>
        )}
      </View>

      {/* Action buttons - Only X and Heart */}
      {movies.length > 0 && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionBtn, dynamicStyles.dislikeBtn]}
            onPress={() => currentMovie && handleSwipe('left', currentMovie)}
            testID="swipe-left-btn"
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={32} color="#FF6B6B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, dynamicStyles.likeBtn]}
            onPress={() => currentMovie && handleSwipe('right', currentMovie)}
            testID="swipe-right-btn"
            activeOpacity={0.8}
          >
            <Ionicons name="heart" size={28} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <View style={styles.instructionItem}>
          <Ionicons name="arrow-back" size={16} color={colors.textMuted} />
          <Text style={[styles.instructionText, { color: colors.textMuted }]}>Not interested</Text>
        </View>
        <View style={styles.instructionItem}>
          <Text style={[styles.instructionText, { color: colors.textMuted }]}>Liked it!</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
        </View>
      </View>

      {/* Modals */}
      <RatingModal
        visible={showRatingModal}
        onClose={() => { setShowRatingModal(false); setPendingMovie(null); }}
        onSubmit={handleRatingSubmit}
        movieTitle={pendingMovie?.title || ''}
        colors={colors}
      />
      <LeftSwipeModal
        visible={showLeftModal}
        onClose={() => { setShowLeftModal(false); setPendingMovie(null); }}
        onSubmit={handleLeftSubmit}
        movieTitle={pendingMovie?.title || ''}
        colors={colors}
      />
      <ModeSwitcher
        visible={showModeDrawer}
        onClose={() => setShowModeDrawer(false)}
        currentMode={mode}
        onModeChange={handleModeChange}
        colors={colors}
      />
      <ProfileDrawer
        visible={showProfileDrawer}
        onClose={() => setShowProfileDrawer(false)}
        onLogout={handleLogout}
        onFilters={() => { setShowProfileDrawer(false); router.push('/filters?from=profile'); }}
        onViewProfile={() => { setShowProfileDrawer(false); router.push('/profile'); }}
        onProfilePreview={handleOpenProfilePreview}
        colors={colors}
      />
      <MovieDetailsBottomSheet
        visible={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        movieId={selectedMovieId}
        colors={colors}
      />
      {/* In-App Profile Preview - Self-contained component with visibility editing */}
      <InAppProfilePreview
        visible={showProfilePreview}
        onClose={handleCloseProfilePreview}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.m, paddingVertical: SPACING.s, borderBottomWidth: 1,
  },
  menuBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  profileBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  headerRight: { width: 44, alignItems: 'flex-end' },
  counterBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BORDER_RADIUS.full, minWidth: 32, alignItems: 'center', marginLeft: SPACING.s },
  counterText: { fontSize: 14, fontWeight: 'bold', color: '#FFF' },
  progressContainer: { paddingHorizontal: SPACING.l, paddingVertical: SPACING.m },
  progressText: { fontSize: 13, textAlign: 'center', marginBottom: SPACING.s },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  cardsContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden', backgroundColor: '#1E1E1E' },
  cardBehind: { transform: [{ scale: 0.95 }], opacity: 0.7 },
  poster: { width: '100%', height: '100%' },
  infoBtn: {
    position: 'absolute', top: 12, right: 12, width: 44, height: 44,
    borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  stamp: { position: 'absolute', top: 40, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 4, borderRadius: 8 },
  likeStamp: { right: 20, transform: [{ rotate: '15deg' }] },
  nopeStamp: { left: 20, borderColor: '#FF6B6B', transform: [{ rotate: '-15deg' }] },
  stampText: { fontSize: 28, fontWeight: 'bold', letterSpacing: 2 },
  nopeText: { color: '#FF6B6B' },
  infoContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: SPACING.l, backgroundColor: 'rgba(0,0,0,0.75)' },
  movieTitle: { fontSize: 22, fontWeight: 'bold', color: '#FFF', marginBottom: SPACING.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.m, marginBottom: SPACING.xs },
  year: { fontSize: 15, color: '#B3B3B3', fontWeight: '500' },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,215,0,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: BORDER_RADIUS.s },
  ratingText: { fontSize: 14, color: '#FFD700', fontWeight: '600' },
  genres: { fontSize: 13, color: '#757575' },
  actionsContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACING.l, paddingVertical: SPACING.m },
  actionBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  infoActionBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  instructionsContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.xxl, paddingBottom: SPACING.m },
  instructionItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  instructionText: { fontSize: 12 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', gap: SPACING.m },
  loadingText: { fontSize: 16 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', gap: SPACING.m },
  emptyText: { fontSize: 16 },
  refreshBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: BORDER_RADIUS.full },
  refreshBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
});
