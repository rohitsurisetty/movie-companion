import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { ProfileData } from '../types';
import { PremiumProfileView } from './PremiumProfileView';

type Props = {
  data: ProfileData;
  onEdit: () => void;
  onContinue: () => void;
};

/**
 * Public Profile Preview shown at the end of the signup/onboarding flow.
 *
 * IMPORTANT (per user request June 2026):
 * This screen must visually match EXACTLY the way the user's public profile is
 * shown in the Profile tab and in the Match section. Both of those use
 * `PremiumProfileView`, so we reuse it here too with a custom bottom CTA
 * (Edit + Done & Continue) instead of the default "Message" button.
 */
export default function PublicProfilePreviewStep({ data, onEdit, onContinue }: Props) {
  // Filter fields based on visibility toggles, mirroring profile/match views.
  const isVisible = (key: string, mandatory: boolean = false): boolean => {
    if (mandatory) return true;
    return data.visibilityToggles?.[key] !== false;
  };

  // Build photos array: prefer uploaded pictures from this onboarding session,
  // then fall back to any persisted picture URLs.
  const photos: string[] = (() => {
    const anyData = data as unknown as {
      uploadedPictures?: unknown;
      pictures?: unknown;
      profilePicture?: unknown;
    };
    // 1. Onboarding session uploads (set by PhotoUploadStep -> handlePhotoUploadComplete)
    const uploaded = Array.isArray(anyData.uploadedPictures)
      ? (anyData.uploadedPictures.filter(Boolean) as string[])
      : [];
    if (uploaded.length > 0) return uploaded;
    // 2. Persisted profile pictures array
    const pics = Array.isArray(anyData.pictures)
      ? (anyData.pictures.filter(Boolean) as string[])
      : [];
    if (pics.length > 0) return pics;
    // 3. Single primary picture fallback
    if (typeof anyData.profilePicture === 'string' && anyData.profilePicture) {
      return [anyData.profilePicture];
    }
    return [];
  })();

  // Map ProfileData -> PremiumProfileView's expected profile shape, honoring visibility.
  const previewProfile = {
    user_id: data.userId || 'preview',
    name: data.name || 'Your Name',
    age: data.age || 0,
    gender: data.gender || '',
    location: isVisible('location') ? (data.location || '') : '',
    bio: isVisible('bio') ? (data.bio || '') : '',
    genres: isVisible('genres') ? (Array.isArray(data.genres) ? data.genres : []) : [],
    topMovies: isVisible('topMovies')
      ? (Array.isArray(data.topMovies) ? data.topMovies : [])
          .filter((m) => m && typeof m === 'object')
          .map((m: any) => ({
            title: m.title || '',
            tmdb_id: m.id || m.tmdb_id || 0,
            poster_path: m.poster_path || '',
          }))
      : [],
    filmLanguages: isVisible('filmLanguages') ? (Array.isArray(data.filmLanguages) ? data.filmLanguages : []) : [],
    languagesSpoken: isVisible('languagesSpoken') ? (Array.isArray(data.languagesSpoken) ? data.languagesSpoken : []) : [],
    movieFrequency: isVisible('movieFrequency') ? (data.movieFrequency || '') : '',
    ottTheatre: isVisible('ottTheatre') ? (data.ottTheatre || '') : '',
    relationshipIntent: isVisible('relationshipIntent') ? (Array.isArray(data.relationshipIntent) ? data.relationshipIntent : []) : [],
    zodiac: isVisible('zodiac') ? (data.zodiac || '') : '',
    smoking: isVisible('smoking') ? (data.smoking || '') : '',
    drinking: isVisible('drinking') ? (data.drinking || '') : '',
    exercise: isVisible('exercise') ? (data.exercise || '') : '',
    education: isVisible('education') ? (data.education || '') : '',
    workProfile: isVisible('workProfile') ? (data.workProfile || '') : '',
    height: isVisible('height') ? (data.height || '') : '',
    religion: isVisible('religion') ? (data.religion || '') : '',
    // No match data while previewing your own profile during signup.
  };

  // Mode selection has been removed from the product — always use the
  // unified ("date") theme for the preview.
  const previewMode: 'date' | 'buddy' = 'date';

  // Custom bottom CTA: Edit (left) + Done & Continue (right)
  const bottomCTA = (
    <View style={styles.bottomCTARow}>
      <TouchableOpacity
        style={styles.editBtn}
        onPress={onEdit}
        activeOpacity={0.85}
        testID="public-preview-edit"
      >
        <Ionicons name="create-outline" size={18} color={COLORS.text} />
        <Text style={styles.editBtnText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.continueBtn}
        onPress={onContinue}
        activeOpacity={0.9}
        testID="public-preview-continue"
      >
        <Text style={styles.continueBtnText}>Done & Continue</Text>
        <Ionicons name="chevron-forward" size={18} color={COLORS.white} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <PremiumProfileView
        visible
        profile={previewProfile}
        photos={photos}
        mode={previewMode}
        onClose={onEdit}
        onSendMessage={async () => false}
        hasAlreadySentRequest={false}
        isSendingMessage={false}
        bottomCTAOverride={bottomCTA}
        closeIconName="chevron-back"
        hideMatchCard
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  bottomCTARow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  editBtnText: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '600',
  },
  continueBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
