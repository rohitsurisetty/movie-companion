import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image,
  FlatList, Modal, ActivityIndicator, Dimensions, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView } from 'react-native-gesture-handler';
import Constants from 'expo-constants';
import { getAuth } from '../../src/store';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL 
  || process.env.EXPO_PUBLIC_BACKEND_URL 
  || '';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 16;
const GRID_GAP = 10;
const NUM_COLUMNS = 3;
const CARD_WIDTH = (SCREEN_WIDTH - (GRID_PADDING * 2) - (GRID_GAP * (NUM_COLUMNS - 1))) / NUM_COLUMNS;

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
};

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

// Rating reasons for likes
const LIKE_REASONS = [
  { id: 'story', label: 'Great Story', icon: 'book-outline' },
  { id: 'acting', label: 'Amazing Acting', icon: 'person-outline' },
  { id: 'visuals', label: 'Stunning Visuals', icon: 'eye-outline' },
  { id: 'music', label: 'Great Music', icon: 'musical-notes-outline' },
  { id: 'emotional', label: 'Emotionally Moving', icon: 'heart-outline' },
  { id: 'rewatchable', label: 'Highly Rewatchable', icon: 'refresh-outline' },
];

// Reasons for dislikes
const DISLIKE_REASONS = [
  { id: 'boring', label: 'Boring', icon: 'bed-outline' },
  { id: 'bad_acting', label: 'Poor Acting', icon: 'sad-outline' },
  { id: 'confusing', label: 'Confusing Plot', icon: 'help-circle-outline' },
  { id: 'too_long', label: 'Too Long', icon: 'time-outline' },
  { id: 'not_my_genre', label: 'Not My Genre', icon: 'close-circle-outline' },
  { id: 'not_watched', label: "Didn't Watch", icon: 'eye-off-outline' },
];

