import React, { useState, useCallback } from 'react';
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
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => currentYear - 18 - i); // Start from 18 years ago

type Props = {
  data: ProfileData;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
};

export default function BasicInfoStep({ data, onUpdate, onNext }: Props) {
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showIdentityPicker, setShowIdentityPicker] = useState(false);
  const [showDOBPicker, setShowDOBPicker] = useState(false);
  const [dobPickerType, setDobPickerType] = useState<'day' | 'month' | 'year'>('day');
  const [showAgeConfirm, setShowAgeConfirm] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [underAge, setUnderAge] = useState(false);
  const [calculatedAge, setCalculatedAge] = useState(0);
  const [locationSearch, setLocationSearch] = useState('');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [gettingCurrentLoc, setGettingCurrentLoc] = useState(false);

  const showsGenderIdentity = data.gender === 'Non-binary' || data.gender === 'Other';

  const calculateAge = useCallback(() => {
    const d = parseInt(data.dobDay);
    const m = parseInt(data.dobMonth);
    const y = parseInt(data.dobYear);
    if (!d || !m || !y || d > 31 || m > 12 || y < 1900) return 0;
    const today = new Date();
    const birthDate = new Date(y, m - 1, d);
    
    // Validate the date
    if (birthDate.getDate() !== d || birthDate.getMonth() !== m - 1) {
      return 0; // Invalid date (e.g., Feb 30)
    }
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age > 0 && age < 150 ? age : 0;
  }, [data.dobDay, data.dobMonth, data.dobYear]);

  // Auto-trigger age confirmation when DOB is complete
  const checkAndShowAgeConfirm = useCallback(() => {
    if (data.dobDay && data.dobMonth && data.dobYear && !ageConfirmed) {
      const age = calculateAge();
      if (age > 0) {
        setCalculatedAge(age);
        setShowAgeConfirm(true);
      }
    }
  }, [data.dobDay, data.dobMonth, data.dobYear, ageConfirmed, calculateAge]);

  const handleAgeConfirm = (confirmed: boolean) => {
    setShowAgeConfirm(false);
    if (confirmed) {
      if (calculatedAge < 18) {
        setUnderAge(true);
      } else {
        setAgeConfirmed(true);
        onUpdate('age', calculatedAge);
      }
    } else {
      // Reset DOB fields when user says "No"
      onUpdate('dobDay', '');
      onUpdate('dobMonth', '');
      onUpdate('dobYear', '');
    }
  };

  const openDOBPicker = (type: 'day' | 'month' | 'year') => {
    setDobPickerType(type);
    setShowDOBPicker(true);
  };

  const selectDOBValue = (value: number) => {
    if (dobPickerType === 'day') {
      onUpdate('dobDay', String(value).padStart(2, '0'));
    } else if (dobPickerType === 'month') {
      onUpdate('dobMonth', String(value).padStart(2, '0'));
    } else {
      onUpdate('dobYear', String(value));
    }
    setShowDOBPicker(false);
    
    // Check if all fields are filled after this selection
    setTimeout(() => {
      const newDay = dobPickerType === 'day' ? String(value).padStart(2, '0') : data.dobDay;
      const newMonth = dobPickerType === 'month' ? String(value).padStart(2, '0') : data.dobMonth;
      const newYear = dobPickerType === 'year' ? String(value) : data.dobYear;
      
      if (newDay && newMonth && newYear && !ageConfirmed) {
        const d = parseInt(newDay);
        const m = parseInt(newMonth);
        const y = parseInt(newYear);
        const today = new Date();
        const birthDate = new Date(y, m - 1, d);
        
        if (birthDate.getDate() === d && birthDate.getMonth() === m - 1) {
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          if (age > 0 && age < 150) {
            setCalculatedAge(age);
            setShowAgeConfirm(true);
          }
        }
      }
    }, 100);
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

  const isValid = data.name.trim() && data.gender && ageConfirmed && !underAge && data.location;

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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
        <View style={styles.dobRow}>
          <TouchableOpacity 
            style={[styles.dobPicker, data.dobDay && styles.dobPickerFilled]} 
            onPress={() => openDOBPicker('day')}
            testID="dob-day-picker"
          >
            <Text style={[styles.dobPickerText, !data.dobDay && styles.placeholder]}>
              {data.dobDay || 'DD'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.dobPicker, styles.dobPickerMonth, data.dobMonth && styles.dobPickerFilled]} 
            onPress={() => openDOBPicker('month')}
            testID="dob-month-picker"
          >
            <Text style={[styles.dobPickerText, !data.dobMonth && styles.placeholder]}>
              {data.dobMonth ? MONTHS[parseInt(data.dobMonth) - 1]?.label : 'Month'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.dobPicker, data.dobYear && styles.dobPickerFilled]} 
            onPress={() => openDOBPicker('year')}
            testID="dob-year-picker"
          >
            <Text style={[styles.dobPickerText, !data.dobYear && styles.placeholder]}>
              {data.dobYear || 'YYYY'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {ageConfirmed && (
          <View style={styles.ageConfirmedBadge}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={styles.ageConfirmedText}>Age verified: {calculatedAge} years old</Text>
          </View>
        )}

        {ageConfirmed && (
          <>
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
          </>
        )}

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
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowGenderPicker(false)}
        >
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
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowIdentityPicker(false)}
        >
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

      {/* DOB Picker Modal */}
      <Modal visible={showDOBPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDOBPicker(false)}
        >
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>
              {dobPickerType === 'day' ? 'Select Day' : dobPickerType === 'month' ? 'Select Month' : 'Select Year'}
            </Text>
            <ScrollView style={styles.pickerScroll}>
              {dobPickerType === 'day' && DAYS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.pickerItem, data.dobDay === String(d).padStart(2, '0') && styles.pickerItemActive]}
                  onPress={() => selectDOBValue(d)}
                  testID={`dob-day-${d}`}
                >
                  <Text style={[styles.pickerItemText, data.dobDay === String(d).padStart(2, '0') && styles.pickerItemTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
              {dobPickerType === 'month' && MONTHS.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.pickerItem, data.dobMonth === String(m.value).padStart(2, '0') && styles.pickerItemActive]}
                  onPress={() => selectDOBValue(m.value)}
                  testID={`dob-month-${m.value}`}
                >
                  <Text style={[styles.pickerItemText, data.dobMonth === String(m.value).padStart(2, '0') && styles.pickerItemTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
              {dobPickerType === 'year' && YEARS.map(y => (
                <TouchableOpacity
                  key={y}
                  style={[styles.pickerItem, data.dobYear === String(y) && styles.pickerItemActive]}
                  onPress={() => selectDOBValue(y)}
                  testID={`dob-year-${y}`}
                >
                  <Text style={[styles.pickerItemText, data.dobYear === String(y) && styles.pickerItemTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Age Confirmation Modal */}
      <Modal visible={showAgeConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.ageConfirmContent}>
            <Ionicons name="calendar-outline" size={48} color={COLORS.gold} style={{ marginBottom: SPACING.m }} />
            <Text style={styles.ageConfirmTitle}>Age Confirmation</Text>
            <Text style={styles.ageConfirmText}>Are you {calculatedAge} years old?</Text>
            <View style={styles.ageConfirmBtns}>
              <TouchableOpacity style={styles.ageConfirmYes} onPress={() => handleAgeConfirm(true)} testID="age-confirm-yes">
                <Text style={styles.btnTextWhite}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ageConfirmNo} onPress={() => handleAgeConfirm(false)} testID="age-confirm-no">
                <Text style={styles.btnTextWhite}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  dobRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  dobPicker: {
    flex: 1, backgroundColor: COLORS.bgInput, borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.s, paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  dobPickerMonth: { flex: 1.8 },
  dobPickerFilled: { borderWidth: 1, borderColor: COLORS.primary },
  dobPickerText: { fontSize: 14, color: COLORS.text },
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
    paddingVertical: 14, paddingHorizontal: SPACING.m, borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.xs,
  },
  pickerItemActive: { backgroundColor: 'rgba(229,9,20,0.15)' },
  pickerItemText: { fontSize: 16, color: COLORS.textSecondary },
  pickerItemTextActive: { color: COLORS.primary, fontWeight: '600' },
  ageConfirmContent: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l, padding: SPACING.xl,
    width: '100%', maxWidth: 320, alignItems: 'center',
  },
  ageConfirmTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.s },
  ageConfirmText: { fontSize: 18, color: COLORS.textSecondary, marginBottom: SPACING.l },
  ageConfirmBtns: { flexDirection: 'row', gap: SPACING.m, width: '100%' },
  ageConfirmYes: {
    flex: 1, backgroundColor: COLORS.primary, paddingVertical: 14,
    borderRadius: BORDER_RADIUS.full, alignItems: 'center',
  },
  ageConfirmNo: {
    flex: 1, backgroundColor: COLORS.border, paddingVertical: 14,
    borderRadius: BORDER_RADIUS.full, alignItems: 'center',
  },
  btnTextWhite: { fontSize: 16, fontWeight: '600', color: COLORS.white },
  underAgeTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.text, marginTop: SPACING.l },
  underAgeText: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.m, lineHeight: 24 },
});
