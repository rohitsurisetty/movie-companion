import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput,
  ActivityIndicator, Platform, KeyboardAvoidingView, Alert, Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../src/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width } = Dimensions.get('window');

type AuthMode = 'main' | 'email' | 'phone' | 'email-otp' | 'phone-otp' | 'forgot-password' | 'reset-sent';

export default function AuthScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('main');
  
  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  
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
          router.replace('/swipe');
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
      
      // Check if new user or existing
      if (data.is_new_user) {
        router.replace('/onboarding');
      } else {
        const onboardingDone = await AsyncStorage.getItem('@film_companion_onboarding_complete');
        if (onboardingDone === 'true') {
          router.replace('/swipe');
        } else {
          router.replace('/onboarding');
        }
      }
    } catch (e) {
      console.error('Google auth error:', e);
      Alert.alert('Error', 'Authentication failed. Please try again.');
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

  // Send OTP for email
  const handleSendEmailOTP = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    
    setAuthLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/send-email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await resp.json();
      
      if (resp.ok) {
        setIsNewUser(data.is_new_user);
        setOtpSent(true);
        setAuthMode('email-otp');
        
        // Show OTP in alert for testing (mocked)
        if (data.otp) {
          Alert.alert('OTP Sent', `Your OTP is: ${data.otp}\n\n(This is shown for testing only)`);
        } else {
          Alert.alert('Success', 'OTP sent to your email');
        }
      } else {
        Alert.alert('Error', data.detail || 'Failed to send OTP');
      }
    } catch (e) {
      console.error('Send OTP error:', e);
      Alert.alert('Error', 'Failed to send OTP. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Send OTP for phone
  const handleSendPhoneOTP = async () => {
    if (!phone.trim() || phone.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }
    
    setAuthLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/send-phone-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await resp.json();
      
      if (resp.ok) {
        setIsNewUser(data.is_new_user);
        setOtpSent(true);
        setAuthMode('phone-otp');
        
        // Show OTP in alert for testing (mocked)
        if (data.otp) {
          Alert.alert('OTP Sent', `Your OTP is: ${data.otp}\n\n(This is shown for testing only)`);
        } else {
          Alert.alert('Success', 'OTP sent to your phone');
        }
      } else {
        Alert.alert('Error', data.detail || 'Failed to send OTP');
      }
    } catch (e) {
      console.error('Send OTP error:', e);
      Alert.alert('Error', 'Failed to send OTP. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Verify OTP and login/signup
  const handleVerifyOTP = async () => {
    if (!otp.trim() || otp.length < 4) {
      Alert.alert('Error', 'Please enter the OTP');
      return;
    }
    
    // For new users, name is required
    if (isNewUser && !name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    
    setAuthLoading(true);
    try {
      const isEmail = authMode === 'email-otp';
      const resp = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: isEmail ? 'email' : 'phone',
          identifier: isEmail ? email.trim().toLowerCase() : phone.trim(),
          otp: otp.trim(),
          name: isNewUser ? name.trim() : undefined,
        }),
      });
      const data = await resp.json();
      
      if (resp.ok) {
        await AsyncStorage.setItem('@film_companion_auth', JSON.stringify(data));
        
        // Navigate based on user status
        if (data.is_new_user) {
          router.replace('/onboarding');
        } else {
          const onboardingDone = await AsyncStorage.getItem('@film_companion_onboarding_complete');
          if (onboardingDone === 'true') {
            router.replace('/swipe');
          } else {
            router.replace('/onboarding');
          }
        }
      } else {
        Alert.alert('Error', data.detail || 'Invalid OTP');
      }
    } catch (e) {
      console.error('Verify OTP error:', e);
      Alert.alert('Error', 'Verification failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Forgot Password
  const handleForgotPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    
    setAuthLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await resp.json();
      
      if (resp.ok) {
        setAuthMode('reset-sent');
      } else {
        Alert.alert('Error', data.detail || 'Failed to send reset link');
      }
    } catch (e) {
      console.error('Forgot password error:', e);
      Alert.alert('Error', 'Failed to send reset link. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setOtp('');
    setIsNewUser(false);
    setOtpSent(false);
    setAuthMode('main');
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
            <View style={styles.iconRow}>
              <Ionicons name="film-outline" size={40} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Film Companion</Text>
            <View style={styles.divider} />
            <Text style={styles.subtitle}>
              Find people who have the same movie taste as you
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
              onPress={() => Alert.alert('Coming Soon', 'Apple Sign In will be available soon!')}
              testID="apple-auth-btn"
              activeOpacity={0.8}
            >
              <Ionicons name="logo-apple" size={20} color={COLORS.white} />
              <Text style={styles.btnText}>Continue with Apple</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => { resetForm(); setAuthMode('email'); }}
              testID="email-auth-btn"
              activeOpacity={0.8}
            >
              <Ionicons name="mail-outline" size={20} color={COLORS.text} />
              <Text style={styles.outlineBtnText}>Login with Email</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => { resetForm(); setAuthMode('phone'); }}
              testID="phone-auth-btn"
              activeOpacity={0.8}
            >
              <Ionicons name="call-outline" size={20} color={COLORS.text} />
              <Text style={styles.outlineBtnText}>Login with Phone Number</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            testID="forgot-password-btn" 
            onPress={() => { resetForm(); setAuthMode('forgot-password'); }}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Email Login Screen
  if (authMode === 'email') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.formContainer}
        >
          <TouchableOpacity style={styles.backBtn} onPress={resetForm}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          
          <View style={styles.formHeader}>
            <Ionicons name="mail-outline" size={48} color={COLORS.primary} />
            <Text style={styles.formTitle}>Login with Email</Text>
            <Text style={styles.formSubtitle}>
              Enter your email address to receive a verification code
            </Text>
          </View>

          <View style={styles.formInputs}>
            <TextInput
              style={styles.input}
              placeholder="Email Address"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              testID="email-input"
            />
            
            <TouchableOpacity
              style={[styles.primaryBtn, !email.includes('@') && styles.btnDisabled]}
              onPress={handleSendEmailOTP}
              disabled={!email.includes('@')}
            >
              <Text style={styles.btnText}>Send OTP</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Phone Login Screen
  if (authMode === 'phone') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.formContainer}
        >
          <TouchableOpacity style={styles.backBtn} onPress={resetForm}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          
          <View style={styles.formHeader}>
            <Ionicons name="call-outline" size={48} color={COLORS.primary} />
            <Text style={styles.formTitle}>Login with Phone</Text>
            <Text style={styles.formSubtitle}>
              Enter your phone number to receive a verification code
            </Text>
          </View>

          <View style={styles.formInputs}>
            <TextInput
              style={styles.input}
              placeholder="Phone Number (e.g., +91XXXXXXXXXX)"
              placeholderTextColor={COLORS.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              testID="phone-input"
            />
            
            <TouchableOpacity
              style={[styles.primaryBtn, phone.length < 10 && styles.btnDisabled]}
              onPress={handleSendPhoneOTP}
              disabled={phone.length < 10}
            >
              <Text style={styles.btnText}>Send OTP</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Email OTP Verification Screen
  if (authMode === 'email-otp') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.formContainer}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => setAuthMode('email')}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          
          <View style={styles.formHeader}>
            <Ionicons name="shield-checkmark-outline" size={48} color={COLORS.primary} />
            <Text style={styles.formTitle}>Verify OTP</Text>
            <Text style={styles.formSubtitle}>
              Enter the 6-digit code sent to {email}
            </Text>
          </View>

          <View style={styles.formInputs}>
            {isNewUser && (
              <TextInput
                style={styles.input}
                placeholder="Your Name"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                testID="name-input"
              />
            )}
            
            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="Enter OTP"
              placeholderTextColor={COLORS.textMuted}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              testID="otp-input"
            />
            
            <TouchableOpacity
              style={[styles.primaryBtn, otp.length < 4 && styles.btnDisabled]}
              onPress={handleVerifyOTP}
              disabled={otp.length < 4}
            >
              <Text style={styles.btnText}>
                {isNewUser ? 'Create Account' : 'Login'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSendEmailOTP} style={styles.resendBtn}>
              <Text style={styles.resendText}>Didn't receive code? Resend</Text>
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.formContainer}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => setAuthMode('phone')}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          
          <View style={styles.formHeader}>
            <Ionicons name="shield-checkmark-outline" size={48} color={COLORS.primary} />
            <Text style={styles.formTitle}>Verify OTP</Text>
            <Text style={styles.formSubtitle}>
              Enter the 6-digit code sent to {phone}
            </Text>
          </View>

          <View style={styles.formInputs}>
            {isNewUser && (
              <TextInput
                style={styles.input}
                placeholder="Your Name"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                testID="name-input"
              />
            )}
            
            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="Enter OTP"
              placeholderTextColor={COLORS.textMuted}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              testID="otp-input"
            />
            
            <TouchableOpacity
              style={[styles.primaryBtn, otp.length < 4 && styles.btnDisabled]}
              onPress={handleVerifyOTP}
              disabled={otp.length < 4}
            >
              <Text style={styles.btnText}>
                {isNewUser ? 'Create Account' : 'Login'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSendPhoneOTP} style={styles.resendBtn}>
              <Text style={styles.resendText}>Didn't receive code? Resend</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Forgot Password Screen
  if (authMode === 'forgot-password') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.formContainer}
        >
          <TouchableOpacity style={styles.backBtn} onPress={resetForm}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          
          <View style={styles.formHeader}>
            <Ionicons name="key-outline" size={48} color={COLORS.primary} />
            <Text style={styles.formTitle}>Forgot Password</Text>
            <Text style={styles.formSubtitle}>
              Enter your email address to receive a password reset link
            </Text>
          </View>

          <View style={styles.formInputs}>
            <TextInput
              style={styles.input}
              placeholder="Email Address"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              testID="forgot-email-input"
            />
            
            <TouchableOpacity
              style={[styles.primaryBtn, !email.includes('@') && styles.btnDisabled]}
              onPress={handleForgotPassword}
              disabled={!email.includes('@')}
            >
              <Text style={styles.btnText}>Send Reset Link</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Reset Link Sent Screen
  if (authMode === 'reset-sent') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Ionicons name="checkmark-circle-outline" size={64} color={COLORS.success} />
            <Text style={styles.formTitle}>Check Your Email</Text>
            <Text style={styles.formSubtitle}>
              We've sent a password reset link to {email}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={resetForm}
          >
            <Text style={styles.btnText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
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
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
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
});
