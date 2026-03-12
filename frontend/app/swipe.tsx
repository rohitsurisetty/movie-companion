import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Image, TouchableOpacity,
  ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import {
  FeedMovie, SwipeState, SwipeRecord, initialSwipeState, TMDB_GENRE_MAP,
} from '../src/types';
import { saveSwipeState, getSwipeState, getFilters, getProfile } from '../src/store';
import Constants from 'expo-constants';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.88;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.65;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const REQUIRED_SWIPES = 20;

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_BACKEND_URL || '';

function RatingModal({
  visible, onClose, onSubmit, movieTitle,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (rating: number) => void;
  movieTitle: string;
}) {
  const [rating, setRating] = useState(3);

  const handleSubmit = () => {
    onSubmit(rating);
    setRating(3);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={modalStyles.container} onPress={(e) => e.stopPropagation()}>
          <View style={modalStyles.header}>
            <Ionicons name="heart" size={28} color={COLORS.primary} />
            <Text style={modalStyles.title}>You liked it!</Text>
          </View>
          <Text style={modalStyles.movieTitle} numberOfLines={2}>{movieTitle}</Text>
          <Text style={modalStyles.subtitle}>Rate this movie</Text>

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
                  size={44}
                  color={star <= rating ? COLORS.gold : COLORS.border}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={modalStyles.ratingLabel}>
            {rating === 1 && 'Not for me'}
            {rating === 2 && 'It was okay'}
            {rating === 3 && 'Liked it'}
            {rating === 4 && 'Really good'}
            {rating === 5 && 'Masterpiece!'}
          </Text>

          <TouchableOpacity
            style={modalStyles.submitBtn}
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
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', padding: SPACING.l,
  },
  container: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl, width: '100%', maxWidth: 340, alignItems: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s, marginBottom: SPACING.s },
  title: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  movieTitle: {
    fontSize: 16, color: COLORS.gold, fontWeight: '600',
    textAlign: 'center', marginBottom: SPACING.m,
  },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.m },
  starsContainer: { flexDirection: 'row', gap: SPACING.s, marginBottom: SPACING.s },
  ratingLabel: { fontSize: 14, color: COLORS.textMuted, marginBottom: SPACING.l },
  submitBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 40,
    borderRadius: BORDER_RADIUS.full, width: '100%',
  },
  submitBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white, textAlign: 'center' },
});

