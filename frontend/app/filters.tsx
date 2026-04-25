import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  PanResponder, Platform, Animated, Modal, GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
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

// Distance Slider Component with web-compatible touch handling
function DistanceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackRef = useRef<View>(null);
  const [isDragging, setIsDragging] = useState(false);

  const getPercent = useCallback(() => {
    if (value < 0) return 1; // Infinite
    return Math.min(value / MAX_KM, 0.95);
  }, [value]);

  const updateValue = useCallback((locationX: number) => {
    if (trackWidth === 0) return;
    const percent = Math.max(0, Math.min(1, locationX / trackWidth));
    if (percent > 0.95) {
      onChange(-1); // Infinite
    } else {
      onChange(Math.max(1, Math.round(percent * MAX_KM)));
    }
  }, [trackWidth, onChange]);

  const handleTouchStart = (e: GestureResponderEvent) => {
    setIsDragging(true);
    updateValue(e.nativeEvent.locationX);
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    if (isDragging) {
      updateValue(e.nativeEvent.locationX);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const label = value < 0 ? 'Upto: Infinite distance' : `Upto: ${value} kms`;
  const thumbPosition = `${getPercent() * 100}%`;

  return (
    <View style={sliderStyles.container}>
      <Text style={sliderStyles.label}>{label}</Text>
      <View
        ref={trackRef}
        style={sliderStyles.trackContainer}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouchStart}
        onResponderMove={handleTouchMove}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={handleTouchEnd}
      >
        <View style={sliderStyles.track}>
          <View style={[sliderStyles.fill, { width: thumbPosition }]} />
        </View>
        <View style={[sliderStyles.thumbContainer, { left: thumbPosition }]}>
          <View style={[sliderStyles.thumb, isDragging && sliderStyles.thumbActive]} />
        </View>
      </View>
      <View style={sliderStyles.labels}>
        <Text style={sliderStyles.minLabel}>0 km</Text>
        <Text style={sliderStyles.maxLabel}>Infinite</Text>
      </View>
    </View>
  );
}

