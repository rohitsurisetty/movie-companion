import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  Pressable, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from './theme';
import { UNMATCH_REASONS } from './constants';

interface Props {
  visible: boolean;
  onClose: () => void;
  userName: string;
  onUnmatch: (reason: string) => Promise<void>;
  onTransitionToReport: () => void;
}

export const UnmatchModal: React.FC<Props> = ({
  visible, onClose, userName, onUnmatch, onTransitionToReport,
}) => {
  const [step, setStep] = useState<'reason' | 'confirm_report'>('reason');
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

  const handleReasonSelect = (reasonId: string) => {
    setSelectedReason(reasonId);
    setStep('confirm_report');
  };

  const handleConfirmUnmatch = async (shouldReport: boolean) => {
    if (shouldReport) {
      onClose();
      onTransitionToReport();
    } else {
      setIsSubmitting(true);
      await onUnmatch(selectedReason || 'other');
      setIsSubmitting(false);
      setStep('reason');
      setSelectedReason(null);
      onClose();
    }
  };

  const handleClose = () => {
    setStep('reason');
    setSelectedReason(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={[styles.container, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {step === 'reason' ? (
            <>
              <View style={styles.iconContainer}>
                <View style={styles.iconBg}>
                  <Ionicons name="heart-dislike" size={32} color={COLORS.warning} />
                </View>
              </View>
              <Text style={styles.title}>Unmatch {userName}</Text>
              <Text style={styles.subtitle}>
                {"We'd love to understand why. This helps us improve your experience."}
              </Text>

              <ScrollView style={styles.reasonsList} showsVerticalScrollIndicator={false}>
                {UNMATCH_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason.id}
                    style={styles.reasonItem}
                    onPress={() => handleReasonSelect(reason.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={reason.icon as any} size={22} color={COLORS.textSecondary} />
                    <Text style={styles.reasonText}>{reason.label}</Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={styles.iconContainer}>
                <View style={[styles.iconBg, { backgroundColor: 'rgba(255, 184, 0, 0.15)' }]}>
                  <Ionicons name="help-circle" size={32} color={COLORS.warning} />
                </View>
              </View>
              <Text style={styles.title}>One more thing...</Text>
              <Text style={styles.subtitle}>
                Do you think this user should be reported for violating our community guidelines?
              </Text>

              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={[styles.confirmBtn, styles.confirmBtnNo]}
                  onPress={() => handleConfirmUnmatch(false)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={COLORS.text} />
                  ) : (
                    <>
                      <Ionicons name="close-circle-outline" size={22} color={COLORS.text} />
                      <Text style={styles.confirmBtnText}>No, just unmatch</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, styles.confirmBtnYes]}
                  onPress={() => handleConfirmUnmatch(true)}
                >
                  <Ionicons name="flag-outline" size={22} color="#FFF" />
                  <Text style={[styles.confirmBtnText, { color: '#FFF' }]}>Yes, report them</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => setStep('reason')} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={18} color={COLORS.textMuted} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  container: { backgroundColor: COLORS.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  header: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  closeBtn: { padding: 8 },
  iconContainer: { alignItems: 'center', marginBottom: 16 },
  iconBg: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255, 184, 0, 0.15)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: COLORS.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 20, paddingHorizontal: 16 },
  reasonsList: { maxHeight: 300 },
  reasonItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 14 },
  reasonText: { flex: 1, fontSize: 16, color: COLORS.text },
  confirmActions: { marginTop: 24, gap: 12 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 24, gap: 10 },
  confirmBtnNo: { backgroundColor: COLORS.bgInput, borderWidth: 1, borderColor: COLORS.border },
  confirmBtnYes: { backgroundColor: COLORS.primary },
  confirmBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 6 },
  backBtnText: { fontSize: 14, color: COLORS.textMuted },
});
