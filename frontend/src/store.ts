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
