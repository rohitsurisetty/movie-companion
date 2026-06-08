"""
Chat Service for Film Companion

Handles:
- Messages (send, receive, list)
- Message requests (accept, decline)
- Conversations management
- Unmatch & Report
- Meeting verification
- AI ice breakers & reply suggestions
"""

import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from dotenv import load_dotenv

load_dotenv()

# Import emergent integrations for LLM
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    print("Warning: emergentintegrations not installed")

EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY")

# In-memory storage (would be MongoDB in production)
_conversations = {}  # conversation_id -> conversation data
_messages = {}  # conversation_id -> list of messages
_message_requests = {}  # user_id -> list of pending requests


def get_conversation_id(user1_id: str, user2_id: str) -> str:
    """Generate a consistent conversation ID for two users"""
    return "_".join(sorted([user1_id, user2_id]))


def get_or_create_conversation(user1_id: str, user2_id: str) -> Dict:
    """Get existing conversation or create a new one"""
    conv_id = get_conversation_id(user1_id, user2_id)
    
    if conv_id not in _conversations:
        _conversations[conv_id] = {
            "conversation_id": conv_id,
            "participants": [user1_id, user2_id],
            "created_at": datetime.utcnow().isoformat(),
            "status": "pending",  # pending, active, unmatched
            "last_message": None,
            "last_message_at": None,
            "unread_count": {user1_id: 0, user2_id: 0},
            "meeting_status": None,  # None, "asked", "confirmed", "reported"
            "verification_status": None,  # None, "same_person", "different_person"
        }
        _messages[conv_id] = []
    
    return _conversations[conv_id]


def send_message(
    sender_id: str,
    receiver_id: str,
    content: str,
    message_type: str = "text",  # text, image, voice, gif
    media_url: Optional[str] = None
) -> Dict:
    """Send a message to another user"""
    conv = get_or_create_conversation(sender_id, receiver_id)
    conv_id = conv["conversation_id"]
    
    message = {
        "message_id": f"msg_{datetime.utcnow().timestamp()}_{sender_id[:8]}",
        "conversation_id": conv_id,
        "sender_id": sender_id,
        "receiver_id": receiver_id,
        "content": content,
        "message_type": message_type,
        "media_url": media_url,
        "created_at": datetime.utcnow().isoformat(),
        "read": False,
        "delivered": True,
    }
    
    _messages[conv_id].append(message)
    
    # Update conversation
    conv["last_message"] = content[:50] + "..." if len(content) > 50 else content
    conv["last_message_at"] = message["created_at"]
    conv["unread_count"][receiver_id] = conv["unread_count"].get(receiver_id, 0) + 1
    
    # If this is first message, add to message requests
    if conv["status"] == "pending" and len(_messages[conv_id]) == 1:
        if receiver_id not in _message_requests:
            _message_requests[receiver_id] = []
        _message_requests[receiver_id].append({
            "conversation_id": conv_id,
            "from_user_id": sender_id,
            "preview": content[:100],
            "created_at": message["created_at"],
        })
    
    return message


def get_messages(conversation_id: str, limit: int = 50, before: Optional[str] = None) -> List[Dict]:
    """Get messages for a conversation"""
    messages = _messages.get(conversation_id, [])
    
    if before:
        messages = [m for m in messages if m["created_at"] < before]
    
    return sorted(messages, key=lambda x: x["created_at"], reverse=True)[:limit]


def get_conversations(user_id: str) -> List[Dict]:
    """Get all active conversations for a user"""
    user_convs = []
    
    for conv_id, conv in _conversations.items():
        if user_id in conv["participants"] and conv["status"] == "active":
            other_user_id = [p for p in conv["participants"] if p != user_id][0]
            user_convs.append({
                **conv,
                "other_user_id": other_user_id,
                "unread": conv["unread_count"].get(user_id, 0),
            })
    
    return sorted(user_convs, key=lambda x: x["last_message_at"] or "", reverse=True)


def get_message_requests(user_id: str) -> List[Dict]:
    """Get pending message requests for a user"""
    return _message_requests.get(user_id, [])


