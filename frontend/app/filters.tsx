import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { FiltersData, initialFiltersData, FilterSection, HeightFilter, AgeFilter } from '../src/types';
import { saveFilters } from '../src/store';

const MAX_KM = 500;
const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3;

// Height arrays for wheel picker
const FEET = [3, 4, 5, 6, 7];
const INCHES = Array.from({ length: 12 }, (_, i) => i);
const CM_VALUES = Array.from({ length: 101 }, (_, i) => 120 + i); // 120cm to 220cm

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

// ============================================
// SMOOTH DISTANCE SLIDER
// ============================================
function DistanceSliderComponent({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Convert -1 (infinite) to max slider value
  const sliderValue = value < 0 ? MAX_KM + 1 : value;
  
  const handleChange = (val: number) => {
    if (val > MAX_KM) {
      onChange(-1); // Infinite
    } else {
      onChange(Math.round(val));
    }
  };

  const label = value < 0 ? 'Infinite distance' : `${value} km`;

  return (
    <View style={sliderStyles.container}>
      <Text style={sliderStyles.label}>Upto: {label}</Text>
      <Slider
        style={sliderStyles.slider}
        minimumValue={1}
        maximumValue={MAX_KM + 1}
        value={sliderValue}
        onValueChange={handleChange}
        minimumTrackTintColor={COLORS.primary}
        maximumTrackTintColor={COLORS.border}
        thumbTintColor={COLORS.primary}
        step={1}
      />
      <View style={sliderStyles.labelsRow}>
        <Text style={sliderStyles.minLabel}>1 km</Text>
        <Text style={sliderStyles.maxLabel}>∞</Text>
      </View>
    </View>
  );
}

// ============================================
// SMOOTH AGE RANGE SLIDER (Two separate sliders)
// ============================================
function AgeRangeSliderComponent({ value, onChange }: { value: AgeFilter; onChange: (v: AgeFilter) => void }) {
  const MIN_AGE = 18;
  const MAX_AGE = 60;

  const handleMinChange = (val: number) => {
    const newMin = Math.round(val);
    if (newMin < value.max) {
      onChange({ ...value, min: newMin });
    }
  };

  const handleMaxChange = (val: number) => {
    const newMax = Math.round(val);
    if (newMax > value.min) {
      onChange({ ...value, max: newMax });
    }
  };

  return (
    <View style={sliderStyles.container}>
      <Text style={sliderStyles.label}>{value.min} - {value.max} years</Text>
      
      {/* Min Age Slider */}
      <Text style={sliderStyles.subLabel}>Minimum Age: {value.min}</Text>
      <Slider
        style={sliderStyles.slider}
        minimumValue={MIN_AGE}
        maximumValue={MAX_AGE}
        value={value.min}
        onValueChange={handleMinChange}
        minimumTrackTintColor={COLORS.primary}
        maximumTrackTintColor={COLORS.border}
        thumbTintColor={COLORS.primary}
        step={1}
      />
      
      {/* Max Age Slider */}
      <Text style={[sliderStyles.subLabel, { marginTop: SPACING.m }]}>Maximum Age: {value.max}</Text>
      <Slider
        style={sliderStyles.slider}
        minimumValue={MIN_AGE}
        maximumValue={MAX_AGE}
        value={value.max}
        onValueChange={handleMaxChange}
        minimumTrackTintColor={COLORS.primary}
        maximumTrackTintColor={COLORS.border}
        thumbTintColor={COLORS.primary}
        step={1}
      />
      
      <View style={sliderStyles.labelsRow}>
        <Text style={sliderStyles.minLabel}>{MIN_AGE}</Text>
        <Text style={sliderStyles.maxLabel}>{MAX_AGE}</Text>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    marginTop: SPACING.s,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gold,
    textAlign: 'center',
    marginBottom: SPACING.s,
  },
  subLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  minLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  maxLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});

