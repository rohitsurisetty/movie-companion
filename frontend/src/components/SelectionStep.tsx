import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  options: string[];
  selected: string | string[];
  onSelect: (value: any) => void;
  multiSelect: boolean;
  displayAs: 'chips' | 'tiles' | 'list';
};

export default function SelectionStep({ title, subtitle, options, selected, onSelect, multiSelect, displayAs }: Props) {
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
      {displayAs === 'list' && renderList()}
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
});
