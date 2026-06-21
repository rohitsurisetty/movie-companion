import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Text,
  Dimensions,
  Animated,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTina } from '../context/TinaContext';
import GlobalTinaChatScreen from './GlobalTinaChatScreen';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

interface TinaModalProps {
  // Called when Tina requests navigation (e.g., to movie selection)
  onNavigationRequest?: (destination: string, params?: any) => void;
}

export default function TinaModal({ onNavigationRequest }: TinaModalProps) {
  const insets = useSafeAreaInsets();
  const { state, closeTina, minimizeTina, userProfile, setMessages, addMessage } = useTina();
  const slideAnim = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  
  // Track session open count to trigger new greeting each time modal opens
  const [sessionOpenCount, setSessionOpenCount] = useState(0);
  const wasOpen = useRef(false);

  // Animate modal in/out AND trigger new greeting on open
  useEffect(() => {
    if (state.isOpen) {
      // Increment session count to trigger a new greeting
      if (!wasOpen.current) {
        setSessionOpenCount(prev => prev + 1);
        console.log('[TinaModal] Modal opened - triggering new greeting session');
      }
      wasOpen.current = true;
      
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      wasOpen.current = false;
      
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [state.isOpen, slideAnim, fadeAnim]);

  const handleClose = useCallback(() => {
    closeTina();
  }, [closeTina]);

  const handleMinimize = useCallback(() => {
    minimizeTina();
  }, [minimizeTina]);

  const handleMessagesChange = useCallback((messages: any[]) => {
    setMessages(messages);
  }, [setMessages]);

  if (!state.isOpen) return null;

  return (
    <Modal
      visible={state.isOpen}
      animationType="none"
      transparent={true}
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          styles.backdrop,
          { opacity: fadeAnim },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={handleMinimize}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Modal Content */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <SafeAreaView style={styles.safeArea} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <TouchableOpacity
                  onPress={handleMinimize}
                  style={styles.headerButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="chevron-down" size={28} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>Tina</Text>
                <View style={styles.onlineDot} />
              </View>
              
              <View style={styles.headerRight}>
                <TouchableOpacity
                  onPress={handleClose}
                  style={styles.headerButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Chat Content */}
            <View style={styles.chatContainer}>
              <GlobalTinaChatScreen
                userId={userProfile?.userId || ''}
                userName={userProfile?.name || ''}
                existingMessages={state.messages}
                onMessagesChange={handleMessagesChange}
                onNavigationRequest={onNavigationRequest}
                isOnboardingComplete={state.isOnboardingComplete}
                userProfile={userProfile}
                sessionOpenCount={sessionOpenCount}
              />
            </View>
          </SafeAreaView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  keyboardAvoid: {
    flex: 1,
  },
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.92,
    backgroundColor: '#0D0D0D',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    width: 44,
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    width: 44,
    alignItems: 'flex-end',
  },
  headerButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginLeft: 8,
  },
  chatContainer: {
    flex: 1,
  },
});
