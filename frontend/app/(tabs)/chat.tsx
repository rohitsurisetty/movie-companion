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
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { useAppMode } from '../../src/components/SharedHeader';
import { getUserId, useUserStore } from '../../src/store';
import {
  ConversationItem,
  MessageRequestCard,
  MessageRequestDetailView,
  GiftedChatScreen,
  COLORS,
  API_BASE,
  type Conversation,
  type MessageRequest,
} from '../../src/components/chat';

// useAppMode is preserved as an import even though it isn't currently
// referenced inside this orchestrator — other code paths still rely on the
// shared header observing the same mode context.

export default function ChatTab() {
  useAppMode();
  const [activeTab, setActiveTab] = useState<'chats' | 'requests'>('chats');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    initializeChat();
  }, []);

  const initializeChat = async () => {
    const id = await getUserId();
    setUserId(id);

    await fetch(`${API_BASE}/api/chat/init-mock/${id}`, { method: 'POST' });

    await Promise.all([fetchConversations(id), fetchRequests(id)]);
    setLoading(false);
  };

  const fetchConversations = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/conversations/${id}`);
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

  const fetchRequests = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/requests/${id}`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const handleAcceptRequest = async (conversationId: string) => {
    try {
      await fetch(`${API_BASE}/api/chat/accept`, {
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
      await fetch(`${API_BASE}/api/chat/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, conversation_id: conversationId }),
      });
      await fetchRequests(userId);
    } catch (error) {
      console.error('Error declining request:', error);
    }
  };

  if (selectedConversation) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GiftedChatScreen
          conversation={selectedConversation}
          userId={userId}
          isReadOnly={!!selectedConversation.is_read_only}
          otherUserNameOverride={
            selectedConversation.is_read_only ? selectedConversation.other_user?.name : undefined
          }
          onBack={() => {
            setSelectedConversation(null);
            fetchConversations(userId);
          }}
        />
      </SafeAreaView>
    );
  }

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
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={64} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>Match with someone to start chatting!</Text>
            </View>
          }
        />
      ) : (
        <ScrollView style={styles.listContent} showsVerticalScrollIndicator={false}>
          {requests.length === 0 ? (
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
});
