import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GiftedChat, Bubble, InputToolbar, Send, Composer, IMessage } from 'react-native-gifted-chat';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  primary: '#E50914',
  bg: '#0A0A0A',
  bgCard: '#1A1A1A',
  bgInput: '#2A2A2A',
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#666666',
  border: '#333333',
  tina: '#FF6B9D', // Tina's color
};

// Tina's avatar - a friendly female AI assistant
const TINA_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop';

interface TinaChatProps {
  userId: string;
  userName: string;
  onComplete: (profileData: Record<string, any>) => void;
  onSkip: () => void;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function TinaChat({ userId, userName, onComplete, onSkip }: TinaChatProps) {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [profileData, setProfileData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Fetch Tina's greeting on mount
  useEffect(() => {
    fetchGreeting();
  }, []);

  const fetchGreeting = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/tina/greeting/${encodeURIComponent(userName)}`);
      if (response.ok) {
        const data = await response.json();
        const greetingMessage: IMessage = {
          _id: `tina_greeting_${Date.now()}`,
          text: data.greeting,
          createdAt: new Date(),
          user: {
            _id: 'tina',
            name: 'Tina',
            avatar: TINA_AVATAR,
          },
        };
        setMessages([greetingMessage]);
        setConversationHistory([{ role: 'assistant', content: data.greeting }]);
      }
    } catch (error) {
      console.error('Error fetching greeting:', error);
      // Fallback greeting
      const fallbackMessage: IMessage = {
        _id: `tina_greeting_${Date.now()}`,
        text: `heyyy ${userName}! 👋 i'm tina, your movie matchmaker. let's chat and create a profile that shows the real you! what brings you here?`,
        createdAt: new Date(),
        user: {
          _id: 'tina',
          name: 'Tina',
          avatar: TINA_AVATAR,
        },
      };
      setMessages([fallbackMessage]);
    } finally {
      setLoading(false);
    }
  };

  const onSend = useCallback(async (newMessages: IMessage[] = []) => {
    const userMessage = newMessages[0]?.text;
    if (!userMessage?.trim()) return;

    // Add user message to chat
    setMessages(previousMessages => GiftedChat.append(previousMessages, newMessages));
    
    // Update conversation history
    const updatedHistory = [...conversationHistory, { role: 'user' as const, content: userMessage }];
    setConversationHistory(updatedHistory);

    // Show typing indicator
    setIsTyping(true);

    try {
      const response = await fetch(`${API_BASE}/api/tina/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          message: userMessage,
          conversation_history: updatedHistory,
          current_profile_data: profileData,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update profile data
        setProfileData(data.updated_profile_data || {});
        
        // Add Tina's response
        const tinaMessage: IMessage = {
          _id: `tina_${Date.now()}`,
          text: data.response,
          createdAt: new Date(),
          user: {
            _id: 'tina',
            name: 'Tina',
            avatar: TINA_AVATAR,
          },
        };
        
        setMessages(previousMessages => GiftedChat.append(previousMessages, [tinaMessage]));
        setConversationHistory(prev => [...prev, { role: 'assistant', content: data.response }]);

        // Check if conversation ended
        if (data.is_conversation_ended) {
          // Wait a moment then complete
          setTimeout(() => {
            onComplete(data.updated_profile_data || {});
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Error chatting with Tina:', error);
      // Add error message
      const errorMessage: IMessage = {
        _id: `error_${Date.now()}`,
        text: "oops, my brain glitched! 😅 can you say that again?",
        createdAt: new Date(),
        user: {
          _id: 'tina',
          name: 'Tina',
          avatar: TINA_AVATAR,
        },
      };
      setMessages(previousMessages => GiftedChat.append(previousMessages, [errorMessage]));
    } finally {
      setIsTyping(false);
    }
  }, [conversationHistory, profileData, userId, onComplete]);

  // Custom bubble
  const renderBubble = (props: any) => (
    <Bubble
      {...props}
      wrapperStyle={{
        right: { backgroundColor: COLORS.primary, marginRight: 8 },
        left: { backgroundColor: COLORS.tina, marginLeft: 8 },
      }}
      textStyle={{
        right: { color: '#FFF' },
        left: { color: '#FFF' },
      }}
      timeTextStyle={{
        right: { color: 'rgba(255,255,255,0.6)' },
        left: { color: 'rgba(255,255,255,0.6)' },
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
      placeholder="Type your answer..."
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

  // Custom avatar for Tina
  const renderAvatar = (props: any) => {
    const user = props.currentMessage?.user;
    if (user?._id === userId) return null;
    
    return (
      <Image 
        source={{ uri: TINA_AVATAR }} 
        style={styles.tinaAvatar}
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Image source={{ uri: TINA_AVATAR }} style={styles.headerAvatar} />
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>Tina</Text>
            <Text style={styles.headerStatus}>
              {isTyping ? 'typing...' : 'your movie matchmaker ✨'}
            </Text>
          </View>
        </View>
        
        <View style={{ width: 50 }} />
      </View>

      {/* Progress indicator */}
      <View style={styles.progressBar}>
        <View style={styles.progressFill} />
      </View>

      {/* Chat */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.tina} />
          <Text style={styles.loadingText}>Tina is getting ready...</Text>
        </View>
      ) : (
        <GiftedChat
          messages={messages}
          onSend={onSend}
          user={{ _id: userId, name: userName }}
          renderBubble={renderBubble}
          renderInputToolbar={renderInputToolbar}
          renderComposer={renderComposer}
          renderSend={renderSend}
          renderAvatar={renderAvatar}
          alwaysShowSend
          scrollToBottom
          isTyping={isTyping}
          renderUsernameOnMessage={false}
          showUserAvatar={false}
          showAvatarForEveryMessage={false}
          messagesContainerStyle={styles.messagesContainer}
          listViewProps={{
            style: { backgroundColor: COLORS.bg },
          }}
        />
      )}

      {/* Quick exit hint */}
      <View style={styles.hintBar}>
        <Text style={styles.hintText}>
          Say "bye" or "done" when you're ready to continue 👋
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  skipBtn: { padding: 8 },
  skipText: { color: COLORS.textSecondary, fontSize: 15 },
  headerCenter: { flexDirection: 'row', alignItems: 'center' },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: COLORS.tina },
  headerInfo: { marginLeft: 12 },
  headerName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  headerStatus: { fontSize: 12, color: COLORS.tina, marginTop: 1 },
  
  // Progress
  progressBar: {
    height: 3,
    backgroundColor: COLORS.border,
  },
  progressFill: {
    width: '30%',
    height: '100%',
    backgroundColor: COLORS.tina,
  },
  
  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: 12, fontSize: 14 },
  
  // Messages
  messagesContainer: { backgroundColor: COLORS.bg, paddingBottom: 10 },
  tinaAvatar: { width: 36, height: 36, borderRadius: 18 },
  
  // Input
  inputToolbar: {
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  inputPrimary: { alignItems: 'center' },
  composerInput: {
    backgroundColor: COLORS.bgInput,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 8,
    color: COLORS.text,
    fontSize: 16,
    maxHeight: 100,
  },
  sendContainer: { justifyContent: 'center', alignItems: 'center', marginRight: 4 },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.tina,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Hint
  hintBar: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: COLORS.bgCard,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  hintText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
