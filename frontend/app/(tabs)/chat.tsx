import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  FlatList, ScrollView, Modal, KeyboardAvoidingView, Platform,
  ActivityIndicator, Keyboard, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAppMode } from '../../src/components/SharedHeader';
import { getUserId } from '../../src/store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  primary: '#E50914',
  buddy: '#2196F3',
  bg: '#0A0A0A',
  bgCard: '#1A1A1A',
  bgInput: '#2A2A2A',
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#666666',
  border: '#333333',
  success: '#00D26A',
  warning: '#FFB800',
  online: '#00D26A',
};

interface Conversation {
  conversation_id: string;
  other_user_id: string;
  other_user?: {
    user_id: string;
    name: string;
    avatar?: string;
    location?: string;
  };
  last_message?: string;
  last_message_at?: string;
  unread: number;
  status: string;
}

interface MessageRequest {
  conversation_id: string;
  from_user_id: string;
  from_user?: {
    user_id: string;
    name: string;
    avatar?: string;
    age?: number;
    location?: string;
    bio?: string;
  };
  preview: string;
  created_at: string;
}

interface Message {
  message_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: string;
  created_at: string;
  read: boolean;
}

// ============ AVATAR COMPONENT ============
const Avatar = ({ name, size = 50, color }: { name: string; size?: number; color?: string }) => {
  const bgColor = color || COLORS.primary;
  return (
    <LinearGradient colors={[bgColor, `${bgColor}88`]} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{name?.charAt(0).toUpperCase() || '?'}</Text>
    </LinearGradient>
  );
};

