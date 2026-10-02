import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator,
  ScrollView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { apiUrl, getUserId } from '../store';

// Photos are downscaled + re-encoded on-device; the original is never sent.
const UPLOAD_MAX_WIDTH = 1080;
const SLOT_COUNT = 5;

// Alert title/message for a failed upload. The backend `detail` is shown for
// 4xx errors only (5xx details can carry internals).
const uploadErrorText = (status: number, detail: unknown): [string, string] => {
  const msg = typeof detail === 'string' ? detail : '';
  if (status === 413) return ['Photo too large', msg || 'Please choose a smaller photo.'];
  if (status === 429) return ['Please wait', 'Too many uploads right now. Please try again shortly.'];
  if (status === 503) return ['Upload unavailable', 'Photo storage is temporarily unavailable. Please try again in a few minutes.'];
  if (status === 401 || status === 404) return ['Session expired', 'Please sign back in to upload photos.'];
  if (status >= 400 && status < 500 && msg) return ['Upload Failed', msg];
  return ['Upload Failed', 'Failed to upload picture. Please try again.'];
};

interface PhotoUploadStepProps {
  userId?: string;
  /** Called with the uploaded photo URLs in slot order (always an array). */
  onComplete: (pictures: string[]) => void;
  /** Photos already uploaded earlier in this flow, so back/forward doesn't force a re-upload. */
  initialPictures?: string[];
}

interface PictureSlot {
  index: number;
  uri: string | null;
  uploading: boolean;
  uploaded: boolean;
}

// Slot N <-> server picture_N; seeded in order from previously uploaded URLs.
const buildSlots = (urls: (string | null | undefined)[] = []): PictureSlot[] =>
  Array.from({ length: SLOT_COUNT }, (_, i) => {
    const uri = typeof urls[i] === 'string' && urls[i] ? (urls[i] as string) : null;
    return { index: i + 1, uri, uploading: false, uploaded: !!uri };
  });

