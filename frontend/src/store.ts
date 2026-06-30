import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { FiltersData, SwipeState } from './types';

// ============ USER / CHAT STORE ============
// Used to hand off "selected conversation" between History screen and Chat tab.
export interface SelectedConversation {
  conversation_id: string;
  other_user_id: string;
  other_user?: {
    user_id: string;
    name: string;
    avatar?: string;
    location?: string;
  };
  status: string;
  unread: number;
  is_read_only?: boolean;
}

interface UserStoreState {
  selectedConversation: SelectedConversation | null;
  setSelectedConversation: (conv: SelectedConversation | null) => void;
  clearSelectedConversation: () => void;
}

export const useUserStore = create<UserStoreState>((set) => ({
  selectedConversation: null,
  setSelectedConversation: (conv) => set({ selectedConversation: conv }),
  clearSelectedConversation: () => set({ selectedConversation: null }),
}));

const AUTH_KEY = '@film_companion_auth';
const PROFILE_KEY = '@film_companion_profile';
const ONBOARDING_KEY = '@film_companion_onboarding_complete';
const FILTERS_KEY = '@film_companion_filters';
const SWIPES_KEY = '@film_companion_swipes';
const MODE_KEY = '@film_companion_mode';

export type AppMode = 'buddy' | 'date';

// Zustand store for global app state (shared across all tabs)
interface AppState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  initializeMode: () => Promise<void>;
}

// NOTE: "Buddy" / "Date" modes have been removed from the product.
// We keep this store shape for backwards-compatibility with screens that
// still reference `mode`, but the mode is always forced to 'date' and
// `setMode` is a no-op. No persistence and no backend sync.
export const useAppStore = create<AppState>((set) => ({
  mode: 'date',
  setMode: async (_mode: AppMode) => {
    // No-op: mode selection is no longer exposed in the UI.
    set({ mode: 'date' });
  },
  initializeMode: async () => {
    set({ mode: 'date' });
  },
}));

export const saveMode = async (_mode: AppMode) => {
  // No-op (mode selection removed)
};

export const getMode = async (): Promise<AppMode> => {
  return 'date';
};

// Session token MUST be stored in SecureStore (Keychain/Keystore-backed) not
// AsyncStorage — an APK on a rooted/compromised device can read AsyncStorage
// in plaintext. Web doesn't have SecureStore so we transparently fall back
// to AsyncStorage there (web preview is dev-only). Same idiom used in expo
// docs.
const TOKEN_KEY = 'film_companion_session_token';
const _useSecure = Platform.OS !== 'web';

async function _saveSecret(key: string, value: string | null | undefined) {
  if (_useSecure) {
    if (!value) {
      try { await SecureStore.deleteItemAsync(key); } catch { /* ignore */ }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } else {
    if (!value) {
      try { await AsyncStorage.removeItem(`@secure:${key}`); } catch { /* ignore */ }
      return;
    }
    await AsyncStorage.setItem(`@secure:${key}`, value);
  }
}

async function _loadSecret(key: string): Promise<string | null> {
  if (_useSecure) {
    try { return await SecureStore.getItemAsync(key); } catch { return null; }
  }
  try { return await AsyncStorage.getItem(`@secure:${key}`); } catch { return null; }
}

export const saveAuth = async (data: any) => {
  // Split the auth payload: session_token (sensitive) → SecureStore,
  // everything else (user_id/name/email — already revealed to the server
  // and not directly exploitable) → AsyncStorage. Keeps existing callers
  // working unchanged: they hand us {session_token, ...rest}, we read it
  // back the same way via getAuth().
  const { session_token, ...rest } = data || {};
  await _saveSecret(TOKEN_KEY, session_token);
  await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(rest));
};

export const getAuth = async () => {
  const raw = await AsyncStorage.getItem(AUTH_KEY);
  const rest = raw ? JSON.parse(raw) : null;
  const session_token = await _loadSecret(TOKEN_KEY);
  if (!rest && !session_token) return null;
  return { ...(rest || {}), session_token: session_token || undefined };
};

export const getUserId = async (): Promise<string> => {
  const auth = await getAuth();
  return auth?.user_id || `guest_${Date.now()}`;
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
  // Also wipe the session token from SecureStore so logout truly clears auth.
  await _saveSecret(TOKEN_KEY, null);
};

// Install a global fetch monkey-patch that automatically attaches the
// session token to any backend API request, so the 50+ existing fetch()
// call sites keep working unchanged after we added the global auth
// middleware. Must be called ONCE at app boot (root _layout.tsx).
let _authFetchInstalled = false;
export function installAuthenticatedFetch(apiBase: string) {
  if (_authFetchInstalled) return;
  _authFetchInstalled = true;
  const originalFetch = (globalThis as any).fetch?.bind(globalThis);
  if (!originalFetch) return;
  (globalThis as any).fetch = async (input: any, init: any = {}) => {
    try {
      let url: string = typeof input === 'string' ? input : (input?.url || '');
      // Only inject for backend API calls — never for third-party or static URLs.
      const isBackend = apiBase && url && url.startsWith(apiBase);
      if (!isBackend) return originalFetch(input, init);
      const token = await _loadSecret(TOKEN_KEY);
      if (!token) return originalFetch(input, init);
      const headers = new Headers(init?.headers || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      // expo-audio AudioPlayer in native won't forward headers — let any
      // helpers that build streaming URLs (e.g. tts speak-stream) read this
      // value if needed. Not added globally because we only want it on the
      // few endpoints that actually consume <audio src=URL>.
      return originalFetch(input, { ...init, headers });
    } catch (e) {
      return originalFetch(input, init);
    }
  };
}

// Convenience: read the raw token for components that need to append it as
// a query param on streaming-media URLs (audio src=). Returns '' if none.
export async function getSessionToken(): Promise<string> {
  return (await _loadSecret(TOKEN_KEY)) || '';
}
