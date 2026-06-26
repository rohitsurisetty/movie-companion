/**
 * Match History Screen
 * 
 * A trust & safety differentiating feature that allows users to:
 * - View all past matches (active and unmatched) sorted by timestamp
 * - Access read-only chat for matches where they were unmatched
 * - Report users even after being unmatched
 * - Delete chat history from their view
 * 
 * This solves a major loophole in dating apps where fake accounts unmatch
 * immediately after getting contact info, preventing victims from reporting.
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  ActivityIndicator, Alert, Modal, Image, Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getUserId } from '../src/store';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  primary: '#E50914',
  bg: '#0A0A0A',
  bgCard: '#1A1A1A',
  bgInput: '#2A2A2A',
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#666666',
  border: '#333333',
  success: '#00D26A',
  warning: '#FFB800',
  teal: '#009688',
};

interface MatchHistoryItem {
  conversation_id: string;
  other_user_id: string;
  other_user_name: string;
  other_user_avatar: string | null;
  matched_at: string;
  last_message_at: string | null;
  status: string;
  is_active: boolean;
  is_unmatched: boolean;
  was_unmatched_by_other: boolean;
  user_initiated_unmatch: boolean;
  unmatched_at: string | null;
  meeting_status: string | null;
}

// Avatar Component
const Avatar = ({ name, size = 50, imageUrl }: { name: string; size?: number; imageUrl?: string | null }) => {
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
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: '#FFF', fontSize: size * 0.4, fontWeight: 'bold' }}>
        {name?.charAt(0).toUpperCase() || '?'}
      </Text>
    </LinearGradient>
  );
};

// Format timestamp
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  }
};

// History Item Component
const HistoryItem = ({ 
  item, 
  onPress 
}: { 
  item: MatchHistoryItem; 
  onPress: () => void;
}) => {
  const isActive = item.is_active || item.status === 'pending';
  const wasUnmatched = item.was_unmatched_by_other;
  const userUnmatched = item.user_initiated_unmatch;
  
  // Determine status badge
  let statusBadge = null;
  if (isActive) {
    statusBadge = (
      <View style={[styles.statusBadge, { backgroundColor: 'rgba(0, 210, 106, 0.15)' }]}>
        <Text style={[styles.statusBadgeText, { color: COLORS.success }]}>Active</Text>
      </View>
    );
  } else if (wasUnmatched) {
    statusBadge = (
      <View style={[styles.statusBadge, { backgroundColor: 'rgba(255, 184, 0, 0.15)' }]}>
        <Text style={[styles.statusBadgeText, { color: COLORS.warning }]}>Unmatched</Text>
      </View>
    );
  } else if (userUnmatched) {
    statusBadge = (
      <View style={[styles.statusBadge, { backgroundColor: 'rgba(102, 102, 102, 0.15)' }]}>
        <Text style={[styles.statusBadgeText, { color: COLORS.textMuted }]}>You unmatched</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity 
      style={styles.historyItem} 
      onPress={onPress}
      activeOpacity={0.7}
      disabled={userUnmatched}
    >
      <View style={styles.historyAvatar}>
        {/* Show avatar for active matches or if user was unmatched by other */}
        {(isActive || wasUnmatched) && item.other_user_avatar ? (
          <Avatar name={item.other_user_name} size={56} imageUrl={item.other_user_avatar} />
        ) : wasUnmatched ? (
          // Show generic avatar with name initial for unmatched (no photo)
          <View style={styles.noPhotoAvatar}>
            <Text style={styles.noPhotoInitial}>{item.other_user_name.charAt(0).toUpperCase()}</Text>
          </View>
        ) : (
          // User initiated unmatch - grayed out
          <View style={styles.grayedAvatar}>
            <Ionicons name="person" size={28} color={COLORS.textMuted} />
          </View>
        )}
      </View>
      
      <View style={styles.historyContent}>
        <View style={styles.historyHeader}>
          <Text style={[styles.historyName, userUnmatched && styles.grayedText]} numberOfLines={1}>
            {item.other_user_name}
          </Text>
          {statusBadge}
        </View>
        <Text style={styles.historyDate}>
          Matched {formatDate(item.matched_at)}
          {item.unmatched_at && !isActive && ` • Ended ${formatDate(item.unmatched_at)}`}
        </Text>
      </View>
      
      {!userUnmatched && (
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      )}
    </TouchableOpacity>
  );
};

