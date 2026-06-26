/**
 * Profile screen lookup tables.
 * Extracted from app/(tabs)/profile.tsx for maintainability.
 */

// Avatar options used by AvatarSelectModal
export const AVATAR_OPTIONS = [
  { id: 'av1', color: '#E50914', icon: 'person' as const },
  { id: 'av2', color: '#FFD700', icon: 'happy' as const },
  { id: 'av3', color: '#4CAF50', icon: 'leaf' as const },
  { id: 'av4', color: '#2196F3', icon: 'planet' as const },
  { id: 'av5', color: '#9C27B0', icon: 'star' as const },
  { id: 'av6', color: '#FF9800', icon: 'sunny' as const },
];

export const GENDERS = ['Man', 'Woman', 'Non-binary', 'Prefer not to say', 'Other'];
export const RELATIONSHIP_INTENTS = ['Casual', 'Friendship', 'Serious relationship', 'Exploring'];
export const PARTNER_PREFS = ['Men', 'Women', 'Anyone'];
export const LANGUAGES = ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu'];
export const MOVIE_FREQUENCIES = ['More than twice a week', 'Twice a week', 'Once a week', 'Twice a month', 'Once a month', 'Rarely'];
export const FILM_LANGUAGES = ['Hindi', 'English', 'Telugu', 'Tamil', 'Malayalam', 'Kannada', 'Korean', 'Others'];
export const GENRES = ['Action', 'Romance', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi', 'Drama', 'Documentary'];
export const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Atheist', 'Other', 'Prefer not to say'];
export const MARITAL_STATUSES = ['Single', 'Divorced', 'Widowed', 'Separated'];
export const OTT_OPTIONS = ['OTT Person', 'Theatre Person', 'Both OTT & Theatre', 'Neither'];
export const FOOD_PREFS = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain'];
export const SMOKING_OPTS = ['Never', 'Socially', 'Regularly', 'Trying to quit'];
export const DRINKING_OPTS = ['Never', 'Socially', 'Regularly', 'Sober'];
export const EXERCISE_OPTS = ['Daily', 'Often', 'Sometimes', 'Never'];
export const ZODIAC_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
export const PETS_OPTS = ['Dog lover', 'Cat lover', 'Both', 'No pets', 'Other'];
export const FAMILY_OPTS = ['Want kids', "Don't want kids", 'Open to kids', 'Have kids'];
export const SIBLINGS_OPTS = ['Only child', 'Have siblings'];
export const EDUCATION_OPTS = ['High School', "Bachelor's", "Master's", 'PhD', 'Other'];
export const TRAVEL_OPTS = ['Frequently', 'Occasionally', 'Rarely', 'Never'];
export const WORK_OPTS = ['IT/Software', 'Business Owner', 'Lawyer', 'Teacher', 'Others'];

export type EditModalType =
  | 'avatar' | 'name' | 'gender' | 'location' | 'bio'
  | 'relationshipIntent' | 'partnerPreference' | 'languagesSpoken'
  | 'movieFrequency' | 'ottTheatre' | 'filmLanguages' | 'genres'
  | 'height' | 'religion' | 'maritalStatus' | 'foodPreference'
  | 'smoking' | 'drinking' | 'exercise' | 'zodiac' | 'pets'
  | 'familyPlanning' | 'siblings' | 'education' | 'travel' | 'workProfile'
  | 'topMovies' | null;
