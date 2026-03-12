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
  visibilityToggles: {
    name: true, gender: true, age: true, location: true,
    relationshipIntent: true, partnerPreference: true,
    languagesSpoken: true, movieFrequency: true, ottTheatre: true,
    filmLanguages: true, genres: true, topMovies: true,
    height: false, religion: false, maritalStatus: false,
    foodPreference: false, bio: true, smoking: false,
    drinking: false, exercise: false, zodiac: false,
    pets: false, familyPlanning: false, siblings: false,
  },
  movieBuddyMode: false,
  movieDateMode: false,
};