// ============================================
// iOS WHEEL PICKER - Height with Min ≤ Max validation
// ============================================
function HeightWheelPicker({ value, onChange }: { value: HeightFilter; onChange: (v: HeightFilter) => void }) {
  const [isMetric, setIsMetric] = useState(value.unit === 'metric');
  
  // Refs for scroll views
  const minFeetRef = useRef<ScrollView>(null);
  const minInchRef = useRef<ScrollView>(null);
  const maxFeetRef = useRef<ScrollView>(null);
  const maxInchRef = useRef<ScrollView>(null);
  const minCmRef = useRef<ScrollView>(null);
  const maxCmRef = useRef<ScrollView>(null);

  // Calculate indices
  const minFeetIdx = FEET.indexOf(value.minFeet) >= 0 ? FEET.indexOf(value.minFeet) : 1;
  const minInchIdx = value.minInches || 0;
  const maxFeetIdx = FEET.indexOf(value.maxFeet) >= 0 ? FEET.indexOf(value.maxFeet) : 3;
  const maxInchIdx = value.maxInches || 0;
  const minCmIdx = CM_VALUES.indexOf(value.minCm) >= 0 ? CM_VALUES.indexOf(value.minCm) : 30;
  const maxCmIdx = CM_VALUES.indexOf(value.maxCm) >= 0 ? CM_VALUES.indexOf(value.maxCm) : 70;

  // Helper to convert ft/in to total inches for comparison
  const toTotalInches = (feet: number, inches: number) => feet * 12 + inches;

  // Scroll to initial positions
  useEffect(() => {
    setTimeout(() => {
      if (isMetric) {
        minCmRef.current?.scrollTo({ y: minCmIdx * ITEM_HEIGHT, animated: false });
        maxCmRef.current?.scrollTo({ y: maxCmIdx * ITEM_HEIGHT, animated: false });
      } else {
        minFeetRef.current?.scrollTo({ y: minFeetIdx * ITEM_HEIGHT, animated: false });
        minInchRef.current?.scrollTo({ y: minInchIdx * ITEM_HEIGHT, animated: false });
        maxFeetRef.current?.scrollTo({ y: maxFeetIdx * ITEM_HEIGHT, animated: false });
        maxInchRef.current?.scrollTo({ y: maxInchIdx * ITEM_HEIGHT, animated: false });
      }
    }, 100);
  }, [isMetric]);

  // Validation: Ensure min ≤ max
  const validateAndUpdate = (newValue: HeightFilter) => {
    const minTotal = toTotalInches(newValue.minFeet, newValue.minInches);
    const maxTotal = toTotalInches(newValue.maxFeet, newValue.maxInches);
    
    if (minTotal <= maxTotal) {
      onChange(newValue);
    }
    // If invalid, don't update (keeps current valid state)
  };

  const validateAndUpdateCm = (newValue: HeightFilter) => {
    if (newValue.minCm <= newValue.maxCm) {
      onChange(newValue);
    }
  };

  const handleMinFeetScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(FEET.length - 1, idx));
    const newFeet = FEET[clampedIdx];
    if (newFeet !== value.minFeet) {
      validateAndUpdate({ ...value, minFeet: newFeet });
    }
  };

  const handleMinInchScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(INCHES.length - 1, idx));
    const newInch = INCHES[clampedIdx];
    if (newInch !== value.minInches) {
      validateAndUpdate({ ...value, minInches: newInch });
    }
  };

  const handleMaxFeetScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(FEET.length - 1, idx));
    const newFeet = FEET[clampedIdx];
    if (newFeet !== value.maxFeet) {
      validateAndUpdate({ ...value, maxFeet: newFeet });
    }
  };

  const handleMaxInchScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(INCHES.length - 1, idx));
    const newInch = INCHES[clampedIdx];
    if (newInch !== value.maxInches) {
      validateAndUpdate({ ...value, maxInches: newInch });
    }
  };

  const handleMinCmScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(CM_VALUES.length - 1, idx));
    const newCm = CM_VALUES[clampedIdx];
    if (newCm !== value.minCm) {
      validateAndUpdateCm({ ...value, minCm: newCm });
    }
  };

  const handleMaxCmScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(CM_VALUES.length - 1, idx));
    const newCm = CM_VALUES[clampedIdx];
    if (newCm !== value.maxCm) {
      validateAndUpdateCm({ ...value, maxCm: newCm });
    }
  };

  const minDisplay = isMetric ? `${value.minCm} cm` : `${value.minFeet}'${value.minInches}"`;
  const maxDisplay = isMetric ? `${value.maxCm} cm` : `${value.maxFeet}'${value.maxInches}"`;

  return (
    <View style={wheelStyles.container}>
      {/* Unit Toggle */}
      <View style={wheelStyles.toggleRow}>
        <TouchableOpacity
          style={[wheelStyles.toggleBtn, !isMetric && wheelStyles.toggleBtnActive]}
          onPress={() => { setIsMetric(false); onChange({ ...value, unit: 'imperial' }); }}
        >
          <Text style={[wheelStyles.toggleText, !isMetric && wheelStyles.toggleTextActive]}>ft/in</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[wheelStyles.toggleBtn, isMetric && wheelStyles.toggleBtnActive]}
          onPress={() => { setIsMetric(true); onChange({ ...value, unit: 'metric' }); }}
        >
          <Text style={[wheelStyles.toggleText, isMetric && wheelStyles.toggleTextActive]}>cm</Text>
        </TouchableOpacity>
      </View>

      <Text style={wheelStyles.valueLabel}>{minDisplay} - {maxDisplay}</Text>

      {!isMetric ? (
        <View style={wheelStyles.heightContainer}>
          {/* Min Height */}
          <View style={wheelStyles.heightSection}>
            <Text style={wheelStyles.sectionLabel}>Min Height</Text>
            <View style={wheelStyles.wheelRow}>
              {/* Feet */}
              <View style={wheelStyles.wheelColumn}>
                <Text style={wheelStyles.wheelLabel}>ft</Text>
                <View style={wheelStyles.wheelWrapper}>
                  <View style={wheelStyles.wheelHighlight} />
                  <ScrollView
                    ref={minFeetRef}
                    style={wheelStyles.wheelScroll}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleMinFeetScroll}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                    nestedScrollEnabled
                  >
                    {FEET.map((f, i) => (
                      <View key={i} style={wheelStyles.wheelItem}>
                        <Text style={[wheelStyles.wheelItemText, minFeetIdx === i && wheelStyles.wheelItemTextActive]}>
                          {f}'
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
              {/* Inches */}
              <View style={wheelStyles.wheelColumn}>
                <Text style={wheelStyles.wheelLabel}>in</Text>
                <View style={wheelStyles.wheelWrapper}>
                  <View style={wheelStyles.wheelHighlight} />
                  <ScrollView
                    ref={minInchRef}
                    style={wheelStyles.wheelScroll}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleMinInchScroll}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                    nestedScrollEnabled
                  >
                    {INCHES.map((inch, i) => (
                      <View key={i} style={wheelStyles.wheelItem}>
                        <Text style={[wheelStyles.wheelItemText, minInchIdx === i && wheelStyles.wheelItemTextActive]}>
                          {inch}"
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>

          {/* Max Height */}
          <View style={wheelStyles.heightSection}>
            <Text style={wheelStyles.sectionLabel}>Max Height</Text>
            <View style={wheelStyles.wheelRow}>
              {/* Feet */}
              <View style={wheelStyles.wheelColumn}>
                <Text style={wheelStyles.wheelLabel}>ft</Text>
                <View style={wheelStyles.wheelWrapper}>
                  <View style={wheelStyles.wheelHighlight} />
                  <ScrollView
                    ref={maxFeetRef}
                    style={wheelStyles.wheelScroll}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleMaxFeetScroll}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                    nestedScrollEnabled
                  >
                    {FEET.map((f, i) => (
                      <View key={i} style={wheelStyles.wheelItem}>
                        <Text style={[wheelStyles.wheelItemText, maxFeetIdx === i && wheelStyles.wheelItemTextActive]}>
                          {f}'
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
              {/* Inches */}
              <View style={wheelStyles.wheelColumn}>
                <Text style={wheelStyles.wheelLabel}>in</Text>
                <View style={wheelStyles.wheelWrapper}>
                  <View style={wheelStyles.wheelHighlight} />
                  <ScrollView
                    ref={maxInchRef}
                    style={wheelStyles.wheelScroll}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleMaxInchScroll}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                    nestedScrollEnabled
                  >
                    {INCHES.map((inch, i) => (
                      <View key={i} style={wheelStyles.wheelItem}>
                        <Text style={[wheelStyles.wheelItemText, maxInchIdx === i && wheelStyles.wheelItemTextActive]}>
                          {inch}"
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View style={wheelStyles.cmContainer}>
          {/* Min CM */}
          <View style={wheelStyles.cmSection}>
            <Text style={wheelStyles.sectionLabel}>Min Height</Text>
            <View style={wheelStyles.wheelWrapper}>
              <View style={wheelStyles.wheelHighlight} />
              <ScrollView
                ref={minCmRef}
                style={wheelStyles.wheelScroll}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                onMomentumScrollEnd={handleMinCmScroll}
                contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                nestedScrollEnabled
              >
                {CM_VALUES.map((cm, i) => (
                  <View key={i} style={wheelStyles.wheelItem}>
                    <Text style={[wheelStyles.wheelItemText, minCmIdx === i && wheelStyles.wheelItemTextActive]}>
                      {cm} cm
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Max CM */}
          <View style={wheelStyles.cmSection}>
            <Text style={wheelStyles.sectionLabel}>Max Height</Text>
            <View style={wheelStyles.wheelWrapper}>
              <View style={wheelStyles.wheelHighlight} />
              <ScrollView
                ref={maxCmRef}
                style={wheelStyles.wheelScroll}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                onMomentumScrollEnd={handleMaxCmScroll}
                contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                nestedScrollEnabled
              >
                {CM_VALUES.map((cm, i) => (
                  <View key={i} style={wheelStyles.wheelItem}>
                    <Text style={[wheelStyles.wheelItemText, maxCmIdx === i && wheelStyles.wheelItemTextActive]}>
                      {cm} cm
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// Wheel Picker Styles
const wheelStyles = StyleSheet.create({
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
    paddingHorizontal: 24,
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
  heightContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  heightSection: {
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.s,
    fontWeight: '600',
  },
  wheelRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  wheelColumn: {
    alignItems: 'center',
  },
  wheelLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  wheelWrapper: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    width: 60,
    position: 'relative',
    overflow: 'hidden',
  },
  wheelHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT,
    left: 2,
    right: 2,
    height: ITEM_HEIGHT,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.s,
    opacity: 0.15,
  },
  wheelScroll: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelItemText: {
    fontSize: 18,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  wheelItemTextActive: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 20,
  },
  cmContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  cmSection: {
    alignItems: 'center',
  },
});

// ============================================
// INFO TOOLTIP
// ============================================
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

// ============================================
// FILTER SECTION CARD (Collapsible) - Uses 'selected' field
// ============================================
function FilterSectionCard({ config, section, onUpdate }: {
  config: FilterConfig; section: FilterSection; onUpdate: (s: FilterSection) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const toggleOption = (opt: string) => {
    const vals = section.selected || [];
    const newVals = vals.includes(opt) ? vals.filter(v => v !== opt) : [...vals, opt];
    onUpdate({ ...section, selected: newVals });
  };

  const selectAll = () => {
    onUpdate({ ...section, selected: [...config.options] });
  };

  const deselectAll = () => {
    onUpdate({ ...section, selected: [] });
  };

  return (
    <View style={fStyles.section}>
      <TouchableOpacity style={fStyles.header} onPress={() => setExpanded(!expanded)}>
        <Text style={fStyles.title}>{config.title}</Text>
        <View style={fStyles.headerRight}>
          {(section.selected?.length || 0) > 0 && (
            <View style={fStyles.badge}>
              <Text style={fStyles.badgeText}>{section.selected?.length}</Text>
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
          
          {/* Quick select/deselect buttons */}
          <View style={fStyles.quickActions}>
            <TouchableOpacity style={fStyles.quickBtn} onPress={selectAll}>
              <Text style={fStyles.quickBtnText}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={fStyles.quickBtn} onPress={deselectAll}>
              <Text style={fStyles.quickBtnText}>Clear All</Text>
            </TouchableOpacity>
          </View>
          
          <View style={fStyles.chips}>
            {config.options.map(opt => (
              <TouchableOpacity
                key={opt}
                style={[fStyles.chip, section.selected?.includes(opt) && fStyles.chipActive]}
                onPress={() => toggleOption(opt)}
              >
                <Text style={[fStyles.chipText, section.selected?.includes(opt) && fStyles.chipTextActive]}>{opt}</Text>
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
  quickActions: { flexDirection: 'row', gap: SPACING.s, marginBottom: SPACING.m },
  quickBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: BORDER_RADIUS.s, backgroundColor: COLORS.bgInput },
  quickBtnText: { fontSize: 12, color: COLORS.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.bgInput, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(229,9,20,0.15)' },
  chipText: { fontSize: 13, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.primary, fontWeight: '600' },
});

// ============================================
// MAIN FILTERS SCREEN
// ============================================
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
        <Text style={styles.headerTitle}>Preferences & Filters</Text>
        <Text style={styles.optionalLabel}>(Optional)</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Start Button - Top */}
        <TouchableOpacity style={styles.startBtnTop} onPress={handleStart} activeOpacity={0.8}>
          <Ionicons name="film-outline" size={20} color={COLORS.white} />
          <Text style={styles.startBtnTopText}>{buttonText}</Text>
          <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
        </TouchableOpacity>

        <Text style={styles.intro}>
          Set your preferences to find the perfect movie companions. These are all optional and can be changed later.
        </Text>

        {/* Distance Radius - Smooth Slider */}
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
          <DistanceSliderComponent
            value={filters.distance.radius}
            onChange={(v) => setFilters(prev => ({ ...prev, distance: { ...prev.distance, radius: v } }))}
          />
        </View>

        {/* Age Range - Smooth Slider */}
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
          <AgeRangeSliderComponent
            value={filters.age}
            onChange={(v) => setFilters(prev => ({ ...prev, age: v }))}
          />
        </View>

        {/* Height - iOS Wheel Picker */}
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
          <HeightWheelPicker
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

      {/* Tooltips */}
      <InfoTooltip
        visible={showExclusiveInfo}
        onClose={() => setShowExclusiveInfo(false)}
        title="Exclusive Filter"
        description="When enabled, you will only see profiles that exactly match the selected preferences."
      />
      <InfoTooltip
        visible={showExpandInfo}
        onClose={() => setShowExpandInfo(false)}
        title="Expand If Run Out"
        description="When enabled, if we run out of matches, we'll expand to show profiles that closely match your preferences."
      />
    </SafeAreaView>
  );
}

const pStyles = StyleSheet.create({
  section: { marginBottom: SPACING.l },
  title: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.s },
  checkboxRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.m, marginBottom: SPACING.xs },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  checkBox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkLabel: { fontSize: 13, color: COLORS.textSecondary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.l, paddingVertical: SPACING.m,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  optionalLabel: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.l, paddingBottom: SPACING.xxl },
  startBtnTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.s,
    backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: BORDER_RADIUS.full, marginBottom: SPACING.l,
  },
  startBtnTopText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
  intro: { fontSize: 15, color: COLORS.textSecondary, marginBottom: SPACING.l, lineHeight: 22 },
  startBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.s, marginTop: SPACING.m,
  },
  startBtnText: { fontSize: 18, fontWeight: 'bold', color: COLORS.white, letterSpacing: 1 },
});
