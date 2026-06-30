import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  useAudioPlayer,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from 'expo-audio';
import TinaAvatar from './TinaAvatar';

const API_BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || '';

// VAD tunables – `metering` is in dBFS (-160 = silence, 0 = peak).
// Tuned for ZERO perceived gap — user explicitly asked for "immediately
// it should answer". We can't avoid the Whisper + GPT + TTS round-trip
// latency (~1-2s combined) but every other delay is now stripped out.
const SILENCE_THRESHOLD = -42; // dBFS – tighter than -45 to ignore room hum
const SILENCE_DURATION_MS = 500; // ~0.5s trailing silence to end a turn (was 700)
const MIN_SPEECH_DURATION_MS = 400; // require ~0.4s of speech (was 500)
const MAX_TURN_DURATION_MS = 20000; // hard cap per turn
const METERING_INTERVAL_MS = 60; // poll faster — 16 samples/sec (was 80)
const PRE_REPLY_PAUSE_MS = 0; // ZERO pause — start TTS the instant LLM response arrives

type CallStatus =
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'paused'
  | 'permission_denied'
  | 'error';

interface Props {
  visible: boolean;
  onEnd: () => void;
  userId: string;
  userName: string;
  isOnboardingComplete?: boolean;
}

export default function TinaCallScreen({
  visible,
  onEnd,
  userId,
  userName,
  isOnboardingComplete,
}: Props) {
  const insets = useSafeAreaInsets();

  // ---------- Audio hooks ----------
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const player = useAudioPlayer(null);

  // ---------- State ----------
  const [status, setStatus] = useState<CallStatus>('connecting');
  const [statusLabel, setStatusLabel] = useState('Connecting…');
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // NOTE: live transcript / Tina reply previews were intentionally removed
  // (user feedback: "I don't want live translation below"). The avatar
  // animation + status label are now the only visible feedback during a call.

  // ---------- Refs for VAD + loop control ----------
  const isActiveRef = useRef(true);
  const isProcessingRef = useRef(false);
  const turnStartRef = useRef<number>(0);
  const lastSpeechAtRef = useRef<number>(0);
  const everHeardSpeechRef = useRef<boolean>(false);
  const mutedRef = useRef(false);
  const meteringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const conversationRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const blobUrlsRef = useRef<string[]>([]);

  // ---------- Animations ----------
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const ringAnim1 = useRef(new Animated.Value(0)).current;
  const ringAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    // Pulse loop on avatar
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Ripple rings (offset)
    const ringLoop = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    ringLoop(ringAnim1, 0).start();
    ringLoop(ringAnim2, 900).start();
  }, [visible, pulseAnim, ringAnim1, ringAnim2]);

  // ---------- Helpers ----------
  const stopMeteringTimer = useCallback(() => {
    if (meteringTimerRef.current) {
      clearInterval(meteringTimerRef.current);
      meteringTimerRef.current = null;
    }
  }, []);

  const buildAudioFormData = useCallback(async (uri: string): Promise<FormData> => {
    const form = new FormData();
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const blob = await res.blob();
      const ext = blob.type?.includes('webm') ? 'webm' : 'm4a';
      form.append('audio', new File([blob], `tina_voice.${ext}`, {
        type: blob.type || 'audio/webm',
      }));
    } else {
      const filename = uri.split('/').pop() || 'tina_voice.m4a';
      const m = /\.(\w+)$/.exec(filename);
      const type = m ? `audio/${m[1] === 'm4a' ? 'mp4' : m[1]}` : 'audio/m4a';
      // @ts-ignore – React Native FormData file shape
      form.append('audio', { uri, name: filename, type });
    }
    return form;
  }, []);

  const playTtsAndAwait = useCallback(
    async (text: string) => {
      // Use the streaming TTS endpoint — the expo-audio / browser audio
      // player handles HTTP-streamed MP3 natively, so playback can start as
      // soon as the first few KB arrive (~300ms) instead of waiting for the
      // full base64 payload (~1.5s). Backend yields ElevenLabs MP3 chunks
      // directly via FastAPI StreamingResponse.
      const streamUrl =
        `${API_BASE}/api/tina/voice/speak-stream?text=` +
        encodeURIComponent(text);

      // @ts-ignore – replace is on AudioPlayer at runtime
      player.replace({ uri: streamUrl });
      try { player.seekTo(0); } catch { /* noop */ }
      player.play();

      // Wait for playback to finish
      await new Promise<void>((resolve) => {
        const start = Date.now();
        const poll = setInterval(() => {
          if (!isActiveRef.current) {
            clearInterval(poll);
            resolve();
            return;
          }
          try {
            // @ts-ignore
            const playing = player.playing;
            // @ts-ignore
            const cur = player.currentTime;
            // @ts-ignore
            const dur = player.duration;
            const finished =
              dur > 0 && cur >= dur - 0.15;
            // Streaming start: give the network a brief grace period (~600ms)
            // before treating !playing as "done" — otherwise the first poll
            // might fire before the buffer has data.
            if ((!playing && Date.now() - start > 800) || finished) {
              clearInterval(poll);
              resolve();
            }
          } catch (e) {
            clearInterval(poll);
            resolve();
          }
        }, 200);
      });
    },
    [player]
  );

  const sendChatTurn = useCallback(
    async (userText: string): Promise<string> => {
      const recentContext = conversationRef.current.slice(-6);
      const res = await fetch(`${API_BASE}/api/tina/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          user_name: userName,
          message: userText,
          is_onboarding_complete: isOnboardingComplete ?? true,
          conversation_context: recentContext,
          // Tell the backend to use the low-latency model (gpt-4o-mini) +
          // brevity instructions so TTS finishes faster. The text-chat
          // branch (TinaModal) sends voice_mode: false → full gpt-4o.
          voice_mode: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || 'Chat failed');
      }
      return (data.response || '').toString().trim();
    },
    [userId, userName, isOnboardingComplete]
  );

  // ---------- Recording lifecycle ----------
  const stopRecorderSafely = useCallback(async () => {
    stopMeteringTimer();
    try {
      // @ts-ignore – isRecording is true while recording
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch (e) {
      console.warn('[TinaCall] stop error:', e);
    }
  }, [recorder, stopMeteringTimer]);

  const startRecordingTurn = useCallback(async () => {
    if (!isActiveRef.current || isProcessingRef.current || mutedRef.current) return;
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      turnStartRef.current = Date.now();
      lastSpeechAtRef.current = 0;
      everHeardSpeechRef.current = false;
      setStatus('listening');
      setStatusLabel('Listening…');

      stopMeteringTimer();
      meteringTimerRef.current = setInterval(async () => {
        if (!isActiveRef.current) return;
        try {
          const st = await recorder.getStatus();
          const lvl = typeof st?.metering === 'number' ? st.metering : -160;
          const now = Date.now();

          if (lvl > SILENCE_THRESHOLD) {
            lastSpeechAtRef.current = now;
            everHeardSpeechRef.current = true;
          }

          const elapsed = now - turnStartRef.current;
          const silenceFor =
            lastSpeechAtRef.current > 0 ? now - lastSpeechAtRef.current : elapsed;

          // End-of-turn conditions
          const finishedBySilence =
            everHeardSpeechRef.current &&
            elapsed > MIN_SPEECH_DURATION_MS &&
            silenceFor > SILENCE_DURATION_MS;
          const finishedByCap = elapsed > MAX_TURN_DURATION_MS;

          if (finishedBySilence || finishedByCap) {
            isProcessingRef.current = true;
            stopMeteringTimer();
            await stopRecorderSafely();
            await processTurn();
          }
        } catch (e) {
          // continue
        }
      }, METERING_INTERVAL_MS);
    } catch (err: any) {
      console.error('[TinaCall] startRecording error:', err);
      setStatus('error');
      setErrorMsg(err?.message || "Couldn't start microphone.");
    }
  }, [recorder, stopRecorderSafely, stopMeteringTimer]);

  const processTurn = useCallback(async () => {
    if (!isActiveRef.current) {
      isProcessingRef.current = false;
      return;
    }
    setStatus('thinking');
    setStatusLabel('Tina is thinking…');

    const uri = recorder.uri;
    if (!uri) {
      isProcessingRef.current = false;
      // Just loop again
      if (isActiveRef.current && !mutedRef.current) startRecordingTurn();
      return;
    }

    try {
      // 1) Transcribe
      const form = await buildAudioFormData(uri);
      const sttRes = await fetch(`${API_BASE}/api/tina/voice/transcribe`, {
        method: 'POST',
        body: form,
      });
      const sttData = await sttRes.json();
      if (!sttRes.ok || !sttData.success) {
        throw new Error(sttData.detail || 'Transcription failed');
      }
      const userText = (sttData.text || '').toString().trim();

      if (!userText) {
        // Silence / no speech — loop again without saying anything
        isProcessingRef.current = false;
        if (isActiveRef.current && !mutedRef.current) startRecordingTurn();
        return;
      }

      conversationRef.current.push({ role: 'user', content: userText });

      // 2) Chat
      const reply = await sendChatTurn(userText);
      if (!reply) throw new Error('Empty reply from Tina');
      conversationRef.current.push({ role: 'assistant', content: reply });

      if (!isActiveRef.current) return;

      // 3) Deliberate human-like pause so the conversation doesn't feel
      // robotic — Tina "listens", "thinks" for a beat, then replies.
      await new Promise((r) => setTimeout(r, PRE_REPLY_PAUSE_MS));
      if (!isActiveRef.current) return;

      // 4) TTS playback
      setStatus('speaking');
      setStatusLabel('Tina is speaking…');
      await playTtsAndAwait(reply);

      // 5) Loop
      isProcessingRef.current = false;
      if (isActiveRef.current && !mutedRef.current) {
        await new Promise((r) => setTimeout(r, 250));
        startRecordingTurn();
      }
    } catch (err: any) {
      console.error('[TinaCall] processTurn error:', err);
      isProcessingRef.current = false;
      if (!isActiveRef.current) return;
      setStatus('error');
      setErrorMsg(err?.message || 'Something went wrong on the call.');
      // Try to keep the call alive after a short pause
      setTimeout(() => {
        if (isActiveRef.current && !mutedRef.current) {
          setErrorMsg(null);
          startRecordingTurn();
        }
      }, 2000);
    }
  }, [recorder, buildAudioFormData, sendChatTurn, playTtsAndAwait, startRecordingTurn]);

  // ---------- Init call when becoming visible ----------
  useEffect(() => {
    if (!visible) return;
    isActiveRef.current = true;
    mutedRef.current = false;
    conversationRef.current = [];
    setMuted(false);
    setStatus('connecting');
    setStatusLabel('Connecting…');
    setErrorMsg(null);

    (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setStatus('permission_denied');
          setStatusLabel(
            perm.canAskAgain === false
              ? 'Microphone blocked — tap to open Settings'
              : 'Microphone permission is required'
          );
          return;
        }
        try {
          // Force loudspeaker routing on both platforms so the call doesn't
          // play through the earpiece (which is the iOS default when
          // allowsRecording=true). Users asked for speaker mode by default.
          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
            shouldRouteThroughEarpiece: false,
          });
        } catch (e) {
          console.warn('[TinaCall] setAudioModeAsync failed', e);
        }

        // Greeting line so the call feels alive
        const greeting = `Hi ${userName?.split(' ')[0] || 'there'}! I'm Tina. What would you like to chat about?`;
        conversationRef.current.push({ role: 'assistant', content: greeting });
        setStatus('speaking');
        setStatusLabel('Tina is speaking…');
        try {
          await playTtsAndAwait(greeting);
        } catch (e) {
          console.warn('[TinaCall] greeting TTS failed', e);
        }

        if (isActiveRef.current && !mutedRef.current) {
          startRecordingTurn();
        }
      } catch (e: any) {
        console.error('[TinaCall] init error', e);
        setStatus('error');
        setErrorMsg(e?.message || 'Could not start the call.');
      }
    })();

    return () => {
      // Cleanup when visibility flips
      isActiveRef.current = false;
      stopMeteringTimer();
      (async () => {
        try {
          // @ts-ignore
          if (recorder.isRecording) await recorder.stop();
        } catch { /* noop */ }
        try { player.pause(); } catch { /* noop */ }
      })();
      blobUrlsRef.current.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch { /* noop */ }
      });
      blobUrlsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ---------- Handlers ----------
  const handleEndCall = useCallback(() => {
    isActiveRef.current = false;
    stopMeteringTimer();
    (async () => {
      try {
        // @ts-ignore
        if (recorder.isRecording) await recorder.stop();
      } catch { /* noop */ }
      try { player.pause(); } catch { /* noop */ }
    })();
    onEnd();
  }, [onEnd, recorder, player, stopMeteringTimer]);

  const handleToggleMute = useCallback(async () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    mutedRef.current = nextMuted;
    if (nextMuted) {
      // Stop current recording
      stopMeteringTimer();
      try {
        // @ts-ignore
        if (recorder.isRecording) await recorder.stop();
      } catch { /* noop */ }
      setStatus('paused');
      setStatusLabel('Muted');
    } else if (status === 'paused') {
      // Resume listening
      startRecordingTurn();
    }
  }, [muted, status, recorder, startRecordingTurn, stopMeteringTimer]);

  const handleRetryPerm = useCallback(async () => {
    if (status === 'permission_denied') {
      try { Linking.openSettings(); } catch { /* noop */ }
    }
  }, [status]);

  // ---------- Render ----------
  if (!visible) return null;

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const ring1Scale = ringAnim1.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const ring1Opacity = ringAnim1.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const ring2Scale = ringAnim2.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const ring2Opacity = ringAnim2.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  const showRipple = status === 'listening' || status === 'speaking';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      {/* Top label */}
      <View style={styles.topBar}>
        <Text style={styles.callLabel}>Voice call</Text>
        <Text style={styles.tinaName}>Tina</Text>
      </View>

      {/* Avatar with animated rings */}
      <View style={styles.avatarWrap}>
        {showRipple && (
          <>
            <Animated.View
              style={[
                styles.ring,
                { transform: [{ scale: ring1Scale }], opacity: ring1Opacity },
              ]}
            />
            <Animated.View
              style={[
                styles.ring,
                { transform: [{ scale: ring2Scale }], opacity: ring2Opacity },
              ]}
            />
          </>
        )}
        <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
          <TinaAvatar size={160} borderColor="rgba(255,107,107,0.4)" borderWidth={4} />
        </Animated.View>
      </View>

      {/* Status */}
      <View style={styles.statusWrap}>
        <Text style={styles.statusText}>{statusLabel}</Text>
        {!!errorMsg && (
          <Text style={styles.errorText} numberOfLines={2}>
            {errorMsg}
          </Text>
        )}
      </View>

      {/* Permission denied helper */}
      {status === 'permission_denied' && (
        <TouchableOpacity style={styles.settingsBtn} onPress={handleRetryPerm}>
          <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
          <Text style={styles.settingsBtnText}>Open Settings</Text>
        </TouchableOpacity>
      )}

      {/* Bottom action row */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, muted && styles.actionBtnActive]}
          onPress={handleToggleMute}
          activeOpacity={0.7}
        >
          <Ionicons
            name={muted ? 'mic-off' : 'mic'}
            size={26}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        <TouchableOpacity
          testID="tina-end-call-button"
          style={styles.endBtn}
          onPress={handleEndCall}
          activeOpacity={0.85}
        >
          <Ionicons name="call" size={28} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>

        <View style={styles.actionBtn}>
          <Ionicons
            name={status === 'speaking' ? 'volume-high' : 'volume-medium-outline'}
            size={26}
            color="#FFFFFF"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBar: {
    alignItems: 'center',
  },
  callLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  tinaName: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  avatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 240,
    height: 240,
  },
  ring: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  statusWrap: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  transcript: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  tinaLine: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    color: '#FFB4B4',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 22,
  },
  settingsBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  actionBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: '#FF6B6B',
  },
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
});
