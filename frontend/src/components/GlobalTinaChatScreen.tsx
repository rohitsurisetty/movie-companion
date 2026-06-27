import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  FlatList, Platform, Keyboard, 
  Dimensions, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import * as Linking from 'expo-linking';
import { useTina, UserProfileData, Message } from '../context/TinaContext';

const { width, height: SCREEN_HEIGHT } = Dimensions.get('window');
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
  sessionOpenCount?: number; // Triggers new greeting when incremented
}

export default function GlobalTinaChatScreen({
  userId,
  userName,
  existingMessages = [],
  onMessagesChange,
  onNavigationRequest,
  isOnboardingComplete = false,
  userProfile,
  sessionOpenCount = 0,
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // ===== VOICE STATE =====
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceModeActive, setVoiceModeActive] = useState(false); // last input was via voice -> autoplay reply
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [currentAudioSource, setCurrentAudioSource] = useState<string | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioBlobUrlsRef = useRef<string[]>([]);

  // expo-audio hooks – created at top level (required by hooks rules)
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 250);
  const audioPlayer = useAudioPlayer(null);
  
  const flatListRef = useRef<FlatList>(null);
  const typingAnimation = useRef(new Animated.Value(0)).current;
  const messageAnimations = useRef<{ [key: string]: Animated.Value }>({});
  const mountedRef = useRef(true);

  // ========== KEYBOARD HANDLING ==========
  
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        const kbHeight = e.endCoordinates.height;
        setKeyboardHeight(kbHeight);
        
        // When keyboard opens, scroll to position latest message in visible area
        // Wait for keyboard animation to complete
        setTimeout(() => {
          if (messages.length > 0 && flatListRef.current) {
            // Scroll to end first, then the extra padding will position the message
            flatListRef.current.scrollToEnd({ animated: true });
          }
        }, 250);
      }
    );
    
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    
    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [messages.length]);

  // Scroll to show the latest message centered in visible area
  const scrollToLatestMessage = useCallback(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Handle scroll failures
  const onScrollToIndexFailed = useCallback((info: { index: number }) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

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

  // ========== VOICE: RECORDING + PLAYBACK ==========

  // Format seconds to mm:ss
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Convert recorded file URI to FormData for upload
  const buildAudioFormData = useCallback(async (uri: string): Promise<FormData> => {
    const form = new FormData();
    if (Platform.OS === 'web') {
      // On web, recorder returns a blob: URL - fetch & wrap as File
      const res = await fetch(uri);
      const blob = await res.blob();
      const ext = blob.type?.includes('webm') ? 'webm' : blob.type?.includes('mp4') ? 'm4a' : 'webm';
      form.append('audio', new File([blob], `tina_voice.${ext}`, { type: blob.type || 'audio/webm' }));
    } else {
      // Native: file:// uri – pass directly with name + type
      const filename = uri.split('/').pop() || 'tina_voice.m4a';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `audio/${match[1] === 'm4a' ? 'mp4' : match[1]}` : 'audio/m4a';
      // @ts-ignore – React Native specific FormData file shape
      form.append('audio', { uri, name: filename, type });
    }
    return form;
  }, []);

  const handleStartRecording = useCallback(async () => {
    if (isRecording || isTranscribing) return;
    setVoiceError(null);

    try {
      // Ask for mic permission contextually
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        if (perm.canAskAgain === false) {
          setVoiceError("Microphone access is blocked. Tap to open Settings.");
        } else {
          setVoiceError("Microphone permission is required to chat by voice.");
        }
        return;
      }

      // Configure audio mode for recording (route audio properly on iOS)
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      } catch (e) {
        console.warn('[GlobalTina] setAudioModeAsync failed:', e);
      }

      // Prepare and start
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
      setRecordingDuration(0);

      // Tick a duration timer (fallback to recorderState too)
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err: any) {
      console.error('[GlobalTina] startRecording error:', err);
      setVoiceError(err?.message || "Couldn't start recording.");
      setIsRecording(false);
    }
  }, [audioRecorder, isRecording, isTranscribing]);

  const handleCancelRecording = useCallback(async () => {
    try {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      if (audioRecorder.isRecording) {
        await audioRecorder.stop();
      }
    } catch (e) {
      console.warn('[GlobalTina] cancelRecording error:', e);
    } finally {
      setIsRecording(false);
      setRecordingDuration(0);
    }
  }, [audioRecorder]);

  const handleStopAndSendRecording = useCallback(async () => {
    if (!isRecording) return;

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    try {
      await audioRecorder.stop();
    } catch (e) {
      console.warn('[GlobalTina] recorder.stop error:', e);
    }
    setIsRecording(false);

    const uri = audioRecorder.uri;
    if (!uri) {
      setVoiceError("Recording is too short. Hold for at least 1 second.");
      return;
    }

    // Sanity: enforce a minimum duration
    if (recordingDuration < 1) {
      setVoiceError("Hold the mic and speak a little longer.");
      setRecordingDuration(0);
      return;
    }

    setIsTranscribing(true);
    setVoiceModeActive(true);

    try {
      const form = await buildAudioFormData(uri);
      const res = await fetch(`${API_BASE}/api/tina/voice/transcribe`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.text) {
        throw new Error(data.detail || data.error || 'Transcription failed');
      }

      const transcript = (data.text as string).trim();
      if (!transcript) {
        setVoiceError("I didn't catch that — try again.");
        return;
      }

      addMessage(transcript, true);
      sendToTina(transcript);
    } catch (err: any) {
      console.error('[GlobalTina] transcribe error:', err);
      setVoiceError(err?.message || "Couldn't transcribe your voice.");
    } finally {
      setIsTranscribing(false);
      setRecordingDuration(0);
    }
  }, [audioRecorder, isRecording, recordingDuration, addMessage, sendToTina, buildAudioFormData]);

  // Play Tina's TTS audio for a given message
  const handlePlayTinaMessage = useCallback(async (messageId: string, text: string) => {
    if (!text) return;

    // Tapping the currently playing message -> stop
    if (playingMessageId === messageId) {
      try {
        audioPlayer.pause();
      } catch (e) { /* noop */ }
      setPlayingMessageId(null);
      return;
    }

    try {
      setPlayingMessageId(messageId);
      const res = await fetch(`${API_BASE}/api/tina/voice/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.audio) {
        throw new Error(data.detail || 'TTS failed');
      }

      let playable: string = data.audio;
      // On web, blob URLs play more reliably than data URIs for some browsers
      if (Platform.OS === 'web' && playable.startsWith('data:')) {
        try {
          const resp = await fetch(playable);
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          audioBlobUrlsRef.current.push(blobUrl);
          playable = blobUrl;
        } catch (e) {
          console.warn('[GlobalTina] blob conversion failed, falling back to data uri', e);
        }
      }
      setCurrentAudioSource(playable);
    } catch (err: any) {
      console.error('[GlobalTina] TTS playback error:', err);
      setPlayingMessageId(null);
      setVoiceError(err?.message || "Couldn't play voice reply.");
    }
  }, [audioPlayer, playingMessageId]);

  // When currentAudioSource changes, swap source and start playback
  useEffect(() => {
    if (!currentAudioSource) return;
    try {
      // @ts-ignore – replace exists at runtime on AudioPlayer
      audioPlayer.replace({ uri: currentAudioSource });
      audioPlayer.seekTo(0);
      audioPlayer.play();
    } catch (e) {
      console.warn('[GlobalTina] audioPlayer.play error:', e);
      setPlayingMessageId(null);
    }
  }, [currentAudioSource]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto clear playingMessageId when playback finishes
  useEffect(() => {
    // expo-audio AudioPlayer exposes addListener('playbackStatusUpdate')
    // but we'll poll via a lightweight effect
    if (!playingMessageId) return;
    const interval = setInterval(() => {
      try {
        // @ts-ignore – currentTime / duration / playing fields
        const playing = audioPlayer.playing;
        // @ts-ignore
        const didFinish = audioPlayer.currentTime > 0 && audioPlayer.duration > 0
          // @ts-ignore
          && audioPlayer.currentTime >= audioPlayer.duration - 0.1;
        if (!playing || didFinish) {
          setPlayingMessageId(null);
          clearInterval(interval);
        }
      } catch (e) {
        clearInterval(interval);
        setPlayingMessageId(null);
      }
    }, 350);
    return () => clearInterval(interval);
  }, [playingMessageId, audioPlayer]);

  // Auto-clear voice error after a short window
  useEffect(() => {
    if (!voiceError) return;
    const t = setTimeout(() => setVoiceError(null), 3500);
    return () => clearTimeout(t);
  }, [voiceError]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      audioBlobUrlsRef.current.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch { /* noop */ }
      });
      audioBlobUrlsRef.current = [];
    };
  }, []);

  // Auto-play Tina's latest reply when the user used voice mode
  const lastAutoplayedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voiceModeActive || messages.length === 0 || isTyping) return;
    const last = messages[messages.length - 1];
    if (last.isUser) return;
    if (lastAutoplayedIdRef.current === last.id) return;
    lastAutoplayedIdRef.current = last.id;
    // Disable voice mode auto-play after one auto-play to require explicit voice each time
    setVoiceModeActive(false);
    handlePlayTinaMessage(last.id, last.text);
  }, [messages, voiceModeActive, isTyping, handlePlayTinaMessage]);

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

  // CRITICAL: Fetch a NEW greeting EVERY TIME the modal opens (sessionOpenCount changes)
  // Tina ALWAYS sends the first message - she initiates conversation every time
  const lastSessionCount = useRef(0);
  
  useEffect(() => {
    // Only trigger when sessionOpenCount actually increases (modal opened fresh)
    if (sessionOpenCount > lastSessionCount.current && sessionOpenCount > 0) {
      console.log('[GlobalTina] New session detected! Fetching fresh greeting. Session:', sessionOpenCount);
      lastSessionCount.current = sessionOpenCount;
      
      // Reset greeting state and fetch new one
      setHasGreetedThisSession(false);
      
      // Small delay to ensure component is ready
      setTimeout(() => {
        if (mountedRef.current) {
          fetchTinaGreeting();
        }
      }, 100);
    }
  }, [sessionOpenCount, fetchTinaGreeting]);

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
    const isPlayingThis = playingMessageId === item.id;

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
          {!item.isUser && !!item.text && (
            <TouchableOpacity
              style={styles.speakerBtn}
              onPress={() => handlePlayTinaMessage(item.id, item.text)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={isPlayingThis ? 'pause-circle' : 'volume-high-outline'}
                size={16}
                color="#FF6B6B"
              />
              <Text style={styles.speakerLabel}>
                {isPlayingThis ? 'Playing…' : 'Play'}
              </Text>
            </TouchableOpacity>
          )}
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

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.messageList,
          { 
            // Large bottom padding so last message can be centered when keyboard is open
            // This creates space below the last message so it appears in the middle
            paddingBottom: 300,
          },
        ]}
        onContentSizeChange={() => scrollToLatestMessage()}
        onLayout={() => scrollToLatestMessage()}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScrollToIndexFailed={onScrollToIndexFailed}
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

      {/* Voice error toast */}
      {voiceError && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            if (voiceError && voiceError.toLowerCase().includes('settings')) {
              try { Linking.openSettings(); } catch { /* noop */ }
            }
            setVoiceError(null);
          }}
          style={styles.voiceErrorContainer}
        >
          <Ionicons name="warning-outline" size={16} color="#FFB4B4" />
          <Text style={styles.voiceErrorText} numberOfLines={2}>{voiceError}</Text>
        </TouchableOpacity>
      )}

      {/* Composer - positioned above keyboard */}
      <View style={[
        styles.composerContainer,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          marginBottom: keyboardHeight > 0 ? keyboardHeight - insets.bottom : 0,
        }
      ]}>
        {isRecording ? (
          // Recording UI — replaces the composer while user holds the mic
          <View style={styles.recordingBar}>
            <TouchableOpacity
              style={styles.recordingCancel}
              onPress={handleCancelRecording}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.recordingMiddle}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>{formatDuration(recordingDuration)}</Text>
              <Text style={styles.recordingHint}>Listening…</Text>
            </View>
            <TouchableOpacity
              style={styles.recordingStop}
              onPress={handleStopAndSendRecording}
              activeOpacity={0.7}
            >
              <Ionicons name="send" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={text => {
                setInputText(text);
                setShowSendButton(text.trim().length > 0);
              }}
              placeholder={isTranscribing ? 'Transcribing your voice…' : 'Type your message…'}
              placeholderTextColor="rgba(255,255,255,0.4)"
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              editable={!isTranscribing}
            />
            {showSendButton ? (
              <TouchableOpacity
                style={[styles.sendBtn, styles.sendBtnActive]}
                onPress={handleSend}
                activeOpacity={0.7}
              >
                <Ionicons name="send" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.sendBtn, styles.micBtn]}
                onPress={handleStartRecording}
                disabled={isTranscribing}
                activeOpacity={0.7}
              >
                {isTranscribing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="mic" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
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
  micBtn: {
    backgroundColor: '#FF6B6B',
  },
  speakerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  speakerLabel: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '600',
  },
  voiceErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,107,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.35)',
  },
  voiceErrorText: {
    flex: 1,
    color: '#FFE5E5',
    fontSize: 13,
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 56,
    gap: 10,
  },
  recordingCancel: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingMiddle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  recordingTime: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    minWidth: 48,
  },
  recordingHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  recordingStop: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
