import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { ProfileData, initialProfileData } from '../src/types';
import { saveProfile, setOnboardingComplete, getUserId } from '../src/store';
import SelectionStep from '../src/components/SelectionStep';
import BasicInfoStep from '../src/components/BasicInfoStep';
import TopMoviesStep from '../src/components/TopMoviesStep';
import OptionalProfileStep from '../src/components/OptionalProfileStep';
import ProfilePreviewStep from '../src/components/ProfilePreviewStep';
import PublicProfilePreviewStep from '../src/components/PublicProfilePreviewStep';
import ModeSelectionStep from '../src/components/ModeSelectionStep';
import PhotoUploadStep from '../src/components/PhotoUploadStep';
import TinaChat from '../src/components/TinaChat';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Steps configuration
// 0: BasicInfo, 1: PhotoUpload, 2: TinaChoice, 3: Tina OR manual steps...
const MANUAL_STEPS_OFFSET = 3; // Manual steps start at index 3

const STEP_LABELS = [
  'Basic Info', 'Add Photos', 'Meet Tina', 'Looking For', 'Want to Meet', 'Languages',
  'Movie Frequency', 'OTT / Theatre', 'Film Languages', 'Genres',
  'Top Movies', 'Optional Info', 'Preview', 'Public Preview', 'Mode',
];

type SelectionConfig = {
  title: string;
  subtitle?: string;
  options: string[];
  multiSelect: boolean;
  displayAs: 'chips' | 'tiles' | 'list' | 'language-tiles';
  field: keyof ProfileData;
};

