import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal,
  ScrollView, Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { ProfileData } from '../types';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const GENDERS = ['Man', 'Woman', 'Non-binary', 'Prefer not to say', 'Other'];
const GENDER_IDENTITIES = ['Bisexual', 'Gay', 'Lesbian', 'Pansexual', 'Asexual', 'Queer', 'Questioning', 'Prefer not to say'];

// Generate arrays for date picker
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = [
  { value: 1, label: 'Jan', full: 'January' }, { value: 2, label: 'Feb', full: 'February' }, 
  { value: 3, label: 'Mar', full: 'March' }, { value: 4, label: 'Apr', full: 'April' }, 
  { value: 5, label: 'May', full: 'May' }, { value: 6, label: 'Jun', full: 'June' },
  { value: 7, label: 'Jul', full: 'July' }, { value: 8, label: 'Aug', full: 'August' }, 
  { value: 9, label: 'Sep', full: 'September' }, { value: 10, label: 'Oct', full: 'October' }, 
  { value: 11, label: 'Nov', full: 'November' }, { value: 12, label: 'Dec', full: 'December' },
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 82 }, (_, i) => currentYear - 18 - i); // 18 to 100 years ago

// Check if a year is a leap year
const isLeapYear = (year: number): boolean => {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
};

// Get max days in a month
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

