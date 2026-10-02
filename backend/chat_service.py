"""
Chat Service for Film Companion

Handles:
- Messages (send, receive, list)
- Message requests (accept, decline)
- Conversations management
- Unmatch & Report
- Meeting verification
- AI ice breakers & reply suggestions

Now with MongoDB persistence for production use.
"""

import logging
import random
from datetime import datetime
from typing import List, Dict, Optional, Any
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

from settings import settings  # noqa: E402  (dotenv must be loaded first)
from llm_client import llm_chat, llm_chat_json, llm_available, LLMError  # noqa: E402


class ChatAccessDenied(Exception):
    """The caller may not touch this conversation: it does not exist, the
    caller is not a participant, or it is in the wrong state for the action.
    server.py maps this to 404 so conversation ids are never confirmed."""


# Conversations in these states can no longer receive messages.
_CLOSED_STATUSES = ("unmatched", "declined", "deleted", "blocked")

# Supabase audit logger (best-effort, never blocks)
try:
    import supabase_service as supa_audit  # type: ignore
except Exception as _e:  # pragma: no cover
    supa_audit = None
    logger.warning(f"supabase_service unavailable in chat_service: {_e}")

# MongoDB database reference (will be set by server.py)
_db = None

def set_chat_db(db):
    """Set the MongoDB database reference"""
    global _db
    _db = db
    logger.info("Chat service connected to MongoDB")


def get_conversation_id(user1_id: str, user2_id: str) -> str:
    """Generate a consistent conversation ID for two users"""
    return "_".join(sorted([user1_id, user2_id]))


async def get_or_create_conversation(user1_id: str, user2_id: str) -> Dict:
    """Get existing conversation or create a new one"""
    conv_id = get_conversation_id(user1_id, user2_id)
    
    # Try to find existing conversation
    existing = await _db.chat_conversations.find_one({"conversation_id": conv_id})
    
    if existing:
        # Remove MongoDB _id field
        existing.pop("_id", None)
        return existing
    
    # Create new conversation - user1_id is the initiator (sender of first message)
    new_conv = {
        "conversation_id": conv_id,
        "participants": [user1_id, user2_id],
        "created_at": datetime.utcnow().isoformat(),
        "status": "pending",  # pending, active, unmatched, declined
        "initiated_by": user1_id,  # Track who started the conversation
        "last_message": None,
        "last_message_at": None,
        "unread_count": {user1_id: 0, user2_id: 0},
        "meeting_status": None,  # None, "asked", "confirmed", "reported"
        "verification_status": None,  # None, "same_person", "different_person"
    }
    
    await _db.chat_conversations.insert_one(new_conv.copy())
    return new_conv


async def send_message(
    sender_id: str,
    receiver_id: str,
    content: str,
    message_type: str = "text",  # text, image, voice, gif
    media_url: Optional[str] = None,
    auto_reply: bool = True  # Enable AI auto-reply for testing
) -> Dict:
    """Send a message to another user.

    Raises ValueError for a self-message and ChatAccessDenied when the
    conversation is closed (unmatched / declined / deleted / blocked).
    """
    if not sender_id or not receiver_id:
        raise ValueError("sender_id and receiver_id are required")
    if sender_id == receiver_id:
        raise ValueError("Cannot message yourself")

    conv = await get_or_create_conversation(sender_id, receiver_id)
    conv_id = conv["conversation_id"]
    conv_status = conv["status"]
    participants = conv.get("participants") or []
    if sender_id not in participants or receiver_id not in participants:
        raise ChatAccessDenied()
    if conv_status in _CLOSED_STATUSES:
        raise ChatAccessDenied()

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
        "conversation_status": conv_status,  # Include conversation status in response
    }
    
    # Insert message to MongoDB
    await _db.chat_messages.insert_one(message.copy())
    
    # Update conversation atomically: one $inc for the receiver's unread
    # counter (no read-modify-write race) plus a message counter. The
    # PRE-update document tells us whether this was the conversation's first
    # message, so no per-send count_documents is needed. Legacy rows without
    # message_count fall back to last_message_at (None until the 1st message).
    update_data = {
        "last_message": content[:50] + "..." if len(content) > 50 else content,
        "last_message_at": message["created_at"],
    }
    before_update = await _db.chat_conversations.find_one_and_update(
        {"conversation_id": conv_id},
        {
            "$set": update_data,
            "$inc": {f"unread_count.{receiver_id}": 1, "message_count": 1},
        },
        projection={"_id": 0, "message_count": 1, "last_message_at": 1},
    )
    is_first_message = bool(before_update) and not (
        before_update.get("message_count") or before_update.get("last_message_at")
    )

    # If this is first message in a pending conversation, add to message requests
    is_new_request = conv_status == "pending" and is_first_message
    if is_new_request:
        request = {
            "conversation_id": conv_id,
            "from_user_id": sender_id,
            "to_user_id": receiver_id,
            "preview": content[:100],
            "created_at": message["created_at"],
        }
        await _db.chat_requests.insert_one(request)
        logger.info(f"Created message request from {sender_id} to {receiver_id}")

    # Audit log — every user-to-user message (best-effort, non-blocking).
    # METADATA ONLY: message bodies never leave MongoDB.
    if supa_audit is not None:
        try:
            await supa_audit.log_user_chat_message(
                conversation_id=conv_id,
                sender_id=sender_id,
                receiver_id=receiver_id,
                content_length=len(content or ""),
                message_type=message_type or "text",
                is_read=False,
                is_first_message=is_new_request,
            )
            if is_new_request:
                await supa_audit.log_match_event(
                    user_id=sender_id,
                    event_type="request_sent",
                    target_user_id=receiver_id,
                    source="chat",
                    payload={"conversation_id": conv_id},
                )
        except Exception as _e:
            logger.debug(f"audit (send_message) skipped: {_e}")

    return message


