import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, AppMode, getAuth } from '../store';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || '';

export type { AppMode };

export interface ThemeColors {
  primary: string;
  bg: string;
  bgCard: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  gold: string;
  // Kept for backwards compatibility – callers that still reference these
  // will receive sensible defaults but they are no longer rendered in the UI.
  modeIcon: any;
  modeName: string;
}

// Single unified theme (the previous "Movie Date" red theme is the new default).
export const getThemeColors = (_mode?: AppMode): ThemeColors => {
  return {
    primary: '#E50914',
    bg: '#121212',
    bgCard: '#1E1E1E',
    text: '#FFFFFF',
    textSecondary: '#CCCCCC',
    textMuted: '#888888',
    border: '#333333',
    gold: '#FFD700',
    modeIcon: 'film-outline',
    modeName: 'filmydating',
  };
};

// Shared Header Component – mode switcher removed.
// Menu button is hidden by default (kept as a no-op placeholder so existing
// callers compile). showModeIcon is intentionally ignored.
export function SharedHeader({
  title,
  onMenuPress, // legacy prop, ignored
  colors,
  showFiltersIcon = true,
}: {
  title?: string;
  showModeIcon?: boolean;
  onMenuPress?: () => void;
  colors: ThemeColors;
  showFiltersIcon?: boolean;
}) {
  const router = useRouter();

  const handleFiltersPress = () => {
    router.push('/filters');
  };

  return (
    <View style={[headerStyles.header, { borderBottomColor: colors.border }]}>
      {/* Brand mark on the left – uses the filmydating logo artwork */}
      <View style={headerStyles.brandMark}>
        <Image
          source={require('../../assets/images/icon.png')}
          style={headerStyles.brandLogoImg}
          resizeMode="contain"
          accessibilityLabel="filmydating logo"
        />
      </View>
      <View style={headerStyles.headerCenter}>
        <Text style={[headerStyles.headerTitle, { color: colors.text }]}>
          {title || colors.modeName}
        </Text>
      </View>
      {showFiltersIcon ? (
        <TouchableOpacity
          style={headerStyles.filtersBtn}
          onPress={handleFiltersPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="options-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <View style={headerStyles.placeholder} />
      )}
    </View>
  );
}

// ModeSwitcher kept as a no-op component so legacy imports keep compiling.
// It renders nothing.
export function ModeSwitcher(_props: {
  visible: boolean;
  onClose: () => void;
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  colors: ThemeColors;
}) {
  return null;
}

// Hook kept for backwards compatibility. Mode is always 'date' now.
export function useAppMode() {
  const mode = useAppStore((state) => state.mode);
  const setModeGlobal = useAppStore((state) => state.setMode);
  const [showModeDrawer, setShowModeDrawer] = React.useState(false);

  const colors = getThemeColors(mode);

  const setMode = (newMode: AppMode) => {
    setModeGlobal(newMode);
  };

  return {
    mode,
    setMode,
    colors,
    showModeDrawer,
    setShowModeDrawer,
  };
}

const headerStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  brandMark: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Brand logo image inside the header brandMark slot
  brandLogoImg: {
    width: 32,
    height: 32,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
  filtersBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
