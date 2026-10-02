import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { FiltersData, SwipeState } from './types';

// ============ API BASE (single source of truth) ============
// Every backend call in the app must build its URL from API_BASE / apiUrl().
// Set EXPO_PUBLIC_BACKEND_URL at build time (eas.json env or .env). The old
// code read two different env vars in different files, which meant a build
// with only one of them set sent half the requests unauthenticated.
export const API_BASE: string = (
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  ''
)
  .trim()
  .replace(/\/+$/, '');

if (!API_BASE) {
  // Loud but non-fatal: the app renders, every request fails with a clear error.
  console.warn(
    '[config] EXPO_PUBLIC_BACKEND_URL is not set — backend requests will fail. ' +
      'Set it in eas.json (build profile env) or frontend/.env.'
  );
}

export const apiUrl = (path: string): string =>
  `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

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
const VISIBILITY_KEY = 'visibility_settings';

// ============ SESSION TOKEN (SecureStore) ============
// Session token MUST be stored in SecureStore (Keychain/Keystore-backed) not
// AsyncStorage — an APK on a rooted/compromised device can read AsyncStorage
// in plaintext. Web doesn't have SecureStore so we transparently fall back
// to AsyncStorage there (web preview is dev-only).
const TOKEN_KEY = 'film_companion_session_token';
const _useSecure = Platform.OS !== 'web';

// In-memory cache so the global fetch wrapper doesn't hit the Keystore on
// every single request. `undefined` = not loaded yet, `null` = no token.
let _tokenCache: string | null | undefined = undefined;

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

async function _loadToken(): Promise<string | null> {
  if (_tokenCache !== undefined) return _tokenCache;
  _tokenCache = await _loadSecret(TOKEN_KEY);
  return _tokenCache;
}

// ============ AUTH ============
export interface AuthData {
  user_id: string;
  session_token?: string;
  name?: string;
  email?: string;
  phone?: string;
  picture?: string;
  [key: string]: any;
}

export const saveAuth = async (data: any) => {
  // Split the auth payload: session_token (sensitive) → SecureStore,
  // everything else (user_id/name/email) → AsyncStorage.
  const { session_token, ...rest } = data || {};
  await _saveSecret(TOKEN_KEY, session_token);
  _tokenCache = session_token || null;
  await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(rest));
};

/**
 * Returns the stored auth record, or null when the user is NOT usably logged
 * in. A record without a session token (e.g. after an Android backup-restore
 * wiped the Keystore) is treated as logged-out, because every backend call
 * would 401 anyway.
 */
export const getAuth = async (): Promise<AuthData | null> => {
  let rest: any = null;
  try {
    const raw = await AsyncStorage.getItem(AUTH_KEY);
    rest = raw ? JSON.parse(raw) : null;
  } catch {
    rest = null;
  }
  const session_token = await _loadToken();
  if (!rest?.user_id || !session_token) return null;
  return { ...rest, session_token };
};

export const getUserId = async (): Promise<string> => {
  // Empty string = not signed in. Callers must redirect to login or refuse
  // to send the request — never fabricate an id.
  const auth = await getAuth();
  return auth?.user_id || '';
};

// ============ PROFILE / ONBOARDING ============
export const saveProfile = async (data: any) => {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(data));
};

export const getProfile = async () => {
  try {
    const data = await AsyncStorage.getItem(PROFILE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const setOnboardingComplete = async () => {
  await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
};

export const isOnboardingComplete = async () => {
  const val = await AsyncStorage.getItem(ONBOARDING_KEY);
  return val === 'true';
};

// ============ FILTERS ============
const heightLabel = (feet?: number, inches?: number): string | null =>
  typeof feet === 'number' && feet > 0 ? `${feet}'${inches ?? 0}"` : null;

