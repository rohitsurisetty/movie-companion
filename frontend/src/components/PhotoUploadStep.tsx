import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator,
  ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { getAuth } from '../store';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface PhotoUploadStepProps {
  userId?: string;
  onNext: (pictures?: string[]) => void;
  onBack?: () => void;
}

interface PictureSlot {
  index: number;
  uri: string | null;
  uploading: boolean;
  uploaded: boolean;
}

export default function PhotoUploadStep({ userId: propUserId, onNext, onBack }: PhotoUploadStepProps) {
  const [userId, setUserId] = useState<string>(propUserId || '');
  const [sessionId, setSessionId] = useState<string>('');
  const [pictures, setPictures] = useState<PictureSlot[]>([
    { index: 1, uri: null, uploading: false, uploaded: false },
    { index: 2, uri: null, uploading: false, uploaded: false },
    { index: 3, uri: null, uploading: false, uploaded: false },
    { index: 4, uri: null, uploading: false, uploaded: false },
    { index: 5, uri: null, uploading: false, uploaded: false },
  ]);

  const uploadedCount = pictures.filter(p => p.uri && p.uploaded).length;
  const canContinue = uploadedCount >= 1;

  useEffect(() => {
    if (!propUserId) {
      initAuth();
    } else {
      setUserId(propUserId);
      setSessionId(`session_${Date.now()}`);
    }
  }, [propUserId]);

  const initAuth = async () => {
    const auth = await getAuth();
    if (auth?.user_id) {
      setUserId(auth.user_id);
      setSessionId(auth.session_id || `session_${Date.now()}`);
    } else {
      const tempId = `user_${Date.now()}`;
      setUserId(tempId);
      setSessionId(`session_${Date.now()}`);
    }
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
      ]
    );
  };

  const pickImage = async (slotIndex: number, source: 'camera' | 'gallery') => {
    try {
      let result: ImagePicker.ImagePickerResult;

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.8,
        base64: true,
      };

      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Please select an image under 10MB.');
          return;
        }

        setPictures(prev => prev.map(p => 
          p.index === slotIndex 
            ? { ...p, uri: asset.uri, uploading: true, uploaded: false }
            : p
        ));

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
      setPictures(prev => prev.map(p => 
        p.index === slotIndex 
          ? { ...p, uri: null, uploading: false, uploaded: false }
          : p
      ));
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
            try {
              await fetch(`${API_BASE}/api/user/pictures/${userId}/${slotIndex}`, {
                method: 'DELETE',
              });
              setPictures(prev => prev.map(p => 
                p.index === slotIndex 
                  ? { ...p, uri: null, uploading: false, uploaded: false }
                  : p
              ));
            } catch (error) {
              console.error('Delete error:', error);
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
    onNext(uploadedPictures);
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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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

      {/* Continue Button - Always shown, enabled only when at least 1 photo */}
      <TouchableOpacity
        style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
        onPress={handleContinue}
        disabled={!canContinue}
      >
        <Text style={styles.continueBtnText}>Continue</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  
  continueBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { fontSize: 16, fontWeight: 'bold', color: 'white' },
});
