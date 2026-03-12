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

type Props = {
  data: ProfileData;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
};

export default function BasicInfoStep({ data, onUpdate, onNext }: Props) {
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showAgeConfirm, setShowAgeConfirm] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [underAge, setUnderAge] = useState(false);
  const [calculatedAge, setCalculatedAge] = useState(0);
  const [locationSearch, setLocationSearch] = useState('');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [gettingCurrentLoc, setGettingCurrentLoc] = useState(false);

  const calculateAge = useCallback(() => {
    const d = parseInt(data.dobDay);
    const m = parseInt(data.dobMonth);
    const y = parseInt(data.dobYear);
    if (!d || !m || !y || d > 31 || m > 12 || y < 1900) return;
    const today = new Date();
    const birthDate = new Date(y, m - 1, d);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age > 0 && age < 150) {
      setCalculatedAge(age);
      setShowAgeConfirm(true);
    }
  }, [data.dobDay, data.dobMonth, data.dobYear]);

  const handleAgeConfirm = (confirmed: boolean) => {
    setShowAgeConfirm(false);
    if (confirmed) {
      if (calculatedAge < 18) {
        setUnderAge(true);
      } else {
        setAgeConfirmed(true);
        onUpdate('age', calculatedAge);
      }
    }
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
          onChangeText={(t) => onUpdate('name', t)}
          testID="basic-name-input"
        />

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

        <Text style={styles.label}>Date of Birth *</Text>
        <View style={styles.dobRow}>
          <TextInput
            style={[styles.input, styles.dobInput]}
            placeholder="DD"
            placeholderTextColor={COLORS.textMuted}
            value={data.dobDay}
            onChangeText={(t) => onUpdate('dobDay', t.replace(/[^0-9]/g, '').slice(0, 2))}
            keyboardType="number-pad"
            maxLength={2}
            testID="basic-dob-day"
          />
          <Text style={styles.dobSep}>/</Text>
          <TextInput
            style={[styles.input, styles.dobInput]}
            placeholder="MM"
            placeholderTextColor={COLORS.textMuted}
            value={data.dobMonth}
            onChangeText={(t) => onUpdate('dobMonth', t.replace(/[^0-9]/g, '').slice(0, 2))}
            keyboardType="number-pad"
            maxLength={2}
            testID="basic-dob-month"
          />
          <Text style={styles.dobSep}>/</Text>
          <TextInput
            style={[styles.input, styles.dobInputYear]}
            placeholder="YYYY"
            placeholderTextColor={COLORS.textMuted}
            value={data.dobYear}
            onChangeText={(t) => onUpdate('dobYear', t.replace(/[^0-9]/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            testID="basic-dob-year"
          />
        </View>

        {!ageConfirmed && data.dobDay.length === 2 && data.dobMonth.length === 2 && data.dobYear.length === 4 && (
          <TouchableOpacity style={styles.verifyAgeBtn} onPress={calculateAge} testID="verify-age-btn">
            <Text style={styles.verifyAgeText}>Verify Age</Text>
          </TouchableOpacity>
        )}

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

      {/* Age Confirmation Modal */}
      <Modal visible={showAgeConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.ageConfirmContent}>
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
  dropdown: {
    backgroundColor: COLORS.bgInput, borderRadius: BORDER_RADIUS.m, paddingHorizontal: SPACING.m,
    paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dropdownText: { fontSize: 16, color: COLORS.text },
  placeholder: { color: COLORS.textMuted },
  dobRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  dobInput: { flex: 1, textAlign: 'center' },
  dobInputYear: { flex: 1.5, textAlign: 'center' },
  dobSep: { fontSize: 20, color: COLORS.textMuted },
  verifyAgeBtn: {
    backgroundColor: COLORS.gold, paddingVertical: 12, borderRadius: BORDER_RADIUS.full,
    alignItems: 'center', marginTop: SPACING.m,
  },
  verifyAgeText: { fontSize: 15, fontWeight: '700', color: COLORS.black },
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
    width: '100%', maxWidth: 340,
  },
  pickerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.m, textAlign: 'center' },
  pickerItem: {
    paddingVertical: 14, paddingHorizontal: SPACING.m, borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.xs,
  },
  pickerItemActive: { backgroundColor: 'rgba(229,9,20,0.15)' },
  pickerItemText: { fontSize: 16, color: COLORS.textSecondary },
  pickerItemTextActive: { color: COLORS.primary, fontWeight: '600' },
  ageConfirmContent: {
    backgroundColor: COLORS.bgCard, borderRadius: BORDER_RADIUS.l, padding: SPACING.l,
    width: '100%', maxWidth: 320, alignItems: 'center',
  },
  ageConfirmTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.m },
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
