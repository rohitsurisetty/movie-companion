import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiUrl, getProfile, getUserId, saveProfile } from '../src/store';

type VisibilitySettings = {
  showAge: boolean;
  showLocation: boolean;
  showHeight: boolean;
  showReligion: boolean;
  showZodiac: boolean;
  showMoviePreferences: boolean;
  showTopMovies: boolean;
  showLifestyle: boolean;
  profileActive: boolean;
  showOnlineStatus: boolean;
};

const defaultSettings: VisibilitySettings = {
  showAge: true,
  showLocation: true,
  showHeight: true,
  showReligion: true,
  showZodiac: true,
  showMoviePreferences: true,
  showTopMovies: true,
  showLifestyle: true,
  profileActive: true,
  showOnlineStatus: true,
};

// Legacy key — still written for backward compatibility (profile-preview reads it).
const VISIBILITY_KEY = 'visibility_settings';

type SettingKey = keyof VisibilitySettings;

// Each switch controls these profile.visibilityToggles keys (false = hidden),
// which is what the server enforces in its public profile view.
const SETTING_FIELDS: Partial<Record<SettingKey, string[]>> = {
  showAge: ['age'],
  showLocation: ['location'],
  showHeight: ['height'],
  showReligion: ['religion'],
  showZodiac: ['zodiac'],
  showMoviePreferences: ['genres', 'movieFrequency'],
  showTopMovies: ['topMovies'],
  showLifestyle: ['smoking', 'drinking', 'exercise'],
};
// Account-level switches, stored under the same key names in visibilityToggles.
const ACCOUNT_KEYS: SettingKey[] = ['profileActive', 'showOnlineStatus'];

const str = (v: any) => (typeof v === 'string' ? v : '');
const strList = (v: any): string[] =>
  Array.isArray(v) ? v.filter((x: any) => typeof x === 'string') : typeof v === 'string' && v ? [v] : [];

// POST /api/user/profile overwrites every profile field, so always send the
// whole (sanitised) local profile — never a partial body.
const buildProfilePayload = (userId: string, p: any) => ({
  user_id: userId,
  name: str(p.name),
  age: Number(p.age) || 0,
  gender: str(p.gender),
  location: str(p.location),
  ...(p.dobDay && p.dobMonth && p.dobYear
    ? { dobDay: String(p.dobDay), dobMonth: String(p.dobMonth), dobYear: String(p.dobYear) }
    : {}),
  ...(typeof p.dob === 'string' && p.dob ? { dob: p.dob } : {}),
  ...(typeof p.locationFull === 'string' && p.locationFull ? { locationFull: p.locationFull } : {}),
  ...(typeof p.coordinates?.lat === 'number' && typeof p.coordinates?.lng === 'number'
    ? { coordinates: { lat: p.coordinates.lat, lng: p.coordinates.lng } }
    : {}),
  partnerPreference: str(p.partnerPreference),
  relationshipIntent: strList(p.relationshipIntent),
  genres: strList(p.genres),
  filmLanguages: strList(p.filmLanguages),
  languagesSpoken: strList(p.languagesSpoken),
  topMovies: (Array.isArray(p.topMovies) ? p.topMovies : [])
    .filter((m: any) => m && typeof m === 'object' && typeof m.id === 'number' && m.title)
    .map((m: any) => ({
      id: m.id,
      title: String(m.title),
      poster_path: str(m.poster_path),
      release_date: str(m.release_date),
      vote_average: Number(m.vote_average) || 0,
      rating: Number(m.rating) || 0,
      genres: strList(m.genres),
      reasons: strList(m.reasons),
    })),
  movieFrequency: str(p.movieFrequency),
  ottTheatre: str(p.ottTheatre),
  height: str(p.height),
  religion: str(p.religion),
  maritalStatus: str(p.maritalStatus),
  foodPreference: str(p.foodPreference),
  bio: str(p.bio),
  smoking: str(p.smoking),
  drinking: str(p.drinking),
  exercise: str(p.exercise),
  zodiac: str(p.zodiac),
  pets: str(p.pets),
  familyPlanning: str(p.familyPlanning),
  siblings: str(p.siblings),
  education: str(p.education),
  workProfile: str(p.workProfile),
  travel: str(p.travel),
  movieBuddyMode: !!p.movieBuddyMode,
  movieDateMode: !!p.movieDateMode,
  visibilityToggles: p.visibilityToggles || {},
});

const SettingRow = ({
  icon,
  title,
  description,
  value,
  onValueChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  value: boolean;
  onValueChange: () => void;
}) => (
  <View style={styles.settingRow}>
    <View style={styles.settingIcon}>
      <Ionicons name={icon} size={22} color={COLORS.primary} />
    </View>
    <View style={styles.settingInfo}>
      <Text style={styles.settingTitle}>{title}</Text>
      <Text style={styles.settingDesc}>{description}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: '#333', true: 'rgba(229,9,20,0.5)' }}
      thumbColor={value ? COLORS.primary : '#888'}
    />
  </View>
);

