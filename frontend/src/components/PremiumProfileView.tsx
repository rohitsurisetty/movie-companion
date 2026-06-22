import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  ScrollView,
  StatusBar,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatLocationForPrivacy } from '../utils/locationFormatter';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PHOTO_HEIGHT = SCREEN_HEIGHT * 0.5;
const STICKY_HEADER_HEIGHT = 52;
const SWIPE_THRESHOLD = 100;
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185';

const COLORS = {
  primary: '#E50914',
  primaryDark: '#B5070F',
  buddy: '#2196F3',
  bg: '#0A0A0A',
  bgCard: '#141414',
  bgSection: '#1A1A1A',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: '#2A2A2A',
  success: '#00D26A',
  gold: '#FFD700',
  overlay: 'rgba(0,0,0,0.5)',
};

interface ProfileData {
  user_id: string;
  name: string;
  age: number;
  gender: string;
  location: string;
  bio?: string;
  genres?: string[];
  topMovies?: { title: string; tmdb_id?: number; poster_path?: string }[];
  filmLanguages?: string[];
  languagesSpoken?: string[];
  movieFrequency?: string;
  ottTheatre?: string;
  match_level?: string;
  explanation?: string;
  shared_interests?: string[];
  compatibility_score?: number;
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
}

interface PremiumProfileViewProps {
  visible: boolean;
  profile: ProfileData | null;
  photos: string[];
  mode: 'date' | 'buddy';
  onClose: () => void;
  onMessage: () => void;
  hasAlreadySentRequest?: boolean;
}

