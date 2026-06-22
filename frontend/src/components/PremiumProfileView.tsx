import React, { useState, useRef, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatLocationForPrivacy } from '../utils/locationFormatter';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PHOTO_HEIGHT = SCREEN_HEIGHT * 0.55;
const HEADER_HEIGHT = 60;
const STICKY_HEADER_HEIGHT = 56;

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
  onIndexChange,
}: {
  photos: string[];
  name: string;
  onIndexChange?: (index: number) => void;
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / SCREEN_WIDTH);
    if (index !== currentIndex) {
      setCurrentIndex(index);
      onIndexChange?.(index);
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

      {/* Photo Indicators */}
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
        colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(10,10,10,0.95)']}
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
    width: 150,
    height: 150,
    borderRadius: 75,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#FFF',
  },
  indicatorsContainer: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  indicator: {
    width: (SCREEN_WIDTH - 48) / 5,
    maxWidth: 60,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  indicatorActive: {
    backgroundColor: '#FFFFFF',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
});

// ============ SECTION COMPONENTS ============
const SectionHeader = ({ title, icon }: { title: string; icon?: string }) => (
  <View style={sectionStyles.header}>
    {icon && <Ionicons name={icon as any} size={18} color={COLORS.primary} style={{ marginRight: 8 }} />}
    <Text style={sectionStyles.headerText}>{title}</Text>
  </View>
);

