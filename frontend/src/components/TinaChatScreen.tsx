import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  FlatList, Platform, KeyboardAvoidingView,
  Dimensions, ScrollView, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { ProfileData } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || '';

// Tina avatar - friendly, warm image
const TINA_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face';

// Total mandatory fields for progress calculation
const TOTAL_TOPICS = 12;

// Storage key for conversation persistence
const TINA_CONVERSATION_KEY = 'tina_conversation_state';

// Fallback greetings when API fails - contextual based on onboarding stage
const FALLBACK_GREETINGS = {
  default: [
    "Hey there! 💫 I'm Tina, your personal matchmaker.",
    "Let's get to know you better so I can find your perfect movie buddy!",
  ],
  returning: [
    "Welcome back! 😊",
    "Ready to continue where we left off?",
  ],
  movieSelection: [
    "Great picks! 🎬",
    "I can already tell we're going to find you some amazing matches!",
  ],
  profileStart: [
    "Hi! Let's get your profile ready 🎬",
    "I'll guide you through the process - it'll be fun, I promise!",
  ],
  emailVerification: [
    "Perfect! Your email is verified ✅",
    "Now let's build your profile together!",
  ],
};

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

// Onboarding context to help Tina know where user is in the flow
type OnboardingContext = 
  | 'fresh_start'      // First time entering Tina
  | 'profile_building' // Building profile
  | 'movie_selection'  // Returning from movie selection
  | 'email_verified'   // Just verified email
  | 'returning'        // Returning to existing conversation
  | 'post_onboarding'; // Onboarding complete, free chat

type Props = {
  userId: string;
  userName: string;
  onComplete: (profileData: Partial<ProfileData>) => void;
  onExit: (profileData: Partial<ProfileData>) => void;
  onRequestMovieSelection?: () => void;
  // Movies passed back from TopMoviesStep
  selectedMovies?: any[];
  // Preserve messages across navigation
  existingMessages?: any[];
  onMessagesChange?: (messages: any[]) => void;
  isReturningFromMovieSelection?: boolean;
  // NEW: Onboarding context for smart conversation handling
  onboardingContext?: OnboardingContext;
};

