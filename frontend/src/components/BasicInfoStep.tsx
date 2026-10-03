import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
// RN's own KeyboardAvoidingView breaks in APK builds with edgeToEdgeEnabled —
// the keyboard-controller one reads native WindowInsets.
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { ProfileData } from '../types';
import { apiUrl } from '../store';
import { GENDERS } from './profile/constants';
import { formatLocationForPrivacy } from '../utils/locationFormatter';

// Places autocomplete is billed per request — wait for a typing pause.
const LOCATION_SEARCH_DEBOUNCE_MS = 350;
// Distance from the top of the screen to this step (onboarding header +
// progress bar + status bar) so the keyboard padding lines up.
const KEYBOARD_OFFSET = 100;

const GENDER_IDENTITIES = ['Bisexual', 'Gay', 'Lesbian', 'Pansexual', 'Asexual', 'Queer', 'Questioning', 'Prefer not to say'];

// Generate arrays for date picker
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = [
  { value: 1, label: 'Jan' }, { value: 2, label: 'Feb' }, 
  { value: 3, label: 'Mar' }, { value: 4, label: 'Apr' }, 
  { value: 5, label: 'May' }, { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' }, { value: 8, label: 'Aug' }, 
  { value: 9, label: 'Sep' }, { value: 10, label: 'Oct' }, 
  { value: 11, label: 'Nov' }, { value: 12, label: 'Dec' },
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 82 }, (_, i) => currentYear - 18 - i);

const isLeapYear = (year: number): boolean => {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
};

const getMaxDays = (month: number, year: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
};

type Props = {
  data: ProfileData;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
};

// Minimalistic Wheel Picker Item
const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 3;

