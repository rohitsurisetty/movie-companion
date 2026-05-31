import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SharedHeader, ModeSwitcher, useAppMode } from '../../src/components/SharedHeader';

const COLORS = {
  primary: '#E50914',
  bg: '#121212',
  bgCard: '#1E1E1E',
  text: '#FFFFFF',
  textSecondary: '#CCCCCC',
  textMuted: '#888888',
};

export default function FeedScreen() {
  const { mode, setMode, colors, showModeDrawer, setShowModeDrawer } = useAppMode();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        {/* Shared Header with Mode Switcher */}
        <SharedHeader
          title="Match Feed"
          showModeIcon={true}
          onMenuPress={() => setShowModeDrawer(true)}
          colors={colors}
        />

        {/* Coming Soon Content */}
        <View style={styles.comingSoonContainer}>
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={[COLORS.primary, '#FF6B6B']}
              style={styles.iconGradient}
            >
              <Ionicons name="heart" size={60} color="#FFF" />
            </LinearGradient>
          </View>
          
          <Text style={styles.comingSoonTitle}>Match Feed</Text>
          <Text style={styles.comingSoonSubtitle}>Coming Soon</Text>
          
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Ionicons name="sparkles" size={20} color={COLORS.primary} />
              <Text style={styles.featureText}>AI-powered matches based on movie taste</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="people" size={20} color={COLORS.primary} />
              <Text style={styles.featureText}>Find your perfect movie companion</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="film" size={20} color={COLORS.primary} />
              <Text style={styles.featureText}>Connect over shared cinema passion</Text>
            </View>
          </View>

          <Text style={styles.hint}>
            Meanwhile, explore the Library and Discover tabs to build your movie profile!
          </Text>
        </View>
      </View>

      {/* Mode Switcher Modal */}
      <ModeSwitcher
        visible={showModeDrawer}
        onClose={() => setShowModeDrawer(false)}
        currentMode={mode}
        onModeChange={setMode}
        colors={colors}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
    textAlign: 'center',
  },
  comingSoonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    marginBottom: 24,
  },
  iconGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoonTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  comingSoonSubtitle: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: '600',
    marginBottom: 32,
  },
  featuresList: {
    width: '100%',
    gap: 16,
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.bgCard,
    padding: 16,
    borderRadius: 12,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