// ============ PHOTO CAROUSEL ============
const PhotoCarousel = ({
  photos,
  name,
}: {
  photos: string[];
  name: string;
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / SCREEN_WIDTH);
    if (index !== currentIndex && index >= 0 && index < photos.length) {
      setCurrentIndex(index);
    }
  };

  const photoList = photos.length > 0 ? photos : [];

  if (photoList.length === 0) {
    return (
      <View style={carouselStyles.placeholderContainer}>
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark]}
          style={carouselStyles.placeholderGradient}
        >
          <Text style={carouselStyles.placeholderText}>{name.charAt(0).toUpperCase()}</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={carouselStyles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
      >
        {photoList.map((photo, index) => (
          <View key={index} style={carouselStyles.photoContainer}>
            <Image source={{ uri: photo }} style={carouselStyles.photo} resizeMode="cover" />
          </View>
        ))}
      </ScrollView>

      {/* Photo Indicators - Top bar style */}
      {photoList.length > 1 && (
        <View style={carouselStyles.indicatorsContainer}>
          {photoList.map((_, index) => (
            <View
              key={index}
              style={[
                carouselStyles.indicator,
                index === currentIndex && carouselStyles.indicatorActive,
              ]}
            />
          ))}
        </View>
      )}

      {/* Bottom Gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(10,10,10,1)']}
        style={carouselStyles.gradient}
        pointerEvents="none"
      />
    </View>
  );
};

const carouselStyles = StyleSheet.create({
  container: {
    height: PHOTO_HEIGHT,
    position: 'relative',
  },
  photoContainer: {
    width: SCREEN_WIDTH,
    height: PHOTO_HEIGHT,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  placeholderContainer: {
    height: PHOTO_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
  },
  placeholderGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFF',
  },
  indicatorsContainer: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 4,
  },
  indicator: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  indicatorActive: {
    backgroundColor: '#FFFFFF',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
});

// ============ SECTION COMPONENTS ============
const SectionHeader = ({ title }: { title: string }) => (
  <View style={sectionStyles.header}>
    <Text style={sectionStyles.headerText}>{title}</Text>
  </View>
);

const InfoTag = ({ icon, text }: { icon: string; text: string }) => (
  <View style={sectionStyles.infoTag}>
    <Ionicons name={icon as any} size={14} color={COLORS.textSecondary} />
    <Text style={sectionStyles.infoTagText}>{text}</Text>
  </View>
);

const GenreChip = ({ genre, highlight }: { genre: string; highlight?: boolean }) => (
  <View style={[sectionStyles.genreChip, highlight && sectionStyles.genreChipHighlight]}>
    <Text style={[sectionStyles.genreChipText, highlight && sectionStyles.genreChipTextHighlight]}>
      {genre}
    </Text>
  </View>
);

// Movie poster in horizontal scroll
const MoviePoster = ({ movie }: { movie: { title: string; poster_path?: string; tmdb_id?: number } }) => {
  const posterUrl = movie.poster_path 
    ? (movie.poster_path.startsWith('http') ? movie.poster_path : `${TMDB_IMAGE_BASE}${movie.poster_path}`)
    : null;

  return (
    <View style={sectionStyles.moviePosterContainer}>
      {posterUrl ? (
        <Image source={{ uri: posterUrl }} style={sectionStyles.moviePoster} resizeMode="cover" />
      ) : (
        <View style={sectionStyles.moviePosterPlaceholder}>
          <Ionicons name="film" size={24} color={COLORS.textMuted} />
        </View>
      )}
      <Text style={sectionStyles.moviePosterTitle} numberOfLines={2}>{movie.title}</Text>
    </View>
  );
};

const sectionStyles = StyleSheet.create({
  header: {
    marginBottom: 12,
    paddingBottom: 6,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  infoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSection,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  infoTagText: {
    fontSize: 13,
    color: COLORS.text,
  },
  genreChip: {
    backgroundColor: COLORS.bgSection,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  genreChipHighlight: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    borderColor: COLORS.primary,
  },
  genreChipText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
  },
  genreChipTextHighlight: {
    color: COLORS.primary,
  },
  moviePosterContainer: {
    width: 80,
    marginRight: 12,
  },
  moviePoster: {
    width: 80,
    height: 120,
    borderRadius: 8,
    backgroundColor: COLORS.bgSection,
  },
  moviePosterPlaceholder: {
    width: 80,
    height: 120,
    borderRadius: 8,
    backgroundColor: COLORS.bgSection,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moviePosterTitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
});

// ============ MAIN COMPONENT ============
export const PremiumProfileView: React.FC<PremiumProfileViewProps> = ({
  visible,
  profile,
  photos,
  mode,
  onClose,
  onMessage,
  hasAlreadySentRequest = false,
}) => {
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);

  // Reset state when profile changes
  useEffect(() => {
    scrollY.setValue(0);
    translateY.setValue(0);
    setShowStickyHeader(false);
    setIsAtTop(true);
  }, [profile?.user_id]);

  // Pan responder for swipe-down-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only activate if at top of scroll and swiping down
        return isAtTop && gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD) {
          // Dismiss
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onClose();
            translateY.setValue(0);
          });
        } else {
          // Snap back
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = event.nativeEvent.contentOffset.y;
        setShowStickyHeader(y > PHOTO_HEIGHT - STICKY_HEADER_HEIGHT - 60);
        setIsAtTop(y <= 5);
      },
    }
  );

  if (!visible || !profile) return null;

  const accentColor = mode === 'date' ? COLORS.primary : COLORS.buddy;
  const formattedLocation = formatLocationForPrivacy(profile.location);
  const locationParts = formattedLocation.split(',').map(s => s.trim()).filter(Boolean);
  const shortLocation = locationParts[0] || formattedLocation;

  // Sticky header opacity
  const stickyHeaderOpacity = scrollY.interpolate({
    inputRange: [PHOTO_HEIGHT - 120, PHOTO_HEIGHT - 60],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          paddingTop: insets.top,
          transform: [{ translateY }],
        }
      ]}
      {...panResponder.panHandlers}
    >
      <StatusBar barStyle="light-content" />

      {/* Floating Header (always visible on photos) */}
      <View style={[styles.floatingHeader, { top: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={onClose}>
          <Ionicons name="chevron-down" size={26} color="#FFF" />
        </TouchableOpacity>
        {/* Empty view for spacing - no three dots since no actions */}
        <View style={{ width: 40 }} />
      </View>

      {/* Sticky Header (appears on scroll) */}
      <Animated.View
        style={[
          styles.stickyHeader,
          { 
            top: insets.top, 
            opacity: stickyHeaderOpacity,
            backgroundColor: COLORS.bg,
          },
        ]}
        pointerEvents={showStickyHeader ? 'auto' : 'none'}
      >
        <TouchableOpacity style={styles.stickyBackBtn} onPress={onClose}>
          <Ionicons name="chevron-down" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.stickyInfo}>
          <Text style={styles.stickyName} numberOfLines={1}>{profile.name}, {profile.age}</Text>
          <Text style={styles.stickyDetails}>{shortLocation}</Text>
        </View>
        <TouchableOpacity
          style={[styles.stickyMessageBtn, { backgroundColor: accentColor }]}
          onPress={onMessage}
        >
          <Ionicons name="chatbubble" size={16} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* Scrollable Content */}
      <Animated.ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100 }}
        bounces={true}
      >
        {/* Photo Carousel */}
        <PhotoCarousel photos={photos} name={profile.name} />

        {/* Profile Content */}
        <View style={styles.content}>
          {/* Name & Basic Info */}
          <View style={styles.heroSection}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.age}>, {profile.age}</Text>
              {profile.workProfile && (
                <Ionicons name="checkmark-circle" size={18} color={COLORS.buddy} style={{ marginLeft: 6 }} />
              )}
            </View>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color={COLORS.textSecondary} />
              <Text style={styles.locationText}>{formattedLocation}</Text>
            </View>
            {profile.workProfile && (
              <View style={styles.workRow}>
                <Ionicons name="briefcase-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.workText}>{profile.workProfile}</Text>
              </View>
            )}
          </View>

          {/* Match Compatibility */}
          {profile.match_level && (
            <View style={[styles.matchCard, { borderColor: 'rgba(255, 215, 0, 0.3)' }]}>
              <View style={styles.matchCardHeader}>
                <Ionicons name="sparkles" size={16} color={COLORS.gold} />
                <Text style={styles.matchCardTitle}>
                  {profile.match_level.charAt(0).toUpperCase() + profile.match_level.slice(1)} Match
                </Text>
              </View>
              {profile.explanation && (
                <Text style={styles.matchCardText}>{profile.explanation}</Text>
              )}
            </View>
          )}

          {/* About / Bio */}
          {profile.bio && (
            <View style={styles.section}>
              <SectionHeader title="About" />
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          )}

          {/* Quick Info */}
          <View style={styles.section}>
            <SectionHeader title="Quick Info" />
            <View style={styles.infoTagsGrid}>
              {profile.gender && <InfoTag icon="person" text={profile.gender} />}
              {profile.height && <InfoTag icon="resize" text={profile.height} />}
              {profile.zodiac && <InfoTag icon="moon" text={profile.zodiac} />}
              {profile.religion && <InfoTag icon="sparkles" text={profile.religion} />}
              {profile.education && <InfoTag icon="school" text={profile.education} />}
              {profile.personality && <InfoTag icon="happy" text={profile.personality} />}
            </View>
          </View>

          {/* Movie Personality */}
          {(profile.movieFrequency || profile.ottTheatre) && (
            <View style={styles.section}>
              <SectionHeader title="Movie Personality" />
              <View style={styles.infoTagsRow}>
                {profile.movieFrequency && (
                  <InfoTag icon="calendar" text={profile.movieFrequency} />
                )}
                {profile.ottTheatre && (
                  <InfoTag icon="tv" text={profile.ottTheatre} />
                )}
              </View>
            </View>
          )}

          {/* Shared Interests */}
          {profile.shared_interests && profile.shared_interests.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Things in Common" />
              <View style={styles.tagsGrid}>
                {profile.shared_interests.map((interest, idx) => (
                  <GenreChip key={idx} genre={interest} highlight />
                ))}
              </View>
            </View>
          )}

          {/* Favorite Genres */}
          {profile.genres && profile.genres.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Favorite Genres" />
              <View style={styles.tagsGrid}>
                {profile.genres.map((genre, idx) => (
                  <GenreChip key={idx} genre={genre} />
                ))}
              </View>
            </View>
          )}

          {/* Top Movies - Horizontal Posters */}
          {profile.topMovies && profile.topMovies.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Top Movies" />
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moviesScrollContent}
              >
                {profile.topMovies.slice(0, 5).map((movie, idx) => (
                  <MoviePoster key={idx} movie={movie} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Languages Watched */}
          {profile.filmLanguages && profile.filmLanguages.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Languages Watched" />
              <View style={styles.tagsGrid}>
                {profile.filmLanguages.map((lang, idx) => (
                  <GenreChip key={idx} genre={lang} />
                ))}
              </View>
            </View>
          )}

          {/* Lifestyle */}
          {(profile.smoking || profile.drinking || profile.exercise) && (
            <View style={styles.section}>
              <SectionHeader title="Lifestyle" />
              <View style={styles.infoTagsRow}>
                {profile.smoking && <InfoTag icon="flame" text={`Smoking: ${profile.smoking}`} />}
                {profile.drinking && <InfoTag icon="wine" text={`Drinking: ${profile.drinking}`} />}
                {profile.exercise && <InfoTag icon="fitness" text={`Exercise: ${profile.exercise}`} />}
              </View>
            </View>
          )}

          {/* Relationship Intent */}
          {profile.relationshipIntent && profile.relationshipIntent.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Looking For" />
              <View style={styles.tagsGrid}>
                {profile.relationshipIntent.map((intent, idx) => (
                  <GenreChip key={idx} genre={intent} />
                ))}
              </View>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* Fixed Bottom CTA */}
      <View style={[styles.bottomCTA, { paddingBottom: insets.bottom + 12 }]}>
        {hasAlreadySentRequest ? (
          <View style={[styles.messageBtn, styles.messageBtnSent]}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            <Text style={[styles.messageBtnText, { color: COLORS.success }]}>Request Sent</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.messageBtn, { backgroundColor: accentColor }]}
            onPress={onMessage}
            activeOpacity={0.9}
          >
            <Ionicons name="chatbubble" size={20} color="#FFF" />
            <Text style={styles.messageBtnText}>Message</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  floatingHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickyHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: STICKY_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    zIndex: 99,
  },
  stickyBackBtn: {
    marginRight: 12,
    padding: 4,
  },
  stickyInfo: {
    flex: 1,
  },
  stickyName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  stickyDetails: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  stickyMessageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    backgroundColor: COLORS.bg,
    paddingTop: 16,
    paddingHorizontal: 18,
  },
  heroSection: {
    marginBottom: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  name: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  age: {
    fontSize: 24,
    fontWeight: '300',
    color: COLORS.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  locationText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  workRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  workText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  matchCard: {
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
  },
  matchCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  matchCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gold,
  },
  matchCardText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  section: {
    marginBottom: 22,
  },
  bioText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
  },
  infoTagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moviesScrollContent: {
    paddingRight: 18,
  },
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bg,
    paddingTop: 10,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 26,
    gap: 8,
  },
  messageBtnSent: {
    backgroundColor: 'rgba(0, 210, 106, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  messageBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default PremiumProfileView;