async def get_messages(
    conversation_id: str,
    viewer_id: str,
    limit: int = 50,
    before: Optional[str] = None,
) -> List[Dict]:
    """Get messages for a conversation. Only a participant may read it:
    raises ChatAccessDenied if the conversation is missing or `viewer_id`
    (the authenticated caller) is not one of its participants."""
    conv = await _db.chat_conversations.find_one(
        {"conversation_id": conversation_id}, {"_id": 0, "participants": 1}
    )
    if not conv or not viewer_id or viewer_id not in (conv.get("participants") or []):
        raise ChatAccessDenied()
    return await _fetch_messages(conversation_id, limit, before)


async def _fetch_messages(conversation_id: str, limit: int = 50, before: Optional[str] = None) -> List[Dict]:
    """Raw message read with NO access check — internal use only (callers
    must already have authorised the viewer)."""
    limit = max(1, min(int(limit or 50), 200))
    query = {"conversation_id": conversation_id}

    if before:
        query["created_at"] = {"$lt": before}

    cursor = _db.chat_messages.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    messages = await cursor.to_list(length=limit)

    return messages


async def get_conversations(user_id: str) -> List[Dict]:
    """Get all conversations relevant to a user.

    Returns three categories:
      * active – live two-way conversations
      * pending – outgoing message requests the user initiated
      * unmatched – conversations the OTHER side ended (kept visible to this
        user as a read-only entry so they can still review history,
        report, or mark "did you meet?"). Conversations the user themself
        unmatched are NOT returned here.
    """
    # 1. Active conversations
    active_conversations = await _db.chat_conversations.find(
        {"participants": user_id, "status": "active"},
        {"_id": 0},
    ).sort("last_message_at", -1).to_list(length=100)

    # 2. Pending where this user is the initiator
    all_pending = await _db.chat_conversations.find(
        {"participants": user_id, "status": "pending"},
        {"_id": 0},
    ).sort("last_message_at", -1).to_list(length=50)

    pending_conversations = []
    for conv in all_pending:
        if conv.get("initiated_by") == user_id:
            pending_conversations.append(conv)
        elif not conv.get("initiated_by"):
            first_msg = await _db.chat_messages.find_one(
                {"conversation_id": conv["conversation_id"]},
                {"_id": 0, "sender_id": 1},
                sort=[("created_at", 1)],
            )
            if first_msg and first_msg.get("sender_id") == user_id:
                pending_conversations.append(conv)
                await _db.chat_conversations.update_one(
                    {"conversation_id": conv["conversation_id"]},
                    {"$set": {"initiated_by": user_id}},
                )

    # 3. Unmatched conversations — only those the OTHER party ended.
    # If the current user unmatched, we hide it from their chat list (they
    # took the action). The other party still sees it read-only.
    unmatched_raw = await _db.chat_conversations.find(
        {
            "participants": user_id,
            "status": "unmatched",
            "unmatched_by": {"$ne": user_id},
        },
        {"_id": 0},
    ).sort("unmatched_at", -1).to_list(length=100)

    # Tag unmatched convos so the frontend renders the read-only state.
    for conv in unmatched_raw:
        conv["is_read_only"] = True
        conv["is_unmatched"] = True

    all_conversations = active_conversations + pending_conversations + unmatched_raw

    # Resolve the other participant of each conversation. Self-/corrupt
    # conversations (no other participant) are skipped instead of 500-ing
    # the whole list, and user info is batch-fetched (no N+1).
    pairs = []
    for conv in all_conversations:
        other_user_id = next((p for p in conv.get("participants") or [] if p != user_id), None)
        if other_user_id is None:
            continue
        pairs.append((conv, other_user_id))
    users_info = await get_users_info([other_id for _, other_id in pairs])

    result = []
    for conv, other_user_id in pairs:
        other_user = users_info.get(other_user_id) or _unknown_user_info(other_user_id)
        result.append({
            **conv,
            "other_user_id": other_user_id,
            "unread": conv.get("unread_count", {}).get(user_id, 0),
            "other_user": other_user,
            "is_pending": conv.get("status") == "pending",
            "is_unmatched": conv.get("status") == "unmatched",
            "is_read_only": conv.get("status") == "unmatched",
        })

    # Order: active/pending sorted by last_message_at desc;
    # unmatched sorted by unmatched_at desc and pushed to the bottom.
    def sort_key(c):
        if c.get("status") == "unmatched":
            return (1, c.get("unmatched_at") or "")
        return (0, c.get("last_message_at") or "")

    # Negate timestamps for desc within each bucket by reversing per bucket.
    active_pending = [c for c in result if c.get("status") != "unmatched"]
    unmatched_list = [c for c in result if c.get("status") == "unmatched"]
    active_pending.sort(key=lambda x: x.get("last_message_at") or "", reverse=True)
    unmatched_list.sort(key=lambda x: x.get("unmatched_at") or "", reverse=True)

    return active_pending + unmatched_list


