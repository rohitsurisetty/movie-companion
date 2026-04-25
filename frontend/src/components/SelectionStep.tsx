import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  options: string[];
  selected: string | string[];
  onSelect: (value: any) => void;
  multiSelect: boolean;
  displayAs: 'chips' | 'tiles' | 'list' | 'language-tiles';
  showOthersInput?: boolean;
  othersValue?: string;
  onOthersChange?: (value: string) => void;
  // Optional "Show on my profile" toggle
  showVisibilityToggle?: boolean;
  visibilityValue?: boolean;
  onVisibilityChange?: (value: boolean) => void;
};

// Language code mappings for tiles
const LANGUAGE_LETTERS: Record<string, string> = {
  'Hindi': 'हि',
  'English': 'En',
  'Telugu': 'తె',
  'Tamil': 'த',
  'Malayalam': 'മ',
  'Kannada': 'ಕ',
  'Korean': '한',
  'Japanese': '日',
  'Spanish': 'Es',
  'French': 'Fr',
  'German': 'De',
  'Chinese': '中',
  'Others': '...',
};

export default function SelectionStep({ 
  title, subtitle, options, selected, onSelect, multiSelect, displayAs,
  showOthersInput, othersValue, onOthersChange,
  showVisibilityToggle, visibilityValue, onVisibilityChange
}: Props) {
  const [customLanguage, setCustomLanguage] = useState(othersValue || '');

  const isSelected = (opt: string) => {
    if (multiSelect) return (selected as string[]).includes(opt);
    return selected === opt;
  };

  const toggle = (opt: string) => {
    if (multiSelect) {
      const arr = selected as string[];
      onSelect(arr.includes(opt) ? arr.filter(o => o !== opt) : [...arr, opt]);
    } else {
      onSelect(opt);
    }
  };

  const handleCustomLanguageChange = (text: string) => {
    setCustomLanguage(text);
    if (onOthersChange) onOthersChange(text);
  };

  const renderChips = () => (
    <View style={styles.chipsContainer}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          style={[styles.chip, isSelected(opt) && styles.chipActive]}
          onPress={() => toggle(opt)}
          testID={`chip-${opt.toLowerCase().replace(/\s+/g, '-')}`}
          activeOpacity={0.7}
        >
          <Text style={[styles.chipText, isSelected(opt) && styles.chipTextActive]}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const TILE_ICONS: Record<string, string> = {
    'Hindi': 'film-outline', 'English': 'globe-outline', 'Telugu': 'musical-notes-outline',
    'Tamil': 'musical-note-outline', 'Malayalam': 'leaf-outline', 'Kannada': 'flower-outline',
    'Korean': 'star-outline', 'Others': 'ellipsis-horizontal-outline',
  };

  const renderTiles = () => (
    <View style={styles.tilesContainer}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          style={[styles.tile, isSelected(opt) && styles.tileActive]}
          onPress={() => toggle(opt)}
          testID={`tile-${opt.toLowerCase().replace(/\s+/g, '-')}`}
          activeOpacity={0.7}
        >
          <Ionicons
            name={(TILE_ICONS[opt] || 'film-outline') as any}
            size={28}
            color={isSelected(opt) ? COLORS.gold : COLORS.textSecondary}
          />
          <Text style={[styles.tileText, isSelected(opt) && styles.tileTextActive]}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // New language tiles with letter symbols
  const renderLanguageTiles = () => {
    const othersSelected = isSelected('Others');
    
    return (
      <>
        <View style={styles.languageTilesContainer}>
          {options.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.languageTile, isSelected(opt) && styles.languageTileActive]}
              onPress={() => toggle(opt)}
              testID={`lang-tile-${opt.toLowerCase().replace(/\s+/g, '-')}`}
              activeOpacity={0.7}
            >
              <View style={[styles.letterCircle, isSelected(opt) && styles.letterCircleActive]}>
                <Text style={[styles.letterText, isSelected(opt) && styles.letterTextActive]}>
                  {LANGUAGE_LETTERS[opt] || opt.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.languageName, isSelected(opt) && styles.languageNameActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* Others input field */}
        {othersSelected && showOthersInput && (
          <View style={styles.othersInputContainer}>
            <Text style={styles.othersLabel}>Enter other language(s):</Text>
            <TextInput
              style={styles.othersInput}
              placeholder="e.g., Portuguese, Italian"
              placeholderTextColor={COLORS.textMuted}
              value={customLanguage}
              onChangeText={handleCustomLanguageChange}
              testID="others-language-input"
            />
          </View>
        )}
      </>
    );
  };

  const renderList = () => (
    <View style={styles.listContainer}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          style={[styles.listItem, isSelected(opt) && styles.listItemActive]}
          onPress={() => toggle(opt)}
          testID={`list-${opt.toLowerCase().replace(/\s+/g, '-')}`}
          activeOpacity={0.7}
        >
          <Text style={[styles.listText, isSelected(opt) && styles.listTextActive]}>{opt}</Text>
          {isSelected(opt) && <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />}
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {displayAs === 'chips' && renderChips()}
      {displayAs === 'tiles' && renderTiles()}
      {displayAs === 'language-tiles' && renderLanguageTiles()}
      {displayAs === 'list' && renderList()}
      
      {/* Optional "Show on my profile" toggle */}
      {showVisibilityToggle && (
        <View style={styles.visibilityToggleContainer}>
          <View style={styles.visibilityToggleRow}>
            <View style={styles.visibilityToggleInfo}>
              <Text style={styles.visibilityToggleLabel}>Show on my profile</Text>
              <Text style={styles.visibilityToggleHint}>Others can see this preference (Optional)</Text>
            </View>
            <Switch
              value={visibilityValue ?? true}
              onValueChange={onVisibilityChange}
              trackColor={{ false: COLORS.border, true: COLORS.primaryDark }}
              thumbColor={visibilityValue ? COLORS.primary : COLORS.textMuted}
              testID="visibility-toggle"
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xl },
  title: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.s },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, marginBottom: SPACING.l },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  chip: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgCard,
    minHeight: 48,
    justifyContent: 'center',
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  chipText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '500' },
  chipTextActive: { color: COLORS.white, fontWeight: '600' },
  tilesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.m },
  tile: {
    width: '47%', aspectRatio: 1.4, borderRadius: BORDER_RADIUS.l,
    backgroundColor: COLORS.bgCard, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center', gap: SPACING.s,
    minHeight: 48,
  },
  tileActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(255,215,0,0.08)' },
  tileText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  tileTextActive: { color: COLORS.gold },
  // Language tiles styles
  languageTilesContainer: { 
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.m,
    justifyContent: 'flex-start',
  },
  languageTile: {
    width: '30%', aspectRatio: 0.85, borderRadius: BORDER_RADIUS.l,
    backgroundColor: COLORS.bgCard, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.m,
  },
  languageTileActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(255,215,0,0.08)' },
  letterCircle: {
    width: 48, height: 48, borderRadius: 24, 
    backgroundColor: COLORS.bgInput, alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.s,
  },
  letterCircleActive: { backgroundColor: COLORS.gold },
  letterText: { fontSize: 18, fontWeight: 'bold', color: COLORS.textSecondary },
  letterTextActive: { color: COLORS.black },
  languageName: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600', textAlign: 'center' },
  languageNameActive: { color: COLORS.gold },
  // Others input
  othersInputContainer: {
    marginTop: SPACING.l, padding: SPACING.m, backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.m, borderWidth: 1, borderColor: COLORS.border,
  },
  othersLabel: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.s },
  othersInput: {
    backgroundColor: COLORS.bgInput, borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m, paddingVertical: 12, color: COLORS.text, fontSize: 15,
  },
  listContainer: { gap: SPACING.s },
  listItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.m, paddingVertical: 16, borderRadius: BORDER_RADIUS.l,
    backgroundColor: COLORS.bgCard, borderWidth: 1.5, borderColor: COLORS.border,
    minHeight: 56,
  },
  listItemActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(229,9,20,0.08)' },
  listText: { fontSize: 16, color: COLORS.textSecondary, fontWeight: '500' },
  listTextActive: { color: COLORS.text, fontWeight: '600' },
  // Visibility toggle styles
  visibilityToggleContainer: {
    marginTop: SPACING.xl,
    padding: SPACING.m,
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  visibilityToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visibilityToggleInfo: {
    flex: 1,
    marginRight: SPACING.m,
  },
  visibilityToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  visibilityToggleHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
