import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../Avatar';
import { COLORS } from './theme';
import type { MessageRequest } from './types';

interface Props {
  request: MessageRequest;
  onPress: () => void;
  onAccept: () => void;
  onDecline: () => void;
}

export const MessageRequestCard: React.FC<Props> = ({ request, onPress, onAccept, onDecline }) => {
  const user = request.from_user;

  return (
    <TouchableOpacity style={styles.requestCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.requestHeader}>
        <Avatar name={user?.name || 'U'} size={60} imageUrl={user?.avatar} />
        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{user?.name || 'Unknown'}{user?.age ? `, ${user.age}` : ''}</Text>
          <Text style={styles.requestLocation}>{user?.location || 'Unknown location'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </View>
      <Text style={styles.requestPreview} numberOfLines={2}>&quot;{request.preview}&quot;</Text>
      <View style={styles.requestActions}>
        <TouchableOpacity style={styles.declineBtn} onPress={(e) => { e.stopPropagation(); onDecline(); }}>
          <Ionicons name="close" size={20} color={COLORS.textSecondary} />
          <Text style={styles.declineBtnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.acceptBtn} onPress={(e) => { e.stopPropagation(); onAccept(); }}>
          <Ionicons name="checkmark" size={20} color="#FFF" />
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.requestHint}>Tap to view full conversation & profile</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  requestCard: { backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 16, marginVertical: 8 },
  requestHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  requestInfo: { marginLeft: 12, flex: 1 },
  requestName: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  requestLocation: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  requestPreview: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 16, fontStyle: 'italic', lineHeight: 20 },
  requestActions: { flexDirection: 'row', gap: 12 },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  declineBtnText: { color: COLORS.textSecondary, fontWeight: '500' },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 24, backgroundColor: COLORS.primary, gap: 6 },
  acceptBtnText: { color: '#FFF', fontWeight: '600' },
  requestHint: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 12, fontStyle: 'italic' },
});
