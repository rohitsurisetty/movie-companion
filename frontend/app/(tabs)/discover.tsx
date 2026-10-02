import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Image, TouchableOpacity,
  ActivityIndicator, Modal, Pressable, BackHandler,
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
  SPACING, BORDER_RADIUS,
  LEFT_SWIPE_REASONS, RIGHT_SWIPE_REASONS,
} from '../../src/theme';
import {
  FeedMovie, SwipeState, SwipeRecord, initialSwipeState, TMDB_GENRE_MAP, MovieDetail as BaseMovieDetail,
} from '../../src/types';
import { apiUrl, getUserId, saveSwipeState, getSwipeState, getFilters, getProfile } from '../../src/store';
import { useAppMode, type ThemeColors } from '../../src/components/SharedHeader';
import { shadow } from '../../src/utils/shadow';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.88;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.55;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const REQUIRED_SWIPES = 20;

// /api/tmdb/movie/{id} also returns vote_count (not on the shared type).
type MovieDetail = BaseMovieDetail & { vote_count?: number };

// Why auto-fetching stopped; cleared by the Retry button.
type FeedLoadError = 'failed' | 'rate_limited';

// fetch() with an abort timeout so a hung request can't block the deck.
async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Movie Details Bottom Sheet - Uses @gorhom/bottom-sheet for proper scroll + swipe handling
function MovieDetailsBottomSheet({
  visible, onClose, movieId, colors,
}: {
  visible: boolean;
  onClose: () => void;
  movieId: number;
  colors: ThemeColors;
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

  // Android back closes the sheet instead of leaving the tab.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const fetchDetails = async () => {
    setLoading(true);
    setDetails(null); // never show the previous movie's details
    try {
      const resp = await fetchWithTimeout(apiUrl(`/api/tmdb/movie/${movieId}`));
      if (resp.ok) {
        const data = await resp.json();
        setDetails(data);
      }
    } catch {
      // falls through to the "Could not load movie details" state
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
                  {(details.vote_count ?? 0) > 0 && (
                    <Text style={[detailStyles.voteCount, { color: colors.textMuted }]}>
                      ({(details.vote_count ?? 0).toLocaleString()} votes)
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
                    <View style={[detailStyles.castAvatar, { backgroundColor: '#2C2C2C' }]}>
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
    ...shadow({ color: '#000', offsetY: -4, blur: 4, opacity: 0.25, elevation: 5 }),
  },
  handleArea: { 
    alignItems: 'center', 
    paddingBottom: SPACING.s,
    paddingHorizontal: SPACING.l,
  },
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

// Left Swipe Reason Modal. Reasons are optional, so dismissing it (Android
// back / backdrop) records the skip with whatever was selected.
function LeftSwipeModal({
  visible, onSubmit, onUndo, movieTitle, colors,
}: {
  visible: boolean;
  onSubmit: (reasons: string[], didntWatch: boolean) => void;
  onUndo: () => void;
  movieTitle: string;
  colors: ThemeColors;
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

  const handleUndo = () => {
    setSelectedReasons([]);
    onUndo();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSubmit}>
      <Pressable style={modalStyles.overlay} onPress={handleSubmit}>
        <Pressable style={[modalStyles.container, { backgroundColor: colors.bgCard }]} onPress={(e) => e.stopPropagation()}>
          {/* Undo button at top */}
          <TouchableOpacity
            style={modalStyles.undoBtn}
            onPress={handleUndo}
            testID="undo-left-swipe-btn"
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-undo" size={18} color={colors.textSecondary} />
            <Text style={[modalStyles.undoBtnText, { color: colors.textSecondary }]}>Undo Swipe</Text>
          </TouchableOpacity>

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
              {"This movie won't affect your taste profile"}
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

// Right Swipe Rating Modal with Reasons. A like needs a confirmed rating, so
// dismissing it (Android back / backdrop) restores the card like Undo.
function RatingModal({
  visible, onSubmit, onUndo, movieTitle, colors,
}: {
  visible: boolean;
  onSubmit: (rating: number, reasons: string[]) => void;
  onUndo: () => void;
  movieTitle: string;
  colors: ThemeColors;
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

  const handleUndo = () => {
    setRating(3);
    setSelectedReasons([]);
    onUndo();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleUndo}>
      <Pressable style={modalStyles.overlay} onPress={handleUndo}>
        <Pressable style={[modalStyles.container, { backgroundColor: colors.bgCard }]} onPress={(e) => e.stopPropagation()}>
          {/* Undo button at top */}
          <TouchableOpacity
            style={modalStyles.undoBtn}
            onPress={handleUndo}
            testID="undo-swipe-btn"
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-undo" size={18} color={colors.textSecondary} />
            <Text style={[modalStyles.undoBtnText, { color: colors.textSecondary }]}>Undo Swipe</Text>
          </TouchableOpacity>

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

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: SPACING.l },
  container: { borderRadius: BORDER_RADIUS.xl, padding: SPACING.l, width: '100%', maxWidth: 360, maxHeight: '85%' },
  undoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: SPACING.m,
  },
  undoBtnText: { fontSize: 13, fontWeight: '500' },
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
  colors: ThemeColors;
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
        translateX.value = withTiming(toValue, { duration: 250 }, (finished) => {
          // Not when cancelled (card removed by a button tap mid-flight) —
          // that would fire a second swipe for the same movie.
          if (finished) runOnJS(onSwipe)(direction);
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
  const { colors } = useAppMode();
  
  const [movies, setMovies] = useState<FeedMovie[]>([]);
  const [swipeState, setSwipeState] = useState<SwipeState>(initialSwipeState);
  const [loading, setLoading] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showLeftModal, setShowLeftModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedMovieId, setSelectedMovieId] = useState(0);
  const [pendingMovie, setPendingMovie] = useState<FeedMovie | null>(null);
  const fetchingRef = useRef(false);

  const remainingSwipes = Math.max(0, REQUIRED_SWIPES - swipeState.totalSwipes);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [showSkippedToast, setShowSkippedToast] = useState(false);

  const isProfileComplete = swipeState.totalSwipes >= REQUIRED_SWIPES;

  const handleShowDetails = (movieId: number) => {
    setSelectedMovieId(movieId);
    setShowDetailsModal(true);
  };
  const handleCloseDetails = useCallback(() => setShowDetailsModal(false), []);

  // Signed-in user id. The backend takes the identity from the session; the
  // id is only sent because the request models require the field.
  const [userId, setUserId] = useState<string>('');

  // Pagination. Auto-fetching stops after any error or 2 consecutive pages
  // that added nothing (loadError → "Couldn't load more — Retry").
  const nextPageRef = useRef(1);
  const emptyFetchCount = useRef(0);
  const [loadError, setLoadError] = useState<FeedLoadError | null>(null);
  // Mirrors of state read inside async fetches (avoids stale closures).
  const moviesRef = useRef<FeedMovie[]>([]);
  const swipedIdsRef = useRef<number[]>([]);
  useEffect(() => { moviesRef.current = movies; }, [movies]);
  useEffect(() => { swipedIdsRef.current = swipeState.swipedMovieIds; }, [swipeState.swipedMovieIds]);

  // Resolve the signed-in user and the saved swipe state. Onboarding posts
  // the profile, so Discover only reads recommendations.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let id = '';
      let savedSwipes: SwipeState | null = null;
      try {
        [id, savedSwipes] = await Promise.all([getUserId(), getSwipeState()]);
      } catch {
        id = '';
      }
      if (cancelled) return;
      if (!id) {
        router.replace('/');
        return;
      }
      if (savedSwipes) {
        swipedIdsRef.current = savedSwipes.swipedMovieIds || [];
        setSwipeState(savedSwipes);
      }
      setUserId(id);
    })();
    return () => { cancelled = true; };
  }, [router]);

  // Adds unseen movies to the deck; returns how many were actually added.
  const appendMovies = (incoming: FeedMovie[]): number => {
    const seen = new Set<number>([...swipedIdsRef.current, ...moviesRef.current.map((m) => m.id)]);
    const fresh: FeedMovie[] = [];
    for (const m of incoming) {
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      fresh.push(m);
    }
    if (fresh.length > 0) {
      moviesRef.current = [...moviesRef.current, ...fresh];
      setMovies((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        return [...prev, ...fresh.filter((m) => !ids.has(m.id))];
      });
    }
    return fresh.length;
  };

  // Fallback to the plain TMDB feed (saved filters / profile genres).
  const fetchMoviesFallback = async (pageNum: number, rateLimited: boolean): Promise<number | FeedLoadError> => {
    try {
      const [filters, profile] = await Promise.all([getFilters(), getProfile()]);
      const params = new URLSearchParams({
        genres: filters?.genres?.selected?.join(',') || profile?.genres?.join(',') || '',
        languages: filters?.languages?.selected?.join(',') || '',
        page: String(Math.min(pageNum, 100)), // TMDB caps discover pages
        exclude: swipedIdsRef.current.join(','),
        seed_movie_id: '0', liked_genres: '',
      });
      const res = await fetchWithTimeout(apiUrl(`/api/tmdb/feed?${params.toString()}`), {}, 10000);
      if (!res.ok) return rateLimited || res.status === 429 ? 'rate_limited' : 'failed';
      const data = await res.json();
      return appendMovies(Array.isArray(data?.results) ? data.results : []);
    } catch {
      return rateLimited ? 'rate_limited' : 'failed';
    }
  };

  // One page of personalised recommendations (fallback: /api/tmdb/feed).
  // Resolves to the number of movies added to the deck, or the error.
  const fetchPage = async (pageNum: number): Promise<number | FeedLoadError> => {
    let rateLimited = false;
    try {
      const res = await fetchWithTimeout(apiUrl('/api/recommendations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, page: pageNum, limit: 20 }),
      });
      if (res.ok) {
        const data = await res.json();
        const results: any[] = Array.isArray(data?.results) ? data.results.filter(Boolean) : [];
        return appendMovies(results.map((m: any) => ({
          id: m.id,
          title: m.title,
          poster_path: m.poster_path,
          backdrop_path: m.backdrop_path,
          release_date: m.release_date,
          overview: m.overview,
          vote_average: m.vote_average,
          genre_ids: m.genre_ids,
        })));
      }
      rateLimited = res.status === 429;
    } catch {
      // network error / timeout → fallback feed
    }
    return fetchMoviesFallback(pageNum, rateLimited);
  };

  // Loads the next page. Stops auto-fetching (loadError) after any error or
  // 2 consecutive empty pages; Retry resumes — never resets to page 1.
  const loadNextPage = async () => {
    if (fetchingRef.current || !userId) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const pageNum = nextPageRef.current;
      const result = await fetchPage(pageNum);
      if (typeof result !== 'number') {
        setLoadError(result); // Retry re-requests this page
        return;
      }
      nextPageRef.current = pageNum + 1;
      if (result > 0) {
        emptyFetchCount.current = 0;
      } else {
        emptyFetchCount.current += 1;
        if (emptyFetchCount.current >= 2) setLoadError('failed');
      }
    } catch {
      setLoadError('failed');
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  };

  // Keep the deck topped up; re-checked after every fetch (loading flips back).
  useEffect(() => {
    if (userId && !loading && !loadError && movies.length < 5) {
      loadNextPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loading, loadError, movies.length]);

  const handleRetry = () => {
    emptyFetchCount.current = 0;
    setLoadError(null);
  };

  const handleSwipe = useCallback((direction: 'left' | 'right', movie: FeedMovie) => {
    setPendingMovie(movie);
    
    if (direction === 'right') {
      setShowRatingModal(true);
    } else {
      setShowLeftModal(true);
    }
    setMovies((prev) => prev.filter((m) => m.id !== movie.id));
  }, []);

  // Undo (and rating-modal dismiss): put the pending card back on top.
  const handleUndo = useCallback(() => {
    setShowRatingModal(false);
    setShowLeftModal(false);
    if (!pendingMovie) return;
    const restored = pendingMovie;
    setMovies((prev) => (prev.some((m) => m.id === restored.id) ? prev : [restored, ...prev]));
    setPendingMovie(null);

    // Show brief toast confirmation
    setShowUndoToast(true);
    setTimeout(() => setShowUndoToast(false), 1500);
  }, [pendingMovie]);

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

    swipedIdsRef.current = newState.swipedMovieIds;
    setSwipeState(newState);
    await saveSwipeState(newState).catch(() => undefined);

    // Send swipe to backend recommendation engine (only if it counts for profiling)
    if (countsForProfile && userId) {
      try {
        await fetch(apiUrl('/api/user/swipe'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            movie_id: movie.id,
            direction: direction,
            rating: direction === 'right' ? rating : null,
            reason: reasons.length > 0 ? reasons.join(', ') : null,
          }),
        });
      } catch {
        // best effort — the swipe is already saved locally
      }
    }
  }, [swipeState, userId]);

  const handleRatingSubmit = useCallback((rating: number, reasons: string[]) => {
    // Close modal and clear pending state FIRST for immediate UI response
    setShowRatingModal(false);
    const movieToRecord = pendingMovie;
    setPendingMovie(null);
    
    // Then record the swipe asynchronously (non-blocking)
    if (movieToRecord) {
      recordSwipe(movieToRecord, 'right', rating, reasons);
    }
  }, [pendingMovie, recordSwipe]);

  const handleLeftSubmit = useCallback((reasons: string[], didntWatch: boolean) => {
    // Close modal and clear pending state FIRST for immediate UI response
    setShowLeftModal(false);
    const movieToRecord = pendingMovie;
    setPendingMovie(null);
    
    // Then record the swipe asynchronously (non-blocking)
    if (movieToRecord) {
      recordSwipe(movieToRecord, 'left', 0, reasons, didntWatch);
    }
  }, [pendingMovie, recordSwipe]);

  // Handle "Not Watched" - skip movie without affecting recommendations
  const handleNotWatched = useCallback((movie: FeedMovie) => {
    // Remove from current deck
    setMovies((prev) => prev.filter((m) => m.id !== movie.id));
    
    // Record as "not watched" - doesn't count for recommendations
    recordSwipe(movie, 'left', 0, ['not_watched'], true);
    
    // Show "Movie skipped" toast (not undo toast)
    setShowSkippedToast(true);
    setTimeout(() => setShowSkippedToast(false), 1500);
  }, [recordSwipe]);

  const currentMovie = movies[0];
  const nextMovie = movies[1];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']} testID="swipe-screen">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.brandMark}>
          <Ionicons name="film-outline" size={22} color={colors.primary} />
        </View>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Discover</Text>
        </View>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => router.push('/filters')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="options" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Progress indicator */}
      {!isProfileComplete && (
        <View style={styles.progressContainer}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            Swipe {remainingSwipes} more to build your taste profile
          </Text>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.gold, width: `${(swipeState.totalSwipes / REQUIRED_SWIPES) * 100}%` }]} />
          </View>
        </View>
      )}

      {/* Cards stack */}
      <View style={styles.cardsContainer}>
        {movies.length === 0 && !loadError ? (
          // Auto-fetch keeps going until cards arrive or loadError is set.
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading movies...</Text>
          </View>
        ) : movies.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="film-outline" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {loadError === 'rate_limited' ? 'Too many requests — try again shortly' : "Couldn't load more"}
            </Text>
            <TouchableOpacity
              style={[styles.refreshBtn, { backgroundColor: colors.primary }]}
              onPress={handleRetry}
              disabled={loading}
              testID="refresh-movies-btn"
            >
              <Text style={styles.refreshBtnText}>Retry</Text>
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
            style={[styles.actionBtn, styles.dislikeBtn]}
            onPress={() => currentMovie && handleSwipe('left', currentMovie)}
            testID="swipe-left-btn"
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={32} color="#FF6B6B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.notWatchedBtn]}
            onPress={() => currentMovie && handleNotWatched(currentMovie)}
            testID="not-watched-btn"
            activeOpacity={0.8}
          >
            <Ionicons name="eye-off-outline" size={26} color="#888" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: `${colors.primary}60`, backgroundColor: `${colors.primary}15` }]}
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
          <Text style={[styles.instructionText, { color: colors.textMuted }]}>{"Didn't like"}</Text>
        </View>
        <View style={styles.instructionItem}>
          <Ionicons name="eye-off-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.instructionText, { color: colors.textMuted }]}>Not watched</Text>
        </View>
        <View style={styles.instructionItem}>
          <Text style={[styles.instructionText, { color: colors.textMuted }]}>Liked it!</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
        </View>
      </View>

      {/* Modals */}
      <RatingModal
        visible={showRatingModal}
        onSubmit={handleRatingSubmit}
        onUndo={handleUndo}
        movieTitle={pendingMovie?.title || ''}
        colors={colors}
      />
      <LeftSwipeModal
        visible={showLeftModal}
        onSubmit={handleLeftSubmit}
        onUndo={handleUndo}
        movieTitle={pendingMovie?.title || ''}
        colors={colors}
      />
      <MovieDetailsBottomSheet
        visible={showDetailsModal}
        onClose={handleCloseDetails}
        movieId={selectedMovieId}
        colors={colors}
      />

      {/* Undo Toast Notification */}
      {showUndoToast && (
        <View style={[styles.undoToast, { backgroundColor: colors.bgCard }]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
          <Text style={[styles.undoToastText, { color: colors.text }]}>Swipe undone!</Text>
        </View>
      )}
      
      {/* Movie Skipped Toast */}
      {showSkippedToast && (
        <View style={[styles.undoToast, { backgroundColor: colors.bgCard }]}>
          <Ionicons name="eye-off" size={20} color={colors.textMuted} />
          <Text style={[styles.undoToastText, { color: colors.text }]}>Movie skipped</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.m, paddingVertical: SPACING.s, borderBottomWidth: 1,
  },
  brandMark: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  profileBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
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
  dislikeBtn: { borderColor: 'rgba(255,107,107,0.4)', backgroundColor: 'rgba(255,107,107,0.1)' },
  notWatchedBtn: { borderColor: 'rgba(136,136,136,0.4)', backgroundColor: 'rgba(136,136,136,0.1)' },
  instructionsContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.xxl, paddingBottom: SPACING.m },
  instructionItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  instructionText: { fontSize: 12 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', gap: SPACING.m },
  loadingText: { fontSize: 16 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', gap: SPACING.m },
  emptyText: { fontSize: 16 },
  refreshBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: BORDER_RADIUS.full },
  refreshBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  undoToast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.full,
    ...shadow({ color: '#000', offsetY: 2, blur: 4, opacity: 0.25, elevation: 5 }),
  },
  undoToastText: { fontSize: 14, fontWeight: '600' },
});