// Action Sheet for Active Match
const ActiveMatchActionSheet = ({
  visible,
  onClose,
  onGoToChat,
  onViewProfile,
  onReport,
  onDidYouMeet,
}: {
  visible: boolean;
  onClose: () => void;
  onGoToChat: () => void;
  onViewProfile: () => void;
  onReport: () => void;
  onDidYouMeet: () => void;
}) => {
  const insets = useSafeAreaInsets();
  
  if (!visible) return null;
  
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.actionSheetOverlay} onPress={onClose}>
        <View style={[styles.actionSheetContainer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.actionSheetHandle} />
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={() => { onClose(); onGoToChat(); }}>
            <Ionicons name="chatbubble-outline" size={24} color={COLORS.text} />
            <Text style={styles.actionSheetText}>Go to Chat</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={() => { onClose(); onViewProfile(); }}>
            <Ionicons name="person-outline" size={24} color={COLORS.text} />
            <Text style={styles.actionSheetText}>View Profile</Text>
          </TouchableOpacity>
          
          <View style={styles.actionSheetDivider} />
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={() => { onClose(); onDidYouMeet(); }}>
            <Ionicons name="cafe-outline" size={24} color={COLORS.text} />
            <Text style={styles.actionSheetText}>Did you meet?</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={() => { onClose(); onReport(); }}>
            <Ionicons name="flag-outline" size={24} color={COLORS.primary} />
            <Text style={[styles.actionSheetText, { color: COLORS.primary }]}>Report</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionSheetCancel} onPress={onClose}>
            <Text style={styles.actionSheetCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
};

