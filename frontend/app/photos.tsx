import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator,
  ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { getAuth, saveProfile, getProfile } from '../src/store';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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
  const [sessionId, setSessionId] = useState<string>('');
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

  useEffect(() => {
    initializeScreen();
  }, []);

  const initializeScreen = async () => {
    try {
      // Get user auth
      const auth = await getAuth();
      if (auth?.user_id) {
        setUserId(auth.user_id);
        setSessionId(auth.session_id || `session_${Date.now()}`);
        
        // Fetch existing pictures
        await fetchExistingPictures(auth.user_id);
      } else {
        // Create a temporary user ID for guests
        const tempId = `guest_${Date.now()}`;
        setUserId(tempId);
        setSessionId(`session_${Date.now()}`);
      }
      
      // Request permissions only on native (not web)
      if (Platform.OS !== 'web') {
        try {
          await ImagePicker.requestCameraPermissionsAsync();
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        } catch (permError) {
          console.log('Permission request not available:', permError);
        }
      }
    } catch (error) {
      console.error('Init error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchExistingPictures = async (uid: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/user/pictures/${uid}`);
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

  const pickImage = async (slotIndex: number, source: 'camera' | 'gallery') => {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 5],
          quality: 0.8,
          base64: true,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 5],
          quality: 0.8,
          base64: true,
        });
      }

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // Check file size (10MB max)
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Please select an image under 10MB.');
          return;
        }

        // Update local state immediately for preview
        setPictures(prev => prev.map(p => 
          p.index === slotIndex 
            ? { ...p, uri: asset.uri, uploading: true, uploaded: false }
            : p
        ));

        // Upload to server
        await uploadPicture(slotIndex, asset.base64!, asset.mimeType || 'image/jpeg');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const uploadPicture = async (slotIndex: number, base64Data: string, contentType: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/user/pictures/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          session_id: sessionId,
          picture_number: slotIndex,
          image_data: base64Data,
          content_type: contentType,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update state with the new picture
        const newPictures = pictures.map(p => 
          p.index === slotIndex 
            ? { ...p, uri: data.picture_url, uploading: false, uploaded: true }
            : p
        );
        setPictures(newPictures);
        
        // Save ALL pictures to local profile storage for reliable sync
        const profile = await getProfile();
        const allPictureUrls = newPictures
          .filter(p => p.uri && p.uploaded)
          .map(p => p.uri as string);
        
        const updatedProfile = {
          ...(profile || {}),
          userId: userId,
          profilePicture: allPictureUrls[0] || null, // First photo is primary
          pictures: allPictureUrls, // Store all photos
        };
        
        await saveProfile(updatedProfile);
        console.log('[Photos] Saved', allPictureUrls.length, 'photos to local profile');
      } else {
        throw new Error(data.detail || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', 'Failed to upload picture. Please try again.');
      
      setPictures(prev => prev.map(p => 
        p.index === slotIndex 
          ? { ...p, uri: null, uploading: false, uploaded: false }
          : p
      ));
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
              await fetch(`${API_BASE}/api/user/pictures/${userId}/${slotIndex}?session_id=${sessionId}`, {
                method: 'DELETE',
              });

              // Update state
              const newPictures = pictures.map(p => 
                p.index === slotIndex 
                  ? { ...p, uri: null, uploading: false, uploaded: false }
                  : p
              );
              setPictures(newPictures);
              
              // Sync to local profile storage
              const profile = await getProfile();
              const remainingPictureUrls = newPictures
                .filter(p => p.uri && p.uploaded)
                .map(p => p.uri as string);
              
              const updatedProfile = {
                ...(profile || {}),
                profilePicture: remainingPictureUrls[0] || null,
                pictures: remainingPictureUrls,
              };
              
              await saveProfile(updatedProfile);
              console.log('[Photos] Updated local profile after delete, remaining:', remainingPictureUrls.length);
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Error', 'Failed to remove picture.');
            }
          },
        },
      ]
    );
  };

  const handleContinue = () => {
    if (isFromProfile) {
      router.replace('/(tabs)/profile');
    } else {
      // Continue to onboarding
      router.replace('/onboarding');
    }
  };

  const handleSkip = () => {
    if (isFromProfile) {
      router.replace('/(tabs)/profile');
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
  container: { flex: 1, backgroundColor: COLORS.bgDark },
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
    backgroundColor: COLORS.bgDark,
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
