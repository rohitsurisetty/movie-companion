import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  FlatList, ScrollView, Modal, Platform, ActivityIndicator, 
  Dimensions, Alert, Pressable, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { GiftedChat, Bubble, InputToolbar, Send, Composer, IMessage, MessageImage } from 'react-native-gifted-chat';
import { useAppMode } from '../../src/components/SharedHeader';
import { getUserId } from '../../src/store';
import { formatLocationForPrivacy } from '../../src/utils/locationFormatter';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
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

interface Conversation {
  conversation_id: string;
  other_user_id: string;
  other_user?: {
    user_id: string;
    name: string;
    avatar?: string;
    location?: string;
  };
  last_message?: string;
  last_message_at?: string;
  unread: number;
  status: string;
}

interface MessageRequest {
  conversation_id: string;
  from_user_id: string;
  from_user?: {
    user_id: string;
    name: string;
    avatar?: string;
    age?: number;
    location?: string;
    bio?: string;
    gender?: string;
    genres?: string[];
    topMovies?: { title: string }[];
  };
  preview: string;
  created_at: string;
}

// Full profile data for request viewing
interface FullUserProfile {
  user_id: string;
  name: string;
  age?: number;
  gender?: string;
  location?: any;
  bio?: string;
  genres?: string[];
  topMovies?: { title: string; poster?: string }[];
  pictures?: string[];
}

interface BackendMessage {
  message_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: string;
  created_at: string;
  read: boolean;
}

