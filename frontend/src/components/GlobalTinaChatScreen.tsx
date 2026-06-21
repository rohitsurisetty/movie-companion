import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  FlatList, Platform, KeyboardAvoidingView,
  Dimensions, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTina, UserProfileData, Message } from '../context/TinaContext';

const { width } = Dimensions.get('window');
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || '';

// Tina avatar
const TINA_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face';

// All profile fields that can be collected (must match TinaContext)
const ALL_PROFILE_FIELDS = [
  'name', 'gender', 'dateOfBirth', 'location',
  'relationshipIntent', 'partnerPreference', 'languagesSpoken',
  'movieFrequency', 'ottTheatre', 'filmLanguages', 'genres', 'topMovies',
  'height', 'drinking', 'smoking', 'zodiac', 'bio'
];

type DeepLinkAction = {
  type: 'movies' | 'music' | 'interests';
  label: string;
  icon: string;
};

interface Props {
  userId: string;
  userName: string;
  existingMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
  onNavigationRequest?: (destination: string, params?: any) => void;
  isOnboardingComplete?: boolean;
  userProfile?: UserProfileData | null;
}

export default function GlobalTinaChatScreen({
  userId,
  userName,
  existingMessages = [],
  onMessagesChange,
  onNavigationRequest,
  isOnboardingComplete = false,
  userProfile,
}: Props) {
  const insets = useSafeAreaInsets();
  const { isFieldCollected, markFieldAsCollected, markFieldAsAsked, getMissingFields, state: tinaState } = useTina();
  
  // Initialize messages from existing
  const [messages, setMessages] = useState<Message[]>(() => {
    return existingMessages.length > 0 ? existingMessages : [];
  });
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentOptions, setCurrentOptions] = useState<{
    field: string;
    options: string[];
    multiSelect: boolean;
  } | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [showSendButton, setShowSendButton] = useState(false);
  const [currentDeepLink, setCurrentDeepLink] = useState<DeepLinkAction | null>(null);
  const [hasGreetedThisSession, setHasGreetedThisSession] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);
  const typingAnimation = useRef(new Animated.Value(0)).current;
  const messageAnimations = useRef<{ [key: string]: Animated.Value }>({});
  const mountedRef = useRef(true);

  // ========== HELPER FUNCTIONS ==========

  const generateMessageId = (isUser: boolean) =>
    `${isUser ? 'user' : 'tina'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const getMessageAnimation = (id: string) => {
    if (!messageAnimations.current[id]) {
      // Default to fully visible for restored messages
      messageAnimations.current[id] = new Animated.Value(1);
    }
    return messageAnimations.current[id];
  };

  const addMessage = useCallback((text: string, isUser: boolean): Message => {
    const msg: Message = {
      id: generateMessageId(isUser),
      text,
      isUser,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, msg]);

    // Animate new message entrance
    messageAnimations.current[msg.id] = new Animated.Value(0);
    Animated.spring(messageAnimations.current[msg.id], {
      toValue: 1,
      tension: 100,
      friction: 8,
      useNativeDriver: true,
    }).start();

    return msg;
  }, []);

  // ========== API CALLS ==========

  const sendToTina = useCallback(async (userMessage: string) => {
    if (!mountedRef.current) return;
    
    setIsTyping(true);

    try {
      // Build context about what's already collected
      const collectedInfo: string[] = [];
      if (userProfile) {
        if (userProfile.name) collectedInfo.push(`Name: ${userProfile.name}`);
        if (userProfile.genres?.length) collectedInfo.push(`Favorite genres: ${userProfile.genres.join(', ')}`);
        if (userProfile.topMovies?.length) collectedInfo.push(`Has ${userProfile.topMovies.length} favorite movies`);
        if (userProfile.relationshipIntent) collectedInfo.push(`Looking for: ${Array.isArray(userProfile.relationshipIntent) ? userProfile.relationshipIntent.join(', ') : userProfile.relationshipIntent}`);
        if (userProfile.languagesSpoken?.length) collectedInfo.push(`Languages: ${userProfile.languagesSpoken.join(', ')}`);
        if (userProfile.filmLanguages?.length) collectedInfo.push(`Film languages: ${userProfile.filmLanguages.join(', ')}`);
      }

      console.log('[GlobalTina] Sending message to Tina:', userMessage?.substring(0, 50));

      const response = await fetch(`${API_BASE}/api/tina/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          user_name: userName,
          message: userMessage,
          is_onboarding_complete: isOnboardingComplete || tinaState.onboardingStage === 'completed',
          collected_fields: collectedInfo,
          conversation_context: messages.slice(-6).map(m => ({
            role: m.isUser ? 'user' : 'assistant',
            content: m.text
          })),
        }),
      });

      if (!mountedRef.current) return;

      const data = await response.json();
      console.log('[GlobalTina] Received response:', data.success, data.response?.substring(0, 50));

      if (data.success && data.response) {
        addMessage(data.response, false);

        // Handle options
        if (data.show_options) {
          setCurrentOptions(data.show_options);
          if (data.show_options.field) {
            markFieldAsAsked(data.show_options.field);
          }
        } else {
          setCurrentOptions(null);
        }

        // Handle deep links
        if (data.deep_link) {
          setCurrentDeepLink(data.deep_link);
        }

        // Handle collected data
        if (data.collected_data) {
          Object.keys(data.collected_data).forEach(field => {
            markFieldAsCollected(field);
          });
        }
      } else {
        // Fallback if response is empty
        addMessage("I'm here! What would you like to chat about? 😊", false);
      }
    } catch (error) {
      console.error('[GlobalTina] Error sending message:', error);
      if (mountedRef.current) {
        addMessage("Hmm, I got a bit distracted! Could you say that again? 😅", false);
      }
    } finally {
      if (mountedRef.current) {
        setIsTyping(false);
      }
    }
  }, [userId, userName, userProfile, isOnboardingComplete, tinaState.onboardingStage, messages, addMessage, markFieldAsAsked, markFieldAsCollected]);

  // Fetch a proactive greeting from Tina
  const fetchTinaGreeting = useCallback(async () => {
    if (!mountedRef.current || hasGreetedThisSession) return;
    
    console.log('[GlobalTina] Fetching greeting, onboardingComplete:', isOnboardingComplete, tinaState.onboardingStage);
    setIsLoading(true);

    try {
      // Get collected fields from context to pass to backend
      const missing = getMissingFields();
      const collectedFieldsList = ALL_PROFILE_FIELDS.filter(f => !missing.includes(f));
      
      const actuallyComplete = isOnboardingComplete || tinaState.onboardingStage === 'completed';
      
      console.log('[GlobalTina] Calling welcome-back API, collected fields:', collectedFieldsList.length, 'complete:', actuallyComplete);
      
      const welcomeResponse = await fetch(`${API_BASE}/api/tina/welcome-back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          user_name: userName,
          is_onboarding_complete: actuallyComplete,
          collected_fields: collectedFieldsList,
        }),
      });

      if (!mountedRef.current) return;

      if (welcomeResponse.ok) {
        const welcomeData = await welcomeResponse.json();
        console.log('[GlobalTina] Welcome response:', welcomeData.success, welcomeData.message?.substring(0, 50));
        
        if (welcomeData.success && welcomeData.message) {
          // Add a small delay for natural feel
          setTimeout(() => {
            if (mountedRef.current) {
              addMessage(welcomeData.message, false);
              setHasGreetedThisSession(true);
              
              if (welcomeData.show_options) {
                setCurrentOptions(welcomeData.show_options);
              }
            }
          }, 300);
        }
      } else {
        // Fallback greeting
        setTimeout(() => {
          if (mountedRef.current) {
            const greeting = actuallyComplete
              ? `Hey ${userName || 'there'}! 💫 Good to see you! What's on your mind?`
              : `Hey ${userName || 'there'}! 👋 Let's continue setting up your profile!`;
            addMessage(greeting, false);
            setHasGreetedThisSession(true);
          }
        }, 300);
      }
    } catch (error) {
      console.error('[GlobalTina] Init error:', error);
      setTimeout(() => {
        if (mountedRef.current) {
          addMessage(`Hey ${userName || 'there'}! 💫 What can I help you with?`, false);
          setHasGreetedThisSession(true);
        }
      }, 300);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId, userName, isOnboardingComplete, tinaState.onboardingStage, hasGreetedThisSession, getMissingFields, addMessage]);

  // ========== EFFECTS ==========

  // Track component mount state
  useEffect(() => {
    mountedRef.current = true;
    console.log('[GlobalTina] Component mounted, onboardingComplete:', isOnboardingComplete, 'stage:', tinaState.onboardingStage);
    
    return () => {
      mountedRef.current = false;
      console.log('[GlobalTina] Component unmounting');
    };
  }, []);

  // Fetch greeting when modal opens (always greet on each open)
  useEffect(() => {
    // Only fetch greeting if we don't have a recent message from Tina
    const lastMessage = messages[messages.length - 1];
    const lastMessageIsOld = !lastMessage || 
      (lastMessage.isUser) || // Last message was from user, Tina should respond
      (Date.now() - new Date(lastMessage.timestamp).getTime() > 5 * 60 * 1000); // Older than 5 minutes
    
    if (!hasGreetedThisSession && lastMessageIsOld) {
      console.log('[GlobalTina] Triggering greeting fetch');
      fetchTinaGreeting();
    }
  }, [hasGreetedThisSession, fetchTinaGreeting]);

  // Sync messages to parent
  useEffect(() => {
    if (messages.length > 0 && onMessagesChange) {
      onMessagesChange(messages);
    }
  }, [messages, onMessagesChange]);

  // Typing animation
  useEffect(() => {
    if (isTyping) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(typingAnimation, { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.ease }),
          Animated.timing(typingAnimation, { toValue: 0.3, duration: 400, useNativeDriver: true, easing: Easing.ease }),
        ])
      ).start();
    } else {
      typingAnimation.setValue(0);
    }
  }, [isTyping, typingAnimation]);

  // ========== HANDLERS ==========

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

    addMessage(text, true);
    setInputText('');
    setShowSendButton(false);
    sendToTina(text);
  }, [inputText, addMessage, sendToTina]);

  const handleOptionSelect = useCallback((option: string) => {
    if (!currentOptions) return;

    if (currentOptions.multiSelect) {
      setSelectedOptions(prev =>
        prev.includes(option)
          ? prev.filter(o => o !== option)
          : [...prev, option]
      );
      setShowSendButton(true);
    } else {
      addMessage(option, true);
      setCurrentOptions(null);
      sendToTina(option);
    }
  }, [currentOptions, addMessage, sendToTina]);

  const handleConfirmSelection = useCallback(() => {
    if (selectedOptions.length === 0) return;

    const selectionText = selectedOptions.join(', ');
    addMessage(selectionText, true);
    setSelectedOptions([]);
    setCurrentOptions(null);
    setShowSendButton(false);
    sendToTina(selectionText);
  }, [selectedOptions, addMessage, sendToTina]);

  const handleDeepLink = useCallback(() => {
    if (!currentDeepLink || !onNavigationRequest) return;
    
    onNavigationRequest(currentDeepLink.type);
    setCurrentDeepLink(null);
  }, [currentDeepLink, onNavigationRequest]);

  // ========== RENDER ==========

  const renderMessage = ({ item }: { item: Message }) => {
    const anim = getMessageAnimation(item.id);
    const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
    const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });

    return (
      <Animated.View
        style={[
          styles.messageRow,
          item.isUser ? styles.userMessageRow : styles.tinaMessageRow,
          { opacity, transform: [{ scale }, { translateY }] },
        ]}
      >
        {!item.isUser && (
          <Image source={{ uri: TINA_AVATAR }} style={styles.avatar} />
        )}
        <View
          style={[
            styles.messageBubble,
            item.isUser ? styles.userBubble : styles.tinaBubble,
          ]}
        >
          <Text style={[styles.messageText, item.isUser && styles.userMessageText]}>
            {item.text}
          </Text>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Loading State */}
      {isLoading && messages.length === 0 && (
        <View style={styles.loadingContainer}>
          <Image source={{ uri: TINA_AVATAR }} style={styles.loadingAvatar} />
          <ActivityIndicator size="small" color="#FF6B6B" style={{ marginTop: 12 }} />
          <Text style={styles.loadingText}>Tina is getting ready...</Text>
        </View>
      )}

      {/* Chat Area with KeyboardAvoidingView */}
      <KeyboardAvoidingView 
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={[
            styles.messageList,
            { paddingBottom: currentOptions || currentDeepLink ? 200 : 100 },
          ]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={isTyping ? (
            <View style={[styles.messageRow, styles.tinaMessageRow]}>
              <Image source={{ uri: TINA_AVATAR }} style={styles.avatar} />
              <Animated.View style={[styles.typingBubble, { opacity: typingAnimation }]}>
                <View style={styles.typingDot} />
                <View style={[styles.typingDot, styles.typingDotMiddle]} />
                <View style={styles.typingDot} />
              </Animated.View>
            </View>
          ) : null}
        />

        {/* Options */}
        {currentOptions && (
          <View style={styles.optionsContainer}>
            <View style={styles.optionsHeader}>
              <Text style={styles.optionsHint}>
                {currentOptions.multiSelect ? 'Select all that apply' : 'Tap to select'}
              </Text>
            </View>
            <View style={styles.optionsScroll}>
              {currentOptions.options.map((option, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.optionChip,
                    selectedOptions.includes(option) && styles.optionChipSelected,
                  ]}
                  onPress={() => handleOptionSelect(option)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selectedOptions.includes(option) && styles.optionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {currentOptions.multiSelect && selectedOptions.length > 0 && (
              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmSelection}>
                <Text style={styles.confirmButtonText}>Confirm ({selectedOptions.length})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Deep Link CTA */}
        {currentDeepLink && (
          <View style={styles.deepLinkContainer}>
            <TouchableOpacity style={styles.deepLinkButton} onPress={handleDeepLink}>
              <Ionicons name={currentDeepLink.icon as any} size={20} color="#FFFFFF" />
              <Text style={styles.deepLinkText}>{currentDeepLink.label}</Text>
              <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Composer */}
        <View style={[styles.composerContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={text => {
                setInputText(text);
                setShowSendButton(text.trim().length > 0);
              }}
              placeholder="Type your message..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              style={[styles.sendBtn, showSendButton && styles.sendBtnActive]}
              onPress={handleSend}
              disabled={!showSendButton}
              activeOpacity={0.7}
            >
              <Ionicons
                name="send"
                size={20}
                color={showSendButton ? '#FFFFFF' : 'rgba(255,255,255,0.3)'}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  chatArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#FF6B6B',
  },
  loadingText: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  tinaMessageRow: {
    justifyContent: 'flex-start',
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  tinaBubble: {
    backgroundColor: '#1A1A1A',
    borderBottomLeftRadius: 6,
  },
  userBubble: {
    backgroundColor: '#FF6B6B',
    borderBottomRightRadius: 6,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#FFFFFF',
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  typingBubble: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B6B',
  },
  typingDotMiddle: {
    marginHorizontal: 4,
  },
  optionsContainer: {
    backgroundColor: '#0D0D0D',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  optionsHeader: {
    marginBottom: 12,
  },
  optionsHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  optionsScroll: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  optionChip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  optionChipSelected: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FF6B6B',
  },
  optionText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  confirmButton: {
    marginTop: 12,
    backgroundColor: '#FF6B6B',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deepLinkContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  deepLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    paddingVertical: 14,
    borderRadius: 25,
    gap: 8,
  },
  deepLinkText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  composerContainer: {
    backgroundColor: '#0D0D0D',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#1A1A1A',
    borderRadius: 25,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 50,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    maxHeight: 100,
    paddingVertical: 8,
    paddingRight: 8,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnActive: {
    backgroundColor: '#FF6B6B',
  },
});