/** Builds the exact payload POST /api/user/filters expects (all ints/strings/lists). */
export const buildFiltersPayload = (data: FiltersData) => {
  const sec = (s?: { selected?: string[]; exclusive?: boolean; expandIfRunOut?: boolean }) => ({
    selected: s?.selected ?? [],
    first: s?.selected?.[0] ?? null,
    exclusive: !!s?.exclusive,
    expand: s?.expandIfRunOut ?? true,
  });
  const f = {
    languages: sec(data.languages),
    genres: sec(data.genres),
    ottTheatre: sec(data.ottTheatre),
    filmLanguages: sec(data.filmLanguages),
    religion: sec(data.religion),
    zodiac: sec(data.zodiac),
    siblings: sec(data.siblings),
    education: sec(data.education),
    travel: sec(data.travel),
    smoking: sec(data.smoking),
    drinking: sec(data.drinking),
    exercise: sec(data.exercise),
    pets: sec(data.pets),
    familyPlanning: sec(data.familyPlanning),
    maritalStatus: sec(data.maritalStatus),
    foodPreference: sec(data.foodPreference),
    intent: sec(data.intent),
  };
  const distance = data.distance?.radius;
  return {
    // -1 means "no limit" in the UI; send null so the backend applies no cap.
    distance_radius:
      typeof distance === 'number' && distance > 0 ? Math.round(distance) : null,
    age_min: data.age?.min ?? null,
    age_max: data.age?.max ?? null,
    height_min: heightLabel(data.height?.minFeet, data.height?.minInches),
    height_max: heightLabel(data.height?.maxFeet, data.height?.maxInches),
    height_min_cm: data.height?.minCm ?? null,
    height_max_cm: data.height?.maxCm ?? null,
    languages: f.languages.selected,
    genres: f.genres.selected,
    ott_theatre: f.ottTheatre.first,
    film_languages: f.filmLanguages.selected,
    religion: f.religion.first,
    zodiac: f.zodiac.first,
    siblings: f.siblings.first,
    education: f.education.first,
    travel: f.travel.first,
    smoking: f.smoking.first,
    drinking: f.drinking.first,
    exercise: f.exercise.first,
    pets: f.pets.first,
    family_planning: f.familyPlanning.first,
    marital_status: f.maritalStatus.first,
    food_preference: f.foodPreference.first,
    intent: f.intent.first,
    // Full multi-select lists so the backend can do proper set matching.
    selected_lists: {
      ottTheatre: f.ottTheatre.selected,
      religion: f.religion.selected,
      zodiac: f.zodiac.selected,
      siblings: f.siblings.selected,
      education: f.education.selected,
      travel: f.travel.selected,
      smoking: f.smoking.selected,
      drinking: f.drinking.selected,
      exercise: f.exercise.selected,
      pets: f.pets.selected,
      familyPlanning: f.familyPlanning.selected,
      maritalStatus: f.maritalStatus.selected,
      foodPreference: f.foodPreference.selected,
      intent: f.intent.selected,
    },
    exclusive_toggles: {
      distanceRadius: !!data.distance?.exclusive,
      ageRange: !!data.age?.exclusive,
      heightPreference: !!data.height?.exclusive,
      languagesTheySpeak: f.languages.exclusive,
      favouriteGenres: f.genres.exclusive,
      ottOrTheatrePreference: f.ottTheatre.exclusive,
      languagesTheyWatch: f.filmLanguages.exclusive,
      religion: f.religion.exclusive,
      zodiacSign: f.zodiac.exclusive,
      siblings: f.siblings.exclusive,
      education: f.education.exclusive,
      travelFrequency: f.travel.exclusive,
      smokingPreference: f.smoking.exclusive,
      drinkingPreference: f.drinking.exclusive,
      exercisePreference: f.exercise.exclusive,
      petsPreference: f.pets.exclusive,
      familyPlanning: f.familyPlanning.exclusive,
      maritalStatus: f.maritalStatus.exclusive,
      foodPreference: f.foodPreference.exclusive,
      intentPreference: f.intent.exclusive,
    },
    expand_if_run_out_toggles: {
      distanceRadius: data.distance?.expandIfRunOut ?? true,
      ageRange: data.age?.expandIfRunOut ?? true,
      heightPreference: data.height?.expandIfRunOut ?? true,
      languagesTheySpeak: f.languages.expand,
      favouriteGenres: f.genres.expand,
      ottOrTheatrePreference: f.ottTheatre.expand,
      languagesTheyWatch: f.filmLanguages.expand,
      religion: f.religion.expand,
      zodiacSign: f.zodiac.expand,
      siblings: f.siblings.expand,
      education: f.education.expand,
      travelFrequency: f.travel.expand,
      smokingPreference: f.smoking.expand,
      drinkingPreference: f.drinking.expand,
      exercisePreference: f.exercise.expand,
      petsPreference: f.pets.expand,
      familyPlanning: f.familyPlanning.expand,
      maritalStatus: f.maritalStatus.expand,
      foodPreference: f.foodPreference.expand,
      intentPreference: f.intent.expand,
    },
  };
};

// Network sync is debounced: sliders fire onValueChange dozens of times per
// drag. Local persistence is immediate so the UI never loses state.
let _filtersSyncTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingFilters: FiltersData | null = null;

