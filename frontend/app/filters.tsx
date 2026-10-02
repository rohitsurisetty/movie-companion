import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, BackHandler,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { FiltersData, initialFiltersData, FilterSection, HeightFilter, AgeFilter } from '../src/types';
import { saveFilters, getFilters } from '../src/store';
import { shadow } from '../src/utils/shadow';
import {
  LANGUAGES, GENRES, OTT_OPTIONS, FILM_LANGUAGES, RELIGIONS, ZODIAC_SIGNS, SIBLINGS_OPTS,
  EDUCATION_OPTS, TRAVEL_OPTS, SMOKING_OPTS, DRINKING_OPTS, EXERCISE_OPTS, PETS_OPTS,
  FAMILY_OPTS, MARITAL_STATUSES, FOOD_PREFS, RELATIONSHIP_INTENTS,
} from '../src/components/profile/constants';

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

// Options MUST be the exact strings the profile editor stores (canonical lists),
// otherwise the backend's set matching never finds anyone.
const FILTER_CONFIGS: FilterConfig[] = [
  { key: 'languages', title: 'Languages They Speak', options: LANGUAGES },
  { key: 'genres', title: 'Favourite Genres', options: GENRES },
  { key: 'ottTheatre', title: 'OTT/Theatre Preference', options: OTT_OPTIONS },
  { key: 'filmLanguages', title: 'Languages They Watch', options: FILM_LANGUAGES },
  { key: 'religion', title: 'Religion', options: RELIGIONS },
  { key: 'zodiac', title: 'Zodiac Sign', options: ZODIAC_SIGNS },
  { key: 'siblings', title: 'Siblings', options: SIBLINGS_OPTS },
  { key: 'education', title: 'Education', options: EDUCATION_OPTS },
  { key: 'travel', title: 'Travel Frequency', options: TRAVEL_OPTS },
  { key: 'smoking', title: 'Smoking Preference', options: SMOKING_OPTS },
  { key: 'drinking', title: 'Drinking Preference', options: DRINKING_OPTS },
  { key: 'exercise', title: 'Exercise Preference', options: EXERCISE_OPTS },
  { key: 'pets', title: 'Pets Preference', options: PETS_OPTS },
  { key: 'familyPlanning', title: 'Family Planning', options: FAMILY_OPTS },
  { key: 'maritalStatus', title: 'Marital Status', options: MARITAL_STATUSES },
  { key: 'foodPreference', title: 'Food Preference', options: FOOD_PREFS },
  { key: 'intent', title: 'Intent Preference', options: RELATIONSHIP_INTENTS },
];

// Saved filters from older builds can hold legacy option strings ('Non-smoker',
// 'OTT Lover', …) that no chip shows. Keep only canonical values; a section left
// with nothing valid falls back to the default (everything selected).
const sanitizeSavedFilters = (saved: FiltersData): FiltersData => {
  const out: FiltersData = { ...initialFiltersData, ...saved };
  for (const config of FILTER_CONFIGS) {
    const section = out[config.key] as FilterSection | undefined;
    if (!section || !Array.isArray(section.selected)) {
      (out as any)[config.key] = initialFiltersData[config.key];
      continue;
    }
    const valid = section.selected.filter((v) => config.options.includes(v));
    if (valid.length !== section.selected.length) {
      (out as any)[config.key] = {
        ...section,
        selected: valid.length > 0 ? valid : [...config.options],
      };
    }
  }
  return out;
};

