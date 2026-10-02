import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { apiUrl, getUserId, saveProfile, getProfile } from '../src/store';

// Uploads are always a downscaled JPEG re-encode — never the camera original.
const UPLOAD_MAX_WIDTH = 1080;

const uploadErrorText = (status: number, detail: unknown): [string, string] => {
  const msg = typeof detail === 'string' ? detail : '';
  if (status === 413) return ['Photo too large', msg || 'Please choose a smaller photo.'];
  if (status === 503) return ['Upload unavailable', 'Photo storage is temporarily unavailable. Please try again in a few minutes.'];
  if (status >= 400 && status < 500 && msg) return ['Upload Failed', msg];
  return ['Upload Failed', 'Failed to upload picture. Please try again.'];
};

interface PictureSlot {
  index: number;
  uri: string | null;
  uploading: boolean;
  uploaded: boolean;
}

export default function PhotosScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const isFromProfile = params.from === 'profile';
  
  const [userId, setUserId] = useState<string>('');
  const [pictures, setPictures] = useState<PictureSlot[]>([
    { index: 1, uri: null, uploading: false, uploaded: false },
    { index: 2, uri: null, uploading: false, uploaded: false },
    { index: 3, uri: null, uploading: false, uploaded: false },
    { index: 4, uri: null, uploading: false, uploaded: false },
    { index: 5, uri: null, uploading: false, uploaded: false },
  ]);
  const [loading, setLoading] = useState(true);

  const uploadedCount = pictures.filter(p => p.uri && p.uploaded).length;
  const canContinue = uploadedCount >= 1;
  // Server URLs of the uploaded slots, in slot order (first = primary photo).
  const uploadedUrls = pictures.filter(p => p.uri && p.uploaded).map(p => p.uri as string);
  const uploadedKey = uploadedUrls.join('|');

  useEffect(() => {
    initializeScreen();
  }, []);

  // Mirror the uploaded photos into the local profile whenever they change
  // (derived from the latest state, so concurrent uploads can't clobber each other).
  useEffect(() => {
    if (loading || !userId) return;
    (async () => {
      const profile = await getProfile();
      await saveProfile({
        ...(profile || {}),
        userId,
        profilePicture: uploadedUrls[0] || null, // First photo is primary
        pictures: uploadedUrls,
      });
    })().catch(error => console.error('Failed to save photos to profile:', error));
  }, [uploadedKey]);

  const initializeScreen = async () => {
    try {
      const uid = await getUserId();
      if (!uid) {
        // Not signed in — never upload under a made-up id.
        router.replace('/');
        return;
      }
      setUserId(uid);
      await fetchExistingPictures(uid);
      // No permission prompts here: the Android photo picker needs none, and
      // camera permission is requested only when "Take Photo" is chosen.
    } catch (error) {
      console.error('Init error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchExistingPictures = async (uid: string) => {
    try {
      const response = await fetch(apiUrl(`/api/user/pictures/${uid}`));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      if (data.success && data.pictures) {
        setPictures(prev => prev.map((slot, idx) => ({
          ...slot,
          uri: data.pictures[`picture_${idx + 1}`] || null,
          uploaded: !!data.pictures[`picture_${idx + 1}`],
        })));
      }
    } catch (error) {
      console.error('Error fetching pictures:', error);
    }
  };

  const showImageOptions = (slotIndex: number) => {
    Alert.alert(
      'Add Photo',
      'Choose how you want to add your photo',
      [
        {
          text: 'Take Photo',
          onPress: () => pickImage(slotIndex, 'camera'),
        },
        {
          text: 'Choose from Gallery',
          onPress: () => pickImage(slotIndex, 'gallery'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const resetSlot = (slotIndex: number) => {
    setPictures(prev => prev.map(p =>
      p.index === slotIndex
        ? { ...p, uri: null, uploading: false, uploaded: false }
        : p
    ));
  };

  const pickImage = async (slotIndex: number, source: 'camera' | 'gallery') => {
    let previewing = false;
    try {
      let result: ImagePicker.ImagePickerResult;

      if (source === 'camera') {
        // Ask for the camera only when the user actually wants to use it.
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            'Camera access needed',
            'Allow camera access in your phone settings to take a photo, or choose one from your gallery.'
          );
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 5],
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 5],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];

        // Update local state immediately for preview
        setPictures(prev => prev.map(p =>
          p.index === slotIndex
            ? { ...p, uri: asset.uri, uploading: true, uploaded: false }
            : p
        ));
        previewing = true;

        // Downscale + re-encode before upload (never send the original).
        const resized = await manipulateAsync(
          asset.uri,
          asset.width && asset.width <= UPLOAD_MAX_WIDTH ? [] : [{ resize: { width: UPLOAD_MAX_WIDTH } }],
          { compress: 0.75, format: SaveFormat.JPEG, base64: true }
        );
        if (!resized.base64) throw new Error('Image processing failed');

        // Upload to server
        await uploadPicture(slotIndex, resized.base64, 'image/jpeg');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      if (previewing) resetSlot(slotIndex);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const uploadPicture = async (slotIndex: number, base64Data: string, contentType: string) => {
    try {
      const response = await fetch(apiUrl('/api/user/pictures/upload'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          picture_number: slotIndex,
          image_data: base64Data,
          content_type: contentType,
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.success && data.picture_url) {
        // Use the server URL (the local file uri was only a preview). The
        // local profile is synced from state by the effect above.
        setPictures(prev => prev.map(p =>
          p.index === slotIndex
            ? { ...p, uri: data.picture_url, uploading: false, uploaded: true }
            : p
        ));
      } else {
        const [title, message] = uploadErrorText(response.status, data?.detail);
        Alert.alert(title, message);
        resetSlot(slotIndex);
      }
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', 'Failed to upload picture. Please check your connection and try again.');
      resetSlot(slotIndex);
    }
  };

  const removePicture = async (slotIndex: number) => {
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(apiUrl(`/api/user/pictures/${userId}/${slotIndex}`), {
                method: 'DELETE',
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);

              // Update state (the local profile is synced from state by the effect above)
              resetSlot(slotIndex);
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Error', 'Failed to remove picture. Please try again.');
            }
          },
        },
      ]
    );
  };

  const backToProfile = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const handleContinue = () => {
    if (isFromProfile) {
      backToProfile();
    } else {
      // Continue to onboarding
      router.replace('/onboarding');
    }
  };

  const handleSkip = () => {
    if (isFromProfile) {
      backToProfile();
    } else {
      router.replace('/onboarding');
    }
  };

  const renderPictureSlot = (slot: PictureSlot) => {
    const isMainSlot = slot.index === 1;
    const isEmpty = !slot.uri;

    return (
      <TouchableOpacity
        key={slot.index}
        style={[
          styles.pictureSlot,
          isMainSlot && styles.mainSlot,
          !isMainSlot && styles.smallSlot,
        ]}
        onPress={() => isEmpty ? showImageOptions(slot.index) : removePicture(slot.index)}
        disabled={slot.uploading}
      >
        {slot.uploading ? (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.uploadingText}>Uploading...</Text>
          </View>
        ) : slot.uri ? (
          <>
            <Image source={{ uri: slot.uri }} style={styles.pictureImage} />
            <View style={styles.removeButton}>
              <Ionicons name="close-circle" size={24} color={COLORS.primary} />
            </View>
            {slot.uploaded && (
              <View style={styles.uploadedBadge}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptySlot}>
            <Ionicons 
              name={isMainSlot ? "camera" : "add"} 
              size={isMainSlot ? 40 : 28} 
              color={COLORS.textMuted} 
            />
            <Text style={styles.slotText}>
              {isMainSlot ? 'Main Photo' : `Photo ${slot.index}`}
            </Text>
            {isMainSlot && (
              <Text style={styles.requiredText}>Required</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isFromProfile ? 'Edit Photos' : 'Add Your Photos'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.scroll} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro Text */}
        <View style={styles.introSection}>
          <Text style={styles.title}>
            {isFromProfile ? 'Update Your Photos' : 'Show Your Best Self'}
          </Text>
          <Text style={styles.subtitle}>
            Add at least 1 photo to continue. Your main photo is what people see first.
          </Text>
        </View>

        {/* Main Photo - Large */}
        <View style={styles.mainPhotoSection}>
          {renderPictureSlot(pictures[0])}
        </View>

        {/* Additional Photos - Grid */}
        <View style={styles.additionalPhotosSection}>
          <Text style={styles.sectionLabel}>Additional Photos (Optional)</Text>
          <View style={styles.smallPhotosGrid}>
            {pictures.slice(1).map(renderPictureSlot)}
          </View>
        </View>

        {/* Tips */}
        <View style={styles.tipsSection}>
          <Text style={styles.tipsTitle}>Photo Tips</Text>
          <View style={styles.tip}>
            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
            <Text style={styles.tipText}>Clear, well-lit face photos work best</Text>
          </View>
          <View style={styles.tip}>
            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
            <Text style={styles.tipText}>Show your genuine smile</Text>
          </View>
          <View style={styles.tip}>
            <Ionicons name="close-circle" size={16} color="#F44336" />
            <Text style={styles.tipText}>Avoid group photos as your main</Text>
          </View>
        </View>

        {/* Progress Indicator */}
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(uploadedCount / 5) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {uploadedCount}/5 photos added {uploadedCount >= 1 ? '✓' : '(1 required)'}
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomAction}>
        {!isFromProfile && (
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={styles.continueText}>
            {isFromProfile ? 'Save Photos' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.l, paddingBottom: 120 },
  
  introSection: { marginBottom: SPACING.xl },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.s },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22 },
  
  mainPhotoSection: { alignItems: 'center', marginBottom: SPACING.l },
  
  pictureSlot: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  mainSlot: {
    width: '100%',
    aspectRatio: 4 / 5,
    maxHeight: 350,
  },
  smallSlot: {
    width: '48%',
    aspectRatio: 1,
  },
  
  emptySlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.m,
  },
  slotText: { fontSize: 13, color: COLORS.textMuted, marginTop: SPACING.xs },
  requiredText: { fontSize: 11, color: COLORS.primary, marginTop: 4 },
  
  pictureImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  
  uploadedBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'white',
    borderRadius: 10,
  },
  
  uploadingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  uploadingText: { color: 'white', marginTop: SPACING.s, fontSize: 12 },
  
  additionalPhotosSection: { marginBottom: SPACING.l },
  sectionLabel: { 
    fontSize: 13, 
    color: COLORS.textMuted, 
    marginBottom: SPACING.s,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  smallPhotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: SPACING.s,
  },
  
  tipsSection: {
    backgroundColor: COLORS.bgCard,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
    marginBottom: SPACING.l,
  },
  tipsTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.s },
  tip: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xs, gap: SPACING.xs },
  tipText: { fontSize: 13, color: COLORS.textSecondary },
  
  progressSection: { marginBottom: SPACING.l },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  progressText: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.m,
    paddingBottom: SPACING.xl,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
  },
  skipButton: {
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
  },
  skipText: { fontSize: 15, color: COLORS.textMuted },
  continueButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
    alignItems: 'center',
  },
  continueButtonDisabled: { backgroundColor: '#444' },
  continueText: { fontSize: 16, fontWeight: '600', color: 'white' },
});
