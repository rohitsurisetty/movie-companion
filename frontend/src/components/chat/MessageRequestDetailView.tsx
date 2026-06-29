import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { API_BASE, COLORS, SCREEN_WIDTH, SCREEN_HEIGHT } from './theme';
import { formatHourMinute, formatDateOrToday } from './utils';
import type { MessageRequest, FullUserProfile, BackendMessage } from './types';

interface Props {
  visible: boolean;
  request: MessageRequest | null;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}

export const MessageRequestDetailView: React.FC<Props> = ({
  visible, request, onAccept, onDecline, onClose,
}) => {
  const [profile, setProfile] = useState<FullUserProfile | null>(null);
  const [pictures, setPictures] = useState<string[]>([]);
  const [messages, setMessages] = useState<BackendMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPicIndex, setCurrentPicIndex] = useState(0);
  const [activeView, setActiveView] = useState<'messages' | 'profile'>('messages');

  useEffect(() => {
    if (visible && request) {
      setActiveView('messages');
      setCurrentPicIndex(0);
      fetchRequestData();
    }
  }, [visible, request]);

  const fetchRequestData = async () => {
    if (!request) return;
    setLoading(true);
    try {
      const messagesRes = await fetch(`${API_BASE}/api/chat/messages/${request.conversation_id}`);
      if (messagesRes.ok) {
        const data = await messagesRes.json();
        setMessages(data.messages || []);
      }
      const profileRes = await fetch(`${API_BASE}/api/user/profile/${request.from_user_id}`);
      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.profile);
      }
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
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Message Request</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeView === 'messages' && styles.tabActive]}
            onPress={() => setActiveView('messages')}
          >
            <Ionicons name="chatbubbles-outline" size={18} color={activeView === 'messages' ? COLORS.primary : COLORS.textSecondary} />
            <Text style={[styles.tabText, activeView === 'messages' && styles.tabTextActive]}>Messages</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeView === 'profile' && styles.tabActive]}
            onPress={() => setActiveView('profile')}
          >
            <Ionicons name="person-outline" size={18} color={activeView === 'profile' ? COLORS.primary : COLORS.textSecondary} />
            <Text style={[styles.tabText, activeView === 'profile' && styles.tabTextActive]}>Profile</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            {activeView === 'messages' ? (
              <ScrollView
                style={styles.messagesContainer}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.senderCard}>
                  <View style={styles.senderAvatarContainer}>
                    {displayAvatar ? (
                      <Image source={{ uri: displayAvatar }} style={styles.senderAvatar} />
                    ) : (
                      <View style={styles.senderAvatarPlaceholder}>
                        <Text style={styles.senderAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.senderCardName}>{displayName}{displayAge ? `, ${displayAge}` : ''}</Text>
                  {displayLocation ? (
                    <View style={styles.senderCardLocation}>
                      <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
                      <Text style={styles.senderCardLocationText}>{displayLocation}</Text>
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

                <View style={styles.messagesSectionHeader}>
                  <View style={styles.messagesSectionLine} />
                  <Text style={styles.messagesSectionTitle}>Messages</Text>
                  <View style={styles.messagesSectionLine} />
                </View>

                <View style={styles.messagesList}>
                  {messages.length > 0 ? (
                    messages.map((msg, idx) => (
                      <View key={msg.message_id || idx} style={styles.messageItem}>
                        <View style={styles.messageBubble}>
                          <Text style={styles.messageText}>{msg.content}</Text>
                          <Text style={styles.messageTime}>
                            {formatDateOrToday(msg.created_at)} • {formatHourMinute(msg.created_at)}
                          </Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.noMessages}>
                      <Ionicons name="chatbubble-ellipses-outline" size={48} color={COLORS.textMuted} />
                      <Text style={styles.noMessagesText}>No messages yet</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            ) : (
              <ScrollView
                style={styles.profileContainer}
                contentContainerStyle={styles.profileContent}
                showsVerticalScrollIndicator={false}
              >
                {pictures.length > 0 ? (
                  <View style={styles.photoSection}>
                    <Image
                      source={{ uri: pictures[currentPicIndex] }}
                      style={styles.mainPhoto}
                      resizeMode="cover"
                    />
                    {pictures.length > 1 && (
                      <>
                        <View style={styles.photoIndicators}>
                          {pictures.map((_, idx) => (
                            <TouchableOpacity
                              key={idx}
                              style={[styles.photoIndicator, idx === currentPicIndex && styles.photoIndicatorActive]}
                              onPress={() => setCurrentPicIndex(idx)}
                            />
                          ))}
                        </View>
                        <View style={styles.photoNav}>
                          <TouchableOpacity
                            style={[styles.photoNavBtn, currentPicIndex === 0 && styles.photoNavBtnDisabled]}
                            onPress={() => setCurrentPicIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentPicIndex === 0}
                          >
                            <Ionicons name="chevron-back" size={24} color="#FFF" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.photoNavBtn, currentPicIndex === pictures.length - 1 && styles.photoNavBtnDisabled]}
                            onPress={() => setCurrentPicIndex(prev => Math.min(pictures.length - 1, prev + 1))}
                            disabled={currentPicIndex === pictures.length - 1}
                          >
                            <Ionicons name="chevron-forward" size={24} color="#FFF" />
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.8)']}
                      style={styles.photoGradient}
                    >
                      <Text style={styles.photoName}>{displayName}{displayAge ? `, ${displayAge}` : ''}</Text>
                      {displayLocation ? (
                        <View style={styles.photoLocation}>
                          <Ionicons name="location" size={14} color="#FFF" />
                          <Text style={styles.photoLocationText}>{displayLocation}</Text>
                        </View>
                      ) : null}
                    </LinearGradient>
                  </View>
                ) : (
                  <View style={styles.noPhotoSection}>
                    <View style={styles.noPhotoAvatar}>
                      <Text style={styles.noPhotoAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.noPhotoName}>{displayName}{displayAge ? `, ${displayAge}` : ''}</Text>
                    {displayLocation ? (
                      <View style={styles.noPhotoLocation}>
                        <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
                        <Text style={styles.noPhotoLocationText}>{displayLocation}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                <View style={styles.profileDetails}>
                  {profile?.gender && (
                    <View style={styles.profileDetailItem}>
                      <View style={styles.profileDetailIcon}>
                        <Ionicons name="person" size={18} color={COLORS.primary} />
                      </View>
                      <View>
                        <Text style={styles.profileDetailLabel}>Gender</Text>
                        <Text style={styles.profileDetailValue}>{profile.gender}</Text>
                      </View>
                    </View>
                  )}

                  {profile?.bio && (
                    <View style={styles.profileBioSection}>
                      <Text style={styles.profileSectionTitle}>About</Text>
                      <Text style={styles.profileBioText}>{profile.bio}</Text>
                    </View>
                  )}

                  {Array.isArray(profile?.genres) && profile.genres.length > 0 && (
                    <View style={styles.profileTagsSection}>
                      <Text style={styles.profileSectionTitle}>Favorite Genres</Text>
                      <View style={styles.profileTags}>
                        {profile.genres.map((genre: string, idx: number) => (
                          <View key={idx} style={styles.profileTag}>
                            <Text style={styles.profileTagText}>{genre}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {Array.isArray(profile?.topMovies) && profile.topMovies.length > 0 && (
                    <View style={styles.profileMoviesSection}>
                      <Text style={styles.profileSectionTitle}>Top Movies</Text>
                      {profile.topMovies.slice(0, 5).map((movie: any, idx: number) => (
                        <View key={idx} style={styles.profileMovieItem}>
                          <View style={styles.profileMovieNumber}>
                            <Text style={styles.profileMovieNumberText}>{idx + 1}</Text>
                          </View>
                          <Text style={styles.profileMovieTitle}>{movie.title}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </ScrollView>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.declineBtn} onPress={() => { onDecline(); onClose(); }}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => { onAccept(); onClose(); }}>
                <Ionicons name="checkmark" size={22} color="#FFF" />
                <Text style={styles.acceptBtnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 8 },
  title: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 14, color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.primary, fontWeight: '600' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: 12 },
  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 130 },
  senderCard: { backgroundColor: COLORS.bgCard, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 24 },
  senderAvatarContainer: { marginBottom: 12 },
  senderAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLORS.primary },
  senderAvatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  senderAvatarText: { fontSize: 36, fontWeight: 'bold', color: '#FFF' },
  senderCardName: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  senderCardLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  senderCardLocationText: { fontSize: 14, color: COLORS.textMuted },
  viewFullProfileBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(229,9,20,0.1)', borderRadius: 20 },
  viewFullProfileBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.primary, marginRight: 4 },
  messagesSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  messagesSectionLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  messagesSectionTitle: { fontSize: 12, color: COLORS.textMuted, marginHorizontal: 12, fontWeight: '600', letterSpacing: 1 },
  messagesList: { gap: 12 },
  messageItem: { alignItems: 'flex-start' },
  messageBubble: { backgroundColor: COLORS.bgCard, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, borderBottomLeftRadius: 4, maxWidth: '85%' },
  messageText: { fontSize: 16, color: COLORS.text, lineHeight: 24 },
  messageTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 6 },
  noMessages: { alignItems: 'center', paddingVertical: 40 },
  noMessagesText: { fontSize: 14, color: COLORS.textMuted, marginTop: 12 },
  profileContainer: { flex: 1 },
  profileContent: { paddingBottom: 130 },
  photoSection: { position: 'relative' },
  mainPhoto: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.45 },
  photoIndicators: { position: 'absolute', top: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  photoIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  photoIndicatorActive: { backgroundColor: '#FFF', width: 20 },
  photoNav: { position: 'absolute', top: '40%', left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between' },
  photoNavBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  photoNavBtnDisabled: { opacity: 0.3 },
  photoGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingVertical: 20, paddingTop: 60 },
  photoName: { fontSize: 28, fontWeight: 'bold', color: '#FFF' },
  photoLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  photoLocationText: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  noPhotoSection: { backgroundColor: COLORS.bgCard, paddingVertical: 50, alignItems: 'center' },
  noPhotoAvatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  noPhotoAvatarText: { fontSize: 48, fontWeight: 'bold', color: '#FFF' },
  noPhotoName: { fontSize: 26, fontWeight: 'bold', color: COLORS.text },
  noPhotoLocation: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  noPhotoLocationText: { fontSize: 15, color: COLORS.textSecondary },
  profileDetails: { padding: 20 },
  profileDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  profileDetailIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(229,9,20,0.1)', justifyContent: 'center', alignItems: 'center' },
  profileDetailLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  profileDetailValue: { fontSize: 16, color: COLORS.text, fontWeight: '500' },
  profileBioSection: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: COLORS.border },
  profileSectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted, marginBottom: 12, letterSpacing: 0.5 },
  profileBioText: { fontSize: 16, color: COLORS.text, lineHeight: 24 },
  profileTagsSection: { marginTop: 24 },
  profileTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  profileTag: { backgroundColor: 'rgba(229,9,20,0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(229,9,20,0.3)' },
  profileTagText: { fontSize: 14, color: COLORS.primary, fontWeight: '500' },
  profileMoviesSection: { marginTop: 24 },
  profileMovieItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  profileMovieNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  profileMovieNumberText: { fontSize: 14, fontWeight: 'bold', color: '#FFF' },
  profileMovieTitle: { fontSize: 16, color: COLORS.text, flex: 1 },
  actions: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', padding: 16, paddingBottom: 32, gap: 12, backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  declineBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 24, backgroundColor: COLORS.success, gap: 8 },
  acceptBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
});