export default function BasicInfoStep({ data, onUpdate, onNext }: Props) {
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showIdentityPicker, setShowIdentityPicker] = useState(false);
  const [underAge, setUnderAge] = useState(false);
  const [calculatedAge, setCalculatedAge] = useState(data.age || 0);
  const [dateError, setDateError] = useState('');
  const [locationSearch, setLocationSearch] = useState(data.location || '');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [gettingCurrentLoc, setGettingCurrentLoc] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(!!data.age && data.age >= 18);

  const showsGenderIdentity = data.gender === 'Non-binary' || data.gender === 'Other';

  // Selected DOB values - initialize from data if available
  const [selectedDay, setSelectedDay] = useState(
    data.dobDay ? parseInt(data.dobDay) : 15
  );
  const [selectedMonth, setSelectedMonth] = useState(
    data.dobMonth ? parseInt(data.dobMonth) : 6
  );
  const [selectedYear, setSelectedYear] = useState(
    data.dobYear ? parseInt(data.dobYear) : currentYear - 25
  );

  // Refs for scroll views
  const dayScrollRef = useRef<ScrollView>(null);
  const monthScrollRef = useRef<ScrollView>(null);
  const yearScrollRef = useRef<ScrollView>(null);

  // Scroll to selected items on mount
  useEffect(() => {
    const itemHeight = 44;
    setTimeout(() => {
      dayScrollRef.current?.scrollTo({ y: (selectedDay - 1) * itemHeight - 50, animated: false });
      monthScrollRef.current?.scrollTo({ y: (selectedMonth - 1) * itemHeight - 50, animated: false });
      const yearIndex = YEARS.indexOf(selectedYear);
      if (yearIndex >= 0) {
        yearScrollRef.current?.scrollTo({ y: yearIndex * itemHeight - 50, animated: false });
      }
    }, 100);
  }, []);

  // Re-validate on mount if we have existing data (for back navigation)
  useEffect(() => {
    if (data.dobDay && data.dobMonth && data.dobYear) {
      const day = parseInt(data.dobDay);
      const month = parseInt(data.dobMonth);
      const year = parseInt(data.dobYear);
      validateAndSetDate(day, month, year, false);
    }
  }, []);

  // Validate date and calculate age
  const validateAndSetDate = useCallback((day: number, month: number, year: number, updateData: boolean = true) => {
    const maxDays = getMaxDays(month, year);
    
    // Auto-adjust day if it exceeds max days for the month
    let adjustedDay = day;
    if (day > maxDays) {
      adjustedDay = maxDays;
      setSelectedDay(adjustedDay);
    }
    
    // Clear any previous error - no red highlight after correction
    setDateError('');
    
    // Calculate age
    const today = new Date();
    const birthDate = new Date(year, month - 1, adjustedDay);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
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

  const handleDayChange = (day: number) => {
    setSelectedDay(day);
    validateAndSetDate(day, selectedMonth, selectedYear);
  };

  const handleMonthChange = (month: number) => {
    setSelectedMonth(month);
    // Auto-adjust day if needed for the new month
    const maxDays = getMaxDays(month, selectedYear);
    const adjustedDay = Math.min(selectedDay, maxDays);
    if (adjustedDay !== selectedDay) {
      setSelectedDay(adjustedDay);
    }
    validateAndSetDate(adjustedDay, month, selectedYear);
  };

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    // Auto-adjust day if needed (for Feb 29)
    const maxDays = getMaxDays(selectedMonth, year);
    const adjustedDay = Math.min(selectedDay, maxDays);
    if (adjustedDay !== selectedDay) {
      setSelectedDay(adjustedDay);
    }
    validateAndSetDate(adjustedDay, selectedMonth, year);
  };

  const searchLocation = useCallback(async (text: string) => {
    setLocationSearch(text);
    if (text.length < 2) { setPredictions([]); return; }
    setSearchingLocation(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/places/autocomplete?input=${encodeURIComponent(text)}`);
      const result = await resp.json();
      setPredictions(result.predictions || []);
    } catch (e) {
      console.error('Location search error:', e);
    } finally {
      setSearchingLocation(false);
    }
  }, []);

  const selectLocation = (description: string) => {
    onUpdate('location', description);
    setLocationSearch(description);
    setPredictions([]);
  };

  const getCurrentLocation = async () => {
    setGettingCurrentLoc(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Enable location services to use this feature.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const resp = await fetch(
        `${BACKEND_URL}/api/places/geocode?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`
      );
      const result = await resp.json();
      if (result.location) {
        onUpdate('location', result.formatted_address || result.location);
        setLocationSearch(result.formatted_address || result.location);
      }
    } catch (e) {
      console.error('Current location error:', e);
      Alert.alert('Error', 'Could not get your location.');
    } finally {
      setGettingCurrentLoc(false);
    }
  };

  const isValid = data.name.trim().length > 0 && data.gender && ageConfirmed && !underAge && data.location;

  if (underAge) {
    return (
      <View style={styles.centerContent}>
        <Ionicons name="sad-outline" size={64} color={COLORS.primary} />
        <Text style={styles.underAgeTitle}>Sorry!</Text>
        <Text style={styles.underAgeText}>
          You must be over 18 to use Film Companion.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Tell us about yourself</Text>
        <Text style={styles.subtitle}>Let's start with the basics</Text>

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
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setShowGenderPicker(true)}
          testID="basic-gender-dropdown"
        >
          <Text style={[styles.dropdownText, !data.gender && styles.placeholder]}>
            {data.gender || 'Select your gender'}
          </Text>
          <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* Gender Identity for Non-binary/Other */}
        {showsGenderIdentity && (
          <>
            <Text style={styles.label}>Gender Identity (Optional)</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => setShowIdentityPicker(true)}
              testID="basic-identity-dropdown"
            >
              <Text style={[styles.dropdownText, !(data as any).genderIdentity && styles.placeholder]}>
                {(data as any).genderIdentity || 'Select your identity'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.label}>Date of Birth *</Text>
        <View style={styles.dobContainer}>
          <View style={styles.dobScrollRow}>
            {/* Day Picker */}
            <View style={styles.dobColumn}>
              <Text style={styles.dobLabel}>Day</Text>
              <ScrollView 
                ref={dayScrollRef}
                style={styles.dobScroll} 
                showsVerticalScrollIndicator={false} 
                nestedScrollEnabled
              >
                {DAYS.map(d => {
                  const maxDays = getMaxDays(selectedMonth, selectedYear);
                  const isDisabled = d > maxDays;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.dobItem, 
                        selectedDay === d && styles.dobItemSelected,
                        isDisabled && styles.dobItemDisabled
                      ]}
                      onPress={() => !isDisabled && handleDayChange(d)}
                      disabled={isDisabled}
                    >
                      <Text style={[
                        styles.dobItemText, 
                        selectedDay === d && styles.dobItemTextSelected,
                        isDisabled && styles.dobItemTextDisabled
                      ]}>
                        {String(d).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Month Picker */}
            <View style={[styles.dobColumn, styles.dobColumnWide]}>
              <Text style={styles.dobLabel}>Month</Text>
              <ScrollView 
                ref={monthScrollRef}
                style={styles.dobScroll} 
                showsVerticalScrollIndicator={false} 
                nestedScrollEnabled
              >
                {MONTHS.map(m => (
                  <TouchableOpacity
                    key={m.value}
                    style={[styles.dobItem, selectedMonth === m.value && styles.dobItemSelected]}
                    onPress={() => handleMonthChange(m.value)}
                  >
                    <Text style={[styles.dobItemText, selectedMonth === m.value && styles.dobItemTextSelected]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Year Picker */}
            <View style={styles.dobColumn}>
              <Text style={styles.dobLabel}>Year</Text>
              <ScrollView 
                ref={yearScrollRef}
                style={styles.dobScroll} 
                showsVerticalScrollIndicator={false} 
                nestedScrollEnabled
              >
                {YEARS.map(y => (
                  <TouchableOpacity
                    key={y}
                    style={[styles.dobItem, selectedYear === y && styles.dobItemSelected]}
                    onPress={() => handleYearChange(y)}
                  >
                    <Text style={[styles.dobItemText, selectedYear === y && styles.dobItemTextSelected]}>
                      {y}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Selected date display */}
          <View style={styles.selectedDateDisplay}>
            <Text style={styles.selectedDateText}>
              {String(selectedDay).padStart(2, '0')} {MONTHS[selectedMonth - 1]?.full} {selectedYear}
            </Text>
          </View>
        </View>

        {ageConfirmed && (
          <View style={styles.ageConfirmedBadge}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={styles.ageConfirmedText}>Age verified: {calculatedAge} years old</Text>
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

        {predictions.length > 0 && (
          <View style={styles.predictionsContainer}>
            {predictions.map((p: any, i: number) => (
              <TouchableOpacity
                key={i}
                style={styles.predictionItem}
                onPress={() => selectLocation(p.description)}
                testID={`location-prediction-${i}`}
              >
                <Ionicons name="location-outline" size={18} color={COLORS.textSecondary} />
                <Text style={styles.predictionText}>{p.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.currentLocBtn}
          onPress={getCurrentLocation}
          disabled={gettingCurrentLoc}
          testID="current-location-btn"
        >
          {gettingCurrentLoc ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="navigate-outline" size={20} color={COLORS.primary} />
          )}
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

      {/* Gender Picker Modal */}
      <Modal visible={showGenderPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowGenderPicker(false)}>
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>Select Gender</Text>
            {GENDERS.map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.pickerItem, data.gender === g && styles.pickerItemActive]}
                onPress={() => { onUpdate('gender', g); setShowGenderPicker(false); }}
                testID={`gender-${g.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Text style={[styles.pickerItemText, data.gender === g && styles.pickerItemTextActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Gender Identity Picker Modal */}
      <Modal visible={showIdentityPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowIdentityPicker(false)}>
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>Select Identity</Text>
            <ScrollView style={styles.pickerScroll}>
              {GENDER_IDENTITIES.map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.pickerItem, (data as any).genderIdentity === g && styles.pickerItemActive]}
                  onPress={() => { onUpdate('genderIdentity', g); setShowIdentityPicker(false); }}
                  testID={`identity-${g.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Text style={[styles.pickerItemText, (data as any).genderIdentity === g && styles.pickerItemTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
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
    backgroundColor: COLORS.bgInput, borderRadius: BORDER_RADIUS.m, paddingHorizontal: SPACING.m,
    paddingVertical: 14, color: COLORS.text, fontSize: 16,
  },
  charCount: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 4 },
  dropdown: {
    backgroundColor: COLORS.bgInput, borderRadius: BORDER_RADIUS.m, paddingHorizontal: SPACING.m,
    paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dropdownText: { fontSize: 16, color: COLORS.text },
  placeholder: { color: COLORS.textMuted },
  // DOB embedded scroll styles
  dobContainer: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l, padding: SPACING.m,
    borderWidth: 1, borderColor: COLORS.border,
  },
  dobScrollRow: { flexDirection: 'row', gap: SPACING.s },
  dobColumn: { flex: 1 },
  dobColumnWide: { flex: 1.3 },
  dobLabel: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.xs, fontWeight: '600' },
  dobScroll: { height: 160 },
  dobItem: {
    height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BORDER_RADIUS.s, marginVertical: 2,
  },
  dobItemSelected: { backgroundColor: COLORS.primary },
  dobItemDisabled: { opacity: 0.3 },
  dobItemText: { fontSize: 16, color: COLORS.textSecondary },
  dobItemTextSelected: { color: COLORS.white, fontWeight: '600' },
  dobItemTextDisabled: { color: COLORS.textMuted },
  selectedDateDisplay: {
    marginTop: SPACING.m, paddingTop: SPACING.m, borderTopWidth: 1, borderTopColor: COLORS.border,
    alignItems: 'center',
  },
  selectedDateText: { fontSize: 18, fontWeight: 'bold', color: COLORS.gold },
  ageConfirmedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.s, marginTop: SPACING.m,
    backgroundColor: 'rgba(76,175,80,0.1)', padding: SPACING.m, borderRadius: BORDER_RADIUS.m,
  },
  ageConfirmedText: { fontSize: 14, color: COLORS.success, fontWeight: '500' },
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
  currentLocBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.s,
    paddingVertical: SPACING.m, marginTop: SPACING.s,
  },
  currentLocText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
  continueBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: BORDER_RADIUS.full,
    alignItems: 'center', marginTop: SPACING.xl,
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white, letterSpacing: 1 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center',
    alignItems: 'center', padding: SPACING.l,
  },
  pickerContent: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l, padding: SPACING.l,
    width: '100%', maxWidth: 340, maxHeight: '70%',
  },
  pickerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.m, textAlign: 'center' },
  pickerScroll: { maxHeight: 350 },
  pickerItem: {
    paddingVertical: 14, paddingHorizontal: SPACING.m, borderRadius: BORDER_RADIUS.m, marginBottom: SPACING.xs,
  },
  pickerItemActive: { backgroundColor: 'rgba(229,9,20,0.15)' },
  pickerItemText: { fontSize: 16, color: COLORS.textSecondary },
  pickerItemTextActive: { color: COLORS.primary, fontWeight: '600' },
  underAgeTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.text, marginTop: SPACING.l },
  underAgeText: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.m, lineHeight: 24 },
});