export default function TinaChatScreen({ 
  userId, 
  userName, 
  onComplete, 
  onExit,
  onRequestMovieSelection,
  selectedMovies: incomingMovies,
  existingMessages,
  onMessagesChange,
  isReturningFromMovieSelection,
  onboardingContext = 'fresh_start',
}: Props) {
  const insets = useSafeAreaInsets();
  
  // ========== CORE STATE ==========
  // CRITICAL: Initialize messages IMMEDIATELY from existingMessages if available
  const [messages, setMessages] = useState<Message[]>(() => {
    if (existingMessages && existingMessages.length > 0) {
      console.log('[Tina] Initializing with existing messages:', existingMessages.length);
      return existingMessages;
    }
    return [];
  });
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  // Start loading only if we don't have existing messages
  const [isLoading, setIsLoading] = useState(() => {
    return !(existingMessages && existingMessages.length > 0);
  });
  const [isInitialized, setIsInitialized] = useState(() => {
    return existingMessages && existingMessages.length > 0;
  });
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
  const [pendingMoviesProcessed, setPendingMoviesProcessed] = useState(false);
  const [welcomeBackShown, setWelcomeBackShown] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);
  const typingAnimation = useRef(new Animated.Value(0)).current;
  const messageAnimations = useRef<{ [key: string]: Animated.Value }>({});
  // Use a ref that tracks if THIS instance has initialized (reset on unmount)
  const hasInitializedThisMount = useRef(false);
  
  // ========== HELPER FUNCTIONS ==========
  
  // Generate a unique message ID
  const generateMessageId = (isUser: boolean) => 
    `${isUser ? 'user' : 'tina'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Get contextual fallback greeting based on onboarding stage
  const getContextualFallbackGreeting = useCallback((): string[] => {
    const name = userName || 'there';
    
    if (isReturningFromMovieSelection) {
      return [`Great picks, ${name}! 🎬`, "Your movie taste tells me a lot about you!"];
    }
    
    switch (onboardingContext) {
      case 'email_verified':
        return [`Perfect! Email verified ✅`, `Now let's build your profile, ${name}!`];
      case 'returning':
        return [`Welcome back, ${name}! 😊`, "Ready to continue where we left off?"];
      case 'movie_selection':
        return [`Great picks, ${name}! 🎬`, "I can already tell we're going to find you some amazing matches!"];
      case 'post_onboarding':
        return [`Hey ${name}! 💫`, "Your profile is looking great! How can I help you today?"];
      case 'profile_building':
      case 'fresh_start':
      default:
        return [`Hey ${name}! 💫`, "I'm Tina, your personal matchmaker. Let's create an amazing profile together!"];
    }
  }, [userName, onboardingContext, isReturningFromMovieSelection]);
  
  // Add message with animation
  const addMessage = useCallback((text: string, isUser: boolean): Message => {
    const msg: Message = {
      id: generateMessageId(isUser),
      text,
      isUser,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, msg]);
    
    // Create animation starting at 0 for NEW messages and animate to 1
    messageAnimations.current[msg.id] = new Animated.Value(0);
    Animated.spring(messageAnimations.current[msg.id], {
      toValue: 1,
      tension: 100,
      friction: 8,
      useNativeDriver: true,
    }).start();
    
    return msg;
  }, []);
  
  // Add multiple messages sequentially with delays
  const addMessagesSequentially = useCallback(async (texts: string[], delayMs: number = 500) => {
    for (let i = 0; i < texts.length; i++) {
      await new Promise(resolve => setTimeout(resolve, i === 0 ? 0 : delayMs));
      addMessage(texts[i], false);
    }
  }, [addMessage]);
  
  // Save conversation to AsyncStorage
  const saveConversation = useCallback(async (msgs: Message[]) => {
    if (!userId) return;
    try {
      const data = {
        userId,
        messages: msgs,
        timestamp: Date.now(),
        profileData,
        topicsCollected,
      };
      await AsyncStorage.setItem(`${TINA_CONVERSATION_KEY}_${userId}`, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }, [userId, profileData, topicsCollected]);
  
  // Load conversation from AsyncStorage
  const loadSavedConversation = useCallback(async (): Promise<Message[] | null> => {
    if (!userId) return null;
    try {
      const saved = await AsyncStorage.getItem(`${TINA_CONVERSATION_KEY}_${userId}`);
      if (saved) {
        const data = JSON.parse(saved);
        // Check if conversation is less than 24 hours old
        if (data.timestamp && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
          if (data.profileData) setProfileData(data.profileData);
          if (data.topicsCollected) setTopicsCollected(data.topicsCollected);
          return data.messages || [];
        }
      }
    } catch (error) {
      console.error('Failed to load saved conversation:', error);
    }
    return null;
  }, [userId]);
  
  // ========== GUARANTEED INITIALIZATION ==========
  // This function ALWAYS results in messages being displayed - NEVER a blank screen
  const initializeConversation = useCallback(async () => {
    // Prevent double initialization within the same mount
    if (hasInitializedThisMount.current) {
      console.log('[Tina] Already initialized this mount, skipping');
      return;
    }
    hasInitializedThisMount.current = true;
    
    console.log('[Tina] Starting initialization...', {
      hasExistingMessages: existingMessages?.length || 0,
      currentMessages: messages.length,
      isReturning: isReturningFromMovieSelection,
      hasIncomingMovies: incomingMovies?.length || 0
    });
    
    // If we already have messages (from useState initializer), just handle special cases
    if (messages.length > 0) {
      console.log('[Tina] Already have messages, handling special cases');
      setIsInitialized(true);
      setIsLoading(false);
      
      // Handle returning from movie selection
      if (isReturningFromMovieSelection && !welcomeBackShown) {
        setWelcomeBackShown(true);
        if (incomingMovies && incomingMovies.length > 0 && !pendingMoviesProcessed) {
          setPendingMoviesProcessed(true);
          setCurrentDeepLink(null);
          setTimeout(() => {
            addMessage(`Great picks! 🎬`, false);
            setTimeout(() => handleMoviesReceived(incomingMovies), 300);
          }, 100);
        } else {
          setTimeout(() => {
            addMessage(`Welcome back, ${userName || 'there'}! 😊`, false);
            setTimeout(() => {
              addMessage("Let's continue where we left off...", false);
              setTimeout(() => sendToTina(''), 800);
            }, 400);
          }, 100);
        }
      }
      return;
    }
    
    setIsLoading(true);
    
    try {
      // PRIORITY 1: Try to load from AsyncStorage (for app restarts)
      const savedMessages = await loadSavedConversation();
      if (savedMessages && savedMessages.length > 0) {
        console.log('[Tina] Loaded from AsyncStorage:', savedMessages.length, 'messages');
        setMessages(savedMessages);
        setIsInitialized(true);
        setIsLoading(false);
        
        // Add a welcome back message
        setTimeout(() => {
          addMessage(`Welcome back, ${userName || 'there'}! 😊`, false);
          setTimeout(() => sendToTina(''), 800);
        }, 300);
        return;
      }
      
      // PRIORITY 2: Fetch greeting from API
      try {
        console.log('[Tina] Fetching greeting from API...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const res = await fetch(
          `${API_BASE}/api/tina/greeting?user_name=${encodeURIComponent(userName || '')}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.greeting) {
            console.log('[Tina] Got greeting from API');
            addMessage(data.greeting, false);
            setIsInitialized(true);
            setIsLoading(false);
            setTimeout(() => sendToTina(''), 1200);
            return;
          }
        }
      } catch (apiError) {
        console.log('[Tina] API greeting failed, using fallback:', apiError);
      }
      
      // PRIORITY 3: GUARANTEED FALLBACK - Always show something
      console.log('[Tina] Using fallback greeting');
      const fallbackMessages = getContextualFallbackGreeting();
      await addMessagesSequentially(fallbackMessages, 600);
      setIsInitialized(true);
      setIsLoading(false);
      setTimeout(() => sendToTina(''), 1000);
      
    } catch (error) {
      console.error('[Tina] Initialization error:', error);
      
      // ULTIMATE FALLBACK - This MUST NEVER fail
      const emergencyMessage = `Hey ${userName || 'there'}! 💫 I'm Tina, your matchmaker. Let's get started!`;
      addMessage(emergencyMessage, false);
      setIsInitialized(true);
      setIsLoading(false);
    }
  }, [
    existingMessages, 
    messages.length,
    isReturningFromMovieSelection, 
    incomingMovies, 
    pendingMoviesProcessed,
    welcomeBackShown,
    userName, 
    loadSavedConversation, 
    addMessage, 
    addMessagesSequentially, 
    getContextualFallbackGreeting
  ]);

  // ========== EFFECTS ==========
  
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
  }, [isTyping, typingAnimation]);

  // MAIN INITIALIZATION - Runs once on mount
  useEffect(() => {
    console.log('[Tina] Component mounted, starting initialization');
    initializeConversation();
    
    // Cleanup function - reset the ref when unmounting
    return () => {
      console.log('[Tina] Component unmounting');
      hasInitializedThisMount.current = false;
    };
  }, []); // Empty deps - only run on mount
  
  // Sync messages with parent whenever they change
  useEffect(() => {
    if (messages.length > 0 && onMessagesChange) {
      console.log('[Tina] Syncing', messages.length, 'messages to parent');
      onMessagesChange(messages);
    }
  }, [messages, onMessagesChange]);
  
  // Save to AsyncStorage periodically
  useEffect(() => {
    if (messages.length > 0) {
      saveConversation(messages);
    }
  }, [messages, saveConversation]);
  
  // Handle late-arriving movies from navigation
  useEffect(() => {
    if (isInitialized && incomingMovies && incomingMovies.length > 0 && !pendingMoviesProcessed) {
      console.log('[Tina] Late-arriving movies detected');
      setPendingMoviesProcessed(true);
      setCurrentDeepLink(null);
      setTimeout(() => {
        addMessage(`Great picks! 🎬`, false);
        setTimeout(() => handleMoviesReceived(incomingMovies), 300);
      }, 100);
    }
  }, [isInitialized, incomingMovies, pendingMoviesProcessed, addMessage]);
  
  // SAFETY NET: If somehow we end up with no messages after init, recover immediately
  useEffect(() => {
    const checkAndRecover = () => {
      if (isInitialized && !isLoading && messages.length === 0) {
        console.warn('[Tina] SAFETY NET: No messages after init, recovering...');
        const emergencyMessage = `Hey ${userName || 'there'}! 💫 Let's continue building your profile!`;
        addMessage(emergencyMessage, false);
      }
    };
    
    // Check immediately and again after a short delay
    checkAndRecover();
    const timer = setTimeout(checkAndRecover, 500);
    
    return () => clearTimeout(timer);
  }, [isInitialized, isLoading, messages.length, userName, addMessage]);

  const getMessageAnimation = (id: string) => {
    if (!messageAnimations.current[id]) {
      // Create animation and IMMEDIATELY set to 1 (fully visible)
      // This ensures restored messages are visible
      messageAnimations.current[id] = new Animated.Value(1);
    }
    return messageAnimations.current[id];
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
      </SafeAreaView>

      {/* Chat Area */}
      <KeyboardAvoidingView 
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Loading State - Shows animated indicator while initializing */}
        {isLoading && messages.length === 0 && (
          <View style={styles.loadingContainer}>
            <Image source={{ uri: TINA_AVATAR }} style={styles.loadingAvatar} />
            <View style={styles.loadingContent}>
              <Animated.View style={[styles.typingDotsContainer, { opacity: typingAnimation }]}>
                <View style={styles.typingDot} />
                <View style={[styles.typingDot, styles.typingDotMiddle]} />
                <View style={styles.typingDot} />
              </Animated.View>
              <Text style={styles.loadingText}>Tina is getting ready...</Text>
            </View>
          </View>
        )}
        
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={[
            styles.messageList,
            { paddingBottom: currentOptions || currentDeepLink ? 200 : 100 },
            messages.length === 0 && !isLoading && styles.emptyListContainer,
          ]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={!isLoading ? (
            <View style={styles.emptyContainer}>
              <Image source={{ uri: TINA_AVATAR }} style={styles.emptyAvatar} />
              <Text style={styles.emptyTitle}>Hi there! 👋</Text>
              <Text style={styles.emptyText}>I&apos;m Tina, your matchmaker.</Text>
              <Text style={styles.emptySubtext}>Getting things ready for you...</Text>
              <ActivityIndicator size="small" color="#FF6B6B" style={{ marginTop: 16 }} />
            </View>
          ) : null}
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
  
  // Loading and Empty states
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  loadingAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#FF6B6B',
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  emptyListContainer: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#FF6B6B',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
