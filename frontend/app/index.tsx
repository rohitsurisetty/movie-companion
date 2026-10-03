import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, BackHandler, Image, AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
// RN's own KeyboardAvoidingView breaks on APK builds with edgeToEdgeEnabled
// (see the KeyboardProvider comment in app/_layout.tsx) — use the
// keyboard-controller one, which reads native WindowInsets.
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';
import { useTina } from '../src/context/TinaContext';
import {
  API_BASE, apiUrl, getAuth, saveAuth, clearAll,
  isOnboardingComplete, setOnboardingComplete,
  getProfile, saveProfile, getUserId,
} from '../src/store';
import { TERMS_VERSION, TERMS_ACCEPTED_KEY, LEGAL_URLS, openLegal } from '../src/legal';

type AuthMode = 'main' | 'phone' | 'phone-otp';

const RESEND_COOLDOWN_SECONDS = 30;
const OTP_LENGTH = 6;
const BOOT_CHECK_TIMEOUT_MS = 8000;

/**
 * Normalise what the user typed into E.164 for the backend.
 *  - strips spaces/dashes/brackets
 *  - "+<anything>" is kept as-is (already international)
 *  - a leading trunk "0" is dropped (09876543210 → 9876543210)
 *  - "91XXXXXXXXXX" (12 digits) gets the "+" back
 *  - 10 digits → "+91" prefix (launch market is India; the UI shows +91)
 * Returns null when the input can't be a valid number.
 */
const toE164 = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (hasPlus) {
    // E.164 allows 8–15 digits including country code.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return null;
};

// @react-native-google-signin/google-signin is a native module: it is NOT
// present in Expo Go, and its JS entry throws at require-time when the native
// side is missing. Lazy-require inside try/catch so the login screen still
// renders there and we can show a friendly message instead of crashing.
let googleConfigured = false;
const loadGoogleSignin = (): any | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-google-signin/google-signin');
    if (!mod?.GoogleSignin) return null;
    if (!googleConfigured) {
      mod.GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      });
      googleConfigured = true;
    }
    return mod;
  } catch {
    return null;
  }
};

