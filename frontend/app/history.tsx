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
  ActivityIndicator, Modal, Image, Pressable, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getUserId, useUserStore } from '../src/store';
import { Avatar } from '../src/components/Avatar';

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

// Report reasons - same as chat
const REPORT_REASONS = [
  { id: 'fake_profile', label: 'Fake profile or scam' },
  { id: 'inappropriate', label: 'Inappropriate messages' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'underage', label: 'User appears underage' },
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'other', label: 'Other' },
];

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

// Avatar Component → shared at src/components/Avatar.tsx

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
      testID={`history-row-${item.other_user_id}`}
      accessibilityLabel={`Match history row for ${item.other_user_name}`}
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

// ============ REPORT MODAL (Same as Chat) ============
const ReportModal = ({
  visible,
  onClose,
  userName,
  onReport,
}: {
  visible: boolean;
  onClose: () => void;
  userName: string;
  onReport: (reason: string, details: string) => void;
}) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'intro' | 'reasons' | 'details' | 'done'>('intro');
  const [selectedReason, setSelectedReason] = useState('');
  const [details, setDetails] = useState('');
  
  if (!visible) return null;
  
  const handleSubmit = () => {
    onReport(selectedReason, details);
    setStep('done');
  };
  
  const handleClose = () => {
    setStep('intro');
    setSelectedReason('');
    setDetails('');
    onClose();
  };
  
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.reportModal}>
        {/* Header */}
        <View style={styles.reportHeader}>
          <TouchableOpacity onPress={handleClose} style={styles.reportCloseBtn}>
            <Ionicons name="close" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.reportHeaderTitle}>Report</Text>
          <View style={{ width: 44 }} />
        </View>
        
        <ScrollView style={styles.reportContent} showsVerticalScrollIndicator={false}>
          {step === 'intro' && (
            <View style={styles.reportIntro}>
              <View style={styles.reportIconCircle}>
                <Ionicons name="shield-checkmark" size={48} color={COLORS.primary} />
              </View>
              <Text style={styles.reportTitle}>Help us keep the community safe</Text>
              <Text style={styles.reportSubtitle}>
                If {userName} has done something that makes you uncomfortable or violates our community guidelines, please let us know.
              </Text>
              
              <View style={styles.reportSteps}>
                <View style={styles.reportStep}>
                  <View style={styles.reportStepNumber}><Text style={styles.reportStepNumberText}>1</Text></View>
                  <Text style={styles.reportStepText}>Select a reason for reporting</Text>
                </View>
                <View style={styles.reportStep}>
                  <View style={styles.reportStepNumber}><Text style={styles.reportStepNumberText}>2</Text></View>
                  <Text style={styles.reportStepText}>Add any additional details (optional)</Text>
                </View>
                <View style={styles.reportStep}>
                  <View style={styles.reportStepNumber}><Text style={styles.reportStepNumberText}>3</Text></View>
                  <Text style={styles.reportStepText}>Our team will review and take action</Text>
                </View>
              </View>
              
              <TouchableOpacity style={styles.reportStartBtn} onPress={() => setStep('reasons')}>
                <Text style={styles.reportStartBtnText}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {step === 'reasons' && (
            <View style={styles.reportReasonsContainer}>
              <Text style={styles.reportSectionTitle}>Why are you reporting {userName}?</Text>
              <ScrollView style={styles.reportReasonsList}>
                {REPORT_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason.id}
                    style={styles.reportReasonItem}
                    onPress={() => {
                      setSelectedReason(reason.id);
                      setStep('details');
                    }}
                  >
                    <Text style={styles.reportReasonText}>{reason.label}</Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <TouchableOpacity style={styles.reportBackBtn} onPress={() => setStep('intro')}>
                <Ionicons name="arrow-back" size={16} color={COLORS.textMuted} />
                <Text style={styles.reportBackBtnText}>Back</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {step === 'details' && (
            <View style={styles.reportDetailsContainer}>
              <Text style={styles.reportSectionTitle}>Additional details (optional)</Text>
              <Text style={styles.reportSubtitle}>
                Please share any specific incidents or details that can help our team investigate.
              </Text>
              
              <TextInput
                style={styles.reportDetailsInput}
                placeholder="Describe what happened..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={6}
                value={details}
                onChangeText={setDetails}
                maxLength={500}
              />
              <Text style={styles.reportDetailsCount}>{details.length}/500</Text>
              
              <TouchableOpacity style={styles.reportSubmitBtn} onPress={handleSubmit}>
                <Text style={styles.reportSubmitBtnText}>Submit Report</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.reportBackBtn} onPress={() => setStep('reasons')}>
                <Ionicons name="arrow-back" size={16} color={COLORS.textMuted} />
                <Text style={styles.reportBackBtnText}>Back</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {step === 'done' && (
            <View style={styles.reportDoneContainer}>
              <View style={styles.reportConfirmationIcon}>
                <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
              </View>
              <Text style={styles.reportTitle}>Report Submitted</Text>
              <Text style={styles.reportConfirmationText}>
                Thank you for helping keep our community safe. Our team will review your report and take appropriate action.
              </Text>
              <TouchableOpacity style={styles.reportDoneBtn} onPress={handleClose}>
                <Text style={styles.reportDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

// ============ DID YOU MEET MODAL ============
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
  const [didMeet, setDidMeet] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const insets = useSafeAreaInsets();
  
  if (!visible) return null;
  
  const handleSubmit = async (met: boolean) => {
    setSubmitting(true);
    try {
      await fetch(`${API_BASE}/api/chat/meeting-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          conversation_id: conversationId,
          did_meet: met,
        }),
      });
      setDidMeet(met);
    } catch (error) {
      console.error('Error setting meeting status:', error);
    } finally {
      setSubmitting(false);
    }
  };
  
  const handleClose = () => {
    setDidMeet(null);
    onClose();
  };
  
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.modalOverlay} onPress={handleClose}>
        <View style={[styles.didYouMeetContainer, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHandle} />
          
          {didMeet === null ? (
            <>
              <View style={styles.didYouMeetIcon}>
                <Ionicons name="cafe" size={48} color={COLORS.primary} />
              </View>
              <Text style={styles.didYouMeetTitle}>Did you meet {otherUserName}?</Text>
              <Text style={styles.didYouMeetSubtitle}>
                Your feedback helps us improve matches for everyone.
              </Text>
              
              <View style={styles.didYouMeetButtons}>
                <TouchableOpacity 
                  style={[styles.didYouMeetBtn, styles.didYouMeetBtnNo]}
                  onPress={() => handleSubmit(false)}
                  disabled={submitting}
                >
                  <Ionicons name="close-circle" size={24} color={COLORS.textSecondary} />
                  <Text style={styles.didYouMeetBtnNoText}>No, we didn't</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.didYouMeetBtn, styles.didYouMeetBtnYes]}
                  onPress={() => handleSubmit(true)}
                  disabled={submitting}
                >
                  <Ionicons name="checkmark-circle" size={24} color="#FFF" />
                  <Text style={styles.didYouMeetBtnYesText}>Yes, we met!</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.didYouMeetIcon}>
                <Ionicons 
                  name={didMeet ? "heart" : "information-circle"} 
                  size={48} 
                  color={didMeet ? COLORS.success : COLORS.textSecondary} 
                />
              </View>
              <Text style={styles.didYouMeetTitle}>
                {didMeet ? "That's wonderful!" : "Thanks for letting us know"}
              </Text>
              <Text style={styles.didYouMeetSubtitle}>
                {didMeet 
                  ? "We hope you had a great time! Your feedback helps us improve." 
                  : "We'll keep working to find better matches for you."}
              </Text>
              <TouchableOpacity style={styles.didYouMeetDoneBtn} onPress={handleClose}>
                <Text style={styles.didYouMeetDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
};

// Action Sheet for Active Match
const ActiveMatchActionSheet = ({
  visible,
  onClose,
  onGoToChat,
  onReport,
  onDidYouMeet,
  onDeleteFromHistory,
}: {
  visible: boolean;
  onClose: () => void;
  onGoToChat: () => void;
  onReport: () => void;
  onDidYouMeet: () => void;
  onDeleteFromHistory: () => void;
}) => {
  const insets = useSafeAreaInsets();
  
  if (!visible) return null;
  
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.actionSheetOverlay} onPress={onClose}>
        <View style={[styles.actionSheetContainer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.actionSheetHandle} />
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={onGoToChat} testID="active-action-go-to-chat">
            <Ionicons name="chatbubble-outline" size={24} color={COLORS.text} />
            <Text style={styles.actionSheetText}>Go to Chat</Text>
          </TouchableOpacity>
          
          <View style={styles.actionSheetDivider} />
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={onDidYouMeet} testID="active-action-did-you-meet">
            <Ionicons name="cafe-outline" size={24} color={COLORS.text} />
            <Text style={styles.actionSheetText}>Did you meet?</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={onReport} testID="active-action-report">
            <Ionicons name="flag-outline" size={24} color={COLORS.primary} />
            <Text style={[styles.actionSheetText, { color: COLORS.primary }]}>Report</Text>
          </TouchableOpacity>
          
          <View style={styles.actionSheetDivider} />
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={onDeleteFromHistory} testID="active-action-delete-history">
            <Ionicons name="trash-outline" size={24} color={COLORS.primary} />
            <Text style={[styles.actionSheetText, { color: COLORS.primary }]}>Delete from chat history</Text>
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
  onDeleteFromHistory,
  userName,
}: {
  visible: boolean;
  onClose: () => void;
  onViewChat: () => void;
  onReport: () => void;
  onDidYouMeet: () => void;
  onDeleteFromHistory: () => void;
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
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={onViewChat} testID="unmatched-action-view-chat">
            <Ionicons name="chatbubbles-outline" size={24} color={COLORS.text} />
            <Text style={styles.actionSheetText}>View Chat (Read-only)</Text>
          </TouchableOpacity>
          
          <View style={styles.actionSheetDivider} />
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={onDidYouMeet} testID="unmatched-action-did-you-meet">
            <Ionicons name="cafe-outline" size={24} color={COLORS.text} />
            <Text style={styles.actionSheetText}>Did you meet?</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={onReport} testID="unmatched-action-report">
            <Ionicons name="flag-outline" size={24} color={COLORS.primary} />
            <Text style={[styles.actionSheetText, { color: COLORS.primary }]}>Report</Text>
          </TouchableOpacity>
          
          <View style={styles.actionSheetDivider} />
          
          <TouchableOpacity style={styles.actionSheetItem} onPress={onDeleteFromHistory} testID="unmatched-action-delete-history">
            <Ionicons name="trash-outline" size={24} color={COLORS.primary} />
            <Text style={[styles.actionSheetText, { color: COLORS.primary }]}>Delete from chat history</Text>
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDidYouMeetModal, setShowDidYouMeetModal] = useState(false);
  // Cross-platform confirmation modal state (Alert.alert is a no-op on RN-Web)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<MatchHistoryItem | null>(null);
  const [deletingChat, setDeletingChat] = useState(false);

  // Cross-platform info/confirm modal (replaces Alert.alert which is a no-op on web)
  type AlertModalState = {
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void | Promise<void>;
    iconName?: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
    destructive?: boolean;
  };
  const [alertModal, setAlertModal] = useState<AlertModalState>({
    visible: false,
    title: '',
    message: '',
  });
  const showAlert = (opts: Omit<AlertModalState, 'visible'>) =>
    setAlertModal({ ...opts, visible: true });
  const closeAlert = () =>
    setAlertModal((s) => ({ ...s, visible: false }));
  
  // Get the setSelectedConversation from store to directly open chat
  const setSelectedConversation = useUserStore((s) => s.setSelectedConversation);
  
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
    setShowActiveActions(false);
    
    // Create a conversation object to pass to the chat screen
    const conversationData = {
      conversation_id: selectedItem.conversation_id,
      other_user_id: selectedItem.other_user_id,
      other_user: {
        user_id: selectedItem.other_user_id,
        name: selectedItem.other_user_name,
        avatar: selectedItem.other_user_avatar || undefined,
      },
      status: selectedItem.status,
      unread: 0,
    };
    
    // Store in global state for the chat to pick up
    if (setSelectedConversation) {
      setSelectedConversation(conversationData);
    }
    
    // Navigate to chat tab - it will use the selected conversation
    router.push('/(tabs)/chat');
    setSelectedItem(null);
  };
  
  const handleViewChat = async () => {
    if (!selectedItem) return;
    setShowUnmatchedActions(false);
    
    // For read-only chat, check access first
    try {
      const response = await fetch(
        `${API_BASE}/api/chat/conversation-access/${selectedItem.conversation_id}?user_id=${userId}`
      );
      if (response.ok) {
        const access = await response.json();
        if (access.can_view) {
          // Create conversation data with read-only flag
          const conversationData = {
            conversation_id: selectedItem.conversation_id,
            other_user_id: selectedItem.other_user_id,
            other_user: {
              user_id: selectedItem.other_user_id,
              name: selectedItem.other_user_name,
              avatar: undefined, // Don't show avatar for unmatched
            },
            status: 'unmatched',
            unread: 0,
            is_read_only: true,
          };
          
          if (setSelectedConversation) {
            setSelectedConversation(conversationData);
          }
          
          router.push('/(tabs)/chat');
        } else {
          showAlert({
            title: 'Chat Unavailable',
            message: 'Sorry, this chat is no longer available.',
            iconName: 'information-circle-outline',
            iconColor: COLORS.warning,
          });
        }
      }
    } catch (error) {
      console.error('Error checking chat access:', error);
      showAlert({
        title: 'Error',
        message: 'Could not access chat. Please try again.',
        iconName: 'alert-circle-outline',
        iconColor: COLORS.primary,
      });
    } finally {
      setSelectedItem(null);
    }
  };
  
  const handleOpenReportModal = () => {
    if (!selectedItem) return;
    setShowActiveActions(false);
    setShowUnmatchedActions(false);
    setShowReportModal(true);
  };
  
  const handleReport = async (reason: string, details: string) => {
    if (!selectedItem) return;
    
    try {
      await fetch(`${API_BASE}/api/chat/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporter_id: userId,
          reported_id: selectedItem.other_user_id,
          reason: reason,
          details: details || null
        })
      });
    } catch (error) {
      console.error('Error submitting report:', error);
      showAlert({
        title: 'Error',
        message: 'Could not submit report. Please try again.',
        iconName: 'alert-circle-outline',
        iconColor: COLORS.primary,
      });
    }
  };
  
  const handleDidYouMeet = () => {
    if (!selectedItem) return;
    setShowActiveActions(false);
    setShowUnmatchedActions(false);
    setShowDidYouMeetModal(true);
  };
  
  const handleDeleteFromHistory = () => {
    if (!selectedItem) return;
    // Snapshot the item, close the action sheets, then open the cross-platform
    // confirmation modal (Alert.alert is a no-op on react-native-web).
    const item = selectedItem;
    setShowActiveActions(false);
    setShowUnmatchedActions(false);
    setSelectedItem(null);
    setDeleteConfirmItem(item);
  };

  const handleConfirmDelete = async () => {
    const item = deleteConfirmItem;
    if (!item || !userId) {
      setDeleteConfirmItem(null);
      return;
    }
    setDeletingChat(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          conversation_id: item.conversation_id,
        }),
      });

      if (res.ok) {
        // Remove from local state immediately for snappy UX
        setHistory((prev) => prev.filter((h) => h.conversation_id !== item.conversation_id));
        setDeleteConfirmItem(null);
      } else {
        // Treat 400 (already deleted) the same as success to keep UX consistent
        if (res.status === 400) {
          setHistory((prev) => prev.filter((h) => h.conversation_id !== item.conversation_id));
          setDeleteConfirmItem(null);
        } else {
          showAlert({
            title: 'Error',
            message: 'Could not delete chat history. Please try again.',
            iconName: 'alert-circle-outline',
            iconColor: COLORS.primary,
          });
          setDeleteConfirmItem(null);
        }
      }
    } catch (err) {
      console.error('Delete chat history error:', err);
      showAlert({
        title: 'Error',
        message: 'Could not delete chat history. Please try again.',
        iconName: 'alert-circle-outline',
        iconColor: COLORS.primary,
      });
      setDeleteConfirmItem(null);
    } finally {
      setDeletingChat(false);
    }
  };

  // Dev-only helper to seed mock unmatched conversations (Anjali + Priya)
  const handleSeedMockData = async () => {
    if (!userId) return;
    showAlert({
      title: 'Seed Test Data',
      message:
        'This will create two mock unmatched conversations (Anjali Iyer & Priya Bhatia) with chat history. Continue?',
      confirmText: 'Seed',
      cancelText: 'Cancel',
      iconName: 'flask-outline',
      iconColor: COLORS.warning,
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/api/dev/seed-unmatched-mocks/${userId}`, {
            method: 'POST',
          });
          if (res.ok) {
            await fetchHistory(userId);
            showAlert({
              title: 'Done',
              message: "Mock data seeded. Pull to refresh if you don't see it.",
              iconName: 'checkmark-circle-outline',
              iconColor: COLORS.success || '#4CAF50',
            });
          } else {
            showAlert({
              title: 'Error',
              message: 'Could not seed mock data.',
              iconName: 'alert-circle-outline',
              iconColor: COLORS.primary,
            });
          }
        } catch (e) {
          console.error('Seed error', e);
          showAlert({
            title: 'Error',
            message: 'Could not seed mock data.',
            iconName: 'alert-circle-outline',
            iconColor: COLORS.primary,
          });
        }
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Match History</Text>
        <TouchableOpacity onPress={handleSeedMockData} style={styles.backBtn}>
          <Ionicons name="flask-outline" size={22} color={COLORS.textMuted} />
        </TouchableOpacity>
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
        onReport={handleOpenReportModal}
        onDidYouMeet={handleDidYouMeet}
        onDeleteFromHistory={handleDeleteFromHistory}
      />
      
      {/* Unmatched Action Sheet */}
      <UnmatchedActionSheet
        visible={showUnmatchedActions}
        onClose={() => { setShowUnmatchedActions(false); setSelectedItem(null); }}
        onViewChat={handleViewChat}
        onReport={handleOpenReportModal}
        onDidYouMeet={handleDidYouMeet}
        onDeleteFromHistory={handleDeleteFromHistory}
        userName={selectedItem?.other_user_name || 'this user'}
      />
      
      {/* Report Modal - Full flow like chat */}
      <ReportModal
        visible={showReportModal}
        onClose={() => { setShowReportModal(false); setSelectedItem(null); }}
        userName={selectedItem?.other_user_name || 'this user'}
        onReport={handleReport}
      />
      
      {/* Did You Meet Modal */}
      <DidYouMeetModal
        visible={showDidYouMeetModal}
        onClose={() => { setShowDidYouMeetModal(false); setSelectedItem(null); }}
        otherUserName={selectedItem?.other_user_name || 'this person'}
        conversationId={selectedItem?.conversation_id || ''}
        userId={userId}
      />

      {/* Cross-platform Alert Modal (replaces Alert.alert which is a no-op on web) */}
      <Modal
        visible={alertModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeAlert}
      >
        <Pressable style={styles.deleteConfirmOverlay} onPress={closeAlert}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => { /* swallow */ }}>
            {alertModal.iconName ? (
              <View style={styles.deleteConfirmIcon}>
                <Ionicons
                  name={alertModal.iconName}
                  size={32}
                  color={alertModal.iconColor || COLORS.primary}
                />
              </View>
            ) : null}
            <Text style={styles.deleteConfirmTitle}>{alertModal.title}</Text>
            <Text style={styles.deleteConfirmBody}>{alertModal.message}</Text>
            <View style={styles.deleteConfirmButtons}>
              {alertModal.onConfirm ? (
                <>
                  <TouchableOpacity
                    style={[styles.deleteConfirmBtn, styles.deleteConfirmBtnCancel]}
                    onPress={closeAlert}
                    testID="alert-modal-cancel"
                  >
                    <Text style={styles.deleteConfirmBtnCancelText}>
                      {alertModal.cancelText || 'Cancel'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.deleteConfirmBtn, styles.deleteConfirmBtnConfirm]}
                    onPress={async () => {
                      const fn = alertModal.onConfirm;
                      closeAlert();
                      if (fn) await fn();
                    }}
                    testID="alert-modal-confirm"
                  >
                    <Text style={styles.deleteConfirmBtnConfirmText}>
                      {alertModal.confirmText || 'OK'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.deleteConfirmBtn, styles.deleteConfirmBtnConfirm, { flex: 1 }]}
                  onPress={closeAlert}
                  testID="alert-modal-ok"
                >
                  <Text style={styles.deleteConfirmBtnConfirmText}>
                    {alertModal.confirmText || 'OK'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cross-platform Delete Confirmation Modal */}
      <Modal
        visible={!!deleteConfirmItem}
        transparent
        animationType="fade"
        onRequestClose={() => !deletingChat && setDeleteConfirmItem(null)}
      >
        <Pressable
          style={styles.deleteConfirmOverlay}
          onPress={() => !deletingChat && setDeleteConfirmItem(null)}
        >
          <Pressable
            style={styles.deleteConfirmCard}
            onPress={() => { /* swallow */ }}
          >
            <View style={styles.deleteConfirmIcon}>
              <Ionicons name="trash-outline" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.deleteConfirmTitle}>Delete from chat history?</Text>
            <Text style={styles.deleteConfirmBody}>
              This will remove your chat with{' '}
              <Text style={styles.deleteConfirmBodyBold}>
                {deleteConfirmItem?.other_user_name || 'this user'}
              </Text>
              {' '}from your history. The other person&apos;s view isn&apos;t affected.
            </Text>
            <View style={styles.deleteConfirmButtons}>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, styles.deleteConfirmBtnCancel]}
                onPress={() => setDeleteConfirmItem(null)}
                disabled={deletingChat}
                testID="delete-confirm-cancel"
              >
                <Text style={styles.deleteConfirmBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, styles.deleteConfirmBtnConfirm]}
                onPress={handleConfirmDelete}
                disabled={deletingChat}
                testID="delete-confirm-confirm"
              >
                {deletingChat ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.deleteConfirmBtnConfirmText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  // Modal Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  // Did You Meet Modal
  didYouMeetContainer: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  didYouMeetIcon: {
    alignItems: 'center',
    marginVertical: 20,
  },
  didYouMeetTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  didYouMeetSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  didYouMeetButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  didYouMeetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
  },
  didYouMeetBtnNo: {
    backgroundColor: COLORS.bgInput,
  },
  didYouMeetBtnNoText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  didYouMeetBtnYes: {
    backgroundColor: COLORS.primary,
  },
  didYouMeetBtnYesText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  didYouMeetDoneBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
  },
  didYouMeetDoneBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  // Report Modal
  reportModal: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  reportCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  reportContent: {
    flex: 1,
    padding: 24,
  },
  reportIntro: {
    alignItems: 'center',
  },
  reportIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  reportTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  reportSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  reportSteps: {
    width: '100%',
    marginBottom: 32,
  },
  reportStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  reportStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportStepNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
  },
  reportStepText: {
    fontSize: 15,
    color: COLORS.text,
    flex: 1,
  },
  reportStartBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 30,
  },
  reportStartBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  reportReasonsContainer: {
    flex: 1,
  },
  reportSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 20,
  },
  reportReasonsList: {
    maxHeight: 400,
  },
  reportReasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  reportReasonText: {
    fontSize: 16,
    color: COLORS.text,
  },
  reportBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 6,
  },
  reportBackBtnText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  reportDetailsContainer: {
    flex: 1,
  },
  reportDetailsInput: {
    backgroundColor: COLORS.bgInput,
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: COLORS.text,
    minHeight: 120,
    textAlignVertical: 'top',
    marginTop: 16,
  },
  reportDetailsCount: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: 8,
  },
  reportSubmitBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 20,
  },
  reportSubmitBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  reportDoneContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  reportConfirmationIcon: {
    marginBottom: 24,
  },
  reportConfirmationText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 12,
    paddingHorizontal: 20,
  },
  reportDoneBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 30,
    marginTop: 32,
  },
  reportDoneBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  // Profile Modal
  profileModal: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  profileCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  profileLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileScroll: {
    flex: 1,
  },
  profilePhotoGallery: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
  },
  profileMainPhoto: {
    width: '100%',
    height: '100%',
  },
  profilePhotoDots: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  profilePhotoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  profilePhotoDotActive: {
    backgroundColor: '#FFF',
    width: 24,
  },
  profileInfo: {
    padding: 20,
  },
  profileName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  profileLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 20,
  },
  profileLocationText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  profileSection: {
    marginTop: 20,
  },
  profileSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  profileBio: {
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 24,
  },
  profileTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  profileTag: {
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  profileTagText: {
    fontSize: 14,
    color: COLORS.text,
  },
  // ============ DELETE CONFIRMATION MODAL ============
  deleteConfirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  deleteConfirmCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.bgCard,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'center',
  },
  deleteConfirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(229, 9, 20, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  deleteConfirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  deleteConfirmBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  deleteConfirmBodyBold: {
    color: COLORS.text,
    fontWeight: '600',
  },
  deleteConfirmButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  deleteConfirmBtnCancel: {
    backgroundColor: COLORS.bgInput,
  },
  deleteConfirmBtnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  deleteConfirmBtnConfirm: {
    backgroundColor: COLORS.primary,
  },
  deleteConfirmBtnConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});
