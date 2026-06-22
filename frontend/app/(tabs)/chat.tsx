import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  FlatList, ScrollView, Modal, Platform, ActivityIndicator, 
  Dimensions, Alert, Pressable, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { GiftedChat, Bubble, InputToolbar, Send, Composer, IMessage, MessageImage } from 'react-native-gifted-chat';
import { useAppMode } from '../../src/components/SharedHeader';
import { getUserId } from '../../src/store';
import { formatLocationForPrivacy } from '../../src/utils/locationFormatter';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
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
  suggestion: '#1E3A5F',
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

interface BackendMessage {
  message_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: string;
  created_at: string;
  read: boolean;
}

// ============ AVATAR COMPONENT ============
const Avatar = ({ name, size = 50, imageUrl }: { name: string; size?: number; imageUrl?: string }) => {
  if (imageUrl && imageUrl.startsWith('http')) {
    return (
      <Image 
        source={{ uri: imageUrl }} 
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  
  return (
    <LinearGradient 
      colors={[COLORS.primary, '#FF6B6B']} 
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>
        {name?.charAt(0).toUpperCase() || '?'}
      </Text>
    </LinearGradient>
  );
};

// ============ PROFILE BOTTOM SHEET ============
const ProfileBottomSheet = ({ 
  visible, 
  onClose, 
  userId, 
  userName 
}: { 
  visible: boolean; 
  onClose: () => void; 
  userId: string; 
  userName: string;
}) => {
  const [profile, setProfile] = useState<any>(null);
  const [pictures, setPictures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPicIndex, setCurrentPicIndex] = useState(0);

  useEffect(() => {
    if (visible && userId) {
      fetchProfileData();
    }
  }, [visible, userId]);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      // Fetch profile
      const profileRes = await fetch(`${API_BASE}/api/user/profile/${userId}`);
      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.profile);
      }

      // Fetch pictures
      const picsRes = await fetch(`${API_BASE}/api/user/pictures/${userId}`);
      if (picsRes.ok) {
        const data = await picsRes.json();
        const pics = data.pictures || {};
        const photoArray = [pics.picture_1, pics.picture_2, pics.picture_3, pics.picture_4, pics.picture_5]
          .filter(Boolean);
        setPictures(photoArray);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.profileModal}>
        {/* Header */}
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={onClose} style={styles.profileCloseBtn}>
            <Ionicons name="chevron-down" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.profileHeaderTitle}>Profile</Text>
          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <View style={styles.profileLoading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <ScrollView style={styles.profileContent} showsVerticalScrollIndicator={false}>
            {/* Photo Carousel */}
            <View style={styles.photoCarousel}>
              {pictures.length > 0 ? (
                <>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={(e) => {
                      const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                      setCurrentPicIndex(index);
                    }}
                    scrollEventThrottle={16}
                  >
                    {pictures.map((pic, index) => (
                      <Image
                        key={index}
                        source={{ uri: pic }}
                        style={styles.profilePhoto}
                        resizeMode="cover"
                      />
                    ))}
                  </ScrollView>
                  {pictures.length > 1 && (
                    <View style={styles.photoIndicators}>
                      {pictures.map((_, index) => (
                        <View
                          key={index}
                          style={[
                            styles.photoIndicator,
                            currentPicIndex === index && styles.photoIndicatorActive,
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.noPhotoPlaceholder}>
                  <Avatar name={userName} size={120} />
                </View>
              )}
            </View>

            {/* Profile Info */}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {profile?.name || userName}{profile?.age ? `, ${profile.age}` : ''}
              </Text>
              
              {profile?.location && (
                <View style={styles.profileLocationRow}>
                  <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.profileLocation}>{formatLocationForPrivacy(profile.location)}</Text>
                </View>
              )}

              {profile?.workProfile && (
                <View style={styles.profileLocationRow}>
                  <Ionicons name="briefcase-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.profileLocation}>{profile.workProfile}</Text>
                </View>
              )}

              {profile?.bio && (
                <Text style={styles.profileBio}>{profile.bio}</Text>
              )}

              {/* Genres */}
              {profile?.genres && profile.genres.length > 0 && (
                <View style={styles.profileSection}>
                  <Text style={styles.profileSectionTitle}>Movie Taste</Text>
                  <View style={styles.tagsContainer}>
                    {profile.genres.map((genre: string, idx: number) => (
                      <View key={idx} style={styles.tag}>
                        <Text style={styles.tagText}>{genre}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Top Movies */}
              {Array.isArray(profile?.topMovies) && profile.topMovies.length > 0 && (
                <View style={styles.profileSection}>
                  <Text style={styles.profileSectionTitle}>Favorite Movies</Text>
                  {profile.topMovies.slice(0, 5).map((movie: any, idx: number) => (
                    <View key={idx} style={styles.movieItem}>
                      <Ionicons name="film-outline" size={18} color={COLORS.primary} />
                      <Text style={styles.movieTitle}>{movie.title}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
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
        <Avatar name={user?.name || 'U'} size={60} imageUrl={user?.avatar} />
        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{user?.name || 'Unknown'}{user?.age ? `, ${user.age}` : ''}</Text>
          <Text style={styles.requestLocation}>{user?.location || 'Unknown location'}</Text>
        </View>
      </View>
      <Text style={styles.requestPreview} numberOfLines={2}>&quot;{request.preview}&quot;</Text>
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
    <TouchableOpacity style={styles.conversationItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.conversationAvatar}>
        <Avatar name={user?.name || 'U'} size={56} imageUrl={user?.avatar} />
        <View style={styles.onlineDot} />
      </View>
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={[styles.conversationName, hasUnread && styles.unreadName]} numberOfLines={1}>
            {user?.name || 'Unknown'}
          </Text>
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

// ============ GIFTED CHAT SCREEN ============
const GiftedChatScreen = ({ 
  conversation, 
  userId,
  onBack,
}: {
  conversation: Conversation;
  userId: string;
  onBack: () => void;
}) => {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
  const otherUser = conversation.other_user;
  const otherUserId = conversation.other_user_id;

  // Convert backend messages to GiftedChat format
  const convertToGiftedMessages = (backendMessages: BackendMessage[]): IMessage[] => {
    return backendMessages.map((msg) => ({
      _id: msg.message_id,
      text: msg.content,
      createdAt: new Date(msg.created_at),
      user: {
        _id: msg.sender_id,
        name: msg.sender_id === userId ? 'You' : otherUser?.name || 'Unknown',
        avatar: msg.sender_id === userId ? undefined : otherUser?.avatar,
      },
    }));
  };

  // Fetch messages
  useEffect(() => {
    fetchMessages();
  }, [conversation.conversation_id]);

  // Check if suggestions should show
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[0]; // GiftedChat messages are sorted newest first
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
        
        // Mark as read
        await fetch(`${API_BASE}/api/chat/read/${conversation.conversation_id}?user_id=${userId}`, { method: 'POST' });
        
        // Fetch suggestions if there are messages
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

    // Optimistically add message
    setMessages(previousMessages => GiftedChat.append(previousMessages, newMessages));
    
    // Hide suggestions after sending
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

      // Show typing indicator and wait for AI reply
      setIsTyping(true);
      
      // Poll for new messages after AI reply (4 seconds)
      setTimeout(async () => {
        setIsTyping(false);
        await fetchMessages();
      }, 4000);
      
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }, [userId, otherUserId, conversation.conversation_id]);

  const handleSuggestionPress = (suggestion: string) => {
    const newMessage: IMessage = {
      _id: `temp_${Date.now()}`,
      text: suggestion,
      createdAt: new Date(),
      user: { _id: userId, name: 'You' },
    };
    onSend([newMessage]);
  };

  const handleUnmatch = () => {
    Alert.alert(
      'Unmatch',
      `Are you sure you want to unmatch with ${otherUser?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unmatch',
          style: 'destructive',
          onPress: async () => {
            await fetch(`${API_BASE}/api/chat/unmatch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: userId, other_user_id: otherUserId }),
            });
            onBack();
          },
        },
      ]
    );
  };

  const handleReport = () => {
    Alert.alert(
      'Report User',
      'Why are you reporting this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Inappropriate', onPress: () => submitReport('inappropriate') },
        { text: 'Harassment', onPress: () => submitReport('harassment') },
        { text: 'Fake Profile', onPress: () => submitReport('fake_profile') },
      ]
    );
  };

  const submitReport = async (reason: string) => {
    await fetch(`${API_BASE}/api/chat/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reporter_id: userId, reported_id: otherUserId, reason }),
    });
    Alert.alert('Reported', 'Thank you. We will review this report.');
  };

  // Custom bubble
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

  // Custom input toolbar
  const renderInputToolbar = (props: any) => (
    <InputToolbar
      {...props}
      containerStyle={styles.inputToolbar}
      primaryStyle={styles.inputPrimary}
    />
  );

  // Custom composer
  const renderComposer = (props: any) => (
    <Composer
      {...props}
      textInputStyle={styles.composerInput}
      placeholderTextColor={COLORS.textMuted}
      placeholder="Type a message..."
    />
  );

  // Custom send button
  const renderSend = (props: any) => (
    <Send {...props} containerStyle={styles.sendContainer}>
      <View style={styles.sendButton}>
        <Ionicons name="send" size={20} color="#FFF" />
      </View>
    </Send>
  );

  // Custom avatar
  const renderAvatar = (props: any) => {
    const user = props.currentMessage?.user;
    if (user?._id === userId) return null;
    
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
      {/* Chat Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.chatHeaderProfile} onPress={() => setShowProfile(true)}>
          <Avatar name={otherUser?.name || 'U'} size={40} imageUrl={otherUser?.avatar} />
          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatHeaderName}>{otherUser?.name || 'Unknown'}</Text>
            <Text style={styles.chatHeaderStatus}>
              {isTyping ? 'typing...' : 'Online'}
            </Text>
          </View>
        </TouchableOpacity>
        
        <View style={styles.chatHeaderActions}>
          <TouchableOpacity style={styles.headerActionBtn} onPress={() => Alert.alert('Voice Call', 'Coming soon!')}>
            <Ionicons name="call-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionBtn} onPress={() => Alert.alert('Video Call', 'Coming soon!')}>
            <Ionicons name="videocam-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionBtn} onPress={() => setShowMenu(true)}>
            <Ionicons name="ellipsis-vertical" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* GiftedChat */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <GiftedChat
          messages={messages}
          onSend={onSend}
          user={{ _id: userId, name: 'You' }}
          renderBubble={renderBubble}
          renderInputToolbar={renderInputToolbar}
          renderComposer={renderComposer}
          renderSend={renderSend}
          renderAvatar={renderAvatar}
          renderAccessory={showSuggestions && suggestions.length > 0 ? () => (
            <View style={styles.suggestionsBarBottom}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={styles.suggestionsContent}
                keyboardShouldPersistTaps="handled"
              >
                {suggestions.map((suggestion, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={styles.suggestionChip}
                    onPress={() => handleSuggestionPress(suggestion)}
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : undefined}
          alwaysShowSend
          scrollToBottom
          isTyping={isTyping}
          infiniteScroll
          inverted={true}
          renderUsernameOnMessage={false}
          showUserAvatar={false}
          showAvatarForEveryMessage={false}
          renderAvatarOnTop
          messagesContainerStyle={styles.messagesContainer}
          bottomOffset={Platform.OS === 'ios' ? 34 : 0}
          minInputToolbarHeight={56}
          listViewProps={{
            style: { backgroundColor: COLORS.bg },
            keyboardDismissMode: 'interactive',
            keyboardShouldPersistTaps: 'handled',
          }}
        />
      )}

      {/* Menu Modal */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowProfile(true); }}>
              <Ionicons name="person-outline" size={22} color={COLORS.text} />
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); Alert.alert('Did you meet?', 'Verification coming soon!'); }}>
              <Ionicons name="cafe-outline" size={22} color={COLORS.text} />
              <Text style={styles.menuItemText}>Did you meet?</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); handleUnmatch(); }}>
              <Ionicons name="heart-dislike-outline" size={22} color={COLORS.warning} />
              <Text style={[styles.menuItemText, { color: COLORS.warning }]}>Unmatch</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); handleReport(); }}>
              <Ionicons name="flag-outline" size={22} color={COLORS.primary} />
              <Text style={[styles.menuItemText, { color: COLORS.primary }]}>Report</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Profile Sheet */}
      <ProfileBottomSheet
        visible={showProfile}
        onClose={() => setShowProfile(false)}
        userId={otherUserId}
        userName={otherUser?.name || 'Unknown'}
      />
    </KeyboardAvoidingView>
  );
};

// ============ MAIN CHAT TAB ============
export default function ChatTab() {
  const { mode } = useAppMode();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'chats' | 'requests'>('chats');
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
    
    // Initialize mock conversations
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

  // If conversation selected, show chat
  if (selectedConversation) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GiftedChatScreen
          conversation={selectedConversation}
          userId={userId}
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {/* Tabs */}
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

      {/* Content */}
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
                onAccept={() => handleAcceptRequest(req.conversation_id)}
                onDecline={() => handleDeclineRequest(req.conversation_id)}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ============ HELPERS ============
function formatTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ============ STYLES ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  
  // Header
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  
  // Tabs
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '500' },
  tabTextActive: { color: COLORS.primary, fontWeight: '600' },
  
  // List
  listContent: { flex: 1, paddingHorizontal: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: 12 },
  
  // Empty State
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 8, textAlign: 'center' },
  
  // Avatar
  avatar: { justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFF', fontWeight: 'bold' },
  
  // Conversation Item
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
  
  // Request Card
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
  
  // Chat Screen
  chatContainer: { flex: 1, backgroundColor: COLORS.bg },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 8 },
  chatHeaderProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  chatHeaderInfo: { marginLeft: 12 },
  chatHeaderName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  chatHeaderStatus: { fontSize: 12, color: COLORS.online, marginTop: 1 },
  chatHeaderActions: { flexDirection: 'row' },
  headerActionBtn: { padding: 10 },
  
  // Suggestions
  suggestionsBar: { backgroundColor: COLORS.bgCard, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  suggestionsBarBottom: { backgroundColor: COLORS.bgCard, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  suggestionsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  suggestionChip: { backgroundColor: COLORS.suggestion, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary },
  suggestionText: { fontSize: 14, color: COLORS.text },
  
  // Messages
  messagesContainer: { backgroundColor: COLORS.bg, paddingBottom: 10 },
  
  // Input
  inputToolbar: { backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 8 },
  inputPrimary: { alignItems: 'center' },
  composerInput: { backgroundColor: COLORS.bgInput, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, marginRight: 8, color: COLORS.text, fontSize: 16, maxHeight: 100 },
  sendContainer: { justifyContent: 'center', alignItems: 'center', marginRight: 4 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  
  // Menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  menuContainer: { backgroundColor: COLORS.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 },
  menuItemText: { fontSize: 16, color: COLORS.text },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  
  // Profile Modal
  profileModal: { flex: 1, backgroundColor: COLORS.bg },
  profileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  profileCloseBtn: { padding: 8 },
  profileHeaderTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  profileLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileContent: { flex: 1 },
  photoCarousel: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.45 },
  profilePhoto: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.45 },
  noPhotoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bgCard },
  photoIndicators: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  photoIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  photoIndicatorActive: { backgroundColor: '#FFF', width: 24 },
  profileInfo: { padding: 20 },
  profileName: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  profileLocationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  profileLocation: { fontSize: 14, color: COLORS.textSecondary },
  profileBio: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22, marginTop: 16 },
  profileSection: { marginTop: 24 },
  profileSectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: COLORS.bgCard, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  tagText: { fontSize: 13, color: COLORS.text },
  movieItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  movieTitle: { fontSize: 15, color: COLORS.text },
});
