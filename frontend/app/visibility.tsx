import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

const VISIBILITY_KEY = 'visibility_settings';

export default function VisibilityScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<VisibilitySettings>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem(VISIBILITY_KEY);
      if (saved) setSettings(JSON.parse(saved));
    } catch (e) {
      console.error('Failed to load visibility settings:', e);
    }
  };

  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem(VISIBILITY_KEY, JSON.stringify(settings));
      setHasChanges(false);
      router.back();
    } catch (e) {
      console.error('Failed to save visibility settings:', e);
    }
  };

  const toggleSetting = (key: keyof VisibilitySettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    setHasChanges(true);
  };

  const SettingRow = ({ 
    icon, 
    title, 
    description, 
    settingKey 
  }: { 
    icon: keyof typeof Ionicons.glyphMap; 
    title: string; 
    description: string; 
    settingKey: keyof VisibilitySettings;
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
        value={settings[settingKey]}
        onValueChange={() => toggleSetting(settingKey)}
        trackColor={{ false: '#333', true: 'rgba(229,9,20,0.5)' }}
        thumbColor={settings[settingKey] ? COLORS.primary : '#888'}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile Visibility</Text>
        <TouchableOpacity 
          onPress={saveSettings} 
          style={[styles.saveBtn, !hasChanges && styles.saveBtnDisabled]}
          disabled={!hasChanges}
        >
          <Text style={[styles.saveBtnText, !hasChanges && styles.saveBtnTextDisabled]}>Save</Text>
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
              settingKey="profileActive"
            />
            <SettingRow
              icon="radio-button-on-outline"
              title="Show Online Status"
              description="Let others see when you're online"
              settingKey="showOnlineStatus"
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
              settingKey="showAge"
            />
            <SettingRow
              icon="location-outline"
              title="Show Location"
              description="Show your general location"
              settingKey="showLocation"
            />
            <SettingRow
              icon="resize-outline"
              title="Show Height"
              description="Display your height"
              settingKey="showHeight"
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
              settingKey="showReligion"
            />
            <SettingRow
              icon="star-outline"
              title="Show Zodiac Sign"
              description="Display your zodiac sign"
              settingKey="showZodiac"
            />
            <SettingRow
              icon="fitness-outline"
              title="Show Lifestyle"
              description="Show smoking, drinking, exercise habits"
              settingKey="showLifestyle"
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
              settingKey="showMoviePreferences"
            />
            <SettingRow
              icon="videocam-outline"
              title="Show Favorite Movies"
              description="Display your top 3 favorite movies"
              settingKey="showTopMovies"
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
  container: { flex: 1, backgroundColor: COLORS.bgDark },
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