// ============================================
// SMOOTH DISTANCE SLIDER
// ============================================
// onChange = live value while dragging (UI only); onComplete = final value on release (persisted).
function DistanceSliderComponent({ value, onChange, onComplete }: {
  value: number; onChange: (v: number) => void; onComplete: (v: number) => void;
}) {
  // Convert -1 (infinite) to max slider value
  const sliderValue = value < 0 ? MAX_KM + 1 : value;

  // Anything past MAX_KM means infinite (-1)
  const toRadius = (val: number) => (val > MAX_KM ? -1 : Math.round(val));

  const label = value < 0 ? 'Infinite distance' : `${value} km`;

  return (
    <View style={sliderStyles.container}>
      <Text style={sliderStyles.label}>Upto: {label}</Text>
      <Slider
        style={sliderStyles.slider}
        minimumValue={1}
        maximumValue={MAX_KM + 1}
        value={sliderValue}
        onValueChange={(val) => onChange(toRadius(val))}
        onSlidingComplete={(val) => onComplete(toRadius(val))}
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
// SMOOTH AGE RANGE SLIDER - Dual Thumb Range Slider
// ============================================
// Custom marker component for the thumbs (module level: a component defined inside
// the slider is a new type every render, so the thumbs remounted on every drag tick)
const AgeSliderMarker = () => (
  <View style={rangeSliderStyles.marker}>
    <View style={rangeSliderStyles.markerInner} />
  </View>
);

// onChange = live values while dragging (UI only); onComplete = final values on release (persisted).
function AgeRangeSliderComponent({ value, onChange, onComplete }: {
  value: AgeFilter; onChange: (v: AgeFilter) => void; onComplete: (v: AgeFilter) => void;
}) {
  const MIN_AGE = 18;
  const MAX_AGE = 60;

  const handleValuesChange = (values: number[]) => {
    onChange({ ...value, min: values[0], max: values[1] });
  };

  const handleValuesChangeFinish = (values: number[]) => {
    onComplete({ ...value, min: values[0], max: values[1] });
  };

  return (
    <View style={sliderStyles.container}>
      <Text style={sliderStyles.label}>{value.min} - {value.max} years</Text>
      
      <View style={rangeSliderStyles.sliderWrapper}>
        <MultiSlider
          values={[value.min, value.max]}
          min={MIN_AGE}
          max={MAX_AGE}
          step={1}
          sliderLength={280}
          onValuesChange={handleValuesChange}
          onValuesChangeFinish={handleValuesChangeFinish}
          selectedStyle={rangeSliderStyles.selectedTrack}
          unselectedStyle={rangeSliderStyles.unselectedTrack}
          trackStyle={rangeSliderStyles.track}
          markerStyle={rangeSliderStyles.markerStyle}
          pressedMarkerStyle={rangeSliderStyles.pressedMarkerStyle}
          containerStyle={rangeSliderStyles.containerStyle}
          customMarker={AgeSliderMarker}
          snapped
          allowOverlap={false}
          minMarkerOverlapDistance={10}
        />
      </View>
      
      <View style={sliderStyles.labelsRow}>
        <Text style={sliderStyles.minLabel}>{MIN_AGE}</Text>
        <Text style={sliderStyles.maxLabel}>{MAX_AGE}</Text>
      </View>
    </View>
  );
}

// Range slider specific styles
const rangeSliderStyles = StyleSheet.create({
  sliderWrapper: {
    alignItems: 'center',
    paddingVertical: SPACING.m,
  },
  track: {
    height: 6,
    borderRadius: 3,
  },
  selectedTrack: {
    backgroundColor: COLORS.primary,
  },
  unselectedTrack: {
    backgroundColor: COLORS.border,
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow({ color: '#000', offsetY: 2, blur: 4, opacity: 0.25, elevation: 5 }),
  },
  markerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  markerStyle: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.primary,
    borderWidth: 3,
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  pressedMarkerStyle: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.primaryDark,
    borderWidth: 3,
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  containerStyle: {
    height: 40,
  },
});

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
// Each wheel column edits one HeightFilter field
type WheelKey = 'minFeet' | 'minInches' | 'maxFeet' | 'maxInches' | 'minCm' | 'maxCm';
const WHEEL_ITEMS: Record<WheelKey, number[]> = {
  minFeet: FEET, minInches: INCHES, maxFeet: FEET, maxInches: INCHES, minCm: CM_VALUES, maxCm: CM_VALUES,
};
// Index shown when the stored value isn't on the wheel
const WHEEL_DEFAULT_IDX: Record<WheelKey, number> = {
  minFeet: 1, minInches: 0, maxFeet: 3, maxInches: 0, minCm: 30, maxCm: 70,
};
const wheelIndex = (key: WheelKey, v: HeightFilter) => {
  const i = WHEEL_ITEMS[key].indexOf(v[key]);
  return i >= 0 ? i : WHEEL_DEFAULT_IDX[key];
};

// ft/in <-> cm, clamped to what the wheels can show
const clampNum = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const toCm = (feet: number, inches: number) =>
  clampNum(Math.round((feet * 12 + inches) * 2.54), CM_VALUES[0], CM_VALUES[CM_VALUES.length - 1]);
const toFeetInches = (cm: number) => {
  const total = clampNum(Math.round(cm / 2.54), FEET[0] * 12, FEET[FEET.length - 1] * 12 + 11);
  return { feet: Math.floor(total / 12), inches: total % 12 };
};
// The backend prefers height_*_cm, so the unit not being edited is always derived
// from the one that is (otherwise ft/in edits were ignored server-side).
const syncHeightUnits = (v: HeightFilter, fromMetric: boolean): HeightFilter => {
  if (fromMetric) {
    const lo = toFeetInches(v.minCm);
    const hi = toFeetInches(v.maxCm);
    return { ...v, minFeet: lo.feet, minInches: lo.inches, maxFeet: hi.feet, maxInches: hi.inches };
  }
  return { ...v, minCm: toCm(v.minFeet, v.minInches), maxCm: toCm(v.maxFeet, v.maxInches) };
};

function HeightWheelPicker({ value, onChange }: { value: HeightFilter; onChange: (v: HeightFilter) => void }) {
  const [isMetric, setIsMetric] = useState(value.unit === 'metric');
  // Latest value for scroll callbacks/timers (two quick commits must not overwrite each other)
  const valueRef = useRef(value);
  valueRef.current = value;

  // Refs for scroll views
  const minFeetRef = useRef<ScrollView>(null);
  const minInchRef = useRef<ScrollView>(null);
  const maxFeetRef = useRef<ScrollView>(null);
  const maxInchRef = useRef<ScrollView>(null);
  const minCmRef = useRef<ScrollView>(null);
  const maxCmRef = useRef<ScrollView>(null);
  const wheelRefs: Record<WheelKey, React.RefObject<ScrollView | null>> = {
    minFeet: minFeetRef, minInches: minInchRef, maxFeet: maxFeetRef,
    maxInches: maxInchRef, minCm: minCmRef, maxCm: maxCmRef,
  };

  // Calculate indices
  const minFeetIdx = wheelIndex('minFeet', value);
  const minInchIdx = wheelIndex('minInches', value);
  const maxFeetIdx = wheelIndex('maxFeet', value);
  const maxInchIdx = wheelIndex('maxInches', value);
  const minCmIdx = wheelIndex('minCm', value);
  const maxCmIdx = wheelIndex('maxCm', value);

  // Helper to convert ft/in to total inches for comparison
  const toTotalInches = (feet: number, inches: number) => feet * 12 + inches;

  // State for error message
  const [heightError, setHeightError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending drag-end commits per wheel (cancelled when a momentum scroll follows)
  const dragEndTimers = useRef<Partial<Record<WheelKey, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    Object.values(dragEndTimers.current).forEach((t) => clearTimeout(t));
  }, []);

  // Scroll to the current values whenever the wheels (re)appear
  useEffect(() => {
    const t = setTimeout(() => {
      const keys: WheelKey[] = isMetric ? ['minCm', 'maxCm'] : ['minFeet', 'minInches', 'maxFeet', 'maxInches'];
      keys.forEach((k) => {
        wheelRefs[k].current?.scrollTo({ y: wheelIndex(k, valueRef.current) * ITEM_HEIGHT, animated: false });
      });
    }, 100);
    return () => clearTimeout(t);
  }, [isMetric]);

  const showHeightError = () => {
    setHeightError('Minimum height cannot be greater than maximum height');
    // Auto-clear error after 2 seconds
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setHeightError(null), 2000);
  };

  // Validation: Ensure min ≤ max (in the unit being edited)
  const isValidRange = (v: HeightFilter, metric: boolean) =>
    metric
      ? v.minCm <= v.maxCm
      : toTotalInches(v.minFeet, v.minInches) <= toTotalInches(v.maxFeet, v.maxInches);

  // Centre a wheel on an item; skipped when already there so a settled wheel
  // never triggers another commit
  const alignWheel = (key: WheelKey, idx: number, fromY?: number) => {
    const y = idx * ITEM_HEIGHT;
    if (fromY === undefined || Math.abs(fromY - y) > 1) {
      wheelRefs[key].current?.scrollTo({ y, animated: true });
    }
  };

  // Commit the item a wheel came to rest on
  const commitWheel = (key: WheelKey, y: number) => {
    const items = WHEEL_ITEMS[key];
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_HEIGHT)));
    const current = valueRef.current;
    if (items[idx] === current[key]) {
      alignWheel(key, idx, y); // unchanged - just centre a wheel left between two items
      return;
    }
    const metric = key === 'minCm' || key === 'maxCm';
    const next: HeightFilter = { ...current, [key]: items[idx] };
    if (!isValidRange(next, metric)) {
      showHeightError();
      // Rejected: spin the wheel back to the value that is still in effect
      alignWheel(key, wheelIndex(key, current));
      return;
    }
    setHeightError(null);
    const synced = syncHeightUnits(next, metric);
    valueRef.current = synced;
    onChange(synced);
    alignWheel(key, idx, y);
  };

  // Scroll wiring for one wheel. A slow drag without a fling never fires
  // onMomentumScrollEnd, so drag end commits too - deferred, and cancelled if a
  // momentum scroll follows (that one commits where it stops).
  const wheelHandlers = (key: WheelKey) => ({
    onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      clearTimeout(dragEndTimers.current[key]);
      dragEndTimers.current[key] = setTimeout(() => commitWheel(key, y), 120);
    },
    onMomentumScrollBegin: () => clearTimeout(dragEndTimers.current[key]),
    onMomentumScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      clearTimeout(dragEndTimers.current[key]);
      commitWheel(key, e.nativeEvent.contentOffset.y);
    },
  });

  // ft/in <-> cm toggle converts the values shown in the old unit into the new one
  const switchUnit = (metric: boolean) => {
    if (metric === isMetric) return;
    setHeightError(null);
    setIsMetric(metric);
    const next: HeightFilter = {
      ...syncHeightUnits(valueRef.current, !metric),
      unit: metric ? 'metric' : 'imperial',
    };
    valueRef.current = next;
    onChange(next);
  };

  const minDisplay = isMetric ? `${value.minCm} cm` : `${value.minFeet}'${value.minInches}"`;
  const maxDisplay = isMetric ? `${value.maxCm} cm` : `${value.maxFeet}'${value.maxInches}"`;

  return (
    <View style={wheelStyles.container}>
      {/* Unit Toggle */}
      <View style={wheelStyles.toggleRow}>
        <TouchableOpacity
          style={[wheelStyles.toggleBtn, !isMetric && wheelStyles.toggleBtnActive]}
          onPress={() => switchUnit(false)}
        >
          <Text style={[wheelStyles.toggleText, !isMetric && wheelStyles.toggleTextActive]}>ft/in</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[wheelStyles.toggleBtn, isMetric && wheelStyles.toggleBtnActive]}
          onPress={() => switchUnit(true)}
        >
          <Text style={[wheelStyles.toggleText, isMetric && wheelStyles.toggleTextActive]}>cm</Text>
        </TouchableOpacity>
      </View>

      <Text style={wheelStyles.valueLabel}>{minDisplay} - {maxDisplay}</Text>
      
      {/* Height Error Message */}
      {heightError && (
        <View style={wheelStyles.errorContainer}>
          <Text style={wheelStyles.errorText}>{heightError}</Text>
        </View>
      )}

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
                    {...wheelHandlers('minFeet')}
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
                    {...wheelHandlers('minInches')}
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
                    {...wheelHandlers('maxFeet')}
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
                    {...wheelHandlers('maxInches')}
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
                {...wheelHandlers('minCm')}
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
                {...wheelHandlers('maxCm')}
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
  errorContainer: {
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: SPACING.s,
  },
  errorText: {
    color: '#E53935',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
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
function FilterSectionCard({ config, section, onUpdate, onShowExclusiveInfo, onShowExpandInfo }: {
  config: FilterConfig; 
  section: FilterSection; 
  onUpdate: (s: FilterSection) => void;
  onShowExclusiveInfo: () => void;
  onShowExpandInfo: () => void;
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
              <TouchableOpacity onPress={onShowExclusiveInfo} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              </TouchableOpacity>
            </TouchableOpacity>
            <TouchableOpacity
              style={fStyles.checkItem}
              onPress={() => onUpdate({ ...section, expandIfRunOut: !section.expandIfRunOut })}
            >
              <View style={[fStyles.checkBox, section.expandIfRunOut && fStyles.checkBoxChecked]}>
                {section.expandIfRunOut && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <Text style={fStyles.checkLabel}>Expand if run out</Text>
              <TouchableOpacity onPress={onShowExpandInfo} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              </TouchableOpacity>
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
  const [loading, setLoading] = useState(true);
  const [showExclusiveInfo, setShowExclusiveInfo] = useState(false);
  const [showExpandInfo, setShowExpandInfo] = useState(false);
  const [showFloatingBtn, setShowFloatingBtn] = useState(false);
  // Latest filters for the leave/unmount handlers (state would be a stale closure there)
  const filtersRef = useRef<FiltersData>(initialFiltersData);
  // Changed since the last immediate sync? (false until the user edits, so leaving
  // during the initial load never overwrites the saved filters with defaults)
  const dirtyRef = useRef(false);

  // Load saved filters on mount
  useEffect(() => {
    loadSavedFilters();
  }, []);

  const loadSavedFilters = async () => {
    setLoading(true);
    try {
      const savedFilters = await getFilters();
      if (savedFilters) {
        // Merge saved filters with initial to handle any new fields
        const merged = sanitizeSavedFilters(savedFilters);
        filtersRef.current = merged;
        setFilters(merged);
      }
    } catch (e) {
      console.error('Error loading filters:', e);
    } finally {
      setLoading(false);
    }
  };

  // Local-only update (live slider values while dragging)
  const applyFilters = (newFilters: FiltersData) => {
    filtersRef.current = newFilters;
    dirtyRef.current = true;
    setFilters(newFilters);
  };

  // Update + persist (the store debounces the network sync)
  const updateAndSave = (newFilters: FiltersData) => {
    applyFilters(newFilters);
    void saveFilters(newFilters);
  };

  const updateFilter = (key: keyof FiltersData, section: FilterSection) => {
    updateAndSave({ ...filtersRef.current, [key]: section });
  };

  // Leaving the screen: persist + sync right away instead of waiting for the debounce
  const flushFilters = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    void saveFilters(filtersRef.current, { immediate: true });
  }, []);

  // Android hardware back + any other way of leaving (unmount) flush pending edits
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      flushFilters();
      return false; // let the stack pop this screen as usual
    });
    return () => {
      sub.remove();
      flushFilters();
    };
  }, [flushFilters]);

  const goBack = () => {
    flushFilters();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fromProfile ? '/(tabs)/profile' : '/(tabs)/discover');
    }
  };

  const handleStart = () => {
    // Always persist on Start (also first-time defaults), synced immediately
    dirtyRef.current = true;
    flushFilters();
    if (fromProfile) {
      // Return to wherever the profile settings were opened from
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/profile');
    } else {
      // Pop back to the existing tabs (no duplicate (tabs) entry in the stack) and show Discover
      router.dismissTo('/(tabs)/discover');
    }
  };

  const handleScroll = (event: any) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    // Show floating button when scrolled past the top button (about 100px)
    setShowFloatingBtn(scrollY > 100);
  };

  const buttonText = fromProfile ? 'Resume the show' : "Let's Start";

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading preferences...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with back button and floating action when scrolled */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Preferences & Filters</Text>
        </View>
        {showFloatingBtn ? (
          <TouchableOpacity 
            style={styles.floatingHeaderBtn} 
            onPress={handleStart}
            activeOpacity={0.8}
          >
            <Text style={styles.floatingHeaderBtnText}>{fromProfile ? 'Resume' : 'Start'}</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
          </TouchableOpacity>
        ) : (
          <Text style={styles.optionalLabel}>(Optional)</Text>
        )}
      </View>

      <ScrollView 
        style={styles.scroll} 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
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
              onPress={() => {
                const newFilters = { ...filters, distance: { ...filters.distance, exclusive: !filters.distance.exclusive } };
                updateAndSave(newFilters);
              }}
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
              onPress={() => {
                const newFilters = { ...filters, distance: { ...filters.distance, expandIfRunOut: !filters.distance.expandIfRunOut } };
                updateAndSave(newFilters);
              }}
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
            onChange={(v) => {
              const cur = filtersRef.current;
              applyFilters({ ...cur, distance: { ...cur.distance, radius: v } });
            }}
            onComplete={(v) => {
              const cur = filtersRef.current;
              updateAndSave({ ...cur, distance: { ...cur.distance, radius: v } });
            }}
          />
        </View>

        {/* Age Range - Smooth Slider */}
        <View style={pStyles.section}>
          <Text style={pStyles.title}>Age Range</Text>
          <View style={pStyles.checkboxRow}>
            <TouchableOpacity
              style={pStyles.checkItem}
              onPress={() => {
                const newFilters = { ...filters, age: { ...filters.age, exclusive: !filters.age.exclusive } };
                updateAndSave(newFilters);
              }}
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
              onPress={() => {
                const newFilters = { ...filters, age: { ...filters.age, expandIfRunOut: !filters.age.expandIfRunOut } };
                updateAndSave(newFilters);
              }}
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
            onChange={(v) => applyFilters({ ...filtersRef.current, age: v })}
            onComplete={(v) => updateAndSave({ ...filtersRef.current, age: v })}
          />
        </View>

        {/* Height - iOS Wheel Picker */}
        <View style={pStyles.section}>
          <Text style={pStyles.title}>Height Preference</Text>
          <View style={pStyles.checkboxRow}>
            <TouchableOpacity
              style={pStyles.checkItem}
              onPress={() => {
                const newFilters = { ...filters, height: { ...filters.height, exclusive: !filters.height.exclusive } };
                updateAndSave(newFilters);
              }}
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
              onPress={() => {
                const newFilters = { ...filters, height: { ...filters.height, expandIfRunOut: !filters.height.expandIfRunOut } };
                updateAndSave(newFilters);
              }}
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
            onChange={(v) => updateAndSave({ ...filtersRef.current, height: v })}
          />
        </View>

        {/* Other Filters */}
        {FILTER_CONFIGS.map(config => (
          <FilterSectionCard
            key={config.key}
            config={config}
            section={filters[config.key] as FilterSection}
            onUpdate={(s) => updateFilter(config.key, s)}
            onShowExclusiveInfo={() => setShowExclusiveInfo(true)}
            onShowExpandInfo={() => setShowExpandInfo(true)}
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
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16, color: COLORS.textSecondary },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.m, paddingVertical: SPACING.m,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  optionalLabel: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },
  floatingHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BORDER_RADIUS.full,
  },
  floatingHeaderBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
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