const _flushFiltersSync = async () => {
  const data = _pendingFilters;
  _pendingFilters = null;
  if (!data) return;
  try {
    const auth = await getAuth();
    if (!auth?.user_id || !API_BASE) return;
    const res = await fetch(apiUrl('/api/user/filters'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: auth.user_id, ...buildFiltersPayload(data) }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[filters] backend rejected filters', res.status, text.slice(0, 200));
    }
  } catch (error) {
    console.warn('[filters] failed to sync filters to backend:', error);
  }
};

export const saveFilters = async (data: FiltersData, { immediate = false } = {}) => {
  await AsyncStorage.setItem(FILTERS_KEY, JSON.stringify(data));
  _pendingFilters = data;
  if (_filtersSyncTimer) clearTimeout(_filtersSyncTimer);
  if (immediate) {
    _filtersSyncTimer = null;
    await _flushFiltersSync();
    return;
  }
  _filtersSyncTimer = setTimeout(() => {
    _filtersSyncTimer = null;
    void _flushFiltersSync();
  }, 700);
};

export const getFilters = async (): Promise<FiltersData | null> => {
  try {
    const data = await AsyncStorage.getItem(FILTERS_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

// ============ SWIPES ============
export const saveSwipeState = async (data: SwipeState) => {
  await AsyncStorage.setItem(SWIPES_KEY, JSON.stringify(data));
};

export const getSwipeState = async (): Promise<SwipeState | null> => {
  try {
    const data = await AsyncStorage.getItem(SWIPES_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

// ============ LOGOUT ============
/** Clears every piece of local state for the current account. */
export const clearAll = async () => {
  await AsyncStorage.multiRemove([
    AUTH_KEY,
    PROFILE_KEY,
    ONBOARDING_KEY,
    FILTERS_KEY,
    SWIPES_KEY,
    VISIBILITY_KEY,
  ]);
  await _saveSecret(TOKEN_KEY, null);
  _tokenCache = null;
  _pendingFilters = null;
  useUserStore.getState().clearSelectedConversation();
};

/**
 * Sign out: tells the backend to revoke the session (best effort) and wipes
 * local state. Does NOT delete the account — see the dedicated
 * "Delete account" flow for that.
 */
export const logout = async () => {
  try {
    const token = await _loadToken();
    if (token && API_BASE) {
      await fetch(apiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  } finally {
    await clearAll();
  }
};

// ============ AUTHENTICATED FETCH ============
// Global fetch monkey-patch that attaches the session token to backend API
// requests and funnels 401s into a single "session expired" handler. Must be
// called ONCE at app boot (root _layout.tsx).
type UnauthorizedHandler = () => void;
let _authFetchInstalled = false;
let _onUnauthorized: UnauthorizedHandler | null = null;
let _unauthorizedFired = false;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  _onUnauthorized = handler;
  _unauthorizedFired = false;
}

export function installAuthenticatedFetch(
  apiBase: string = API_BASE,
  opts: { onUnauthorized?: UnauthorizedHandler } = {}
) {
  if (opts.onUnauthorized) setUnauthorizedHandler(opts.onUnauthorized);
  if (_authFetchInstalled) return;
  _authFetchInstalled = true;
  const originalFetch = (globalThis as any).fetch?.bind(globalThis);
  if (!originalFetch) return;

  (globalThis as any).fetch = async (input: any, init: any = {}) => {
    let url: string = '';
    try {
      url = typeof input === 'string' ? input : input?.url || '';
    } catch {
      url = '';
    }
    // Only inject for backend API calls — never for third-party or static URLs.
    const isBackend = !!apiBase && !!url && url.startsWith(apiBase);
    if (!isBackend) return originalFetch(input, init);

    let request = init;
    try {
      const token = await _loadToken();
      if (token) {
        const headers = new Headers(init?.headers || {});
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        request = { ...init, headers };
      }
    } catch {
      request = init;
    }

    const response: Response = await originalFetch(input, request);

    // Session expired / revoked → wipe local auth once and bounce to login.
    // Auth endpoints themselves are exempt (a wrong OTP is also a 401).
    const isAuthEndpoint = url.includes('/api/auth/');
    if (response.status === 401 && !isAuthEndpoint && !_unauthorizedFired) {
      _unauthorizedFired = true;
      try {
        await clearAll();
      } catch { /* ignore */ }
      try {
        _onUnauthorized?.();
      } catch { /* ignore */ }
      // Allow the handler to fire again for a future session.
      setTimeout(() => { _unauthorizedFired = false; }, 3000);
    }
    return response;
  };
}

// Convenience: read the raw token for components that need to pass it
// explicitly (e.g. expo-audio streaming headers). Returns '' if none.
export async function getSessionToken(): Promise<string> {
  return (await _loadToken()) || '';
}
