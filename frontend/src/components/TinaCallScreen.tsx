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
import { apiUrl, getSessionToken } from '../store';

// VAD tunables – `metering` is in dBFS (-160 = silence, 0 = peak).
// Tuned for ZERO perceived gap — user explicitly asked for "immediately
// it should answer". We can't avoid the Whisper + GPT + TTS round-trip
// latency (~1-2s combined) but every other delay is now stripped out.
const SILENCE_THRESHOLD = -42; // dBFS – tighter than -45 to ignore room hum
const SILENCE_DURATION_MS = 500; // ~0.5s trailing silence to end a turn (was 700)
const MIN_SPEECH_DURATION_MS = 400; // require ~0.4s of speech (was 500)
const MAX_TURN_DURATION_MS = 20000; // hard cap per turn
const MAX_SILENT_TURNS = 3; // hang up after 3 back-to-back turns with no speech (~60s)
const METERING_INTERVAL_MS = 60; // poll faster — 16 samples/sec (was 80)
const PRE_REPLY_PAUSE_MS = 0; // ZERO pause — start TTS the instant LLM response arrives

// TTS end is signalled by playbackStatusUpdate.didJustFinish; these only
// guard against a stream that never starts or stalls.
const TTS_START_TIMEOUT_MS = 10000; // no audio after 10s → skip this line
const TTS_SAFETY_BASE_MS = 15000; // overall cap = base + per-char allowance
const TTS_SAFETY_PER_CHAR_MS = 120; // ~3x normal speaking time
const TTS_SAFETY_MAX_MS = 90000;
const END_MESSAGE_MS = 3500; // how long a "call ended" reason stays visible

const RATE_LIMITED_MSG = 'Tina is a little busy — try again shortly.';
const SESSION_EXPIRED_MSG = 'Your session expired — please sign in again.';