// Selection configs for manual steps (indices are step numbers)
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
    options: ['Hindi', 'English', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Punjabi'],
    multiSelect: true, displayAs: 'language-tiles', field: 'languagesSpoken',
  },
  6: {
    title: 'How often do you watch movies?',
    options: ['More than twice a week', 'Twice a week', 'Once a week', 'Twice a month', 'Once a month', 'Rarely'],
    multiSelect: false, displayAs: 'list', field: 'movieFrequency',
  },
  7: {
    title: 'OTT Person or Theatre Person?',
    subtitle: 'Or maybe both?',
    options: ['OTT Person', 'Theatre Person', 'Both'],
    multiSelect: false, displayAs: 'tiles', field: 'ottTheatre',
  },
  8: {
    title: 'What languages do you watch movies in?',
    subtitle: 'Select your preferences',
    options: ['Hindi', 'English', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Korean', 'Japanese', 'Spanish', 'French'],
    multiSelect: true, displayAs: 'language-tiles', field: 'filmLanguages',
  },
  9: {
    title: 'Pick your favorite genres',
    subtitle: 'Select up to 8 genres',
    options: ['Action', 'Romance', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi', 'Drama', 'Documentary', 'Adventure', 'Animation', 'Crime', 'Fantasy', 'Mystery'],
    multiSelect: true, displayAs: 'chips', field: 'genres',
  },
};

// Tina Choice Screen Component
const TinaChoiceScreen = ({ 
  onChatWithTina, 
  onSkipToManual,
  userName,
}: { 
  onChatWithTina: () => void; 
  onSkipToManual: () => void;
  userName: string;
}) => {
  return (
    <View style={styles.tinaChoiceContainer}>
      {/* Tina Avatar */}
      <View style={styles.tinaAvatarSection}>
        <Image 
          source={{ uri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop' }}
          style={styles.tinaLargeAvatar}
        />
        <View style={styles.tinaOnlineBadge}>
          <View style={styles.onlineDot} />
        </View>
      </View>

      {/* Title */}
      <Text style={styles.tinaTitle}>Meet Tina! 👋</Text>
      <Text style={styles.tinaSubtitle}>
        Your personal movie matchmaker
      </Text>

      {/* Description */}
      <Text style={styles.tinaDescription}>
        Instead of boring forms, chat with Tina! She&apos;ll get to know you through a fun conversation and create your perfect profile.
      </Text>

      {/* Chat with Tina Button */}
      <TouchableOpacity style={styles.chatTinaBtn} onPress={onChatWithTina}>
        <LinearGradient
          colors={['#FF6B9D', '#E50914']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.chatTinaBtnGradient}
        >
          <Ionicons name="chatbubble-ellipses" size={22} color="#FFF" />
          <Text style={styles.chatTinaBtnText}>Chat with Tina</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Skip to Manual */}
      <TouchableOpacity style={styles.skipManualBtn} onPress={onSkipToManual}>
        <Text style={styles.skipManualText}>I&apos;ll fill the form myself</Text>
      </TouchableOpacity>

      {/* Fun fact */}
      <View style={styles.funFactBox}>
        <Ionicons name="sparkles" size={16} color="#FF6B9D" />
        <Text style={styles.funFactText}>
          90% of users prefer chatting with Tina over filling forms!
        </Text>
      </View>
    </View>
  );
};

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  const [profile, setProfile] = useState<ProfileData>(initialProfileData);
  const [userId, setUserId] = useState('');
  const [showTinaChat, setShowTinaChat] = useState(false);
  const [tinaCompletedData, setTinaCompletedData] = useState<Record<string, any> | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadUserId();
  }, []);

  const loadUserId = async () => {
    const id = await getUserId();
    setUserId(id);
  };

  // Calculate total steps based on whether Tina was used
  const getTotalSteps = () => {
    if (tinaCompletedData) {
      // After Tina, only show: Optional Info, Preview, Public Preview, Mode
      return 4; // Reduced flow after Tina
    }
    return 15; // Full manual flow
  };

  const handleNext = () => {
    if (currentStep === 2 && !showTinaChat) {
      // This is the Tina choice screen, don't auto-advance
      return;
    }
    
    if (currentStep < getTotalSteps() - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (showTinaChat) {
      setShowTinaChat(false);
      return;
    }
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleUpdate = (field: keyof ProfileData, value: any) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handleTinaComplete = (tinaData: Record<string, any>) => {
    // Merge Tina's collected data into profile
    setTinaCompletedData(tinaData);
    setProfile(prev => ({
      ...prev,
      relationshipIntent: tinaData.relationshipIntent || prev.relationshipIntent,
      partnerPreference: tinaData.partnerPreference || prev.partnerPreference,
      movieFrequency: tinaData.movieFrequency || prev.movieFrequency,
      ottTheatre: tinaData.ottTheatre || prev.ottTheatre,
      genres: tinaData.genres || prev.genres,
      bio: tinaData.bio || prev.bio,
      // topMovies from Tina are stored separately
    }));
    
    // Move to post-Tina flow (Optional Info -> Preview -> Mode)
    setShowTinaChat(false);
    setCurrentStep(11); // Jump to Optional Info step
  };

  const handleComplete = async () => {
    try {
      await saveProfile(profile);
      await setOnboardingComplete(true);
      router.replace('/(tabs)/feed');
    } catch (error) {
      console.error('Error completing onboarding:', error);
    }
  };

  const renderStep = () => {
    // Show Tina chat if active
    if (showTinaChat) {
      return (
        <TinaChat
          userId={userId}
          userName={profile.name || 'there'}
          onComplete={handleTinaComplete}
          onSkip={() => {
            setShowTinaChat(false);
            setCurrentStep(3); // Go to first manual step
          }}
        />
      );
    }

    switch (currentStep) {
      case 0:
        return (
          <BasicInfoStep
            data={profile}
            onUpdate={(field, value) => handleUpdate(field as keyof ProfileData, value)}
            onNext={handleNext}
          />
        );
      
      case 1:
        return (
          <PhotoUploadStep
            userId={userId}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      
      case 2:
        return (
          <TinaChoiceScreen
            userName={profile.name || 'there'}
            onChatWithTina={() => setShowTinaChat(true)}
            onSkipToManual={() => setCurrentStep(3)}
          />
        );
      
      case 10:
        return (
          <TopMoviesStep
            data={profile}
            onUpdate={(field, value) => handleUpdate(field as keyof ProfileData, value)}
            onNext={handleNext}
          />
        );
      
      case 11:
        return (
          <OptionalProfileStep
            data={profile}
            onUpdate={(field, value) => handleUpdate(field as keyof ProfileData, value)}
            onNext={handleNext}
          />
        );
      
      case 12:
        return (
          <ProfilePreviewStep
            data={profile}
            onUpdate={(field, value) => handleUpdate(field as keyof ProfileData, value)}
            onNext={handleNext}
          />
        );
      
      case 13:
        return (
          <PublicProfilePreviewStep
            data={profile}
            onEdit={handleBack}
            onContinue={handleNext}
          />
        );
      
      case 14:
        return (
          <ModeSelectionStep
            selectedMode={profile.preferredMode || 'date'}
            onSelect={(mode) => {
              handleUpdate('preferredMode', mode);
              handleComplete();
            }}
            onBack={handleBack}
          />
        );
      
      default:
        // Selection steps (3-9)
        const config = SELECTION_CONFIGS[currentStep];
        if (config) {
          return (
            <SelectionStep
              title={config.title}
              subtitle={config.subtitle}
              options={config.options}
              multiSelect={config.multiSelect}
              displayAs={config.displayAs}
              selected={profile[config.field] as string | string[]}
              onSelect={(value) => handleUpdate(config.field, value)}
              onNext={handleNext}
              onBack={handleBack}
            />
          );
        }
        return null;
    }
  };

  // Don't show header for Tina chat
  if (showTinaChat) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {renderStep()}
      </SafeAreaView>
    );
  }

  // Don't show header for Tina choice screen
  if (currentStep === 2) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${((currentStep + 1) / 15) * 100}%` }]} />
          </View>
          <View style={{ width: 40 }} />
        </View>
        {renderStep()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header with progress */}
      <View style={styles.header}>
        {currentStep > 0 ? (
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
        
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${((currentStep + 1) / getTotalSteps()) * 100}%` }]} />
        </View>
        
        {/* Only show Skip for optional steps (3+), not for BasicInfo (0), Photos (1), or TinaChoice (2) */}
        <TouchableOpacity 
          style={styles.skipButton}
          onPress={() => {
            if (currentStep < getTotalSteps() - 1) {
              setCurrentStep(currentStep + 1);
            } else {
              handleComplete();
            }
          }}
        >
          <Text style={styles.skipText}>
            {currentStep === getTotalSteps() - 1 ? 'Done' : 'Skip'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Step content */}
      <View style={styles.content}>
        {renderStep()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.darkGray,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  skipButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  skipText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },

  // Tina Choice Screen Styles
  tinaChoiceContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  tinaAvatarSection: {
    position: 'relative',
    marginBottom: 24,
  },
  tinaLargeAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#FF6B9D',
  },
  tinaOnlineBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00D26A',
  },
  tinaTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
  },
  tinaSubtitle: {
    fontSize: 16,
    color: '#FF6B9D',
    marginBottom: 20,
  },
  tinaDescription: {
    fontSize: 15,
    color: COLORS.lightGray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  chatTinaBtn: {
    width: '100%',
    marginBottom: 16,
  },
  chatTinaBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 28,
    gap: 10,
  },
  chatTinaBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
  skipManualBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  skipManualText: {
    fontSize: 15,
    color: COLORS.lightGray,
    textDecorationLine: 'underline',
  },
  funFactBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 157, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 32,
    gap: 8,
  },
  funFactText: {
    fontSize: 13,
    color: COLORS.lightGray,
    flex: 1,
  },
});
