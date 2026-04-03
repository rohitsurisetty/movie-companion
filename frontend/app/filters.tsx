import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  PanResponder, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { FiltersData, initialFiltersData, FilterSection, HeightFilter, AgeFilter } from '../src/types';
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
  { key: 'ottTheatre', title: 'OTT/Theatre Preference', options: ['OTT Lover', 'Theatre Enthusiast', 'Both'] },
  { key: 'filmLanguages', title: 'Languages They Watch', options: ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Korean', 'Japanese', 'Spanish', 'French'] },
  { key: 'religion', title: 'Religion', options: ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other', 'Prefer not to say'] },
  { key: 'zodiac', title: 'Zodiac Sign', options: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'] },
  { key: 'siblings', title: 'Siblings', options: ['Only child', 'Has siblings'] },
  { key: 'education', title: 'Education', options: ['High School', "Bachelor's", "Master's", 'PhD', 'Other'] },
  { key: 'travel', title: 'Travel Frequency', options: ['Frequently', 'Occasionally', 'Rarely', 'Never'] },
  { key: 'smoking', title: 'Smoking Preference', options: ['Non-smoker', 'Occasional smoker', 'Regular smoker'] },
  { key: 'drinking', title: 'Drinking Preference', options: ['Non-drinker', 'Social drinker', 'Regular drinker'] },
  { key: 'exercise', title: 'Exercise Preference', options: ['Regularly', 'Occasionally', 'Rarely'] },
  { key: 'pets', title: 'Pets Preference', options: ['Love pets', 'Okay with pets', 'Prefer no pets'] },
  { key: 'familyPlanning', title: 'Family Planning', options: ['Want kids', "Don't want kids", 'Open to kids', 'Not sure yet'] },
  { key: 'maritalStatus', title: 'Marital Status', options: ['Single', 'Divorced', 'Separated', 'Widowed'] },
  { key: 'foodPreference', title: 'Food Preference', options: ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain'] },
  { key: 'intent', title: 'Intent Preference', options: ['Casual', 'Friendship', 'Serious relationship', 'Exploring'] },
];

// Distance Slider Component
function DistanceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackRef = useRef<View>(null);

  const getPercent = () => {
    if (value < 0) return 1;
    return Math.min(value / MAX_KM, 0.95);
  };

  const handleTouch = (locationX: number) => {
    if (trackWidth === 0) return;
    const percent = Math.max(0, Math.min(1, locationX / trackWidth));
    if (percent > 0.95) {
      onChange(-1); // Infinite
    } else {
      onChange(Math.max(1, Math.round(percent * MAX_KM)));
    }
  };

  const panResponder = useRef(
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
        ref={trackRef}
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

// Age Range Slider Component
function AgeRangeSlider({ value, onChange }: { value: AgeFilter; onChange: (v: AgeFilter) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const MIN_AGE = 18;
  const MAX_AGE = 60;
  const RANGE = MAX_AGE - MIN_AGE;

  const getMinPercent = () => ((value.min - MIN_AGE) / RANGE) * 100;
  const getMaxPercent = () => ((value.max - MIN_AGE) / RANGE) * 100;

  const handleMinTouch = (locationX: number) => {
    if (trackWidth === 0) return;
    const percent = Math.max(0, Math.min(1, locationX / trackWidth));
    const newMin = Math.round(MIN_AGE + percent * RANGE);
    if (newMin < value.max - 1) {
      onChange({ ...value, min: Math.max(MIN_AGE, newMin) });
    }
  };

  const handleMaxTouch = (locationX: number) => {
    if (trackWidth === 0) return;
    const percent = Math.max(0, Math.min(1, locationX / trackWidth));
    const newMax = Math.round(MIN_AGE + percent * RANGE);
    if (newMax > value.min + 1) {
      onChange({ ...value, max: Math.min(MAX_AGE, newMax) });
    }
  };

  const minPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        const locationX = gestureState.moveX - 40; // Approximate offset
        handleMinTouch(locationX);
      },
    })
  ).current;

  const maxPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        const locationX = gestureState.moveX - 40;
        handleMaxTouch(locationX);
      },
    })
  ).current;

  return (
    <View style={sliderStyles.container}>
      <Text style={sliderStyles.label}>{value.min} - {value.max} years</Text>
      <View
        style={sliderStyles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <View style={[sliderStyles.rangeFill, { left: `${getMinPercent()}%`, width: `${getMaxPercent() - getMinPercent()}%` }]} />
        <View style={[sliderStyles.thumb, { left: `${getMinPercent() - 3}%` }]} {...minPanResponder.panHandlers} />
        <View style={[sliderStyles.thumb, { left: `${getMaxPercent() - 3}%` }]} {...maxPanResponder.panHandlers} />
      </View>
      <View style={sliderStyles.labels}>
        <Text style={sliderStyles.minLabel}>{MIN_AGE}</Text>
        <Text style={sliderStyles.maxLabel}>{MAX_AGE}+</Text>
      </View>
    </View>
  );
}