function SwipeCard({
  movie, isTop, onSwipe,
}: {
  movie: FeedMovie;
  isTop: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
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
        <Image
          source={{ uri: `${TMDB_IMAGE_BASE}${movie.poster_path}` }}
          style={styles.poster}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, cardStyle]} testID={`swipe-card-${movie.id}`}>
        <Image
          source={{ uri: `${TMDB_IMAGE_BASE}${movie.poster_path}` }}
          style={styles.poster}
          resizeMode="cover"
        />

        {/* Gradient overlay for text */}
        <View style={styles.gradientOverlay} />

        {/* LIKE stamp */}
        <Animated.View style={[styles.stamp, styles.likeStamp, likeStyle]}>
          <Text style={[styles.stampText, styles.likeText]}>LIKED</Text>
        </Animated.View>

        {/* NOPE stamp */}
        <Animated.View style={[styles.stamp, styles.nopeStamp, nopeStyle]}>
          <Text style={[styles.stampText, styles.nopeText]}>NOPE</Text>
        </Animated.View>

        {/* Movie info at bottom */}
        <View style={styles.infoContainer}>
          <Text style={styles.movieTitle} numberOfLines={2}>{movie.title}</Text>
          <View style={styles.metaRow}>
            {year ? <Text style={styles.year}>{year}</Text> : null}
            {movie.vote_average > 0 && (
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={14} color={COLORS.gold} />
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
  const [pendingMovie, setPendingMovie] = useState<FeedMovie | null>(null);
  const [page, setPage] = useState(1);
  const fetchingRef = useRef(false);

  const remainingSwipes = Math.max(0, REQUIRED_SWIPES - swipeState.totalSwipes);
  const isProfileComplete = swipeState.totalSwipes >= REQUIRED_SWIPES;

  // Load saved swipe state
  useEffect(() => {
    (async () => {
      const saved = await getSwipeState();
      if (saved) {
        setSwipeState(saved);
      }
    })();
  }, []);

  // Fetch movie feed
  const fetchMovies = useCallback(async (pageNum: number) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const [filters, profile] = await Promise.all([getFilters(), getProfile()]);

      // Build query params based on user preferences and swipe history
      const excludeIds = swipeState.swipedMovieIds.join(',');
      const genres = filters?.genres?.selected?.join(',') || profile?.genres?.join(',') || '';
      const languages = filters?.languages?.selected?.join(',') || '';

      // Get liked genre IDs from swipe history to bias recommendations
      const likedGenres: number[] = [];
      swipeState.swipes
        .filter((s) => s.direction === 'right' && s.rating >= 4)
        .forEach((s) => {
          s.genreIds.forEach((g) => {
            if (!likedGenres.includes(g)) likedGenres.push(g);
          });
        });

      // Get a recent highly-rated movie for recommendations
      const recentLiked = swipeState.swipes
        .filter((s) => s.direction === 'right' && s.rating >= 4)
        .slice(-1)[0];
      const seedMovieId = recentLiked?.movieId || 0;

      const params = new URLSearchParams({
        genres,
        languages,
        page: String(pageNum),
        exclude: excludeIds,
        seed_movie_id: String(seedMovieId),
        liked_genres: likedGenres.slice(0, 5).join(','),
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

  useEffect(() => {
    fetchMovies(page);
  }, [page]);

  // Fetch more when running low
  useEffect(() => {
    if (movies.length < 5 && !loading) {
      setPage((p) => p + 1);
    }
  }, [movies.length, loading]);

  const handleSwipe = useCallback((direction: 'left' | 'right', movie: FeedMovie) => {
    if (direction === 'right') {
      // Show rating modal
      setPendingMovie(movie);
      setShowRatingModal(true);
    } else {
      // Left swipe - dislike or not watched
      recordSwipe(movie, direction, 0);
    }
    // Remove card from stack
    setMovies((prev) => prev.filter((m) => m.id !== movie.id));
  }, []);

  const recordSwipe = useCallback(async (movie: FeedMovie, direction: 'left' | 'right', rating: number) => {
    const record: SwipeRecord = {
      movieId: movie.id,
      title: movie.title,
      direction,
      rating,
      reasons: [],
      genreIds: movie.genre_ids || [],
      timestamp: new Date().toISOString(),
    };

    const newState: SwipeState = {
      swipes: [...swipeState.swipes, record],
      totalSwipes: swipeState.totalSwipes + 1,
      swipedMovieIds: [...swipeState.swipedMovieIds, movie.id],
    };

    setSwipeState(newState);
    await saveSwipeState(newState);
  }, [swipeState]);

  const handleRatingSubmit = useCallback((rating: number) => {
    if (pendingMovie) {
      recordSwipe(pendingMovie, 'right', rating);
      setPendingMovie(null);
    }
    setShowRatingModal(false);
  }, [pendingMovie, recordSwipe]);

  const handleContinue = useCallback(() => {
    // Navigate to the main app / discovery feed
    // For now just show alert since we don't have that screen yet
    router.replace('/');
  }, [router]);

  const currentMovie = movies[0];
  const nextMovie = movies[1];

  return (
    <SafeAreaView style={styles.container} testID="swipe-screen">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="swipe-back-btn"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="film" size={22} color={COLORS.gold} />
          <Text style={styles.headerTitle}>Discover Movies</Text>
        </View>
        <View style={styles.headerRight}>
          {!isProfileComplete && (
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>{remainingSwipes}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Progress indicator */}
      {!isProfileComplete && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            Swipe {remainingSwipes} more to build your taste profile
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${(swipeState.totalSwipes / REQUIRED_SWIPES) * 100}%` },
              ]}
            />
          </View>
        </View>
      )}

      {/* Cards stack */}
      <View style={styles.cardsContainer}>
        {loading && movies.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading movies...</Text>
          </View>
        ) : movies.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="film-outline" size={64} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No more movies to show</Text>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => {
                setPage(1);
                setLoading(true);
                fetchMovies(1);
              }}
              testID="refresh-movies-btn"
            >
              <Text style={styles.refreshBtnText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {nextMovie && (
              <SwipeCard
                key={nextMovie.id}
                movie={nextMovie}
                isTop={false}
                onSwipe={() => {}}
              />
            )}
            {currentMovie && (
              <SwipeCard
                key={currentMovie.id}
                movie={currentMovie}
                isTop={true}
                onSwipe={(dir) => handleSwipe(dir, currentMovie)}
              />
            )}
          </>
        )}
      </View>

      {/* Action buttons */}
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
            style={[styles.actionBtn, styles.likeBtn]}
            onPress={() => currentMovie && handleSwipe('right', currentMovie)}
            testID="swipe-right-btn"
            activeOpacity={0.8}
          >
            <Ionicons name="heart" size={28} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <View style={styles.instructionItem}>
          <Ionicons name="arrow-back" size={16} color={COLORS.textMuted} />
          <Text style={styles.instructionText}>Not interested</Text>
        </View>
        <View style={styles.instructionItem}>
          <Text style={styles.instructionText}>Liked it!</Text>
          <Ionicons name="arrow-forward" size={16} color={COLORS.textMuted} />
        </View>
      </View>

      {/* Continue button (when profile is complete) */}
      {isProfileComplete && (
        <View style={styles.continueContainer}>
          <View style={styles.completeMessage}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            <Text style={styles.completeText}>Taste profile complete!</Text>
          </View>
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={handleContinue}
            testID="continue-btn"
            activeOpacity={0.8}
          >
            <Text style={styles.continueBtnText}>Find Movie Companions</Text>
            <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      )}

      {/* Rating Modal */}
      <RatingModal
        visible={showRatingModal}
        onClose={() => {
          setShowRatingModal(false);
          setPendingMovie(null);
        }}
        onSubmit={handleRatingSubmit}
        movieTitle={pendingMovie?.title || ''}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  headerRight: {
    width: 44,
    alignItems: 'flex-end',
  },
  counterBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    minWidth: 32,
    alignItems: 'center',
  },
  counterText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  progressContainer: {
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
  },
  progressText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.s,
  },
  progressBar: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 2,
  },
  cardsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.bgCard,
  },
  cardBehind: {
    transform: [{ scale: 0.95 }],
    opacity: 0.7,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'transparent',
  },
  stamp: {
    position: 'absolute',
    top: 40,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 4,
    borderRadius: 8,
  },
  likeStamp: {
    right: 20,
    borderColor: '#4CAF50',
    transform: [{ rotate: '15deg' }],
  },
  nopeStamp: {
    left: 20,
    borderColor: '#FF6B6B',
    transform: [{ rotate: '-15deg' }],
  },
  stampText: {
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  likeText: {
    color: '#4CAF50',
  },
  nopeText: {
    color: '#FF6B6B',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.l,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  movieTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    marginBottom: SPACING.xs,
  },
  year: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,215,0,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.s,
  },
  ratingText: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: '600',
  },
  genres: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xl,
    paddingVertical: SPACING.m,
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  dislikeBtn: {
    borderColor: 'rgba(255,107,107,0.4)',
    backgroundColor: 'rgba(255,107,107,0.1)',
  },
  likeBtn: {
    borderColor: 'rgba(229,9,20,0.4)',
    backgroundColor: 'rgba(229,9,20,0.1)',
  },
  instructionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.m,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  instructionText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.m,
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.m,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  refreshBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: BORDER_RADIUS.full,
  },
  refreshBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  continueContainer: {
    paddingHorizontal: SPACING.l,
    paddingBottom: SPACING.l,
    gap: SPACING.m,
  },
  completeMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
  },
  completeText: {
    fontSize: 14,
    color: COLORS.success,
    fontWeight: '600',
  },
  continueBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
});