async def get_user_info(user_id: str) -> Dict:
    """Get basic user info for chat display"""
    # Check if it's a mock user
    if user_id.startswith("mock_user_"):
        # First try the small curated dict (has nicer chat avatars)
        mock_profiles = {
            "mock_user_001": {
                "user_id": "mock_user_001",
                "name": "Priya Sharma",
                "avatar": "https://images.unsplash.com/photo-1622207691293-5cd80466dab3?w=100&h=100&fit=crop",
                "location": "Mumbai",
                "age": 28
            },
            "mock_user_002": {
                "user_id": "mock_user_002",
                "name": "Arjun Mehta",
                "avatar": None,
                "location": "Delhi",
                "age": 30
            },
            "mock_user_003": {
                "user_id": "mock_user_003",
                "name": "Ananya Reddy",
                "avatar": "https://images.unsplash.com/photo-1463335361701-e90f4c5045d0?w=100&h=100&fit=crop",
                "location": "Bangalore",
                "age": 26
            },
            "mock_user_005": {
                "user_id": "mock_user_005",
                "name": "Neha Gupta",
                "avatar": "https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?w=100&h=100&fit=crop",
                "location": "Pune",
                "age": 25
            },
            "mock_user_007": {
                "user_id": "mock_user_007",
                "name": "Sanjana Iyer",
                "avatar": "https://images.unsplash.com/flagged/photo-1551854716-8b811be39e7e?w=100&h=100&fit=crop",
                "location": "Hyderabad"
            },
            "mock_user_009": {
                "user_id": "mock_user_009",
                "name": "Meera Nair",
                "avatar": "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=100&h=100&fit=crop",
                "location": "Kochi"
            },
            "mock_user_011": {
                "user_id": "mock_user_011",
                "name": "Riya Patel",
                "avatar": "https://images.unsplash.com/photo-1729101143873-d80050bae219?w=100&h=100&fit=crop",
                "location": "Ahmedabad"
            },
            "mock_user_015": {
                "user_id": "mock_user_015",
                "name": "Ishita Das",
                "avatar": "https://images.unsplash.com/photo-1706943262117-b35de4ba50b4?w=100&h=100&fit=crop",
                "location": "Kolkata"
            },
            "mock_user_017": {
                "user_id": "mock_user_017",
                "name": "Kavya Menon",
                "avatar": "https://images.pexels.com/photos/34061448/pexels-photo-34061448.jpeg?auto=compress&w=100&h=100&fit=crop",
                "location": "Chennai"
            },
            "mock_user_019": {
                "user_id": "mock_user_019",
                "name": "Sneha Krishnan",
                "avatar": "https://images.pexels.com/photos/37145167/pexels-photo-37145167.jpeg?auto=compress&w=100&h=100&fit=crop",
                "location": "Hyderabad",
                "age": 26
            },
        }
        if user_id in mock_profiles:
            return mock_profiles[user_id]

        # Fallback to the full MOCK_USERS catalogue (matchmaking_service has all 30)
        # so users like mock_user_004, 006, 008, etc. resolve to a real name
        # instead of "Unknown".
        try:
            from matchmaking_service import get_mock_user_by_id
            full_mock = get_mock_user_by_id(user_id)
            if full_mock:
                return {
                    "user_id": full_mock.get("user_id"),
                    "name": full_mock.get("name", "Unknown"),
                    "avatar": full_mock.get("profile_picture")
                              or (full_mock.get("pictures", [None])[0]
                                  if full_mock.get("pictures") else None),
                    "location": full_mock.get("location"),
                    "age": full_mock.get("age"),
                }
        except Exception as e:
            logger.warning(f"Could not resolve mock user {user_id} via MOCK_USERS: {e}")

        return {"user_id": user_id, "name": "Unknown", "avatar": None, "location": "Unknown", "age": None}
    
    # Try to find in users collection - get more comprehensive info
    user = await _db.users.find_one({"user_id": user_id}, _USER_INFO_PROJECTION)
    if user:
        # Get profile picture from pictures collection
        fallback_picture = None
        if not user.get("picture"):
            # Try to get first picture from pictures collection
            pics = await _db.user_pictures.find_one({"user_id": user_id}, {"_id": 0, "picture_1": 1})
            fallback_picture = pics.get("picture_1") if pics else None
        return _format_user_info(user, fallback_picture)

    return _unknown_user_info(user_id)


_USER_INFO_PROJECTION = {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "dob": 1, "location": 1}


def _unknown_user_info(user_id: str) -> Dict:
    return {"user_id": user_id, "name": "Unknown", "avatar": None, "location": None, "age": None}


