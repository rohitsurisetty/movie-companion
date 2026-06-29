import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE, COLORS } from './theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  otherUserName: string;
  conversationId: string;
  userId: string;
}

export const DidYouMeetModal: React.FC<Props> = ({
  visible, onClose, otherUserName, conversationId, userId,
}) => {
  const [step, setStep] = useState<'initial' | 'verification'>('initial');
  const [, setDidMeet] = useState<boolean | null>(null);

  const handleInitialResponse = async (met: boolean) => {
    setDidMeet(met);
    if (met) {
      setStep('verification');
    } else {
      await saveMeetingResponse(false, null);
      Alert.alert('Got it!', 'Thanks for letting us know. Hope you get to meet soon!');
      resetAndClose();
    }
  };

  const handleVerificationResponse = async (samePerson: 'yes' | 'no' | 'partially') => {
    await saveMeetingResponse(true, samePerson);
    if (samePerson === 'yes') {
      Alert.alert('Great! 🎉', 'Glad you had a good experience meeting in person!');
    } else if (samePerson === 'no') {
      Alert.alert('Thanks for reporting', 'This helps us keep the community safe. You can report this user if needed.');
    } else {
      Alert.alert('Thanks!', 'We appreciate your feedback.');
    }
    resetAndClose();
  };

  const saveMeetingResponse = async (met: boolean, verification: string | null) => {
    try {
      await fetch(`${API_BASE}/api/chat/meeting-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          user_id: userId,
          did_meet: met,
          verification_result: verification,
          reported_at: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Error saving meeting response:', error);
    }
  };

  const resetAndClose = () => {
    setStep('initial');
    setDidMeet(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={resetAndClose}>
      <Pressable style={styles.meetModalOverlay} onPress={resetAndClose}>
        <View style={styles.meetModalContainer}>
          {step === 'initial' ? (
            <>
              <View style={styles.meetModalIcon}>
                <Ionicons name="cafe" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.meetModalTitle}>Did you meet {otherUserName}?</Text>
              <Text style={styles.meetModalSubtitle}>This helps us improve safety and trust</Text>

              <View style={styles.meetModalActions}>
                <TouchableOpacity style={styles.meetModalBtn} onPress={() => handleInitialResponse(false)}>
                  <Ionicons name="close-circle-outline" size={24} color={COLORS.textSecondary} />
                  <Text style={styles.meetModalBtnText}>Not Yet</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.meetModalBtn, styles.meetModalBtnPrimary]}
                  onPress={() => handleInitialResponse(true)}
                >
                  <Ionicons name="checkmark-circle-outline" size={24} color="#FFF" />
                  <Text style={[styles.meetModalBtnText, { color: '#FFF' }]}>Yes!</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.meetModalIcon}>
                <Ionicons name="shield-checkmark" size={40} color={COLORS.success} />
              </View>
              <Text style={styles.meetModalTitle}>Was it the same person?</Text>
              <Text style={styles.meetModalSubtitle}>Did they match their profile photos?</Text>

              <View style={styles.meetVerificationOptions}>
                <TouchableOpacity style={styles.meetVerificationBtn} onPress={() => handleVerificationResponse('yes')}>
                  <Ionicons name="checkmark-circle" size={28} color={COLORS.success} />
                  <Text style={styles.meetVerificationBtnText}>Yes, same person</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.meetVerificationBtn} onPress={() => handleVerificationResponse('partially')}>
                  <Ionicons name="help-circle" size={28} color={COLORS.warning} />
                  <Text style={styles.meetVerificationBtnText}>Partially different</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.meetVerificationBtn} onPress={() => handleVerificationResponse('no')}>
                  <Ionicons name="close-circle" size={28} color={COLORS.primary} />
                  <Text style={styles.meetVerificationBtnText}>No, different person</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  meetModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  meetModalContainer: { backgroundColor: COLORS.bgCard, borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, alignItems: 'center' },
  meetModalIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(229,9,20,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  meetModalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, textAlign: 'center' },
  meetModalSubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8 },
  meetModalActions: { flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' },
  meetModalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  meetModalBtnPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  meetModalBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  meetVerificationOptions: { marginTop: 24, width: '100%', gap: 12 },
  meetVerificationBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, backgroundColor: COLORS.bgInput, gap: 12 },
  meetVerificationBtnText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
});