def accept_message_request(user_id: str, conversation_id: str) -> bool:
    """Accept a message request"""
    if conversation_id in _conversations:
        _conversations[conversation_id]["status"] = "active"
        
        # Remove from requests
        if user_id in _message_requests:
            _message_requests[user_id] = [
                r for r in _message_requests[user_id] 
                if r["conversation_id"] != conversation_id
            ]
        return True
    return False


def decline_message_request(user_id: str, conversation_id: str) -> bool:
    """Decline a message request"""
    if conversation_id in _conversations:
        _conversations[conversation_id]["status"] = "declined"
        
        # Remove from requests
        if user_id in _message_requests:
            _message_requests[user_id] = [
                r for r in _message_requests[user_id] 
                if r["conversation_id"] != conversation_id
            ]
        return True
    return False


def unmatch_user(user_id: str, other_user_id: str, reason: Optional[str] = None) -> bool:
    """Unmatch with a user"""
    conv_id = get_conversation_id(user_id, other_user_id)
    
    if conv_id in _conversations:
        _conversations[conv_id]["status"] = "unmatched"
        _conversations[conv_id]["unmatched_by"] = user_id
        _conversations[conv_id]["unmatch_reason"] = reason
        _conversations[conv_id]["unmatched_at"] = datetime.utcnow().isoformat()
        return True
    return False


def report_user(
    reporter_id: str,
    reported_id: str,
    reason: str,
    details: Optional[str] = None
) -> Dict:
    """Report a user"""
    report = {
        "report_id": f"report_{datetime.utcnow().timestamp()}",
        "reporter_id": reporter_id,
        "reported_id": reported_id,
        "reason": reason,
        "details": details,
        "created_at": datetime.utcnow().isoformat(),
        "status": "pending",
    }
    
    # In production, save to database
    print(f"Report created: {report}")
    
    return report


def set_meeting_status(
    user_id: str,
    other_user_id: str,
    did_meet: bool,
    was_same_person: Optional[bool] = None
) -> bool:
    """Set meeting verification status"""
    conv_id = get_conversation_id(user_id, other_user_id)
    
    if conv_id in _conversations:
        _conversations[conv_id]["meeting_status"] = "confirmed" if did_meet else "not_met"
        if was_same_person is not None:
            _conversations[conv_id]["verification_status"] = "same_person" if was_same_person else "different_person"
        return True
    return False


def mark_messages_read(user_id: str, conversation_id: str) -> bool:
    """Mark all messages in a conversation as read"""
    if conversation_id in _conversations:
        _conversations[conversation_id]["unread_count"][user_id] = 0
        
        for msg in _messages.get(conversation_id, []):
            if msg["receiver_id"] == user_id:
                msg["read"] = True
        return True
    return False


# ============== AI FEATURES ==============

async def generate_ice_breakers(user_profile: Dict, match_profile: Dict) -> List[str]:
    """Generate AI-powered ice breaker suggestions"""
    if not EMERGENT_LLM_KEY:
        # Fallback ice breakers
        return [
            f"Hey {match_profile.get('name', 'there')}! I noticed we both love {match_profile.get('genres', ['movies'])[0] if match_profile.get('genres') else 'movies'}. What's your all-time favorite?",
            f"Hi! Your taste in movies is impressive. Have you seen anything good lately?",
            f"Hey! I see we're both into {match_profile.get('ottTheatre', 'movies')}. What's on your watchlist right now?",
        ]
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            model="gpt-4o",
        )
        
        user_genres = ", ".join(user_profile.get("genres", [])[:3])
        match_genres = ", ".join(match_profile.get("genres", [])[:3])
        match_movies = ", ".join([m.get("title", "") for m in match_profile.get("topMovies", [])[:3]])
        shared = match_profile.get("shared_interests", [])
        
        prompt = f"""Generate 3 creative, friendly ice breaker messages for a movie dating app.

Sender likes: {user_genres}
Match's name: {match_profile.get('name', 'them')}
Match likes: {match_genres}
Match's favorite movies: {match_movies}
Shared interests: {', '.join(shared) if shared else 'movies'}

Rules:
- Keep each message under 100 characters
- Be friendly and casual, not creepy
- Reference specific movies or genres they like
- Make it easy to respond to
- No emojis in the first message

Return ONLY 3 messages, one per line, no numbering or bullets."""

        response = await chat.send_message(UserMessage(text=prompt))
        
        lines = [line.strip() for line in response.text.strip().split("\n") if line.strip()]
        return lines[:3] if len(lines) >= 3 else lines + [
            f"Hey! Love your movie taste!",
            f"Hi {match_profile.get('name', 'there')}! What are you watching?",
        ][:3-len(lines)]
        
    except Exception as e:
        print(f"Error generating ice breakers: {e}")
        return [
            f"Hey {match_profile.get('name', 'there')}! What's your favorite movie of all time?",
            f"Hi! I see we have similar taste in movies. Seen anything good lately?",
            f"Hey! Your profile caught my eye. What got you into {match_profile.get('genres', ['movies'])[0] if match_profile.get('genres') else 'movies'}?",
        ]