// Action Sheet for Unmatched (Read-Only)
const UnmatchedActionSheet = ({
  visible,
  onClose,
  onViewChat,
  onReport,
  onDidYouMeet,
  userName,
}: {
  visible: boolean;
  onClose: () => void;
  onViewChat: () => void;
  onReport: () => void;
  onDidYouMeet: () => void;
  userName: string;
}) => {
  const insets = useSafeAreaInsets();
  
  if (!visible) return null;
  
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.actionSheetOverlay} onPress={onClose}>
        <View style={[styles.actionSheetContainer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.actionSheetHandle} />
          
          <View style={styles.actionSheetHeader}>
            <Ionicons name="information-circle" size={28} color={COLORS.warning} />
            <Text style={styles.actionSheetHeaderText}>
              {userName} has unmatched with you
            </Text>
          </View>
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={() => { onClose(); onViewChat(); }}>
            <Ionicons name="chatbubbles-outline" size={24} color={COLORS.text} />
            <Text style={styles.actionSheetText}>View Chat (Read-only)</Text>
          </TouchableOpacity>
          
          <View style={styles.actionSheetDivider} />
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={() => { onClose(); onDidYouMeet(); }}>
            <Ionicons name="cafe-outline" size={24} color={COLORS.text} />
            <Text style={styles.actionSheetText}>Did you meet?</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={() => { onClose(); onReport(); }}>
            <Ionicons name="flag-outline" size={24} color={COLORS.primary} />
            <Text style={[styles.actionSheetText, { color: COLORS.primary }]}>Report</Text>
          </TouchableOpacity>
          
          <Text style={styles.actionSheetNote}>
            Even after being unmatched, you can still report inappropriate behavior. This helps keep our community safe.
          </Text>
          
          <TouchableOpacity style={styles.actionSheetCancel} onPress={onClose}>
            <Text style={styles.actionSheetCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
};

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState('');
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<MatchHistoryItem | null>(null);
  const [showActiveActions, setShowActiveActions] = useState(false);
  const [showUnmatchedActions, setShowUnmatchedActions] = useState(false);
  
  useEffect(() => {
    initializeScreen();
  }, []);
  
  const initializeScreen = async () => {
    const id = await getUserId();
    setUserId(id);
    await fetchHistory(id);
  };
  
  const fetchHistory = async (id: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/user/match-history/${id}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error('Error fetching match history:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleItemPress = (item: MatchHistoryItem) => {
    setSelectedItem(item);
    if (item.is_active || item.status === 'pending') {
      setShowActiveActions(true);
    } else if (item.was_unmatched_by_other) {
      setShowUnmatchedActions(true);
    }
    // User initiated unmatch - no actions available
  };
  
  const handleGoToChat = () => {
    if (!selectedItem) return;
    // Navigate to chat with this conversation
    router.push({
      pathname: '/(tabs)/chat',
      params: { conversation_id: selectedItem.conversation_id }
    });
  };
  
  const handleViewChat = async () => {
    if (!selectedItem) return;
    
    // First check if chat is still available
    try {
      const response = await fetch(
        `${API_BASE}/api/chat/conversation-access/${selectedItem.conversation_id}?user_id=${userId}`
      );
      if (response.ok) {
        const access = await response.json();
        if (access.can_view) {
          // Navigate to read-only chat view
          router.push({
            pathname: '/(tabs)/chat',
            params: { 
              conversation_id: selectedItem.conversation_id,
              read_only: 'true',
              other_user_name: selectedItem.other_user_name
            }
          });
        } else {
          Alert.alert(
            'Chat Unavailable',
            'Sorry, this chat is no longer available.'
          );
        }
      }
    } catch (error) {
      console.error('Error checking chat access:', error);
      Alert.alert('Error', 'Could not access chat. Please try again.');
    }
  };
  
  const handleViewProfile = () => {
    if (!selectedItem) return;
    router.push({
      pathname: '/profile-preview',
      params: { user_id: selectedItem.other_user_id }
    });
  };
  
  const handleReport = () => {
    if (!selectedItem) return;
    // Navigate to report flow (this should trigger the report modal in chat)
    Alert.alert(
      'Report User',
      `Are you sure you want to report ${selectedItem.other_user_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Report', 
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_BASE}/api/chat/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  reporter_id: userId,
                  reported_id: selectedItem.other_user_id,
                  reason: 'Reported from history',
                  details: null
                })
              });
              Alert.alert('Report Submitted', 'Thank you for helping keep our community safe. Our team will review your report.');
            } catch (error) {
              Alert.alert('Error', 'Could not submit report. Please try again.');
            }
          }
        }
      ]
    );
  };
  
  const handleDidYouMeet = () => {
    if (!selectedItem) return;
    Alert.alert(
      'Did You Meet?',
      `Did you meet ${selectedItem.other_user_name} in person?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Yes, we met',
          onPress: async () => {
            try {
              await fetch(`${API_BASE}/api/chat/meeting-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  user_id: userId,
                  other_user_id: selectedItem.other_user_id,
                  did_meet: true
                })
              });
              Alert.alert('Thanks!', 'Your feedback helps improve our matching.');
            } catch (error) {
              console.error('Error setting meeting status:', error);
            }
          }
        },
        {
          text: 'No, we didn\'t',
          onPress: async () => {
            try {
              await fetch(`${API_BASE}/api/chat/meeting-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  user_id: userId,
                  other_user_id: selectedItem.other_user_id,
                  did_meet: false
                })
              });
            } catch (error) {
              console.error('Error setting meeting status:', error);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Match History</Text>
        <View style={{ width: 44 }} />
      </View>
      
      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="shield-checkmark" size={20} color={COLORS.teal} />
        <Text style={styles.infoBannerText}>
          Your complete match history. Even after someone unmatches, you can still view chat and report if needed.
        </Text>
      </View>
      
      {/* History List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : history.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={64} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>No Match History</Text>
          <Text style={styles.emptySubtitle}>
            Your past matches will appear here once you start matching with people.
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.conversation_id}
          renderItem={({ item }) => (
            <HistoryItem item={item} onPress={() => handleItemPress(item)} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
      
      {/* Active Match Action Sheet */}
      <ActiveMatchActionSheet
        visible={showActiveActions}
        onClose={() => { setShowActiveActions(false); setSelectedItem(null); }}
        onGoToChat={handleGoToChat}
        onViewProfile={handleViewProfile}
        onReport={handleReport}
        onDidYouMeet={handleDidYouMeet}
      />
      
      {/* Unmatched Action Sheet */}
      <UnmatchedActionSheet
        visible={showUnmatchedActions}
        onClose={() => { setShowUnmatchedActions(false); setSelectedItem(null); }}
        onViewChat={handleViewChat}
        onReport={handleReport}
        onDidYouMeet={handleDidYouMeet}
        userName={selectedItem?.other_user_name || 'this user'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(0, 150, 136, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.teal,
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  listContent: {
    paddingVertical: 8,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  historyAvatar: {
    marginRight: 14,
  },
  noPhotoAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  noPhotoInitial: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  grayedAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyContent: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  historyName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  grayedText: {
    color: COLORS.textMuted,
  },
  historyDate: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Action Sheet Styles
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  actionSheetContainer: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  actionSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  actionSheetHeaderText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.warning,
    fontWeight: '500',
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
  },
  actionSheetText: {
    fontSize: 16,
    color: COLORS.text,
  },
  actionSheetDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  actionSheetNote: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  actionSheetCancel: {
    paddingVertical: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionSheetCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
