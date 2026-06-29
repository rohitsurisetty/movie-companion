/**
 * Shared theme + screen constants for chat screens.
 * Extracted from app/(tabs)/chat.tsx.
 */
import { Dimensions } from 'react-native';

export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export const COLORS = {
  primary: '#E50914',
  buddy: '#2196F3',
  bg: '#0A0A0A',
  bgCard: '#1A1A1A',
  bgInput: '#2A2A2A',
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#666666',
  border: '#333333',
  success: '#00D26A',
  warning: '#FFB800',
  online: '#00D26A',
  suggestion: '#1E3A5F',
};
