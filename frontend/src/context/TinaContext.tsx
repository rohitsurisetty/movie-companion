import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || '';

// Storage keys
const TINA_STATE_KEY = 'global_tina_state';
const TINA_MESSAGES_KEY = 'global_tina_messages';

export type Message = {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
};

export type UserProfileData = {
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  location?: string;
  relationshipIntent?: string | string[];
  partnerPreference?: string | string[];
  languagesSpoken?: string[];
  movieFrequency?: string;
  ottTheatre?: string;
  filmLanguages?: string[];
  genres?: string[];
  topMovies?: any[];
  bio?: string;
  height?: string;
  drinking?: string;
  smoking?: string;
  zodiac?: string;
  // Add any other profile fields
  [key: string]: any;
};

// Onboarding stages for visibility control
export type OnboardingStage = 
  | 'pre_decision'      // Before "Continue with Tina" / "Manual" choice
  | 'tina_onboarding'   // User chose Tina-assisted onboarding
  | 'manual_onboarding' // User chose manual form filling
  | 'completed';        // Onboarding complete

export type TinaState = {
  isOpen: boolean;           // Floating modal is open
  isMinimized: boolean;
  isOnboardingTinaActive: boolean;  // Full-screen onboarding Tina is active
  messages: Message[];
  hasUnreadMessage: boolean;
  lastInteractionTime: number;
  isOnboardingComplete: boolean;
  onboardingStage: OnboardingStage;
  currentOnboardingStep?: string;
  askedQuestions: string[]; // Track what Tina has asked
  collectedFields: string[]; // Track what fields have been collected
};

type TinaContextType = {
  // State
  state: TinaState;
  userProfile: UserProfileData | null;
  isLoading: boolean;
  
  // Actions
  openTina: () => void;
  closeTina: () => void;
  minimizeTina: () => void;
  restoreTina: () => void;
  toggleTina: () => void;
  
  // Onboarding Tina screen tracking
  setOnboardingTinaActive: (active: boolean) => void;
  
  // Messages
  addMessage: (text: string, isUser: boolean) => Message;
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;
  markAsRead: () => void;
  
  // User profile sync
  setUserProfile: (profile: UserProfileData) => void;
  updateUserProfile: (updates: Partial<UserProfileData>) => void;
  syncProfileFromBackend: (userId: string) => Promise<void>;
  
  // Onboarding
  setOnboardingStage: (stage: OnboardingStage) => void;
  setOnboardingComplete: (complete: boolean) => void;
  setCurrentOnboardingStep: (step: string | undefined) => void;
  
  // Field tracking
  markFieldAsAsked: (field: string) => void;
  markFieldAsCollected: (field: string) => void;
  markFieldsAsCollected: (fields: string[]) => void;
  isFieldCollected: (field: string) => boolean;
  wasFieldAsked: (field: string) => boolean;
  getMissingFields: () => string[];
  
  // Floating button visibility
  shouldShowFloatingButton: () => boolean;
  
  // Check if Tina is visible in any form
  isTinaVisible: () => boolean;
};

const defaultState: TinaState = {
  isOpen: false,
  isMinimized: false,
  isOnboardingTinaActive: false,
  messages: [],
  hasUnreadMessage: false,
  lastInteractionTime: Date.now(),
  isOnboardingComplete: false,
  onboardingStage: 'pre_decision',
  currentOnboardingStep: undefined,
  askedQuestions: [],
  collectedFields: [],
};

const TinaContext = createContext<TinaContextType | undefined>(undefined);

// All profile fields that can be collected
const ALL_PROFILE_FIELDS = [
  'name', 'gender', 'dateOfBirth', 'location',
  'relationshipIntent', 'partnerPreference', 'languagesSpoken',
  'movieFrequency', 'ottTheatre', 'filmLanguages', 'genres', 'topMovies',
  'height', 'drinking', 'smoking', 'zodiac', 'bio'
];

