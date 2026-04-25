import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { ProfileData, initialProfileData } from '../src/types';
import { saveProfile, setOnboardingComplete } from '../src/store';
import SelectionStep from '../src/components/SelectionStep';
import BasicInfoStep from '../src/components/BasicInfoStep';
import TopMoviesStep from '../src/components/TopMoviesStep';
import OptionalProfileStep from '../src/components/OptionalProfileStep';
import ProfilePreviewStep from '../src/components/ProfilePreviewStep';
import ModeSelectionStep from '../src/components/ModeSelectionStep';

const TOTAL_STEPS = 12;

const STEP_LABELS = [
  'Basic Info', 'Looking For', 'Want to Meet', 'Languages',
  'Movie Frequency', 'OTT / Theatre', 'Film Languages', 'Genres',
  'Top Movies', 'Optional Info', 'Preview', 'Mode',
];

type SelectionConfig = {
  title: string;
  subtitle?: string;
  options: string[];
  multiSelect: boolean;
  displayAs: 'chips' | 'tiles' | 'list' | 'language-tiles';
  field: keyof ProfileData;
};

const SELECTION_CONFIGS: Record<number, SelectionConfig> = {
  1: {
    title: 'What are you looking for?',
    subtitle: 'Select all that apply',
    options: ['Casual', 'Friendship', 'Serious relationship', 'Exploring'],
    multiSelect: true, displayAs: 'chips', field: 'relationshipIntent',
  },
  2: {
    title: 'Who do you want to meet?',
    subtitle: 'This helps us find better matches for you',
    options: ['Men', 'Women', 'Anyone'],
    multiSelect: false, displayAs: 'chips', field: 'partnerPreference',
  },
  3: {
    title: 'Languages you speak',
    subtitle: 'Select all that apply',
    options: ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu'],
    multiSelect: true, displayAs: 'chips', field: 'languagesSpoken',
  },
  4: {
    title: 'How often do you watch movies?',
    options: ['More than twice a week', 'Twice a week', 'Once a week', 'Twice a month', 'Once a month', 'Rarely'],
    multiSelect: false, displayAs: 'list', field: 'movieFrequency',
  },
  5: {
    title: 'What describes you more?',
    options: ['OTT Person', 'Theatre Person', 'Both', 'None'],
    multiSelect: false, displayAs: 'chips', field: 'ottTheatre',
  },
  6: {
    title: 'Languages of films you watch',
    subtitle: 'Select all that apply',
    options: ['Hindi', 'English', 'Telugu', 'Tamil', 'Malayalam', 'Kannada', 'Korean', 'Others'],
    multiSelect: true, displayAs: 'language-tiles', field: 'filmLanguages',
  },
  7: {
    title: 'Your favourite genres',
    subtitle: 'Select all that apply',
    options: ['Action', 'Romance', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi', 'Drama', 'Documentary'],
    multiSelect: true, displayAs: 'chips', field: 'genres',
  },
};

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<ProfileData>(initialProfileData);

  const updateField = (field: string, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step === TOTAL_STEPS - 1) {
      handleFinish();
    } else {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleFinish = async () => {
    await saveProfile(data);
    await setOnboardingComplete();
    router.replace('/success');
  };

  // Validation function - all selection steps are mandatory
  const isSelectionValid = (stepIdx: number): boolean => {
    const config = SELECTION_CONFIGS[stepIdx];
    if (!config) return true;
    
    const val = data[config.field];
    
    if (config.multiSelect) {
      return Array.isArray(val) && val.length > 0;
    }
    
    return val !== undefined && val !== null && val !== '';
  };

  const STEPS_WITH_OWN_BUTTON = [0, 8, 9, 10, 11];
  const showSharedButton = !STEPS_WITH_OWN_BUTTON.includes(step);

  const renderStep = () => {
    if (step === 0) {
      return <BasicInfoStep data={data} onUpdate={updateField} onNext={handleNext} />;
    }
    if (step >= 1 && step <= 7) {
      const config = SELECTION_CONFIGS[step];
      const showOthersInput = step === 6;
      const showVisibilityToggle = step === 2; // Only for "Who do you want to meet?"
      return (
        <SelectionStep
          title={config.title}
          subtitle={config.subtitle}
          options={config.options}
          selected={data[config.field] as any}
          onSelect={(val) => updateField(config.field, val)}
          multiSelect={config.multiSelect}
          displayAs={config.displayAs}
          showOthersInput={showOthersInput}
          othersValue={(data as any).otherFilmLanguages || ''}
          onOthersChange={(val) => updateField('otherFilmLanguages', val)}
          showVisibilityToggle={showVisibilityToggle}
          visibilityValue={data.visibilityToggles.partnerPreference}
          onVisibilityChange={(val) => updateField('visibilityToggles', { ...data.visibilityToggles, partnerPreference: val })}
        />
      );
    }
    if (step === 8) {
      return <TopMoviesStep data={data} onUpdate={updateField} onNext={handleNext} />;
    }
    if (step === 9) {
      return <OptionalProfileStep data={data} onUpdate={updateField} onNext={handleNext} />;
    }
    if (step === 10) {
      return <ProfilePreviewStep data={data} onUpdate={updateField} onNext={handleNext} />;
    }
    if (step === 11) {
      return <ModeSelectionStep data={data} onUpdate={updateField} onNext={handleNext} />;
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container} testID="onboarding-screen">
      {/* Header */}
      <View style={styles.header}>
        {step > 0 ? (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} testID="onboarding-back-btn">
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backPlaceholder} />
        )}
        <Text style={styles.stepLabel}>{STEP_LABELS[step]}</Text>
        <View style={styles.backPlaceholder} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]} />
        </View>
      </View>

      {/* Step Content */}
      <View style={styles.content}>
        {renderStep()}
      </View>

      {/* Shared Continue Button (for selection steps 1-7) */}
      {showSharedButton && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.continueBtn, !isSelectionValid(step) && styles.continueBtnDisabled]}
            onPress={handleNext}
            disabled={!isSelectionValid(step)}
            testID="onboarding-continue-btn"
          >
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.m, paddingVertical: SPACING.s,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backPlaceholder: { width: 44 },
  stepLabel: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  stepCounter: { fontSize: 14, color: COLORS.textMuted, width: 44, textAlign: 'right' },
  progressContainer: { paddingHorizontal: SPACING.m, marginBottom: SPACING.m },
  progressTrack: {
    height: 4, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: COLORS.primary, borderRadius: 2,
  },
  content: { flex: 1, paddingHorizontal: SPACING.l },
  footer: { 
    paddingHorizontal: SPACING.l, 
    paddingBottom: SPACING.m,
  },
  continueBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white, letterSpacing: 1 },
});