// ============ MESSAGE REQUEST CARD ============
const MessageRequestCard = ({ 
  request, 
  onAccept, 
  onDecline 
}: { 
  request: MessageRequest; 
  onAccept: () => void; 
  onDecline: () => void;
}) => {
  const user = request.from_user;
  
  return (
    <View style={styles.requestCard}>
      <View style={styles.requestHeader}>
        <Avatar name={user?.name || 'U'} size={60} />
        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{user?.name || 'Unknown'}, {user?.age || '?'}</Text>
          <Text style={styles.requestLocation}>{user?.location || 'Unknown location'}</Text>
        </View>
      </View>
      <Text style={styles.requestPreview} numberOfLines={2}>{request.preview}</Text>
      <View style={styles.requestActions}>
        <TouchableOpacity style={styles.declineBtn} onPress={onDecline}>
          <Ionicons name="close" size={20} color={COLORS.textSecondary} />
          <Text style={styles.declineBtnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
          <Ionicons name="checkmark" size={20} color="#FFF" />
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ============ CONVERSATION LIST ITEM ============
const ConversationItem = ({ 
  conversation, 
  onPress 
}: { 
  conversation: Conversation; 
  onPress: () => void;
}) => {
  const user = conversation.other_user;
  const hasUnread = conversation.unread > 0;
  
  return (
    <TouchableOpacity style={styles.conversationItem} onPress={onPress}>
      <View style={styles.conversationAvatar}>
        <Avatar name={user?.name || 'U'} size={56} />
        <View style={styles.onlineDot} />
      </View>
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={[styles.conversationName, hasUnread && styles.unreadName]}>{user?.name || 'Unknown'}</Text>
          <Text style={styles.conversationTime}>{formatTime(conversation.last_message_at)}</Text>
        </View>
        <Text style={[styles.conversationPreview, hasUnread && styles.unreadPreview]} numberOfLines={1}>
          {conversation.last_message || 'Start a conversation'}
        </Text>
      </View>
      {hasUnread ? (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{conversation.unread}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

// ============ CHAT SCREEN ============
const ChatScreen = ({ 
  conversation, 
  userId,
  onBack,
  onViewProfile,
  onUnmatch,
  onReport,
}: {
  conversation: Conversation;
  userId: string;
  onBack: () => void;
  onViewProfile: () => void;
  onUnmatch: () => void;
  onReport: () => void;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [iceBreakers, setIceBreakers] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  
  const otherUser = conversation.other_user;

  // Fetch messages
  useEffect(() => {
    fetchMessages();
    fetchIceBreakers();
  }, [conversation.conversation_id]);

  const fetchMessages = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/messages/${conversation.conversation_id}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        
        // Mark as read
        await fetch(`${API_BASE}/api/chat/read/${conversation.conversation_id}?user_id=${userId}`, { method: 'POST' });
        
        // Get reply suggestions if there are messages
        if (data.messages && data.messages.length > 0) {
          fetchReplySuggestions();
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchIceBreakers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/ice-breakers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          match_user_id: conversation.other_user_id,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setIceBreakers(data.ice_breakers || []);
      }
    } catch (error) {
      console.error('Error fetching ice breakers:', error);
    }
  };

  const fetchReplySuggestions = async () => {
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

  const sendMessage = async (content: string, type: string = 'text') => {
    if (!content.trim()) return;
    
    setSending(true);
    try {
      const response = await fetch(`${API_BASE}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: userId,
          receiver_id: conversation.other_user_id,
          content: content.trim(),
          message_type: type,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [data.message, ...prev]);
        setInputText('');
        Keyboard.dismiss();
        fetchReplySuggestions();
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleVoiceNote = () => {
    Alert.alert('Voice Notes', 'Voice notes feature coming soon!');
  };

  const handleMediaPicker = () => {
    Alert.alert('Media', 'Media sharing feature coming soon!');
  };

  const handleCall = (isVideo: boolean) => {
    Alert.alert(
      isVideo ? 'Video Call' : 'Voice Call',
      'Calling feature coming soon!',
      [{ text: 'OK' }]
    );
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === userId;
    
    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
        <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : styles.messageBubbleOther]}>
          <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther]}>
            {item.content}
          </Text>
          <Text style={[styles.messageTime, isMe ? styles.messageTimeMe : styles.messageTimeOther]}>
            {formatMessageTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Chat Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.chatHeaderProfile} onPress={onViewProfile}>
          <Avatar name={otherUser?.name || 'U'} size={40} />
          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatHeaderName}>{otherUser?.name || 'Unknown'}</Text>
            <Text style={styles.chatHeaderStatus}>Online</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.chatHeaderActions}>
          <TouchableOpacity onPress={() => handleCall(false)} style={styles.headerActionBtn}>
            <Ionicons name="call" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleCall(true)} style={styles.headerActionBtn}>
            <Ionicons name="videocam" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.headerActionBtn}>
            <Ionicons name="ellipsis-vertical" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.message_id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyChatText}>Start the conversation!</Text>
              {iceBreakers.length > 0 ? (
                <View style={styles.iceBreakersContainer}>
                  <Text style={styles.iceBreakersTitle}>Try an ice breaker:</Text>
                  {iceBreakers.map((breaker, idx) => (
                    <TouchableOpacity key={idx} style={styles.iceBreakerBtn} onPress={() => sendMessage(breaker)}>
                      <Text style={styles.iceBreakerText}>{breaker}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          }
        />
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && messages.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsScroll} contentContainerStyle={styles.suggestionsContainer}>
          {suggestions.map((suggestion, idx) => (
            <TouchableOpacity key={idx} style={styles.suggestionChip} onPress={() => sendMessage(suggestion)}>
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {/* Input Area */}
      <View style={styles.inputArea}>
        <TouchableOpacity onPress={handleMediaPicker} style={styles.inputActionBtn}>
          <Ionicons name="image-outline" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor={COLORS.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
          />
        </View>
        {inputText.trim() ? (
          <TouchableOpacity onPress={() => sendMessage(inputText)} style={styles.sendBtn} disabled={sending}>
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="send" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleVoiceNote} style={styles.voiceBtn}>
            <Ionicons name="mic" size={24} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Menu Modal */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); onViewProfile(); }}>
              <Ionicons name="person-outline" size={22} color={COLORS.text} />
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); Alert.alert('Did you meet?', 'Meeting verification coming soon!'); }}>
              <Ionicons name="cafe-outline" size={22} color={COLORS.text} />
              <Text style={styles.menuItemText}>Did you meet?</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); onUnmatch(); }}>
              <Ionicons name="heart-dislike-outline" size={22} color={COLORS.warning} />
              <Text style={[styles.menuItemText, { color: COLORS.warning }]}>Unmatch</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); onReport(); }}>
              <Ionicons name="flag-outline" size={22} color={COLORS.primary} />
              <Text style={[styles.menuItemText, { color: COLORS.primary }]}>Report</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
};

// ============ MAIN CHAT TAB ============
export default function ChatTab() {
  const { mode } = useAppMode();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'requests' | 'chats'>('chats');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  useEffect(() => {
    initializeChat();
  }, []);

  const initializeChat = async () => {
    const id = await getUserId();
    setUserId(id);
    
    // Initialize mock conversations for testing
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

  const handleUnmatch = async () => {
    if (!selectedConversation) return;
    
    Alert.alert(
      'Unmatch',
      `Are you sure you want to unmatch with ${selectedConversation.other_user?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unmatch',
          style: 'destructive',
          onPress: async () => {
            await fetch(`${API_BASE}/api/chat/unmatch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: userId,
                other_user_id: selectedConversation.other_user_id,
              }),
            });
            setSelectedConversation(null);
            await fetchConversations(userId);
          },
        },
      ]
    );
  };

  const handleReport = async () => {
    if (!selectedConversation) return;
    
    Alert.alert(
      'Report User',
      'Why are you reporting this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Inappropriate Content', onPress: () => submitReport('inappropriate') },
        { text: 'Harassment', onPress: () => submitReport('harassment') },
        { text: 'Fake Profile', onPress: () => submitReport('fake_profile') },
      ]
    );
  };

  const submitReport = async (reason: string) => {
    if (!selectedConversation) return;
    
    await fetch(`${API_BASE}/api/chat/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reporter_id: userId,
        reported_id: selectedConversation.other_user_id,
        reason,
      }),
    });
    
    Alert.alert('Reported', 'Thank you for your report. We will review it shortly.');
  };

  // If a conversation is selected, show chat screen
  if (selectedConversation) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ChatScreen
          conversation={selectedConversation}
          userId={userId}
          onBack={() => {
            setSelectedConversation(null);
            fetchConversations(userId);
          }}
          onViewProfile={() => Alert.alert('Profile', 'Profile view coming soon!')}
          onUnmatch={handleUnmatch}
          onReport={handleReport}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
          onPress={() => setActiveTab('requests')}
        >
          <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
            Requests {requests.length > 0 ? `(${requests.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chats' && styles.tabActive]}
          onPress={() => setActiveTab('chats')}
        >
          <Text style={[styles.tabText, activeTab === 'chats' && styles.tabTextActive]}>Chats</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : activeTab === 'requests' ? (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {requests.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="mail-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No message requests</Text>
              <Text style={styles.emptySubtitle}>When someone messages you, it will appear here</Text>
            </View>
          ) : (
            requests.map((req) => (
              <MessageRequestCard
                key={req.conversation_id}
                request={req}
                onAccept={() => handleAcceptRequest(req.conversation_id)}
                onDecline={() => handleDeclineRequest(req.conversation_id)}
              />
            ))
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.conversation_id}
          renderItem={({ item }) => (
            <ConversationItem conversation={item} onPress={() => setSelectedConversation(item)} />
          )}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>Match with someone and start chatting!</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ============ HELPER FUNCTIONS ============
function formatTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return date.toLocaleDateString();
}

function formatMessageTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============ STYLES ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  
  // Header
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  
  // Tabs
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '500' },
  tabTextActive: { color: COLORS.primary, fontWeight: '600' },
  
  // Content
  content: { flex: 1, padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: 12 },
  
  // Empty State
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 8, textAlign: 'center' },
  
  // Avatar
  avatar: { justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFF', fontWeight: 'bold' },
  
  // Message Request Card
  requestCard: { backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 16, marginBottom: 16 },
  requestHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  requestInfo: { marginLeft: 12, flex: 1 },
  requestName: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  requestLocation: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  requestPreview: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 20 },
  requestActions: { flexDirection: 'row', gap: 12 },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  declineBtnText: { color: COLORS.textSecondary, fontWeight: '500' },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 24, backgroundColor: COLORS.primary, gap: 6 },
  acceptBtnText: { color: '#FFF', fontWeight: '600' },
  
  // Conversation Item
  conversationItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  conversationAvatar: { position: 'relative' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.online, borderWidth: 2, borderColor: COLORS.bg },
  conversationContent: { flex: 1, marginLeft: 12 },
  conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  conversationName: { fontSize: 16, fontWeight: '500', color: COLORS.text },
  unreadName: { fontWeight: '700' },
  conversationTime: { fontSize: 12, color: COLORS.textMuted },
  conversationPreview: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  unreadPreview: { color: COLORS.text },
  unreadBadge: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, minWidth: 24, alignItems: 'center' },
  unreadBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  
  // Chat Screen
  chatContainer: { flex: 1, backgroundColor: COLORS.bg },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 8 },
  chatHeaderProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  chatHeaderInfo: { marginLeft: 10 },
  chatHeaderName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  chatHeaderStatus: { fontSize: 12, color: COLORS.online },
  chatHeaderActions: { flexDirection: 'row', gap: 4 },
  headerActionBtn: { padding: 10 },
  
  // Messages
  messagesList: { padding: 16, paddingTop: 8 },
  messageRow: { marginBottom: 8 },
  messageRowMe: { alignItems: 'flex-end' },
  messageRowOther: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  messageBubbleMe: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  messageBubbleOther: { backgroundColor: COLORS.bgCard, borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  messageTextMe: { color: '#FFF' },
  messageTextOther: { color: COLORS.text },
  messageTime: { fontSize: 10, marginTop: 4 },
  messageTimeMe: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  messageTimeOther: { color: COLORS.textMuted },
  
  // Empty Chat
  emptyChat: { alignItems: 'center', paddingTop: 40, transform: [{ scaleY: -1 }] },
  emptyChatText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 12 },
  iceBreakersContainer: { marginTop: 24, width: '100%', paddingHorizontal: 16 },
  iceBreakersTitle: { fontSize: 14, color: COLORS.textMuted, marginBottom: 12, textAlign: 'center' },
  iceBreakerBtn: { backgroundColor: COLORS.bgCard, padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  iceBreakerText: { fontSize: 14, color: COLORS.text, textAlign: 'center' },
  
  // Suggestions
  suggestionsScroll: { maxHeight: 50, borderTopWidth: 1, borderTopColor: COLORS.border },
  suggestionsContainer: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  suggestionChip: { backgroundColor: COLORS.bgCard, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  suggestionText: { fontSize: 13, color: COLORS.text },
  
  // Input Area
  inputArea: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 8 },
  inputActionBtn: { padding: 8 },
  inputWrapper: { flex: 1, backgroundColor: COLORS.bgInput, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100 },
  textInput: { fontSize: 15, color: COLORS.text, maxHeight: 80 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  voiceBtn: { padding: 10 },
  
  // Menu Modal
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuContainer: { backgroundColor: COLORS.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 },
  menuItemText: { fontSize: 16, color: COLORS.text },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
});
