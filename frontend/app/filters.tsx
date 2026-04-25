import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { FiltersData, initialFiltersData, FilterSection, HeightFilter, AgeFilter } from '../src/types';
import { saveFilters } from '../src/store';

const MAX_KM = 500;
const ITEM_WIDTH = 70;

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

// Distance values for horizontal picker
const DISTANCE_VALUES = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500, -1];

// Age values
const AGE_VALUES = Array.from({ length: 43 }, (_, i) => 18 + i); // 18-60

// Horizontal Scrollable Distance Picker
function HorizontalDistancePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const selectedIndex = DISTANCE_VALUES.indexOf(value >= 0 ? value : -1);

  useEffect(() => {
    if (containerWidth > 0 && selectedIndex >= 0) {
      const offset = selectedIndex * ITEM_WIDTH - (containerWidth / 2) + (ITEM_WIDTH / 2);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: Math.max(0, offset), animated: false });
      }, 100);
    }
  }, [containerWidth]);

  const handleScroll = (event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    const centerOffset = containerWidth / 2;
    const index = Math.round((x + centerOffset - ITEM_WIDTH / 2) / ITEM_WIDTH);
    const clampedIndex = Math.max(0, Math.min(DISTANCE_VALUES.length - 1, index));
    if (DISTANCE_VALUES[clampedIndex] !== value) {
      onChange(DISTANCE_VALUES[clampedIndex]);
    }
  };

  const getLabel = (val: number) => val < 0 ? '∞' : `${val}`;
  const displayLabel = value < 0 ? 'Infinite distance' : `${value} km`;

  return (
    <View style={hStyles.container}>
      <Text style={hStyles.valueLabel}>Upto: {displayLabel}</Text>
      <View 
        style={hStyles.scrollContainer}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        <View style={hStyles.centerIndicator} />
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScroll}
          contentContainerStyle={{ paddingHorizontal: containerWidth / 2 - ITEM_WIDTH / 2 }}
        >
          {DISTANCE_VALUES.map((d, i) => {
            const isSelected = d === value || (d === -1 && value < 0);
            return (
              <TouchableOpacity 
                key={i} 
                style={hStyles.item}
                onPress={() => {
                  onChange(d);
                  const offset = i * ITEM_WIDTH - (containerWidth / 2) + (ITEM_WIDTH / 2);
                  scrollRef.current?.scrollTo({ x: Math.max(0, offset), animated: true });
                }}
              >
                <Text style={[hStyles.itemText, isSelected && hStyles.itemTextActive]}>
                  {getLabel(d)}
                </Text>
                {d !== -1 && <Text style={[hStyles.unitText, isSelected && hStyles.unitTextActive]}>km</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// Horizontal Scrollable Age Range Picker
function HorizontalAgeRangePicker({ value, onChange }: { value: AgeFilter; onChange: (v: AgeFilter) => void }) {
  const minScrollRef = useRef<ScrollView>(null);
  const maxScrollRef = useRef<ScrollView>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const minIndex = value.min - 18;
  const maxIndex = value.max - 18;

  useEffect(() => {
    if (containerWidth > 0) {
      const minOffset = minIndex * ITEM_WIDTH - (containerWidth / 2) + (ITEM_WIDTH / 2);
      const maxOffset = maxIndex * ITEM_WIDTH - (containerWidth / 2) + (ITEM_WIDTH / 2);
      setTimeout(() => {
        minScrollRef.current?.scrollTo({ x: Math.max(0, minOffset), animated: false });
        maxScrollRef.current?.scrollTo({ x: Math.max(0, maxOffset), animated: false });
      }, 100);
    }
  }, [containerWidth]);

  const handleMinScroll = (event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    const centerOffset = containerWidth / 2;
    const index = Math.round((x + centerOffset - ITEM_WIDTH / 2) / ITEM_WIDTH);
    const clampedIndex = Math.max(0, Math.min(AGE_VALUES.length - 1, index));
    const newMin = AGE_VALUES[clampedIndex];
    if (newMin !== value.min && newMin < value.max) {
      onChange({ ...value, min: newMin });
    }
  };

  const handleMaxScroll = (event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    const centerOffset = containerWidth / 2;
    const index = Math.round((x + centerOffset - ITEM_WIDTH / 2) / ITEM_WIDTH);
    const clampedIndex = Math.max(0, Math.min(AGE_VALUES.length - 1, index));
    const newMax = AGE_VALUES[clampedIndex];
    if (newMax !== value.max && newMax > value.min) {
      onChange({ ...value, max: newMax });
    }
  };

  return (
    <View style={hStyles.container}>
      <Text style={hStyles.valueLabel}>{value.min} - {value.max} years</Text>
      
      {/* Min Age */}
      <Text style={hStyles.rangeLabel}>Min Age</Text>
      <View 
        style={hStyles.scrollContainer}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        <View style={hStyles.centerIndicator} />
        <ScrollView
          ref={minScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH}
          decelerationRate="fast"
          onMomentumScrollEnd={handleMinScroll}
          contentContainerStyle={{ paddingHorizontal: containerWidth / 2 - ITEM_WIDTH / 2 }}
        >
          {AGE_VALUES.map((age, i) => {
            const isSelected = age === value.min;
            return (
              <TouchableOpacity 
                key={i} 
                style={hStyles.item}
                onPress={() => {
                  if (age < value.max) {
                    onChange({ ...value, min: age });
                    const offset = i * ITEM_WIDTH - (containerWidth / 2) + (ITEM_WIDTH / 2);
                    minScrollRef.current?.scrollTo({ x: Math.max(0, offset), animated: true });
                  }
                }}
              >
                <Text style={[hStyles.itemText, isSelected && hStyles.itemTextActive]}>{age}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Max Age */}
      <Text style={[hStyles.rangeLabel, { marginTop: SPACING.m }]}>Max Age</Text>
      <View style={hStyles.scrollContainer}>
        <View style={hStyles.centerIndicator} />
        <ScrollView
          ref={maxScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH}
          decelerationRate="fast"
          onMomentumScrollEnd={handleMaxScroll}
          contentContainerStyle={{ paddingHorizontal: containerWidth / 2 - ITEM_WIDTH / 2 }}
        >
          {AGE_VALUES.map((age, i) => {
            const isSelected = age === value.max;
            return (
              <TouchableOpacity 
                key={i} 
                style={hStyles.item}
                onPress={() => {
                  if (age > value.min) {
                    onChange({ ...value, max: age });
                    const offset = i * ITEM_WIDTH - (containerWidth / 2) + (ITEM_WIDTH / 2);
                    maxScrollRef.current?.scrollTo({ x: Math.max(0, offset), animated: true });
                  }
                }}
              >
                <Text style={[hStyles.itemText, isSelected && hStyles.itemTextActive]}>{age}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// Horizontal Picker Styles
const hStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    marginTop: SPACING.s,
  },
  valueLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gold,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  rangeLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
    fontWeight: '600',
  },
  scrollContainer: {
    height: 60,
    position: 'relative',
  },
  centerIndicator: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -35,
    width: 70,
    height: 44,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.m,
    opacity: 0.2,
    zIndex: 0,
  },
  item: {
    width: ITEM_WIDTH,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 20,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  itemTextActive: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 24,
  },
  unitText: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: -2,
  },
  unitTextActive: {
    color: COLORS.text,
  },
});

// Height Picker Component (Old style with feet/inches selection)
function HeightPicker({ value, onChange }: { value: HeightFilter; onChange: (v: HeightFilter) => void }) {
  const [isMetric, setIsMetric] = useState(value.unit === 'metric');
  const FEET = [3, 4, 5, 6, 7];
  const INCHES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const CM_MIN = 120;
  const CM_MAX = 220;

  const toggleUnit = () => {
    const newIsMetric = !isMetric;
    setIsMetric(newIsMetric);
    onChange({ ...value, unit: newIsMetric ? 'metric' : 'imperial' });
  };

  const updateHeight = (field: string, val: number) => {
    onChange({ ...value, [field]: val });
  };

  const minDisplay = isMetric ? `${value.minCm} cm` : `${value.minFeet}'${value.minInches}"`;
  const maxDisplay = isMetric ? `${value.maxCm} cm` : `${value.maxFeet}'${value.maxInches}"`;

  return (
    <View style={heightStyles.container}>
      {/* Unit Toggle */}
      <View style={heightStyles.toggleRow}>
        <TouchableOpacity
          style={[heightStyles.toggleBtn, !isMetric && heightStyles.toggleBtnActive]}
          onPress={() => { setIsMetric(false); onChange({ ...value, unit: 'imperial' }); }}
        >
          <Text style={[heightStyles.toggleText, !isMetric && heightStyles.toggleTextActive]}>ft/in</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[heightStyles.toggleBtn, isMetric && heightStyles.toggleBtnActive]}
          onPress={() => { setIsMetric(true); onChange({ ...value, unit: 'metric' }); }}
        >
          <Text style={[heightStyles.toggleText, isMetric && heightStyles.toggleTextActive]}>cm</Text>
        </TouchableOpacity>
      </View>

      <Text style={heightStyles.valueLabel}>{minDisplay} - {maxDisplay}</Text>

      {!isMetric ? (
        <View style={heightStyles.pickerRow}>
          {/* Min Height */}
          <View style={heightStyles.pickerCol}>
            <Text style={heightStyles.colLabel}>Min Height</Text>
            <View style={heightStyles.selectRow}>
              <View style={heightStyles.selectBox}>
                <Text style={heightStyles.selectLabel}>ft</Text>
                <ScrollView style={heightStyles.selectScroll} showsVerticalScrollIndicator={false}>
                  {FEET.map(f => (
                    <TouchableOpacity
                      key={f}
                      style={[heightStyles.selectItem, value.minFeet === f && heightStyles.selectItemActive]}
                      onPress={() => updateHeight('minFeet', f)}
                    >
                      <Text style={[heightStyles.selectText, value.minFeet === f && heightStyles.selectTextActive]}>{f}'</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={heightStyles.selectBox}>
                <Text style={heightStyles.selectLabel}>in</Text>
                <ScrollView style={heightStyles.selectScroll} showsVerticalScrollIndicator={false}>
                  {INCHES.map(i => (
                    <TouchableOpacity
                      key={i}
                      style={[heightStyles.selectItem, value.minInches === i && heightStyles.selectItemActive]}
                      onPress={() => updateHeight('minInches', i)}
                    >
                      <Text style={[heightStyles.selectText, value.minInches === i && heightStyles.selectTextActive]}>{i}"</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>

          {/* Max Height */}
          <View style={heightStyles.pickerCol}>
            <Text style={heightStyles.colLabel}>Max Height</Text>
            <View style={heightStyles.selectRow}>
              <View style={heightStyles.selectBox}>
                <Text style={heightStyles.selectLabel}>ft</Text>
                <ScrollView style={heightStyles.selectScroll} showsVerticalScrollIndicator={false}>
                  {FEET.map(f => (
                    <TouchableOpacity
                      key={f}
                      style={[heightStyles.selectItem, value.maxFeet === f && heightStyles.selectItemActive]}
                      onPress={() => updateHeight('maxFeet', f)}
                    >
                      <Text style={[heightStyles.selectText, value.maxFeet === f && heightStyles.selectTextActive]}>{f}'</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={heightStyles.selectBox}>
                <Text style={heightStyles.selectLabel}>in</Text>
                <ScrollView style={heightStyles.selectScroll} showsVerticalScrollIndicator={false}>
                  {INCHES.map(i => (
                    <TouchableOpacity
                      key={i}
                      style={[heightStyles.selectItem, value.maxInches === i && heightStyles.selectItemActive]}
                      onPress={() => updateHeight('maxInches', i)}
                    >
                      <Text style={[heightStyles.selectText, value.maxInches === i && heightStyles.selectTextActive]}>{i}"</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View style={heightStyles.cmRow}>
          <View style={heightStyles.cmCol}>
            <Text style={heightStyles.colLabel}>Min (cm)</Text>
            <ScrollView style={heightStyles.cmScroll} showsVerticalScrollIndicator={false}>
              {Array.from({ length: CM_MAX - CM_MIN + 1 }, (_, i) => CM_MIN + i).map(cm => (
                <TouchableOpacity
                  key={cm}
                  style={[heightStyles.selectItem, value.minCm === cm && heightStyles.selectItemActive]}
                  onPress={() => updateHeight('minCm', cm)}
                >
                  <Text style={[heightStyles.selectText, value.minCm === cm && heightStyles.selectTextActive]}>{cm}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={heightStyles.cmCol}>
            <Text style={heightStyles.colLabel}>Max (cm)</Text>
            <ScrollView style={heightStyles.cmScroll} showsVerticalScrollIndicator={false}>
              {Array.from({ length: CM_MAX - CM_MIN + 1 }, (_, i) => CM_MIN + i).map(cm => (
                <TouchableOpacity
                  key={cm}
                  style={[heightStyles.selectItem, value.maxCm === cm && heightStyles.selectItemActive]}
                  onPress={() => updateHeight('maxCm', cm)}
                >
                  <Text style={[heightStyles.selectText, value.maxCm === cm && heightStyles.selectTextActive]}>{cm}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const heightStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    marginTop: SPACING.s,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING.m,
    gap: SPACING.s,
  },
  toggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.bgInput,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.primary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  toggleTextActive: {
    color: COLORS.white,
  },
  valueLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gold,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  pickerCol: {
    alignItems: 'center',
  },
  colLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.s,
    fontWeight: '600',
  },
  selectRow: {
    flexDirection: 'row',
    gap: SPACING.s,
  },
  selectBox: {
    alignItems: 'center',
  },
  selectLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  selectScroll: {
    height: 120,
    width: 50,
  },
  selectItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.s,
    alignItems: 'center',
  },
  selectItemActive: {
    backgroundColor: 'rgba(229,9,20,0.2)',
  },
  selectText: {
    fontSize: 16,
    color: COLORS.textMuted,
  },
  selectTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  cmRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  cmCol: {
    alignItems: 'center',
    flex: 1,
  },
  cmScroll: {
    height: 150,
    width: 80,
  },
});

// Info Tooltip Component
function InfoTooltip({ visible, onClose, title, description }: { 
  visible: boolean; onClose: () => void; title: string; description: string 
}) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={tooltipStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={tooltipStyles.container}>
          <View style={tooltipStyles.header}>
            <Ionicons name="information-circle" size={24} color={COLORS.gold} />
            <Text style={tooltipStyles.title}>{title}</Text>
          </View>
          <Text style={tooltipStyles.description}>{description}</Text>
          <TouchableOpacity style={tooltipStyles.closeBtn} onPress={onClose}>
            <Text style={tooltipStyles.closeBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const tooltipStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: SPACING.l },
  container: { backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l, padding: SPACING.l, width: '100%', maxWidth: 320 },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s, marginBottom: SPACING.m },
  title: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  description: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  closeBtn: { backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: BORDER_RADIUS.full, marginTop: SPACING.l },
  closeBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.white, textAlign: 'center' },
});

// Filter Section Component (Collapsible cards)
function FilterSectionCard({ config, section, onUpdate }: {
  config: FilterConfig; section: FilterSection; onUpdate: (s: FilterSection) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const toggleOption = (opt: string) => {
    const vals = section.values || [];
    const newVals = vals.includes(opt) ? vals.filter(v => v !== opt) : [...vals, opt];
    onUpdate({ ...section, values: newVals });
  };

  return (
    <View style={fStyles.section}>
      <TouchableOpacity style={fStyles.header} onPress={() => setExpanded(!expanded)}>
        <Text style={fStyles.title}>{config.title}</Text>
        <View style={fStyles.headerRight}>
          {(section.values?.length || 0) > 0 && (
            <View style={fStyles.badge}>
              <Text style={fStyles.badgeText}>{section.values?.length}</Text>
            </View>
          )}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textMuted} />
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={fStyles.content}>
          <View style={fStyles.checkboxRow}>
            <TouchableOpacity
              style={fStyles.checkItem}
              onPress={() => onUpdate({ ...section, exclusive: !section.exclusive })}
            >
              <View style={[fStyles.checkBox, section.exclusive && fStyles.checkBoxChecked]}>
                {section.exclusive && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={fStyles.checkLabel}>Exclusive</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fStyles.checkItem}
              onPress={() => onUpdate({ ...section, expandIfRunOut: !section.expandIfRunOut })}
            >
              <View style={[fStyles.checkBox, section.expandIfRunOut && fStyles.checkBoxChecked]}>
                {section.expandIfRunOut && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={fStyles.checkLabel}>Expand if run out</Text>
            </TouchableOpacity>
          </View>
          <View style={fStyles.chips}>
            {config.options.map(opt => (
              <TouchableOpacity
                key={opt}
                style={[fStyles.chip, section.values?.includes(opt) && fStyles.chipActive]}
                onPress={() => toggleOption(opt)}
              >
                <Text style={[fStyles.chipText, section.values?.includes(opt) && fStyles.chipTextActive]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const fStyles = StyleSheet.create({
  section: { backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.m, marginBottom: SPACING.m, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.m },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  title: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  badge: { backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: BORDER_RADIUS.full },
  badgeText: { fontSize: 11, fontWeight: '600', color: COLORS.white },
  content: { paddingHorizontal: SPACING.m, paddingBottom: SPACING.m },
  checkboxRow: { flexDirection: 'row', gap: SPACING.l, marginBottom: SPACING.m },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  checkBox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkLabel: { fontSize: 13, color: COLORS.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.bgInput, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(229,9,20,0.15)' },
  chipText: { fontSize: 13, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.primary, fontWeight: '600' },
});

// Main Filters Screen
export default function FiltersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const fromProfile = params.from === 'profile';
  const [filters, setFilters] = useState<FiltersData>(initialFiltersData);
  const [showExclusiveInfo, setShowExclusiveInfo] = useState(false);
  const [showExpandInfo, setShowExpandInfo] = useState(false);

  const updateFilter = (key: keyof FiltersData, section: FilterSection) => {
    setFilters(prev => ({ ...prev, [key]: section }));
  };

  const handleStart = async () => {
    await saveFilters(filters);
    router.replace('/swipe');
  };

  const buttonText = fromProfile ? 'Resume the show' : "Let's Start";

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Preferences & Filters</Text>
        </View>
        <Text style={styles.optionalLabel}>(Optional)</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Let's Start Button - Top */}
        <TouchableOpacity style={styles.startBtnTop} onPress={handleStart} activeOpacity={0.8}>
          <Ionicons name="film-outline" size={20} color={COLORS.white} />
          <Text style={styles.startBtnTopText}>{buttonText}</Text>
          <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
        </TouchableOpacity>

        <Text style={styles.intro}>
          Set your preferences to find the perfect movie companions. These are all optional and can be changed later.
        </Text>

        {/* Distance */}
        <View style={pStyles.section}>
          <Text style={pStyles.title}>Distance Radius</Text>
          <View style={pStyles.checkboxRow}>
            <TouchableOpacity
              style={pStyles.checkItem}
              onPress={() => setFilters(prev => ({ ...prev, distance: { ...prev.distance, exclusive: !prev.distance.exclusive } }))}
            >
              <View style={[pStyles.checkBox, filters.distance.exclusive && pStyles.checkBoxChecked]}>
                {filters.distance.exclusive && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={pStyles.checkLabel}>Exclusive</Text>
              <TouchableOpacity onPress={() => setShowExclusiveInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              </TouchableOpacity>
            </TouchableOpacity>
            <TouchableOpacity
              style={pStyles.checkItem}
              onPress={() => setFilters(prev => ({ ...prev, distance: { ...prev.distance, expandIfRunOut: !prev.distance.expandIfRunOut } }))}
            >
              <View style={[pStyles.checkBox, filters.distance.expandIfRunOut && pStyles.checkBoxChecked]}>
                {filters.distance.expandIfRunOut && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={pStyles.checkLabel}>Expand if run out</Text>
              <TouchableOpacity onPress={() => setShowExpandInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
          <HorizontalDistancePicker
            value={filters.distance.radius}
            onChange={(v) => setFilters(prev => ({ ...prev, distance: { ...prev.distance, radius: v } }))}
          />
        </View>

        {/* Age Range */}
        <View style={pStyles.section}>
          <Text style={pStyles.title}>Age Range</Text>
          <View style={pStyles.checkboxRow}>
            <TouchableOpacity
              style={pStyles.checkItem}
              onPress={() => setFilters(prev => ({ ...prev, age: { ...prev.age, exclusive: !prev.age.exclusive } }))}
            >
              <View style={[pStyles.checkBox, filters.age.exclusive && pStyles.checkBoxChecked]}>
                {filters.age.exclusive && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={pStyles.checkLabel}>Exclusive</Text>
              <TouchableOpacity onPress={() => setShowExclusiveInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              </TouchableOpacity>
            </TouchableOpacity>
            <TouchableOpacity
              style={pStyles.checkItem}
              onPress={() => setFilters(prev => ({ ...prev, age: { ...prev.age, expandIfRunOut: !prev.age.expandIfRunOut } }))}
            >
              <View style={[pStyles.checkBox, filters.age.expandIfRunOut && pStyles.checkBoxChecked]}>
                {filters.age.expandIfRunOut && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={pStyles.checkLabel}>Expand if run out</Text>
              <TouchableOpacity onPress={() => setShowExpandInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
          <HorizontalAgeRangePicker
            value={filters.age}
            onChange={(v) => setFilters(prev => ({ ...prev, age: v }))}
          />
        </View>

        {/* Height */}
        <View style={pStyles.section}>
          <Text style={pStyles.title}>Height Preference</Text>
          <View style={pStyles.checkboxRow}>
            <TouchableOpacity
              style={pStyles.checkItem}
              onPress={() => setFilters(prev => ({ ...prev, height: { ...prev.height, exclusive: !prev.height.exclusive } }))}
            >
              <View style={[pStyles.checkBox, filters.height.exclusive && pStyles.checkBoxChecked]}>
                {filters.height.exclusive && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={pStyles.checkLabel}>Exclusive</Text>
              <TouchableOpacity onPress={() => setShowExclusiveInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              </TouchableOpacity>
            </TouchableOpacity>
            <TouchableOpacity
              style={pStyles.checkItem}
              onPress={() => setFilters(prev => ({ ...prev, height: { ...prev.height, expandIfRunOut: !prev.height.expandIfRunOut } }))}
            >
              <View style={[pStyles.checkBox, filters.height.expandIfRunOut && pStyles.checkBoxChecked]}>
                {filters.height.expandIfRunOut && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={pStyles.checkLabel}>Expand if run out</Text>
              <TouchableOpacity onPress={() => setShowExpandInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
          <HeightPicker
            value={filters.height}
            onChange={(v) => setFilters(prev => ({ ...prev, height: v }))}
          />
        </View>

        {/* Other Filters */}
        {FILTER_CONFIGS.map(config => (
          <FilterSectionCard
            key={config.key}
            config={config}
            section={filters[config.key] as FilterSection}
            onUpdate={(s) => updateFilter(config.key, s)}
          />
        ))}

        {/* Bottom Button */}
        <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.8}>
          <Ionicons name="film-outline" size={22} color={COLORS.white} />
          <Text style={styles.startBtnText}>{buttonText}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Info Tooltips */}
      <InfoTooltip
        visible={showExclusiveInfo}
        onClose={() => setShowExclusiveInfo(false)}
        title="Exclusive Filter"
        description="When enabled, you will only see profiles that exactly match the selected preferences. This creates a strict filter."
      />
      <InfoTooltip
        visible={showExpandInfo}
        onClose={() => setShowExpandInfo(false)}
        title="Expand If Run Out"
        description="When enabled, if we run out of matches with your current filters, we'll automatically expand to show more profiles that closely match your preferences."
      />
    </SafeAreaView>
  );
}

// Primary Section Styles
const pStyles = StyleSheet.create({
  section: {
    marginBottom: SPACING.l,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.s,
  },
  checkboxRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.m,
    marginBottom: SPACING.xs,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
});

// Main Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  optionalLabel: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.l, paddingBottom: SPACING.xxl },
  startBtnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.l,
  },
  startBtnTopText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
  intro: { fontSize: 15, color: COLORS.textSecondary, marginBottom: SPACING.l, lineHeight: 22 },
  startBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 18,
    borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    marginTop: SPACING.m,
  },
  startBtnText: { fontSize: 18, fontWeight: 'bold', color: COLORS.white, letterSpacing: 1 },
});
