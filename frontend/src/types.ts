export type MovieSelection = {
  id: number;
  title: string;
  poster_path: string;
  rating: number;
  reasons: string[];
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
  languages: makeFilter(['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu']),
  genres: makeFilter(['Action', 'Romance', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi', 'Drama', 'Documentary']),
  smoking: makeFilter(['Non-smoker', 'Occasional smoker', 'Regular smoker']),
  drinking: makeFilter(['Non-drinker', 'Social drinker', 'Regular drinker']),
  exercise: makeFilter(['Regularly', 'Occasionally', 'Rarely']),
  pets: makeFilter(['Love pets', 'Okay with pets', 'Prefer no pets']),
  familyPlanning: makeFilter(['Want kids', "Don't want kids", 'Open to kids', 'Not sure yet']),
  maritalStatus: makeFilter(['Single', 'Divorced', 'Separated', 'Widowed']),
  foodPreference: makeFilter(['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain']),
  intent: makeFilter(['Casual', 'Friendship', 'Serious relationship', 'Exploring']),
  // New filters - all selected by default
  ottTheatre: makeFilter(['OTT Lover', 'Theatre Enthusiast', 'Both']),
  filmLanguages: makeFilter(['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Korean', 'Japanese', 'Spanish', 'French']),
  religion: makeFilter(['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other', 'Prefer not to say']),
  zodiac: makeFilter(['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']),
  siblings: makeFilter(['Only child', 'Has siblings']),
  education: makeFilter(['High School', 'Bachelor\'s', 'Master\'s', 'PhD', 'Other']),
  travel: makeFilter(['Frequently', 'Occasionally', 'Rarely', 'Never']),
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