type CallStatus =
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'paused'
  | 'permission_denied'
  | 'ended'
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
  const listeningRef = useRef(false); // a recording turn is open (guards double starts)
  const silentTurnsRef = useRef(0); // consecutive turns that hit the cap with no speech
  const meteringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTtsRef = useRef<(() => void) | null>(null); // resolves a pending playTtsAndAwait
  const processTurnRef = useRef<() => Promise<void>>(async () => {});
  const conversationRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

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
      form.append('audio', { uri, name: filename, type } as any); // RN FormData file shape
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
      //
      // Auth: expo-audio forwards `headers` on remote sources, so the
      // session token goes in the Authorization header — never in the URL.
      stopTtsRef.current?.(); // settle any previous line first
      const token = await getSessionToken();
      if (!isActiveRef.current) return;
      const uri = apiUrl(`/api/tina/voice/speak-stream?text=${encodeURIComponent(text)}`);

      // Resolves when Tina finished (didJustFinish), the stream failed, or a
      // safety timeout fired — and in every case PAUSES the player first, so
      // the mic can never pick Tina up. (Android reports playing=false while
      // buffering, which the old polling heuristic mistook for "done".)
      await new Promise<void>((resolve) => {
        let settled = false;
        let loaded = false; // this clip is buffering/playing (filters stale updates)
        let started = false; // audio actually played
        let startTimer: ReturnType<typeof setTimeout> | undefined;
        let safetyTimer: ReturnType<typeof setTimeout> | undefined;
        let sub: { remove: () => void } | undefined;

        const finish = () => {
          if (settled) return;
          settled = true;
          if (startTimer) clearTimeout(startTimer);
          if (safetyTimer) clearTimeout(safetyTimer);
          try { sub?.remove(); } catch { /* player already released */ }
          if (stopTtsRef.current === finish) stopTtsRef.current = null;
          try { player.pause(); } catch { /* player already released */ }
          resolve();
        };
        stopTtsRef.current = finish;

        sub = player.addListener('playbackStatusUpdate', (s) => {
          if (s.playing) started = true;
          if (s.playing || s.isBuffering) loaded = true;
          if (!loaded) return;
          // Finished — or the load failed (ExoPlayer drops back to 'idle').
          if (s.didJustFinish || (!s.playing && !s.isBuffering && s.playbackState === 'idle')) {
            finish();
          }
        });
        startTimer = setTimeout(() => {
          if (!started) finish();
        }, TTS_START_TIMEOUT_MS);
        safetyTimer = setTimeout(
          finish,
          Math.min(TTS_SAFETY_MAX_MS, TTS_SAFETY_BASE_MS + text.length * TTS_SAFETY_PER_CHAR_MS)
        );

        (async () => {
          try {
            player.replace({
              uri,
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            await player.seekTo(0);
            if (!settled) player.play();
          } catch (e) {
            console.warn('[TinaCall] TTS playback failed', e);
            finish();
          }
        })();
      });
    },
    [player]
  );

  const sendChatTurn = useCallback(
    async (userText: string): Promise<string> => {
      const recentContext = conversationRef.current.slice(-6);
      const res = await fetch(apiUrl('/api/tina/chat'), {
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
      if (res.status === 429) throw new Error(RATE_LIMITED_MSG);
      if (res.status === 401) throw new Error(SESSION_EXPIRED_MSG);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error("Tina couldn't reply just now.");
      }
      return (data.response || '').toString().trim();
    },
    [userId, userName, isOnboardingComplete]
  );

  // ---------- Recording lifecycle ----------
  const stopRecorderSafely = useCallback(async () => {
    stopMeteringTimer();
    listeningRef.current = false;
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch (e) {
      console.warn('[TinaCall] stop error:', e);
    }
  }, [recorder, stopMeteringTimer]);

  // Stop the mic + Tina's voice and mark the call inactive (idempotent).
  const shutdownCall = useCallback(() => {
    isActiveRef.current = false;
    stopTtsRef.current?.(); // resolves a pending playTtsAndAwait (pauses the player)
    stopRecorderSafely();
    try { player.pause(); } catch { /* player already released */ }
  }, [player, stopRecorderSafely]);

  // Show why the call ended for a moment, then close the call screen.
  const endCallWithMessage = useCallback(
    (message: string, finalStatus: CallStatus = 'ended') => {
      shutdownCall();
      setStatus(finalStatus);
      setStatusLabel(message);
      setErrorMsg(null);
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      endTimerRef.current = setTimeout(() => {
        endTimerRef.current = null;
        onEnd();
      }, END_MESSAGE_MS);
    },
    [shutdownCall, onEnd]
  );

  const startRecordingTurn = useCallback(async () => {
    if (
      !isActiveRef.current ||
      isProcessingRef.current ||
      mutedRef.current ||
      listeningRef.current
    ) return;
    listeningRef.current = true;
    // Never open the mic while Tina could still be coming out of the speaker.
    try {
      if (player.playing || player.isBuffering) player.pause();
    } catch { /* player already released */ }
    try {
      await recorder.prepareToRecordAsync();
      if (!isActiveRef.current || mutedRef.current) {
        // Call ended / muted while the mic was being prepared.
        listeningRef.current = false;
        try { await recorder.stop(); } catch { /* prepared only — stop() just resets */ }
        return;
      }
      recorder.record();
      turnStartRef.current = Date.now();
      lastSpeechAtRef.current = 0;
      everHeardSpeechRef.current = false;
      setStatus('listening');
      setStatusLabel('Listening…');

      stopMeteringTimer();
      let turnOver = false;
      meteringTimerRef.current = setInterval(async () => {
        if (turnOver || !isActiveRef.current) return;
        try {
          const st = recorder.getStatus();
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

          if (finishedByCap && !everHeardSpeechRef.current) {
            // A whole turn of silence: don't upload/transcribe it, just listen
            // again — and hang up after a few silent turns in a row.
            turnOver = true;
            await stopRecorderSafely();
            silentTurnsRef.current += 1;
            if (silentTurnsRef.current >= MAX_SILENT_TURNS) {
              endCallWithMessage('Call ended — no audio detected');
            } else {
              startRecordingTurn();
            }
            return;
          }

          if (finishedBySilence || finishedByCap) {
            turnOver = true;
            isProcessingRef.current = true;
            await stopRecorderSafely();
            await processTurnRef.current();
          }
        } catch (e) {
          // continue
        }
      }, METERING_INTERVAL_MS);
    } catch (err: any) {
      listeningRef.current = false;
      console.warn('[TinaCall] startRecording error:', err?.message);
      if (isActiveRef.current) endCallWithMessage("Couldn't start the microphone.");
    }
  }, [player, recorder, stopRecorderSafely, stopMeteringTimer, endCallWithMessage]);

  // After Tina's turn: reopen the mic, or park the call if the user muted.
  const resumeListening = useCallback(() => {
    if (!isActiveRef.current) return;
    if (mutedRef.current) {
      setStatus('paused');
      setStatusLabel('Muted');
    } else {
      startRecordingTurn();
    }
  }, [startRecordingTurn]);

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
      resumeListening();
      return;
    }

    try {
      // 1) Transcribe
      const form = await buildAudioFormData(uri);
      const sttRes = await fetch(apiUrl('/api/tina/voice/transcribe'), {
        method: 'POST',
        body: form,
      });
      if (sttRes.status === 429) throw new Error(RATE_LIMITED_MSG);
      if (sttRes.status === 401) throw new Error(SESSION_EXPIRED_MSG);
      const sttData = await sttRes.json().catch(() => null);
      if (!sttRes.ok || !sttData?.success) {
        throw new Error("Couldn't catch that — please say it again.");
      }
      const userText = (sttData.text || '').toString().trim();

      if (!userText) {
        // Noise but no words — loop again without saying anything
        isProcessingRef.current = false;
        resumeListening();
        return;
      }

      silentTurnsRef.current = 0;
      conversationRef.current.push({ role: 'user', content: userText });

      // 2) Chat
      const reply = await sendChatTurn(userText);
      if (!reply) throw new Error("Tina couldn't reply just now.");
      conversationRef.current.push({ role: 'assistant', content: reply });

      if (!isActiveRef.current) return;

      // 3) Deliberate human-like pause so the conversation doesn't feel
      // robotic — Tina "listens", "thinks" for a beat, then replies.
      await new Promise((r) => setTimeout(r, PRE_REPLY_PAUSE_MS));
      if (!isActiveRef.current) return;

      // Muted while Tina was thinking → the user paused the call: don't
      // start talking, park in 'Muted' (unmute reopens the mic).
      if (mutedRef.current) {
        isProcessingRef.current = false;
        resumeListening();
        return;
      }

      // 4) TTS playback
      setStatus('speaking');
      setStatusLabel('Tina is speaking…');
      await playTtsAndAwait(reply);

      // 5) Loop — or park in 'Muted' if the user muted while she spoke
      isProcessingRef.current = false;
      if (!isActiveRef.current) return;
      if (!mutedRef.current) await new Promise((r) => setTimeout(r, 250));
      resumeListening();
    } catch (err: any) {
      console.warn('[TinaCall] turn failed:', err?.message);
      isProcessingRef.current = false;
      if (!isActiveRef.current) return;
      if (err?.message === SESSION_EXPIRED_MSG) {
        endCallWithMessage(SESSION_EXPIRED_MSG);
        return;
      }
      setStatus('error');
      setErrorMsg(err?.message || 'Something went wrong on the call.');
      // Try to keep the call alive after a short pause
      setTimeout(() => {
        if (!isActiveRef.current) return;
        setErrorMsg(null);
        resumeListening();
      }, err?.message === RATE_LIMITED_MSG ? 5000 : 2000);
    }
  }, [recorder, buildAudioFormData, sendChatTurn, playTtsAndAwait, resumeListening, endCallWithMessage]);
  processTurnRef.current = processTurn;

  // ---------- Init call when becoming visible ----------
  useEffect(() => {
    if (!visible) return;
    isActiveRef.current = true;
    // Connecting + greeting count as "processing": the mic stays closed (even
    // on unmute) until Tina has finished her hello.
    isProcessingRef.current = true;
    listeningRef.current = false;
    mutedRef.current = false;
    silentTurnsRef.current = 0;
    conversationRef.current = [];
    setMuted(false);
    setStatus('connecting');
    setStatusLabel('Connecting…');
    setErrorMsg(null);

    (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!isActiveRef.current) return;
        if (!perm.granted) {
          endCallWithMessage(
            perm.canAskAgain === false
              ? 'Microphone is blocked — allow it in Settings to call Tina.'
              : 'Microphone permission is needed to call Tina.',
            'permission_denied'
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
        if (!isActiveRef.current) return;

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

        isProcessingRef.current = false;
        resumeListening();
      } catch (e: any) {
        console.warn('[TinaCall] init error', e?.message);
        isProcessingRef.current = false;
        if (isActiveRef.current) endCallWithMessage('Could not start the call.');
      }
    })();

    return () => {
      // Cleanup on unmount / visibility flip
      shutdownCall();
      if (endTimerRef.current) {
        clearTimeout(endTimerRef.current);
        endTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ---------- Handlers ----------
  const handleEndCall = useCallback(() => {
    shutdownCall();
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    onEnd();
  }, [onEnd, shutdownCall]);

  const handleToggleMute = useCallback(async () => {
    if (!isActiveRef.current) return;
    const nextMuted = !mutedRef.current;
    setMuted(nextMuted);
    mutedRef.current = nextMuted;
    if (nextMuted) {
      // Mid-listen: drop the current turn and park the call. While Tina is
      // thinking/speaking the turn finishes first, then parks in 'Muted'.
      if (!isProcessingRef.current) {
        setStatus('paused');
        setStatusLabel('Muted');
        await stopRecorderSafely();
      }
    } else {
      silentTurnsRef.current = 0;
      // If a turn is in flight it reopens the mic itself when it finishes.
      if (!isProcessingRef.current) {
        setErrorMsg(null);
        startRecordingTurn();
      }
    }
  }, [stopRecorderSafely, startRecordingTurn]);

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
    // Rendered below TinaModal's header, so only the bottom inset applies.
    <View style={[styles.container, { paddingTop: 24, paddingBottom: insets.bottom + 24 }]}>
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
          disabled={status === 'ended' || status === 'permission_denied'}
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
    textAlign: 'center',
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
