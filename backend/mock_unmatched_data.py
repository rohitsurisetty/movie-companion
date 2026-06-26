"""
Mock Unmatched Data Generator

Seeds two recognisable mock users (Anjali Iyer & Priya Bhatia) with a realistic
chat history with the given target user, then marks the conversation as
unmatched by them. This lets the target user properly test:
  - Match History (read-only)
  - Post-unmatch View Chat
  - Post-unmatch Report flow

The seeded users are inserted into:
  - users          (basic profile, so get_user_info resolves the real name)
  - user_profiles  (full profile for "View Profile" modal)
  - user_pictures  (gallery photos)
  - chat_conversations (status: unmatched, unmatched_by: them)
  - chat_messages  (realistic message history)

Usage:
  python -m mock_unmatched_data <target_user_id>

Or from FastAPI:
  await seed_unmatched_for_user(db, target_user_id)
"""

import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta
from typing import Dict, List

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

logger = logging.getLogger(__name__)


# ============== MOCK PROFILES ==============
ANJALI_USER_ID = "mock_unmatched_anjali_iyer"
PRIYA_USER_ID = "mock_unmatched_priya_bhatia"

ANJALI_PROFILE = {
    "user_id": ANJALI_USER_ID,
    "name": "Anjali Iyer",
    "email": "anjali.iyer@example.com",
    "age": 27,
    "gender": "Female",
    "dob": "1998-05-14T00:00:00",
    "bio": "Indie film lover + chai snob. Looking for someone who can sit through a 3-hour Iranian movie without checking their phone.",
    "location": {"city": "Bengaluru", "state": "Karnataka", "country": "India"},
    "picture": "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&h=800&fit=crop",
    "pictures": [
        "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&h=800&fit=crop",
        "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&h=800&fit=crop",
        "https://images.unsplash.com/photo-1502323777036-f29e3972d82f?w=600&h=800&fit=crop",
    ],
    "genres": ["Drama", "Indie", "Thriller", "Foreign"],
    "filmLanguages": ["English", "Tamil", "Hindi"],
    "languagesSpoken": ["English", "Tamil", "Hindi"],
    "topMovies": [
        {"title": "Parasite", "tmdb_id": 496243},
        {"title": "Lunchbox", "tmdb_id": 173400},
        {"title": "A Separation", "tmdb_id": 64682},
    ],
    "height": "5'4\"",
    "religion": "Hindu",
    "smoking": "Never",
    "drinking": "Socially",
    "exercise": "Sometimes",
    "education": "Master's Degree",
    "workProfile": "UX Designer",
    "intent": "Long-term relationship",
}

PRIYA_PROFILE = {
    "user_id": PRIYA_USER_ID,
    "name": "Priya Bhatia",
    "email": "priya.bhatia@example.com",
    "age": 26,
    "gender": "Female",
    "dob": "1999-09-22T00:00:00",
    "bio": "Rom-com apologist. PVR Director's Cut on Fridays. Will fight you over Imtiaz Ali movies.",
    "location": {"city": "Mumbai", "state": "Maharashtra", "country": "India"},
    "picture": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=800&fit=crop",
    "pictures": [
        "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=800&fit=crop",
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&h=800&fit=crop",
        "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=800&fit=crop",
    ],
    "genres": ["Romance", "Drama", "Comedy"],
    "filmLanguages": ["Hindi", "English"],
    "languagesSpoken": ["Hindi", "English", "Punjabi"],
    "topMovies": [
        {"title": "Jab We Met", "tmdb_id": 14072},
        {"title": "La La Land", "tmdb_id": 313369},
        {"title": "Zindagi Na Milegi Dobara", "tmdb_id": 64689},
    ],
    "height": "5'6\"",
    "religion": "Hindu",
    "smoking": "Never",
    "drinking": "Occasionally",
    "exercise": "Active",
    "education": "Bachelor's Degree",
    "workProfile": "Brand Manager",
    "intent": "Long-term relationship",
}


# ============== CHAT SCRIPTS ==============
# Conversations end with them unmatching, which is what we are testing.
ANJALI_CHAT_SCRIPT: List[Dict] = [
    {"from": "anjali", "text": "Hey! Loved your top movies list. Lunchbox in mine too 😍"},
    {"from": "me", "text": "Haha thanks! That movie ruined me emotionally for a week."},
    {"from": "anjali", "text": "Right?? The unfinished story is the whole point. Most people don't get that."},
    {"from": "me", "text": "Exactly. What are you watching these days?"},
    {"from": "anjali", "text": "Just finished Past Lives. Have you seen it?"},
    {"from": "me", "text": "On my list! Worth it?"},
    {"from": "anjali", "text": "Absolutely. Quiet, gentle, brutal in the best way."},
    {"from": "me", "text": "Sold. Will watch this weekend. Coffee + film sometime?"},
    {"from": "anjali", "text": "Maybe. Let me think about it."},
]

