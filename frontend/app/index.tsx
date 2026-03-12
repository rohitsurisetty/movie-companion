import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput,
  ActivityIndicator, Platform, KeyboardAvoidingView, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width } = Dimensions.get('window');

export default function AuthScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [showMockModal, setShowMockModal] = useState(false);
  const [mockType, setMockType] = useState<'email' | 'phone'>('email');
  const [mockName, setMockName] = useState('');
  const [mockEmail, setMockEmail] = useState('');
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (Platform.OS === 'web') {
      const hash = window.location.hash;
      if (hash && hash.includes('session_id=')) {
        hasProcessed.current = true;
        const sessionId = hash.split('session_id=')[1]?.split('&')[0];
        if (sessionId) {
          window.history.replaceState(null, '', window.location.pathname);
          processGoogleAuth(sessionId);
          return;
        }
      }
    }
    checkExistingAuth();
  }, []);

  const checkExistingAuth = async () => {
    try {
      const auth = await AsyncStorage.getItem('@film_companion_auth');
      if (auth) {
        const onboardingDone = await AsyncStorage.getItem('@film_companion_onboarding_complete');
        if (onboardingDone === 'true') {
          router.replace('/success');
        } else {
          router.replace('/onboarding');
        }
        return;
      }
    } catch (e) {
      console.error('Auth check error:', e);
    }
    setLoading(false);
  };

  const processGoogleAuth = async (sessionId: string) => {
    setLoading(false);
    setAuthLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('Auth failed');
      const data = await resp.json();
      await AsyncStorage.setItem('@film_companion_auth', JSON.stringify(data));
      router.replace('/onboarding');
    } catch (e) {
      console.error('Google auth error:', e);
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    setAuthLoading(true);
    try {
      if (Platform.OS === 'web') {
        const redirectUrl = window.location.origin;
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      } else {
        const Linking = require('expo-linking');
        const redirectUrl = Linking.createURL('/');
        const result = await WebBrowser.openAuthSessionAsync(
          `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`,
          redirectUrl
        );
        if (result.type === 'success' && result.url) {
          const sid = result.url.split('session_id=')[1]?.split('&')[0];
          if (sid) await processGoogleAuth(sid);
        }
        setAuthLoading(false);
      }
    } catch (e) {
      console.error('Google auth error:', e);
      setAuthLoading(false);
    }
  };

  const handleMockLogin = async () => {
    if (!mockName.trim()) return;
    const email = mockType === 'email'
      ? (mockEmail.trim() || `${mockName.toLowerCase().replace(/\s/g, '')}@mock.com`)
      : `${mockName.toLowerCase().replace(/\s/g, '')}@phone.mock.com`;
    setAuthLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/mock-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: mockName.trim() }),
      });
      const data = await resp.json();
      await AsyncStorage.setItem('@film_companion_auth', JSON.stringify(data));
      setShowMockModal(false);
      router.replace('/onboarding');
    } catch (e) {
      console.error('Mock login error:', e);
      Alert.alert('Error', 'Login failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

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
        <Text style={styles.loadingText}>Signing you in...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="auth-screen">
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.iconRow}>
            <Ionicons name="film-outline" size={40} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Film Companion</Text>
          <View style={styles.divider} />
          <Text style={styles.subtitle}>
            Find people who love the same movies as you.
          </Text>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleAuth}
            testID="google-auth-btn"
            activeOpacity={0.8}
          >
            <Ionicons name="logo-google" size={20} color={COLORS.white} />
            <Text style={styles.btnText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.appleBtn}
            onPress={() => { setMockType('email'); setMockName(''); setMockEmail(''); setShowMockModal(true); }}
            testID="apple-auth-btn"
            activeOpacity={0.8}
          >
            <Ionicons name="logo-apple" size={20} color={COLORS.white} />
            <Text style={styles.btnText}>Continue with Apple</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => { setMockType('email'); setMockName(''); setMockEmail(''); setShowMockModal(true); }}
            testID="email-auth-btn"
            activeOpacity={0.8}
          >
            <Ionicons name="mail-outline" size={20} color={COLORS.text} />
            <Text style={styles.outlineBtnText}>Login with Email</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => { setMockType('phone'); setMockName(''); setMockEmail(''); setShowMockModal(true); }}
            testID="phone-auth-btn"
            activeOpacity={0.8}
          >
            <Ionicons name="call-outline" size={20} color={COLORS.text} />
            <Text style={styles.outlineBtnText}>Login with Phone Number</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity testID="forgot-password-btn" onPress={() => Alert.alert('Info', 'Password reset link sent!')}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showMockModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {mockType === 'email' ? 'Login with Email' : 'Login with Phone'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Your Name"
              placeholderTextColor={COLORS.textMuted}
              value={mockName}
              onChangeText={setMockName}
              testID="mock-name-input"
            />
            {mockType === 'email' && (
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor={COLORS.textMuted}
                value={mockEmail}
                onChangeText={setMockEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                testID="mock-email-input"
              />
            )}
            {mockType === 'phone' && (
              <TextInput
                style={styles.input}
                placeholder="Phone Number"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="phone-pad"
                testID="mock-phone-input"
              />
            )}
            <TouchableOpacity
              style={[styles.googleBtn, !mockName.trim() && styles.btnDisabled]}
              onPress={handleMockLogin}
              disabled={!mockName.trim()}
              testID="mock-login-submit"
            >
              <Text style={styles.btnText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowMockModal(false)} testID="mock-login-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
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
  appleBtn: {
    backgroundColor: COLORS.bgCard,
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 52,
  },
  outlineBtn: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 52,
  },
  btnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  outlineBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  forgotText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.l,
  },
  modalContent: {
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    width: '100%',
    maxWidth: 380,
    gap: SPACING.m,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.s,
  },
  input: {
    backgroundColor: COLORS.bgInput,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  cancelText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: SPACING.s,
  },
});