export default function AuthScreen() {
  const router = useRouter();
  const { resetTinaState, setOnboardingStage } = useTina();
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('main');

  // Form states
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  // Google Play policy: the user must confirm they're 18+ and accept the
  // Terms / Community Guidelines / Privacy Policy before any sign-in request.
  // Pre-ticked when this device already accepted the current TERMS_VERSION.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsHint, setShowTermsHint] = useState(false);

  const hasResetTina = useRef(false);
  // Set once we've handed off to another route so the `finally` blocks below
  // don't flash the login buttons for a frame before navigation lands.
  const navigatingRef = useRef(false);
  // E.164 number the last OTP went to (drives the resend cooldown).
  const lastSentToRef = useRef<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(TERMS_ACCEPTED_KEY)
      .then((v) => { if (v === TERMS_VERSION) setTermsAccepted(true); })
      .catch(() => undefined);
    checkExistingAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset Tina state when showing login screen (user logged out or new user)
  useEffect(() => {
    if (!loading && !hasResetTina.current) {
      hasResetTina.current = true;
      // Reset Tina state so floating button doesn't show on login page
      setOnboardingStage('pre_decision');
      resetTinaState();
    }
  }, [loading, setOnboardingStage, resetTinaState]);

  // Resend-OTP cooldown ticker
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Hardware back on the phone / OTP sub-screens returns to the main login
  // choices instead of backgrounding the app (index is the root route).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (authMode === 'phone-otp') {
        setOtp('');
        setAuthMode('phone');
        return true;
      }
      if (authMode === 'phone') {
        resetForm();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [authMode]);

  // Returning user on a fresh install / new phone: pull their profile from
  // the server so screens that read the local copy (feed, profile, Tina)
  // aren't empty — and so a later edit can't POST a blank profile over the
  // real one. Best effort: never blocks login.
  const hydrateProfileFromServer = useCallback(async () => {
    try {
      const local = await getProfile();
      if (local?.name) return;
      const uid = await getUserId();
      if (!uid || !API_BASE) return;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), BOOT_CHECK_TIMEOUT_MS);
      const res = await fetch(apiUrl(`/api/user/profile/${encodeURIComponent(uid)}`), {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.profile && typeof data.profile === 'object') {
        await saveProfile({ ...(local || {}), ...data.profile });
      }
    } catch {
      /* offline / timeout — the profile screen re-fetches on focus */
    }
  }, []);

  const goAfterLogin = useCallback(async (serverSaysOnboarded?: boolean) => {
    navigatingRef.current = true;
    if (serverSaysOnboarded === true) {
      // Returning user on a fresh install: trust the server flag so they
      // aren't pushed through onboarding again.
      await setOnboardingComplete().catch(() => undefined);
      await hydrateProfileFromServer();
      router.replace('/(tabs)/feed');
      return;
    }
    const onboardingDone = await isOnboardingComplete();
    if (onboardingDone) await hydrateProfileFromServer();
    router.replace(onboardingDone ? '/(tabs)/feed' : '/onboarding');
  }, [router, hydrateProfileFromServer]);

  /**
   * Boot: if we have a stored session, validate it with GET /api/auth/me.
   *  200 → proceed (onboarding-complete check → tabs)
   *  401 → session is dead: wipe local auth, show login
   *  network error / timeout → fall back to the cached decision so offline
   *  users aren't stranded on a spinner.
   */
  const checkExistingAuth = async () => {
    try {
      const auth = await getAuth();
      if (!auth) {
        setLoading(false);
        return;
      }
      if (!API_BASE) {
        await goAfterLogin();
        return;
      }
      let resp: Response | null = null;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), BOOT_CHECK_TIMEOUT_MS);
        resp = await fetch(apiUrl('/api/auth/me'), { signal: controller.signal });
        clearTimeout(timer);
      } catch {
        resp = null; // offline / timeout → cached decision below
      }
      if (resp && resp.status === 401) {
        await clearAll();
        setLoading(false);
        return;
      }
      let serverOnboarded: boolean | undefined;
      if (resp && resp.ok) {
        const me = await resp.json().catch(() => null);
        if (me && typeof me.onboarding_complete === 'boolean') {
          serverOnboarded = me.onboarding_complete;
        }
      }
      await goAfterLogin(serverOnboarded === true ? true : undefined);
    } catch (e) {
      console.warn('[auth] boot check failed:', e);
      setLoading(false);
    }
  };

  // Persist via saveAuth() so the session_token lands in SecureStore (not
  // plaintext AsyncStorage) and so the global authenticated-fetch wrapper
  // can read it back; then route exactly like the OTP success path.
  const completeLogin = async (data: any) => {
    await saveAuth(data);
    if (data?.is_new_user) {
      navigatingRef.current = true;
      router.replace('/onboarding');
      return;
    }
    await goAfterLogin(
      typeof data?.onboarding_complete === 'boolean' ? data.onboarding_complete : undefined,
    );
  };

  const toggleTerms = () => {
    const next = !termsAccepted;
    setTermsAccepted(next);
    if (next) setShowTermsHint(false);
    // Remembered on this device so the box is pre-ticked on the next login.
    (next
      ? AsyncStorage.setItem(TERMS_ACCEPTED_KEY, TERMS_VERSION)
      : AsyncStorage.removeItem(TERMS_ACCEPTED_KEY)
    ).catch(() => undefined);
  };

  // Every sign-in path checks this first: without consent nothing is sent.
  // (The gated buttons only *look* disabled so a tap can explain why.)
  const requireTerms = (): boolean => {
    if (termsAccepted) return true;
    setShowTermsHint(true);
    setAuthMode('main'); // the consent row lives on the main screen
    AccessibilityInfo.announceForAccessibility('Please accept the Terms to continue');
    return false;
  };

  const handleGoogleAuth = async () => {
    if (!requireTerms()) return;
    const mod = loadGoogleSignin();
    if (!mod) {
      Alert.alert(
        'Google Sign-In unavailable',
        'Google Sign-In needs the installed app build; use phone login here.',
      );
      return;
    }
    const { GoogleSignin, statusCodes } = mod;
    setAuthLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const r = await GoogleSignin.signIn();
      if (!r || r.type === 'cancelled') return; // user dismissed — silent
      const idToken: string | undefined = r?.data?.idToken || undefined;
      if (!idToken) {
        Alert.alert('Error', 'Google did not return a sign-in token. Please try again.');
        return;
      }
      const resp = await fetch(apiUrl('/api/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken, accepted_terms_version: TERMS_VERSION }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        Alert.alert('Error', data?.detail || 'Google sign-in failed. Please try again.');
        return;
      }
      await completeLogin(data);
    } catch (e: any) {
      const code = e?.code;
      if (code && (code === statusCodes?.SIGN_IN_CANCELLED || code === statusCodes?.IN_PROGRESS)) {
        return; // cancelled / double-tap — silent
      }
      if (code && code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert(
          'Google Play services needed',
          'Update Google Play services to use Google Sign-In, or use phone login.',
        );
        return;
      }
      console.warn('[auth] google sign-in failed:', code || e?.message || 'unknown');
      Alert.alert('Error', 'Google sign-in failed. Please try again or use phone login.');
    } finally {
      if (!navigatingRef.current) setAuthLoading(false);
    }
  };

  // Send OTP for phone
  const handleSendPhoneOTP = async () => {
    if (!requireTerms()) return;
    const e164 = toE164(phone);
    if (!e164) {
      Alert.alert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }
    if (resendIn > 0) {
      // A code was just sent to this number — go back to code entry instead
      // of silently ignoring the tap. A different number may be sent now
      // (the backend rate-limits per number and answers 429 if needed).
      if (e164 === lastSentToRef.current) {
        setAuthMode('phone-otp');
        return;
      }
    }

    setAuthLoading(true);
    try {
      const resp = await fetch(apiUrl('/api/auth/send-phone-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: e164 }),
      });
      const data = await resp.json().catch(() => ({}));

      if (resp.ok) {
        setIsNewUser(!!data.is_new_user);
        setOtp('');
        lastSentToRef.current = e164;
        // Honour the server's cooldown (seconds) when it sends one.
        const serverCooldown = Number(data?.resend_after);
        setResendIn(
          Number.isFinite(serverCooldown) && serverCooldown > 0 && serverCooldown <= 600
            ? Math.ceil(serverCooldown)
            : RESEND_COOLDOWN_SECONDS,
        );
        setAuthMode('phone-otp');
      } else if (resp.status === 429) {
        Alert.alert('Too many attempts', 'Too many attempts, try later.');
      } else {
        Alert.alert('Error', data.detail || 'Failed to send OTP');
      }
    } catch (e) {
      console.warn('[auth] send OTP failed:', e);
      Alert.alert('Error', 'Failed to send OTP. Please check your connection and try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Verify OTP and login/signup
  const handleVerifyOTP = async () => {
    if (!requireTerms()) return;
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Error', `Please enter the ${OTP_LENGTH}-digit code`);
      return;
    }
    const e164 = toE164(phone);
    if (!e164) {
      Alert.alert('Error', 'Please enter a valid phone number');
      setAuthMode('phone');
      return;
    }

    // Name is optional - collected during onboarding
    setAuthLoading(true);
    try {
      const resp = await fetch(apiUrl('/api/auth/verify-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'phone',
          identifier: e164,
          otp: code,
          accepted_terms_version: TERMS_VERSION,
        }),
      });
      const data = await resp.json().catch(() => ({}));

      if (resp.ok) {
        await completeLogin(data);
      } else if (resp.status === 429) {
        Alert.alert('Too many attempts', 'Too many attempts, try later.');
      } else {
        Alert.alert('Error', data.detail || 'Invalid OTP');
      }
    } catch (e) {
      console.warn('[auth] verify OTP failed:', e);
      Alert.alert('Error', 'Verification failed. Please try again.');
    } finally {
      if (!navigatingRef.current) setAuthLoading(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setPhone('');
    setOtp('');
    setIsNewUser(false);
    setResendIn(0);
    setAuthMode('main');
  };

  const phoneValid = toE164(phone) !== null;
  const otpValid = /^\d{6}$/.test(otp);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Please wait...</Text>
      </View>
    );
  }

  // Main Auth Screen
  if (authMode === 'main') {
    return (
      <SafeAreaView style={styles.container} testID="auth-screen">
        <View style={styles.content}>
          <View style={styles.header}>
            {/* Brand logo — already contains the "filmydating" wordmark, so we
                drop the separate <Text title> below it. Source: assets/images/icon.png
                (the same artwork used for the Android/iOS launcher icon). */}
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityLabel="filmydating logo"
            />
            <View style={styles.divider} />
            <Text style={styles.subtitle}>
              World&apos;s first AI-based matchmaking platform for Movie Lovers
            </Text>
          </View>

          <View style={styles.buttons}>
            {/* Required consent — the sign-in buttons stay disabled until ticked */}
            <View style={styles.consentBlock}>
              <View style={styles.consentRow}>
                <TouchableOpacity
                  onPress={toggleTerms}
                  style={styles.consentCheckbox}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: termsAccepted }}
                  accessibilityLabel="I'm 18 or older and agree to the Terms of Use, Community Guidelines and Privacy Policy"
                  testID="terms-checkbox"
                >
                  <Ionicons
                    name={termsAccepted ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={termsAccepted ? COLORS.primary : COLORS.textSecondary}
                  />
                </TouchableOpacity>
                <Text style={styles.consentText} onPress={toggleTerms}>
                  I&apos;m 18 or older and agree to the{' '}
                  <Text
                    style={styles.consentLink}
                    onPress={() => openLegal(LEGAL_URLS.terms)}
                    accessibilityRole="link"
                  >
                    Terms of Use
                  </Text>
                  ,{' '}
                  <Text
                    style={styles.consentLink}
                    onPress={() => openLegal(LEGAL_URLS.guidelines)}
                    accessibilityRole="link"
                  >
                    Community Guidelines
                  </Text>
                  {' '}and{' '}
                  <Text
                    style={styles.consentLink}
                    onPress={() => openLegal(LEGAL_URLS.privacy)}
                    accessibilityRole="link"
                  >
                    Privacy Policy
                  </Text>
                </Text>
              </View>
              {showTermsHint && !termsAccepted ? (
                <Text style={styles.termsHint}>Please accept the Terms to continue</Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, !termsAccepted && styles.btnDisabled]}
              onPress={() => {
                if (!requireTerms()) return;
                resetForm();
                setAuthMode('phone');
              }}
              testID="phone-auth-btn"
              activeOpacity={0.8}
            >
              <Ionicons name="call-outline" size={20} color={COLORS.white} />
              <Text style={styles.btnText}>Login with Phone Number</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.googleBtn, !termsAccepted && styles.btnDisabled]}
              onPress={handleGoogleAuth}
              testID="google-auth-btn"
              activeOpacity={0.8}
            >
              <Ionicons name="logo-google" size={20} color={COLORS.white} />
              <Text style={styles.btnText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Phone Login Screen
  if (authMode === 'phone') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior="padding" style={styles.formContainer}>
          <TouchableOpacity style={styles.backBtn} onPress={resetForm}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.formHeader}>
            <Ionicons name="call-outline" size={48} color={COLORS.primary} />
            <Text style={styles.formTitle}>Login with Phone</Text>
            <Text style={styles.formSubtitle}>
              Enter your mobile number to receive a verification code
            </Text>
          </View>

          <View style={styles.formInputs}>
            <View style={styles.phoneRow}>
              <View style={styles.phonePrefix}>
                <Text style={styles.phonePrefixText}>+91</Text>
              </View>
              <TextInput
                style={[styles.input, styles.phoneInput]}
                placeholder="10-digit mobile number"
                placeholderTextColor={COLORS.textMuted}
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/[^\d+\s-]/g, ''))}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={16}
                returnKeyType="done"
                onSubmitEditing={phoneValid ? handleSendPhoneOTP : undefined}
                testID="phone-input"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, (!phoneValid || !termsAccepted) && styles.btnDisabled]}
              onPress={handleSendPhoneOTP}
              disabled={!phoneValid}
            >
              <Text style={styles.btnText}>Send OTP</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Phone OTP Verification Screen
  if (authMode === 'phone-otp') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior="padding" style={styles.formContainer}>
          <TouchableOpacity style={styles.backBtn} onPress={() => { setOtp(''); setAuthMode('phone'); }}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.formHeader}>
            <Ionicons name="shield-checkmark-outline" size={48} color={COLORS.primary} />
            <Text style={styles.formTitle}>Verify OTP</Text>
            <Text style={styles.formSubtitle}>
              Enter the {OTP_LENGTH}-digit code sent to {toE164(phone) || phone}
            </Text>
          </View>

          <View style={styles.formInputs}>
            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="Enter OTP"
              placeholderTextColor={COLORS.textMuted}
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              returnKeyType="done"
              onSubmitEditing={otpValid ? handleVerifyOTP : undefined}
              testID="otp-input"
            />

            <TouchableOpacity
              style={[styles.primaryBtn, (!otpValid || !termsAccepted) && styles.btnDisabled]}
              onPress={handleVerifyOTP}
              disabled={!otpValid}
            >
              <Text style={styles.btnText}>
                {isNewUser ? 'Create Account' : 'Login'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSendPhoneOTP}
              style={styles.resendBtn}
              disabled={resendIn > 0}
              testID="resend-otp-btn"
            >
              <Text style={[styles.resendText, resendIn > 0 && styles.resendTextDisabled]}>
                {resendIn > 0
                  ? `Resend code in ${resendIn}s`
                  : "Didn't receive code? Resend"}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    marginTop: SPACING.m,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.l,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  iconRow: {
    marginBottom: SPACING.m,
  },
  // Brand logo on the auth screen — smaller, transparent-background variant.
  // Was 220x220; the bigger size felt heavy on the welcome screen.
  brandLogo: {
    width: 140,
    height: 140,
    marginBottom: SPACING.s,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.text,
    letterSpacing: 1,
  },
  divider: {
    width: 60,
    height: 3,
    backgroundColor: COLORS.gold,
    marginVertical: SPACING.m,
    borderRadius: 2,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttons: {
    width: '100%',
    maxWidth: 340,
    gap: SPACING.m,
    marginBottom: SPACING.xl,
  },
  googleBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    minHeight: 52,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    minHeight: 52,
  },
  btnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  // Consent row (18+ / Terms / Community Guidelines / Privacy Policy)
  consentBlock: {
    gap: SPACING.xs,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.s,
  },
  consentCheckbox: {
    paddingTop: 1,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  consentLink: {
    color: COLORS.text,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  termsHint: {
    fontSize: 13,
    color: COLORS.error,
    marginLeft: 22 + SPACING.s, // aligned with the consent text
  },
  // Form styles
  formContainer: {
    flex: 1,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.xl,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.l,
  },
  formHeader: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  formTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SPACING.m,
    marginBottom: SPACING.s,
  },
  formSubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SPACING.l,
  },
  formInputs: {
    gap: SPACING.m,
  },
  input: {
    backgroundColor: COLORS.bgInput,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
    paddingVertical: 16,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // Phone input with a fixed "+91" country prefix on the left
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.s,
  },
  phonePrefix: {
    backgroundColor: COLORS.bgInput,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phonePrefixText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
  },
  otpInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
  },
  resendBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.m,
  },
  resendText: {
    color: COLORS.primary,
    fontSize: 14,
  },
  resendTextDisabled: {
    color: COLORS.textMuted,
  },
});