PRIYA_CHAT_SCRIPT: List[Dict] = [
    {"from": "priya", "text": "Heyy 👋 saw you like ZNMD too — instant green flag"},
    {"from": "me", "text": "Haha thanks! Best Bollywood trip movie hands down."},
    {"from": "priya", "text": "Best Bollywood movie PERIOD I'd argue 😤"},
    {"from": "me", "text": "Strong take. What about Dil Chahta Hai then?"},
    {"from": "priya", "text": "Different era, different vibe. Both 10/10."},
    {"from": "me", "text": "Fair. Do you watch at PVR or do home setups?"},
    {"from": "priya", "text": "PVR Director's Cut only. Or nothing 💅"},
    {"from": "me", "text": "Bougie 😂 I respect it"},
    {"from": "priya", "text": "We should do a movie sometime"},
    {"from": "me", "text": "I'd love that. Pick a film, I'll get tickets."},
]


def _conv_id(user_a: str, user_b: str) -> str:
    """Mirror chat_service.get_conversation_id"""
    return "_".join(sorted([user_a, user_b]))


def _build_messages(
    conversation_id: str,
    target_user_id: str,
    other_user_id: str,
    script: List[Dict],
    started_at: datetime,
) -> List[Dict]:
    """Convert the chat script into MongoDB chat_messages docs."""
    messages = []
    ts = started_at
    for idx, turn in enumerate(script):
        ts = ts + timedelta(minutes=2 + idx)
        is_me = turn["from"] == "me"
        sender = target_user_id if is_me else other_user_id
        receiver = other_user_id if is_me else target_user_id
        messages.append(
            {
                "message_id": f"mockmsg_{conversation_id}_{idx}_{int(ts.timestamp())}",
                "conversation_id": conversation_id,
                "sender_id": sender,
                "receiver_id": receiver,
                "content": turn["text"],
                "message_type": "text",
                "media_url": None,
                "created_at": ts.isoformat(),
                "read": True,
                "delivered": True,
                "conversation_status": "active",
            }
        )
    return messages


async def _upsert_mock_user(db, profile: Dict):
    """Insert/update mock user into users, user_profiles, user_pictures."""
    uid = profile["user_id"]

    # users collection (used by chat_service.get_user_info)
    user_doc = {
        "user_id": uid,
        "name": profile["name"],
        "email": profile.get("email"),
        "dob": profile.get("dob"),
        "location": profile.get("location"),
        "picture": profile.get("picture"),
        "created_at": datetime.utcnow().isoformat(),
        "is_mock": True,
    }
    await db.users.update_one({"user_id": uid}, {"$set": user_doc}, upsert=True)

    # user_profiles collection (used by /api/user/profile/{user_id})
    profile_doc = {k: v for k, v in profile.items() if k != "pictures"}
    profile_doc["created_at"] = datetime.utcnow().isoformat()
    profile_doc["is_mock"] = True
    await db.user_profiles.update_one(
        {"user_id": uid}, {"$set": profile_doc}, upsert=True
    )

    # user_pictures collection (used by /api/user/pictures/{user_id})
    pictures = profile.get("pictures", [])
    pic_doc = {"user_id": uid}
    for i in range(5):
        pic_doc[f"picture_{i + 1}"] = pictures[i] if i < len(pictures) else None
    pic_doc["last_modified_ts"] = datetime.utcnow().isoformat()
    pic_doc["is_mock"] = True
    await db.user_pictures.update_one(
        {"user_id": uid}, {"$set": pic_doc}, upsert=True
    )

    logger.info(f"Upserted mock user {profile['name']} ({uid})")


