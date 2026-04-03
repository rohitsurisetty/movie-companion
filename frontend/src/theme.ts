// Base colors shared across modes
const BASE_COLORS = {
  bg: '#121212',
  bgSecondary: '#0A0A0A',
  bgCard: '#1E1E1E',
  bgInput: '#2C2C2C',
  gold: '#FFD700',
  goldDark: '#C5A059',
  text: '#F5F5F5',
  textSecondary: '#B3B3B3',
  textMuted: '#757575',
  border: '#333333',
  error: '#CF6679',
  success: '#4CAF50',
  white: '#FFFFFF',
  black: '#000000',
};

// Movie Date Mode - Red/Flirty theme
export const DATE_MODE_COLORS = {
  ...BASE_COLORS,
  primary: '#E50914',
  primaryDark: '#B20710',
  primaryLight: '#FF4D58',
  borderFocus: '#E50914',
  accent: '#FF6B81',
  modeName: 'Movie Date',
  modeIcon: 'heart' as const,
};

// Movie Buddy Mode - Blue/Friendly theme
export const BUDDY_MODE_COLORS = {
  ...BASE_COLORS,
  primary: '#2196F3',
  primaryDark: '#1565C0',
  primaryLight: '#64B5F6',
  borderFocus: '#2196F3',
  accent: '#4FC3F7',
  modeName: 'Movie Buddy',
  modeIcon: 'people' as const,
};

// Default export - Date mode is default
export const COLORS = DATE_MODE_COLORS;

export const getThemeColors = (mode: 'buddy' | 'date') => {
  return mode === 'buddy' ? BUDDY_MODE_COLORS : DATE_MODE_COLORS;
};

export const SPACING = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
};

export const BORDER_RADIUS = {
  s: 4,
  m: 8,
  l: 16,
  xl: 24,
  full: 9999,
};

// Swipe reasons for left swipe (dislike/skip)
export const LEFT_SWIPE_REASONS = [
  { id: 'not_watched', label: "Haven't watched it", icon: 'eye-off-outline' },
  { id: 'not_interested', label: 'Not my type', icon: 'thumbs-down-outline' },
  { id: 'bad_acting', label: "Didn't like acting", icon: 'person-outline' },
  { id: 'bad_story', label: 'Boring story', icon: 'book-outline' },
  { id: 'too_long', label: 'Too long/slow', icon: 'time-outline' },
  { id: 'other', label: 'Other reason', icon: 'ellipsis-horizontal' },
];

// Swipe reasons for right swipe (like) - optional
export const RIGHT_SWIPE_REASONS = [
  { id: 'great_story', label: 'Great story/plot', icon: 'book' },
  { id: 'great_acting', label: 'Amazing acting', icon: 'star' },
  { id: 'great_visuals', label: 'Stunning visuals', icon: 'videocam' },
  { id: 'great_music', label: 'Great soundtrack', icon: 'musical-notes' },
  { id: 'emotional', label: 'Emotionally moving', icon: 'heart' },
  { id: 'rewatchable', label: 'Can rewatch anytime', icon: 'repeat' },
];