def _format_user_info(user: Dict, fallback_picture: Optional[str] = None) -> Dict:
    """Shape a `users` doc for chat display (shared by get_user_info and the
    batched get_users_info so both return identical dicts)."""
    # Calculate age from dob
    age = None
    if user.get("dob"):
        try:
            dob = datetime.fromisoformat(user["dob"].replace("Z", "+00:00")) if isinstance(user["dob"], str) else user["dob"]
            today = datetime.now()
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        except (ValueError, TypeError, AttributeError):
            pass

    # Profile picture, else first picture from the pictures collection
    avatar = user.get("picture")
    if not avatar and fallback_picture:
        avatar = fallback_picture

    # Format location - only city, state for privacy
    location = None
    loc = user.get("location")
    if loc and isinstance(loc, dict):
        parts = []
        if loc.get("city"):
            parts.append(loc["city"])
        if loc.get("state"):
            parts.append(loc["state"])
        location = ", ".join(parts) if parts else None

    return {
        "user_id": user.get("user_id"),
        "name": user.get("name", "Unknown"),
        "avatar": avatar,
        "location": location,
        "age": age
    }


async def get_users_info(user_ids: List[str]) -> Dict[str, Dict]:
    """Batched get_user_info: {user_id: info} with ONE `$in` query per
    collection instead of a round-trip per user. Every requested id is in the
    result with exactly the shape get_user_info() returns. Mock users
    (mock_user_*) resolve via get_user_info's in-memory mock branch."""
    info: Dict[str, Dict] = {}
    real_ids: List[str] = []
    for uid in dict.fromkeys(u for u in user_ids if u is not None):
        if uid.startswith("mock_user_"):
            info[uid] = await get_user_info(uid)  # in-memory, no DB round-trip
        else:
            real_ids.append(uid)
    if not real_ids:
        return info

    users_by_id: Dict[str, Dict] = {}
    async for user in _db.users.find({"user_id": {"$in": real_ids}}, _USER_INFO_PROJECTION):
        users_by_id.setdefault(user.get("user_id"), user)

    need_pics = [uid for uid, u in users_by_id.items() if not u.get("picture")]
    pics_by_id: Dict[str, Optional[str]] = {}
    if need_pics:
        async for pics in _db.user_pictures.find(
            {"user_id": {"$in": need_pics}}, {"_id": 0, "user_id": 1, "picture_1": 1}
        ):
            pics_by_id.setdefault(pics.get("user_id"), pics.get("picture_1"))

    for uid in real_ids:
        user = users_by_id.get(uid)
        info[uid] = _format_user_info(user, pics_by_id.get(uid)) if user else _unknown_user_info(uid)
    return info


