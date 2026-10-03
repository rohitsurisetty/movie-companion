import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  Pressable, ActivityIndicator, Alert, TextInput, AppState, BackHandler,
} from 'react-native';
// Use the KeyboardAvoidingView from react-native-keyboard-controller (NOT
// the one from react-native). The RN version relies on the activity being
// resized when the keyboard opens — that no longer happens on Android APK
// builds with edgeToEdgeEnabled=true, so the input gets hidden behind the
// keyboard. The keyboard-controller version uses the native WindowInsets
// API and works identically in Expo Go and production.
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { GiftedChat, Bubble, IMessage } from 'react-native-gifted-chat';
import { Avatar } from '../Avatar';
import { apiUrl } from '../../store';
import { COLORS } from './theme';
import { parseServerDate } from './utils';
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

// No websocket yet: an open conversation re-fetches its messages this often.
const POLL_INTERVAL_MS = 4000;

const toTime = (d: IMessage['createdAt']) => (d instanceof Date ? d.getTime() : Number(d) || 0);

// Merge by message id, newest first — polling never duplicates a message. An
// unchanged message keeps its object so the list doesn't re-render every poll.
const mergeMessages = (current: IMessage[], incoming: IMessage[]): IMessage[] => {
  const byId = new Map<IMessage['_id'], IMessage>();
  current.forEach((m) => byId.set(m._id, m));
  incoming.forEach((m) => {
    const known = byId.get(m._id);
    byId.set(m._id, known && !known.pending && known.text === m.text ? known : m);
  });
  return Array.from(byId.values()).sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
};

const sameList = (a: IMessage[], b: IMessage[]) =>
  a.length === b.length && a.every((m, i) => m === b[i]);

const sendErrorMessage = (status?: number) => {
  if (status === 400) return "You can't send a message to yourself.";
  if (status === 404) return 'This conversation is no longer available. The match may have ended.';
  if (status === 429) return "You're sending messages too quickly. Please try again shortly.";
  return "Your message wasn't sent. Check your connection and try again.";
};

const actionErrorMessage = (status?: number) =>
  status === 429
    ? 'Too many requests. Please try again shortly.'
    : 'Something went wrong. Check your connection and try again.';

