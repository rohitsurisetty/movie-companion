import AsyncStorage from '@react-native-async-storage/async-storage';
import { FiltersData, SwipeState } from './types';

const AUTH_KEY = '@film_companion_auth';
const PROFILE_KEY = '@film_companion_profile';
const ONBOARDING_KEY = '@film_companion_onboarding_complete';
const FILTERS_KEY = '@film_companion_filters';
const SWIPES_KEY = '@film_companion_swipes';
const MODE_KEY = '@film_companion_mode';

export type AppMode = 'buddy' | 'date';

export const saveMode = async (mode: AppMode) => {
  await AsyncStorage.setItem(MODE_KEY, mode);
  
  // Also sync to backend for Supabase tracking
  try {
    const auth = await getAuth();
    if (auth?.user_id) {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      await fetch(`${BACKEND_URL}/api/user/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: auth.user_id,
          mode: mode,
        }),
      });
    }
  } catch (error) {
    console.log('Failed to sync mode to backend:', error);
  }
};

export const getMode = async (): Promise<AppMode> => {
  const mode = await AsyncStorage.getItem(MODE_KEY);
  return (mode as AppMode) || 'date';
};

export const saveAuth = async (data: any) => {
  await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(data));
};

export const getAuth = async () => {
  const data = await AsyncStorage.getItem(AUTH_KEY);
  return data ? JSON.parse(data) : null;
};

export const saveProfile = async (data: any) => {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(data));
};

export const getProfile = async () => {
  const data = await AsyncStorage.getItem(PROFILE_KEY);
  return data ? JSON.parse(data) : null;
};

export const setOnboardingComplete = async () => {
  await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
};

export const isOnboardingComplete = async () => {
  const val = await AsyncStorage.getItem(ONBOARDING_KEY);
  return val === 'true';
};

export const saveFilters = async (data: FiltersData) => {
  await AsyncStorage.setItem(FILTERS_KEY, JSON.stringify(data));
  
  // Also sync to backend for Supabase tracking
  try {
    const auth = await getAuth();
    if (auth?.user_id) {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      await fetch(`${BACKEND_URL}/api/user/filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: auth.user_id,
          session_id: auth.session_token,
          distance_radius: data.distance,
          age_min: data.ageRange?.min,
          age_max: data.ageRange?.max,
          height_min: data.heightRange?.minFeet ? `${data.heightRange.minFeet}'${data.heightRange.minInches}"` : null,
          height_max: data.heightRange?.maxFeet ? `${data.heightRange.maxFeet}'${data.heightRange.maxInches}"` : null,
          languages: data.languages?.selected,
          genres: data.genres?.selected,
          ott_theatre: data.ottTheatre?.selected?.[0],
          film_languages: data.filmLanguages?.selected,
          religion: data.religion?.selected?.[0],
          zodiac: data.zodiac?.selected?.[0],
          siblings: data.siblings?.selected?.[0],
          education: data.education?.selected?.[0],
          travel: data.travel?.selected?.[0],
          smoking: data.smoking?.selected?.[0],
          drinking: data.drinking?.selected?.[0],
          exercise: data.exercise?.selected?.[0],
          pets: data.pets?.selected?.[0],
          family_planning: data.familyPlanning?.selected?.[0],
          marital_status: data.maritalStatus?.selected?.[0],
          food_preference: data.foodPreference?.selected?.[0],
          intent: data.intent?.selected?.[0],
          exclusive_toggles: {
            distanceRadius: data.languages?.exclusive || false,
            ageRange: data.ageRange ? true : false,
            heightPreference: data.heightRange ? true : false,
            languagesTheySpeak: data.languages?.exclusive || false,
            favouriteGenres: data.genres?.exclusive || false,
            ottOrTheatrePreference: data.ottTheatre?.exclusive || false,
            languagesTheyWatch: data.filmLanguages?.exclusive || false,
            religion: data.religion?.exclusive || false,
            zodiacSign: data.zodiac?.exclusive || false,
            siblings: data.siblings?.exclusive || false,
            education: data.education?.exclusive || false,
            travelFrequency: data.travel?.exclusive || false,
            smokingPreference: data.smoking?.exclusive || false,
            drinkingPreference: data.drinking?.exclusive || false,
            exercisePreference: data.exercise?.exclusive || false,
            petsPreference: data.pets?.exclusive || false,
            familyPlanning: data.familyPlanning?.exclusive || false,
            maritalStatus: data.maritalStatus?.exclusive || false,
            foodPreference: data.foodPreference?.exclusive || false,
            intentPreference: data.intent?.exclusive || false,
          },
          expand_if_run_out_toggles: {
            distanceRadius: data.languages?.expandIfRunOut ?? true,
            ageRange: true,
            heightPreference: true,
            languagesTheySpeak: data.languages?.expandIfRunOut ?? true,
            favouriteGenres: data.genres?.expandIfRunOut ?? true,
            ottOrTheatrePreference: data.ottTheatre?.expandIfRunOut ?? true,
            languagesTheyWatch: data.filmLanguages?.expandIfRunOut ?? true,
            religion: data.religion?.expandIfRunOut ?? true,
            zodiacSign: data.zodiac?.expandIfRunOut ?? true,
            siblings: data.siblings?.expandIfRunOut ?? true,
            education: data.education?.expandIfRunOut ?? true,
            travelFrequency: data.travel?.expandIfRunOut ?? true,
            smokingPreference: data.smoking?.expandIfRunOut ?? true,
            drinkingPreference: data.drinking?.expandIfRunOut ?? true,
            exercisePreference: data.exercise?.expandIfRunOut ?? true,
            petsPreference: data.pets?.expandIfRunOut ?? true,
            familyPlanning: data.familyPlanning?.expandIfRunOut ?? true,
            maritalStatus: data.maritalStatus?.expandIfRunOut ?? true,
            foodPreference: data.foodPreference?.expandIfRunOut ?? true,
            intentPreference: data.intent?.expandIfRunOut ?? true,
          },
        }),
      });
    }
  } catch (error) {
    console.log('Failed to sync filters to backend:', error);
  }
};

export const getFilters = async (): Promise<FiltersData | null> => {
  const data = await AsyncStorage.getItem(FILTERS_KEY);
  return data ? JSON.parse(data) : null;
};

export const saveSwipeState = async (data: SwipeState) => {
  await AsyncStorage.setItem(SWIPES_KEY, JSON.stringify(data));
};

export const getSwipeState = async (): Promise<SwipeState | null> => {
  const data = await AsyncStorage.getItem(SWIPES_KEY);
  return data ? JSON.parse(data) : null;
};

export const clearAll = async () => {
  await AsyncStorage.multiRemove([AUTH_KEY, PROFILE_KEY, ONBOARDING_KEY, FILTERS_KEY, SWIPES_KEY]);
};
