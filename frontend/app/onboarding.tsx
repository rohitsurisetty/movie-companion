import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { ProfileData, initialProfileData } from '../src/types';
import { saveProfile, setOnboardingComplete, getUserId } from '../src/store';
import SelectionStep from '../src/components/SelectionStep';
import BasicInfoStep from '../src/components/BasicInfoStep';
import TopMoviesStep from '../src/components/TopMoviesStep';
import OptionalProfileStep from '../src/components/OptionalProfileStep';
import ProfilePreviewStep from '../src/components/ProfilePreviewStep';
import PublicProfilePreviewStep from '../src/components/PublicProfilePreviewStep';
import PhotoUploadStep from '../src/components/PhotoUploadStep';
import TinaChoiceStep from '../src/components/TinaChoiceStep';
import TinaChatScreen from '../src/components/TinaChatScreen';
import { useTina } from '../src/context/TinaContext';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || '';

// Step indices (Tina choice is now step 2)
const STEP_BASIC_INFO = 0;
const STEP_PHOTO_UPLOAD = 1;
const STEP_TINA_CHOICE = 2;
const STEP_TINA_CHAT = -1; // Special step for Tina chat screen
const STEP_LOOKING_FOR = 3;
const STEP_PARTNER_PREF = 4;
const STEP_LANGUAGES = 5;
const STEP_MOVIE_FREQ = 6;
const STEP_OTT_THEATRE = 7;
const STEP_FILM_LANG = 8;
const STEP_GENRES = 9;
const STEP_TOP_MOVIES = 10;
const STEP_OPTIONAL = 11;
const STEP_PREVIEW = 12;
const STEP_PUBLIC_PREVIEW = 13;

const TOTAL_STEPS = 14; // Mode step removed

const STEP_LABELS = [
  'Basic Info', 'Add Photos', 'Create Profile', 'Looking For', 'Want to Meet', 
  'Languages', 'Movie Frequency', 'OTT / Theatre', 'Film Languages', 'Genres',
  'Top Movies', 'Optional Info', 'Preview', 'Public Preview',
];

type SelectionConfig = {
  title: string;
  subtitle?: string;
  options: string[];
  multiSelect: boolean;
  displayAs: 'chips' | 'tiles' | 'list' | 'language-tiles';
  field: keyof ProfileData;
};