async def _seed_unmatched_conversation(
    db,
    target_user_id: str,
    other_user_id: str,
    other_user_name: str,
    script: List[Dict],
    days_ago_matched: int,
    days_ago_unmatched: int,
):
    """Create a conversation, populate messages, mark as unmatched by other_user."""
    conv_id = _conv_id(target_user_id, other_user_id)
    matched_at = datetime.utcnow() - timedelta(days=days_ago_matched)
    unmatched_at = datetime.utcnow() - timedelta(days=days_ago_unmatched)

    # Wipe any prior data for a clean reseed
    await db.chat_messages.delete_many({"conversation_id": conv_id})

    messages = _build_messages(conv_id, target_user_id, other_user_id, script, matched_at)
    if messages:
        await db.chat_messages.insert_many(messages)

    last_msg = messages[-1] if messages else None

    conv_doc = {
        "conversation_id": conv_id,
        "participants": [target_user_id, other_user_id],
        "created_at": matched_at.isoformat(),
        "status": "unmatched",
        "initiated_by": other_user_id,  # they initiated
        "last_message": (last_msg["content"][:50] + "...") if last_msg and len(last_msg["content"]) > 50 else (last_msg["content"] if last_msg else None),
        "last_message_at": last_msg["created_at"] if last_msg else None,
        "unread_count": {target_user_id: 0, other_user_id: 0},
        "meeting_status": None,
        "verification_status": None,
        # Unmatched fields - THEY unmatched us
        "unmatched_by": other_user_id,
        "unmatch_reason": "Not feeling the connection anymore",
        "unmatched_at": unmatched_at.isoformat(),
        "is_mock": True,
    }
    await db.chat_conversations.update_one(
        {"conversation_id": conv_id}, {"$set": conv_doc}, upsert=True
    )

    logger.info(
        f"Seeded unmatched conversation {conv_id} between {target_user_id} and "
        f"{other_user_name} ({other_user_id}) with {len(messages)} messages"
    )


async def seed_unmatched_for_user(db, target_user_id: str, force: bool = False) -> Dict:
    """Public entry point — seeds Anjali & Priya unmatched conversations for the given user.

    Idempotent: if the two mock conversations already exist for this user, skip
    re-seeding (unless force=True). This makes it safe to call from any endpoint
    on every request without thrashing the DB.
    """
    if not target_user_id:
        raise ValueError("target_user_id is required")

    anjali_conv_id = _conv_id(target_user_id, ANJALI_USER_ID)
    priya_conv_id = _conv_id(target_user_id, PRIYA_USER_ID)

    if not force:
        existing_anjali = await db.chat_conversations.find_one(
            {"conversation_id": anjali_conv_id}
        )
        existing_priya = await db.chat_conversations.find_one(
            {"conversation_id": priya_conv_id}
        )
        if existing_anjali and existing_priya:
            return {
                "success": True,
                "target_user_id": target_user_id,
                "already_seeded": True,
                "seeded_users": [
                    {"user_id": ANJALI_USER_ID, "name": ANJALI_PROFILE["name"]},
                    {"user_id": PRIYA_USER_ID, "name": PRIYA_PROFILE["name"]},
                ],
            }

    # 1. Upsert the two mock users
    await _upsert_mock_user(db, ANJALI_PROFILE)
    await _upsert_mock_user(db, PRIYA_PROFILE)

    # 2. Seed the two unmatched conversations
    await _seed_unmatched_conversation(
        db=db,
        target_user_id=target_user_id,
        other_user_id=ANJALI_USER_ID,
        other_user_name=ANJALI_PROFILE["name"],
        script=ANJALI_CHAT_SCRIPT,
        days_ago_matched=12,
        days_ago_unmatched=3,
    )

    await _seed_unmatched_conversation(
        db=db,
        target_user_id=target_user_id,
        other_user_id=PRIYA_USER_ID,
        other_user_name=PRIYA_PROFILE["name"],
        script=PRIYA_CHAT_SCRIPT,
        days_ago_matched=8,
        days_ago_unmatched=1,
    )

    return {
        "success": True,
        "target_user_id": target_user_id,
        "already_seeded": False,
        "seeded_users": [
            {"user_id": ANJALI_USER_ID, "name": ANJALI_PROFILE["name"]},
            {"user_id": PRIYA_USER_ID, "name": PRIYA_PROFILE["name"]},
        ],
    }


# ============== CLI ENTRY ==============
async def _main():
    if len(sys.argv) < 2:
        print("Usage: python -m mock_unmatched_data <target_user_id>")
        sys.exit(1)

    target_user_id = sys.argv[1]
    mongo_url = os.getenv("MONGO_URL")
    db_name = os.getenv("DB_NAME", "film_companion")
    if not mongo_url:
        print("MONGO_URL is not set in environment")
        sys.exit(1)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    result = await seed_unmatched_for_user(db, target_user_id)
    print("Seeded mock unmatched data:")
    print(result)
    client.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main())
