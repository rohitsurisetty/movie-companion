// Canonical option lists (single source of truth shared with the profile
// editor). constants.ts has no imports, so this cannot create a cycle.
import {
  LANGUAGES, GENRES, SMOKING_OPTS, DRINKING_OPTS, EXERCISE_OPTS, PETS_OPTS,
  FAMILY_OPTS, MARITAL_STATUSES, FOOD_PREFS, RELATIONSHIP_INTENTS, OTT_OPTIONS,
  FILM_LANGUAGES, RELIGIONS, ZODIAC_SIGNS, SIBLINGS_OPTS, EDUCATION_OPTS, TRAVEL_OPTS,
} from './components/profile/constants';

export type MovieSelection = {
  id: number;
  title: string;
  poster_path: string;
  rating: number;
  reasons: string[];
  release_date?: string;
  vote_average?: number;
  genres?: string[];
};

export type ProfileData = {
  name: string;
  gender: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  age: number;
  location: string;
  relationshipIntent: string[];
  partnerPreference: string;
  languagesSpoken: string[];
  movieFrequency: string;
  ottTheatre: string;
  filmLanguages: string[];
  genres: string[];
  topMovies: MovieSelection[];
  height: string;
  religion: string;
  maritalStatus: string;
  foodPreference: string;
  bio: string;
  avatarId: string;
  smoking: string;
  drinking: string;
  exercise: string;
  zodiac: string;
  pets: string;
  familyPlanning: string;
  siblings: string;
  education: string;
  workProfile: string;
  travel: string;
  visibilityToggles: Record<string, boolean>;
  movieBuddyMode: boolean;
  movieDateMode: boolean;
  // Photo fields - stored from photos.tsx
  userId?: string;
  profilePicture?: string;
  pictures?: string[];
  // Persisted by POST /api/user/profile (dob drives the 18+ check server-side)
  dob?: string;
  genderIdentity?: string;
  locationFull?: string;
  coordinates?: { lat: number; lng: number };
};

export const initialProfileData: ProfileData = {
  name: '',
  gender: '',
  dobDay: '',
  dobMonth: '',
  dobYear: '',
  age: 0,
  location: '',
  relationshipIntent: [],
  partnerPreference: '',
  languagesSpoken: [],
  movieFrequency: '',
  ottTheatre: '',
  filmLanguages: [],
  genres: [],
  topMovies: [],
  height: '',
  religion: '',
  maritalStatus: '',
  foodPreference: '',
  bio: '',
  avatarId: '',
  smoking: '',
  drinking: '',
  exercise: '',
  zodiac: '',
  pets: '',
  familyPlanning: '',
  siblings: '',
  education: '',
  workProfile: '',
  travel: '',
  visibilityToggles: {
    name: true, gender: true, age: true, location: true,
    relationshipIntent: true, partnerPreference: true,
    languagesSpoken: true, movieFrequency: true, ottTheatre: true,
    filmLanguages: true, genres: true, topMovies: true,
    height: false, religion: false, maritalStatus: false,
    foodPreference: false, bio: true, smoking: false,
    drinking: false, exercise: false, zodiac: false,
    pets: false, familyPlanning: false, siblings: false,
    education: false, workProfile: false, travel: false,
  },
  movieBuddyMode: false,
  movieDateMode: false,
};

// --- Iteration 2 Types ---

export type FilterSection = {
  selected: string[];
  exclusive: boolean;
  expandIfRunOut: boolean;
};

export type HeightFilter = {
  minFeet: number;
  minInches: number;
  maxFeet: number;
  maxInches: number;
  minCm: number;
  maxCm: number;
  unit: 'imperial' | 'metric';
  exclusive: boolean;
  expandIfRunOut: boolean;
};

export type AgeFilter = {
  min: number;
  max: number;
  exclusive: boolean;
  expandIfRunOut: boolean;
};

export type FiltersData = {
  distance: { radius: number; exclusive: boolean; expandIfRunOut: boolean };
  age: AgeFilter;
  height: HeightFilter;
  languages: FilterSection;
  genres: FilterSection;
  smoking: FilterSection;
  drinking: FilterSection;
  exercise: FilterSection;
  pets: FilterSection;
  familyPlanning: FilterSection;
  maritalStatus: FilterSection;
  foodPreference: FilterSection;
  intent: FilterSection;
  // New filters
  ottTheatre: FilterSection;
  filmLanguages: FilterSection;
  religion: FilterSection;
  zodiac: FilterSection;
  siblings: FilterSection;
  education: FilterSection;
  travel: FilterSection;
};

const makeFilter = (opts: string[]): FilterSection => ({
  selected: [...opts],
  exclusive: false,
  expandIfRunOut: true,
});

export const initialFiltersData: FiltersData = {
  distance: { radius: -1, exclusive: false, expandIfRunOut: true },
  age: { min: 18, max: 60, exclusive: false, expandIfRunOut: true },
  height: {
    minFeet: 4, minInches: 6, maxFeet: 7, maxInches: 0,
    minCm: 137, maxCm: 213, unit: 'imperial',
    exclusive: false, expandIfRunOut: true,
  },
  // Option values MUST match what the profile editor stores, otherwise the
  // backend's set matching never finds anyone (e.g. 'Non-smoker' vs 'Never').
  languages: makeFilter(LANGUAGES),
  genres: makeFilter(GENRES),
  smoking: makeFilter(SMOKING_OPTS),
  drinking: makeFilter(DRINKING_OPTS),
  exercise: makeFilter(EXERCISE_OPTS),
  pets: makeFilter(PETS_OPTS),
  familyPlanning: makeFilter(FAMILY_OPTS),
  maritalStatus: makeFilter(MARITAL_STATUSES),
  foodPreference: makeFilter(FOOD_PREFS),
  intent: makeFilter(RELATIONSHIP_INTENTS),
  // New filters - all selected by default
  ottTheatre: makeFilter(OTT_OPTIONS),
  filmLanguages: makeFilter(FILM_LANGUAGES),
  religion: makeFilter(RELIGIONS),
  zodiac: makeFilter(ZODIAC_SIGNS),
  siblings: makeFilter(SIBLINGS_OPTS),
  education: makeFilter(EDUCATION_OPTS),
  travel: makeFilter(TRAVEL_OPTS),
};

export type SwipeRecord = {
  movieId: number;
  title: string;
  direction: 'left' | 'right';
  rating: number;
  reasons: string[];
  genreIds: number[];
  timestamp: string;
};

export type SwipeState = {
  swipes: SwipeRecord[];
  totalSwipes: number;
  swipedMovieIds: number[];
};

export const initialSwipeState: SwipeState = {
  swipes: [],
  totalSwipes: 0,
  swipedMovieIds: [],
};

export type FeedMovie = {
  id: number;
  title: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  overview: string;
  vote_average: number;
  genre_ids: number[];
};

export type MovieDetail = {
  id: number;
  title: string;
  poster_path: string;
  overview: string;
  release_date: string;
  vote_average: number;
  runtime: number;
  genres: string[];
  cast: { name: string; character: string }[];
  directors: string[];
};

export const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'Action', 10749: 'Romance', 35: 'Comedy', 53: 'Thriller',
  27: 'Horror', 878: 'Sci-Fi', 18: 'Drama', 99: 'Documentary',
  12: 'Adventure', 16: 'Animation', 80: 'Crime', 14: 'Fantasy',
  36: 'History', 10402: 'Music', 9648: 'Mystery', 10770: 'TV Movie',
  10752: 'War', 37: 'Western',
};