export default function PhotoUploadStep({ userId: propUserId, onComplete, initialPictures }: PhotoUploadStepProps) {
  const router = useRouter();
  const [userId, setUserId] = useState<string>(propUserId || '');
  const [pictures, setPictures] = useState<PictureSlot[]>(() =>
    buildSlots(Array.isArray(initialPictures) ? initialPictures.filter(Boolean) : []),
  );
  // Set as soon as the user adds/removes a photo, so the background server
  // sync below can never overwrite their changes.
  const touchedRef = useRef(false);

  const uploadedCount = pictures.filter(p => p.uri && p.uploaded).length;
  const isUploading = pictures.some(p => p.uploading);
  const canContinue = uploadedCount >= 1 && !isUploading;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Prefer the id passed by onboarding (from getUserId()). Never fabricate
      // one: no id = not signed in, handled when an upload is attempted.
      const uid = propUserId || (await getUserId());
      if (cancelled || !uid) return;
      setUserId(uid);
      await syncFromServer(uid, () => cancelled);
    })();
    return () => { cancelled = true; };
  }, [propUserId]);

  // The server's slot mapping is authoritative (removePicture deletes by slot
  // number); initialPictures only seeds the first render. Ignored once the user
  // has changed a slot, on any error, or when the server has none (so a
  // storage hiccup never forces a re-upload).
  const syncFromServer = async (uid: string, isCancelled: () => boolean) => {
    try {
      const response = await fetch(apiUrl(`/api/user/pictures/${uid}`));
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      const server = data?.success ? data.pictures : null;
      if (!server || typeof server !== 'object' || isCancelled() || touchedRef.current) return;
      const urls = Array.from({ length: SLOT_COUNT }, (_, i) => server[`picture_${i + 1}`]);
      if (!urls.some((u) => typeof u === 'string' && u)) return;
      setPictures(buildSlots(urls));
    } catch (error) {
      // Offline etc. — keep the seeded photos.
    }
  };

  const resetSlot = (slotIndex: number) => {
    setPictures(prev => prev.map(p =>
      p.index === slotIndex
        ? { ...p, uri: null, uploading: false, uploaded: false }
        : p
    ));
  };

  const showImageOptions = (slotIndex: number) => {
    if (Platform.OS === 'web') {
      pickImage(slotIndex, 'gallery');
      return;
    }
    
    Alert.alert(
      'Add Photo',
      'Choose how you want to add your photo',
      [
        { text: 'Take Photo', onPress: () => pickImage(slotIndex, 'camera') },
        { text: 'Choose from Gallery', onPress: () => pickImage(slotIndex, 'gallery') },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const pickImage = async (slotIndex: number, source: 'camera' | 'gallery') => {
    let previewing = false;
    try {
      let result: ImagePicker.ImagePickerResult;

      // No `base64` from the picker: the original can be many MB. A resized
      // copy is encoded below and only that is sent.
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.8,
      };

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
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        touchedRef.current = true;

        // Local preview while resizing + uploading.
        setPictures(prev => prev.map(p =>
          p.index === slotIndex
            ? { ...p, uri: asset.uri, uploading: true, uploaded: false }
            : p
        ));
        previewing = true;

        const resized = await manipulateAsync(
          asset.uri,
          asset.width && asset.width <= UPLOAD_MAX_WIDTH ? [] : [{ resize: { width: UPLOAD_MAX_WIDTH } }],
          { compress: 0.75, format: SaveFormat.JPEG, base64: true }
        );
        if (!resized.base64) throw new Error('Image processing failed');

        await uploadPicture(slotIndex, resized.base64, 'image/jpeg');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      if (previewing) resetSlot(slotIndex);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const uploadPicture = async (slotIndex: number, base64Data: string, contentType: string) => {
    // Never upload under a made-up id: no id means not signed in.
    const uid = userId || (await getUserId());
    if (!uid) {
      resetSlot(slotIndex);
      Alert.alert('Session expired', 'Please sign back in before uploading photos.');
      router.replace('/');
      return;
    }
    try {
      // Auth header is added by the global fetch wrapper; no session id in the body.
      const response = await fetch(apiUrl('/api/user/pictures/upload'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: uid,
          picture_number: slotIndex,
          image_data: base64Data,
          content_type: contentType,
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.success && data.picture_url) {
        // Use the server URL (the local file uri was only a preview).
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

  const removePicture = (slotIndex: number) => {
    Alert.alert(
      'Remove Photo',
      'Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            touchedRef.current = true;
            const uid = userId || (await getUserId());
            if (!uid) {
              router.replace('/');
              return;
            }
            try {
              const response = await fetch(apiUrl(`/api/user/pictures/${uid}/${slotIndex}`), {
                method: 'DELETE',
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              resetSlot(slotIndex);
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Error', 'Failed to remove photo. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleContinue = () => {
    const uploadedPictures = pictures
      .filter(p => p.uri && p.uploaded)
      .map(p => p.uri as string);
    onComplete(uploadedPictures);
  };

  const renderSlot = (slot: PictureSlot, isMain: boolean) => (
    <TouchableOpacity
      key={slot.index}
      style={[styles.slot, isMain ? styles.mainSlot : styles.smallSlot]}
      onPress={() => slot.uri ? removePicture(slot.index) : showImageOptions(slot.index)}
      disabled={slot.uploading}
      activeOpacity={0.8}
    >
      {slot.uploading ? (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : slot.uri ? (
        <>
          <Image source={{ uri: slot.uri }} style={styles.image} />
          <View style={styles.removeBtn}>
            <Ionicons name="close-circle" size={28} color={COLORS.primary} />
          </View>
          {slot.uploaded && (
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark-circle" size={22} color="#00D26A" />
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptySlot}>
          <View style={[styles.addIcon, isMain && styles.addIconLarge]}>
            <Ionicons 
              name={isMain ? "camera" : "add"} 
              size={isMain ? 36 : 24} 
              color={COLORS.primary} 
            />
          </View>
          <Text style={[styles.slotLabel, isMain && styles.mainSlotLabel]}>
            {isMain ? 'Main Photo' : `Photo ${slot.index}`}
          </Text>
          {isMain && <Text style={styles.requiredLabel}>Required</Text>}
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Add Your Photos</Text>
        <Text style={styles.subtitle}>
          Your photos help others get to know you. Add at least 1 to continue.
        </Text>

        {/* Main Photo */}
        <View style={styles.mainSection}>
          {renderSlot(pictures[0], true)}
        </View>

        {/* Additional Photos */}
        <Text style={styles.sectionLabel}>Additional Photos</Text>
        <View style={styles.grid}>
          {pictures.slice(1).map(slot => renderSlot(slot, false))}
        </View>

        {/* Progress */}
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(uploadedCount / 5) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {uploadedCount}/5 photos {uploadedCount >= 1 ? '✓' : ''}
          </Text>
        </View>
      </ScrollView>

      {/* Continue Button - Fixed at bottom, always visible */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xl },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.text, marginBottom: SPACING.xs },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22, marginBottom: SPACING.xl },
  
  mainSection: { marginBottom: SPACING.l },
  sectionLabel: { 
    fontSize: 13, 
    color: COLORS.textMuted, 
    textTransform: 'uppercase', 
    letterSpacing: 1,
    marginBottom: SPACING.s,
  },
  
  slot: {
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
    maxHeight: 320,
  },
  smallSlot: {
    width: '48%',
    aspectRatio: 1,
  },
  
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: SPACING.s,
  },
  
  emptySlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(229,9,20,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  addIconLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  slotLabel: { fontSize: 13, color: COLORS.textMuted },
  mainSlotLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  requiredLabel: { fontSize: 12, color: COLORS.primary, marginTop: 4 },
  
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'white',
    borderRadius: 14,
  },
  checkBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'white',
    borderRadius: 11,
  },
  uploadingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  
  progressSection: { marginTop: SPACING.xl, marginBottom: SPACING.l },
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
  progressText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  
  bottomContainer: {
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
    backgroundColor: COLORS.bg,
  },
  continueBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { fontSize: 16, fontWeight: 'bold', color: 'white' },
});
