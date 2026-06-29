import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../Avatar';
import { COLORS } from './theme';
import { formatTime } from './utils';
import type { Conversation } from './types';

interface Props {
  conversation: Conversation;
  onPress: () => void;
}

export const ConversationItem: React.FC<Props> = ({ conversation, onPress }) => {
  const user = conversation.other_user;
  const hasUnread = conversation.unread > 0;
  const isPending = conversation.is_pending || conversation.status === 'pending';
  const isUnmatched = conversation.is_unmatched || conversation.status === 'unmatched';

  return (
    <TouchableOpacity
      style={[styles.conversationItem, isUnmatched && styles.conversationItemUnmatched]}
      onPress={onPress}
      activeOpacity={0.7}
      testID={`conversation-row-${conversation.other_user_id}`}
    >
      <View style={[styles.conversationAvatar, isUnmatched && styles.conversationAvatarUnmatched]}>
        <Avatar
          name={user?.name || 'U'}
          size={56}
          imageUrl={isUnmatched ? undefined : user?.avatar}
        />
        {!isPending && !isUnmatched && <View style={styles.onlineDot} />}
        {isUnmatched && (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={11} color="#FFF" />
          </View>
        )}
      </View>
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <View style={styles.conversationNameRow}>
            <Text
              style={[
                styles.conversationName,
                hasUnread && !isUnmatched && styles.unreadName,
                isUnmatched && styles.unmatchedName,
              ]}
              numberOfLines={1}
            >
              {user?.name || 'Unknown'}
            </Text>
            {isPending && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>Pending</Text>
              </View>
            )}
            {isUnmatched && (
              <View style={styles.unmatchedBadge}>
                <Text style={styles.unmatchedBadgeText}>Unmatched</Text>
              </View>
            )}
          </View>
          <Text style={styles.conversationTime}>
            {formatTime(isUnmatched ? (conversation.unmatched_at || conversation.last_message_at) : conversation.last_message_at)}
          </Text>
        </View>
        <Text
          style={[
            styles.conversationPreview,
            hasUnread && !isUnmatched && styles.unreadPreview,
            isPending && styles.pendingPreview,
            isUnmatched && styles.unmatchedPreview,
          ]}
          numberOfLines={1}
        >
          {isUnmatched
            ? `${(user?.name || 'They').split(' ')[0]} ended this conversation`
            : (isPending ? `You: ${conversation.last_message || 'Message sent'}` : (conversation.last_message || 'Start a conversation'))}
        </Text>
      </View>
      {hasUnread && !isUnmatched ? (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{conversation.unread}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  conversationItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  conversationAvatar: { position: 'relative' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.online, borderWidth: 2, borderColor: COLORS.bg },
  conversationContent: { flex: 1, marginLeft: 14 },
  conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  conversationName: { fontSize: 16, fontWeight: '500', color: COLORS.text, flex: 1 },
  unreadName: { fontWeight: '700' },
  conversationTime: { fontSize: 12, color: COLORS.textMuted },
  conversationPreview: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  unreadPreview: { color: COLORS.text, fontWeight: '500' },
  unreadBadge: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, minWidth: 24, alignItems: 'center' },
  unreadBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  conversationNameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  pendingBadge: { backgroundColor: COLORS.warning, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  pendingBadgeText: { color: '#000', fontSize: 10, fontWeight: '600' },
  pendingPreview: { fontStyle: 'italic', color: COLORS.textMuted },
  conversationItemUnmatched: { opacity: 0.7 },
  conversationAvatarUnmatched: { opacity: 0.85 },
  lockBadge: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.textMuted, borderWidth: 2, borderColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  unmatchedName: { color: COLORS.textSecondary, fontWeight: '500' },
  unmatchedBadge: { backgroundColor: COLORS.bgCard, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  unmatchedBadgeText: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
  unmatchedPreview: { fontStyle: 'italic', color: COLORS.textMuted },
});
