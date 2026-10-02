/**
 * Chat tab — thin orchestrator screen.
 *
 * All sub-components, modals, types and theme live in
 * /app/frontend/src/components/chat/. This file is intentionally small;
 * it only fetches conversations/requests and renders the appropriate
 * sub-component.
 *
 * History: this used to be a 2,545-line monolith. Refactored June 29, 2026.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ScrollView,
  ActivityIndicator, RefreshControl, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { useAppMode } from '../../src/components/SharedHeader';
import { apiUrl, getUserId, useUserStore } from '../../src/store';
import {
  ConversationItem,
  MessageRequestCard,
  MessageRequestDetailView,
  GiftedChatScreen,
  COLORS,
  type Conversation,
  type MessageRequest,
} from '../../src/components/chat';

// useAppMode is preserved as an import even though it isn't currently
// referenced inside this orchestrator — other code paths still rely on the
// shared header observing the same mode context.

// Friendly copy for a failed inbox load (429 = rate limited by the backend).
const loadErrorMessage = (status?: number) =>
  status === 429
    ? 'Too many requests. Please try again shortly.'
    : "Couldn't load your messages. Check your connection and try again.";

// Inline load-failure state. `compact` = banner above stale data that is
// still on screen; otherwise it replaces the (misleading) empty state.
function InboxError({ message, onRetry, compact = false }: {
  message: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <TouchableOpacity style={styles.errorBanner} onPress={onRetry} accessibilityRole="button">
        <Ionicons name="alert-circle-outline" size={18} color={COLORS.primary} />
        <Text style={styles.errorBannerText} numberOfLines={2}>{message}</Text>
        <Text style={styles.retryInline}>Retry</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.emptyState}>
      <Ionicons name="cloud-offline-outline" size={64} color={COLORS.textMuted} />
      <Text style={styles.emptyTitle}>{"Couldn't load messages"}</Text>
      <Text style={styles.emptySubtitle}>{message}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ChatTab() {
  useAppMode();
  const [activeTab, setActiveTab] = useState<'chats' | 'requests'>('chats');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // One error per list, so a failed load never masquerades as "No conversations".
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<MessageRequest | null>(null);
  const [showRequestDetail, setShowRequestDetail] = useState(false);

  // Listen to global selected conversation (set by History screen "Go to Chat" / "View Chat")
  const storeSelectedConversation = useUserStore((s) => s.selectedConversation);
  const clearStoreSelectedConversation = useUserStore((s) => s.clearSelectedConversation);

  useFocusEffect(
    useCallback(() => {
      if (storeSelectedConversation) {
        setSelectedConversation(storeSelectedConversation as Conversation);
        clearStoreSelectedConversation();
      }
    }, [storeSelectedConversation, clearStoreSelectedConversation]),
  );

  const fetchConversations = useCallback(async (id: string) => {
    try {
      const response = await fetch(apiUrl(`/api/chat/conversations/${id}`));
      if (!response.ok) {
        setConversationsError(loadErrorMessage(response.status));
        return;
      }
      const data = await response.json();
      setConversations(data.conversations || []);
      setConversationsError(null);
    } catch {
      setConversationsError(loadErrorMessage());
    }
  }, []);

  const fetchRequests = useCallback(async (id: string) => {
    try {
      const response = await fetch(apiUrl(`/api/chat/requests/${id}`));
      if (!response.ok) {
        setRequestsError(loadErrorMessage(response.status));
        return;
      }
      const data = await response.json();
      setRequests(data.requests || []);
      setRequestsError(null);
    } catch {
      setRequestsError(loadErrorMessage());
    }
  }, []);

  // Loads (initial) or silently refreshes both lists. Concurrent callers
  // (focus + pull-to-refresh + Retry) share the one in-flight load.
  const inFlight = useRef<Promise<void> | null>(null);
  const initializeChat = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try {
        const id = await getUserId();
        if (!id) {
          router.replace('/');
          return;
        }
        setUserId(id);
        await Promise.all([fetchConversations(id), fetchRequests(id)]);
      } catch {
        setConversationsError(loadErrorMessage());
        setRequestsError(loadErrorMessage());
      } finally {
        setLoading(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [fetchConversations, fetchRequests]);

  // Initial load + refresh whenever the tab regains focus (new matches,
  // accepted requests and unread counts change while the user is elsewhere).
  useFocusEffect(
    useCallback(() => {
      initializeChat();
    }, [initializeChat]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await initializeChat();
    } finally {
      setRefreshing(false);
    }
  }, [initializeChat]);

  const handleRetry = () => {
    setConversationsError(null);
    setRequestsError(null);
    setLoading(true);
    initializeChat();
  };

  const closeConversation = useCallback(() => {
    setSelectedConversation(null);
    if (userId) fetchConversations(userId);
  }, [userId, fetchConversations]);

  // Android: while a conversation is open, hardware back returns to the inbox
  // instead of leaving the tab / exiting the app. Modals inside the chat
  // screen handle back themselves via onRequestClose.
  useFocusEffect(
    useCallback(() => {
      if (!selectedConversation) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        closeConversation();
        return true;
      });
      return () => sub.remove();
    }, [selectedConversation, closeConversation]),
  );

  const handleAcceptRequest = async (conversationId: string) => {
    try {
      await fetch(apiUrl('/api/chat/accept'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, conversation_id: conversationId }),
      });
      await Promise.all([fetchConversations(userId), fetchRequests(userId)]);
    } catch (error) {
      console.error('Error accepting request:', error);
    }
  };

  const handleDeclineRequest = async (conversationId: string) => {
    try {
      await fetch(apiUrl('/api/chat/decline'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, conversation_id: conversationId }),
      });
      await fetchRequests(userId);
    } catch (error) {
      console.error('Error declining request:', error);
    }
  };

  // Wait for userId so the chat screen never fires requests for user ''
  // (History's "Go to Chat" can hand over a conversation before it loads).
  if (selectedConversation && userId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GiftedChatScreen
          conversation={selectedConversation}
          userId={userId}
          isReadOnly={!!selectedConversation.is_read_only}
          otherUserNameOverride={
            selectedConversation.is_read_only ? selectedConversation.other_user?.name : undefined
          }
          onBack={closeConversation}
        />
      </SafeAreaView>
    );
  }

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor={COLORS.primary}
      colors={[COLORS.primary]}
    />
  );

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chats' && styles.tabActive]}
          onPress={() => setActiveTab('chats')}
        >
          <Text style={[styles.tabText, activeTab === 'chats' && styles.tabTextActive]}>
            Chats{totalUnread > 0 ? ` (${totalUnread})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
          onPress={() => setActiveTab('requests')}
        >
          <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
            Requests{requests.length > 0 ? ` (${requests.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : activeTab === 'chats' ? (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.conversation_id}
          renderItem={({ item }) => (
            <ConversationItem conversation={item} onPress={() => setSelectedConversation(item)} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          ListHeaderComponent={
            conversationsError && conversations.length > 0 ? (
              <InboxError message={conversationsError} onRetry={handleRetry} compact />
            ) : null
          }
          ListEmptyComponent={
            conversationsError ? (
              <InboxError message={conversationsError} onRetry={handleRetry} />
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={64} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No conversations yet</Text>
                <Text style={styles.emptySubtitle}>Match with someone to start chatting!</Text>
              </View>
            )
          }
        />
      ) : (
        <ScrollView
          style={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {requestsError && requests.length > 0 ? (
            <InboxError message={requestsError} onRetry={handleRetry} compact />
          ) : null}
          {requestsError && requests.length === 0 ? (
            <InboxError message={requestsError} onRetry={handleRetry} />
          ) : requests.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="mail-outline" size={64} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No requests</Text>
              <Text style={styles.emptySubtitle}>New message requests will appear here</Text>
            </View>
          ) : (
            requests.map((req) => (
              <MessageRequestCard
                key={req.conversation_id}
                request={req}
                onPress={() => { setSelectedRequest(req); setShowRequestDetail(true); }}
                onAccept={() => handleAcceptRequest(req.conversation_id)}
                onDecline={() => handleDeclineRequest(req.conversation_id)}
              />
            ))
          )}
        </ScrollView>
      )}

      <MessageRequestDetailView
        visible={showRequestDetail}
        request={selectedRequest}
        onAccept={() => {
          if (selectedRequest) handleAcceptRequest(selectedRequest.conversation_id);
          setShowRequestDetail(false);
          setSelectedRequest(null);
        }}
        onDecline={() => {
          if (selectedRequest) handleDeclineRequest(selectedRequest.conversation_id);
          setShowRequestDetail(false);
          setSelectedRequest(null);
        }}
        onClose={() => { setShowRequestDetail(false); setSelectedRequest(null); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '500' },
  tabTextActive: { color: COLORS.primary, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: 12 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 8, textAlign: 'center' },
  retryButton: {
    marginTop: 20, paddingHorizontal: 28, paddingVertical: 12,
    borderRadius: 24, backgroundColor: COLORS.primary,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard,
  },
  errorBannerText: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  retryInline: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
});
