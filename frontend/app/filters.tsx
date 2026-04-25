import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal,
  PanResponder, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
// HORIZONTAL SLIDER BAR - Distance
// ============================================
function DistanceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<View>(null);

  // Convert value to percentage (0-1)
  const getPercent = useCallback(() => {
    if (value < 0) return 1; // Infinite = 100%
    return Math.min(value / MAX_KM, 1);
  }, [value]);

  // Convert position to value
  const positionToValue = useCallback((x: number) => {
    if (trackWidth === 0) return value;
    const percent = Math.max(0, Math.min(1, x / trackWidth));
    if (percent >= 0.95) return -1; // Infinite
    return Math.round(percent * MAX_KM);
  }, [trackWidth, value]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setIsDragging(true);
        const x = e.nativeEvent.locationX;
        onChange(positionToValue(x));
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        onChange(positionToValue(x));
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
      },
    })
  ).current;

  // Update panResponder when trackWidth changes
  useEffect(() => {
    panResponder.panHandlers.onResponderMove = (e: any) => {
      const x = e.nativeEvent.locationX;
      onChange(positionToValue(x));
    };
  }, [trackWidth, positionToValue, onChange]);

  const thumbLeft = `${getPercent() * 100}%`;
  const label = value < 0 ? 'Infinite distance' : `${value} km`;

  return (
    <View style={sliderStyles.container}>
      <Text style={sliderStyles.label}>Upto: {label}</Text>
      <View
        ref={trackRef}
        style={sliderStyles.trackWrapper}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View style={sliderStyles.track}>
          <View style={[sliderStyles.trackFill, { width: thumbLeft }]} />
        </View>
        <View style={[sliderStyles.thumbOuter, { left: thumbLeft }]}>
          <View style={[sliderStyles.thumb, isDragging && sliderStyles.thumbActive]} />
        </View>
      </View>
      <View style={sliderStyles.labelsRow}>
        <Text style={sliderStyles.minLabel}>0</Text>
        <Text style={sliderStyles.maxLabel}>∞</Text>
      </View>
    </View>
  );
}

// ============================================
// HORIZONTAL SLIDER BAR - Age Range (Dual Thumb)
// ============================================
function AgeRangeSlider({ value, onChange }: { value: AgeFilter; onChange: (v: AgeFilter) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [activeThumb, setActiveThumb] = useState<'min' | 'max' | null>(null);
  const MIN_AGE = 18;
  const MAX_AGE = 60;
  const RANGE = MAX_AGE - MIN_AGE;

  const getMinPercent = () => ((value.min - MIN_AGE) / RANGE) * 100;
  const getMaxPercent = () => ((value.max - MIN_AGE) / RANGE) * 100;

  const positionToAge = useCallback((x: number) => {
    if (trackWidth === 0) return MIN_AGE;
    const percent = Math.max(0, Math.min(1, x / trackWidth));
    return Math.round(MIN_AGE + percent * RANGE);
  }, [trackWidth]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        const touchAge = positionToAge(x);
        
        // Determine which thumb is closer
        const distToMin = Math.abs(touchAge - value.min);
        const distToMax = Math.abs(touchAge - value.max);
        
        if (distToMin <= distToMax) {
          setActiveThumb('min');
          if (touchAge < value.max) {
            onChange({ ...value, min: touchAge });
          }
        } else {
          setActiveThumb('max');
          if (touchAge > value.min) {
            onChange({ ...value, max: touchAge });
          }
        }
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        const touchAge = positionToAge(x);
        
        if (activeThumb === 'min' && touchAge < value.max) {
          onChange({ ...value, min: Math.max(MIN_AGE, touchAge) });
        } else if (activeThumb === 'max' && touchAge > value.min) {
          onChange({ ...value, max: Math.min(MAX_AGE, touchAge) });
        }
      },
      onPanResponderRelease: () => {
        setActiveThumb(null);
      },
      onPanResponderTerminate: () => {
        setActiveThumb(null);
      },
    })
  ).current;

  return (
    <View style={sliderStyles.container}>
      <Text style={sliderStyles.label}>{value.min} - {value.max} years</Text>
      <View
        style={sliderStyles.trackWrapper}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View style={sliderStyles.track}>
          <View style={[
            sliderStyles.trackFillRange,
            { left: `${getMinPercent()}%`, width: `${getMaxPercent() - getMinPercent()}%` }
          ]} />
        </View>
        {/* Min thumb */}
        <View style={[sliderStyles.thumbOuter, { left: `${getMinPercent()}%` }]}>
          <View style={[sliderStyles.thumb, activeThumb === 'min' && sliderStyles.thumbActive]} />
        </View>
        {/* Max thumb */}
        <View style={[sliderStyles.thumbOuter, { left: `${getMaxPercent()}%` }]}>
          <View style={[sliderStyles.thumb, activeThumb === 'max' && sliderStyles.thumbActive]} />
        </View>
      </View>
      <View style={sliderStyles.labelsRow}>
        <Text style={sliderStyles.minLabel}>{MIN_AGE}</Text>
        <Text style={sliderStyles.maxLabel}>{MAX_AGE}</Text>
      </View>
    </View>
  );
}

// Slider Styles
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
    marginBottom: SPACING.l,
  },
  trackWrapper: {
    height: 40,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  trackFillRange: {
    position: 'absolute',
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  thumbOuter: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    marginLeft: -16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  thumbActive: {
    transform: [{ scale: 1.15 }],
    borderColor: COLORS.primaryDark,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.s,
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
// iOS WHEEL PICKER - Height (like DOB picker)
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

  const handleMinFeetScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(FEET.length - 1, idx));
    if (FEET[clampedIdx] !== value.minFeet) {
      onChange({ ...value, minFeet: FEET[clampedIdx] });
    }
  };

  const handleMinInchScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(INCHES.length - 1, idx));
    if (INCHES[clampedIdx] !== value.minInches) {
      onChange({ ...value, minInches: INCHES[clampedIdx] });
    }
  };

  const handleMaxFeetScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(FEET.length - 1, idx));
    if (FEET[clampedIdx] !== value.maxFeet) {
      onChange({ ...value, maxFeet: FEET[clampedIdx] });
    }
  };

  const handleMaxInchScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(INCHES.length - 1, idx));
    if (INCHES[clampedIdx] !== value.maxInches) {
      onChange({ ...value, maxInches: INCHES[clampedIdx] });
    }
  };

  const handleMinCmScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(CM_VALUES.length - 1, idx));
    if (CM_VALUES[clampedIdx] !== value.minCm) {
      onChange({ ...value, minCm: CM_VALUES[clampedIdx] });
    }
  };

  const handleMaxCmScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(CM_VALUES.length - 1, idx));
    if (CM_VALUES[clampedIdx] !== value.maxCm) {
      onChange({ ...value, maxCm: CM_VALUES[clampedIdx] });
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

// Wheel Picker Styles (same as DOB picker)
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
// FILTER SECTION CARD (Collapsible)
// ============================================
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

        {/* Distance Radius - Horizontal Slider */}
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
          <DistanceSlider
            value={filters.distance.radius}
            onChange={(v) => setFilters(prev => ({ ...prev, distance: { ...prev.distance, radius: v } }))}
          />
        </View>

        {/* Age Range - Horizontal Slider */}
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
          <AgeRangeSlider
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
