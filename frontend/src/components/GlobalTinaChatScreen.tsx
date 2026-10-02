import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, Platform,
  Animated, Easing, ActivityIndicator,
} from 'react-native';
// KeyboardEvents from react-native-keyboard-controller fires reliably on
// Android APK builds with edgeToEdgeEnabled=true — the stock RN Keyboard
// API doesn't fire keyboardDidShow consistently when the activity is not
// resized, leaving the composer hidden behind the keyboard.
import { KeyboardEvents } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  useAudioPlayer,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import * as Linking from 'expo-linking';
import { useTina, UserProfileData, Message } from '../context/TinaContext';
import TinaAvatar from './TinaAvatar';
import { apiUrl } from '../store';

const RATE_LIMIT_MSG = 'Tina needs a moment — try again shortly.';
const CHAT_ERROR_MSG = 'Hmm, I got a bit distracted! Could you say that again? 😅';

// Option chips from show_options: canonical strings, or {key, emoji, label}
// objects (360° quiz). Objects must render their label — never the object.
type TinaOption = string | { key?: string; label?: string; emoji?: string };

type OptionsState = {
  field: string;
  options: TinaOption[];
  multiSelect: boolean;
  mode?: string;
  question_id?: string;
};

// Normalize a backend show_options payload (/tina/chat sends multi_select,
// /tina/welcome-back sends multiSelect).
const toOptionsState = (so: any): OptionsState | null => {
  if (!so || !Array.isArray(so.options) || so.options.length === 0) return null;
  return {
    field: so.field || '',
    options: so.options,
    multiSelect: !!(so.multi_select ?? so.multiSelect),
    mode: so.mode,
    question_id: so.question_id,
  };
};

// Value used for selection state + sent to the backend (canonical string).
const optionValue = (o: TinaOption): string =>
  typeof o === 'string' ? o : (o?.label ?? o?.key ?? '');

// Text shown on the chip / in the user's bubble.
const optionLabel = (o: TinaOption): string =>
  typeof o === 'string' ? o : `${o?.emoji ? `${o.emoji} ` : ''}${optionValue(o)}`;

// All profile fields that can be collected (must match TinaContext)
const ALL_PROFILE_FIELDS = [
  'name', 'gender', 'dateOfBirth', 'location',
  'relationshipIntent', 'partnerPreference', 'languagesSpoken',
  'movieFrequency', 'ottTheatre', 'filmLanguages', 'genres', 'topMovies',
  'height', 'drinking', 'smoking', 'zodiac', 'bio'
];

interface Props {
  userId: string;
  userName: string;
  existingMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
  // Unused: /tina/chat never returns deep links. Kept so callers still compile.
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
  isOnboardingComplete = false,
  userProfile,
  sessionOpenCount = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const { markFieldAsCollected, markFieldAsAsked, getMissingFields, state: tinaState } = useTina();

