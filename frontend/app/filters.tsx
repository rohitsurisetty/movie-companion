import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  PanResponder, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { FiltersData, initialFiltersData, FilterSection } from '../src/types';
import { saveFilters } from '../src/store';

const MAX_KM = 500;

type FilterConfig = {
  key: keyof FiltersData;
  title: string;
  options: string[];
};

const FILTER_CONFIGS: FilterConfig[] = [
  { key: 'languages', title: 'Languages They Speak', options: ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu'] },
  { key: 'genres', title: 'Favourite Genres', options: ['Action', 'Romance', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi', 'Drama', 'Documentary'] },
  { key: 'smoking', title: 'Smoking Preference', options: ['Non-smoker', 'Occasional smoker', 'Regular smoker'] },
  { key: 'drinking', title: 'Drinking Preference', options: ['Non-drinker', 'Social drinker', 'Regular drinker'] },
  { key: 'exercise', title: 'Exercise Preference', options: ['Regularly', 'Occasionally', 'Rarely'] },
  { key: 'pets', title: 'Pets Preference', options: ['Love pets', 'Okay with pets', 'Prefer no pets'] },
  { key: 'familyPlanning', title: 'Family Planning', options: ['Want kids', "Don't want kids", 'Open to kids', 'Not sure yet'] },
  { key: 'maritalStatus', title: 'Marital Status', options: ['Single', 'Divorced', 'Separated', 'Widowed'] },
  { key: 'foodPreference', title: 'Food Preference', options: ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain'] },
  { key: 'intent', title: 'Intent Preference', options: ['Casual', 'Friendship', 'Serious relationship', 'Exploring'] },
];

function DistanceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = React.useState(0);

  const getPercent = () => {
    if (value < 0) return 1;
    return Math.min(value / MAX_KM, 0.95);
  };

  const handleTouch = (pageX: number) => {
    if (trackWidth === 0) return;
    // Use a simple approach - calculate relative position
    const percent = Math.max(0, Math.min(1, pageX / trackWidth));
    if (percent > 0.95) {
      onChange(-1);
    } else {
      onChange(Math.max(1, Math.round(percent * MAX_KM)));
    }
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => handleTouch(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => handleTouch(evt.nativeEvent.locationX),
    })
  ).current;

  const label = value < 0 ? 'Infinite distance' : `Within ${value} km`;

  return (
    <View style={sliderStyles.container}>
      <Text style={sliderStyles.label}>{label}</Text>
      <View
        style={sliderStyles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View style={[sliderStyles.fill, { width: `${getPercent() * 100}%` }]} />
        <View style={[sliderStyles.thumb, { left: `${Math.max(0, getPercent() * 100 - 3)}%` }]} />
      </View>
      <View style={sliderStyles.labels}>
        <Text style={sliderStyles.minLabel}>0 km</Text>
        <Text style={sliderStyles.maxLabel}>Infinite</Text>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: { marginTop: SPACING.s },
  label: { fontSize: 15, color: COLORS.gold, fontWeight: '600', marginBottom: SPACING.m },
  track: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, position: 'relative', justifyContent: 'center' },
  fill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  thumb: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, borderWidth: 3, borderColor: COLORS.white, top: -9 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.s },
  minLabel: { fontSize: 12, color: COLORS.textMuted },
  maxLabel: { fontSize: 12, color: COLORS.textMuted },
});

function FilterSectionView({
  title, section, onUpdate, options,
}: {
  title: string;
  section: FilterSection;
  onUpdate: (s: FilterSection) => void;
  options: string[];
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  const toggleChip = (opt: string) => {
    const sel = section.selected.includes(opt)
      ? section.selected.filter(s => s !== opt)
      : [...section.selected, opt];
    onUpdate({ ...section, selected: sel });
  };

  const selectAll = () => onUpdate({ ...section, selected: [...options] });
  const clearAll = () => onUpdate({ ...section, selected: [] });

  return (
    <View style={fStyles.section}>
      <View style={fStyles.header}>
        <Text style={fStyles.title}>{title}</Text>
        <View style={fStyles.headerRight}>
          <TouchableOpacity
            style={fStyles.selectAllBtn}
            onPress={section.selected.length === options.length ? clearAll : selectAll}
            testID={`filter-toggle-all-${title.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <Text style={fStyles.selectAllText}>
              {section.selected.length === options.length ? 'Clear' : 'All'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={fStyles.checkboxRow}>
        <TouchableOpacity
          style={fStyles.checkItem}
          onPress={() => onUpdate({ ...section, exclusive: !section.exclusive })}
          testID={`exclusive-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <View style={[fStyles.checkBox, section.exclusive && fStyles.checkBoxChecked]}>
            {section.exclusive && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
          </View>
          <Text style={fStyles.checkLabel}>Exclusive</Text>
          <TouchableOpacity onPress={() => setShowTooltip(!showTooltip)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </TouchableOpacity>

        <TouchableOpacity
          style={fStyles.checkItem}
          onPress={() => onUpdate({ ...section, expandIfRunOut: !section.expandIfRunOut })}
          testID={`expand-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <View style={[fStyles.checkBox, section.expandIfRunOut && fStyles.checkBoxChecked]}>
            {section.expandIfRunOut && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
          </View>
          <Text style={fStyles.checkLabel}>Expand if I run out</Text>
        </TouchableOpacity>
      </View>

      {showTooltip && (
        <View style={fStyles.tooltip}>
          <Text style={fStyles.tooltipText}>
            If enabled, you will only see profiles that exactly match the selected preferences.
          </Text>
        </View>
      )}

      <View style={fStyles.chipsContainer}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[fStyles.chip, section.selected.includes(opt) && fStyles.chipActive]}
            onPress={() => toggleChip(opt)}
            testID={`filter-chip-${opt.toLowerCase().replace(/[\s']+/g, '-')}`}
            activeOpacity={0.7}
          >
            <Text style={[fStyles.chipText, section.selected.includes(opt) && fStyles.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const fStyles = StyleSheet.create({
  section: { marginBottom: SPACING.l, paddingBottom: SPACING.l, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.s },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  headerRight: { flexDirection: 'row', gap: SPACING.s },
  selectAllBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.bgInput },
  selectAllText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', gap: SPACING.l, marginBottom: SPACING.m },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkBox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkLabel: { fontSize: 13, color: COLORS.textSecondary },
  tooltip: { backgroundColor: COLORS.bgInput, padding: SPACING.m, borderRadius: BORDER_RADIUS.m, marginBottom: SPACING.s },
  tooltipText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgCard,
    minHeight: 44, justifyContent: 'center',
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  chipTextActive: { color: COLORS.white, fontWeight: '600' },
});

export default function FiltersScreen() {
  const router = useRouter();
  const [filters, setFilters] = useState<FiltersData>(initialFiltersData);

  const updateFilter = (key: keyof FiltersData, section: FilterSection) => {
    setFilters(prev => ({ ...prev, [key]: section }));
  };

  const handleStart = async () => {
    await saveFilters(filters);
    router.replace('/swipe');
  };

  return (
    <SafeAreaView style={styles.container} testID="filters-screen">
      <View style={styles.headerBar}>
        <Ionicons name="options-outline" size={24} color={COLORS.gold} />
        <Text style={styles.headerTitle}>Preferences & Filters</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Set your preferences to find the perfect movie companions.
        </Text>

        {/* Distance */}
        <View style={fStyles.section}>
          <View style={fStyles.header}>
            <Text style={fStyles.title}>Distance Radius</Text>
          </View>
          <View style={fStyles.checkboxRow}>
            <TouchableOpacity
              style={fStyles.checkItem}
              onPress={() => setFilters(prev => ({
                ...prev,
                distance: { ...prev.distance, exclusive: !prev.distance.exclusive },
              }))}
              testID="exclusive-distance"
            >
              <View style={[fStyles.checkBox, filters.distance.exclusive && fStyles.checkBoxChecked]}>
                {filters.distance.exclusive && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={fStyles.checkLabel}>Exclusive</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fStyles.checkItem}
              onPress={() => setFilters(prev => ({
                ...prev,
                distance: { ...prev.distance, expandIfRunOut: !prev.distance.expandIfRunOut },
              }))}
              testID="expand-distance"
            >
              <View style={[fStyles.checkBox, filters.distance.expandIfRunOut && fStyles.checkBoxChecked]}>
                {filters.distance.expandIfRunOut && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={fStyles.checkLabel}>Expand if I run out</Text>
            </TouchableOpacity>
          </View>
          <DistanceSlider
            value={filters.distance.radius}
            onChange={(v) => setFilters(prev => ({ ...prev, distance: { ...prev.distance, radius: v } }))}
          />
        </View>

        {/* Other filters */}
        {FILTER_CONFIGS.map(cfg => (
          <FilterSectionView
            key={cfg.key}
            title={cfg.title}
            section={filters[cfg.key] as FilterSection}
            onUpdate={(s) => updateFilter(cfg.key, s)}
            options={cfg.options}
          />
        ))}

        <TouchableOpacity
          style={styles.startBtn}
          onPress={handleStart}
          testID="filters-start-btn"
          activeOpacity={0.8}
        >
          <Ionicons name="film-outline" size={22} color={COLORS.white} />
          <Text style={styles.startBtnText}>Let's Start</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.s,
    paddingHorizontal: SPACING.l, paddingVertical: SPACING.m,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.l, paddingBottom: SPACING.xxl },
  intro: { fontSize: 15, color: COLORS.textSecondary, marginBottom: SPACING.l, lineHeight: 22 },
  startBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.s,
    marginTop: SPACING.m,
  },
  startBtnText: { fontSize: 18, fontWeight: 'bold', color: COLORS.white, letterSpacing: 1 },
});