// ============ AVATAR COMPONENT ============
const Avatar = ({ name, size = 50, imageUrl }: { name: string; size?: number; imageUrl?: string }) => {
  if (imageUrl && imageUrl.startsWith('http')) {
    return (
      <Image 
        source={{ uri: imageUrl }} 
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  
  return (
    <LinearGradient 
      colors={[COLORS.primary, '#FF6B6B']} 
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>
        {name?.charAt(0).toUpperCase() || '?'}
      </Text>
    </LinearGradient>
  );
};

// ============ PROFILE BOTTOM SHEET ============
const ProfileBottomSheet = ({ 
  visible, 
  onClose, 
  userId, 
  userName 
}: { 
  visible: boolean; 
  onClose: () => void; 
  userId: string; 
  userName: string;
}) => {
  const [profile, setProfile] = useState<any>(null);
  const [pictures, setPictures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPicIndex, setCurrentPicIndex] = useState(0);

  useEffect(() => {
    if (visible && userId) {
      fetchProfileData();
    }
  }, [visible, userId]);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      // Fetch profile
      const profileRes = await fetch(`${API_BASE}/api/user/profile/${userId}`);
      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.profile);
      }

      // Fetch pictures
      const picsRes = await fetch(`${API_BASE}/api/user/pictures/${userId}`);
      if (picsRes.ok) {
        const data = await picsRes.json();
        const pics = data.pictures || {};
        const photoArray = [pics.picture_1, pics.picture_2, pics.picture_3, pics.picture_4, pics.picture_5]
          .filter(Boolean);
        setPictures(photoArray);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.profileModal}>
        {/* Header */}
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={onClose} style={styles.profileCloseBtn}>
            <Ionicons name="chevron-down" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.profileHeaderTitle}>Profile</Text>
          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <View style={styles.profileLoading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <ScrollView style={styles.profileContent} showsVerticalScrollIndicator={false}>
            {/* Photo Carousel */}
            <View style={styles.photoCarousel}>
              {pictures.length > 0 ? (
                <>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={(e) => {
                      const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                      setCurrentPicIndex(index);
                    }}
                    scrollEventThrottle={16}
                  >
                    {pictures.map((pic, index) => (
                      <Image
                        key={index}
                        source={{ uri: pic }}
                        style={styles.profilePhoto}
                        resizeMode="cover"
                      />
                    ))}
                  </ScrollView>
                  {pictures.length > 1 && (
                    <View style={styles.photoIndicators}>
                      {pictures.map((_, index) => (
                        <View
                          key={index}
                          style={[
                            styles.photoIndicator,
                            currentPicIndex === index && styles.photoIndicatorActive,
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.noPhotoPlaceholder}>
                  <Avatar name={userName} size={120} />
                </View>
              )}
            </View>

            {/* Profile Info */}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {profile?.name || userName}{profile?.age ? `, ${profile.age}` : ''}
              </Text>
              
              {profile?.location && (
                <View style={styles.profileLocationRow}>
                  <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.profileLocation}>{formatLocationForPrivacy(profile.location)}</Text>
                </View>
              )}

              {profile?.workProfile && (
                <View style={styles.profileLocationRow}>
                  <Ionicons name="briefcase-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.profileLocation}>{profile.workProfile}</Text>
                </View>
              )}

              {profile?.bio && (
                <Text style={styles.profileBio}>{profile.bio}</Text>
              )}

              {/* Genres */}
              {profile?.genres && profile.genres.length > 0 && (
                <View style={styles.profileSection}>
                  <Text style={styles.profileSectionTitle}>Movie Taste</Text>
                  <View style={styles.tagsContainer}>
                    {profile.genres.map((genre: string, idx: number) => (
                      <View key={idx} style={styles.tag}>
                        <Text style={styles.tagText}>{genre}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Top Movies */}
              {Array.isArray(profile?.topMovies) && profile.topMovies.length > 0 && (
                <View style={styles.profileSection}>
                  <Text style={styles.profileSectionTitle}>Favorite Movies</Text>
                  {profile.topMovies.slice(0, 5).map((movie: any, idx: number) => (
                    <View key={idx} style={styles.movieItem}>
                      <Ionicons name="film-outline" size={18} color={COLORS.primary} />
                      <Text style={styles.movieTitle}>{movie.title}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

// ============ MESSAGE REQUEST DETAIL VIEW ============
const MessageRequestDetailView = ({
  visible,
  request,
  onAccept,
  onDecline,
  onClose,
}: {
  visible: boolean;
  request: MessageRequest | null;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}) => {
  const [profile, setProfile] = useState<FullUserProfile | null>(null);
  const [pictures, setPictures] = useState<string[]>([]);
  const [messages, setMessages] = useState<BackendMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPicIndex, setCurrentPicIndex] = useState(0);
  const [activeView, setActiveView] = useState<'messages' | 'profile'>('messages');

  useEffect(() => {
    if (visible && request) {
      setActiveView('messages'); // Reset to messages tab
      setCurrentPicIndex(0);
      fetchRequestData();
    }
  }, [visible, request]);

  const fetchRequestData = async () => {
    if (!request) return;
    setLoading(true);
    try {
      // Fetch messages for this conversation
      const messagesRes = await fetch(`${API_BASE}/api/chat/messages/${request.conversation_id}`);
      if (messagesRes.ok) {
        const data = await messagesRes.json();
        setMessages(data.messages || []);
      }

      // Fetch sender's profile
      const profileRes = await fetch(`${API_BASE}/api/user/profile/${request.from_user_id}`);
      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.profile);
      }

      // Fetch sender's pictures
      const picsRes = await fetch(`${API_BASE}/api/user/pictures/${request.from_user_id}`);
      if (picsRes.ok) {
        const data = await picsRes.json();
        const pics = data.pictures || {};
        const photoArray = [pics.picture_1, pics.picture_2, pics.picture_3, pics.picture_4, pics.picture_5]
          .filter(Boolean);
        setPictures(photoArray);
      }
    } catch (error) {
      console.error('Error fetching request data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const today = new Date();
      if (date.toDateString() === today.toDateString()) {
        return 'Today';
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  if (!request) return null;

  const user = request.from_user;
  const displayName = profile?.name || user?.name || 'Someone';
  const displayAge = profile?.age || user?.age;
  const displayLocation = profile?.location 
    ? (typeof profile.location === 'object' 
        ? `${profile.location.city || ''}, ${profile.location.state || ''}`.replace(/^, |, $/g, '')
        : profile.location)
    : (user?.location || '');
  const displayAvatar = pictures[0] || user?.avatar;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.requestDetailContainer}>
        {/* Header */}
        <View style={styles.requestDetailHeader}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.requestDetailTitle}>Message Request</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Tab Switcher */}
        <View style={styles.requestDetailTabs}>
          <TouchableOpacity 
            style={[styles.requestDetailTab, activeView === 'messages' && styles.requestDetailTabActive]}
            onPress={() => setActiveView('messages')}
          >
            <Ionicons name="chatbubbles-outline" size={18} color={activeView === 'messages' ? COLORS.primary : COLORS.textSecondary} />
            <Text style={[styles.requestDetailTabText, activeView === 'messages' && styles.requestDetailTabTextActive]}>Messages</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.requestDetailTab, activeView === 'profile' && styles.requestDetailTabActive]}
            onPress={() => setActiveView('profile')}
          >
            <Ionicons name="person-outline" size={18} color={activeView === 'profile' ? COLORS.primary : COLORS.textSecondary} />
            <Text style={[styles.requestDetailTabText, activeView === 'profile' && styles.requestDetailTabTextActive]}>Profile</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            {activeView === 'messages' ? (
              /* Messages View */
              <ScrollView 
                style={styles.requestMessagesContainer} 
                contentContainerStyle={styles.requestMessagesContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Sender Card */}
                <View style={styles.requestSenderCard}>
                  <View style={styles.requestSenderAvatarContainer}>
                    {displayAvatar ? (
                      <Image source={{ uri: displayAvatar }} style={styles.requestSenderAvatar} />
                    ) : (
                      <View style={styles.requestSenderAvatarPlaceholder}>
                        <Text style={styles.requestSenderAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.requestSenderCardName}>{displayName}{displayAge ? `, ${displayAge}` : ''}</Text>
                  {displayLocation ? (
                    <View style={styles.requestSenderCardLocation}>
                      <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
                      <Text style={styles.requestSenderCardLocationText}>{displayLocation}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity 
                    style={styles.viewFullProfileBtn}
                    onPress={() => setActiveView('profile')}
                  >
                    <Text style={styles.viewFullProfileBtnText}>View Full Profile</Text>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>

                {/* Messages Section Title */}
                <View style={styles.messagesSectionHeader}>
                  <View style={styles.messagesSectionLine} />
                  <Text style={styles.messagesSectionTitle}>Messages</Text>
                  <View style={styles.messagesSectionLine} />
                </View>

                {/* Messages */}
                <View style={styles.requestMessagesList}>
                  {messages.length > 0 ? (
                    messages.map((msg, idx) => (
                      <View key={msg.message_id || idx} style={styles.requestMessageItem}>
                        <View style={styles.requestMessageBubble}>
                          <Text style={styles.requestMessageText}>{msg.content}</Text>
                          <Text style={styles.requestMessageTime}>
                            {formatDate(msg.created_at)} • {formatTime(msg.created_at)}
                          </Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.noMessagesContainer}>
                      <Ionicons name="chatbubble-ellipses-outline" size={48} color={COLORS.textMuted} />
                      <Text style={styles.noMessagesText}>No messages yet</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            ) : (
              /* Profile View */
              <ScrollView 
                style={styles.requestProfileContainer} 
                contentContainerStyle={styles.requestProfileContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Photos Section */}
                {pictures.length > 0 ? (
                  <View style={styles.requestPhotoSection}>
                    <Image 
                      source={{ uri: pictures[currentPicIndex] }} 
                      style={styles.requestMainPhoto}
                      resizeMode="cover"
                    />
                    {pictures.length > 1 && (
                      <>
                        <View style={styles.requestPhotoIndicators}>
                          {pictures.map((_, idx) => (
                            <TouchableOpacity 
                              key={idx} 
                              style={[styles.requestPhotoIndicator, idx === currentPicIndex && styles.requestPhotoIndicatorActive]}
                              onPress={() => setCurrentPicIndex(idx)}
                            />
                          ))}
                        </View>
                        <View style={styles.requestPhotoNav}>
                          <TouchableOpacity 
                            style={[styles.requestPhotoNavBtn, currentPicIndex === 0 && styles.requestPhotoNavBtnDisabled]} 
                            onPress={() => setCurrentPicIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentPicIndex === 0}
                          >
                            <Ionicons name="chevron-back" size={24} color="#FFF" />
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[styles.requestPhotoNavBtn, currentPicIndex === pictures.length - 1 && styles.requestPhotoNavBtnDisabled]} 
                            onPress={() => setCurrentPicIndex(prev => Math.min(pictures.length - 1, prev + 1))}
                            disabled={currentPicIndex === pictures.length - 1}
                          >
                            <Ionicons name="chevron-forward" size={24} color="#FFF" />
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                    {/* Gradient overlay for name */}
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.8)']}
                      style={styles.requestPhotoGradient}
                    >
                      <Text style={styles.requestPhotoName}>{displayName}{displayAge ? `, ${displayAge}` : ''}</Text>
                      {displayLocation ? (
                        <View style={styles.requestPhotoLocation}>
                          <Ionicons name="location" size={14} color="#FFF" />
                          <Text style={styles.requestPhotoLocationText}>{displayLocation}</Text>
                        </View>
                      ) : null}
                    </LinearGradient>
                  </View>
                ) : (
                  /* No Photos - Show Avatar Placeholder */
                  <View style={styles.requestNoPhotoSection}>
                    <View style={styles.requestNoPhotoAvatar}>
                      <Text style={styles.requestNoPhotoAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.requestNoPhotoName}>{displayName}{displayAge ? `, ${displayAge}` : ''}</Text>
                    {displayLocation ? (
                      <View style={styles.requestNoPhotoLocation}>
                        <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
                        <Text style={styles.requestNoPhotoLocationText}>{displayLocation}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                {/* Profile Details */}
                <View style={styles.requestProfileDetails}>
                  {/* Gender */}
                  {profile?.gender && (
                    <View style={styles.requestProfileDetailItem}>
                      <View style={styles.requestProfileDetailIcon}>
                        <Ionicons name="person" size={18} color={COLORS.primary} />
                      </View>
                      <View>
                        <Text style={styles.requestProfileDetailLabel}>Gender</Text>
                        <Text style={styles.requestProfileDetailValue}>{profile.gender}</Text>
                      </View>
                    </View>
                  )}

                  {/* Bio */}
                  {profile?.bio && (
                    <View style={styles.requestProfileBioSection}>
                      <Text style={styles.requestProfileSectionTitle}>About</Text>
                      <Text style={styles.requestProfileBioText}>{profile.bio}</Text>
                    </View>
                  )}

                  {/* Genres */}
                  {Array.isArray(profile?.genres) && profile.genres.length > 0 && (
                    <View style={styles.requestProfileTagsSection}>
                      <Text style={styles.requestProfileSectionTitle}>Favorite Genres</Text>
                      <View style={styles.requestProfileTags}>
                        {profile.genres.map((genre: string, idx: number) => (
                          <View key={idx} style={styles.requestProfileTag}>
                            <Text style={styles.requestProfileTagText}>{genre}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Top Movies */}
                  {Array.isArray(profile?.topMovies) && profile.topMovies.length > 0 && (
                    <View style={styles.requestProfileMoviesSection}>
                      <Text style={styles.requestProfileSectionTitle}>Top Movies</Text>
                      {profile.topMovies.slice(0, 5).map((movie: any, idx: number) => (
                        <View key={idx} style={styles.requestProfileMovieItem}>
                          <View style={styles.requestProfileMovieNumber}>
                            <Text style={styles.requestProfileMovieNumberText}>{idx + 1}</Text>
                          </View>
                          <Text style={styles.requestProfileMovieTitle}>{movie.title}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </ScrollView>
            )}

            {/* Action Buttons - Fixed at Bottom */}
            <View style={styles.requestDetailActions}>
              <TouchableOpacity style={styles.requestDeclineBtn} onPress={() => { onDecline(); onClose(); }}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                <Text style={styles.requestDeclineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.requestAcceptBtn} onPress={() => { onAccept(); onClose(); }}>
                <Ionicons name="checkmark" size={22} color="#FFF" />
                <Text style={styles.requestAcceptBtnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
};

// ============ "DID YOU MEET?" MODAL ============
const DidYouMeetModal = ({
  visible,
  onClose,
  otherUserName,
  conversationId,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  otherUserName: string;
  conversationId: string;
  userId: string;
}) => {
  const [step, setStep] = useState<'initial' | 'verification'>('initial');
  const [didMeet, setDidMeet] = useState<boolean | null>(null);

  const handleInitialResponse = async (met: boolean) => {
    setDidMeet(met);
    if (met) {
      setStep('verification');
    } else {
      // Save "didn't meet" response
      await saveMeetingResponse(false, null);
      Alert.alert('Got it!', 'Thanks for letting us know. Hope you get to meet soon!');
      resetAndClose();
    }
  };

  const handleVerificationResponse = async (samePerson: 'yes' | 'no' | 'partially') => {
    await saveMeetingResponse(true, samePerson);
    
    if (samePerson === 'yes') {
      Alert.alert('Great! 🎉', 'Glad you had a good experience meeting in person!');
    } else if (samePerson === 'no') {
      Alert.alert('Thanks for reporting', 'This helps us keep the community safe. You can report this user if needed.');
    } else {
      Alert.alert('Thanks!', 'We appreciate your feedback.');
    }
    resetAndClose();
  };

  const saveMeetingResponse = async (met: boolean, verification: string | null) => {
    try {
      await fetch(`${API_BASE}/api/chat/meeting-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          user_id: userId,
          did_meet: met,
          verification_result: verification,
          reported_at: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Error saving meeting response:', error);
    }
  };

  const resetAndClose = () => {
    setStep('initial');
    setDidMeet(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={resetAndClose}>
      <Pressable style={styles.meetModalOverlay} onPress={resetAndClose}>
        <View style={styles.meetModalContainer}>
          {step === 'initial' ? (
            <>
              <View style={styles.meetModalIcon}>
                <Ionicons name="cafe" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.meetModalTitle}>Did you meet {otherUserName}?</Text>
              <Text style={styles.meetModalSubtitle}>This helps us improve safety and trust</Text>
              
              <View style={styles.meetModalActions}>
                <TouchableOpacity 
                  style={styles.meetModalBtn} 
                  onPress={() => handleInitialResponse(false)}
                >
                  <Ionicons name="close-circle-outline" size={24} color={COLORS.textSecondary} />
                  <Text style={styles.meetModalBtnText}>Not Yet</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.meetModalBtn, styles.meetModalBtnPrimary]} 
                  onPress={() => handleInitialResponse(true)}
                >
                  <Ionicons name="checkmark-circle-outline" size={24} color="#FFF" />
                  <Text style={[styles.meetModalBtnText, { color: '#FFF' }]}>Yes!</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.meetModalIcon}>
                <Ionicons name="shield-checkmark" size={40} color={COLORS.success} />
              </View>
              <Text style={styles.meetModalTitle}>Was it the same person?</Text>
              <Text style={styles.meetModalSubtitle}>Did they match their profile photos?</Text>
              
              <View style={styles.meetVerificationOptions}>
                <TouchableOpacity 
                  style={styles.meetVerificationBtn} 
                  onPress={() => handleVerificationResponse('yes')}
                >
                  <Ionicons name="checkmark-circle" size={28} color={COLORS.success} />
                  <Text style={styles.meetVerificationBtnText}>Yes, same person</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.meetVerificationBtn} 
                  onPress={() => handleVerificationResponse('partially')}
                >
                  <Ionicons name="help-circle" size={28} color={COLORS.warning} />
                  <Text style={styles.meetVerificationBtnText}>Partially different</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.meetVerificationBtn} 
                  onPress={() => handleVerificationResponse('no')}
                >
                  <Ionicons name="close-circle" size={28} color={COLORS.primary} />
                  <Text style={styles.meetVerificationBtnText}>No, different person</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
};

// ============ COMING SOON MODAL ============
const ComingSoonModal = ({
  visible,
  onClose,
  featureName,
}: {
  visible: boolean;
  onClose: () => void;
  featureName: string;
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.comingSoonOverlay} onPress={onClose}>
      <View style={styles.comingSoonContainer}>
        <View style={styles.comingSoonIcon}>
          <Text style={styles.comingSoonEmoji}>🚀</Text>
        </View>
        <Text style={styles.comingSoonTitle}>Coming Soon</Text>
        <Text style={styles.comingSoonText}>
          {featureName} is currently under development and will be available in a future update.
        </Text>
        <TouchableOpacity style={styles.comingSoonBtn} onPress={onClose}>
          <Text style={styles.comingSoonBtnText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </Pressable>
  </Modal>
);

// ============ UNMATCH REASONS ============
const UNMATCH_REASONS = [
  { id: 'not_interesting', label: 'Conversation not interesting', icon: 'chatbubble-ellipses-outline' },
  { id: 'not_my_type', label: 'Not my type', icon: 'heart-dislike-outline' },
  { id: 'different_expectations', label: 'Different expectations', icon: 'git-compare-outline' },
  { id: 'found_someone', label: 'Found someone else', icon: 'people-outline' },
  { id: 'not_active', label: 'Not active enough', icon: 'time-outline' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

// ============ REPORT REASONS ============
const REPORT_REASONS = [
  { id: 'fake_profile', label: 'Fake profile', icon: 'person-remove-outline' },
  { id: 'spam_scam', label: 'Spam or scam', icon: 'warning-outline' },
  { id: 'harassment', label: 'Harassment', icon: 'hand-left-outline' },
  { id: 'sexual_content', label: 'Sexual content', icon: 'eye-off-outline' },
  { id: 'inappropriate', label: 'Inappropriate behaviour', icon: 'alert-circle-outline' },
  { id: 'hate_speech', label: 'Hate speech', icon: 'megaphone-outline' },
  { id: 'underage', label: 'Underage user', icon: 'shield-outline' },
  { id: 'safety_concern', label: 'Safety concern', icon: 'fitness-outline' },
  { id: 'offline_misconduct', label: 'Offline misconduct', icon: 'location-outline' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

// ============ PROFESSIONAL UNMATCH MODAL ============
const UnmatchModal = ({
  visible,
  onClose,
  userName,
  onUnmatch,
  onTransitionToReport,
}: {
  visible: boolean;
  onClose: () => void;
  userName: string;
  onUnmatch: (reason: string) => Promise<void>;
  onTransitionToReport: () => void;
}) => {
  const [step, setStep] = useState<'reason' | 'confirm_report'>('reason');
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

  const handleReasonSelect = (reasonId: string) => {
    setSelectedReason(reasonId);
    setStep('confirm_report');
  };

  const handleConfirmUnmatch = async (shouldReport: boolean) => {
    if (shouldReport) {
      onClose();
      onTransitionToReport();
    } else {
      setIsSubmitting(true);
      await onUnmatch(selectedReason || 'other');
      setIsSubmitting(false);
      setStep('reason');
      setSelectedReason(null);
      onClose();
    }
  };

  const handleClose = () => {
    setStep('reason');
    setSelectedReason(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.unmatchModalOverlay}>
        <View style={[styles.unmatchModalContainer, { paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <View style={styles.unmatchModalHeader}>
            <TouchableOpacity onPress={handleClose} style={styles.unmatchModalClose}>
              <Ionicons name="close" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {step === 'reason' ? (
            <>
              {/* Step 1: Reason Selection */}
              <View style={styles.unmatchModalIconContainer}>
                <View style={styles.unmatchModalIconBg}>
                  <Ionicons name="heart-dislike" size={32} color={COLORS.warning} />
                </View>
              </View>
              <Text style={styles.unmatchModalTitle}>Unmatch {userName}</Text>
              <Text style={styles.unmatchModalSubtitle}>
                {"We'd love to understand why. This helps us improve your experience."}
              </Text>

              <ScrollView style={styles.unmatchReasonsList} showsVerticalScrollIndicator={false}>
                {UNMATCH_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason.id}
                    style={styles.unmatchReasonItem}
                    onPress={() => handleReasonSelect(reason.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={reason.icon as any} size={22} color={COLORS.textSecondary} />
                    <Text style={styles.unmatchReasonText}>{reason.label}</Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              {/* Step 2: Confirm Report */}
              <View style={styles.unmatchModalIconContainer}>
                <View style={[styles.unmatchModalIconBg, { backgroundColor: 'rgba(255, 184, 0, 0.15)' }]}>
                  <Ionicons name="help-circle" size={32} color={COLORS.warning} />
                </View>
              </View>
              <Text style={styles.unmatchModalTitle}>One more thing...</Text>
              <Text style={styles.unmatchModalSubtitle}>
                Do you think this user should be reported for violating our community guidelines?
              </Text>

              <View style={styles.unmatchConfirmActions}>
                <TouchableOpacity
                  style={[styles.unmatchConfirmBtn, styles.unmatchConfirmBtnNo]}
                  onPress={() => handleConfirmUnmatch(false)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={COLORS.text} />
                  ) : (
                    <>
                      <Ionicons name="close-circle-outline" size={22} color={COLORS.text} />
                      <Text style={styles.unmatchConfirmBtnText}>No, just unmatch</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unmatchConfirmBtn, styles.unmatchConfirmBtnYes]}
                  onPress={() => handleConfirmUnmatch(true)}
                >
                  <Ionicons name="flag-outline" size={22} color="#FFF" />
                  <Text style={[styles.unmatchConfirmBtnText, { color: '#FFF' }]}>Yes, report them</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => setStep('reason')} style={styles.unmatchBackBtn}>
                <Ionicons name="arrow-back" size={18} color={COLORS.textMuted} />
                <Text style={styles.unmatchBackBtnText}>Back</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ============ PROFESSIONAL REPORT MODAL (Bumble-inspired) ============
const ReportModal = ({
  visible,
  onClose,
  userName,
  onReport,
  onUnmatchInstead,
}: {
  visible: boolean;
  onClose: () => void;
  userName: string;
  onReport: (reason: string, details?: string) => Promise<void>;
  onUnmatchInstead: () => void;
}) => {
  const [step, setStep] = useState<'intro' | 'reasons' | 'details' | 'confirmation'>('intro');
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

  const handleStartReport = () => {
    setStep('reasons');
  };

  const handleReasonSelect = (reasonId: string) => {
    setSelectedReason(reasonId);
    setStep('details');
  };

  const handleSubmitReport = async () => {
    setIsSubmitting(true);
    await onReport(selectedReason || 'other', additionalDetails || undefined);
    setIsSubmitting(false);
    setStep('confirmation');
  };

  const handleClose = () => {
    setStep('intro');
    setSelectedReason(null);
    setAdditionalDetails('');
    onClose();
  };

  const handleUnmatchInstead = () => {
    handleClose();
    onUnmatchInstead();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.reportModalOverlay}>
        <View style={[styles.reportModalContainer, { paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <View style={styles.reportModalHeader}>
            <TouchableOpacity onPress={handleClose} style={styles.reportModalClose}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {step === 'intro' && (
            <>
              {/* Intro Step - Bumble-inspired */}
              <Text style={styles.reportModalTitle}>Report {userName}</Text>
              <Text style={styles.reportModalIntroText}>
                {"Let us know when someone's broken our guidelines. They won't know that you've reported them, or why."}
              </Text>

              <View style={styles.reportStepsContainer}>
                <View style={styles.reportStep}>
                  <View style={styles.reportStepNumber}><Text style={styles.reportStepNumberText}>1</Text></View>
                  <Text style={styles.reportStepText}>Let us know what happened</Text>
                </View>
                <View style={styles.reportStep}>
                  <View style={styles.reportStepNumber}><Text style={styles.reportStepNumberText}>2</Text></View>
                  <Text style={styles.reportStepText}>{"We'll investigate your report"}</Text>
                </View>
                <View style={styles.reportStep}>
                  <View style={styles.reportStepNumber}><Text style={styles.reportStepNumberText}>3</Text></View>
                  <Text style={styles.reportStepText}>{"We'll keep you updated"}</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.reportUnmatchOption} onPress={handleUnmatchInstead}>
                <Ionicons name="heart-dislike-outline" size={22} color={COLORS.textSecondary} />
                <View style={styles.reportUnmatchOptionText}>
                  <Text style={styles.reportUnmatchOptionTitle}>{"Don't think they've broken our guidelines?"}</Text>
                  <Text style={styles.reportUnmatchOptionSubtitle}>Unmatch instead</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.reportStartBtn} onPress={handleStartReport}>
                <Text style={styles.reportStartBtnText}>Start report</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.reportUnmatchBtn} onPress={handleUnmatchInstead}>
                <Text style={styles.reportUnmatchBtnText}>Unmatch instead</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'reasons' && (
            <>
              {/* Reasons Step */}
              <Text style={styles.reportModalTitle}>Report</Text>
              <Text style={styles.reportModalSubtitle}>
                {"Don't worry, your feedback is anonymous and they won't know that you've blocked or reported them."}
              </Text>

              <ScrollView style={styles.reportReasonsList} showsVerticalScrollIndicator={false}>
                {REPORT_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason.id}
                    style={styles.reportReasonItem}
                    onPress={() => handleReasonSelect(reason.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.reportReasonText}>{reason.label}</Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity onPress={() => setStep('intro')} style={styles.reportBackBtn}>
                <Ionicons name="arrow-back" size={18} color={COLORS.textMuted} />
                <Text style={styles.reportBackBtnText}>Back</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'details' && (
            <>
              {/* Details Step */}
              <Text style={styles.reportModalTitle}>Tell us more</Text>
              <Text style={styles.reportModalSubtitle}>
                Provide any additional details that might help us investigate. (Optional)
              </Text>

              <TextInput
                style={styles.reportDetailsInput}
                placeholder="What happened? Share any relevant details..."
                placeholderTextColor={COLORS.textMuted}
                value={additionalDetails}
                onChangeText={setAdditionalDetails}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
              <Text style={styles.reportDetailsCount}>{additionalDetails.length}/500</Text>

              <TouchableOpacity 
                style={styles.reportSubmitBtn} 
                onPress={handleSubmitReport}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.reportSubmitBtnText}>Submit Report</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setStep('reasons')} style={styles.reportBackBtn}>
                <Ionicons name="arrow-back" size={18} color={COLORS.textMuted} />
                <Text style={styles.reportBackBtnText}>Back</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'confirmation' && (
            <>
              {/* Confirmation Step */}
              <View style={styles.reportConfirmationIcon}>
                <Ionicons name="shield-checkmark" size={48} color={COLORS.success} />
              </View>
              <Text style={styles.reportModalTitle}>Thank you</Text>
              <Text style={styles.reportConfirmationText}>
                Our trust and safety team will review this report. We take every report seriously and will take appropriate action.
              </Text>

              <TouchableOpacity style={styles.reportDoneBtn} onPress={handleClose}>
                <Text style={styles.reportDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ============ MESSAGE REQUEST CARD ============
const MessageRequestCard = ({ 
  request, 
  onPress,
  onAccept, 
  onDecline 
}: { 
  request: MessageRequest; 
  onPress: () => void;
  onAccept: () => void; 
  onDecline: () => void;
}) => {
  const user = request.from_user;
  
  return (
    <TouchableOpacity style={styles.requestCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.requestHeader}>
        <Avatar name={user?.name || 'U'} size={60} imageUrl={user?.avatar} />
        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{user?.name || 'Unknown'}{user?.age ? `, ${user.age}` : ''}</Text>
          <Text style={styles.requestLocation}>{user?.location || 'Unknown location'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </View>
      <Text style={styles.requestPreview} numberOfLines={2}>&quot;{request.preview}&quot;</Text>
      <View style={styles.requestActions}>
        <TouchableOpacity style={styles.declineBtn} onPress={(e) => { e.stopPropagation(); onDecline(); }}>
          <Ionicons name="close" size={20} color={COLORS.textSecondary} />
          <Text style={styles.declineBtnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.acceptBtn} onPress={(e) => { e.stopPropagation(); onAccept(); }}>
          <Ionicons name="checkmark" size={20} color="#FFF" />
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.requestHint}>Tap to view full conversation & profile</Text>
    </TouchableOpacity>
  );
};

// ============ CONVERSATION LIST ITEM ============
const ConversationItem = ({ 
  conversation, 
  onPress 
}: { 
  conversation: Conversation & { is_pending?: boolean }; 
  onPress: () => void;
}) => {
  const user = conversation.other_user;
  const hasUnread = conversation.unread > 0;
  const isPending = conversation.is_pending || conversation.status === 'pending';
  
  return (
    <TouchableOpacity style={styles.conversationItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.conversationAvatar}>
        <Avatar name={user?.name || 'U'} size={56} imageUrl={user?.avatar} />
        {!isPending && <View style={styles.onlineDot} />}
      </View>
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <View style={styles.conversationNameRow}>
            <Text style={[styles.conversationName, hasUnread && styles.unreadName]} numberOfLines={1}>
              {user?.name || 'Unknown'}
            </Text>
            {isPending && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>Pending</Text>
              </View>
            )}
          </View>
          <Text style={styles.conversationTime}>{formatTime(conversation.last_message_at)}</Text>
        </View>
        <Text style={[styles.conversationPreview, hasUnread && styles.unreadPreview, isPending && styles.pendingPreview]} numberOfLines={1}>
          {isPending ? `You: ${conversation.last_message || 'Message sent'}` : (conversation.last_message || 'Start a conversation')}
        </Text>
      </View>
      {hasUnread ? (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{conversation.unread}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

// ============ GIFTED CHAT SCREEN ============
const GiftedChatScreen = ({ 
  conversation, 
  userId,
  onBack,
}: {
  conversation: Conversation;
  userId: string;
  onBack: () => void;
}) => {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showDidYouMeet, setShowDidYouMeet] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] = useState('');
  
  // New modal states for redesigned flows
  const [showUnmatchModal, setShowUnmatchModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  
  const otherUser = conversation.other_user;
  const otherUserId = conversation.other_user_id;

  const showComingSoonModal = (feature: string) => {
    setComingSoonFeature(feature);
    setShowComingSoon(true);
  };

  // Convert backend messages to GiftedChat format
  const convertToGiftedMessages = (backendMessages: BackendMessage[]): IMessage[] => {
    return backendMessages.map((msg) => ({
      _id: msg.message_id,
      text: msg.content,
      createdAt: new Date(msg.created_at),
      user: {
        _id: msg.sender_id,
        name: msg.sender_id === userId ? 'You' : otherUser?.name || 'Unknown',
        avatar: msg.sender_id === userId ? undefined : otherUser?.avatar,
      },
    }));
  };

  // Fetch messages
  useEffect(() => {
    fetchMessages();
  }, [conversation.conversation_id]);

  // Check if suggestions should show
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[0]; // GiftedChat messages are sorted newest first
      const otherPersonSentLast = lastMessage.user._id !== userId;
      setShowSuggestions(otherPersonSentLast && suggestions.length > 0);
    }
  }, [messages, suggestions, userId]);

  const fetchMessages = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/messages/${conversation.conversation_id}`);
      if (response.ok) {
        const data = await response.json();
        const giftedMessages = convertToGiftedMessages(data.messages || []);
        setMessages(giftedMessages);
        
        // Mark as read
        await fetch(`${API_BASE}/api/chat/read/${conversation.conversation_id}?user_id=${userId}`, { method: 'POST' });
        
        // Fetch suggestions if there are messages
        if (data.messages && data.messages.length > 0) {
          fetchSuggestions();
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/reply-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          conversation_id: conversation.conversation_id,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };

  const onSend = useCallback(async (newMessages: IMessage[] = []) => {
    const messageText = newMessages[0]?.text;
    if (!messageText?.trim()) return;

    // Optimistically add message
    setMessages(previousMessages => GiftedChat.append(previousMessages, newMessages));
    
    // Hide suggestions after sending
    setShowSuggestions(false);
    setSuggestions([]);

    try {
      await fetch(`${API_BASE}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: userId,
          receiver_id: otherUserId,
          content: messageText.trim(),
          message_type: 'text',
        }),
      });

      // Show typing indicator and wait for AI reply
      setIsTyping(true);
      
      // Poll for new messages after AI reply (4 seconds)
      setTimeout(async () => {
        setIsTyping(false);
        await fetchMessages();
      }, 4000);
      
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }, [userId, otherUserId, conversation.conversation_id]);

  const handleSuggestionPress = (suggestion: string) => {
    const newMessage: IMessage = {
      _id: `temp_${Date.now()}`,
      text: suggestion,
      createdAt: new Date(),
      user: { _id: userId, name: 'You' },
    };
    onSend([newMessage]);
  };

  // New Unmatch handler with modal
  const handleUnmatchWithReason = async (reason: string) => {
    try {
      await fetch(`${API_BASE}/api/chat/unmatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: userId, 
          other_user_id: otherUserId,
          reason: reason 
        }),
      });
      onBack();
    } catch (error) {
      console.error('Error unmatching:', error);
    }
  };

  // New Report handler with details
  const handleReportWithDetails = async (reason: string, details?: string) => {
    try {
      await fetch(`${API_BASE}/api/chat/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reporter_id: userId, 
          reported_id: otherUserId, 
          reason,
          details: details || null
        }),
      });
      // After reporting, also unmatch
      await fetch(`${API_BASE}/api/chat/unmatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: userId, 
          other_user_id: otherUserId,
          reason: 'reported' 
        }),
      });
    } catch (error) {
      console.error('Error reporting:', error);
    }
  };

  // Custom bubble
  const renderBubble = (props: any) => (
    <Bubble
      {...props}
      wrapperStyle={{
        right: { backgroundColor: COLORS.primary, marginRight: 8 },
        left: { backgroundColor: COLORS.bgCard, marginLeft: 8 },
      }}
      textStyle={{
        right: { color: '#FFF' },
        left: { color: COLORS.text },
      }}
      timeTextStyle={{
        right: { color: 'rgba(255,255,255,0.6)' },
        left: { color: COLORS.textMuted },
      }}
    />
  );

  // Custom input toolbar
  const renderInputToolbar = (props: any) => (
    <InputToolbar
      {...props}
      containerStyle={styles.inputToolbar}
      primaryStyle={styles.inputPrimary}
    />
  );

  // Custom composer
  const renderComposer = (props: any) => (
    <Composer
      {...props}
      textInputStyle={styles.composerInput}
      placeholderTextColor={COLORS.textMuted}
      placeholder="Type a message..."
    />
  );

  // Custom send button
  const renderSend = (props: any) => (
    <Send {...props} containerStyle={styles.sendContainer}>
      <View style={styles.sendButton}>
        <Ionicons name="send" size={20} color="#FFF" />
      </View>
    </Send>
  );

  // Custom avatar
  const renderAvatar = (props: any) => {
    const user = props.currentMessage?.user;
    if (user?._id === userId) return null;
    
    return (
      <TouchableOpacity onPress={() => setShowProfile(true)}>
        <Avatar name={user?.name || 'U'} size={36} imageUrl={user?.avatar} />
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.chatContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Chat Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.chatHeaderProfile} onPress={() => setShowProfile(true)}>
          <Avatar name={otherUser?.name || 'U'} size={40} imageUrl={otherUser?.avatar} />
          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatHeaderName}>{otherUser?.name || 'Unknown'}</Text>
            <Text style={styles.chatHeaderStatus}>
              {isTyping ? 'typing...' : 'Online'}
            </Text>
          </View>
        </TouchableOpacity>
        
        <View style={styles.chatHeaderActions}>
          <TouchableOpacity style={styles.headerActionBtn} onPress={() => showComingSoonModal('Voice Calls')}>
            <Ionicons name="call-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionBtn} onPress={() => showComingSoonModal('Video Calls')}>
            <Ionicons name="videocam-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionBtn} onPress={() => setShowMenu(true)}>
            <Ionicons name="ellipsis-vertical" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* GiftedChat */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <GiftedChat
          messages={messages}
          onSend={onSend}
          user={{ _id: userId, name: 'You' }}
          renderBubble={renderBubble}
          renderInputToolbar={renderInputToolbar}
          renderComposer={renderComposer}
          renderSend={renderSend}
          renderAvatar={renderAvatar}
          renderAccessory={showSuggestions && suggestions.length > 0 ? () => (
            <View style={styles.suggestionsBarBottom}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={styles.suggestionsContent}
                keyboardShouldPersistTaps="handled"
              >
                {suggestions.map((suggestion, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={styles.suggestionChip}
                    onPress={() => handleSuggestionPress(suggestion)}
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : undefined}
          alwaysShowSend
          scrollToBottom
          isTyping={isTyping}
          infiniteScroll
          inverted={true}
          renderUsernameOnMessage={false}
          showUserAvatar={false}
          showAvatarForEveryMessage={false}
          renderAvatarOnTop
          messagesContainerStyle={styles.messagesContainer}
          bottomOffset={Platform.OS === 'ios' ? 34 : 0}
          minInputToolbarHeight={56}
          listViewProps={{
            style: { backgroundColor: COLORS.bg },
            keyboardDismissMode: 'interactive',
            keyboardShouldPersistTaps: 'handled',
          }}
        />
      )}

      {/* Simplified Menu Modal - Only 4 options */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowProfile(true); }}>
              <Ionicons name="person-outline" size={22} color={COLORS.text} />
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowDidYouMeet(true); }}>
              <Ionicons name="cafe-outline" size={22} color={COLORS.text} />
              <Text style={styles.menuItemText}>Did you meet?</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowUnmatchModal(true); }}>
              <Ionicons name="heart-dislike-outline" size={22} color={COLORS.warning} />
              <Text style={[styles.menuItemText, { color: COLORS.warning }]}>Unmatch</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowReportModal(true); }}>
              <Ionicons name="flag-outline" size={22} color={COLORS.primary} />
              <Text style={[styles.menuItemText, { color: COLORS.primary }]}>Report</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Profile Sheet */}
      <ProfileBottomSheet
        visible={showProfile}
        onClose={() => setShowProfile(false)}
        userId={otherUserId}
        userName={otherUser?.name || 'Unknown'}
      />

      {/* Did You Meet Modal */}
      <DidYouMeetModal
        visible={showDidYouMeet}
        onClose={() => setShowDidYouMeet(false)}
        otherUserName={otherUser?.name || 'this person'}
        conversationId={conversation.conversation_id}
        userId={userId}
      />

      {/* Professional Unmatch Modal */}
      <UnmatchModal
        visible={showUnmatchModal}
        onClose={() => setShowUnmatchModal(false)}
        userName={otherUser?.name || 'this user'}
        onUnmatch={handleUnmatchWithReason}
        onTransitionToReport={() => setShowReportModal(true)}
      />

      {/* Professional Report Modal (Bumble-inspired) */}
      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        userName={otherUser?.name || 'this user'}
        onReport={handleReportWithDetails}
        onUnmatchInstead={() => setShowUnmatchModal(true)}
      />

      {/* Coming Soon Modal */}
      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        featureName={comingSoonFeature}
      />
    </KeyboardAvoidingView>
  );
};

// ============ MAIN CHAT TAB ============
export default function ChatTab() {
  const { mode } = useAppMode();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'chats' | 'requests'>('chats');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<MessageRequest | null>(null);
  const [showRequestDetail, setShowRequestDetail] = useState(false);

  useEffect(() => {
    initializeChat();
  }, []);

  const initializeChat = async () => {
    const id = await getUserId();
    setUserId(id);
    
    // Initialize mock conversations
    await fetch(`${API_BASE}/api/chat/init-mock/${id}`, { method: 'POST' });
    
    await Promise.all([fetchConversations(id), fetchRequests(id)]);
    setLoading(false);
  };

  const fetchConversations = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/conversations/${id}`);
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

  const fetchRequests = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/requests/${id}`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const handleAcceptRequest = async (conversationId: string) => {
    try {
      await fetch(`${API_BASE}/api/chat/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, conversation_id: conversationId }),
      });
      await Promise.all([fetchConversations(userId), fetchRequests(userId)]);
    } catch (error) {
      console.error('Error accepting request:', error);
    }
  };

  const handleDeclineRequest = async (conversationId: string) => {
    try {
      await fetch(`${API_BASE}/api/chat/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, conversation_id: conversationId }),
      });
      await fetchRequests(userId);
    } catch (error) {
      console.error('Error declining request:', error);
    }
  };

  // If conversation selected, show chat
  if (selectedConversation) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GiftedChatScreen
          conversation={selectedConversation}
          userId={userId}
          onBack={() => {
            setSelectedConversation(null);
            fetchConversations(userId);
          }}
        />
      </SafeAreaView>
    );
  }

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chats' && styles.tabActive]}
          onPress={() => setActiveTab('chats')}
        >
          <Text style={[styles.tabText, activeTab === 'chats' && styles.tabTextActive]}>
            Chats{totalUnread > 0 ? ` (${totalUnread})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
          onPress={() => setActiveTab('requests')}
        >
          <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
            Requests{requests.length > 0 ? ` (${requests.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : activeTab === 'chats' ? (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.conversation_id}
          renderItem={({ item }) => (
            <ConversationItem conversation={item} onPress={() => setSelectedConversation(item)} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={64} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>Match with someone to start chatting!</Text>
            </View>
          }
        />
      ) : (
        <ScrollView style={styles.listContent} showsVerticalScrollIndicator={false}>
          {requests.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="mail-outline" size={64} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No requests</Text>
              <Text style={styles.emptySubtitle}>New message requests will appear here</Text>
            </View>
          ) : (
            requests.map((req) => (
              <MessageRequestCard
                key={req.conversation_id}
                request={req}
                onPress={() => { setSelectedRequest(req); setShowRequestDetail(true); }}
                onAccept={() => handleAcceptRequest(req.conversation_id)}
                onDecline={() => handleDeclineRequest(req.conversation_id)}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Message Request Detail View */}
      <MessageRequestDetailView
        visible={showRequestDetail}
        request={selectedRequest}
        onAccept={() => { 
          if (selectedRequest) handleAcceptRequest(selectedRequest.conversation_id);
          setShowRequestDetail(false);
          setSelectedRequest(null);
        }}
        onDecline={() => { 
          if (selectedRequest) handleDeclineRequest(selectedRequest.conversation_id);
          setShowRequestDetail(false);
          setSelectedRequest(null);
        }}
        onClose={() => { setShowRequestDetail(false); setSelectedRequest(null); }}
      />
    </SafeAreaView>
  );
}

// ============ HELPERS ============
function formatTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ============ STYLES ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  
  // Header
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  
  // Tabs
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '500' },
  tabTextActive: { color: COLORS.primary, fontWeight: '600' },
  
  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: 12 },
  
  // Empty State
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 8, textAlign: 'center' },
  
  // Avatar
  avatar: { justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFF', fontWeight: 'bold' },
  
  // Conversation Item
  conversationItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  conversationAvatar: { position: 'relative' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.online, borderWidth: 2, borderColor: COLORS.bg },
  conversationContent: { flex: 1, marginLeft: 14 },
  conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  conversationName: { fontSize: 16, fontWeight: '500', color: COLORS.text, flex: 1 },
  unreadName: { fontWeight: '700' },
  conversationTime: { fontSize: 12, color: COLORS.textMuted },
  conversationPreview: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  unreadPreview: { color: COLORS.text, fontWeight: '500' },
  unreadBadge: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, minWidth: 24, alignItems: 'center' },
  unreadBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  conversationNameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  pendingBadge: { backgroundColor: COLORS.warning, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  pendingBadgeText: { color: '#000', fontSize: 10, fontWeight: '600' },
  pendingPreview: { fontStyle: 'italic', color: COLORS.textMuted },
  
  // Request Card
  requestCard: { backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 16, marginVertical: 8 },
  requestHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  requestInfo: { marginLeft: 12, flex: 1 },
  requestName: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  requestLocation: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  requestPreview: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 16, fontStyle: 'italic', lineHeight: 20 },
  requestActions: { flexDirection: 'row', gap: 12 },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  declineBtnText: { color: COLORS.textSecondary, fontWeight: '500' },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 24, backgroundColor: COLORS.primary, gap: 6 },
  acceptBtnText: { color: '#FFF', fontWeight: '600' },
  
  // Chat Screen
  chatContainer: { flex: 1, backgroundColor: COLORS.bg },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 8 },
  chatHeaderProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  chatHeaderInfo: { marginLeft: 12 },
  chatHeaderName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  chatHeaderStatus: { fontSize: 12, color: COLORS.online, marginTop: 1 },
  chatHeaderActions: { flexDirection: 'row' },
  headerActionBtn: { padding: 10 },
  
  // Suggestions
  suggestionsBar: { backgroundColor: COLORS.bgCard, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  suggestionsBarBottom: { backgroundColor: COLORS.bgCard, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  suggestionsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  suggestionChip: { backgroundColor: COLORS.suggestion, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary },
  suggestionText: { fontSize: 14, color: COLORS.text },
  
  // Messages
  messagesContainer: { backgroundColor: COLORS.bg, paddingBottom: 10 },
  
  // Input
  inputToolbar: { backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 8 },
  inputPrimary: { alignItems: 'center' },
  composerInput: { backgroundColor: COLORS.bgInput, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, marginRight: 8, color: COLORS.text, fontSize: 16, maxHeight: 100 },
  sendContainer: { justifyContent: 'center', alignItems: 'center', marginRight: 4 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  
  // Menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  menuContainer: { backgroundColor: COLORS.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 },
  menuItemText: { fontSize: 16, color: COLORS.text },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  
  // Profile Modal
  profileModal: { flex: 1, backgroundColor: COLORS.bg },
  profileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  profileCloseBtn: { padding: 8 },
  profileHeaderTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  profileLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileContent: { flex: 1 },
  photoCarousel: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.45 },
  profilePhoto: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.45 },
  noPhotoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bgCard },
  photoIndicators: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  photoIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  photoIndicatorActive: { backgroundColor: '#FFF', width: 24 },
  profileInfo: { padding: 20 },
  profileName: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  profileLocationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  profileLocation: { fontSize: 14, color: COLORS.textSecondary },
  profileBio: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22, marginTop: 16 },
  profileSection: { marginTop: 24 },
  profileSectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: COLORS.bgCard, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  tagText: { fontSize: 13, color: COLORS.text },
  movieItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  movieTitle: { fontSize: 15, color: COLORS.text },

  // Request Card - Updated
  requestHint: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 12, fontStyle: 'italic' },

  // Message Request Detail View - Improved
  requestDetailContainer: { flex: 1, backgroundColor: COLORS.bg },
  requestDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  requestDetailTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  requestDetailTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  requestDetailTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  requestDetailTabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  requestDetailTabText: { fontSize: 14, color: COLORS.textSecondary },
  requestDetailTabTextActive: { color: COLORS.primary, fontWeight: '600' },
  
  // Messages Tab - Improved
  requestMessagesContainer: { flex: 1 },
  requestMessagesContent: { padding: 16, paddingBottom: 130 },
  requestSenderCard: { backgroundColor: COLORS.bgCard, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 24 },
  requestSenderAvatarContainer: { marginBottom: 12 },
  requestSenderAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLORS.primary },
  requestSenderAvatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  requestSenderAvatarText: { fontSize: 36, fontWeight: 'bold', color: '#FFF' },
  requestSenderCardName: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  requestSenderCardLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  requestSenderCardLocationText: { fontSize: 14, color: COLORS.textMuted },
  viewFullProfileBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(229,9,20,0.1)', borderRadius: 20 },
  viewFullProfileBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.primary, marginRight: 4 },
  messagesSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  messagesSectionLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  messagesSectionTitle: { fontSize: 12, color: COLORS.textMuted, marginHorizontal: 12, fontWeight: '600', letterSpacing: 1 },
  requestMessagesList: { gap: 12 },
  requestMessageItem: { alignItems: 'flex-start' },
  requestMessageBubble: { backgroundColor: COLORS.bgCard, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, borderBottomLeftRadius: 4, maxWidth: '85%' },
  requestMessageText: { fontSize: 16, color: COLORS.text, lineHeight: 24 },
  requestMessageTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 6 },
  noMessagesContainer: { alignItems: 'center', paddingVertical: 40 },
  noMessagesText: { fontSize: 14, color: COLORS.textMuted, marginTop: 12 },
  
  // Profile Tab - Improved
  requestProfileContainer: { flex: 1 },
  requestProfileContent: { paddingBottom: 130 },
  requestPhotoSection: { position: 'relative' },
  requestMainPhoto: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.45 },
  requestPhotoIndicators: { position: 'absolute', top: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  requestPhotoIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  requestPhotoIndicatorActive: { backgroundColor: '#FFF', width: 20 },
  requestPhotoNav: { position: 'absolute', top: '40%', left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between' },
  requestPhotoNavBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  requestPhotoNavBtnDisabled: { opacity: 0.3 },
  requestPhotoGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingVertical: 20, paddingTop: 60 },
  requestPhotoName: { fontSize: 28, fontWeight: 'bold', color: '#FFF' },
  requestPhotoLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  requestPhotoLocationText: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  requestNoPhotoSection: { backgroundColor: COLORS.bgCard, paddingVertical: 50, alignItems: 'center' },
  requestNoPhotoAvatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  requestNoPhotoAvatarText: { fontSize: 48, fontWeight: 'bold', color: '#FFF' },
  requestNoPhotoName: { fontSize: 26, fontWeight: 'bold', color: COLORS.text },
  requestNoPhotoLocation: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  requestNoPhotoLocationText: { fontSize: 15, color: COLORS.textSecondary },
  requestProfileDetails: { padding: 20 },
  requestProfileDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  requestProfileDetailIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(229,9,20,0.1)', justifyContent: 'center', alignItems: 'center' },
  requestProfileDetailLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  requestProfileDetailValue: { fontSize: 16, color: COLORS.text, fontWeight: '500' },
  requestProfileBioSection: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: COLORS.border },
  requestProfileSectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted, marginBottom: 12, letterSpacing: 0.5 },
  requestProfileBioText: { fontSize: 16, color: COLORS.text, lineHeight: 24 },
  requestProfileTagsSection: { marginTop: 24 },
  requestProfileTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  requestProfileTag: { backgroundColor: 'rgba(229,9,20,0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(229,9,20,0.3)' },
  requestProfileTagText: { fontSize: 14, color: COLORS.primary, fontWeight: '500' },
  requestProfileMoviesSection: { marginTop: 24 },
  requestProfileMovieItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  requestProfileMovieNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  requestProfileMovieNumberText: { fontSize: 14, fontWeight: 'bold', color: '#FFF' },
  requestProfileMovieTitle: { fontSize: 16, color: COLORS.text, flex: 1 },
  
  // Action Buttons
  requestDetailActions: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', padding: 16, paddingBottom: 32, gap: 12, backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border },
  requestDeclineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  requestDeclineBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  requestAcceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 24, backgroundColor: COLORS.success, gap: 8 },
  requestAcceptBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },

  // Legacy styles (kept for backwards compatibility)
  requestSenderHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 16 },
  requestSenderInfo: { flex: 1, marginLeft: 14 },
  requestSenderName: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  requestSenderLocation: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  viewProfileBtn: { backgroundColor: COLORS.bgCard, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  viewProfileBtnText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  requestProfileInfo: { padding: 20 },
  requestProfileName: { fontSize: 26, fontWeight: 'bold', color: COLORS.text },
  requestProfileBasics: { marginTop: 12, gap: 8 },
  requestProfileBasicItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  requestProfileBasicText: { fontSize: 14, color: COLORS.textSecondary },
  requestProfileSection: { marginTop: 24 },
  requestProfileBio: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22 },

  // Did You Meet Modal
  meetModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  meetModalContainer: { backgroundColor: COLORS.bgCard, borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, alignItems: 'center' },
  meetModalIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(229,9,20,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  meetModalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, textAlign: 'center' },
  meetModalSubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8 },
  meetModalActions: { flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' },
  meetModalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  meetModalBtnPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  meetModalBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  meetVerificationOptions: { marginTop: 24, width: '100%', gap: 12 },
  meetVerificationBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, backgroundColor: COLORS.bgInput, gap: 12 },
  meetVerificationBtnText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },

  // Coming Soon Modal
  comingSoonOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  comingSoonContainer: { backgroundColor: COLORS.bgCard, borderRadius: 24, padding: 28, width: '100%', maxWidth: 320, alignItems: 'center' },
  comingSoonIcon: { marginBottom: 16 },
  comingSoonEmoji: { fontSize: 48 },
  comingSoonTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  comingSoonText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  comingSoonBtn: { marginTop: 24, backgroundColor: COLORS.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24 },
  comingSoonBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },

  // Professional Unmatch Modal
  unmatchModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  unmatchModalContainer: { backgroundColor: COLORS.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  unmatchModalHeader: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  unmatchModalClose: { padding: 8 },
  unmatchModalIconContainer: { alignItems: 'center', marginBottom: 16 },
  unmatchModalIconBg: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255, 184, 0, 0.15)', justifyContent: 'center', alignItems: 'center' },
  unmatchModalTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.text, textAlign: 'center' },
  unmatchModalSubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 20, paddingHorizontal: 16 },
  unmatchReasonsList: { maxHeight: 300 },
  unmatchReasonItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 14 },
  unmatchReasonText: { flex: 1, fontSize: 16, color: COLORS.text },
  unmatchConfirmActions: { marginTop: 24, gap: 12 },
  unmatchConfirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 24, gap: 10 },
  unmatchConfirmBtnNo: { backgroundColor: COLORS.bgInput, borderWidth: 1, borderColor: COLORS.border },
  unmatchConfirmBtnYes: { backgroundColor: COLORS.primary },
  unmatchConfirmBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  unmatchBackBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 6 },
  unmatchBackBtnText: { fontSize: 14, color: COLORS.textMuted },

  // Professional Report Modal (Bumble-inspired)
  reportModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  reportModalContainer: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  reportModalHeader: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  reportModalClose: { padding: 8 },
  reportModalTitle: { fontSize: 24, fontWeight: 'bold', color: '#1A1A1A', textAlign: 'center' },
  reportModalSubtitle: { fontSize: 14, color: '#666666', textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 20, paddingHorizontal: 16 },
  reportModalIntroText: { fontSize: 15, color: '#666666', textAlign: 'center', marginTop: 12, marginBottom: 24, lineHeight: 22, paddingHorizontal: 16 },
  reportStepsContainer: { marginBottom: 24 },
  reportStep: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 16 },
  reportStepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' },
  reportStepNumberText: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
  reportStepText: { fontSize: 15, color: '#1A1A1A', flex: 1 },
  reportUnmatchOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 16, padding: 16, marginBottom: 24, gap: 14 },
  reportUnmatchOptionText: { flex: 1 },
  reportUnmatchOptionTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  reportUnmatchOptionSubtitle: { fontSize: 13, color: '#666666', marginTop: 2 },
  reportStartBtn: { backgroundColor: '#1A1A1A', paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginBottom: 12 },
  reportStartBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  reportUnmatchBtn: { paddingVertical: 12, alignItems: 'center' },
  reportUnmatchBtnText: { fontSize: 16, fontWeight: '500', color: '#666666' },
  reportReasonsList: { maxHeight: 400 },
  reportReasonItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#EEEEEE' },
  reportReasonText: { fontSize: 16, color: '#1A1A1A' },
  reportBackBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, gap: 6 },
  reportBackBtnText: { fontSize: 14, color: '#666666' },
  reportDetailsInput: { backgroundColor: '#F5F5F5', borderRadius: 16, padding: 16, fontSize: 15, color: '#1A1A1A', minHeight: 120, textAlignVertical: 'top', marginTop: 16 },
  reportDetailsCount: { fontSize: 12, color: '#999999', textAlign: 'right', marginTop: 8 },
  reportSubmitBtn: { backgroundColor: '#1A1A1A', paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginTop: 20 },
  reportSubmitBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  reportConfirmationIcon: { alignItems: 'center', marginBottom: 20, marginTop: 20 },
  reportConfirmationText: { fontSize: 15, color: '#666666', textAlign: 'center', marginTop: 12, lineHeight: 22, paddingHorizontal: 16 },
  reportDoneBtn: { backgroundColor: '#1A1A1A', paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginTop: 32 },
  reportDoneBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
