/**
 * Lookup tables for chat unmatch + report flows.
 * Extracted from app/(tabs)/chat.tsx.
 */

export interface ReasonOption {
  id: string;
  label: string;
  icon: string;
}

export const UNMATCH_REASONS: ReasonOption[] = [
  { id: 'not_interesting', label: 'Conversation not interesting', icon: 'chatbubble-ellipses-outline' },
  { id: 'not_my_type', label: 'Not my type', icon: 'heart-dislike-outline' },
  { id: 'different_expectations', label: 'Different expectations', icon: 'git-compare-outline' },
  { id: 'found_someone', label: 'Found someone else', icon: 'people-outline' },
  { id: 'not_active', label: 'Not active enough', icon: 'time-outline' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

export const REPORT_REASONS: ReasonOption[] = [
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
