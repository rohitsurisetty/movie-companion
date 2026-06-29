/**
 * Shared types used across chat screens.
 * Extracted from app/(tabs)/chat.tsx.
 */

export interface Conversation {
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
  is_read_only?: boolean;
  is_pending?: boolean;
  is_unmatched?: boolean;
  unmatched_at?: string;
}

export interface MessageRequest {
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

export interface FullUserProfile {
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

export interface BackendMessage {
  message_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: string;
  created_at: string;
  read: boolean;
}