interface Movie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date?: string;
  vote_average?: number;
  overview?: string;
  genre_ids?: number[];
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

  const reasons = isLike ? LIKE_REASONS : DISLIKE_REASONS;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Movie Info */}
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
              </View>
            </View>

            {/* Like/Dislike Selection */}
            {isLike === null ? (
              <View style={modalStyles.actionSelection}>
                <Text style={modalStyles.sectionTitle}>What do you think?</Text>
                <View style={modalStyles.actionButtons}>
                  <TouchableOpacity
                    style={[modalStyles.actionBtn, modalStyles.likeBtn]}
                    onPress={() => setIsLike(true)}
                  >
                    <Ionicons name="heart" size={32} color="#FFF" />
                    <Text style={modalStyles.actionBtnText}>Like</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[modalStyles.actionBtn, modalStyles.dislikeBtn]}
                    onPress={() => setIsLike(false)}
                  >
                    <Ionicons name="close" size={32} color="#FFF" />
                    <Text style={modalStyles.actionBtnText}>Dislike</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {/* Rating Stars (only for likes) */}
                {isLike && (
                  <View style={modalStyles.ratingSection}>
                    <Text style={modalStyles.sectionTitle}>Rate this movie</Text>
                    <View style={modalStyles.starsContainer}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <TouchableOpacity key={star} onPress={() => setRating(star)}>
                          <Ionicons
                            name={star <= rating ? 'star' : 'star-outline'}
                            size={36}
                            color={star <= rating ? '#FFD700' : COLORS.textMuted}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                    {rating > 0 && (
                      <Text style={modalStyles.ratingLabel}>
                        {rating === 5 ? 'Masterpiece!' : rating === 4 ? 'Great!' : rating === 3 ? 'Good' : rating === 2 ? 'Okay' : 'Not great'}
                      </Text>
                    )}
                  </View>
                )}

                {/* Reasons */}
                <View style={modalStyles.reasonsSection}>
                  <Text style={modalStyles.sectionTitle}>
                    {isLike ? 'Why did you love it?' : 'What went wrong?'}
                  </Text>
                  <View style={modalStyles.reasonsGrid}>
                    {reasons.map(reason => (
                      <TouchableOpacity
                        key={reason.id}
                        style={[
                          modalStyles.reasonChip,
                          selectedReasons.includes(reason.id) && modalStyles.reasonChipActive
                        ]}
                        onPress={() => toggleReason(reason.id)}
                      >
                        <Ionicons
                          name={reason.icon as any}
                          size={16}
                          color={selectedReasons.includes(reason.id) ? '#FFF' : COLORS.textMuted}
                        />
                        <Text style={[
                          modalStyles.reasonText,
                          selectedReasons.includes(reason.id) && modalStyles.reasonTextActive
                        ]}>
                          {reason.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                  style={[modalStyles.submitBtn, (!isLike || rating > 0) && modalStyles.submitBtnActive]}
                  onPress={handleSubmit}
                  disabled={isLike && rating === 0}
                >
                  <Text style={modalStyles.submitBtnText}>
                    {isLike ? 'Add to Liked' : 'Add to Disliked'}
                  </Text>
                </TouchableOpacity>

                {/* Back Button */}
                <TouchableOpacity style={modalStyles.backBtn} onPress={() => setIsLike(null)}>
                  <Ionicons name="arrow-back" size={18} color={COLORS.textMuted} />
                  <Text style={modalStyles.backBtnText}>Change selection</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>

          {/* Close Button */}
          <TouchableOpacity style={modalStyles.closeBtn} onPress={handleClose}>
            <Ionicons name="close" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function LibraryScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<Movie[]>([]);
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
      }
      await fetchTrendingMovies();
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setIsLoading(false);
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

  const handleMoviePress = (movie: Movie) => {
    setSelectedMovie(movie);
    setShowRatingModal(true);
  };

  const handleRatingSubmit = async (rating: number, reasons: string[], isLike: boolean) => {
    if (!selectedMovie || !userId) return;

    try {
      // Send to backend
      await fetch(`${BACKEND_URL}/api/user/swipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          movie_id: selectedMovie.id,
          direction: isLike ? 'right' : 'left',
          rating: isLike ? rating : null,
          reason: reasons.join(','),
          didnt_watch: reasons.includes('not_watched'),
        }),
      });

      setShowRatingModal(false);
      setSelectedMovie(null);
    } catch (error) {
      console.error('Error saving rating:', error);
    }
  };

  const renderMovieCard = ({ item }: { item: Movie }) => (
    <TouchableOpacity
      style={styles.movieCard}
      onPress={() => handleMoviePress(item)}
      activeOpacity={0.8}
    >
      {item.poster_path ? (
        <Image
          source={{ uri: `${TMDB_IMAGE_BASE}${item.poster_path}` }}
          style={styles.moviePoster}
        />
      ) : (
        <View style={[styles.moviePoster, styles.noPoster]}>
          <Ionicons name="film-outline" size={32} color={COLORS.textMuted} />
        </View>
      )}
      <Text style={styles.movieTitle} numberOfLines={2}>{item.title}</Text>
      {item.release_date && (
        <Text style={styles.movieYear}>{item.release_date.slice(0, 4)}</Text>
      )}
    </TouchableOpacity>
  );

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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Movie Library</Text>
          <Text style={styles.headerSubtitle}>Search and rate any movie</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search movies..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {searchQuery.length >= 2 
              ? `Results for "${searchQuery}"` 
              : 'Trending Movies'}
          </Text>
          {isSearching && <ActivityIndicator size="small" color={COLORS.primary} />}
        </View>

        {/* Movies Grid */}
        <FlatList
          data={displayMovies}
          renderItem={renderMovieCard}
          keyExtractor={(item) => item.id.toString()}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="film-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>
                {searchQuery.length >= 2 
                  ? 'No movies found' 
                  : 'No trending movies available'}
              </Text>
            </View>
          }
        />

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
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgInput,
    marginHorizontal: GRID_PADDING,
    marginVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  gridContainer: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 20,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  movieCard: {
    width: CARD_WIDTH,
  },
  moviePoster: {
    width: '100%',
    height: CARD_WIDTH * 1.5,
    borderRadius: 8,
    backgroundColor: COLORS.bgCard,
  },
  noPoster: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  movieTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 6,
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
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textMuted,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  movieHeader: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  moviePoster: {
    width: 80,
    height: 120,
    borderRadius: 8,
  },
  movieInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  movieTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  movieYear: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  actionSelection: {
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 20,
  },
  actionBtn: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  likeBtn: {
    backgroundColor: COLORS.primary,
  },
  dislikeBtn: {
    backgroundColor: '#666',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  ratingSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  reasonsSection: {
    marginBottom: 24,
  },
  reasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reasonChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  reasonText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  reasonTextActive: {
    color: '#FFF',
  },
  submitBtn: {
    backgroundColor: COLORS.border,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitBtnActive: {
    backgroundColor: COLORS.primary,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  backBtnText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
});
