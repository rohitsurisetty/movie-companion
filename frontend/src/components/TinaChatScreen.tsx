import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  FlatList, ActivityIndicator, Platform, KeyboardAvoidingView,
  Dimensions, Modal, ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme';
import { ProfileData } from '../types';

const { width } = Dimensions.get('window');
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || '';

// Tina avatar
const TINA_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face';

type Message = {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
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
  const [isTyping, setIsTyping] = useState(false);
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [profileData, setProfileData] = useState<Partial<ProfileData>>({});
  const [currentOptions, setCurrentOptions] = useState<{
    field: string;
    options: string[];
    multiSelect: boolean;
  } | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [showMoviePicker, setShowMoviePicker] = useState(false);
  const [movieSearch, setMovieSearch] = useState('');
  const [movieResults, setMovieResults] = useState<any[]>([]);
  const [selectedMovies, setSelectedMovies] = useState<any[]>([]);
  
  const flatListRef = useRef<FlatList>(null);
  const typingDots = useRef(new Animated.Value(0)).current;

  // Typing animation
  useEffect(() => {
    if (isTyping) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(typingDots, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(typingDots, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      typingDots.setValue(0);
    }
  }, [isTyping]);

  // Initialize conversation
  useEffect(() => {
    initConversation();
  }, []);

  const addMessage = (text: string, isUser: boolean) => {
    const msg: Message = {
      id: `${isUser ? 'user' : 'tina'}_${Date.now()}`,
      text,
      isUser,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, msg]);
    return msg;
  };

  const initConversation = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tina/greeting?user_name=${encodeURIComponent(userName)}`);
      const data = await res.json();
      
      if (data.success) {
        addMessage(data.greeting, false);
        // Start first question after greeting
        setTimeout(() => sendToTina(''), 1500);
      }
    } catch (error) {
      console.error('Init error:', error);
      addMessage(`Hey ${userName}! I'm Tina. Let's create your profile together! 😊`, false);
      setTimeout(() => sendToTina(''), 1500);
    }
  };

  const sendToTina = async (
    userMessage: string, 
    selectedOption?: string, 
    selectedOpts?: string[],
    movies?: any[]
  ) => {
    if (userMessage) {
      addMessage(userMessage, true);
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
          message: userMessage,
          selected_option: selectedOption,
          selected_options: selectedOpts,
          selected_movies: movies,
        }),
      });

      const data = await response.json();
      
      // Simulate typing delay
      await new Promise(r => setTimeout(r, 600 + Math.random() * 800));
      
      setIsTyping(false);

      // Handle exit
      if (data.exit_intent) {
        addMessage(data.response, false);
        setProfileData(data.profile_data || {});
        setTimeout(() => onExit(data.profile_data || {}), 2000);
        return;
      }

      // Update state
      setCompletionPercentage(data.completion_percentage || 0);
      if (data.profile_data) setProfileData(data.profile_data);

      // Add Tina's response
      addMessage(data.response, false);

      // Show options if needed
      if (data.show_options) {
        setCurrentOptions(data.show_options);
        setSelectedOptions([]);
      }

      // Show movie picker
      if (data.show_movie_picker) {
        setShowMoviePicker(true);
      }

      // Check completion
      if (data.completion_percentage >= 100) {
        setTimeout(() => onComplete(data.profile_data || {}), 2000);
      }

    } catch (error) {
      console.error('Chat error:', error);
      setIsTyping(false);
      addMessage("Oops, something went wrong! Let me try again... 😅", false);
    }
  };

  const handleSend = () => {
    if (inputText.trim()) {
      sendToTina(inputText.trim());
    }
  };

  const handleOptionSelect = (option: string) => {
    if (!currentOptions) return;

    if (currentOptions.multiSelect) {
      setSelectedOptions(prev => 
        prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
      );
    } else {
      // Single select - send immediately
      setCurrentOptions(null);
      sendToTina('', option);
    }
  };

  const handleMultiSelectDone = () => {
    if (selectedOptions.length > 0) {
      const opts = [...selectedOptions];
      setCurrentOptions(null);
      setSelectedOptions([]);
      sendToTina(`Selected: ${opts.join(', ')}`, undefined, opts);
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
    } catch (e) {
      console.error('Movie search error:', e);
    }
  };

  const toggleMovie = (movie: any) => {
    if (selectedMovies.find(m => m.id === movie.id)) {
      setSelectedMovies(prev => prev.filter(m => m.id !== movie.id));
    } else if (selectedMovies.length < 5) {
      setSelectedMovies(prev => [...prev, { id: movie.id, title: movie.title, poster_path: movie.poster_path }]);
    }
  };

  const handleMoviesDone = () => {
    if (selectedMovies.length > 0) {
      const movies = [...selectedMovies];
      setShowMoviePicker(false);
      setSelectedMovies([]);
      setMovieSearch('');
      setMovieResults([]);
      sendToTina(`My favorite movies: ${movies.map(m => m.title).join(', ')}`, undefined, undefined, movies);
    }
  };

  const handleExit = () => {
    sendToTina('bye');
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[styles.messageRow, item.isUser && styles.messageRowUser]}>
      {!item.isUser && <Image source={{ uri: TINA_AVATAR }} style={styles.msgAvatar} />}
      <View style={[styles.bubble, item.isUser ? styles.userBubble : styles.tinaBubble]}>
        <Text style={[styles.bubbleText, item.isUser && styles.userBubbleText]}>{item.text}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExit} style={styles.headerBtn}>
          <Ionicons name="close" size={24} color={COLORS.text} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Image source={{ uri: TINA_AVATAR }} style={styles.headerAvatar} />
          <View>
            <Text style={styles.headerName}>Tina</Text>
            <Text style={styles.headerSubtitle}>{isTyping ? 'typing...' : 'AI Assistant'}</Text>
          </View>
        </View>
        
        <View style={styles.progressPill}>
          <Text style={styles.progressText}>{completionPercentage}%</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${completionPercentage}%` }]} />
      </View>

      {/* Chat */}
      <KeyboardAvoidingView 
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={isTyping ? (
            <View style={styles.typingRow}>
              <Image source={{ uri: TINA_AVATAR }} style={styles.msgAvatar} />
              <View style={styles.typingBubble}>
                <View style={styles.dotsRow}>
                  <Animated.View style={[styles.dot, { opacity: typingDots }]} />
                  <Animated.View style={[styles.dot, { opacity: typingDots }]} />
                  <Animated.View style={[styles.dot, { opacity: typingDots }]} />
                </View>
              </View>
            </View>
          ) : null}
        />

        {/* Options chips */}
        {currentOptions && (
          <View style={styles.optionsArea}>
            <ScrollView 
              horizontal={!currentOptions.multiSelect} 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsContainer}
            >
              {currentOptions.options.map((opt, i) => {
                const isSelected = selectedOptions.includes(opt);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => handleOptionSelect(opt)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{opt}</Text>
                    {currentOptions.multiSelect && isSelected && (
                      <Ionicons name="checkmark" size={16} color="#FFF" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {currentOptions.multiSelect && selectedOptions.length > 0 && (
              <TouchableOpacity style={styles.doneBtn} onPress={handleMultiSelectDone}>
                <Text style={styles.doneBtnText}>Done ({selectedOptions.length})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={COLORS.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity 
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isTyping}
          >
            <Ionicons name="send" size={20} color={inputText.trim() ? '#FFF' : COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Movie Picker Modal */}
      <Modal visible={showMoviePicker} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowMoviePicker(false)}>
              <Ionicons name="close" size={28} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Pick Your Favorites</Text>
            <TouchableOpacity onPress={handleMoviesDone} disabled={selectedMovies.length === 0}>
              <Text style={[styles.modalDone, selectedMovies.length === 0 && styles.modalDoneDisabled]}>
                Done ({selectedMovies.length}/5)
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.movieSearchInput}
            placeholder="Search movies..."
            placeholderTextColor={COLORS.textMuted}
            value={movieSearch}
            onChangeText={(t) => { setMovieSearch(t); searchMovies(t); }}
          />

          {selectedMovies.length > 0 && (
            <ScrollView horizontal style={styles.selectedRow} showsHorizontalScrollIndicator={false}>
              {selectedMovies.map(m => (
                <TouchableOpacity key={m.id} style={styles.selectedChip} onPress={() => toggleMovie(m)}>
                  <Text style={styles.selectedChipText} numberOfLines={1}>{m.title}</Text>
                  <Ionicons name="close-circle" size={16} color={COLORS.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <FlatList
            data={movieResults}
            keyExtractor={item => item.id.toString()}
            numColumns={3}
            contentContainerStyle={styles.movieGrid}
            renderItem={({ item }) => {
              const selected = selectedMovies.find(m => m.id === item.id);
              return (
                <TouchableOpacity style={styles.movieCard} onPress={() => toggleMovie(item)}>
                  {item.poster_path ? (
                    <Image 
                      source={{ uri: `https://image.tmdb.org/t/p/w200${item.poster_path}` }}
                      style={styles.moviePoster}
                    />
                  ) : (
                    <View style={[styles.moviePoster, styles.moviePlaceholder]}>
                      <Ionicons name="film-outline" size={24} color={COLORS.textMuted} />
                    </View>
                  )}
                  <Text style={styles.movieTitle} numberOfLines={2}>{item.title}</Text>
                  {selected && (
                    <View style={styles.movieCheck}>
                      <Ionicons name="checkmark" size={14} color="#FFF" />
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
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: { padding: 8 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  headerName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  headerSubtitle: { fontSize: 12, color: COLORS.textSecondary },
  progressPill: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  progressText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  progressBarBg: { height: 3, backgroundColor: COLORS.border },
  progressBarFill: { height: '100%', backgroundColor: COLORS.primary },
  chatArea: { flex: 1 },
  messageList: { padding: SPACING.md, paddingBottom: 100 },
  messageRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  messageRowUser: { justifyContent: 'flex-end' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
  bubble: { maxWidth: '75%', padding: 12, borderRadius: 18 },
  tinaBubble: { backgroundColor: COLORS.bgCard, borderBottomLeftRadius: 4 },
  userBubble: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  userBubbleText: { color: '#FFF' },
  typingRow: { flexDirection: 'row', alignItems: 'flex-end' },
  typingBubble: { backgroundColor: COLORS.bgCard, padding: 12, borderRadius: 18, borderBottomLeftRadius: 4 },
  dotsRow: { flexDirection: 'row', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.textMuted },
  optionsArea: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    padding: SPACING.sm,
  },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.text },
  chipTextSelected: { color: '#FFF', fontWeight: '600' },
  doneBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  doneBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.text,
    maxHeight: 100,
    marginRight: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: COLORS.bgCard },
  // Modal
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalDone: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  modalDoneDisabled: { color: COLORS.textMuted },
  movieSearchInput: {
    backgroundColor: COLORS.bgCard,
    margin: SPACING.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 16,
    color: COLORS.text,
  },
  selectedRow: { paddingHorizontal: SPACING.md, marginBottom: 8 },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    maxWidth: 140,
  },
  selectedChipText: { fontSize: 13, color: COLORS.text, marginRight: 4, flex: 1 },
  movieGrid: { padding: 8 },
  movieCard: { width: (width - 48) / 3, padding: 4, position: 'relative' },
  moviePoster: { width: '100%', aspectRatio: 2/3, borderRadius: 8, backgroundColor: COLORS.bgCard },
  moviePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  movieTitle: { fontSize: 11, color: COLORS.text, marginTop: 4, textAlign: 'center' },
  movieCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