// Height Picker Component
function HeightPicker({ value, onChange }: { value: HeightFilter; onChange: (v: HeightFilter) => void }) {
  const [unit, setUnit] = useState<'imperial' | 'metric'>(value.unit);

  const feetOptions = [4, 5, 6, 7];
  const inchOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const cmOptions = Array.from({ length: 77 }, (_, i) => 137 + i); // 137cm to 213cm

  const toggleUnit = () => {
    const newUnit = unit === 'imperial' ? 'metric' : 'imperial';
    setUnit(newUnit);
    onChange({ ...value, unit: newUnit });
  };

  const formatHeight = (feet: number, inches: number, cm: number) => {
    if (unit === 'imperial') {
      return `${feet}'${inches}"`;
    }
    return `${cm} cm`;
  };

  return (
    <View style={heightStyles.container}>
      <View style={heightStyles.unitToggle}>
        <TouchableOpacity
          style={[heightStyles.unitBtn, unit === 'imperial' && heightStyles.unitBtnActive]}
          onPress={() => { setUnit('imperial'); onChange({ ...value, unit: 'imperial' }); }}
        >
          <Text style={[heightStyles.unitText, unit === 'imperial' && heightStyles.unitTextActive]}>ft/in</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[heightStyles.unitBtn, unit === 'metric' && heightStyles.unitBtnActive]}
          onPress={() => { setUnit('metric'); onChange({ ...value, unit: 'metric' }); }}
        >
          <Text style={[heightStyles.unitText, unit === 'metric' && heightStyles.unitTextActive]}>cm</Text>
        </TouchableOpacity>
      </View>

      <View style={heightStyles.rangeRow}>
        <View style={heightStyles.rangePart}>
          <Text style={heightStyles.rangeLabel}>Min Height</Text>
          {unit === 'imperial' ? (
            <View style={heightStyles.pickerRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={heightStyles.picker}>
                {feetOptions.map((ft) => (
                  <TouchableOpacity
                    key={ft}
                    style={[heightStyles.pickerItem, value.minFeet === ft && heightStyles.pickerItemActive]}
                    onPress={() => onChange({ ...value, minFeet: ft })}
                  >
                    <Text style={[heightStyles.pickerText, value.minFeet === ft && heightStyles.pickerTextActive]}>{ft}'</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={heightStyles.picker}>
                {inchOptions.map((inch) => (
                  <TouchableOpacity
                    key={inch}
                    style={[heightStyles.pickerItem, value.minInches === inch && heightStyles.pickerItemActive]}
                    onPress={() => onChange({ ...value, minInches: inch })}
                  >
                    <Text style={[heightStyles.pickerText, value.minInches === inch && heightStyles.pickerTextActive]}>{inch}"</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={heightStyles.picker}>
              {cmOptions.map((cm) => (
                <TouchableOpacity
                  key={cm}
                  style={[heightStyles.pickerItem, value.minCm === cm && heightStyles.pickerItemActive]}
                  onPress={() => onChange({ ...value, minCm: cm })}
                >
                  <Text style={[heightStyles.pickerText, value.minCm === cm && heightStyles.pickerTextActive]}>{cm}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={heightStyles.rangePart}>
          <Text style={heightStyles.rangeLabel}>Max Height</Text>
          {unit === 'imperial' ? (
            <View style={heightStyles.pickerRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={heightStyles.picker}>
                {feetOptions.map((ft) => (
                  <TouchableOpacity
                    key={ft}
                    style={[heightStyles.pickerItem, value.maxFeet === ft && heightStyles.pickerItemActive]}
                    onPress={() => onChange({ ...value, maxFeet: ft })}
                  >
                    <Text style={[heightStyles.pickerText, value.maxFeet === ft && heightStyles.pickerTextActive]}>{ft}'</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={heightStyles.picker}>
                {inchOptions.map((inch) => (
                  <TouchableOpacity
                    key={inch}
                    style={[heightStyles.pickerItem, value.maxInches === inch && heightStyles.pickerItemActive]}
                    onPress={() => onChange({ ...value, maxInches: inch })}
                  >
                    <Text style={[heightStyles.pickerText, value.maxInches === inch && heightStyles.pickerTextActive]}>{inch}"</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={heightStyles.picker}>
              {cmOptions.map((cm) => (
                <TouchableOpacity
                  key={cm}
                  style={[heightStyles.pickerItem, value.maxCm === cm && heightStyles.pickerItemActive]}
                  onPress={() => onChange({ ...value, maxCm: cm })}
                >
                  <Text style={[heightStyles.pickerText, value.maxCm === cm && heightStyles.pickerTextActive]}>{cm}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

const heightStyles = StyleSheet.create({
  container: { marginTop: SPACING.s },
  unitToggle: { flexDirection: 'row', marginBottom: SPACING.m },
  unitBtn: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5, borderColor: COLORS.border, marginRight: SPACING.s,
  },
  unitBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  unitText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  unitTextActive: { color: COLORS.white },
  rangeRow: { gap: SPACING.m },
  rangePart: { marginBottom: SPACING.m },
  rangeLabel: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.s },
  pickerRow: { gap: SPACING.s },
  picker: { flexDirection: 'row' },
  pickerItem: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: BORDER_RADIUS.m,
    borderWidth: 1, borderColor: COLORS.border, marginRight: SPACING.s, minWidth: 48, alignItems: 'center',
  },
  pickerItemActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pickerText: { fontSize: 14, color: COLORS.textSecondary },
  pickerTextActive: { color: COLORS.white, fontWeight: '600' },
});

const sliderStyles = StyleSheet.create({
  container: { marginTop: SPACING.s },
  label: { fontSize: 15, color: COLORS.gold, fontWeight: '600', marginBottom: SPACING.m },
  track: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, position: 'relative', justifyContent: 'center' },
  fill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3, position: 'absolute', left: 0 },
  rangeFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3, position: 'absolute' },
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

        {/* Age Range */}
        <View style={fStyles.section}>
          <View style={fStyles.header}>
            <Text style={fStyles.title}>Age Range</Text>
          </View>
          <View style={fStyles.checkboxRow}>
            <TouchableOpacity
              style={fStyles.checkItem}
              onPress={() => setFilters(prev => ({
                ...prev,
                age: { ...prev.age, exclusive: !prev.age.exclusive },
              }))}
              testID="exclusive-age"
            >
              <View style={[fStyles.checkBox, filters.age.exclusive && fStyles.checkBoxChecked]}>
                {filters.age.exclusive && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={fStyles.checkLabel}>Exclusive</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fStyles.checkItem}
              onPress={() => setFilters(prev => ({
                ...prev,
                age: { ...prev.age, expandIfRunOut: !prev.age.expandIfRunOut },
              }))}
              testID="expand-age"
            >
              <View style={[fStyles.checkBox, filters.age.expandIfRunOut && fStyles.checkBoxChecked]}>
                {filters.age.expandIfRunOut && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={fStyles.checkLabel}>Expand if I run out</Text>
            </TouchableOpacity>
          </View>
          <AgeRangeSlider
            value={filters.age}
            onChange={(v) => setFilters(prev => ({ ...prev, age: v }))}
          />
        </View>

        {/* Height */}
        <View style={fStyles.section}>
          <View style={fStyles.header}>
            <Text style={fStyles.title}>Height Preference</Text>
          </View>
          <View style={fStyles.checkboxRow}>
            <TouchableOpacity
              style={fStyles.checkItem}
              onPress={() => setFilters(prev => ({
                ...prev,
                height: { ...prev.height, exclusive: !prev.height.exclusive },
              }))}
              testID="exclusive-height"
            >
              <View style={[fStyles.checkBox, filters.height.exclusive && fStyles.checkBoxChecked]}>
                {filters.height.exclusive && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={fStyles.checkLabel}>Exclusive</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fStyles.checkItem}
              onPress={() => setFilters(prev => ({
                ...prev,
                height: { ...prev.height, expandIfRunOut: !prev.height.expandIfRunOut },
              }))}
              testID="expand-height"
            >
              <View style={[fStyles.checkBox, filters.height.expandIfRunOut && fStyles.checkBoxChecked]}>
                {filters.height.expandIfRunOut && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={fStyles.checkLabel}>Expand if I run out</Text>
            </TouchableOpacity>
          </View>
          <HeightPicker
            value={filters.height}
            onChange={(v) => setFilters(prev => ({ ...prev, height: v }))}
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