export default function VisibilityScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [settings, setSettings] = useState<VisibilitySettings>(defaultSettings);
  // Snapshot of what is currently persisted — unsaved changes = diff against it.
  const [loaded, setLoaded] = useState<VisibilitySettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const hasChanges = (Object.keys(defaultSettings) as SettingKey[]).some(k => settings[k] !== loaded[k]);
  const dirtyRef = useRef(false);
  dirtyRef.current = hasChanges;

  useEffect(() => {
    loadSettings();
  }, []);

  // Confirm before discarding unsaved changes (header back, Android back, gestures).
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      Alert.alert('Discard changes?', 'Your visibility changes have not been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            dirtyRef.current = false;
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
    return unsubscribe;
  }, [navigation]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const loadSettings = async () => {
    try {
      const [saved, profile] = await Promise.all([AsyncStorage.getItem(VISIBILITY_KEY), getProfile()]);
      const next: VisibilitySettings = { ...defaultSettings, ...(saved ? JSON.parse(saved) : {}) };
      // The profile's per-field toggles are the source of truth (server-enforced).
      // A switch shows ON if any of its fields is still visible.
      const toggles = profile?.visibilityToggles;
      if (toggles && typeof toggles === 'object') {
        (Object.keys(SETTING_FIELDS) as SettingKey[]).forEach(key => {
          next[key] = (SETTING_FIELDS[key] || []).some(f => toggles[f] !== false);
        });
        ACCOUNT_KEYS.forEach(key => {
          if (typeof toggles[key] === 'boolean') next[key] = toggles[key];
        });
      }
      setSettings(next);
      setLoaded(next);
    } catch (e) {
      console.error('Failed to load visibility settings:', e);
    }
  };

  const saveSettings = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const userId = await getUserId();
      if (!userId) {
        dirtyRef.current = false;
        router.replace('/');
        return;
      }
      await AsyncStorage.setItem(VISIBILITY_KEY, JSON.stringify(settings));

      // Only overwrite the fields of switches the user actually changed, so
      // fine-grained per-field toggles set on the Profile screen survive.
      const profile = (await getProfile()) || {};
      const visibilityToggles: Record<string, boolean> = { ...(profile.visibilityToggles || {}) };
      (Object.keys(SETTING_FIELDS) as SettingKey[]).forEach(key => {
        if (settings[key] === loaded[key]) return;
        (SETTING_FIELDS[key] || []).forEach(f => { visibilityToggles[f] = settings[key]; });
      });
      ACCOUNT_KEYS.forEach(key => { visibilityToggles[key] = settings[key]; });
      const updatedProfile = { ...profile, visibilityToggles };
      await saveProfile(updatedProfile);

      // POST /api/user/profile overwrites every field: never send it from an
      // empty local copy (fresh install before the profile has loaded) or it
      // would blank the real profile on the server.
      if (!profile?.name) throw new Error('local profile not loaded');

      const res = await fetch(apiUrl('/api/user/profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildProfilePayload(userId, updatedProfile)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setLoaded(settings);
      dirtyRef.current = false;
      goBack();
    } catch (e) {
      console.error('Failed to save visibility settings:', e);
      Alert.alert(
        'Could not save',
        'Your changes are saved on this device but could not be sent to the server, so other people may still see the old details. Check your connection and tap Save again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleSetting = (key: SettingKey) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const row = (key: SettingKey) => ({
    value: settings[key],
    onValueChange: () => toggleSetting(key),
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile Visibility</Text>
        <TouchableOpacity
          onPress={saveSettings}
          style={[styles.saveBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
          disabled={!hasChanges || saving}
        >
          <Text style={[styles.saveBtnText, (!hasChanges || saving) && styles.saveBtnTextDisabled]}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Profile Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Status</Text>
          <View style={styles.card}>
            <SettingRow
              icon="eye-outline"
              title="Profile Active"
              description="Your profile is visible to potential matches"
              {...row('profileActive')}
            />
            <SettingRow
              icon="radio-button-on-outline"
              title="Show Online Status"
              description="Let others see when you're online"
              {...row('showOnlineStatus')}
            />
          </View>
        </View>

        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          <View style={styles.card}>
            <SettingRow
              icon="calendar-outline"
              title="Show Age"
              description="Display your age on your profile"
              {...row('showAge')}
            />
            <SettingRow
              icon="location-outline"
              title="Show Location"
              description="Show your general location"
              {...row('showLocation')}
            />
            <SettingRow
              icon="resize-outline"
              title="Show Height"
              description="Display your height"
              {...row('showHeight')}
            />
          </View>
        </View>

        {/* Personal Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          <View style={styles.card}>
            <SettingRow
              icon="heart-outline"
              title="Show Religion"
              description="Display your religious beliefs"
              {...row('showReligion')}
            />
            <SettingRow
              icon="star-outline"
              title="Show Zodiac Sign"
              description="Display your zodiac sign"
              {...row('showZodiac')}
            />
            <SettingRow
              icon="fitness-outline"
              title="Show Lifestyle"
              description="Show smoking, drinking, exercise habits"
              {...row('showLifestyle')}
            />
          </View>
        </View>

        {/* Movie Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Movie Preferences</Text>
          <View style={styles.card}>
            <SettingRow
              icon="film-outline"
              title="Show Movie Preferences"
              description="Display genres and watch frequency"
              {...row('showMoviePreferences')}
            />
            <SettingRow
              icon="videocam-outline"
              title="Show Favorite Movies"
              description="Display your top 3 favorite movies"
              {...row('showTopMovies')}
            />
          </View>
        </View>

        {/* Info Note */}
        <View style={styles.infoNote}>
          <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.success} />
          <Text style={styles.infoText}>
            Your privacy matters. Control exactly what potential matches can see about you.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  saveBtn: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.m,
  },
  saveBtnDisabled: { backgroundColor: '#333' },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: 'white' },
  saveBtnTextDisabled: { color: '#666' },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.m, paddingBottom: 100 },
  section: { marginBottom: SPACING.l },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: SPACING.s,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(229,9,20,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.m,
  },
  settingInfo: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '500', color: COLORS.text },
  settingDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(76,175,80,0.1)',
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    gap: SPACING.s,
  },
  infoText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
});