const InfoTag = ({ icon, text, color }: { icon: string; text: string; color?: string }) => (
  <View style={sectionStyles.infoTag}>
    <Ionicons name={icon as any} size={16} color={color || COLORS.textSecondary} />
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

const MovieCard = ({ movie, index }: { movie: { title: string; poster_path?: string }; index: number }) => (
  <View style={sectionStyles.movieCard}>
    <View style={sectionStyles.movieRank}>
      <Text style={sectionStyles.movieRankText}>{index + 1}</Text>
    </View>
    <View style={sectionStyles.movieInfo}>
      <Text style={sectionStyles.movieTitle} numberOfLines={1}>{movie.title}</Text>
    </View>
  </View>
);

const sectionStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  infoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSection,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  infoTagText: {
    fontSize: 14,
    color: COLORS.text,
  },
  genreChip: {
    backgroundColor: COLORS.bgSection,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  genreChipHighlight: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    borderColor: COLORS.primary,
  },
  genreChipText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  genreChipTextHighlight: {
    color: COLORS.primary,
  },
  movieCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSection,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  movieRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  movieRankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
  },
  movieInfo: {
    flex: 1,
  },
  movieTitle: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
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
  const [showStickyHeader, setShowStickyHeader] = useState(false);

  // Reset scroll position when profile changes
  useEffect(() => {
    scrollY.setValue(0);
    setShowStickyHeader(false);
  }, [profile?.user_id]);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = event.nativeEvent.contentOffset.y;
        setShowStickyHeader(y > PHOTO_HEIGHT - STICKY_HEADER_HEIGHT - 40);
      },
    }
  );

  if (!visible || !profile) return null;

  const accentColor = mode === 'date' ? COLORS.primary : COLORS.buddy;
  const formattedLocation = formatLocationForPrivacy(profile.location);

  // Sticky header opacity animation
  const stickyHeaderOpacity = scrollY.interpolate({
    inputRange: [PHOTO_HEIGHT - 150, PHOTO_HEIGHT - 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Floating Header */}
      <View style={[styles.floatingHeader, { top: insets.top }]}>
        <TouchableOpacity style={styles.headerButton} onPress={onClose}>
          <Ionicons name="chevron-down" size={28} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerButton}>
          <Ionicons name="share-outline" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Sticky Header (appears on scroll) */}
      <Animated.View
        style={[
          styles.stickyHeader,
          { top: insets.top, opacity: stickyHeaderOpacity },
        ]}
        pointerEvents={showStickyHeader ? 'auto' : 'none'}
      >
        <TouchableOpacity style={styles.stickyBackBtn} onPress={onClose}>
          <Ionicons name="chevron-down" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.stickyInfo}>
          <Text style={styles.stickyName} numberOfLines={1}>{profile.name}</Text>
          <Text style={styles.stickyDetails}>{profile.age} • {formattedLocation.split(',')[0]}</Text>
        </View>
        <TouchableOpacity
          style={[styles.stickyMessageBtn, { backgroundColor: accentColor }]}
          onPress={onMessage}
        >
          <Ionicons name="chatbubble" size={18} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* Scrollable Content */}
      <Animated.ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Photo Carousel */}
        <PhotoCarousel photos={photos} name={profile.name} />

        {/* Profile Content */}
        <View style={styles.content}>
          {/* Drag Handle */}
          <View style={styles.dragHandle} />

          {/* Name & Basic Info */}
          <View style={styles.heroSection}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.age}>, {profile.age}</Text>
              {profile.workProfile && (
                <Ionicons name="checkmark-circle" size={22} color={COLORS.buddy} style={{ marginLeft: 8 }} />
              )}
            </View>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color={COLORS.textSecondary} />
              <Text style={styles.locationText}>{formattedLocation}</Text>
            </View>
            {profile.workProfile && (
              <View style={styles.workRow}>
                <Ionicons name="briefcase-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.workText}>{profile.workProfile}</Text>
              </View>
            )}
          </View>

          {/* Match Compatibility */}
          {profile.match_level && (
            <View style={[styles.matchCard, { borderColor: accentColor }]}>
              <View style={styles.matchCardHeader}>
                <Ionicons name="sparkles" size={20} color={COLORS.gold} />
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
              <SectionHeader title="Movie Personality" icon="film" />
              <View style={styles.infoTagsRow}>
                {profile.movieFrequency && (
                  <InfoTag icon="calendar" text={profile.movieFrequency} color={accentColor} />
                )}
                {profile.ottTheatre && (
                  <InfoTag icon="tv" text={profile.ottTheatre} color={accentColor} />
                )}
              </View>
            </View>
          )}

          {/* Shared Interests */}
          {profile.shared_interests && profile.shared_interests.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Things in Common" icon="heart" />
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

          {/* Top Movies */}
          {profile.topMovies && profile.topMovies.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Top Movies" icon="star" />
              {profile.topMovies.slice(0, 5).map((movie, idx) => (
                <MovieCard key={idx} movie={movie} index={idx} />
              ))}
            </View>
          )}

          {/* Languages */}
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
      <View style={[styles.bottomCTA, { paddingBottom: insets.bottom + 16 }]}>
        {hasAlreadySentRequest ? (
          <View style={[styles.messageBtn, styles.messageBtnSent]}>
            <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
            <Text style={[styles.messageBtnText, { color: COLORS.success }]}>Request Sent</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.messageBtn, { backgroundColor: accentColor }]}
            onPress={onMessage}
            activeOpacity={0.9}
          >
            <Ionicons name="chatbubble" size={22} color="#FFF" />
            <Text style={styles.messageBtnText}>Message</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
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
    paddingVertical: 8,
    zIndex: 100,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickyHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: STICKY_HEADER_HEIGHT,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    zIndex: 99,
  },
  stickyBackBtn: {
    marginRight: 12,
  },
  stickyInfo: {
    flex: 1,
  },
  stickyName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  stickyDetails: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  stickyMessageBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textMuted,
    alignSelf: 'center',
    marginBottom: 20,
  },
  heroSection: {
    marginBottom: 24,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  name: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  age: {
    fontSize: 28,
    fontWeight: '300',
    color: COLORS.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  workRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  workText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  matchCard: {
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  matchCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  matchCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gold,
  },
  matchCardText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  section: {
    marginBottom: 28,
  },
  bioText: {
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 26,
  },
  infoTagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bg,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 28,
    gap: 10,
  },
  messageBtnSent: {
    backgroundColor: 'rgba(0, 210, 106, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  messageBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default PremiumProfileView;
