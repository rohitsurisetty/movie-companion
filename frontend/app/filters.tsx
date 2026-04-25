import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, Animated, 
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

// Generate height arrays
const FEET = [3, 4, 5, 6, 7];
const INCHES = Array.from({ length: 12 }, (_, i) => i);
const CM_VALUES = Array.from({ length: 91 }, (_, i) => 120 + i); // 120cm to 210cm

// Distance values for wheel picker
const DISTANCE_VALUES = [
  ...Array.from({ length: 10 }, (_, i) => (i + 1) * 5), // 5, 10, 15...50
  ...Array.from({ length: 9 }, (_, i) => 60 + i * 10), // 60, 70...140
  ...Array.from({ length: 7 }, (_, i) => 150 + i * 25), // 150, 175...300
  400, 500, -1 // -1 represents infinite
];

// Age values
const AGE_MIN_VALUES = Array.from({ length: 43 }, (_, i) => 18 + i); // 18-60
const AGE_MAX_VALUES = Array.from({ length: 43 }, (_, i) => 18 + i); // 18-60

// Smooth iOS-style Distance Wheel Picker
function DistanceWheelPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const initialIndex = DISTANCE_VALUES.indexOf(value >= 0 ? value : -1);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex >= 0 ? initialIndex : DISTANCE_VALUES.length - 1);

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }, 100);
  }, []);

  const handleScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(DISTANCE_VALUES.length - 1, index));
    if (clampedIndex !== selectedIndex) {
      setSelectedIndex(clampedIndex);
      onChange(DISTANCE_VALUES[clampedIndex]);
    }
  };

  const getLabel = (val: number) => val < 0 ? 'Infinite' : `${val} km`;
  const label = value < 0 ? 'Upto: Infinite distance' : `Upto: ${value} km`;

  return (
    <View style={wheelStyles.container}>
      <Text style={wheelStyles.valueLabel}>{label}</Text>
      <View style={wheelStyles.pickerRow}>
        <View style={wheelStyles.column}>
          <View style={wheelStyles.wrapper}>
            <View style={wheelStyles.highlight} />
            <ScrollView
              ref={scrollRef}
              style={wheelStyles.scroll}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              onMomentumScrollEnd={handleScroll}
              contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
              nestedScrollEnabled
            >
              {DISTANCE_VALUES.map((d, i) => (
                <View key={i} style={wheelStyles.item}>
                  <Text style={[wheelStyles.itemText, selectedIndex === i && wheelStyles.itemTextActive]}>
                    {getLabel(d)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
}

// Age Range Wheel Picker with Min and Max
function AgeRangeWheelPicker({ value, onChange }: { value: AgeFilter; onChange: (v: AgeFilter) => void }) {
  const minScrollRef = useRef<ScrollView>(null);
  const maxScrollRef = useRef<ScrollView>(null);
  const [minIndex, setMinIndex] = useState(value.min - 18);
  const [maxIndex, setMaxIndex] = useState(value.max - 18);

  useEffect(() => {
    setTimeout(() => {
      minScrollRef.current?.scrollTo({ y: minIndex * ITEM_HEIGHT, animated: false });
      maxScrollRef.current?.scrollTo({ y: maxIndex * ITEM_HEIGHT, animated: false });
    }, 100);
  }, []);

  const handleMinScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(AGE_MIN_VALUES.length - 1, index));
    const newMin = AGE_MIN_VALUES[clampedIndex];
    if (clampedIndex !== minIndex && newMin < value.max) {
      setMinIndex(clampedIndex);
      onChange({ ...value, min: newMin });
    }
  };

  const handleMaxScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(AGE_MAX_VALUES.length - 1, index));
    const newMax = AGE_MAX_VALUES[clampedIndex];
    if (clampedIndex !== maxIndex && newMax > value.min) {
      setMaxIndex(clampedIndex);
      onChange({ ...value, max: newMax });
    }
  };

  return (
    <View style={wheelStyles.container}>
      <Text style={wheelStyles.valueLabel}>{value.min} - {value.max} years</Text>
      <View style={wheelStyles.pickerRow}>
        {/* Min Age Wheel */}
        <View style={wheelStyles.column}>
          <Text style={wheelStyles.columnLabel}>Min</Text>
          <View style={wheelStyles.wrapper}>
            <View style={wheelStyles.highlight} />
            <ScrollView
              ref={minScrollRef}
              style={wheelStyles.scroll}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              onMomentumScrollEnd={handleMinScroll}
              contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
              nestedScrollEnabled
            >
              {AGE_MIN_VALUES.map((age, i) => (
                <View key={i} style={wheelStyles.item}>
                  <Text style={[wheelStyles.itemText, minIndex === i && wheelStyles.itemTextActive]}>
                    {age}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>

        <Text style={wheelStyles.separator}>-</Text>

        {/* Max Age Wheel */}
        <View style={wheelStyles.column}>
          <Text style={wheelStyles.columnLabel}>Max</Text>
          <View style={wheelStyles.wrapper}>
            <View style={wheelStyles.highlight} />
            <ScrollView
              ref={maxScrollRef}
              style={wheelStyles.scroll}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              onMomentumScrollEnd={handleMaxScroll}
              contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
              nestedScrollEnabled
            >
              {AGE_MAX_VALUES.map((age, i) => (
                <View key={i} style={wheelStyles.item}>
                  <Text style={[wheelStyles.itemText, maxIndex === i && wheelStyles.itemTextActive]}>
                    {age}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
}

// iOS-style Height Wheel Picker (exactly like DOB picker)
function HeightWheelPicker({ value, onChange }: { value: HeightFilter; onChange: (v: HeightFilter) => void }) {
  const [isMetric, setIsMetric] = useState(false);
  
  const minFeetRef = useRef<ScrollView>(null);
  const minInchRef = useRef<ScrollView>(null);
  const maxFeetRef = useRef<ScrollView>(null);
  const maxInchRef = useRef<ScrollView>(null);
  const minCmRef = useRef<ScrollView>(null);
  const maxCmRef = useRef<ScrollView>(null);

  const [minFeetIdx, setMinFeetIdx] = useState(FEET.indexOf(value.minFeet) >= 0 ? FEET.indexOf(value.minFeet) : 1);
  const [minInchIdx, setMinInchIdx] = useState(value.minInches || 0);
  const [maxFeetIdx, setMaxFeetIdx] = useState(FEET.indexOf(value.maxFeet) >= 0 ? FEET.indexOf(value.maxFeet) : 3);
  const [maxInchIdx, setMaxInchIdx] = useState(value.maxInches || 0);
  const [minCmIdx, setMinCmIdx] = useState(CM_VALUES.indexOf(value.minCm) >= 0 ? CM_VALUES.indexOf(value.minCm) : 30);
  const [maxCmIdx, setMaxCmIdx] = useState(CM_VALUES.indexOf(value.maxCm) >= 0 ? CM_VALUES.indexOf(value.maxCm) : 70);

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

  const updateHeight = (field: string, val: number) => {
    const newValue = { ...value, [field]: val };
    onChange(newValue);
  };

  const handleMinFeetScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(FEET.length - 1, idx));
    if (clampedIdx !== minFeetIdx) {
      setMinFeetIdx(clampedIdx);
      updateHeight('minFeet', FEET[clampedIdx]);
    }
  };

  const handleMinInchScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(INCHES.length - 1, idx));
    if (clampedIdx !== minInchIdx) {
      setMinInchIdx(clampedIdx);
      updateHeight('minInches', INCHES[clampedIdx]);
    }
  };

  const handleMaxFeetScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(FEET.length - 1, idx));
    if (clampedIdx !== maxFeetIdx) {
      setMaxFeetIdx(clampedIdx);
      updateHeight('maxFeet', FEET[clampedIdx]);
    }
  };

  const handleMaxInchScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(INCHES.length - 1, idx));
    if (clampedIdx !== maxInchIdx) {
      setMaxInchIdx(clampedIdx);
      updateHeight('maxInches', INCHES[clampedIdx]);
    }
  };

  const handleMinCmScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(CM_VALUES.length - 1, idx));
    if (clampedIdx !== minCmIdx) {
      setMinCmIdx(clampedIdx);
      updateHeight('minCm', CM_VALUES[clampedIdx]);
    }
  };

  const handleMaxCmScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(CM_VALUES.length - 1, idx));
    if (clampedIdx !== maxCmIdx) {
      setMaxCmIdx(clampedIdx);
      updateHeight('maxCm', CM_VALUES[clampedIdx]);
    }
  };

  const minDisplay = isMetric ? `${CM_VALUES[minCmIdx]} cm` : `${FEET[minFeetIdx]}'${INCHES[minInchIdx]}"`;
  const maxDisplay = isMetric ? `${CM_VALUES[maxCmIdx]} cm` : `${FEET[maxFeetIdx]}'${INCHES[maxInchIdx]}"`;

  return (
    <View style={wheelStyles.container}>
      {/* Unit Toggle */}
      <View style={wheelStyles.toggleRow}>
        <TouchableOpacity
          style={[wheelStyles.toggleBtn, !isMetric && wheelStyles.toggleBtnActive]}
          onPress={() => setIsMetric(false)}
        >
          <Text style={[wheelStyles.toggleText, !isMetric && wheelStyles.toggleTextActive]}>ft/in</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[wheelStyles.toggleBtn, isMetric && wheelStyles.toggleBtnActive]}
          onPress={() => setIsMetric(true)}
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
            <View style={wheelStyles.heightWheels}>
              <View style={wheelStyles.columnSmall}>
                <Text style={wheelStyles.columnLabel}>ft</Text>
                <View style={wheelStyles.wrapper}>
                  <View style={wheelStyles.highlight} />
                  <ScrollView
                    ref={minFeetRef}
                    style={wheelStyles.scroll}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleMinFeetScroll}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                    nestedScrollEnabled
                  >
                    {FEET.map((f, i) => (
                      <View key={i} style={wheelStyles.item}>
                        <Text style={[wheelStyles.itemText, minFeetIdx === i && wheelStyles.itemTextActive]}>{f}'</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
              <View style={wheelStyles.columnSmall}>
                <Text style={wheelStyles.columnLabel}>in</Text>
                <View style={wheelStyles.wrapper}>
                  <View style={wheelStyles.highlight} />
                  <ScrollView
                    ref={minInchRef}
                    style={wheelStyles.scroll}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleMinInchScroll}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                    nestedScrollEnabled
                  >
                    {INCHES.map((inch, i) => (
                      <View key={i} style={wheelStyles.item}>
                        <Text style={[wheelStyles.itemText, minInchIdx === i && wheelStyles.itemTextActive]}>{inch}"</Text>
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
            <View style={wheelStyles.heightWheels}>
              <View style={wheelStyles.columnSmall}>
                <Text style={wheelStyles.columnLabel}>ft</Text>
                <View style={wheelStyles.wrapper}>
                  <View style={wheelStyles.highlight} />
                  <ScrollView
                    ref={maxFeetRef}
                    style={wheelStyles.scroll}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleMaxFeetScroll}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                    nestedScrollEnabled
                  >
                    {FEET.map((f, i) => (
                      <View key={i} style={wheelStyles.item}>
                        <Text style={[wheelStyles.itemText, maxFeetIdx === i && wheelStyles.itemTextActive]}>{f}'</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
              <View style={wheelStyles.columnSmall}>
                <Text style={wheelStyles.columnLabel}>in</Text>
                <View style={wheelStyles.wrapper}>
                  <View style={wheelStyles.highlight} />
                  <ScrollView
                    ref={maxInchRef}
                    style={wheelStyles.scroll}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleMaxInchScroll}
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                    nestedScrollEnabled
                  >
                    {INCHES.map((inch, i) => (
                      <View key={i} style={wheelStyles.item}>
                        <Text style={[wheelStyles.itemText, maxInchIdx === i && wheelStyles.itemTextActive]}>{inch}"</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View style={wheelStyles.pickerRow}>
          {/* Min CM */}
          <View style={wheelStyles.column}>
            <Text style={wheelStyles.columnLabel}>Min</Text>
            <View style={wheelStyles.wrapper}>
              <View style={wheelStyles.highlight} />
              <ScrollView
                ref={minCmRef}
                style={wheelStyles.scroll}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                onMomentumScrollEnd={handleMinCmScroll}
                contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                nestedScrollEnabled
              >
                {CM_VALUES.map((cm, i) => (
                  <View key={i} style={wheelStyles.item}>
                    <Text style={[wheelStyles.itemText, minCmIdx === i && wheelStyles.itemTextActive]}>{cm} cm</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>

          <Text style={wheelStyles.separator}>-</Text>

          {/* Max CM */}
          <View style={wheelStyles.column}>
            <Text style={wheelStyles.columnLabel}>Max</Text>
            <View style={wheelStyles.wrapper}>
              <View style={wheelStyles.highlight} />
              <ScrollView
                ref={maxCmRef}
                style={wheelStyles.scroll}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                onMomentumScrollEnd={handleMaxCmScroll}
                contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                nestedScrollEnabled
              >
                {CM_VALUES.map((cm, i) => (
                  <View key={i} style={wheelStyles.item}>
                    <Text style={[wheelStyles.itemText, maxCmIdx === i && wheelStyles.itemTextActive]}>{cm} cm</Text>
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
  valueLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gold,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    flex: 1,
    alignItems: 'center',
    maxWidth: 120,
  },
  columnSmall: {
    flex: 1,
    alignItems: 'center',
    maxWidth: 70,
  },
  columnLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  wrapper: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    position: 'relative',
    width: '100%',
  },
  highlight: {
    position: 'absolute',
    top: ITEM_HEIGHT,
    left: 4,
    right: 4,
    height: ITEM_HEIGHT,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.s,
    opacity: 0.15,
  },
  scroll: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 18,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  itemTextActive: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 20,
  },
  separator: {
    fontSize: 24,
    color: COLORS.textMuted,
    marginHorizontal: SPACING.m,
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
  heightWheels: {
    flexDirection: 'row',
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

// Filter Section Component
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
          <DistanceWheelPicker
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
          <AgeRangeWheelPicker
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