async def generate_reply_suggestions(
    conversation_messages: List[Dict],
    user_profile: Dict,
    match_profile: Dict
) -> List[str]:
    """Generate AI-powered reply suggestions based on conversation context"""
    if not EMERGENT_LLM_KEY or not conversation_messages:
        return [
            "That sounds amazing!",
            "I'd love to hear more about that",
            "What do you think about...?",
        ]
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            model="gpt-4o",
        )
        
        # Get last few messages for context
        recent_messages = conversation_messages[-5:]
        conversation_text = "\n".join([
            f"{'You' if m['sender_id'] == user_profile.get('user_id') else match_profile.get('name', 'Them')}: {m['content']}"
            for m in recent_messages
        ])
        
        prompt = f"""Based on this conversation, suggest 3 short reply options.

Conversation:
{conversation_text}

You are: {user_profile.get('name', 'User')}
You like: {', '.join(user_profile.get('genres', [])[:3])}

Rules:
- Each reply should be under 50 characters
- Be natural and conversational
- One should be a question to keep conversation going
- One should be enthusiastic/agreeing
- One should share something personal

Return ONLY 3 replies, one per line, no numbering."""

        response = await chat.send_message(UserMessage(text=prompt))
        
        lines = [line.strip() for line in response.text.strip().split("\n") if line.strip()]
        return lines[:3] if len(lines) >= 3 else [
            "That's so cool!",
            "Tell me more!",
            "I totally agree",
        ]
        
    except Exception as e:
        print(f"Error generating reply suggestions: {e}")
        return [
            "That's interesting!",
            "I feel the same way",
            "What else do you enjoy?",
        ]


# ============== MOCK DATA FOR TESTING ==============

def create_mock_conversations(user_id: str, match_profiles: List[Dict]):
    """Create mock conversations for testing"""
    for i, match in enumerate(match_profiles[:3]):
        match_id = match.get("user_id", f"mock_user_{i}")
        conv = get_or_create_conversation(user_id, match_id)
        
        if i == 0:
            # Active conversation with messages
            conv["status"] = "active"
            send_message(match_id, user_id, "Hey! I saw you love Christopher Nolan films too!", "text")
            send_message(user_id, match_id, "Yes! Interstellar is my all-time favorite", "text")
            send_message(match_id, user_id, "Same here! The docking scene gives me chills every time", "text")
            conv["status"] = "active"
            
        elif i == 1:
            # Message request (pending)
            conv["status"] = "pending"
            send_message(match_id, user_id, "Hi! Your movie taste is incredible. Would love to chat!", "text")
            
        elif i == 2:
            # Another active conversation
            conv["status"] = "active"
            send_message(match_id, user_id, "What did you think of Oppenheimer?", "text")
            send_message(user_id, match_id, "Absolutely mind-blowing! Saw it in IMAX", "text")
            conv["status"] = "active"
