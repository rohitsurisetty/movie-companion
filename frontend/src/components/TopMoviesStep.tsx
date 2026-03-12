import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  ScrollView, Modal, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { ProfileData, MovieSelection } from '../types';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const REASONS = ['Good story/plot', 'Great performances', 'Emotional connection', 'Good craftwork'];

type Props = {
  data: ProfileData;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
};

export default function TopMoviesStep({ data, onUpdate, onNext }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const debounceRef = useRef<any>(null);

  const searchMovies = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const resp = await fetch(`${BACKEND_URL}/api/tmdb/search?query=${encodeURIComponent(text)}`);
        const data = await resp.json();
        setResults(data.results || []);
      } catch (e) {
        console.error('TMDB search error:', e);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  const handleSelectMovie = (movie: any) => {
    if (data.topMovies.length >= 5) return;
    if (data.topMovies.find(m => m.id === movie.id)) return;
    setSelectedMovie(movie);
    setRating(0);
    setReasons([]);
    setShowRatingModal(true);
  };

  const handleConfirmMovie = () => {
    if (!selectedMovie || rating === 0) return;
    const newMovie: MovieSelection = {
      id: selectedMovie.id,
      title: selectedMovie.title,
      poster_path: selectedMovie.poster_path,
      rating,
      reasons,
    };
    onUpdate('topMovies', [...data.topMovies, newMovie]);
    setShowRatingModal(false);
    setSelectedMovie(null);
    setQuery('');
    setResults([]);
  };

  const removeMovie = (id: number) => {
    onUpdate('topMovies', data.topMovies.filter(m => m.id !== id));
  };

  const toggleReason = (r: string) => {
    setReasons(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Your Top 5 Movies</Text>
        <Text style={styles.subtitle}>Select up to 5 favourite movies ({data.topMovies.length}/5)</Text>

        {/* Selected movies grid */}
        {data.topMovies.length > 0 && (
          <View style={styles.selectedGrid}>
            {data.topMovies.map(movie => (
              <View key={movie.id} style={styles.selectedCard}>
                {movie.poster_path ? (
                  <Image source={{ uri: `${TMDB_IMAGE_BASE}${movie.poster_path}` }} style={styles.posterSmall} />
                ) : (
                  <View style={[styles.posterSmall, styles.posterPlaceholder]}>
                    <Ionicons name="film-outline" size={24} color={COLORS.textMuted} />
                  </View>
                )}
                <Text style={styles.selectedTitle} numberOfLines={2}>{movie.title}</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <Ionicons key={s} name={s <= movie.rating ? 'star' : 'star-outline'} size={12} color={COLORS.gold} />
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeMovie(movie.id)}
                  testID={`remove-movie-${movie.id}`}
                >
                  <Ionicons name="close-circle" size={22} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Search */}
        {data.topMovies.length < 5 && (
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search movies..."
                placeholderTextColor={COLORS.textMuted}
                value={query}
                onChangeText={searchMovies}
                testID="movie-search-input"
              />
              {searching && <ActivityIndicator size="small" color={COLORS.primary} />}
            </View>

            {results.length > 0 && (
              <View style={styles.resultsGrid}>
                {results.filter(r => !data.topMovies.find(m => m.id === r.id)).map(movie => (
                  <TouchableOpacity
                    key={movie.id}
                    style={styles.resultCard}
                    onPress={() => handleSelectMovie(movie)}
                    testID={`movie-result-${movie.id}`}
                    activeOpacity={0.7}
                  >
                    {movie.poster_path ? (
                      <Image source={{ uri: `${TMDB_IMAGE_BASE}${movie.poster_path}` }} style={styles.posterResult} />
                    ) : (
                      <View style={[styles.posterResult, styles.posterPlaceholder]}>
                        <Ionicons name="film-outline" size={28} color={COLORS.textMuted} />
                      </View>
                    )}
                    <Text style={styles.resultTitle} numberOfLines={2}>{movie.title}</Text>
                    <Text style={styles.resultYear}>{movie.release_date?.slice(0, 4) || ''}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.continueBtn, data.topMovies.length === 0 && styles.continueBtnDisabled]}
          onPress={onNext}
          disabled={data.topMovies.length === 0}
          testID="top-movies-continue"
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Rating Modal */}
      <Modal visible={showRatingModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.ratingContent}>
            <Text style={styles.ratingTitle} numberOfLines={2}>{selectedMovie?.title}</Text>

            <Text style={styles.ratingLabel}>Rate this movie</Text>
            <View style={styles.starsRowLarge}>
              {[1, 2, 3, 4, 5].map(s => (
                <TouchableOpacity key={s} onPress={() => setRating(s)} testID={`star-${s}`}>
                  <Ionicons name={s <= rating ? 'star' : 'star-outline'} size={36} color={COLORS.gold} />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.ratingLabel}>Why do you love it? (Optional)</Text>
            <View style={styles.reasonsContainer}>
              {REASONS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reasonChip, reasons.includes(r) && styles.reasonChipActive]}
                  onPress={() => toggleReason(r)}
                  testID={`reason-${r.toLowerCase().replace(/[\s/]+/g, '-')}`}
                >
                  <Text style={[styles.reasonText, reasons.includes(r) && styles.reasonTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, rating === 0 && styles.confirmBtnDisabled]}
              onPress={handleConfirmMovie}
              disabled={rating === 0}
              testID="confirm-movie-rating"
            >
              <Text style={styles.confirmBtnText}>Add Movie</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowRatingModal(false)} testID="cancel-movie-rating">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xxl },
  title: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.s },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, marginBottom: SPACING.l },
  selectedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.m, marginBottom: SPACING.l },
  selectedCard: {
    width: '28%', alignItems: 'center', position: 'relative',
  },
  posterSmall: { width: '100%', aspectRatio: 0.67, borderRadius: BORDER_RADIUS.m },
  posterPlaceholder: { backgroundColor: COLORS.bgCard, alignItems: 'center', justifyContent: 'center' },
  selectedTitle: { fontSize: 11, color: COLORS.text, textAlign: 'center', marginTop: SPACING.xs },
  starsRow: { flexDirection: 'row', gap: 1, marginTop: 2 },
  removeBtn: { position: 'absolute', top: -6, right: -6 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgInput,
    borderRadius: BORDER_RADIUS.m, paddingHorizontal: SPACING.m, gap: SPACING.s,
    marginBottom: SPACING.m,
  },
  searchInput: { flex: 1, paddingVertical: 14, color: COLORS.text, fontSize: 16 },
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.m },
  resultCard: { width: '30%', alignItems: 'center', marginBottom: SPACING.s },
  posterResult: { width: '100%', aspectRatio: 0.67, borderRadius: BORDER_RADIUS.m },
  resultTitle: { fontSize: 11, color: COLORS.text, textAlign: 'center', marginTop: SPACING.xs },
  resultYear: { fontSize: 10, color: COLORS.textMuted },
  continueBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: BORDER_RADIUS.full,
    alignItems: 'center', marginTop: SPACING.xl,
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white, letterSpacing: 1 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center',
    alignItems: 'center', padding: SPACING.l,
  },
  ratingContent: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l, padding: SPACING.l,
    width: '100%', maxWidth: 360, alignItems: 'center',
  },
  ratingTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: SPACING.l },
  ratingLabel: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.s, alignSelf: 'flex-start' },
  starsRowLarge: { flexDirection: 'row', gap: SPACING.m, marginBottom: SPACING.l },
  reasonsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s, marginBottom: SPACING.l, width: '100%' },
  reasonChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: BORDER_RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgInput,
  },
  reasonChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(255,215,0,0.1)' },
  reasonText: { fontSize: 13, color: COLORS.textSecondary },
  reasonTextActive: { color: COLORS.gold, fontWeight: '600' },
  confirmBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: BORDER_RADIUS.full,
    alignItems: 'center', width: '100%', marginBottom: SPACING.s,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white },
  cancelText: { fontSize: 15, color: COLORS.textSecondary, paddingVertical: SPACING.s },
});