// Selection configs now start at step 3 (after BasicInfo, PhotoUpload, TinaChoice)
const SELECTION_CONFIGS: Record<number, SelectionConfig> = {
  3: {
    title: 'What are you looking for?',
    subtitle: 'Select all that apply',
    options: ['Casual', 'Friendship', 'Serious relationship', 'Exploring'],
    multiSelect: true, displayAs: 'chips', field: 'relationshipIntent',
  },
  4: {
    title: 'Who do you want to meet?',
    subtitle: 'This helps us find better matches for you',
    options: ['Men', 'Women', 'Anyone'],
    multiSelect: false, displayAs: 'chips', field: 'partnerPreference',
  },
  5: {
    title: 'Languages you speak',
    subtitle: 'Select all that apply',
    options: ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu'],
    multiSelect: true, displayAs: 'chips', field: 'languagesSpoken',
  },
  6: {
    title: 'How often do you watch movies?',
    options: ['More than twice a week', 'Twice a week', 'Once a week', 'Twice a month', 'Once a month', 'Rarely'],
    multiSelect: false, displayAs: 'list', field: 'movieFrequency',
  },
  7: {
    title: 'What describes you more?',
    options: ['OTT Person', 'Theatre Person', 'Both OTT & Theatre', 'Neither'],
    multiSelect: false, displayAs: 'chips', field: 'ottTheatre',
  },
  8: {
    title: 'Languages of films you watch',
    subtitle: 'Select all that apply',
    options: ['Hindi', 'English', 'Telugu', 'Tamil', 'Malayalam', 'Kannada', 'Korean', 'Others'],
    multiSelect: true, displayAs: 'language-tiles', field: 'filmLanguages',
  },
  9: {
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
  const [showTinaChat, setShowTinaChat] = useState(false);
  const [tinaCollectedFields, setTinaCollectedFields] = useState<string[]>([]);
  const [userId, setUserId] = useState<string>('');
  // Track if we're selecting movies FOR Tina (vs manual onboarding)
  const [tinaMovieSelectionMode, setTinaMovieSelectionMode] = useState(false);
  const [moviesForTina, setMoviesForTina] = useState<any[]>([]);
  const [returningFromMovieSelection, setReturningFromMovieSelection] = useState(false);

  // USE TINA CONTEXT FOR UNIFIED STATE
  const { 
    state: tinaState,
    setMessages: setTinaMessages,
    setOnboardingStage,
    setOnboardingTinaActive,
    markFieldsAsCollected,
    isFieldCollected,
    updateUserProfile,
  } = useTina();
  
  // Use messages from TinaContext (single source of truth)
  const tinaMessages = tinaState.messages;

  // Get user ID on mount
  useEffect(() => {
    (async () => {
      const id = await getUserId();
      setUserId(id || '');
    })();
    
    // Reset onboarding stage to pre_decision when this screen mounts
    // This ensures floating Tina is hidden until user makes a choice
    setOnboardingStage('pre_decision');
  }, [setOnboardingStage]);

  // Track when Tina screen is active (for floating button visibility)
  useEffect(() => {
    setOnboardingTinaActive(showTinaChat);
    return () => {
      // Cleanup when component unmounts
      setOnboardingTinaActive(false);
    };
  }, [showTinaChat, setOnboardingTinaActive]);

  const updateField = useCallback((field: string, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
    
    // Also update TinaContext so Tina knows about this field
    if (value !== undefined && value !== null && value !== '') {
      markFieldsAsCollected([field]);
      updateUserProfile({ [field]: value });
    }
  }, [markFieldsAsCollected, updateUserProfile]);

  // Merge Tina-collected data into profile
  const mergeTinaData = (tinaData: Partial<ProfileData>) => {
    const collected: string[] = [];
    
    Object.entries(tinaData).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        updateField(key, value);
        collected.push(key);
      }
    });
    
    setTinaCollectedFields(collected);
  };

  // Check if a field was collected by Tina
  const isFieldCollectedByTina = (field: string): boolean => {
    return tinaCollectedFields.includes(field);
  };

  // Check if a selection step should be skipped (already collected by Tina)
  const shouldSkipSelectionStep = (stepIdx: number): boolean => {
    const config = SELECTION_CONFIGS[stepIdx];
    if (!config) return false;
    return isFieldCollectedByTina(config.field);
  };

  // Find next step that needs to be shown (skip Tina-collected fields)
  const findNextStep = (currentStep: number): number => {
    let next = currentStep + 1;
    
    // Skip selection steps that were already collected by Tina
    while (next >= STEP_LOOKING_FOR && next <= STEP_GENRES && shouldSkipSelectionStep(next)) {
      next++;
    }
    
    // Skip TopMovies if already collected
    if (next === STEP_TOP_MOVIES && isFieldCollectedByTina('topMovies')) {
      next++;
    }
    
    return next;
  };

  const handleNext = () => {
    const nextStep = findNextStep(step);
    
    if (nextStep >= TOTAL_STEPS) {
      handleFinish();
    } else {
      setStep(nextStep);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      // Find previous non-skipped step
      let prev = step - 1;
      while (prev >= STEP_LOOKING_FOR && prev <= STEP_GENRES && shouldSkipSelectionStep(prev)) {
        prev--;
      }
      if (prev === STEP_TINA_CHOICE && tinaCollectedFields.length > 0) {
        // Skip Tina choice if already used
        prev = STEP_PHOTO_UPLOAD;
      }
      setStep(Math.max(0, prev));
    }
  };

  const handleFinish = async () => {
    await saveProfile(data);
    await setOnboardingComplete();
    // Mark onboarding as complete in TinaContext
    setOnboardingStage('completed');
    router.replace('/success');
  };

  // Tina handlers
  const handleChatWithTina = () => {
    // Set onboarding stage to Tina mode
    setOnboardingStage('tina_onboarding');
    setShowTinaChat(true);
  };

  const handleContinueManually = () => {
    // Set onboarding stage to manual mode
    setOnboardingStage('manual_onboarding');
    handleNext(); // Go to next step (Looking For)
  };

  const handleTinaComplete = (tinaData: Partial<ProfileData>) => {
    mergeTinaData(tinaData);
    setShowTinaChat(false);
    // User is exiting Tina, set stage to manual (enables floating button)
    setOnboardingStage('manual_onboarding');
    
    // Jump to first uncollected step or finish
    const nextStep = findNextStep(STEP_TINA_CHOICE);
    if (nextStep >= TOTAL_STEPS) {
      handleFinish();
    } else {
      setStep(nextStep);
    }
  };

  const handleTinaExit = (tinaData: Partial<ProfileData>) => {
    mergeTinaData(tinaData);
    setShowTinaChat(false);
    // User is exiting Tina, set stage to manual (enables floating button)
    setOnboardingStage('manual_onboarding');
    
    // Check if there are remaining fields
    const nextStep = findNextStep(STEP_TINA_CHOICE);
    if (nextStep < TOTAL_STEPS) {
      // Show "Few more info required" - go to next uncollected step
      setStep(nextStep);
    } else {
      handleFinish();
    }
  };

  // Handler for Tina requesting movie selection
  const handleTinaRequestMovieSelection = () => {
    setTinaMovieSelectionMode(true);
    setShowTinaChat(false);
    setStep(STEP_TOP_MOVIES);
  };

  // Handler for TopMoviesStep completion when in Tina mode
  const handleMoviesSelectedForTina = () => {
    // Save the selected movies to pass back to Tina
    const movies = Array.isArray(data.topMovies) ? [...data.topMovies] : [];
    setMoviesForTina(movies);
    setTinaMovieSelectionMode(false);
    setReturningFromMovieSelection(true);
    setShowTinaChat(true);
  };

  // Reset the returning flag and movies after Tina has processed them
  // Only clear the movies data, keep the returning flag until Tina explicitly confirms
  useEffect(() => {
    if (returningFromMovieSelection && showTinaChat && moviesForTina.length > 0) {
      // Clear movies after Tina has had time to receive the data (but keep the returning flag)
      const timer = setTimeout(() => {
        setMoviesForTina([]);
      }, 500); // Reduced timeout - just enough for Tina to grab the movies
      return () => clearTimeout(timer);
    }
  }, [returningFromMovieSelection, showTinaChat, moviesForTina.length]);
  
  // Clear returning flag after chat is fully mounted and displaying
  useEffect(() => {
    if (returningFromMovieSelection && showTinaChat && tinaMessages.length > 0) {
      // Clear the flag after a longer delay once messages are confirmed
      const timer = setTimeout(() => {
        setReturningFromMovieSelection(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [returningFromMovieSelection, showTinaChat, tinaMessages.length]);

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

  // Steps with their own buttons
  const STEPS_WITH_OWN_BUTTON = [0, 1, 2, 10, 11, 12, 13];
  const showSharedButton = !STEPS_WITH_OWN_BUTTON.includes(step);

  // Go back to edit step from public preview
  const handleEditFromPreview = () => {
    setStep(STEP_PREVIEW);
  };

  // Handle photo upload completion
  const handlePhotoUploadComplete = (uploadedPictures: string[]) => {
    updateField('uploadedPictures', uploadedPictures);
    handleNext();
  };

  // If showing Tina chat, render it full-screen using TinaContext messages
  if (showTinaChat) {
    console.log('[Onboarding] Rendering Tina with', tinaMessages.length, 'messages, returning:', returningFromMovieSelection);
    
    return (
      <TinaChatScreen
        userId={userId}
        userName={data.name || ''}
        onComplete={handleTinaComplete}
        onExit={handleTinaExit}
        onRequestMovieSelection={handleTinaRequestMovieSelection}
        selectedMovies={moviesForTina.length > 0 ? moviesForTina : undefined}
        existingMessages={tinaMessages}
        onMessagesChange={setTinaMessages}
        isReturningFromMovieSelection={returningFromMovieSelection}
      />
    );
  }

  const renderStep = () => {
    // Step 0: Basic Info
    if (step === STEP_BASIC_INFO) {
      return <BasicInfoStep data={data} onUpdate={updateField} onNext={handleNext} />;
    }
    // Step 1: Photo Upload
    if (step === STEP_PHOTO_UPLOAD) {
      return <PhotoUploadStep onNext={handlePhotoUploadComplete} />;
    }
    // Step 2: Tina Choice (NEW)
    if (step === STEP_TINA_CHOICE) {
      return (
        <TinaChoiceStep 
          userName={data.name || ''}
          onChatWithTina={handleChatWithTina}
          onContinueManually={handleContinueManually}
        />
      );
    }
    // Steps 3-9: Selection Steps
    if (step >= STEP_LOOKING_FOR && step <= STEP_GENRES) {
      const config = SELECTION_CONFIGS[step];
      if (!config) return null;
      
      const showOthersInput = step === STEP_FILM_LANG;
      const showVisibilityToggle = step === STEP_PARTNER_PREF;
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
    // Step 10: Top Movies
    if (step === STEP_TOP_MOVIES) {
      // If in Tina movie selection mode, use different onNext handler
      if (tinaMovieSelectionMode) {
        return (
          <TopMoviesStep 
            data={data} 
            onUpdate={updateField} 
            onNext={handleMoviesSelectedForTina}
          />
        );
      }
      return <TopMoviesStep data={data} onUpdate={updateField} onNext={handleNext} />;
    }
    // Step 11: Optional Profile
    if (step === STEP_OPTIONAL) {
      return <OptionalProfileStep data={data} onUpdate={updateField} onNext={handleNext} />;
    }
    // Step 12: Profile Preview
    if (step === STEP_PREVIEW) {
      return <ProfilePreviewStep data={data} onUpdate={updateField} onNext={handleNext} />;
    }
    // Step 13: Public Profile Preview
    if (step === STEP_PUBLIC_PREVIEW) {
      return <PublicProfilePreviewStep data={data} onEdit={handleEditFromPreview} onContinue={handleNext} />;
    }
    return null;
  };

  // Calculate display step for progress (excluding Tina chat)
  const getDisplayStep = () => {
    if (step <= STEP_TINA_CHOICE) return step;
    // Account for skipped steps
    let displayed = step;
    for (let i = STEP_LOOKING_FOR; i < step; i++) {
      if (shouldSkipSelectionStep(i)) displayed--;
    }
    return displayed;
  };

  // Show "Few more info" header when coming back from Tina with partial data
  const showPartialHeader = tinaCollectedFields.length > 0 && step > STEP_TINA_CHOICE;

  // For the Public Profile Preview step, render full-screen (no onboarding chrome)
  // so it visually matches the Profile/Match-section preview exactly.
  if (step === STEP_PUBLIC_PREVIEW) {
    return (
      <View style={styles.container} testID="onboarding-screen">
        {renderStep()}
      </View>
    );
  }

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
        <View style={styles.headerCenter}>
          {showPartialHeader && (
            <Text style={styles.partialHeader}>Few more details needed</Text>
          )}
          <Text style={styles.stepLabel}>{STEP_LABELS[step] || 'Profile'}</Text>
        </View>
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

      {/* Shared Continue Button (for selection steps) */}
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  partialHeader: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    marginBottom: 2,
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
