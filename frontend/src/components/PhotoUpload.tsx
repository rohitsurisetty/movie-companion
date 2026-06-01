import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator,
  ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface PhotoUploadProps {
  userId: string;
  sessionId: string;
  onComplete: (pictures: string[]) => void;
  onSkip?: () => void;
  initialPictures?: (string | null)[];
  minRequired?: number;
  isOnboarding?: boolean;
}

interface PictureSlot {
  index: number;
  uri: string | null;
  uploading: boolean;
  uploaded: boolean;
}

export default function PhotoUpload({
  userId,
  sessionId,
  onComplete,
  onSkip,
  initialPictures = [],
  minRequired = 1,
  isOnboarding = true,
}: PhotoUploadProps) {
  const [pictures, setPictures] = useState<PictureSlot[]>([
    { index: 1, uri: initialPictures[0] || null, uploading: false, uploaded: !!initialPictures[0] },
    { index: 2, uri: initialPictures[1] || null, uploading: false, uploaded: !!initialPictures[1] },
    { index: 3, uri: initialPictures[2] || null, uploading: false, uploaded: !!initialPictures[2] },
    { index: 4, uri: initialPictures[3] || null, uploading: false, uploaded: !!initialPictures[3] },
    { index: 5, uri: initialPictures[4] || null, uploading: false, uploaded: !!initialPictures[4] },
  ]);
  const [uploading, setUploading] = useState(false);

  const uploadedCount = pictures.filter(p => p.uri && p.uploaded).length;
  const canContinue = uploadedCount >= minRequired;

  useEffect(() => {
    // Request permissions on mount
    (async () => {
      if (Platform.OS !== 'web') {
        const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
        const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        
        if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
          Alert.alert(
            'Permissions Required',
            'Please allow camera and photo library access to upload profile pictures.',
            [{ text: 'OK' }]
          );
        }
      }
    })();
  }, []);

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
        // Update with server URL
        setPictures(prev => prev.map(p => 
          p.index === slotIndex 
            ? { ...p, uri: data.picture_url, uploading: false, uploaded: true }
            : p
        ));
      } else {
        throw new Error(data.detail || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', 'Failed to upload picture. Please try again.');
      
      // Reset slot on failure
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
              // Delete from server
              await fetch(`${API_BASE}/api/user/pictures/${userId}/${slotIndex}?session_id=${sessionId}`, {
                method: 'DELETE',
              });

              // Update local state
              setPictures(prev => prev.map(p => 
                p.index === slotIndex 
                  ? { ...p, uri: null, uploading: false, uploaded: false }
                  : p
              ));
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
    const uploadedPictures = pictures
      .filter(p => p.uri && p.uploaded)
      .map(p => p.uri!);
    
    onComplete(uploadedPictures);
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
            {isMainSlot && minRequired > 0 && (
              <Text style={styles.requiredText}>Required</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        style={styles.scroll} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Add Your Photos</Text>
          <Text style={styles.subtitle}>
            {isOnboarding 
              ? "Show your best self! Add at least 1 photo to continue."
              : "Update your profile photos. Tap a photo to change or remove it."}
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
            {uploadedCount}/5 photos added {uploadedCount >= minRequired ? '✓' : `(${minRequired} required)`}
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomAction}>
        {onSkip && (
          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue || uploading}
        >
          {uploading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.continueText}>
              {isOnboarding ? 'Continue' : 'Save Photos'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.l, paddingBottom: 120 },
  
  header: { marginBottom: SPACING.xl },
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