  // Initialize messages from existing
  const [messages, setMessages] = useState<Message[]>(() => {
    return existingMessages.length > 0 ? existingMessages : [];
  });
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentOptions, setCurrentOptions] = useState<OptionsState | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [showSendButton, setShowSendButton] = useState(false);
  const [hasGreetedThisSession, setHasGreetedThisSession] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // ===== VOICE STATE =====
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  // Id of the user's voice-transcript bubble: autoplay the first Tina reply
  // AFTER it (never an older message). Cleared once played or on error.
  const [voiceReplyAfterId, setVoiceReplyAfterId] = useState<string | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioBlobUrlsRef = useRef<string[]>([]);
  // Message whose audio is loaded in the player (replay without re-fetching TTS)
  const loadedAudioIdRef = useRef<string | null>(null);
  const playbackFinishedRef = useRef(false);
  const ttsRequestRef = useRef(0);

  // expo-audio hooks – created at top level (required by hooks rules)
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioPlayer = useAudioPlayer(null);

  const flatListRef = useRef<FlatList>(null);
  const typingAnimation = useRef(new Animated.Value(0)).current;
  const messageAnimations = useRef<{ [key: string]: Animated.Value }>({});
  const mountedRef = useRef(true);
  // Synchronous in-flight guard (state updates lag a tap): one request at a
  // time, so replies always apply in the order the user sent them.
  const busyRef = useRef(false);
  const isBusy = isTyping || isLoading;

  // ========== KEYBOARD HANDLING ==========
  // Use KeyboardEvents from react-native-keyboard-controller so the
  // composer reliably tracks the keyboard on Android APK builds with
  // edgeToEdgeEnabled=true (the stock RN Keyboard API misses events when
  // the activity isn't resized). On iOS the library forwards
  // keyboardWillShow/Hide too so animations stay smooth.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const keyboardShowSub = KeyboardEvents.addListener(showEvt, (e: any) => {
      const kbHeight = (e?.height ?? e?.endCoordinates?.height ?? 0) as number;
      setKeyboardHeight(kbHeight);

      // When keyboard opens, scroll to position latest message in visible area
      // (scrollToEnd on an empty list is a no-op, so no messages check needed)
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 250);
    });

    const keyboardHideSub = KeyboardEvents.addListener(hideEvt, () => {
      setKeyboardHeight(0);
    });

    return () => {
      keyboardShowSub.remove();
      keyboardHideSub.remove();
    };
  }, []); // subscribe once

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

  const sendToTina = useCallback(async (
    userMessage: string,
    selected360Option?: { question_id: string; option_key: string },
  ) => {
    if (!mountedRef.current) return;

    busyRef.current = true;
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

      const response = await fetch(apiUrl('/api/tina/chat'), {
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
          ...(selected360Option ? { selected_360_option: selected360Option } : {}),
        }),
      });

      if (!mountedRef.current) return;

      const data = await response.json().catch(() => null);
      if (!mountedRef.current) return;

      if (response.ok && data?.success && data.response) {
        addMessage(data.response, false);

        // Handle options
        const opts = toOptionsState(data.show_options);
        setCurrentOptions(opts);
        setSelectedOptions([]);
        if (opts?.field) {
          markFieldAsAsked(opts.field);
        }
        if (data.collected_field) {
          markFieldAsCollected(data.collected_field);
        }
      } else {
        console.warn('[GlobalTina] chat request failed, status:', response.status);
        setVoiceReplyAfterId(null); // never read an error bubble aloud
        addMessage(response.status === 429 ? RATE_LIMIT_MSG : CHAT_ERROR_MSG, false);
      }
    } catch (error: any) {
      console.warn('[GlobalTina] chat request error:', error?.message);
      if (mountedRef.current) {
        setVoiceReplyAfterId(null);
        addMessage(CHAT_ERROR_MSG, false);
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setIsTyping(false);
      }
    }
  }, [userId, userName, userProfile, isOnboardingComplete, tinaState.onboardingStage, messages, addMessage, markFieldAsAsked, markFieldAsCollected]);

  // Fetch a proactive greeting from Tina
  const fetchTinaGreeting = useCallback(async () => {
    if (!mountedRef.current || hasGreetedThisSession) return;
    
    // Block sends until the greeting is on screen so it can't land after
    // (or between) the user's first message and Tina's reply.
    busyRef.current = true;
    setIsLoading(true);

    const actuallyComplete = isOnboardingComplete || tinaState.onboardingStage === 'completed';
    // Fallback greeting if welcome-back fails
    let greeting = actuallyComplete
      ? `Hey ${userName || 'there'}! 💫 Good to see you! What's on your mind?`
      : `Hey ${userName || 'there'}! 👋 Let's continue setting up your profile!`;
    let greetingOptions: OptionsState | null = null;

    try {
      // Get collected fields from context to pass to backend
      const missing = getMissingFields();
      const collectedFieldsList = ALL_PROFILE_FIELDS.filter(f => !missing.includes(f));

      const welcomeResponse = await fetch(apiUrl('/api/tina/welcome-back'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          user_name: userName,
          is_onboarding_complete: actuallyComplete,
          collected_fields: collectedFieldsList,
        }),
      });

      const welcomeData = welcomeResponse.ok ? await welcomeResponse.json() : null;
      if (welcomeData?.success && welcomeData.message) {
        greeting = welcomeData.message;
        greetingOptions = toOptionsState(welcomeData.show_options);
      } else {
        console.warn('[GlobalTina] welcome-back failed, status:', welcomeResponse.status);
      }
    } catch (error: any) {
      console.warn('[GlobalTina] welcome-back error:', error?.message);
    }

    // Small delay for natural feel
    await new Promise(resolve => setTimeout(resolve, 300));
    busyRef.current = false;
    if (!mountedRef.current) return;
    addMessage(greeting, false);
    setHasGreetedThisSession(true);
    if (greetingOptions) {
      setCurrentOptions(greetingOptions);
      setSelectedOptions([]);
    }
    setIsLoading(false);
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
    if (isRecording || isTranscribing || busyRef.current) return;
    setVoiceError(null);

    let prepared = false;
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
      prepared = true;
      audioRecorder.record();
      setIsRecording(true);
      setRecordingDuration(0);

      // Tick a duration timer
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('[GlobalTina] startRecording error:', err?.message);
      // A prepared-but-not-started recorder must be released, otherwise every
      // later prepareToRecordAsync() throws (already prepared).
      if (prepared) {
        try { await audioRecorder.stop(); } catch { /* noop */ }
      }
      setVoiceError("Couldn't start recording. Please try again.");
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

    try {
      const form = await buildAudioFormData(uri);
      const res = await fetch(apiUrl('/api/tina/voice/transcribe'), {
        method: 'POST',
        body: form,
      });
      if (res.status === 429) throw new Error(RATE_LIMIT_MSG);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error("Couldn't transcribe your voice.");
      }

      const transcript = String(data.text || '').trim();
      if (!transcript) {
        setVoiceError("I didn't catch that — try again.");
        return;
      }
      if (busyRef.current) {
        // A request started meanwhile — don't send concurrently; let the user send it.
        setInputText(transcript);
        setShowSendButton(true);
        return;
      }

      const userMsg = addMessage(transcript, true);
      // Voice mode starts only now: autoplay the reply that comes AFTER this bubble.
      setVoiceReplyAfterId(userMsg.id);
      sendToTina(transcript);
    } catch (err: any) {
      console.warn('[GlobalTina] transcribe error:', err?.message);
      setVoiceError(err?.message || "Couldn't transcribe your voice.");
    } finally {
      setIsTranscribing(false);
      setRecordingDuration(0);
    }
  }, [audioRecorder, isRecording, recordingDuration, addMessage, sendToTina, buildAudioFormData]);

  // Play Tina's TTS audio for a given message.
  // Tap while playing -> pause. Tap again -> resume (or restart if it had
  // finished) from the already-loaded audio, without re-fetching TTS.
  const handlePlayTinaMessage = useCallback(async (messageId: string, text: string) => {
    if (!text) return;

    // Tapping the currently playing message -> pause
    if (playingMessageId === messageId) {
      try {
        audioPlayer.pause();
      } catch { /* noop */ }
      setPlayingMessageId(null);
      return;
    }

    // TTS for this message is already being fetched -> ignore the extra tap
    if (ttsLoadingId === messageId) return;

    // Another message is playing -> stop it first
    if (playingMessageId) {
      try { audioPlayer.pause(); } catch { /* noop */ }
      setPlayingMessageId(null);
    }

    // This message's audio is already loaded (paused or finished) -> replay it
    if (loadedAudioIdRef.current === messageId) {
      ttsRequestRef.current += 1; // supersede any in-flight fetch for another message
      setTtsLoadingId(null);
      try {
        if (playbackFinishedRef.current) {
          await audioPlayer.seekTo(0);
        }
        playbackFinishedRef.current = false;
        audioPlayer.play();
        setPlayingMessageId(messageId);
      } catch (e: any) {
        console.warn('[GlobalTina] audioPlayer.play error:', e?.message);
        setPlayingMessageId(null);
      }
      return;
    }

    const requestId = ++ttsRequestRef.current;
    setTtsLoadingId(messageId);
    try {
      const res = await fetch(apiUrl('/api/tina/voice/speak'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.status === 429) throw new Error(RATE_LIMIT_MSG);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data.audio) {
        throw new Error("Couldn't play voice reply.");
      }
      // A newer tap (or unmount) superseded this request
      if (requestId !== ttsRequestRef.current || !mountedRef.current) return;

      let playable: string = data.audio;
      // On web, blob URLs play more reliably than data URIs for some browsers
      if (Platform.OS === 'web' && playable.startsWith('data:')) {
        try {
          const resp = await fetch(playable);
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          audioBlobUrlsRef.current.push(blobUrl);
          playable = blobUrl;
        } catch {
          console.warn('[GlobalTina] blob conversion failed, falling back to data uri');
        }
      }
      if (requestId !== ttsRequestRef.current || !mountedRef.current) return;

      audioPlayer.replace({ uri: playable });
      loadedAudioIdRef.current = messageId;
      playbackFinishedRef.current = false;
      audioPlayer.play();
      // Only now is it actually playing
      setPlayingMessageId(messageId);
    } catch (err: any) {
      console.warn('[GlobalTina] TTS playback error:', err?.message);
      if (requestId === ttsRequestRef.current && mountedRef.current) {
        setPlayingMessageId(null);
        setVoiceError(err?.message || "Couldn't play voice reply.");
      }
    } finally {
      if (requestId === ttsRequestRef.current && mountedRef.current) {
        setTtsLoadingId(null);
      }
    }
  }, [audioPlayer, playingMessageId, ttsLoadingId]);

  // Clear playingMessageId when playback finishes (event-driven, no polling)
  useEffect(() => {
    const sub = audioPlayer.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        playbackFinishedRef.current = true;
        setPlayingMessageId(null);
      }
    });
    return () => sub.remove();
  }, [audioPlayer]);

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

  // Auto-play Tina's reply to a voice message: only a Tina message NEWER than
  // the user's transcript bubble (never the previous reply). One-shot — the
  // next voice message re-arms it.
  useEffect(() => {
    if (!voiceReplyAfterId || isTyping) return;
    const idx = messages.findIndex(m => m.id === voiceReplyAfterId);
    if (idx === -1) return;
    const reply = messages.slice(idx + 1).find(m => !m.isUser && !!m.text);
    if (!reply) return;
    setVoiceReplyAfterId(null);
    handlePlayTinaMessage(reply.id, reply.text);
  }, [messages, voiceReplyAfterId, isTyping, handlePlayTinaMessage]);

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
    if (!text || busyRef.current) return;

    addMessage(text, true);
    setInputText('');
    setShowSendButton(false);
    sendToTina(text);
  }, [inputText, addMessage, sendToTina]);

  const handleOptionSelect = useCallback((option: TinaOption) => {
    if (!currentOptions || busyRef.current || isRecording || isTranscribing) return;
    const value = optionValue(option);
    if (!value) return;

    if (currentOptions.multiSelect) {
      setSelectedOptions(prev =>
        prev.includes(value)
          ? prev.filter(o => o !== value)
          : [...prev, value]
      );
    } else {
      const label = optionLabel(option);
      // 360° quiz chips are objects with a key; the backend needs the key + question id
      const selected360 = typeof option !== 'string' && option.key && currentOptions.question_id
        ? { question_id: currentOptions.question_id, option_key: option.key }
        : undefined;
      addMessage(label, true);
      setCurrentOptions(null);
      sendToTina(label, selected360);
    }
  }, [currentOptions, isRecording, isTranscribing, addMessage, sendToTina]);

  const handleConfirmSelection = useCallback(() => {
    if (selectedOptions.length === 0 || busyRef.current) return;

    const selectionText = selectedOptions.join(', ');
    addMessage(selectionText, true);
    setSelectedOptions([]);
    setCurrentOptions(null);
    sendToTina(selectionText);
  }, [selectedOptions, addMessage, sendToTina]);

  // ========== RENDER ==========

  const renderMessage = ({ item }: { item: Message }) => {
    const anim = getMessageAnimation(item.id);
    const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
    const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
    const isPlayingThis = playingMessageId === item.id;
    const isLoadingAudio = ttsLoadingId === item.id;

    return (
      <Animated.View
        style={[
          styles.messageRow,
          item.isUser ? styles.userMessageRow : styles.tinaMessageRow,
          { opacity, transform: [{ scale }, { translateY }] },
        ]}
      >
        {!item.isUser && (
          <TinaAvatar size={32} style={styles.avatar} />
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
                {isPlayingThis ? 'Playing…' : isLoadingAudio ? 'Loading…' : 'Play'}
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
          <TinaAvatar size={64} style={styles.loadingAvatar} />
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
            <TinaAvatar size={32} style={styles.avatar} />
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
            {currentOptions.options.map((option, idx) => {
              const isSelected = selectedOptions.includes(optionValue(option));
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.optionChip,
                    isSelected && styles.optionChipSelected,
                  ]}
                  onPress={() => handleOptionSelect(option)}
                  disabled={isBusy}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.optionTextSelected,
                    ]}
                  >
                    {optionLabel(option)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {currentOptions.multiSelect && selectedOptions.length > 0 && (
            <TouchableOpacity
              style={[styles.confirmButton, isBusy && styles.btnDisabled]}
              onPress={handleConfirmSelection}
              disabled={isBusy}
            >
              <Text style={styles.confirmButtonText}>Confirm ({selectedOptions.length})</Text>
            </TouchableOpacity>
          )}
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
              // Multiline on Android: Enter inserts a newline, so the send
              // icon is the primary path; onSubmitEditing is a bonus.
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={handleSend}
              editable={!isTranscribing}
            />
            {showSendButton ? (
              <TouchableOpacity
                style={[styles.sendBtn, styles.sendBtnActive, isBusy && styles.btnDisabled]}
                onPress={handleSend}
                disabled={isBusy}
                activeOpacity={0.7}
              >
                <Ionicons name="send" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.sendBtn, styles.micBtn, isBusy && !isTranscribing && styles.btnDisabled]}
                onPress={handleStartRecording}
                disabled={isTranscribing || isBusy}
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
  btnDisabled: {
    opacity: 0.45,
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
