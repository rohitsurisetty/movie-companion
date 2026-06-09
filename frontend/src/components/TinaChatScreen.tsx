import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  FlatList, ActivityIndicator, Platform, KeyboardAvoidingView,
  Dimensions, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { ProfileData } from '../types';

const { width } = Dimensions.get('window');
const API_BASE = process.env.EXPO_PUBLIC_API_URL || '';

// Tina avatar
const TINA_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face';

type Message = {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  options?: {
    field: string;
    options: string[];
    multiSelect: boolean;
  };
  showMoviePicker?: boolean;
};

type Props = {
  userId: string;
  userName: string;
  onComplete: (profileData: Partial<ProfileData>) => void;
  onExit: (profileData: Partial<ProfileData>) => void;
};

export default function TinaChatScreen({ userId, userName, onComplete, onExit }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [profileData, setProfileData] = useState<Partial<ProfileData>>({});
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [currentOptions, setCurrentOptions] = useState<Message['options'] | null>(null);
  const [showMoviePicker, setShowMoviePicker] = useState(false);
  const [movieSearch, setMovieSearch] = useState('');
  const [movieResults, setMovieResults] = useState<any[]>([]);
  const [selectedMovies, setSelectedMovies] = useState<any[]>([]);
  
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Initialize conversation
  useEffect(() => {
    initConversation();
  }, []);

  const initConversation = async () => {
    setIsLoading(true);
    try {
      // Get greeting
      const greetingRes = await fetch(`${API_BASE}/api/tina/greeting?user_name=${encodeURIComponent(userName)}`);
      const greetingData = await greetingRes.json();
      
      if (greetingData.success) {
        const greetingMsg: Message = {
          id: 'greeting',
          text: greetingData.greeting,
          isUser: false,
          timestamp: new Date(),
        };
        setMessages([greetingMsg]);
        
        // Start the conversation
        setTimeout(() => sendMessage('', true), 1500);
      }
    } catch (error) {
      console.error('Init conversation error:', error);
      // Fallback greeting
      setMessages([{
        id: 'greeting',
        text: `Hey ${userName}! 👋 I'm Tina, and I'll help you create an awesome profile. Let's chat!`,
        isUser: false,
        timestamp: new Date(),
      }]);
      setTimeout(() => sendMessage('', true), 1500);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (text: string, isInitial: boolean = false, option?: string, options?: string[], movies?: any[]) => {
    // Add user message if not initial
    if (text && !isInitial) {
      const userMsg: Message = {
        id: `user_${Date.now()}`,
        text: text,
        isUser: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMsg]);
    }

    setIsTyping(true);
    setInputText('');
    setCurrentOptions(null);

    try {
      const response = await fetch(`${API_BASE}/api/tina/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          user_name: userName,
          message: text,
          selected_option: option,
          selected_options: options,
          selected_movies: movies,
        }),
      });

      const data = await response.json();
      
      // Simulate typing delay
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1000));
      
      setIsTyping(false);

      // Handle exit intent
      if (data.exit_intent) {
        const exitMsg: Message = {
          id: `tina_${Date.now()}`,
          text: data.response,
          isUser: false,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, exitMsg]);
        setProfileData(data.profile_data || {});
        
        // Wait a moment then exit
        setTimeout(() => {
          onExit(data.profile_data || {});
        }, 2000);
        return;
      }

      // Update completion percentage
      setCompletionPercentage(data.completion_percentage || 0);
      
      // Update profile data
      if (data.profile_data) {
        setProfileData(data.profile_data);
      }

      // Add Tina's response
      const tinaMsg: Message = {
        id: `tina_${Date.now()}`,
        text: data.response,
        isUser: false,
        timestamp: new Date(),
        options: data.show_options,
        showMoviePicker: data.show_movie_picker,
      };
      setMessages(prev => [...prev, tinaMsg]);

      // Handle options
      if (data.show_options) {
        setCurrentOptions(data.show_options);
        setSelectedOptions([]);
      }

      // Handle movie picker
      if (data.show_movie_picker) {
        setShowMoviePicker(true);
      }

      // Check if complete
      if (data.completion_percentage >= 100) {
        setTimeout(() => {
          onComplete(data.profile_data || {});
        }, 2000);
      }

    } catch (error) {
      console.error('Send message error:', error);
      setIsTyping(false);
      
      // Error message
      setMessages(prev => [...prev, {
        id: `error_${Date.now()}`,
        text: "Oops, something went wrong! Let me try again... 😅",
        isUser: false,
        timestamp: new Date(),
      }]);
    }
  };

  const handleSend = () => {
    if (inputText.trim()) {
      sendMessage(inputText.trim());
    }
  };

  const handleOptionSelect = (option: string) => {
    if (!currentOptions) return;

    if (currentOptions.multiSelect) {
      // Multi-select: toggle option
      setSelectedOptions(prev => 
        prev.includes(option) 
          ? prev.filter(o => o !== option)
          : [...prev, option]
      );
    } else {
      // Single select: send immediately
      sendMessage('', false, option);
    }
  };

  const handleMultiSelectConfirm = () => {
    if (selectedOptions.length > 0) {
      sendMessage(`Selected: ${selectedOptions.join(', ')}`, false, undefined, selectedOptions);
    }
  };

  // Movie search
  const searchMovies = async (query: string) => {
    if (!query.trim()) {
      setMovieResults([]);
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/tmdb/search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      setMovieResults(data.results || []);
    } catch (error) {
      console.error('Movie search error:', error);
    }
  };

  const handleMovieSelect = (movie: any) => {
    if (selectedMovies.find(m => m.id === movie.id)) {
      setSelectedMovies(prev => prev.filter(m => m.id !== movie.id));
    } else if (selectedMovies.length < 5) {
      setSelectedMovies(prev => [...prev, {
        id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        rating: 5,
        reasons: [],
      }]);
    }
  };

  const handleMoviesConfirm = () => {
    if (selectedMovies.length > 0) {
      setShowMoviePicker(false);
      const movieTitles = selectedMovies.map(m => m.title).join(', ');
      sendMessage(`My top movies: ${movieTitles}`, false, undefined, undefined, selectedMovies);
      setSelectedMovies([]);
      setMovieSearch('');
      setMovieResults([]);
    }
  };

  const handleExit = () => {
    sendMessage('bye');
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[styles.messageRow, item.isUser && styles.messageRowUser]}>
      {!item.isUser && (
        <Image source={{ uri: TINA_AVATAR }} style={styles.avatar} />
      )}
      <View style={[
        styles.messageBubble,
        item.isUser ? styles.userBubble : styles.tinaBubble,
      ]}>
        <Text style={[styles.messageText, item.isUser && styles.userMessageText]}>
          {item.text}
        </Text>
      </View>
    </View>
  );

  const renderOptions = () => {
    if (!currentOptions) return null;

    return (
      <View style={styles.optionsContainer}>
        <ScrollView 
          horizontal={!currentOptions.multiSelect}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={currentOptions.multiSelect ? styles.optionsGrid : styles.optionsRow}
        >
          {currentOptions.options.map((option, idx) => {
            const isSelected = selectedOptions.includes(option);
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.optionChip,
                  isSelected && styles.optionChipSelected,
                ]}
                onPress={() => handleOptionSelect(option)}
              >
                <Text style={[
                  styles.optionText,
                  isSelected && styles.optionTextSelected,
                ]}>
                  {option}
                </Text>
                {currentOptions.multiSelect && isSelected && (
                  <Ionicons name="checkmark" size={16} color="#FFF" style={styles.optionCheck} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        
        {currentOptions.multiSelect && selectedOptions.length > 0 && (
          <TouchableOpacity style={styles.confirmButton} onPress={handleMultiSelectConfirm}>
            <Text style={styles.confirmButtonText}>Confirm ({selectedOptions.length})</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExit} style={styles.exitBtn}>
          <Ionicons name="close" size={24} color={COLORS.text} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Image source={{ uri: TINA_AVATAR }} style={styles.headerAvatar} />
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>Tina</Text>
            <Text style={styles.headerStatus}>
              {isTyping ? 'typing...' : 'your profile assistant ✨'}
            </Text>
          </View>
        </View>
        
        <View style={styles.progressBadge}>
          <Text style={styles.progressText}>{completionPercentage}%</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${completionPercentage}%` }]} />
      </View>

      {/* Messages */}
      <KeyboardAvoidingView 
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          onLayout={() => flatListRef.current?.scrollToEnd()}
          ListFooterComponent={isTyping ? (
            <View style={styles.typingIndicator}>
              <Image source={{ uri: TINA_AVATAR }} style={styles.avatar} />
              <View style={styles.typingBubble}>
                <View style={styles.typingDots}>
                  <View style={[styles.dot, styles.dot1]} />
                  <View style={[styles.dot, styles.dot2]} />
                  <View style={[styles.dot, styles.dot3]} />
                </View>
              </View>
            </View>
          ) : null}
        />

        {/* Options */}
        {renderOptions()}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor={COLORS.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity 
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={20} color={inputText.trim() ? '#FFF' : COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Movie Picker Modal */}
      <Modal visible={showMoviePicker} animationType="slide">
        <SafeAreaView style={styles.moviePickerContainer}>
          <View style={styles.moviePickerHeader}>
            <TouchableOpacity onPress={() => setShowMoviePicker(false)}>
              <Ionicons name="close" size={28} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.moviePickerTitle}>Select Your Top Movies</Text>
            <TouchableOpacity onPress={handleMoviesConfirm} disabled={selectedMovies.length === 0}>
              <Text style={[styles.moviePickerDone, selectedMovies.length === 0 && styles.moviePickerDoneDisabled]}>
                Done ({selectedMovies.length}/5)
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.movieSearchInput}
            placeholder="Search movies..."
            placeholderTextColor={COLORS.textMuted}
            value={movieSearch}
            onChangeText={(text) => {
              setMovieSearch(text);
              searchMovies(text);
            }}
          />

          {/* Selected Movies */}
          {selectedMovies.length > 0 && (
            <View style={styles.selectedMoviesRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {selectedMovies.map(movie => (
                  <TouchableOpacity 
                    key={movie.id} 
                    style={styles.selectedMovieChip}
                    onPress={() => handleMovieSelect(movie)}
                  >
                    <Text style={styles.selectedMovieText} numberOfLines={1}>
                      {movie.title}
                    </Text>
                    <Ionicons name="close-circle" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <FlatList
            data={movieResults}
            keyExtractor={item => item.id.toString()}
            numColumns={3}
            contentContainerStyle={styles.movieGrid}
            renderItem={({ item }) => {
              const isSelected = selectedMovies.find(m => m.id === item.id);
              return (
                <TouchableOpacity 
                  style={[styles.movieItem, isSelected && styles.movieItemSelected]}
                  onPress={() => handleMovieSelect(item)}
                >
                  {item.poster_path ? (
                    <Image 
                      source={{ uri: `https://image.tmdb.org/t/p/w200${item.poster_path}` }}
                      style={styles.moviePoster}
                    />
                  ) : (
                    <View style={[styles.moviePoster, styles.moviePosterPlaceholder]}>
                      <Ionicons name="film-outline" size={32} color={COLORS.textMuted} />
                    </View>
                  )}
                  <Text style={styles.movieTitle} numberOfLines={2}>{item.title}</Text>
                  {isSelected && (
                    <View style={styles.movieSelectedBadge}>
                      <Ionicons name="checkmark" size={16} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  exitBtn: {
    padding: SPACING.xs,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  headerInfo: {
    marginLeft: SPACING.sm,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerStatus: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  progressBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  progressBar: {
    height: 3,
    backgroundColor: COLORS.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  messagesList: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
    alignItems: 'flex-end',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: SPACING.xs,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  tinaBubble: {
    backgroundColor: COLORS.bgCard,
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFF',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: SPACING.sm,
  },
  typingBubble: {
    backgroundColor: COLORS.bgCard,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderBottomLeftRadius: 4,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.textMuted,
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
  optionsContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  optionText: {
    fontSize: 14,
    color: COLORS.text,
  },
  optionTextSelected: {
    color: '#FFF',
    fontWeight: '600',
  },
  optionCheck: {
    marginLeft: SPACING.xs,
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.sm,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 16,
    color: COLORS.text,
    maxHeight: 100,
    marginRight: SPACING.sm,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.bgCard,
  },
  // Movie picker styles
  moviePickerContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  moviePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  moviePickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  moviePickerDone: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  moviePickerDoneDisabled: {
    color: COLORS.textMuted,
  },
  movieSearchInput: {
    backgroundColor: COLORS.bgCard,
    margin: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    fontSize: 16,
    color: COLORS.text,
  },
  selectedMoviesRow: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  selectedMovieChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    marginRight: SPACING.sm,
    maxWidth: 150,
  },
  selectedMovieText: {
    fontSize: 13,
    color: COLORS.text,
    marginRight: SPACING.xs,
    flex: 1,
  },
  movieGrid: {
    padding: SPACING.sm,
  },
  movieItem: {
    width: (width - SPACING.sm * 4) / 3,
    padding: SPACING.xs,
    position: 'relative',
  },
  movieItemSelected: {
    opacity: 0.8,
  },
  moviePoster: {
    width: '100%',
    aspectRatio: 2/3,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.bgCard,
  },
  moviePosterPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  movieTitle: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  movieSelectedBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
