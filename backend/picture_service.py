"""
Profile Pictures Service - MongoDB Storage (Fallback)

This version stores pictures as base64 in MongoDB when Supabase is not configured.
For production, use Supabase storage for better performance and scalability.

TODO: Setup Supabase Storage:
1. Go to Supabase Dashboard > Storage
2. Create bucket "profile-pictures" with public access
3. Run this SQL in SQL Editor:

CREATE TABLE IF NOT EXISTS user_pictures (
    id SERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    picture_1 TEXT,
    picture_2 TEXT,
    picture_3 TEXT,
    picture_4 TEXT,
    picture_5 TEXT,
    last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
    last_modified_date DATE DEFAULT CURRENT_DATE,
    session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_pictures_user_id ON user_pictures(user_id);
"""

import os
import uuid
import base64
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Flag to use MongoDB instead of Supabase (temporary fallback)
USE_MONGODB_STORAGE = True

# MongoDB client (will be set from server.py)
_mongodb_db = None


def set_mongodb_db(db):
    """Set the MongoDB database reference"""
    global _mongodb_db
    _mongodb_db = db


def get_mongodb_db():
    """Get MongoDB database"""
    return _mongodb_db


# ============== MONGODB STORAGE (FALLBACK) ==============

async def upload_picture_mongodb(
    user_id: str,
    picture_data: str,
    picture_number: int,
    content_type: str = "image/jpeg"
) -> Optional[str]:
    """
    Store picture as base64 in MongoDB.
    Returns a data URL that can be used directly in <Image> components.
    """
    try:
        db = get_mongodb_db()
        if db is None:
            logger.error("MongoDB not initialized")
            return None
        
        # Clean base64 data
        if "base64," in picture_data:
            picture_data = picture_data.split("base64,")[1]
        
        # Create data URL
        data_url = f"data:{content_type};base64,{picture_data}"
        
        # Update user's pictures document
        now = datetime.utcnow()
        
        result = await db.user_pictures.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    f"picture_{picture_number}": data_url,
                    "last_modified_ts": now.isoformat(),
                    "last_modified_date": now.strftime("%Y-%m-%d"),
                    "session_id": f"mongo_{uuid.uuid4().hex[:8]}"
                }
            },
            upsert=True
        )
        
        logger.info(f"Stored picture {picture_number} for user {user_id} in MongoDB")
        return data_url
        
    except Exception as e:
        logger.error(f"MongoDB upload error: {e}")
        return None


async def get_pictures_mongodb(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user's pictures from MongoDB"""
    try:
        db = get_mongodb_db()
        if db is None:
            return None
        
        result = await db.user_pictures.find_one({"user_id": user_id})
        
        if result:
            return {
                "user_id": result.get("user_id"),
                "picture_1": result.get("picture_1"),
                "picture_2": result.get("picture_2"),
                "picture_3": result.get("picture_3"),
                "picture_4": result.get("picture_4"),
                "picture_5": result.get("picture_5"),
                "last_modified_ts": result.get("last_modified_ts"),
                "session_id": result.get("session_id")
            }
        return None
        
    except Exception as e:
        logger.error(f"MongoDB get pictures error: {e}")
        return None


async def delete_picture_mongodb(user_id: str, picture_number: int) -> bool:
    """Delete a specific picture from MongoDB"""
    try:
        db = get_mongodb_db()
        if db is None:
            return False
        
        now = datetime.utcnow()
        
        result = await db.user_pictures.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    f"picture_{picture_number}": None,
                    "last_modified_ts": now.isoformat(),
                }
            }
        )
        
        return result.modified_count > 0
        
    except Exception as e:
        logger.error(f"MongoDB delete picture error: {e}")
        return False


async def save_pictures_mongodb(
    user_id: str,
    session_id: str,
    picture_urls: Dict[str, Optional[str]]
) -> bool:
    """Save multiple picture URLs to MongoDB"""
    try:
        db = get_mongodb_db()
        if db is None:
            return False
        
        now = datetime.utcnow()
        
        update_data = {
            "last_modified_ts": now.isoformat(),
            "last_modified_date": now.strftime("%Y-%m-%d"),
            "session_id": session_id
        }
        
        for key, value in picture_urls.items():
            update_data[key] = value
        
        result = await db.user_pictures.update_one(
            {"user_id": user_id},
            {"$set": update_data},
            upsert=True
        )
        
        return True
        
    except Exception as e:
        logger.error(f"MongoDB save pictures error: {e}")
        return False


# ============== PUBLIC API (Uses MongoDB fallback) ==============

async def upload_picture_to_storage(
    user_id: str,
    picture_data: str,
    picture_number: int,
    content_type: str = "image/jpeg"
) -> Optional[str]:
    """Upload picture - uses MongoDB storage"""
    return await upload_picture_mongodb(user_id, picture_data, picture_number, content_type)


async def get_user_pictures(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user pictures - uses MongoDB"""
    return await get_pictures_mongodb(user_id)


async def delete_picture_from_storage(user_id: str, picture_number: int) -> bool:
    """Delete picture - uses MongoDB"""
    return await delete_picture_mongodb(user_id, picture_number)


async def save_user_pictures(
    user_id: str,
    session_id: str,
    picture_urls: Dict[str, Optional[str]]
) -> bool:
    """Save pictures - uses MongoDB"""
    return await save_pictures_mongodb(user_id, session_id, picture_urls)


async def update_single_picture(
    user_id: str,
    session_id: str,
    picture_number: int,
    picture_url: Optional[str]
) -> bool:
    """Update a single picture slot"""
    try:
        existing = await get_user_pictures(user_id)
        
        if existing:
            picture_urls = {
                "picture_1": existing.get("picture_1"),
                "picture_2": existing.get("picture_2"),
                "picture_3": existing.get("picture_3"),
                "picture_4": existing.get("picture_4"),
                "picture_5": existing.get("picture_5"),
            }
            picture_urls[f"picture_{picture_number}"] = picture_url
        else:
            picture_urls = {f"picture_{picture_number}": picture_url}
        
        return await save_user_pictures(user_id, session_id, picture_urls)
        
    except Exception as e:
        logger.error(f"Error updating single picture: {e}")
        return False


def initialize_picture_service():
    """Initialize the picture service"""
    logger.info("Picture service initialized (using MongoDB storage)")
    return True
