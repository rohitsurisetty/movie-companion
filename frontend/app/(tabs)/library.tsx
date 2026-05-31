import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image,
  ScrollView, Modal, ActivityIndicator, KeyboardAvoidingView, 
  Platform, Pressable, Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { getAuth } from '../../src/store';
import { LEFT_SWIPE_REASONS, RIGHT_SWIPE_REASONS } from '../../src/theme';
import { SharedHeader, ModeSwitcher, useAppMode } from '../../src/components/SharedHeader';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL 
  || process.env.EXPO_PUBLIC_BACKEND_URL 
  || '';

const GRID_PADDING = 12;
const GRID_GAP = 8;
const NUM_COLUMNS = 3;
// Calculate card width based on percentage to work across platforms
const CARD_PERCENTAGE = (100 - ((GRID_GAP * (NUM_COLUMNS - 1)) / 3.9)) / NUM_COLUMNS;

const COLORS = {
  primary: '#E50914',
  bg: '#121212',
  bgCard: '#1E1E1E',
  bgInput: '#2A2A2A',
  text: '#FFFFFF',
  textSecondary: '#CCCCCC',
  textMuted: '#888888',
  border: '#333333',
  success: '#4CAF50',
  warning: '#FF9800',
  like: '#4CAF50',
  dislike: '#F44336',
};

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

// Use shared reasons from theme for consistency across the app
const LIKE_REASONS = RIGHT_SWIPE_REASONS;
const DISLIKE_REASONS = LEFT_SWIPE_REASONS;

interface Movie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date?: string;
  vote_average?: number;
  overview?: string;
  genre_ids?: number[];
}

interface RatedMovie extends Movie {
  isLike: boolean;
  rating: number;
  reasons: string[];
  ratedAt: string;
}

interface RatingModalProps {
  visible: boolean;
  movie: Movie | null;
  onClose: () => void;
  onSubmit: (rating: number, reasons: string[], isLike: boolean) => void;
}