async def get_message_requests(user_id: str) -> List[Dict]:
    """Get pending message requests for a user"""
    cursor = _db.chat_requests.find(
        {"to_user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1)
    
    requests = await cursor.to_list(length=50)
    
    # Enrich with sender info (batched — no N+1)
    users_info = await get_users_info([req.get("from_user_id") for req in requests])
    for req in requests:
        req["from_user"] = users_info.get(req.get("from_user_id")) or _unknown_user_info(req.get("from_user_id"))
    
    return requests


async def _resolve_message_request(
    user_id: str, conversation_id: str, new_status: str, event_type: str
) -> bool:
    """Move a PENDING request that `user_id` RECEIVED (participant, not the
    initiator) to `new_status` with ONE conditional update. Raises
    ChatAccessDenied if the conversation is missing, not pending, or the
    caller is the sender / not a participant."""
    if not user_id or not conversation_id:
        raise ChatAccessDenied()
    result = await _db.chat_conversations.update_one(
        {
            "conversation_id": conversation_id,
            "participants": user_id,
            "initiated_by": {"$ne": user_id},
            "status": "pending",
        },
        {"$set": {"status": new_status}}
    )
    if result.matched_count == 0:
        raise ChatAccessDenied()

    # The request row(s) for this conversation are now resolved
    await _db.chat_requests.delete_many({"conversation_id": conversation_id})

    # Audit log
    if supa_audit is not None:
        try:
            await supa_audit.log_match_event(
                user_id=user_id,
                event_type=event_type,
                target_user_id=None,
                source="chat",
                payload={"conversation_id": conversation_id},
            )
        except Exception as _e:
            logger.debug(f"audit ({event_type}) skipped: {_e}")
    return True


async def accept_message_request(user_id: str, conversation_id: str) -> bool:
    """Accept a message request (recipient only — see _resolve_message_request)."""
    return await _resolve_message_request(user_id, conversation_id, "active", "request_accepted")


async def decline_message_request(user_id: str, conversation_id: str) -> bool:
    """Decline a message request (recipient only — see _resolve_message_request)."""
    return await _resolve_message_request(user_id, conversation_id, "declined", "request_declined")


async def unmatch_user(user_id: str, other_user_id: str, reason: Optional[str] = None) -> bool:
    """Unmatch with a user. Only touches a conversation both users are
    participants of; returns False if there is none."""
    if not user_id or not other_user_id:
        return False
    conv_id = get_conversation_id(user_id, other_user_id)

    result = await _db.chat_conversations.update_one(
        {"conversation_id": conv_id, "participants": {"$all": [user_id, other_user_id]}},
        {"$set": {
            "status": "unmatched",
            "unmatched_by": user_id,
            "unmatch_reason": reason,
            "unmatched_at": datetime.utcnow().isoformat()
        }}
    )

    # Audit log (only when a conversation was actually unmatched)
    if supa_audit is not None and result.modified_count > 0:
        try:
            await supa_audit.log_unmatch_event(
                user_id=user_id,
                other_user_id=other_user_id,
                conversation_id=conv_id,
                reason=reason,
            )
        except Exception as _e:
            logger.debug(f"audit (unmatch) skipped: {_e}")

    return result.modified_count > 0


async def report_user(
    reporter_id: str,
    reported_id: str,
    reason: str,
    details: Optional[str] = None
) -> Dict:
    """Report a user. A report needs no conversation (profiles can be
    reported from the feed); `reporter_id` must be the authenticated caller."""
    if not reporter_id or not reported_id:
        raise ValueError("reporter_id and reported_id are required")
    if reporter_id == reported_id:
        raise ValueError("Cannot report yourself")
    report = {
        "report_id": f"report_{datetime.utcnow().timestamp()}",
        "reporter_id": reporter_id,
        "reported_id": reported_id,
        "reason": reason,
        "details": details,
        "created_at": datetime.utcnow().isoformat(),
        "status": "pending",
    }
    
    await _db.chat_reports.insert_one(report.copy())
    logger.info(f"Report created: {report['report_id']}")

    # Audit log
    if supa_audit is not None:
        try:
            await supa_audit.log_report_event(
                reporter_id=reporter_id,
                reported_user_id=reported_id,
                reason=reason,
                details=details,
            )
        except Exception as _e:
            logger.debug(f"audit (report) skipped: {_e}")

    return report


async def set_meeting_status(
    user_id: str,
    other_user_id: str,
    did_meet: bool,
    was_same_person: Optional[bool] = None
) -> bool:
    """Set meeting verification status. Raises ChatAccessDenied unless a
    conversation exists with BOTH users as participants."""
    if not user_id or not other_user_id or user_id == other_user_id:
        raise ChatAccessDenied()
    conv_id = get_conversation_id(user_id, other_user_id)

    update_data = {
        "meeting_status": "confirmed" if did_meet else "not_met"
    }
    if was_same_person is not None:
        update_data["verification_status"] = "same_person" if was_same_person else "different_person"

    result = await _db.chat_conversations.update_one(
        {"conversation_id": conv_id, "participants": {"$all": [user_id, other_user_id]}},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise ChatAccessDenied()

    return True


async def mark_messages_read(user_id: str, conversation_id: str) -> bool:
    """Mark all messages in a conversation as read. Raises ChatAccessDenied
    if the caller is not a participant."""
    if not user_id or not conversation_id:
        raise ChatAccessDenied()
    # Reset unread count (participant-scoped)
    result = await _db.chat_conversations.update_one(
        {"conversation_id": conversation_id, "participants": user_id},
        {"$set": {f"unread_count.{user_id}": 0}}
    )
    if result.matched_count == 0:
        raise ChatAccessDenied()

    # Mark messages as read
    await _db.chat_messages.update_many(
        {"conversation_id": conversation_id, "receiver_id": user_id},
        {"$set": {"read": True}}
    )
    
    return True


# ============== AI FEATURES ==============
# Every LLM call goes through llm_client (OpenAI). Each feature keeps its
# deterministic template fallback for when no key is configured
# (llm_available() is False) or the call fails. Prompt / completion text is
# never logged - only the exception type.

def _as_suggestions(value: Any, max_len: int) -> List[str]:
    """Normalise an LLM "list of strings" JSON answer: drop non-strings and
    blanks, strip stray bullets / quotes, cap each item's length."""
    if isinstance(value, str):
        value = value.split("\n")
    if not isinstance(value, list):
        return []
    out: List[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        text = item.strip().lstrip("-*• ").strip().strip('"').strip()
        if text:
            out.append(text[:max_len])
    return out


def _movie_titles(profile: Dict, n: int) -> str:
    """Comma-joined titles of a profile's top movies (dicts or plain strings)."""
    titles = []
    for m in (profile.get("topMovies") or [])[:n]:
        title = m.get("title", "") if isinstance(m, dict) else str(m or "")
        if title:
            titles.append(title)
    return ", ".join(titles)


async def generate_ice_breakers(user_profile: Dict, match_profile: Dict) -> List[str]:
    """Generate AI-powered ice breaker suggestions"""
    if not llm_available():
        # Fallback ice breakers
        return [
            f"Hey {match_profile.get('name', 'there')}! I noticed we both love {match_profile.get('genres', ['movies'])[0] if match_profile.get('genres') else 'movies'}. What's your all-time favorite?",
            "Hi! Your taste in movies is impressive. Have you seen anything good lately?",
            f"Hey! I see we're both into {match_profile.get('ottTheatre', 'movies')}. What's on your watchlist right now?",
        ]

    try:
        user_genres = ", ".join((user_profile.get("genres") or [])[:3])
        match_genres = ", ".join((match_profile.get("genres") or [])[:3])
        match_movies = _movie_titles(match_profile, 3)
        shared = match_profile.get("shared_interests") or []

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

Respond with JSON only, exactly in this shape: {{"messages": ["...", "...", "..."]}}"""

        data = await llm_chat_json(
            "You are a friendly dating app assistant that generates ice breaker messages. You always answer in JSON.",
            prompt,
            model=settings.llm_model_default,
            timeout=20,
            max_tokens=300,
            temperature=0.8,
        )
        lines = _as_suggestions(data.get("messages"), 150)
        return lines[:3] if len(lines) >= 3 else lines + [
            "Hey! Love your movie taste!",
            f"Hi {match_profile.get('name', 'there')}! What are you watching?",
            "What's the last movie that really surprised you?",
        ][:3-len(lines)]

    except Exception as e:
        logger.warning("Ice breaker generation failed (%s); using templates", type(e).__name__)
        return [
            f"Hey {match_profile.get('name', 'there')}! What's your favorite movie of all time?",
            "Hi! I see we have similar taste in movies. Seen anything good lately?",
            f"Hey! Your profile caught my eye. What got you into {match_profile.get('genres', ['movies'])[0] if match_profile.get('genres') else 'movies'}?",
        ]


async def generate_reply_suggestions(
    conversation_messages: List[Dict],
    user_profile: Dict,
    match_profile: Dict
) -> List[str]:
    """Generate AI-powered reply suggestions based on conversation context"""
    if not llm_available() or not conversation_messages:
        return [
            "That sounds amazing!",
            "I'd love to hear more about that",
            "What do you think about...?",
        ]

    try:
        # Get last few messages for context
        recent_messages = conversation_messages[-5:]
        conversation_text = "\n".join([
            f"{'You' if m.get('sender_id') == user_profile.get('user_id') else match_profile.get('name', 'Them')}: {str(m.get('content') or '')[:500]}"
            for m in recent_messages
        ])

        prompt = f"""Based on this conversation, suggest 3 short reply options.

Conversation:
{conversation_text}

You are: {user_profile.get('name', 'User')}
You like: {', '.join((user_profile.get('genres') or [])[:3])}

Rules:
- Each reply should be under 50 characters
- Be natural and conversational
- One should be a question to keep conversation going
- One should be enthusiastic/agreeing
- One should share something personal

Respond with JSON only, exactly in this shape: {{"replies": ["...", "...", "..."]}}"""

        data = await llm_chat_json(
            "You are a friendly dating app assistant that generates reply suggestions. You always answer in JSON.",
            prompt,
            model=settings.llm_model_default,
            timeout=20,
            max_tokens=200,
            temperature=0.8,
        )
        lines = _as_suggestions(data.get("replies"), 100)
        return lines[:3] if len(lines) >= 3 else [
            "That's so cool!",
            "Tell me more!",
            "I totally agree",
        ]

    except Exception as e:
        logger.warning("Reply suggestion generation failed (%s); using templates", type(e).__name__)
        return [
            "That's interesting!",
            "I feel the same way",
            "What else do you enjoy?",
        ]


# Canned bot replies: no LLM configured / LLM call failed.
_BOT_FALLBACK_REPLIES = [
    "That's so interesting! Tell me more about that.",
    "I totally agree! Movies are such a great way to connect.",
    "Haha, I love your perspective on that!",
    "That reminds me of one of my favorite films.",
    "What else do you enjoy watching?",
    "I've been meaning to watch that! Is it worth it?",
    "Great taste! Have you seen any good ones lately?",
]
_BOT_ERROR_REPLIES = [
    "That's really cool! What else do you like?",
    "I love that! Tell me more!",
    "Haha, we have so much in common!",
    "That's a great point!",
]


async def generate_ai_auto_reply(
    conversation_id: str,
    user_message: str,
    match_profile: Dict
) -> str:
    """Generate an auto-reply from a MOCK match (demo bots only).

    Returns "" when bot replies are switched off (settings.mock_bot_replies);
    add_ai_reply_to_conversation() ignores empty content."""
    if not settings.mock_bot_replies:
        return ""
    if not llm_available():
        # Fallback replies
        return random.choice(_BOT_FALLBACK_REPLIES)

    try:
        bot_id = match_profile.get('user_id')
        # Conversation history for context. _fetch_messages skips the access
        # check: the caller (the sender's own send) already authorised it.
        messages = await _fetch_messages(conversation_id, limit=6)
        history = [
            {
                "role": "assistant" if m.get("sender_id") == bot_id else "user",
                "content": str(m.get("content") or "")[:500],
            }
            for m in reversed(messages)  # _fetch_messages is newest-first
            if m.get("content")
        ]
        # The user's latest message is already stored - send it as this turn.
        user_turn = str(user_message or "")[:1000]
        if history and history[-1]["role"] == "user" and history[-1]["content"] == user_turn[:500]:
            history.pop()

        system = f"""You are {match_profile.get('name', 'a friendly person')} on a movie dating app.
You are {match_profile.get('age', 28)} years old from {match_profile.get('location', 'India')}.
You love movies, especially {', '.join((match_profile.get('genres') or ['Drama', 'Comedy'])[:3])}.
Your favorite movies include {_movie_titles(match_profile, 2) or 'lots of classics'}.
Reply as {match_profile.get('name', 'yourself')} naturally and friendly to continue the conversation. Keep it short (under 100 characters)."""

        reply = await llm_chat(
            system,
            user_turn or "Hi!",
            model=settings.llm_model_default,
            history=history,
            timeout=20,
            max_tokens=120,
            temperature=0.8,
        )
        reply = (reply or "").strip().strip('"').strip()
        if not reply:
            raise LLMError("empty auto-reply")
        return reply[:200]

    except Exception as e:
        logger.warning("Bot auto-reply generation failed (%s); using canned reply", type(e).__name__)
        return random.choice(_BOT_ERROR_REPLIES)


async def add_ai_reply_to_conversation(
    sender_id: str,
    receiver_id: str,
    content: str
) -> Dict:
    """Add a bot reply from a MOCK user (sender_id = the mock match) to the
    conversation. Returns {} without writing anything when bot replies are
    disabled, the content is empty, the sender is not a mock_* bot (never
    fabricate a message from a real user) or the conversation is closed."""
    if not settings.mock_bot_replies or not content or not str(sender_id or "").startswith("mock_"):
        return {}
    conv = await get_or_create_conversation(sender_id, receiver_id)
    conv_id = conv["conversation_id"]
    if conv.get("status") in _CLOSED_STATUSES:
        return {}

    message = {
        "message_id": f"msg_{datetime.utcnow().timestamp()}_{sender_id[:8]}_ai",
        "conversation_id": conv_id,
        "sender_id": sender_id,
        "receiver_id": receiver_id,
        "content": content,
        "message_type": "text",
        "media_url": None,
        "created_at": datetime.utcnow().isoformat(),
        "read": False,
        "delivered": True,
    }
    
    # Insert message to MongoDB
    await _db.chat_messages.insert_one(message.copy())
    
    # Update conversation
    await _db.chat_conversations.update_one(
        {"conversation_id": conv_id},
        {"$set": {
            "last_message": content[:50] + "..." if len(content) > 50 else content,
            "last_message_at": message["created_at"],
        },
        "$inc": {f"unread_count.{receiver_id}": 1}}
    )
    
    return message


# ============== MOCK DATA FOR TESTING ==============

async def create_mock_conversations(user_id: str, match_profiles: List[Dict] = None):
    """Create mock conversations for testing"""
    # Use default mock profiles if none provided
    if not match_profiles:
        match_profiles = [
            {"user_id": "mock_user_001", "name": "Priya Sharma"},
            {"user_id": "mock_user_002", "name": "Rahul Kapoor"},
            {"user_id": "mock_user_003", "name": "Ananya Reddy"},
        ]
    
    for i, match in enumerate(match_profiles[:3]):
        match_id = match.get("user_id", f"mock_user_{i:03d}")
        
        # Check if conversation already exists
        conv_id = get_conversation_id(user_id, match_id)
        existing = await _db.chat_conversations.find_one({"conversation_id": conv_id})
        
        if existing:
            continue  # Skip if already exists
        
        await get_or_create_conversation(user_id, match_id)

        if i == 0:
            # Active conversation with messages
            await _db.chat_conversations.update_one(
                {"conversation_id": conv_id},
                {"$set": {"status": "active"}}
            )
            await send_message(match_id, user_id, "Hey! I saw you love Christopher Nolan films too!", "text")
            await send_message(user_id, match_id, "Yes! Interstellar is my all-time favorite", "text")
            await send_message(match_id, user_id, "Same here! The docking scene gives me chills every time", "text")
            
        elif i == 1:
            # Message request (pending)
            await send_message(match_id, user_id, "Hi! Your movie taste is incredible. Would love to chat!", "text")
            
        elif i == 2:
            # Another active conversation
            await _db.chat_conversations.update_one(
                {"conversation_id": conv_id},
                {"$set": {"status": "active"}}
            )
            await send_message(match_id, user_id, "What did you think of Oppenheimer?", "text")
            await send_message(user_id, match_id, "Absolutely mind-blowing! Saw it in IMAX", "text")



# ============== MATCH HISTORY FUNCTIONS ==============

async def get_match_history(user_id: str) -> List[Dict]:
    """
    Get complete match history for a user.
    Includes ALL matches (active, unmatched) sorted by most recent first.
    This is a differentiating trust & safety feature.
    """
    if _db is None:
        return []
    
    # Get all conversations where user is a participant
    # Include both active and unmatched conversations
    # IMPORTANT: exclude conversations the user has soft-deleted from their
    # history view (deleted_by_users contains this user_id).
    all_conversations = await _db.chat_conversations.find({
        "participants": user_id,
        "status": {"$in": ["active", "unmatched", "pending"]},
        "deleted_by_users": {"$ne": user_id},
    }).sort("created_at", -1).to_list(length=500)
    
    # Resolve the other participant (skip self-/corrupt conversations) and
    # batch-fetch their info (no N+1)
    pairs = []
    for conv in all_conversations:
        other_user_id = next((p for p in conv.get("participants") or [] if p != user_id), None)
        if other_user_id is None:
            continue
        pairs.append((conv, other_user_id))
    users_info = await get_users_info([other_id for _, other_id in pairs])

    history = []
    for conv, other_user_id in pairs:
        # Get other user's basic info
        other_user = users_info.get(other_user_id) or _unknown_user_info(other_user_id)

        # Determine if this user was unmatched BY the other person
        is_unmatched = conv.get("status") == "unmatched"
        unmatched_by = conv.get("unmatched_by")
        was_unmatched_by_other = is_unmatched and unmatched_by == other_user_id
        user_initiated_unmatch = is_unmatched and unmatched_by == user_id
        
        # Build history entry
        entry = {
            "conversation_id": conv["conversation_id"],
            "other_user_id": other_user_id,
            "other_user_name": other_user.get("name", "Unknown"),
            # Only show profile picture if match is active OR if user was unmatched
            # (person who unmatched shouldn't see the profile anymore)
            "other_user_avatar": other_user.get("avatar") if not user_initiated_unmatch else None,
            "matched_at": conv.get("created_at"),
            "last_message_at": conv.get("last_message_at"),
            "status": conv.get("status"),
            "is_active": conv.get("status") == "active",
            "is_unmatched": is_unmatched,
            "was_unmatched_by_other": was_unmatched_by_other,
            "user_initiated_unmatch": user_initiated_unmatch,
            "unmatched_at": conv.get("unmatched_at") if is_unmatched else None,
            "meeting_status": conv.get("meeting_status"),
        }
        
        history.append(entry)
    
    return history


async def get_unmatched_conversation(user_id: str, conversation_id: str) -> Optional[Dict]:
    """
    Get details of an unmatched conversation for read-only viewing.
    Only the person who WAS UNMATCHED can view this.
    """
    if _db is None:
        return None
    
    conv = await _db.chat_conversations.find_one({"conversation_id": conversation_id})
    
    if not conv:
        return None
    
    # Verify user is a participant
    if not user_id or user_id not in conv.get("participants", []):
        return None

    other_user_id = next((p for p in conv["participants"] if p != user_id), None)
    if other_user_id is None:
        return None  # self-conversation / corrupt row

    # Check if this user was the one who was unmatched (not the initiator)
    is_unmatched = conv.get("status") == "unmatched"
    unmatched_by = conv.get("unmatched_by")
    was_unmatched_by_other = is_unmatched and unmatched_by == other_user_id
    
    # Get other user's info (but hide avatar for read-only view)
    other_user = await get_user_info(other_user_id)
    
    return {
        "conversation_id": conversation_id,
        "other_user_id": other_user_id,
        "other_user_name": other_user.get("name", "Unknown"),
        "other_user_avatar": None,  # Don't show avatar in read-only mode
        "status": conv.get("status"),
        "is_read_only": was_unmatched_by_other,
        "was_unmatched_by_other": was_unmatched_by_other,
        "unmatched_at": conv.get("unmatched_at"),
        "created_at": conv.get("created_at"),
        "meeting_status": conv.get("meeting_status"),
    }


async def delete_chat_history(user_id: str, conversation_id: str) -> bool:
    """
    Delete chat history for a user (local deletion only).
    The user can choose to delete the conversation from their view.
    This doesn't affect the other user's view or reports.
    """
    if _db is None:
        return False
    
    # Mark as deleted for this user (soft delete) — participant-scoped, so a
    # non-participant gets ChatAccessDenied instead of touching the row.
    if not user_id or not conversation_id:
        raise ChatAccessDenied()
    result = await _db.chat_conversations.update_one(
        {"conversation_id": conversation_id, "participants": user_id},
        {"$addToSet": {"deleted_by_users": user_id}}
    )
    if result.matched_count == 0:
        raise ChatAccessDenied()
    
    logger.info(f"User {user_id} deleted chat history for conversation {conversation_id}")
    
    return result.modified_count > 0


async def can_user_view_conversation(user_id: str, conversation_id: str) -> Dict:
    """
    Check if user can view a conversation and in what mode.
    Returns: { can_view: bool, is_read_only: bool, reason: str }
    """
    if _db is None:
        return {"can_view": False, "is_read_only": False, "reason": "Database not connected"}
    
    conv = await _db.chat_conversations.find_one({"conversation_id": conversation_id})
    
    if not conv:
        return {"can_view": False, "is_read_only": False, "reason": "Conversation not found"}
    
    if not user_id or user_id not in conv.get("participants", []):
        return {"can_view": False, "is_read_only": False, "reason": "Not a participant"}

    # Check if user deleted this conversation
    if user_id in conv.get("deleted_by_users", []):
        return {"can_view": False, "is_read_only": False, "reason": "Chat deleted"}

    status = conv.get("status")
    unmatched_by = conv.get("unmatched_by")
    
    if status == "active" or status == "pending":
        return {"can_view": True, "is_read_only": False, "reason": "Active conversation"}
    
    if status == "unmatched":
        if unmatched_by == user_id:
            # User initiated unmatch - they can't see the conversation anymore
            return {"can_view": False, "is_read_only": False, "reason": "You unmatched this user"}
        else:
            # User was unmatched BY the other person - read-only access
            return {"can_view": True, "is_read_only": True, "reason": "User has unmatched with you"}
    
    return {"can_view": False, "is_read_only": False, "reason": "Unknown status"}
