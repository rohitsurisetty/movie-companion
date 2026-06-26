import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable,
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
  modeIcon: any;
  modeName: string;
}

export const getThemeColors = (mode: AppMode): ThemeColors => {
  const isDate = mode === 'date';
  return {
    primary: isDate ? '#E50914' : '#2196F3',
    bg: '#121212',
    bgCard: '#1E1E1E',
    text: '#FFFFFF',
    textSecondary: '#CCCCCC',
    textMuted: '#888888',
    border: '#333333',
    gold: '#FFD700',
    modeIcon: isDate ? 'heart' : 'people',
    modeName: isDate ? 'Movie Date' : 'Movie Buddy',
  };
};

// Mode Switcher Modal
export function ModeSwitcher({
  visible, onClose, currentMode, onModeChange, colors,
}: {
  visible: boolean;
  onClose: () => void;
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  colors: ThemeColors;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={[modalStyles.container, { backgroundColor: colors.bgCard }]} onPress={(e) => e.stopPropagation()}>
          <View style={modalStyles.handle} />
          <Text style={[modalStyles.title, { color: colors.text }]}>Switch Mode</Text>
          
          <TouchableOpacity
            style={[
              modalStyles.modeOption,
              currentMode === 'date' && { borderColor: '#E50914', backgroundColor: 'rgba(229,9,20,0.1)' }
            ]}
            onPress={() => { onModeChange('date'); onClose(); }}
          >
            <View style={[modalStyles.modeIcon, { backgroundColor: 'rgba(229,9,20,0.2)' }]}>
              <Ionicons name="heart" size={28} color="#E50914" />
            </View>
            <View style={modalStyles.modeInfo}>
              <Text style={[modalStyles.modeName, { color: colors.text }]}>Movie Date</Text>
              <Text style={[modalStyles.modeDesc, { color: colors.textSecondary }]}>Find romantic movie partners</Text>
            </View>
            {currentMode === 'date' && (
              <Ionicons name="checkmark-circle" size={24} color="#E50914" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              modalStyles.modeOption,
              currentMode === 'buddy' && { borderColor: '#2196F3', backgroundColor: 'rgba(33,150,243,0.1)' }
            ]}
            onPress={() => { onModeChange('buddy'); onClose(); }}
          >
            <View style={[modalStyles.modeIcon, { backgroundColor: 'rgba(33,150,243,0.2)' }]}>
              <Ionicons name="people" size={28} color="#2196F3" />
            </View>
            <View style={modalStyles.modeInfo}>
              <Text style={[modalStyles.modeName, { color: colors.text }]}>Movie Buddy</Text>
              <Text style={[modalStyles.modeDesc, { color: colors.textSecondary }]}>Find friends to watch with</Text>
            </View>
            {currentMode === 'buddy' && (
              <Ionicons name="checkmark-circle" size={24} color="#2196F3" />
            )}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Shared Header Component
export function SharedHeader({
  title,
  showModeIcon = true,
  onMenuPress,
  colors,
  showFiltersIcon = true,
}: {
  title?: string;
  showModeIcon?: boolean;
  onMenuPress: () => void;
  colors: ThemeColors;
  showFiltersIcon?: boolean;
}) {
  const router = useRouter();
  
  const handleFiltersPress = () => {
    router.push('/filters');
  };
  
  return (
    <View style={[headerStyles.header, { borderBottomColor: colors.border }]}>
      <TouchableOpacity
        style={headerStyles.menuBtn}
        onPress={onMenuPress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="menu" size={26} color={colors.text} />
      </TouchableOpacity>
      <View style={headerStyles.headerCenter}>
        {showModeIcon && <Ionicons name={colors.modeIcon} size={22} color={colors.primary} />}
        <Text style={[headerStyles.headerTitle, { color: colors.text }]}>{title || colors.modeName}</Text>
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

// Hook to manage mode state - Uses Zustand global store
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

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  container: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  handle: { width: 40, height: 4, backgroundColor: '#555', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modeOption: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderRadius: 16, borderWidth: 2, borderColor: '#333', marginBottom: 12,
  },
  modeIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  modeInfo: { flex: 1 },
  modeName: { fontSize: 18, fontWeight: '600', marginBottom: 2 },
  modeDesc: { fontSize: 13 },
});

const headerStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