// Age Range Slider Component with web-compatible dual thumbs
function AgeRangeSlider({ value, onChange }: { value: AgeFilter; onChange: (v: AgeFilter) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [activeThumb, setActiveThumb] = useState<'min' | 'max' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const MIN_AGE = 18;
  const MAX_AGE = 60;
  const RANGE = MAX_AGE - MIN_AGE;

  const getMinPercent = () => ((value.min - MIN_AGE) / RANGE) * 100;
  const getMaxPercent = () => ((value.max - MIN_AGE) / RANGE) * 100;

  const handleTouch = useCallback((locationX: number, isStart: boolean = false) => {
    if (trackWidth === 0) return;
    const percent = Math.max(0, Math.min(1, locationX / trackWidth));
    const newAge = Math.round(MIN_AGE + percent * RANGE);
    
    // Determine which thumb to move based on proximity
    const minPos = (value.min - MIN_AGE) / RANGE;
    const maxPos = (value.max - MIN_AGE) / RANGE;
    const distToMin = Math.abs(percent - minPos);
    const distToMax = Math.abs(percent - maxPos);
    
    let thumb = activeThumb;
    if (isStart || activeThumb === null) {
      thumb = distToMin < distToMax ? 'min' : 'max';
      setActiveThumb(thumb);
    }
    
    if (thumb === 'min') {
      if (newAge < value.max - 1) {
        onChange({ ...value, min: Math.max(MIN_AGE, newAge) });
      }
    } else {
      if (newAge > value.min + 1) {
        onChange({ ...value, max: Math.min(MAX_AGE, newAge) });
      }
    }
  }, [trackWidth, value, onChange, activeThumb]);

  const handleTouchStart = (e: GestureResponderEvent) => {
    setIsDragging(true);
    handleTouch(e.nativeEvent.locationX, true);
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    if (isDragging) {
      handleTouch(e.nativeEvent.locationX);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setActiveThumb(null);
  };

  return (
    <View style={sliderStyles.container}>
      <Text style={sliderStyles.label}>{value.min} - {value.max} years</Text>
      <View
        style={sliderStyles.trackContainer}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouchStart}
        onResponderMove={handleTouchMove}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={handleTouchEnd}
      >
        <View style={sliderStyles.track}>
          <View style={[
            sliderStyles.rangeFill, 
            { left: `${getMinPercent()}%`, width: `${getMaxPercent() - getMinPercent()}%` }
          ]} />
        </View>
        <View style={[sliderStyles.thumbContainer, { left: `${getMinPercent()}%` }]}>
          <View style={[sliderStyles.thumb, activeThumb === 'min' && sliderStyles.thumbActive]} />
        </View>
        <View style={[sliderStyles.thumbContainer, { left: `${getMaxPercent()}%` }]}>
          <View style={[sliderStyles.thumb, activeThumb === 'max' && sliderStyles.thumbActive]} />
        </View>
      </View>
      <View style={sliderStyles.labels}>
        <Text style={sliderStyles.minLabel}>{MIN_AGE}</Text>
        <Text style={sliderStyles.maxLabel}>{MAX_AGE}+</Text>
      </View>
    </View>
  );
}

// Height Picker Component with embedded scrollable
function HeightPicker({ value, onChange }: { value: HeightFilter; onChange: (v: HeightFilter) => void }) {
  const [unit, setUnit] = useState<'imperial' | 'metric'>(value.unit);

  const feetOptions = [4, 5, 6, 7];
  const inchOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const cmOptions = Array.from({ length: 77 }, (_, i) => 137 + i); // 137cm to 213cm

  const getDisplayHeight = (type: 'min' | 'max') => {
    if (unit === 'imperial') {
      const feet = type === 'min' ? value.minFeet : value.maxFeet;
      const inches = type === 'min' ? value.minInches : value.maxInches;
      return `${feet}'${inches}"`;
    }
    const cm = type === 'min' ? value.minCm : value.maxCm;
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

      {/* Current Selection Display */}
      <View style={heightStyles.selectionDisplay}>
        <View style={heightStyles.selectionItem}>
          <Text style={heightStyles.selectionLabel}>Min</Text>
          <Text style={heightStyles.selectionValue}>{getDisplayHeight('min')}</Text>
        </View>
        <Text style={heightStyles.selectionSeparator}>-</Text>
        <View style={heightStyles.selectionItem}>
          <Text style={heightStyles.selectionLabel}>Max</Text>
          <Text style={heightStyles.selectionValue}>{getDisplayHeight('max')}</Text>
        </View>
      </View>

      {/* Embedded Scrollable Pickers */}
      <View style={heightStyles.pickersContainer}>
        {/* Min Height */}
        <View style={heightStyles.pickerColumn}>
          <Text style={heightStyles.pickerLabel}>Min Height</Text>
          <View style={heightStyles.scrollContainer}>
            {unit === 'imperial' ? (
              <View style={heightStyles.imperialRow}>
                <ScrollView style={heightStyles.scrollPicker} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {feetOptions.map((ft) => (
                    <TouchableOpacity
                      key={ft}
                      style={[heightStyles.scrollItem, value.minFeet === ft && heightStyles.scrollItemActive]}
                      onPress={() => onChange({ ...value, minFeet: ft })}
                    >
                      <Text style={[heightStyles.scrollItemText, value.minFeet === ft && heightStyles.scrollItemTextActive]}>{ft}'</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <ScrollView style={heightStyles.scrollPicker} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {inchOptions.map((inch) => (
                    <TouchableOpacity
                      key={inch}
                      style={[heightStyles.scrollItem, value.minInches === inch && heightStyles.scrollItemActive]}
                      onPress={() => onChange({ ...value, minInches: inch })}
                    >
                      <Text style={[heightStyles.scrollItemText, value.minInches === inch && heightStyles.scrollItemTextActive]}>{inch}"</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <ScrollView style={heightStyles.scrollPickerFull} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {cmOptions.map((cm) => (
                  <TouchableOpacity
                    key={cm}
                    style={[heightStyles.scrollItem, value.minCm === cm && heightStyles.scrollItemActive]}
                    onPress={() => onChange({ ...value, minCm: cm })}
                  >
                    <Text style={[heightStyles.scrollItemText, value.minCm === cm && heightStyles.scrollItemTextActive]}>{cm} cm</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>

        {/* Max Height */}
        <View style={heightStyles.pickerColumn}>
          <Text style={heightStyles.pickerLabel}>Max Height</Text>
          <View style={heightStyles.scrollContainer}>
            {unit === 'imperial' ? (
              <View style={heightStyles.imperialRow}>
                <ScrollView style={heightStyles.scrollPicker} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {feetOptions.map((ft) => (
                    <TouchableOpacity
                      key={ft}
                      style={[heightStyles.scrollItem, value.maxFeet === ft && heightStyles.scrollItemActive]}
                      onPress={() => onChange({ ...value, maxFeet: ft })}
                    >
                      <Text style={[heightStyles.scrollItemText, value.maxFeet === ft && heightStyles.scrollItemTextActive]}>{ft}'</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <ScrollView style={heightStyles.scrollPicker} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {inchOptions.map((inch) => (
                    <TouchableOpacity
                      key={inch}
                      style={[heightStyles.scrollItem, value.maxInches === inch && heightStyles.scrollItemActive]}
                      onPress={() => onChange({ ...value, maxInches: inch })}
                    >
                      <Text style={[heightStyles.scrollItemText, value.maxInches === inch && heightStyles.scrollItemTextActive]}>{inch}"</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <ScrollView style={heightStyles.scrollPickerFull} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {cmOptions.map((cm) => (
                  <TouchableOpacity
                    key={cm}
                    style={[heightStyles.scrollItem, value.maxCm === cm && heightStyles.scrollItemActive]}
                    onPress={() => onChange({ ...value, maxCm: cm })}
                  >
                    <Text style={[heightStyles.scrollItemText, value.maxCm === cm && heightStyles.scrollItemTextActive]}>{cm} cm</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
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
  selectionDisplay: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.bgInput, padding: SPACING.m, borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
  },
  selectionItem: { alignItems: 'center' },
  selectionLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 2 },
  selectionValue: { fontSize: 20, fontWeight: 'bold', color: COLORS.gold },
  selectionSeparator: { fontSize: 24, color: COLORS.textMuted, marginHorizontal: SPACING.l },
  pickersContainer: { flexDirection: 'row', gap: SPACING.m },
  pickerColumn: { flex: 1 },
  pickerLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: SPACING.s, textAlign: 'center' },
  scrollContainer: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.m,
    borderWidth: 1, borderColor: COLORS.border, height: 140, overflow: 'hidden',
  },
  imperialRow: { flexDirection: 'row', flex: 1 },
  scrollPicker: { flex: 1 },
  scrollPickerFull: { flex: 1 },
  scrollItem: {
    height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: BORDER_RADIUS.s, marginVertical: 2, marginHorizontal: 4,
  },
  scrollItemActive: { backgroundColor: COLORS.primary },
  scrollItemText: { fontSize: 14, color: COLORS.textSecondary },
  scrollItemTextActive: { color: COLORS.white, fontWeight: '600' },
});

const sliderStyles = StyleSheet.create({
  container: { marginTop: SPACING.s },
  label: { fontSize: 16, color: COLORS.gold, fontWeight: '600', marginBottom: SPACING.m },
  trackContainer: { height: 40, justifyContent: 'center', position: 'relative' },
  track: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, position: 'absolute', left: 0, right: 0 },
  fill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3, position: 'absolute', left: 0 },
  rangeFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3, position: 'absolute' },
  thumbContainer: { position: 'absolute', marginLeft: -12, top: 8 },
  thumb: { 
    width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, 
    borderWidth: 3, borderColor: COLORS.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
    elevation: 4,
  },
  thumbActive: { transform: [{ scale: 1.2 }] },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.s },
  minLabel: { fontSize: 12, color: COLORS.textMuted },
  maxLabel: { fontSize: 12, color: COLORS.textMuted },
});

// Info Tooltip Modal
function InfoTooltip({ visible, onClose, title, description }: {
  visible: boolean; onClose: () => void; title: string; description: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={infoStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={infoStyles.container}>
          <View style={infoStyles.header}>
            <Ionicons name="information-circle" size={24} color={COLORS.gold} />
            <Text style={infoStyles.title}>{title}</Text>
          </View>
          <Text style={infoStyles.description}>{description}</Text>
          <TouchableOpacity style={infoStyles.closeBtn} onPress={onClose}>
            <Text style={infoStyles.closeBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const infoStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: SPACING.l },
  container: { backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l, padding: SPACING.l, width: '100%', maxWidth: 320 },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s, marginBottom: SPACING.m },
  title: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  description: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22, marginBottom: SPACING.l },
  closeBtn: { backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: BORDER_RADIUS.full, alignItems: 'center' },
  closeBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.white },
});

function FilterSectionView({
  title, section, onUpdate, options,
}: {
  title: string;
  section: FilterSection;
  onUpdate: (s: FilterSection) => void;
  options: string[];
}) {
  const [showExclusiveInfo, setShowExclusiveInfo] = useState(false);
  const [showExpandInfo, setShowExpandInfo] = useState(false);

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
          <TouchableOpacity 
            onPress={() => setShowExclusiveInfo(true)} 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="information-circle-outline" size={18} color={COLORS.gold} />
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
          <TouchableOpacity 
            onPress={() => setShowExpandInfo(true)} 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="information-circle-outline" size={18} color={COLORS.gold} />
          </TouchableOpacity>
        </TouchableOpacity>
      </View>

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
  checkboxRow: { flexDirection: 'row', gap: SPACING.l, marginBottom: SPACING.m, flexWrap: 'wrap' },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkBox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkLabel: { fontSize: 13, color: COLORS.textSecondary },
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
    <SafeAreaView style={styles.container} testID="filters-screen">
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <Ionicons name="options-outline" size={24} color={COLORS.gold} />
          <Text style={styles.headerTitle}>Preferences & Filters</Text>
        </View>
        <Text style={styles.optionalLabel}>(Optional)</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Let's Start Button - Below Header */}
        <TouchableOpacity
          style={styles.startBtnTop}
          onPress={handleStart}
          testID="filters-start-btn-top"
          activeOpacity={0.8}
        >
          <Ionicons name="film-outline" size={20} color={COLORS.white} />
          <Text style={styles.startBtnTopText}>{buttonText}</Text>
          <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
        </TouchableOpacity>

        <Text style={styles.intro}>
          Set your preferences to find the perfect movie companions. These are all optional and can be changed later.
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
              <TouchableOpacity onPress={() => setShowExclusiveInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              </TouchableOpacity>
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
              <TouchableOpacity onPress={() => setShowExclusiveInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              </TouchableOpacity>
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
              <TouchableOpacity onPress={() => setShowExclusiveInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
              </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.l, paddingVertical: SPACING.m,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  optionalLabel: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.l, paddingBottom: SPACING.xxl },
  startBtnTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.s,
    backgroundColor: COLORS.primary, paddingVertical: 14,
    borderRadius: BORDER_RADIUS.full, marginBottom: SPACING.l,
  },
  startBtnTopText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
  intro: { fontSize: 15, color: COLORS.textSecondary, marginBottom: SPACING.l, lineHeight: 22 },
  startBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.s,
    marginTop: SPACING.m,
  },
  startBtnText: { fontSize: 18, fontWeight: 'bold', color: COLORS.white, letterSpacing: 1 },
});