function RatingModal({ visible, movie, onClose, onSubmit }: RatingModalProps) {
  const [isLike, setIsLike] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);

  const resetState = () => {
    setIsLike(null);
    setRating(0);
    setSelectedReasons([]);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSubmit = () => {
    if (isLike !== null) {
      onSubmit(rating, selectedReasons, isLike);
      resetState();
    }
  };

  const toggleReason = (id: string) => {
    setSelectedReasons(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  if (!movie) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <Pressable style={modalStyles.overlay} onPress={handleClose}>
        <Pressable style={modalStyles.container} onPress={() => {}}>
          {/* Movie Info Header */}
          <View style={modalStyles.movieHeader}>
            {movie.poster_path && (
              <Image
                source={{ uri: `${TMDB_IMAGE_BASE}${movie.poster_path}` }}
                style={modalStyles.moviePoster}
              />
            )}
            <View style={modalStyles.movieInfo}>
              <Text style={modalStyles.movieTitle} numberOfLines={2}>{movie.title}</Text>
              {movie.release_date && (
                <Text style={modalStyles.movieYear}>{movie.release_date.slice(0, 4)}</Text>
              )}
              {movie.vote_average && movie.vote_average > 0 && (
                <View style={modalStyles.ratingBadge}>
                  <Ionicons name="star" size={12} color="#FFD700" />
                  <Text style={modalStyles.ratingText}>{movie.vote_average.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Like/Dislike Selection */}
          {isLike === null ? (
            <View style={modalStyles.likeDislikeContainer}>
              <Text style={modalStyles.questionText}>Did you like this movie?</Text>
              <View style={modalStyles.buttonRow}>
                <TouchableOpacity
                  style={[modalStyles.choiceButton, modalStyles.likeButton]}
                  onPress={() => setIsLike(true)}
                >
                  <Ionicons name="thumbs-up" size={28} color="#FFF" />
                  <Text style={modalStyles.choiceText}>Liked It</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[modalStyles.choiceButton, modalStyles.dislikeButton]}
                  onPress={() => setIsLike(false)}
                >
                  <Ionicons name="thumbs-down" size={28} color="#FFF" />
                  <Text style={modalStyles.choiceText}>Didn't Like</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* Rating Stars for Likes */}
              {isLike && (
                <View style={modalStyles.ratingSection}>
                  <Text style={modalStyles.sectionLabel}>How much did you like it?</Text>
                  <View style={modalStyles.starsContainer}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity key={star} onPress={() => setRating(star)}>
                        <Ionicons
                          name={star <= rating ? 'star' : 'star-outline'}
                          size={36}
                          color="#FFD700"
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Reasons */}
              <View style={modalStyles.reasonsSection}>
                <Text style={modalStyles.sectionLabel}>
                  {isLike ? 'What did you like about it?' : 'What went wrong?'}
                </Text>
                <View style={modalStyles.reasonsGrid}>
                  {(isLike ? LIKE_REASONS : DISLIKE_REASONS).map((reason) => (
                    <TouchableOpacity
                      key={reason.id}
                      style={[
                        modalStyles.reasonChip,
                        selectedReasons.includes(reason.id) && modalStyles.reasonChipSelected,
                        selectedReasons.includes(reason.id) && (isLike ? modalStyles.reasonChipLike : modalStyles.reasonChipDislike),
                      ]}
                      onPress={() => toggleReason(reason.id)}
                    >
                      <Ionicons
                        name={reason.icon as any}
                        size={16}
                        color={selectedReasons.includes(reason.id) ? '#FFF' : COLORS.textMuted}
                      />
                      <Text
                        style={[
                          modalStyles.reasonText,
                          selectedReasons.includes(reason.id) && modalStyles.reasonTextSelected,
                        ]}
                      >
                        {reason.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={modalStyles.actionRow}>
                <TouchableOpacity style={modalStyles.backButton} onPress={() => setIsLike(null)}>
                  <Ionicons name="arrow-back" size={20} color={COLORS.text} />
                  <Text style={modalStyles.backButtonText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    modalStyles.submitButton,
                    (!isLike || rating > 0) ? {} : modalStyles.submitButtonDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={isLike && rating === 0}
                >
                  <Text style={modalStyles.submitButtonText}>Save Rating</Text>
                  <Ionicons name="checkmark" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function LibraryScreen() {
  // Mode and theme hooks - must be at the top
  const { mode, setMode, colors, showModeDrawer, setShowModeDrawer } = useAppMode();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<Movie[]>([]);
  const [ratedMovies, setRatedMovies] = useState<RatedMovie[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const auth = await getAuth();
      if (auth?.user_id) {
        setUserId(auth.user_id);
        // Load user's rated movies to show badges
        await loadRatedMovies(auth.user_id);
      }
      await fetchTrendingMovies();
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRatedMovies = async (uid: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/library?user_id=${uid}`);
      if (response.ok) {
        const data = await response.json();
        setRatedMovies(data.movies || []);
      }
    } catch (error) {
      console.error('Error loading rated movies:', error);
    }
  };

  const fetchTrendingMovies = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tmdb/trending`);
      if (response.ok) {
        const data = await response.json();
        setTrendingMovies(data.results || []);
      }
    } catch (error) {
      console.error('Error fetching trending movies:', error);
    }
  };

  const searchMovies = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/tmdb/search?query=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results || []);
      }
    } catch (error) {
      console.error('Error searching movies:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchMovies(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, searchMovies]);

  const handleMoviePress = async (movie: Movie) => {
    Keyboard.dismiss();
    setSelectedMovie(movie);
    setShowRatingModal(true);
    
    // Record interaction for analytics catalog (non-blocking)
    try {
      fetch(`${BACKEND_URL}/api/movie/interaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movie_id: movie.id,
          interaction_type: 'search_click',
          user_id: userId,
        }),
      }).catch(err => console.log('Interaction recording failed:', err));
    } catch (error) {
      // Non-blocking, ignore errors
    }
  };

  const handleRatingSubmit = async (rating: number, reasons: string[], isLike: boolean) => {
    if (!selectedMovie || !userId) return;

    try {
      // Send to backend
      const response = await fetch(`${BACKEND_URL}/api/user/library/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          movie_id: selectedMovie.id,
          movie_title: selectedMovie.title,
          poster_path: selectedMovie.poster_path,
          release_date: selectedMovie.release_date,
          is_like: isLike,
          rating: isLike ? rating : 0,
          reasons: reasons,
          didnt_watch: reasons.includes('not_watched'),
        }),
      });

      if (response.ok) {
        // Add to local state
        const newRatedMovie: RatedMovie = {
          ...selectedMovie,
          isLike,
          rating: isLike ? rating : 0,
          reasons,
          ratedAt: new Date().toISOString(),
        };
        setRatedMovies(prev => [newRatedMovie, ...prev.filter(m => m.id !== selectedMovie.id)]);
      }

      setShowRatingModal(false);
      setSelectedMovie(null);
    } catch (error) {
      console.error('Error saving rating:', error);
    }
  };

  const renderMovieCard = ({ item, index }: { item: Movie; index: number }) => {
    const isRated = ratedMovies.some(m => m.id === item.id);
    const ratedInfo = ratedMovies.find(m => m.id === item.id);
    const posterUri = item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : null;
    return (<TouchableOpacity onPress={() => handleMoviePress(item)} activeOpacity={0.7}><View style={styles.posterContainer}>{posterUri ? (<Image source={{ uri: posterUri }} style={styles.moviePoster} resizeMode="cover" />) : (<View style={[styles.moviePoster, styles.noPoster]}><Ionicons name="film-outline" size={28} color={COLORS.textMuted} /></View>)}{isRated && (<View style={[styles.ratedBadge, ratedInfo?.isLike ? styles.ratedBadgeLike : styles.ratedBadgeDislike]}><Ionicons name={ratedInfo?.isLike ? 'heart' : 'heart-dislike'} size={14} color="#FFF" /></View>)}{item.vote_average && item.vote_average > 0 && (<View style={styles.tmdbRating}><Ionicons name="star" size={10} color="#FFD700" /><Text style={styles.tmdbRatingText}>{item.vote_average.toFixed(1)}</Text></View>)}</View><Text style={styles.movieTitle} numberOfLines={2}>{item.title}</Text>{item.release_date && (<Text style={styles.movieYear}>{item.release_date.slice(0, 4)}</Text>)}</TouchableOpacity>);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading Library...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayMovies = searchQuery.length >= 2 ? searchResults : trendingMovies;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={styles.content} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Shared Header with Mode Switcher */}
        <SharedHeader
          title="Movie Library"
          showModeIcon={true}
          onMenuPress={() => setShowModeDrawer(true)}
          colors={colors}
        />

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search movies by title..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {searchQuery.length >= 2 
              ? `Results for "${searchQuery}"` 
              : 'Trending This Week'}
          </Text>
          {isSearching && <ActivityIndicator size="small" color={COLORS.primary} />}
        </View>

        {/* Movies Grid */}
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.gridContainer}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {displayMovies.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="film-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>
                {searchQuery.length >= 2 
                  ? 'No movies found' 
                  : 'No trending movies available'}
              </Text>
              {searchQuery.length >= 2 && (
                <Text style={styles.emptySubtext}>Try a different search term</Text>
              )}
            </View>
          ) : (
            <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', paddingHorizontal: 0}}>
              {displayMovies.map((item, index) => (
                <View key={`movie-${item.id}`} style={{width: '32%', marginRight: index % 3 === 2 ? 0 : '2%', marginBottom: 12}}>{renderMovieCard({ item, index })}</View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Rating Modal */}
        <RatingModal
          visible={showRatingModal}
          movie={selectedMovie}
          onClose={() => {
            setShowRatingModal(false);
            setSelectedMovie(null);
          }}
          onSubmit={handleRatingSubmit}
        />

        {/* Mode Switcher Modal */}
        <ModeSwitcher
          visible={showModeDrawer}
          onClose={() => setShowModeDrawer(false)}
          currentMode={mode}
          onModeChange={setMode}
          colors={colors}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.textMuted,
  },
  header: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgInput,
    marginHorizontal: GRID_PADDING,
    marginBottom: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    height: 44,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  clearButton: {
    padding: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  gridContainer: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 100,
  },
  scrollView: {
    flex: 1,
  },
  gridWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cardWrapper: {
    width: '31%',
    marginBottom: 12,
  },
  gridRow: {
    justifyContent: 'flex-start',
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  movieCard: {
    width: '31%',
  },
  posterContainer: {
    width: '100%',
    aspectRatio: 2/3,
    position: 'relative',
  },
  moviePoster: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: COLORS.bgCard,
  },
  noPoster: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratedBadgeLike: {
    backgroundColor: COLORS.like,
  },
  ratedBadgeDislike: {
    backgroundColor: COLORS.dislike,
  },
  tmdbRating: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 3,
  },
  tmdbRatingText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
  },
  movieTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.text,
    marginTop: 6,
    lineHeight: 16,
  },
  movieYear: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  movieHeader: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  moviePoster: {
    width: 80,
    height: 120,
    borderRadius: 8,
  },
  movieInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  movieTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  movieYear: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
  },
  likeDislikeContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  choiceButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    borderRadius: 12,
    gap: 8,
  },
  likeButton: {
    backgroundColor: COLORS.like,
  },
  dislikeButton: {
    backgroundColor: COLORS.dislike,
  },
  choiceText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  ratingSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  reasonsSection: {
    marginBottom: 20,
  },
  reasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.bgInput,
    gap: 6,
  },
  reasonChipSelected: {
    borderWidth: 0,
  },
  reasonChipLike: {
    backgroundColor: COLORS.like,
  },
  reasonChipDislike: {
    backgroundColor: COLORS.dislike,
  },
  reasonText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  reasonTextSelected: {
    color: '#FFF',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: COLORS.bgInput,
    gap: 6,
  },
  backButtonText: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.textMuted,
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 15,
    color: '#FFF',
    fontWeight: '600',
  },
});
