import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  FlatList, Platform, KeyboardAvoidingView,
  Dimensions, ScrollView, Animated, Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../theme';
import { ProfileData } from '../types';

const { width } = Dimensions.get('window');
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || '';

// Tina avatar - friendly, warm image
const TINA_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face';

// Total mandatory fields for progress calculation
const TOTAL_TOPICS = 12;

type Message = {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
};

type DeepLinkAction = {
  type: 'movies' | 'music' | 'interests';
  label: string;
  icon: string;
};

type Props = {
  userId: string;
  userName: string;
  onComplete: (profileData: Partial<ProfileData>) => void;
  onExit: (profileData: Partial<ProfileData>) => void;
  onRequestMovieSelection?: () => void;
  // Movies passed back from TopMoviesStep
  selectedMovies?: any[];
};

export default function TinaChatScreen({ 
  userId, 
  userName, 
  onComplete, 
  onExit,
  onRequestMovieSelection,
  selectedMovies: incomingMovies,
}: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [topicsCollected, setTopicsCollected] = useState(0);
  const [profileData, setProfileData] = useState<Partial<ProfileData>>({});
  const [currentOptions, setCurrentOptions] = useState<{
    field: string;
    options: string[];
    multiSelect: boolean;
  } | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [showSendButton, setShowSendButton] = useState(false);
  const [currentDeepLink, setCurrentDeepLink] = useState<DeepLinkAction | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [pendingMoviesProcessed, setPendingMoviesProcessed] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);
  const typingAnimation = useRef(new Animated.Value(0)).current;
  const messageAnimations = useRef<{ [key: string]: Animated.Value }>({});

  // Typing dots animation
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
  }, [isTyping]);

  // Initialize conversation
  useEffect(() => {
    if (!hasInitialized) {
      initConversation();
      setHasInitialized(true);
    }
  }, [hasInitialized]);

  // Handle incoming movies from TopMoviesStep
  useEffect(() => {
    if (incomingMovies && incomingMovies.length > 0 && !pendingMoviesProcessed) {
      setPendingMoviesProcessed(true);
      // Clear the deep link CTA
      setCurrentDeepLink(null);
      // Process the selected movies
      handleMoviesReceived(incomingMovies);
    }
  }, [incomingMovies, pendingMoviesProcessed]);

  const getMessageAnimation = (id: string) => {
    if (!messageAnimations.current[id]) {
      messageAnimations.current[id] = new Animated.Value(0);
    }
    return messageAnimations.current[id];
  };

  const addMessage = (text: string, isUser: boolean) => {
    const msg: Message = {
      id: `${isUser ? 'user' : 'tina'}_${Date.now()}_${Math.random()}`,
      text,
      isUser,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, msg]);
    
    // Animate message entrance
    const anim = getMessageAnimation(msg.id);
    Animated.spring(anim, {
      toValue: 1,
      tension: 100,
      friction: 8,
      useNativeDriver: true,
    }).start();
    
    return msg;
  };

  const initConversation = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tina/greeting?user_name=${encodeURIComponent(userName)}`);
      const data = await res.json();
      
      if (data.success) {
        addMessage(data.greeting, false);
        setTimeout(() => sendToTina(''), 1500);
      }
    } catch (error) {
      console.error('Init error:', error);
      addMessage(`Hey ${userName}! 💫`, false);
      setTimeout(() => {
        addMessage("I'm Tina, your personal matchmaker.", false);
        setTimeout(() => sendToTina(''), 1000);
      }, 800);
    }
  };

  // Handle movies received from TopMoviesStep
  const handleMoviesReceived = async (movies: any[]) => {
    // Show user's selection as a message
    const movieTitles = movies.map(m => m.title).join(', ');
    addMessage(`My top movies: ${movieTitles}`, true);
    
    // Send to Tina backend
    setIsTyping(true);
    
    try {
      const response = await fetch(`${API_BASE}/api/tina/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          user_name: userName,
          message: `I selected my favorite movies: ${movieTitles}`,
          selected_movies: movies,
        }),
      });

      const data = await response.json();
      
      await new Promise(r => setTimeout(r, 500 + Math.random() * 600));
      setIsTyping(false);

      // Update state
      const completedCount = data.completion_percentage ? Math.round((data.completion_percentage / 100) * TOTAL_TOPICS) : 0;
      setTopicsCollected(completedCount);
      if (data.profile_data) setProfileData(data.profile_data);

      // Add Tina's acknowledgment
      addMessage(data.response, false);

      // Continue with next question
      if (data.show_options) {
        setTimeout(() => {
          setCurrentOptions({
            ...data.show_options,
            multiSelect: data.show_options.multi_select || data.show_options.multiSelect,
          });
          setSelectedOptions([]);
          setShowSendButton(false);
        }, 300);
      }

      // Check for another deep link
      if (data.show_deep_link) {
        setTimeout(() => {
          setCurrentDeepLink(data.show_deep_link);
        }, 300);
      }

      // Check completion
      if (data.completion_percentage >= 100) {
        setTimeout(() => onComplete(data.profile_data || {}), 2000);
      }

    } catch (error) {
      console.error('Chat error:', error);
      setIsTyping(false);
      addMessage("Nice choices! 😍 I can already tell you have great taste.", false);
      // Continue conversation
      setTimeout(() => sendToTina(''), 1000);
    }
  };

  const sendToTina = async (
    userMessage: string, 
    selectedOption?: string, 
    selectedOpts?: string[],
  ) => {
    if (userMessage) {
      addMessage(userMessage, true);
    }

    setIsTyping(true);
    setInputText('');
    setCurrentOptions(null);
    setSelectedOptions([]);
    setShowSendButton(false);
    setCurrentDeepLink(null);

    try {
      const response = await fetch(`${API_BASE}/api/tina/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          user_name: userName,
          message: userMessage,
          selected_option: selectedOption,
          selected_options: selectedOpts,
        }),
      });

      const data = await response.json();
      
      // Natural typing delay
      await new Promise(r => setTimeout(r, 500 + Math.random() * 600));
      
      setIsTyping(false);

      // Handle exit
      if (data.exit_intent) {
        addMessage(data.response, false);
        setProfileData(data.profile_data || {});
        setTimeout(() => onExit(data.profile_data || {}), 2000);
        return;
      }

      // Update state
      const completedCount = data.completion_percentage ? Math.round((data.completion_percentage / 100) * TOTAL_TOPICS) : 0;
      setTopicsCollected(completedCount);
      if (data.profile_data) setProfileData(data.profile_data);

      // Add Tina's response
      addMessage(data.response, false);

      // Show options if needed (simple chip selection)
      if (data.show_options) {
        setTimeout(() => {
          setCurrentOptions({
            ...data.show_options,
            multiSelect: data.show_options.multi_select || data.show_options.multiSelect,
          });
          setSelectedOptions([]);
          setShowSendButton(false);
        }, 300);
      }

      // Show deep link CTA for complex selections (movies, etc.)
      if (data.show_movie_picker || data.show_deep_link) {
        setTimeout(() => {
          setCurrentDeepLink({
            type: 'movies',
            label: 'Select My Movies',
            icon: 'film-outline',
          });
        }, 300);
      }

      // Check completion
      if (data.completion_percentage >= 100) {
        setTimeout(() => onComplete(data.profile_data || {}), 2000);
      }

    } catch (error) {
      console.error('Chat error:', error);
      setIsTyping(false);
      addMessage("Oops! Let me try that again... 😅", false);
    }
  };

  const handleSend = () => {
    if (inputText.trim()) {
      sendToTina(inputText.trim());
    }
  };

  const handleOptionSelect = (option: string) => {
    if (!currentOptions) return;

    if (currentOptions.multiSelect) {
      const newSelected = selectedOptions.includes(option)
        ? selectedOptions.filter(o => o !== option)
        : [...selectedOptions, option];
      setSelectedOptions(newSelected);
      setShowSendButton(newSelected.length > 0);
    } else {
      // Single select - highlight and show send
      setSelectedOptions([option]);
      setShowSendButton(true);
    }
  };

  const handleOptionsSend = () => {
    if (selectedOptions.length === 0) return;
    
    const opts = [...selectedOptions];
    const displayText = opts.join(', ');
    
    if (currentOptions?.multiSelect) {
      setCurrentOptions(null);
      setSelectedOptions([]);
      setShowSendButton(false);
      sendToTina(displayText, undefined, opts);
    } else {
      setCurrentOptions(null);
      setSelectedOptions([]);
      setShowSendButton(false);
      sendToTina(opts[0], opts[0]);
    }
  };

  // Handle deep link CTA tap
  const handleDeepLinkTap = () => {
    if (!currentDeepLink) return;
    
    if (currentDeepLink.type === 'movies' && onRequestMovieSelection) {
      onRequestMovieSelection();
    }
    // Future: handle other types like music, interests, etc.
  };

  // Skip button handler - graceful exit
  const handleSkip = () => {
    if (isExiting) return;
    setIsExiting(true);
    
    // Add farewell message
    addMessage("No worries! 😊", false);
    setTimeout(() => {
      addMessage("I've saved everything you've shared so far.", false);
      setTimeout(() => {
        addMessage("We can continue later and I'll pick up exactly where we left off. 💫", false);
        setTimeout(() => {
          onExit(profileData);
        }, 1500);
      }, 600);
    }, 600);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const anim = getMessageAnimation(item.id);
    const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
    const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    
    return (
      <Animated.View 
        style={[
          styles.messageRow, 
          item.isUser && styles.messageRowUser,
          { transform: [{ scale }], opacity }
        ]}
      >
        {!item.isUser && (
          <Image source={{ uri: TINA_AVATAR }} style={styles.msgAvatar} />
        )}
        <View style={[styles.bubble, item.isUser ? styles.userBubble : styles.tinaBubble]}>
          <Text style={[styles.bubbleText, item.isUser && styles.userBubbleText]}>
            {item.text}
          </Text>
        </View>
      </Animated.View>
    );
  };

  const progressPercentage = Math.round((topicsCollected / TOTAL_TOPICS) * 100);

  return (
    <View style={styles.container}>
      {/* Premium Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          {/* Left - Tina Avatar */}
          <View style={styles.headerLeft}>
            <View style={styles.avatarContainer}>
              <Image source={{ uri: TINA_AVATAR }} style={styles.headerAvatar} />
              <View style={styles.onlineDot} />
            </View>
          </View>

          {/* Center - Name & Title */}
          <View style={styles.headerCenter}>
            <Text style={styles.headerName}>Tina</Text>
            <Text style={styles.headerTitle}>
              {isTyping ? 'typing...' : 'Your AI Matchmaker'}
            </Text>
          </View>

          {/* Right - Skip Button */}
          <TouchableOpacity 
            style={styles.skipButton} 
            onPress={handleSkip}
            disabled={isExiting}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Profile Strength Progress */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Profile Strength</Text>
            <Text style={styles.progressCount}>
              {topicsCollected} of {TOTAL_TOPICS} collected
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <LinearGradient
              colors={['#FF6B6B', '#FF8E53', '#FFC107']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressBarFill, { width: `${Math.max(5, progressPercentage)}%` }]}
            />
          </View>
        </View>
      </SafeAreaView>

      {/* Chat Area */}
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
            { paddingBottom: currentOptions || currentDeepLink ? 200 : 100 }
          ]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={isTyping ? (
            <View style={styles.typingRow}>
              <Image source={{ uri: TINA_AVATAR }} style={styles.msgAvatar} />
              <View style={styles.typingBubble}>
                <Animated.View style={[styles.typingDotsContainer, { opacity: typingAnimation }]}>
                  <View style={styles.typingDot} />
                  <View style={[styles.typingDot, styles.typingDotMiddle]} />
                  <View style={styles.typingDot} />
                </Animated.View>
              </View>
            </View>
          ) : null}
        />

        {/* Deep Link CTA Button (for Movies, etc.) */}
        {currentDeepLink && (
          <View style={styles.deepLinkContainer}>
            <TouchableOpacity 
              style={styles.deepLinkButton}
              onPress={handleDeepLinkTap}
              activeOpacity={0.8}
            >
              <Ionicons name={currentDeepLink.icon as any} size={24} color="#FFF" />
              <Text style={styles.deepLinkText}>{currentDeepLink.label}</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Options Selection Area */}
        {currentOptions && !currentDeepLink && (
          <View style={styles.optionsContainer}>
            <View style={styles.optionsHeader}>
              <Text style={styles.optionsHint}>
                {currentOptions.multiSelect ? 'Select all that apply' : 'Tap to select'}
              </Text>
            </View>
            <ScrollView 
              horizontal={false}
              showsVerticalScrollIndicator={false}
              style={styles.optionsScroll}
              contentContainerStyle={styles.optionsContent}
            >
              <View style={styles.chipsWrapper}>
                {currentOptions.options.map((opt, i) => {
                  const isSelected = selectedOptions.includes(opt);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => handleOptionSelect(opt)}
                      activeOpacity={0.7}
                    >
                      {currentOptions.multiSelect && (
                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                          {isSelected && <Ionicons name="checkmark" size={12} color="#FFF" />}
                        </View>
                      )}
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            
            {/* Send Selection Button */}
            {showSendButton && (
              <TouchableOpacity 
                style={styles.sendSelectionBtn}
                onPress={handleOptionsSend}
                activeOpacity={0.8}
              >
                <Text style={styles.sendSelectionText}>
                  Send{selectedOptions.length > 1 ? ` (${selectedOptions.length})` : ''}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Chat Composer */}
        <View style={[styles.composerContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder="Type your message..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity 
              style={[styles.sendBtn, inputText.trim() && styles.sendBtnActive]}
              onPress={handleSend}
              disabled={!inputText.trim() || isTyping}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="send" 
                size={20} 
                color={inputText.trim() ? '#FFF' : 'rgba(255,255,255,0.3)'} 
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
  
  // Header
  headerSafe: {
    backgroundColor: '#0D0D0D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    marginRight: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  headerAvatar: { 
    width: 44, 
    height: 44, 
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4ADE80',
    borderWidth: 2,
    borderColor: '#0D0D0D',
  },
  headerCenter: {
    flex: 1,
  },
  headerName: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerTitle: { 
    fontSize: 13, 
    color: 'rgba(255,255,255,0.6)',
    marginTop: 1,
  },
  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },

  // Progress
  progressSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  progressBarBg: { 
    height: 6, 
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: { 
    height: '100%',
    borderRadius: 3,
  },

  // Chat Area
  chatArea: { 
    flex: 1,
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
  messageRowUser: { 
    justifyContent: 'flex-end',
  },
  msgAvatar: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    marginRight: 10,
  },
  bubble: { 
    maxWidth: '78%', 
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
  bubbleText: { 
    fontSize: 16, 
    color: '#FFFFFF',
    lineHeight: 22,
  },
  userBubbleText: { 
    color: '#FFFFFF',
  },

  // Typing indicator
  typingRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  typingBubble: { 
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
  },
  typingDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingDot: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  typingDotMiddle: {
    marginHorizontal: 4,
  },

  // Deep Link CTA
  deepLinkContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  deepLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 28,
    gap: 12,
  },
  deepLinkText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },

  // Options Container
  optionsContainer: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    maxHeight: 280,
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
    maxHeight: 150,
  },
  optionsContent: {
    paddingBottom: 8,
  },
  chipsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chipSelected: { 
    backgroundColor: 'rgba(255,107,107,0.2)',
    borderColor: '#FF6B6B',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FF6B6B',
  },
  chipText: { 
    fontSize: 15, 
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  chipTextSelected: { 
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sendSelectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    paddingVertical: 14,
    borderRadius: 25,
    marginTop: 12,
    marginBottom: 8,
    gap: 8,
  },
  sendSelectionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Composer
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