export function TinaProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TinaState>(defaultState);
  const [userProfile, setUserProfileState] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved state on mount
  useEffect(() => {
    loadSavedState();
  }, []);

  // Save state whenever it changes (debounced)
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveState();
    }, 500);
  }, [state]);

  const loadSavedState = async () => {
    try {
      const [savedState, savedMessages] = await Promise.all([
        AsyncStorage.getItem(TINA_STATE_KEY),
        AsyncStorage.getItem(TINA_MESSAGES_KEY),
      ]);

      if (savedState) {
        const parsed = JSON.parse(savedState);
        setState(prev => ({
          ...prev,
          ...parsed,
          isOpen: false, // Always start closed
          isMinimized: false,
          messages: [], // Messages loaded separately
        }));
      }

      if (savedMessages) {
        const messages = JSON.parse(savedMessages);
        setState(prev => ({ ...prev, messages }));
      }
    } catch (error) {
      console.error('[TinaContext] Error loading saved state:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveState = async () => {
    try {
      const stateToSave = {
        ...state,
        isOpen: false, // Don't persist open state
        isMinimized: false,
      };
      await Promise.all([
        AsyncStorage.setItem(TINA_STATE_KEY, JSON.stringify(stateToSave)),
        AsyncStorage.setItem(TINA_MESSAGES_KEY, JSON.stringify(state.messages)),
      ]);
    } catch (error) {
      console.error('[TinaContext] Error saving state:', error);
    }
  };

  // Generate unique message ID
  const generateMessageId = (isUser: boolean) =>
    `${isUser ? 'user' : 'tina'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // ========== ACTIONS ==========

  const openTina = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: true,
      isMinimized: false,
      hasUnreadMessage: false,
    }));
  }, []);

  const closeTina = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: false,
      isMinimized: false,
    }));
  }, []);

  const minimizeTina = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: false,
      isMinimized: true,
    }));
  }, []);

  const restoreTina = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: true,
      isMinimized: false,
      hasUnreadMessage: false,
    }));
  }, []);

  const toggleTina = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: !prev.isOpen,
      isMinimized: false,
      hasUnreadMessage: prev.isOpen ? prev.hasUnreadMessage : false,
    }));
  }, []);

  // Track when onboarding Tina screen is active
  const setOnboardingTinaActive = useCallback((active: boolean) => {
    console.log('[TinaContext] Setting onboarding Tina active:', active);
    setState(prev => ({
      ...prev,
      isOnboardingTinaActive: active,
    }));
  }, []);

  // Check if Tina is visible in any form (modal OR onboarding screen)
  const isTinaVisible = useCallback((): boolean => {
    return state.isOpen || state.isOnboardingTinaActive;
  }, [state.isOpen, state.isOnboardingTinaActive]);

  // ========== MESSAGES ==========

  const addMessage = useCallback((text: string, isUser: boolean): Message => {
    const msg: Message = {
      id: generateMessageId(isUser),
      text,
      isUser,
      timestamp: new Date(),
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, msg],
      lastInteractionTime: Date.now(),
      // If Tina is closed and it's a Tina message, mark as unread
      hasUnreadMessage: !prev.isOpen && !isUser ? true : prev.hasUnreadMessage,
    }));

    return msg;
  }, []);

  const setMessages = useCallback((messages: Message[]) => {
    setState(prev => ({
      ...prev,
      messages,
      lastInteractionTime: Date.now(),
    }));
  }, []);

  const clearMessages = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [],
      askedQuestions: [],
    }));
  }, []);

  const markAsRead = useCallback(() => {
    setState(prev => ({
      ...prev,
      hasUnreadMessage: false,
    }));
  }, []);

  // ========== USER PROFILE ==========

  const setUserProfile = useCallback((profile: UserProfileData) => {
    setUserProfileState(profile);
    
    // Update collected fields based on what's in the profile
    const collectedFields: string[] = [];
    ALL_PROFILE_FIELDS.forEach(field => {
      const value = profile[field];
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value) && value.length > 0) {
          collectedFields.push(field);
        } else if (!Array.isArray(value)) {
          collectedFields.push(field);
        }
      }
    });

    setState(prev => ({
      ...prev,
      collectedFields: [...new Set([...prev.collectedFields, ...collectedFields])],
    }));
  }, []);

  const updateUserProfile = useCallback((updates: Partial<UserProfileData>) => {
    setUserProfileState(prev => prev ? { ...prev, ...updates } : null);
    
    // Mark updated fields as collected
    const newCollectedFields = Object.keys(updates).filter(key => {
      const value = updates[key];
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    });

    if (newCollectedFields.length > 0) {
      setState(prev => ({
        ...prev,
        collectedFields: [...new Set([...prev.collectedFields, ...newCollectedFields])],
      }));
    }
  }, []);

  const syncProfileFromBackend = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/user/profile/${userId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUserProfile({
            userId,
            ...data.user,
          });
        }
      }
    } catch (error) {
      console.error('[TinaContext] Error syncing profile:', error);
    }
  }, [setUserProfile]);

  // ========== ONBOARDING ==========

  const setOnboardingStage = useCallback((stage: OnboardingStage) => {
    console.log('[TinaContext] Setting onboarding stage:', stage);
    setState(prev => ({
      ...prev,
      onboardingStage: stage,
      isOnboardingComplete: stage === 'completed',
    }));
  }, []);

  const setOnboardingComplete = useCallback((complete: boolean) => {
    setState(prev => ({
      ...prev,
      isOnboardingComplete: complete,
      onboardingStage: complete ? 'completed' : prev.onboardingStage,
    }));
  }, []);

  const setCurrentOnboardingStep = useCallback((step: string | undefined) => {
    setState(prev => ({
      ...prev,
      currentOnboardingStep: step,
    }));
  }, []);

  // ========== FIELD TRACKING ==========

  const markFieldAsAsked = useCallback((field: string) => {
    setState(prev => ({
      ...prev,
      askedQuestions: [...new Set([...prev.askedQuestions, field])],
    }));
  }, []);

  const markFieldAsCollected = useCallback((field: string) => {
    console.log('[TinaContext] Marking field as collected:', field);
    setState(prev => ({
      ...prev,
      collectedFields: [...new Set([...prev.collectedFields, field])],
    }));
  }, []);

  const markFieldsAsCollected = useCallback((fields: string[]) => {
    console.log('[TinaContext] Marking fields as collected:', fields);
    setState(prev => ({
      ...prev,
      collectedFields: [...new Set([...prev.collectedFields, ...fields])],
    }));
  }, []);

  const isFieldCollected = useCallback((field: string): boolean => {
    // Check from state
    if (state.collectedFields.includes(field)) return true;
    
    // Also check from user profile
    if (userProfile) {
      const value = userProfile[field];
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value) && value.length > 0) return true;
        if (!Array.isArray(value)) return true;
      }
    }
    
    return false;
  }, [state.collectedFields, userProfile]);

  const wasFieldAsked = useCallback((field: string): boolean => {
    return state.askedQuestions.includes(field);
  }, [state.askedQuestions]);

  const getMissingFields = useCallback((): string[] => {
    return ALL_PROFILE_FIELDS.filter(field => !isFieldCollected(field));
  }, [isFieldCollected]);

  // ========== FLOATING BUTTON VISIBILITY ==========

  const shouldShowFloatingButton = useCallback((): boolean => {
    // Hide during pre_decision stage (before user chooses Tina or Manual)
    if (state.onboardingStage === 'pre_decision') {
      return false;
    }
    // Hide when Tina modal is already open
    if (state.isOpen) {
      return false;
    }
    // Hide when onboarding Tina screen is active (full-screen Tina chat)
    if (state.isOnboardingTinaActive) {
      return false;
    }
    // Show in all other cases
    return true;
  }, [state.onboardingStage, state.isOpen, state.isOnboardingTinaActive]);

  const value: TinaContextType = {
    state,
    userProfile,
    isLoading,
    openTina,
    closeTina,
    minimizeTina,
    restoreTina,
    toggleTina,
    setOnboardingTinaActive,
    addMessage,
    setMessages,
    clearMessages,
    markAsRead,
    setUserProfile,
    updateUserProfile,
    syncProfileFromBackend,
    setOnboardingStage,
    setOnboardingComplete,
    setCurrentOnboardingStep,
    markFieldAsAsked,
    markFieldAsCollected,
    markFieldsAsCollected,
    isFieldCollected,
    wasFieldAsked,
    getMissingFields,
    shouldShowFloatingButton,
    isTinaVisible,
  };

  return (
    <TinaContext.Provider value={value}>
      {children}
    </TinaContext.Provider>
  );
}

export function useTina() {
  const context = useContext(TinaContext);
  if (context === undefined) {
    throw new Error('useTina must be used within a TinaProvider');
  }
  return context;
}

export default TinaContext;
