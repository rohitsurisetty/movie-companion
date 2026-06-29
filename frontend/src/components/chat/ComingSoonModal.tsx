import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { COLORS } from './theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  featureName: string;
}

export const ComingSoonModal: React.FC<Props> = ({ visible, onClose, featureName }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.overlay} onPress={onClose}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Text style={styles.emoji}>🚀</Text>
        </View>
        <Text style={styles.title}>Coming Soon</Text>
        <Text style={styles.text}>
          {featureName} is currently under development and will be available in a future update.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={onClose}>
          <Text style={styles.btnText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </Pressable>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { backgroundColor: COLORS.bgCard, borderRadius: 24, padding: 28, width: '100%', maxWidth: 320, alignItems: 'center' },
  iconWrap: { marginBottom: 16 },
  emoji: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  text: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  btn: { marginTop: 24, backgroundColor: COLORS.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24 },
  btnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
});