const ConversationChat: React.FC<Props> = ({
  conversation, userId, onBack, isReadOnly = false, otherUserNameOverride,
}) => {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [loading, setLoading] = useState(true);
  // 404 from the server: unmatched / deleted / no longer a participant.
  const [unavailable, setUnavailable] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDidYouMeet, setShowDidYouMeet] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showUnmatchModal, setShowUnmatchModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [inputText, setInputText] = useState('');

  const mountedRef = useRef(true);
  const messagesRef = useRef<IMessage[]>([]);
  const fetchingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Once true (404, report, unmatch, delete) this screen never polls again.
  const stoppedRef = useRef(false);
  const readSyncedRef = useRef(false);
  // Reply suggestions are an LLM call: request them once per new incoming
  // message, and drop responses that arrive after the user has replied.
  const suggestedForRef = useRef<IMessage['_id'] | null>(null);
  const suggestionsReqRef = useRef(0);
  const reportedRef = useRef(false);
  const reportUnmatchFailedRef = useRef(false);
  const blockingRef = useRef(false);

  const conversationId = conversation.conversation_id;
  const otherUser = conversation.other_user;
  const otherUserId = conversation.other_user_id;
  const displayName = otherUserNameOverride || otherUser?.name || 'Unknown';

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const showComingSoonModal = (feature: string) => {
    setComingSoonFeature(feature);
    setShowComingSoon(true);
  };

  const updateMessages = useCallback((next: (prev: IMessage[]) => IMessage[]) => {
    const updated = next(messagesRef.current);
    if (sameList(messagesRef.current, updated)) return;
    messagesRef.current = updated;
    setMessages(updated);
  }, []);

  const stopPolling = useCallback(() => {
    stoppedRef.current = true;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const convertToGiftedMessages = useCallback((backendMessages: BackendMessage[]): IMessage[] => (
    backendMessages
      .filter((msg) => !!msg?.message_id)
      .map((msg) => ({
        _id: msg.message_id,
        text: msg.content,
        createdAt: parseServerDate(msg.created_at),
        user: {
          _id: msg.sender_id,
          name: msg.sender_id === userId ? 'You' : otherUser?.name || 'Unknown',
          avatar: msg.sender_id === userId || isReadOnly ? undefined : otherUser?.avatar,
        },
      }))
  ), [userId, isReadOnly, otherUser?.name, otherUser?.avatar]);

  const markRead = useCallback(async () => {
    try {
      await fetch(
        apiUrl(`/api/chat/read/${encodeURIComponent(conversationId)}?user_id=${encodeURIComponent(userId)}`),
        { method: 'POST' },
      );
    } catch {
      // Best effort: the next poll still sees the messages unread and retries.
    }
  }, [conversationId, userId]);

  const fetchSuggestions = useCallback(async () => {
    const req = ++suggestionsReqRef.current;
    try {
      const response = await fetch(apiUrl('/api/chat/reply-suggestions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          conversation_id: conversationId,
        }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!mountedRef.current || req !== suggestionsReqRef.current || stoppedRef.current) return;
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch {
      // Suggestions are optional.
    }
  }, [userId, conversationId]);

  const fetchMessages = useCallback(async () => {
    if (fetchingRef.current || stoppedRef.current) return;
    fetchingRef.current = true;
    try {
      const response = await fetch(apiUrl(`/api/chat/messages/${encodeURIComponent(conversationId)}`));
      if (!mountedRef.current || stoppedRef.current) return;
      if (response.status === 404 || response.status === 403) {
        stopPolling();
        setUnavailable(true);
        setSuggestions([]);
        return;
      }
      // 429 / 5xx: keep what is on screen; the next poll retries.
      if (!response.ok) return;
      const data = await response.json();
      if (!mountedRef.current || stoppedRef.current) return;
      const backendMessages: BackendMessage[] = Array.isArray(data?.messages) ? data.messages : [];
      updateMessages((prev) => mergeMessages(prev, convertToGiftedMessages(backendMessages)));

      const hasUnread = backendMessages.some((m) => m.sender_id !== userId && !m.read);
      if (hasUnread || !readSyncedRef.current) {
        readSyncedRef.current = true;
        markRead();
      }

      const newest = messagesRef.current[0];
      if (!isReadOnly && newest && newest.user._id !== userId && newest._id !== suggestedForRef.current) {
        suggestedForRef.current = newest._id;
        fetchSuggestions();
      }
    } catch {
      // Network blip: the next poll retries.
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [conversationId, userId, isReadOnly, convertToGiftedMessages, updateMessages, markRead, fetchSuggestions, stopPolling]);

  // Poll only while this screen is focused and the app is in the foreground;
  // the interval is cleared on blur, unmount and back. A read-only
  // (unmatched) conversation can't receive messages, so it loads once.
  useFocusEffect(
    useCallback(() => {
      if (stoppedRef.current) return undefined;
      fetchMessages();
      if (isReadOnly) return undefined;
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') fetchMessages();
      }, POLL_INTERVAL_MS);
      pollTimerRef.current = timer;
      return () => {
        clearInterval(timer);
        if (pollTimerRef.current === timer) pollTimerRef.current = null;
      };
    }, [fetchMessages, isReadOnly]),
  );

  // Android hardware back leaves the conversation (modals handle back
  // themselves via onRequestClose) instead of exiting the tab / app.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        onBack();
        return true;
      });
      return () => sub.remove();
    }, [onBack]),
  );

  // Optimistic send: the bubble shows as pending, is swapped for the server
  // copy on success (same message_id as polling → no duplicate) and removed on
  // failure, with the draft restored and the reason explained. Replies arrive
  // through polling (there is no typing indicator — no presence data exists).
  const onSend = useCallback(async (newMessages: IMessage[] = []) => {
    const messageText = newMessages[0]?.text?.trim();
    if (!messageText || stoppedRef.current) return;

    const localId = newMessages[0]._id;
    updateMessages((prev) => mergeMessages(prev, [{ ...newMessages[0], text: messageText, pending: true }]));
    suggestionsReqRef.current += 1;
    setSuggestions([]);

    let failedStatus: number | undefined;
    try {
      const response = await fetch(apiUrl('/api/chat/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: userId,
          receiver_id: otherUserId,
          content: messageText,
          message_type: 'text',
        }),
      });
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (!mountedRef.current) return;
        const saved: BackendMessage | undefined = data?.message;
        updateMessages((prev) => {
          const withoutLocal = prev.filter((m) => m._id !== localId);
          return saved?.message_id ? mergeMessages(withoutLocal, convertToGiftedMessages([saved])) : withoutLocal;
        });
        if (!saved?.message_id) fetchMessages();
        return;
      }
      failedStatus = response.status;
    } catch {
      failedStatus = undefined;
    }

    if (!mountedRef.current) return;
    updateMessages((prev) => prev.filter((m) => m._id !== localId));
    setInputText((current) => (current.trim() ? current : messageText));
    if (failedStatus === 404) {
      stopPolling();
      setUnavailable(true);
    }
    Alert.alert('Message not sent', sendErrorMessage(failedStatus));
  }, [userId, otherUserId, updateMessages, convertToGiftedMessages, fetchMessages, stopPolling]);

  // Rejects with user-facing copy so UnmatchModal can show it and stay open.
  const handleUnmatchWithReason = async (reason: string) => {
    let response: Response;
    try {
      response = await fetch(apiUrl('/api/chat/unmatch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, other_user_id: otherUserId, reason }),
      });
    } catch {
      throw new Error(actionErrorMessage());
    }
    // 404 = the match is already gone, which is what the user asked for.
    if (!response.ok && response.status !== 404) throw new Error(actionErrorMessage(response.status));
    stopPolling();
    onBack();
  };

  // Block: the server closes this conversation for both sides, hides each
  // user from the other's feed and stops all messaging between them.
  // Rejects with user-facing copy (shown in an Alert by handleBlockPress).
  const handleBlock = async () => {
    let response: Response;
    try {
      response = await fetch(apiUrl('/api/user/block'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked_user_id: otherUserId }),
      });
    } catch {
      throw new Error(actionErrorMessage());
    }
    if (!response.ok) throw new Error(actionErrorMessage(response.status));
    stopPolling();
    onBack();
  };

  const handleBlockPress = () => {
    setShowMenu(false);
    const name = otherUserNameOverride || otherUser?.name || 'this user';
    Alert.alert(
      `Block ${name}?`,
      "They won't see your profile or be able to message you. They won't be told.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            if (blockingRef.current) return;
            blockingRef.current = true;
            handleBlock()
              .catch((e) => {
                if (!mountedRef.current) return;
                Alert.alert(
                  'Could not block',
                  e instanceof Error && e.message ? e.message : actionErrorMessage(),
                );
              })
              .finally(() => { blockingRef.current = false; });
          },
        },
      ],
    );
  };

  // Resolves once the report is filed (ReportModal then shows "Thank you"),
  // rejects with user-facing copy otherwise. A report also ends the match;
  // closing the modal afterwards returns to the inbox (handleReportClose).
  const handleReportWithDetails = async (reason: string, details?: string) => {
    let reportRes: Response;
    try {
      reportRes = await fetch(apiUrl('/api/chat/report'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporter_id: userId,
          reported_id: otherUserId,
          reason,
          details: details || null,
        }),
      });
    } catch {
      throw new Error(actionErrorMessage());
    }
    if (!reportRes.ok) throw new Error(actionErrorMessage(reportRes.status));

    reportedRef.current = true;
    stopPolling();
    setSuggestions([]);
    try {
      const unmatchRes = await fetch(apiUrl('/api/chat/unmatch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, other_user_id: otherUserId, reason: 'reported' }),
      });
      reportUnmatchFailedRef.current = !unmatchRes.ok && unmatchRes.status !== 404;
    } catch {
      reportUnmatchFailedRef.current = true;
    }
  };

  const handleReportClose = () => {
    setShowReportModal(false);
    if (!reportedRef.current) return;
    if (reportUnmatchFailedRef.current) {
      Alert.alert(
        'Report sent',
        "We couldn't unmatch you automatically. You can unmatch from the chat menu.",
      );
    }
    onBack();
  };

  const handleDeleteChat = async () => {
    if (deleting) return;
    setDeleting(true);
    let failure: string | null = null;
    try {
      const response = await fetch(apiUrl('/api/chat/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          conversation_id: conversationId,
        }),
      });
      if (!response.ok && response.status !== 404) failure = actionErrorMessage(response.status);
    } catch {
      failure = actionErrorMessage();
    }
    if (!mountedRef.current) return;
    setDeleting(false);
    if (failure) {
      Alert.alert('Could not delete chat', failure);
      return;
    }
    setShowDeleteConfirm(false);
    stopPolling();
    onBack();
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
      // translate-with-padding is the chat-app-optimized behavior from
      // react-native-keyboard-controller — works identically on iOS and
      // Android (including APK builds with edgeToEdgeEnabled=true) by
      // translating the view above the keyboard via native insets, not by
      // relying on the activity to resize.
      behavior="translate-with-padding"
      keyboardVerticalOffset={0}
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
            // gifted-chat 3 prop names (the v2 names were silently ignored).
            isScrollToBottomEnabled
            isInverted
            isUsernameVisible={false}
            isUserAvatarVisible={false}
            isAvatarVisibleForEveryMessage={false}
            isAvatarOnTop
            messagesContainerStyle={styles.messagesContainer}
            minInputToolbarHeight={0}
            listProps={{
              style: { backgroundColor: COLORS.bg },
              keyboardDismissMode: 'interactive',
              keyboardShouldPersistTaps: 'handled',
            }}
          />

          {unavailable ? (
            <View style={styles.readOnlyNotice}>
              <View style={styles.readOnlyIconContainer}>
                <Ionicons name="chatbubbles-outline" size={20} color={COLORS.warning} />
              </View>
              <Text style={styles.readOnlyText}>This conversation is no longer available</Text>
            </View>
          ) : isReadOnly ? (
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
                <TouchableOpacity style={styles.menuItem} onPress={handleBlockPress}>
                  <Ionicons name="ban-outline" size={22} color={COLORS.primary} />
                  <Text style={[styles.menuItemText, { color: COLORS.primary }]}>Block</Text>
                </TouchableOpacity>
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
                <TouchableOpacity style={styles.menuItem} onPress={handleBlockPress}>
                  <Ionicons name="ban-outline" size={22} color={COLORS.primary} />
                  <Text style={[styles.menuItemText, { color: COLORS.primary }]}>Block</Text>
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
                onPress={handleDeleteChat}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmBtnDeleteText}>Yes, delete</Text>
                )}
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
        onClose={handleReportClose}
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

// Keyed by conversation: when the parent swaps conversations without
// unmounting (History → "Go to Chat" while a chat is open) everything —
// messages, polling, modals, draft — starts fresh instead of merging threads.
export const GiftedChatScreen: React.FC<Props> = (props) => (
  <ConversationChat key={props.conversation.conversation_id} {...props} />
);

const styles = StyleSheet.create({
  chatContainer: { flex: 1, backgroundColor: COLORS.bg },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 8 },
  chatHeaderProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  chatHeaderInfo: { marginLeft: 12 },
  chatHeaderName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
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
