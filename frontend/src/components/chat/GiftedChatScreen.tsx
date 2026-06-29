import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  Pressable, Platform, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GiftedChat, Bubble, IMessage } from 'react-native-gifted-chat';
import { Avatar } from '../Avatar';
import { API_BASE, COLORS } from './theme';
import type { Conversation, BackendMessage } from './types';
import { ProfileBottomSheet } from './ProfileBottomSheet';
import { DidYouMeetModal } from './DidYouMeetModal';
import { ComingSoonModal } from './ComingSoonModal';
import { UnmatchModal } from './UnmatchModal';
import { ReportModal } from './ReportModal';

interface Props {
  conversation: Conversation;
  userId: string;
  onBack: () => void;
  isReadOnly?: boolean;
  otherUserNameOverride?: string;
}

export const GiftedChatScreen: React.FC<Props> = ({
  conversation, userId, onBack, isReadOnly = false, otherUserNameOverride,
}) => {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [, setShowSuggestions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showDidYouMeet, setShowDidYouMeet] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnmatchModal, setShowUnmatchModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [inputText, setInputText] = useState('');

  const otherUser = conversation.other_user;
  const otherUserId = conversation.other_user_id;
  const displayName = otherUserNameOverride || otherUser?.name || 'Unknown';

  const showComingSoonModal = (feature: string) => {
    setComingSoonFeature(feature);
    setShowComingSoon(true);
  };

  const convertToGiftedMessages = (backendMessages: BackendMessage[]): IMessage[] => {
    return backendMessages.map((msg) => ({
      _id: msg.message_id,
      text: msg.content,
      createdAt: new Date(msg.created_at),
      user: {
        _id: msg.sender_id,
        name: msg.sender_id === userId ? 'You' : otherUser?.name || 'Unknown',
        avatar: msg.sender_id === userId || isReadOnly ? undefined : otherUser?.avatar,
      },
    }));
  };

  useEffect(() => {
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.conversation_id]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[0];
      const otherPersonSentLast = lastMessage.user._id !== userId;
      setShowSuggestions(otherPersonSentLast && suggestions.length > 0);
    }
  }, [messages, suggestions, userId]);

  const fetchMessages = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/messages/${conversation.conversation_id}`);
      if (response.ok) {
        const data = await response.json();
        const giftedMessages = convertToGiftedMessages(data.messages || []);
        setMessages(giftedMessages);

        if (userId) {
          await fetch(`${API_BASE}/api/chat/read/${conversation.conversation_id}?user_id=${encodeURIComponent(userId)}`, { method: 'POST' });
        }

        if (data.messages && data.messages.length > 0) {
          fetchSuggestions();
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/reply-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          conversation_id: conversation.conversation_id,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };

  const onSend = useCallback(async (newMessages: IMessage[] = []) => {
    const messageText = newMessages[0]?.text;
    if (!messageText?.trim()) return;

    setMessages(previousMessages => GiftedChat.append(previousMessages, newMessages));
    setShowSuggestions(false);
    setSuggestions([]);

    try {
      await fetch(`${API_BASE}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: userId,
          receiver_id: otherUserId,
          content: messageText.trim(),
          message_type: 'text',
        }),
      });

      setIsTyping(true);
      setTimeout(async () => {
        setIsTyping(false);
        await fetchMessages();
      }, 4000);
    } catch (error) {
      console.error('Error sending message:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, otherUserId, conversation.conversation_id]);

  const handleUnmatchWithReason = async (reason: string) => {
    try {
      await fetch(`${API_BASE}/api/chat/unmatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, other_user_id: otherUserId, reason }),
      });
      onBack();
    } catch (error) {
      console.error('Error unmatching:', error);
    }
  };

  const handleReportWithDetails = async (reason: string, details?: string) => {
    try {
      await fetch(`${API_BASE}/api/chat/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporter_id: userId,
          reported_id: otherUserId,
          reason,
          details: details || null,
        }),
      });
      await fetch(`${API_BASE}/api/chat/unmatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, other_user_id: otherUserId, reason: 'reported' }),
      });
    } catch (error) {
      console.error('Error reporting:', error);
    }
  };

  const renderBubble = (props: any) => (
    <Bubble
      {...props}
      wrapperStyle={{
        right: { backgroundColor: COLORS.primary, marginRight: 8 },
        left: { backgroundColor: COLORS.bgCard, marginLeft: 8 },
      }}
      textStyle={{
        right: { color: '#FFF' },
        left: { color: COLORS.text },
      }}
      timeTextStyle={{
        right: { color: 'rgba(255,255,255,0.6)' },
        left: { color: COLORS.textMuted },
      }}
    />
  );

  const handleSendPress = () => {
    if (inputText.trim()) {
      onSend([{
        _id: Math.random().toString(),
        text: inputText.trim(),
        createdAt: new Date(),
        user: { _id: userId, name: 'You' },
      }]);
      setInputText('');
    }
  };

  const handleSuggestionPress = (suggestion: string) => {
    onSend([{
      _id: Math.random().toString(),
      text: suggestion,
      createdAt: new Date(),
      user: { _id: userId, name: 'You' },
    }]);
  };

  const renderInputToolbar = () => null;
  const renderComposer = () => null;
  const renderSend = () => null;

  const renderAvatar = (props: any) => {
    const user = props.currentMessage?.user;
    if (user?._id === userId) return null;

    if (isReadOnly) {
      return (
        <View>
          <Avatar name={user?.name || 'U'} size={36} imageUrl={undefined} />
        </View>
      );
    }

    return (
      <TouchableOpacity onPress={() => setShowProfile(true)}>
        <Avatar name={user?.name || 'U'} size={36} imageUrl={user?.avatar} />
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.chatContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </TouchableOpacity>

        {isReadOnly ? (
          <View style={styles.chatHeaderReadOnly}>
            <Text style={styles.chatHeaderName}>{displayName}</Text>
            <Text style={styles.chatHeaderUnmatched}>Conversation ended</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.chatHeaderProfile} onPress={() => setShowProfile(true)}>
            <Avatar name={otherUser?.name || 'U'} size={40} imageUrl={otherUser?.avatar} />
            <View style={styles.chatHeaderInfo}>
              <Text style={styles.chatHeaderName}>{displayName}</Text>
              <Text style={styles.chatHeaderStatus}>
                {isTyping ? 'typing...' : 'Online'}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {isReadOnly ? (
          <TouchableOpacity style={styles.headerActionBtn} onPress={() => setShowMenu(true)}>
            <Ionicons name="ellipsis-vertical" size={22} color={COLORS.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.chatHeaderActions}>
            <TouchableOpacity style={styles.headerActionBtn} onPress={() => showComingSoonModal('Voice Calls')}>
              <Ionicons name="call-outline" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerActionBtn} onPress={() => showComingSoonModal('Video Calls')}>
              <Ionicons name="videocam-outline" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerActionBtn} onPress={() => setShowMenu(true)}>
              <Ionicons name="ellipsis-vertical" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <GiftedChat
            messages={messages}
            onSend={onSend}
            user={{ _id: userId, name: 'You' }}
            renderBubble={renderBubble}
            renderInputToolbar={renderInputToolbar}
            renderComposer={renderComposer}
            renderSend={renderSend}
            renderAvatar={renderAvatar}
            scrollToBottom
            isTyping={isTyping}
            infiniteScroll
            inverted={true}
            renderUsernameOnMessage={false}
            showUserAvatar={false}
            showAvatarForEveryMessage={false}
            renderAvatarOnTop
            messagesContainerStyle={styles.messagesContainer}
            bottomOffset={0}
            minInputToolbarHeight={0}
            listViewProps={{
              style: { backgroundColor: COLORS.bg },
              keyboardDismissMode: 'interactive',
              keyboardShouldPersistTaps: 'handled',
            }}
          />

          {isReadOnly ? (
            <View style={styles.readOnlyNotice}>
              <View style={styles.readOnlyIconContainer}>
                <Ionicons name="lock-closed" size={20} color={COLORS.warning} />
              </View>
              <Text style={styles.readOnlyText}>
                {displayName} has unmatched with you. This conversation is now read-only.
              </Text>
              <Text style={styles.readOnlySubtext}>
                If you experienced inappropriate behavior, you can still report this user from the menu above.
              </Text>
            </View>
          ) : (
            <View style={styles.twoRowComposer}>
              {suggestions.length > 0 && (
                <View style={styles.aiRecommendationsRow}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.aiChipsContainer}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.aiLabelContainer}>
                      <Ionicons name="sparkles" size={14} color={COLORS.primary} />
                      <Text style={styles.aiLabel}>AI</Text>
                    </View>
                    {suggestions.map((suggestion, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.aiChip}
                        onPress={() => handleSuggestionPress(suggestion)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.aiChipText} numberOfLines={1}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.composerRow}>
                <TouchableOpacity
                  style={styles.cameraBtn}
                  onPress={() => showComingSoonModal('Photo & Media')}
                >
                  <Ionicons name="camera" size={22} color={COLORS.primary} />
                </TouchableOpacity>

                <View style={styles.textInputWrapper}>
                  <TextInput
                    style={styles.messageInput}
                    placeholder="Type a message..."
                    placeholderTextColor={COLORS.textMuted}
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    maxLength={1000}
                  />
                </View>

                {inputText.trim() ? (
                  <TouchableOpacity
                    style={styles.sendBtn}
                    onPress={handleSendPress}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="send" size={20} color="#FFF" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.mediaActions}>
                    <TouchableOpacity
                      style={styles.mediaBtn}
                      onPress={() => showComingSoonModal('GIFs')}
                    >
                      <Text style={styles.gifLabel}>GIF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.mediaBtn}
                      onPress={() => showComingSoonModal('Voice Notes')}
                    >
                      <Ionicons name="mic" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.mediaBtn}
                      onPress={() => showComingSoonModal('Video Messages')}
                    >
                      <Ionicons name="videocam" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={styles.menuContainer}>
            {isReadOnly ? (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowDeleteConfirm(true); }}>
                  <Ionicons name="trash-outline" size={22} color={COLORS.text} />
                  <Text style={styles.menuItemText}>Delete Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowDidYouMeet(true); }}>
                  <Ionicons name="cafe-outline" size={22} color={COLORS.text} />
                  <Text style={styles.menuItemText}>Did you meet?</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowReportModal(true); }}>
                  <Ionicons name="flag-outline" size={22} color={COLORS.primary} />
                  <Text style={[styles.menuItemText, { color: COLORS.primary }]}>Report</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowProfile(true); }}>
                  <Ionicons name="person-outline" size={22} color={COLORS.text} />
                  <Text style={styles.menuItemText}>View Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowDidYouMeet(true); }}>
                  <Ionicons name="cafe-outline" size={22} color={COLORS.text} />
                  <Text style={styles.menuItemText}>Did you meet?</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowUnmatchModal(true); }}>
                  <Ionicons name="heart-dislike-outline" size={22} color={COLORS.warning} />
                  <Text style={[styles.menuItemText, { color: COLORS.warning }]}>Unmatch</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowReportModal(true); }}>
                  <Ionicons name="flag-outline" size={22} color={COLORS.primary} />
                  <Text style={[styles.menuItemText, { color: COLORS.primary }]}>Report</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={styles.menuOverlay}>
          <View style={styles.confirmModal}>
            <Ionicons name="trash-outline" size={48} color={COLORS.primary} style={{ marginBottom: 16 }} />
            <Text style={styles.confirmTitle}>Delete this conversation?</Text>
            <Text style={styles.confirmText}>
              This will permanently remove this chat from your history. This action cannot be undone.
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.confirmBtnCancel}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={styles.confirmBtnCancelText}>No, keep it</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtnDelete}
                onPress={async () => {
                  try {
                    await fetch(`${API_BASE}/api/chat/delete`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        user_id: userId,
                        conversation_id: conversation.conversation_id,
                      }),
                    });
                    setShowDeleteConfirm(false);
                    onBack();
                  } catch (error) {
                    console.error('Error deleting chat:', error);
                    Alert.alert('Error', 'Could not delete chat. Please try again.');
                  }
                }}
              >
                <Text style={styles.confirmBtnDeleteText}>Yes, delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {!isReadOnly && (
        <ProfileBottomSheet
          visible={showProfile}
          onClose={() => setShowProfile(false)}
          userId={otherUserId}
          userName={otherUser?.name || 'Unknown'}
        />
      )}

      <DidYouMeetModal
        visible={showDidYouMeet}
        onClose={() => setShowDidYouMeet(false)}
        otherUserName={otherUser?.name || 'this person'}
        conversationId={conversation.conversation_id}
        userId={userId}
      />

      <UnmatchModal
        visible={showUnmatchModal}
        onClose={() => setShowUnmatchModal(false)}
        userName={otherUser?.name || 'this user'}
        onUnmatch={handleUnmatchWithReason}
        onTransitionToReport={() => setShowReportModal(true)}
      />

      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        userName={otherUser?.name || 'this user'}
        onReport={handleReportWithDetails}
        onUnmatchInstead={() => setShowUnmatchModal(true)}
      />

      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        featureName={comingSoonFeature}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  chatContainer: { flex: 1, backgroundColor: COLORS.bg },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 8 },
  chatHeaderProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  chatHeaderInfo: { marginLeft: 12 },
  chatHeaderName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  chatHeaderStatus: { fontSize: 12, color: COLORS.online, marginTop: 1 },
  chatHeaderActions: { flexDirection: 'row' },
  headerActionBtn: { padding: 10 },
  chatHeaderReadOnly: { flex: 1, marginLeft: 12 },
  chatHeaderUnmatched: { fontSize: 12, color: COLORS.warning, marginTop: 2 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messagesContainer: { backgroundColor: COLORS.bg, paddingBottom: 10 },

  twoRowComposer: { backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border },
  aiRecommendationsRow: { borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 10 },
  aiChipsContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  aiLabelContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(229,9,20,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 4 },
  aiLabel: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  aiChip: { backgroundColor: COLORS.bgCard, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, maxWidth: 220 },
  aiChipText: { fontSize: 13, color: COLORS.text },

  composerRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 8, gap: 8 },
  cameraBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(229,9,20,0.15)', justifyContent: 'center', alignItems: 'center' },
  textInputWrapper: { flex: 1, backgroundColor: COLORS.bgInput, borderRadius: 22, minHeight: 42, maxHeight: 120, justifyContent: 'center' },
  messageInput: { paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, color: COLORS.text, maxHeight: 100 },
  mediaActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  mediaBtn: { padding: 8 },
  gifLabel: { fontSize: 11, fontWeight: 'bold', color: COLORS.textSecondary, backgroundColor: COLORS.bgCard, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, overflow: 'hidden' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },

  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  menuContainer: { backgroundColor: COLORS.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 },
  menuItemText: { fontSize: 16, color: COLORS.text },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },

  readOnlyNotice: { backgroundColor: 'rgba(255, 184, 0, 0.1)', borderTopWidth: 1, borderTopColor: COLORS.border, padding: 20, alignItems: 'center' },
  readOnlyIconContainer: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255, 184, 0, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  readOnlyText: { fontSize: 15, color: COLORS.warning, textAlign: 'center', fontWeight: '500', lineHeight: 21 },
  readOnlySubtext: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 18, paddingHorizontal: 20 },

  confirmModal: { backgroundColor: COLORS.bgCard, marginHorizontal: 24, borderRadius: 20, padding: 24, alignItems: 'center', marginTop: 'auto', marginBottom: 'auto' },
  confirmTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  confirmText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  confirmButtons: { flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' },
  confirmBtnCancel: { flex: 1, paddingVertical: 14, borderRadius: 24, backgroundColor: COLORS.bgInput, alignItems: 'center' },
  confirmBtnCancelText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  confirmBtnDelete: { flex: 1, paddingVertical: 14, borderRadius: 24, backgroundColor: COLORS.primary, alignItems: 'center' },
  confirmBtnDeleteText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
