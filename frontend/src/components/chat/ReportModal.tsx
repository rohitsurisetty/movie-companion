import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  Pressable, ActivityIndicator, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from './theme';
import { REPORT_REASONS } from './constants';

interface Props {
  visible: boolean;
  onClose: () => void;
  userName: string;
  onReport: (reason: string, details?: string) => Promise<void>;
  onUnmatchInstead: () => void;
}

export const ReportModal: React.FC<Props> = ({
  visible, onClose, userName, onReport, onUnmatchInstead,
}) => {
  const [step, setStep] = useState<'intro' | 'reasons' | 'details' | 'confirmation'>('intro');
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

  const handleStartReport = () => setStep('reasons');

  const handleReasonSelect = (reasonId: string) => {
    setSelectedReason(reasonId);
    setStep('details');
  };

  const handleSubmitReport = async () => {
    setIsSubmitting(true);
    await onReport(selectedReason || 'other', additionalDetails || undefined);
    setIsSubmitting(false);
    setStep('confirmation');
  };

  const handleClose = () => {
    setStep('intro');
    setSelectedReason(null);
    setAdditionalDetails('');
    onClose();
  };

  const handleUnmatchInstead = () => {
    handleClose();
    onUnmatchInstead();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={[styles.container, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {step === 'intro' && (
            <>
              <Text style={styles.title}>Report {userName}</Text>
              <Text style={styles.introText}>
                {"Let us know when someone's broken our guidelines. They won't know that you've reported them, or why."}
              </Text>

              <View style={styles.stepsContainer}>
                <View style={styles.step}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                  <Text style={styles.stepText}>Let us know what happened</Text>
                </View>
                <View style={styles.step}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                  <Text style={styles.stepText}>{"We'll investigate your report"}</Text>
                </View>
                <View style={styles.step}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                  <Text style={styles.stepText}>{"We'll keep you updated"}</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.unmatchOption} onPress={handleUnmatchInstead}>
                <Ionicons name="heart-dislike-outline" size={22} color={COLORS.textSecondary} />
                <View style={styles.unmatchOptionText}>
                  <Text style={styles.unmatchOptionTitle}>{"Don't think they've broken our guidelines?"}</Text>
                  <Text style={styles.unmatchOptionSubtitle}>Unmatch instead</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.startBtn} onPress={handleStartReport}>
                <Text style={styles.startBtnText}>Start report</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.unmatchBtn} onPress={handleUnmatchInstead}>
                <Text style={styles.unmatchBtnText}>Unmatch instead</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'reasons' && (
            <>
              <Text style={styles.title}>Report</Text>
              <Text style={styles.subtitle}>
                {"Don't worry, your feedback is anonymous and they won't know that you've blocked or reported them."}
              </Text>

              <ScrollView style={styles.reasonsList} showsVerticalScrollIndicator={false}>
                {REPORT_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason.id}
                    style={styles.reasonItem}
                    onPress={() => handleReasonSelect(reason.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.reasonText}>{reason.label}</Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity onPress={() => setStep('intro')} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={18} color={COLORS.textMuted} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'details' && (
            <>
              <Text style={styles.title}>Tell us more</Text>
              <Text style={styles.subtitle}>
                Provide any additional details that might help us investigate. (Optional)
              </Text>

              <TextInput
                style={styles.detailsInput}
                placeholder="What happened? Share any relevant details..."
                placeholderTextColor={COLORS.textMuted}
                value={additionalDetails}
                onChangeText={setAdditionalDetails}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
              <Text style={styles.detailsCount}>{additionalDetails.length}/500</Text>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSubmitReport}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Report</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setStep('reasons')} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={18} color={COLORS.textMuted} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'confirmation' && (
            <>
              <View style={styles.confirmationIcon}>
                <Ionicons name="shield-checkmark" size={48} color={COLORS.success} />
              </View>
              <Text style={styles.title}>Thank you</Text>
              <Text style={styles.confirmationText}>
                Our trust and safety team will review this report. We take every report seriously and will take appropriate action.
              </Text>

              <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  container: { backgroundColor: COLORS.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  closeBtn: { padding: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 20, paddingHorizontal: 16 },
  introText: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12, marginBottom: 24, lineHeight: 22, paddingHorizontal: 16 },
  stepsContainer: { marginBottom: 24 },
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 16 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  stepNumberText: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
  stepText: { fontSize: 15, color: COLORS.text, flex: 1 },
  unmatchOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgInput, borderRadius: 16, padding: 16, marginBottom: 24, gap: 14 },
  unmatchOptionText: { flex: 1 },
  unmatchOptionTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  unmatchOptionSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  startBtn: { backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginBottom: 12 },
  startBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  unmatchBtn: { paddingVertical: 12, alignItems: 'center' },
  unmatchBtnText: { fontSize: 16, fontWeight: '500', color: COLORS.textSecondary },
  reasonsList: { maxHeight: 400 },
  reasonItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  reasonText: { fontSize: 16, color: COLORS.text },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, gap: 6 },
  backBtnText: { fontSize: 14, color: COLORS.textMuted },
  detailsInput: { backgroundColor: COLORS.bgInput, borderRadius: 16, padding: 16, fontSize: 15, color: COLORS.text, minHeight: 120, textAlignVertical: 'top', marginTop: 16 },
  detailsCount: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: 8 },
  submitBtn: { backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginTop: 20 },
  submitBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  confirmationIcon: { alignItems: 'center', marginBottom: 20, marginTop: 20 },
  confirmationText: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 22, paddingHorizontal: 16 },
  doneBtn: { backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginTop: 32 },
  doneBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