export default function BasicInfoStep({ data, onUpdate, onNext }: Props) {
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showIdentityPicker, setShowIdentityPicker] = useState(false);
  const [underAge, setUnderAge] = useState(false);
  const [calculatedAge, setCalculatedAge] = useState(data.age || 0);
  // Format location for display (privacy-safe format)
  const [locationSearch, setLocationSearch] = useState(
    data.location ? formatLocationForPrivacy(data.location) : ''
  );
  const [predictions, setPredictions] = useState<any[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [gettingCurrentLoc, setGettingCurrentLoc] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(!!data.age && data.age >= 18);

  const showsGenderIdentity = data.gender === 'Non-binary' || data.gender === 'Other';
  // Not (yet) on ProfileData — read it defensively.
  const rawIdentity = (data as any).genderIdentity;
  const genderIdentity: string = typeof rawIdentity === 'string' ? rawIdentity : '';

  const [selectedDay, setSelectedDay] = useState(data.dobDay ? parseInt(data.dobDay) : 15);
  const [selectedMonth, setSelectedMonth] = useState(data.dobMonth ? parseInt(data.dobMonth) : 6);
  const [selectedYear, setSelectedYear] = useState(data.dobYear ? parseInt(data.dobYear) : currentYear - 25);

  const dayScrollRef = useRef<ScrollView>(null);
  const monthScrollRef = useRef<ScrollView>(null);
  const yearScrollRef = useRef<ScrollView>(null);

  // Location search: pending debounce timer + a sequence number so only the
  // response to the LATEST query is applied (slow responses can't overwrite
  // newer ones, and nothing is applied after unmount).
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      searchSeqRef.current += 1;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Scroll the wheels to the selected date on mount — and again after the
  // under-age screen hands back to the (re-mounted) form.
  useEffect(() => {
    if (underAge) return;
    const timer = setTimeout(() => {
      const dayIndex = selectedDay - 1;
      const monthIndex = selectedMonth - 1;
      const yearIndex = YEARS.indexOf(selectedYear);

      dayScrollRef.current?.scrollTo({ y: dayIndex * ITEM_HEIGHT, animated: false });
      monthScrollRef.current?.scrollTo({ y: monthIndex * ITEM_HEIGHT, animated: false });
      if (yearIndex >= 0) {
        yearScrollRef.current?.scrollTo({ y: yearIndex * ITEM_HEIGHT, animated: false });
      }
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underAge]);

  // Re-validate on mount for back navigation
  useEffect(() => {
    if (data.dobDay && data.dobMonth && data.dobYear) {
      validateAndSetDate(parseInt(data.dobDay), parseInt(data.dobMonth), parseInt(data.dobYear), false);
    }
  }, []);

  // Keep the ISO date of birth (YYYY-MM-DD) in step with the picked
  // day/month/year so it goes up with the rest of the step data (the server
  // derives age from it). Also covers progress restored from an older build.
  useEffect(() => {
    const d = parseInt(data.dobDay, 10);
    const m = parseInt(data.dobMonth, 10);
    const y = parseInt(data.dobYear, 10);
    if (!d || !m || !y) return;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (data.dob !== iso) onUpdate('dob', iso);
  }, [data.dobDay, data.dobMonth, data.dobYear, data.dob, onUpdate]);

  const validateAndSetDate = useCallback((day: number, month: number, year: number, updateData: boolean = true) => {
    const maxDays = getMaxDays(month, year);
    let adjustedDay = Math.min(day, maxDays);
    if (adjustedDay !== day) setSelectedDay(adjustedDay);

    const today = new Date();
    const birthDate = new Date(year, month - 1, adjustedDay);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;

    if (age >= 18 && age < 120) {
      setCalculatedAge(age);
      setAgeConfirmed(true);
      setUnderAge(false);
      if (updateData) {
        onUpdate('age', age);
        onUpdate('dobDay', String(adjustedDay).padStart(2, '0'));
        onUpdate('dobMonth', String(month).padStart(2, '0'));
        onUpdate('dobYear', String(year));
      }
      return true;
    } else if (age < 18) {
      setUnderAge(true);
      setAgeConfirmed(false);
      return false;
    }
    return false;
  }, [onUpdate]);

  const handleDayScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const maxDays = getMaxDays(selectedMonth, selectedYear);
    const day = Math.min(Math.max(1, index + 1), maxDays);
    if (day !== selectedDay) {
      setSelectedDay(day);
      validateAndSetDate(day, selectedMonth, selectedYear);
    }
  };

  const handleMonthScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const month = Math.max(1, Math.min(12, index + 1));
    if (month !== selectedMonth) {
      setSelectedMonth(month);
      const maxDays = getMaxDays(month, selectedYear);
      const adjustedDay = Math.min(selectedDay, maxDays);
      setSelectedDay(adjustedDay);
      validateAndSetDate(adjustedDay, month, selectedYear);
    }
  };

  const handleYearScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const year = YEARS[Math.max(0, Math.min(YEARS.length - 1, index))];
    if (year !== selectedYear) {
      setSelectedYear(year);
      const maxDays = getMaxDays(selectedMonth, year);
      const adjustedDay = Math.min(selectedDay, maxDays);
      setSelectedDay(adjustedDay);
      validateAndSetDate(adjustedDay, selectedMonth, year);
    }
  };

  // Cancels a pending debounce and invalidates any in-flight search.
  const cancelLocationSearch = () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = null;
    searchSeqRef.current += 1;
    setSearchingLocation(false);
  };

  const searchLocation = useCallback((text: string) => {
    setLocationSearch(text);
    setLocationError('');
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const seq = ++searchSeqRef.current;
    const query = text.trim();
    if (query.length < 2) {
      searchTimerRef.current = null;
      setPredictions([]);
      setSearchingLocation(false);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      searchTimerRef.current = null;
      setSearchingLocation(true);
      try {
        const resp = await fetch(apiUrl(`/api/places/autocomplete?input=${encodeURIComponent(query)}`));
        if (seq !== searchSeqRef.current) return; // superseded by newer input
        if (!resp.ok) {
          setPredictions([]);
          setLocationError(resp.status === 429
            ? 'Too many searches — please try again shortly.'
            : 'Location search is unavailable right now. Try "Use My Current Location".');
          return;
        }
        const result = await resp.json();
        if (seq !== searchSeqRef.current) return;
        setPredictions(Array.isArray(result?.predictions) ? result.predictions : []);
      } catch {
        if (seq === searchSeqRef.current) {
          setPredictions([]);
          setLocationError('Could not search locations. Check your connection.');
        }
      } finally {
        if (seq === searchSeqRef.current) setSearchingLocation(false);
      }
    }, LOCATION_SEARCH_DEBOUNCE_MS);
  }, []);

  const selectLocation = (description: string) => {
    cancelLocationSearch();
    // Autocomplete is city-level ("(cities)"), so the label is safe to show
    // others; keep the full text private in locationFull.
    onUpdate('location', description);
    onUpdate('locationFull', description);
    // A typed-in city has no GPS fix — drop any earlier one so distance
    // filtering never uses coordinates from a different place.
    onUpdate('coordinates', undefined);
    setLocationSearch(formatLocationForPrivacy(description));
    setPredictions([]);
    setLocationError('');
  };

  const getCurrentLocation = async () => {
    cancelLocationSearch();
    setLocationError('');
    setGettingCurrentLoc(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Enable location services.');
        return;
      }
      // Approximate (network) location is all we need for "Area, City" and
      // distance filters; the app only holds ACCESS_COARSE_LOCATION.
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const resp = await fetch(
        apiUrl(`/api/places/geocode?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`)
      );
      if (!mountedRef.current) return;
      if (!resp.ok) {
        Alert.alert(
          resp.status === 429 ? 'Please wait' : 'Error',
          resp.status === 429
            ? 'Too many location requests — please try again shortly.'
            : 'Could not get your location.'
        );
        return;
      }
      const result = await resp.json();
      if (!mountedRef.current) return;
      if (result.location) {
        const fullAddress = result.formatted_address || result.location;
        // `location` is the only location field other users ever see, so it
        // gets the privacy-safe "Area, City" label; the full street address
        // and the GPS fix stay private (locationFull / coordinates).
        const label = formatLocationForPrivacy(fullAddress) || result.location;
        onUpdate('location', label);
        onUpdate('locationFull', fullAddress);
        onUpdate('coordinates', { lat: loc.coords.latitude, lng: loc.coords.longitude });
        setLocationSearch(label);
        setPredictions([]);
      }
    } catch {
      if (mountedRef.current) Alert.alert('Error', 'Could not get your location.');
    } finally {
      if (mountedRef.current) setGettingCurrentLoc(false);
    }
  };

  const isValid = data.name.trim().length > 0 && data.gender && ageConfirmed && !underAge && data.location;

  if (underAge) {
    return (
      <View style={styles.centerContent}>
        <Ionicons name="sad-outline" size={64} color={COLORS.primary} />
        <Text style={styles.underAgeTitle}>Age Verification Failed</Text>
        <Text style={styles.underAgeText}>You must be at least 18 years old to use filmydating.</Text>
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={() => {
            setUnderAge(false);
            setAgeConfirmed(false);
            // Reset to a valid adult year
            const currentYear = new Date().getFullYear();
            setSelectedYear(currentYear - 25);
            setSelectedMonth(1);
            setSelectedDay(1);
          }}
        >
          <Ionicons name="arrow-back" size={20} color={COLORS.white} />
          <Text style={styles.retryButtonText}>Go Back & Edit Date of Birth</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const maxDays = getMaxDays(selectedMonth, selectedYear);

  return (
    <>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={KEYBOARD_OFFSET}
      >
        <ScrollView 
          style={styles.flex} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Tell us about yourself</Text>
          <Text style={styles.subtitle}>Let&apos;s start with the basics</Text>

          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Your full name"
            placeholderTextColor={COLORS.textMuted}
            value={data.name}
            onChangeText={(t) => onUpdate('name', t.slice(0, 50))}
            maxLength={50}
            testID="basic-name-input"
          />
          <Text style={styles.charCount}>{data.name.length}/50</Text>

          <Text style={styles.label}>Gender *</Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowGenderPicker(true)} testID="basic-gender-dropdown">
            <Text style={[styles.dropdownText, !data.gender && styles.placeholder]}>
              {data.gender || 'Select your gender'}
            </Text>
          <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        {showsGenderIdentity && (
          <>
            <Text style={styles.label}>Gender Identity (Optional)</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => setShowIdentityPicker(true)} testID="basic-identity-dropdown">
              <Text style={[styles.dropdownText, !genderIdentity && styles.placeholder]}>
                {genderIdentity || 'Select your identity'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.label}>Date of Birth *</Text>
        
        {/* Minimalistic Wheel Picker */}
        <View style={styles.wheelContainer}>
          <View style={styles.wheelRow}>
            {/* Day Wheel */}
            <View style={styles.wheelColumn}>
              <Text style={styles.wheelLabel}>Day</Text>
              <View style={styles.wheelWrapper}>
                <View style={styles.wheelHighlight} />
                <ScrollView
                  ref={dayScrollRef}
                  style={styles.wheelScroll}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={ITEM_HEIGHT}
                  decelerationRate="fast"
                  onMomentumScrollEnd={handleDayScroll}
                  contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                  nestedScrollEnabled
                >
                  {DAYS.slice(0, maxDays).map(d => (
                    <TouchableOpacity 
                      key={d} 
                      style={styles.wheelItem}
                      onPress={() => {
                        setSelectedDay(d);
                        dayScrollRef.current?.scrollTo({ y: (d - 1) * ITEM_HEIGHT, animated: true });
                        validateAndSetDate(d, selectedMonth, selectedYear);
                      }}
                    >
                      <Text style={[styles.wheelItemText, selectedDay === d && styles.wheelItemTextActive]}>
                        {String(d).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Month Wheel */}
            <View style={[styles.wheelColumn, styles.wheelColumnWide]}>
              <Text style={styles.wheelLabel}>Month</Text>
              <View style={styles.wheelWrapper}>
                <View style={styles.wheelHighlight} />
                <ScrollView
                  ref={monthScrollRef}
                  style={styles.wheelScroll}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={ITEM_HEIGHT}
                  decelerationRate="fast"
                  onMomentumScrollEnd={handleMonthScroll}
                  contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                  nestedScrollEnabled
                >
                  {MONTHS.map(m => (
                    <TouchableOpacity 
                      key={m.value} 
                      style={styles.wheelItem}
                      onPress={() => {
                        setSelectedMonth(m.value);
                        monthScrollRef.current?.scrollTo({ y: (m.value - 1) * ITEM_HEIGHT, animated: true });
                        const maxDays = getMaxDays(m.value, selectedYear);
                        const adjustedDay = Math.min(selectedDay, maxDays);
                        setSelectedDay(adjustedDay);
                        validateAndSetDate(adjustedDay, m.value, selectedYear);
                      }}
                    >
                      <Text style={[styles.wheelItemText, selectedMonth === m.value && styles.wheelItemTextActive]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Year Wheel */}
            <View style={styles.wheelColumn}>
              <Text style={styles.wheelLabel}>Year</Text>
              <View style={styles.wheelWrapper}>
                <View style={styles.wheelHighlight} />
                <ScrollView
                  ref={yearScrollRef}
                  style={styles.wheelScroll}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={ITEM_HEIGHT}
                  decelerationRate="fast"
                  onMomentumScrollEnd={handleYearScroll}
                  contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                  nestedScrollEnabled
                >
                  {YEARS.map((y, idx) => (
                    <TouchableOpacity 
                      key={y} 
                      style={styles.wheelItem}
                      onPress={() => {
                        setSelectedYear(y);
                        yearScrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
                        const maxDays = getMaxDays(selectedMonth, y);
                        const adjustedDay = Math.min(selectedDay, maxDays);
                        setSelectedDay(adjustedDay);
                        validateAndSetDate(adjustedDay, selectedMonth, y);
                      }}
                    >
                      <Text style={[styles.wheelItemText, selectedYear === y && styles.wheelItemTextActive]}>
                        {y}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>

        {/* Age Verified Badge - Always visible when valid */}
        {ageConfirmed && (
          <View style={styles.ageConfirmedBadge}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            <Text style={styles.ageConfirmedText}>Age: {calculatedAge} years</Text>
          </View>
        )}

        <Text style={styles.label}>Location *</Text>
        <TextInput
          style={styles.input}
          placeholder="Search your city"
          placeholderTextColor={COLORS.textMuted}
          value={locationSearch}
          onChangeText={searchLocation}
          testID="basic-location-input"
        />
        {searchingLocation && <ActivityIndicator size="small" color={COLORS.primary} style={styles.loadingIndicator} />}
        {!!locationError && <Text style={styles.searchError}>{locationError}</Text>}

        {predictions.length > 0 && (
          <View style={styles.predictionsContainer}>
            {predictions.map((p: any, i: number) => (
              <TouchableOpacity key={i} style={styles.predictionItem} onPress={() => selectLocation(p.description)} testID={`location-prediction-${i}`}>
                <Ionicons name="location-outline" size={18} color={COLORS.textSecondary} />
                <Text style={styles.predictionText}>{p.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.currentLocBtn} onPress={getCurrentLocation} disabled={gettingCurrentLoc} testID="current-location-btn">
          {gettingCurrentLoc ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="navigate-outline" size={20} color={COLORS.primary} />}
          <Text style={styles.currentLocText}>Use My Current Location</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.continueBtn, !isValid && styles.continueBtnDisabled]}
          onPress={onNext}
          disabled={!isValid}
          testID="basic-info-continue"
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Gender Picker Modal */}
      <Modal
        visible={showGenderPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGenderPicker(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowGenderPicker(false)}>
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>Select Gender</Text>
            {GENDERS.map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.pickerItem, data.gender === g && styles.pickerItemActive]}
                onPress={() => {
                  onUpdate('gender', g);
                  // Gender identity only applies to Non-binary / Other — don't
                  // keep sending a hidden stale value.
                  if (g !== 'Non-binary' && g !== 'Other' && genderIdentity) onUpdate('genderIdentity', '');
                  setShowGenderPicker(false);
                }}
                testID={`gender-${g.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Text style={[styles.pickerItemText, data.gender === g && styles.pickerItemTextActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Gender Identity Picker Modal */}
      <Modal
        visible={showIdentityPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIdentityPicker(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowIdentityPicker(false)}>
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>Select Identity</Text>
            <ScrollView style={styles.pickerScroll}>
              {GENDER_IDENTITIES.map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.pickerItem, genderIdentity === g && styles.pickerItemActive]}
                  onPress={() => { onUpdate('genderIdentity', g); setShowIdentityPicker(false); }}
                  testID={`identity-${g.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Text style={[styles.pickerItemText, genderIdentity === g && styles.pickerItemTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xxl },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  title: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.s },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, marginBottom: SPACING.l },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.s, marginTop: SPACING.m },
  input: {
    backgroundColor: COLORS.bgInput, 
    borderRadius: BORDER_RADIUS.m, 
    paddingHorizontal: SPACING.m,
    paddingVertical: 14, 
    color: COLORS.text, 
    fontSize: 16,
    textAlign: 'left',
    textAlignVertical: 'center',
    letterSpacing: 0,
  },
  charCount: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 4 },
  dropdown: {
    backgroundColor: COLORS.bgInput, borderRadius: BORDER_RADIUS.m, paddingHorizontal: SPACING.m,
    paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dropdownText: { fontSize: 16, color: COLORS.text },
  placeholder: { color: COLORS.textMuted },
  // Minimalistic Wheel Picker
  wheelContainer: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l, overflow: 'hidden',
  },
  wheelRow: { flexDirection: 'row' },
  wheelColumn: { flex: 1, alignItems: 'center' },
  wheelColumnWide: { flex: 1.2 },
  wheelLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: SPACING.s, marginBottom: SPACING.xs, fontWeight: '600', letterSpacing: 0.5 },
  wheelWrapper: { height: ITEM_HEIGHT * VISIBLE_ITEMS, position: 'relative', width: '100%' },
  wheelHighlight: {
    position: 'absolute', top: ITEM_HEIGHT, left: 4, right: 4, height: ITEM_HEIGHT,
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.s, opacity: 0.15,
  },
  wheelScroll: { height: ITEM_HEIGHT * VISIBLE_ITEMS },
  wheelItem: { height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  wheelItemText: { fontSize: 18, color: COLORS.textMuted, fontWeight: '500' },
  wheelItemTextActive: { color: COLORS.text, fontWeight: '700', fontSize: 20 },
  ageConfirmedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.s, marginTop: SPACING.m,
    backgroundColor: 'rgba(76,175,80,0.12)', paddingVertical: 10, paddingHorizontal: SPACING.m, borderRadius: BORDER_RADIUS.m,
  },
  ageConfirmedText: { fontSize: 15, color: COLORS.success, fontWeight: '600' },
  predictionsContainer: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.m, marginTop: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.border,
  },
  predictionItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.s,
    padding: SPACING.m, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  predictionText: { fontSize: 14, color: COLORS.text, flex: 1 },
  loadingIndicator: { marginTop: SPACING.s },
  searchError: { fontSize: 13, color: COLORS.textMuted, marginTop: SPACING.xs },
  currentLocBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.s, paddingVertical: SPACING.m, marginTop: SPACING.s,
  },
  currentLocText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
  continueBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: BORDER_RADIUS.full,
    alignItems: 'center', marginTop: SPACING.xl,
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white, letterSpacing: 1 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: SPACING.l,
  },
  pickerContent: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l, padding: SPACING.l,
    width: '100%', maxWidth: 340, maxHeight: '70%',
  },
  pickerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.m, textAlign: 'center' },
  pickerScroll: { maxHeight: 350 },
  pickerItem: { paddingVertical: 14, paddingHorizontal: SPACING.m, borderRadius: BORDER_RADIUS.m, marginBottom: SPACING.xs },
  pickerItemActive: { backgroundColor: 'rgba(229,9,20,0.15)' },
  pickerItemText: { fontSize: 16, color: COLORS.textSecondary },
  pickerItemTextActive: { color: COLORS.primary, fontWeight: '600' },
  underAgeTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.text, marginTop: SPACING.l },
  underAgeText: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.m, lineHeight: 24 },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.xl,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
});
