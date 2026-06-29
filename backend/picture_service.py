"""
Profile Pictures Service - Supabase Storage primary, MongoDB base64 fallback.

Storage of record (after SQL migration is applied):
  * Files: Supabase Storage bucket `profile-pictures` at `<user_id>/picture_<n>_<rand>.<ext>`
  * Latest URLs (per user, picture slot) cached in MongoDB `user_pictures` for fast read
  * Append-only audit log in Supabase `user_pictures` table (one row per upload/replace/delete)

If Supabase Storage upload fails (e.g. bucket not yet created), we fall back to
storing the image as a base64 data URL in MongoDB so the user flow never breaks.
"""

import os
import base64
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# MongoDB client (cache + fallback) – set from server.py
_mongodb_db = None


def set_mongodb_db(db):
    global _mongodb_db
    _mongodb_db = db


def get_mongodb_db():
    return _mongodb_db


def initialize_picture_service():
    logger.info("Picture service initialized (Supabase Storage primary, Mongo fallback)")
    return True


# ============== INTERNAL: MONGODB CACHE ==============

async def _mongo_set_slot(user_id: str, picture_number: int, picture_url: Optional[str], session_id: Optional[str] = None) -> bool:
    db = get_mongodb_db()
    if db is None:
        return False
    now = datetime.utcnow()
    await db.user_pictures.update_one(
        {"user_id": user_id},
        {
            "$set": {
                f"picture_{picture_number}": picture_url,
                "last_modified_ts": now.isoformat(),
                "last_modified_date": now.strftime("%Y-%m-%d"),
                "session_id": session_id or "auto",
            }
        },
        upsert=True,
    )
    return True


async def _mongo_get_all(user_id: str) -> Optional[Dict[str, Any]]:
    db = get_mongodb_db()
    if db is None:
        return None
    result = await db.user_pictures.find_one({"user_id": user_id})
    if not result:
        return None
    return {
        "user_id": result.get("user_id"),
        "picture_1": result.get("picture_1"),
        "picture_2": result.get("picture_2"),
        "picture_3": result.get("picture_3"),
        "picture_4": result.get("picture_4"),
        "picture_5": result.get("picture_5"),
        "last_modified_ts": result.get("last_modified_ts"),
        "session_id": result.get("session_id"),
    }


# ============== PUBLIC API ==============

async def upload_picture_to_storage(
    user_id: str,
    picture_data: str,
    picture_number: int,
    content_type: str = "image/jpeg",
    session_id: Optional[str] = None,
) -> Optional[str]:
    """Upload one picture. Attempts Supabase Storage first, falls back to
    storing as base64 data URL in MongoDB. Always writes an audit row to
    Supabase `user_pictures` (best-effort)."""
    # Lazy import to avoid circular imports
    import supabase_service as supa

    # Normalise input: accept either raw base64 string or data URL
    raw_b64 = picture_data
    if raw_b64 and "base64," in raw_b64:
        raw_b64 = raw_b64.split("base64,")[1]

    try:
        image_bytes = base64.b64decode(raw_b64) if raw_b64 else b""
    except Exception as e:
        logger.error(f"Picture upload: invalid base64 ({e})")
        return None

    size_bytes = len(image_bytes)
    storage_path: Optional[str] = None
    public_url: Optional[str] = None
    source = "mongodb_base64"

    # 1) Try Supabase Storage
    if image_bytes:
        try:
            upload_res = supa.upload_image_to_supabase_storage(
                user_id=user_id,
                picture_number=picture_number,
                image_bytes=image_bytes,
                content_type=content_type or "image/jpeg",
            )
            if upload_res and upload_res.get("public_url"):
                storage_path = upload_res["storage_path"]
                public_url = upload_res["public_url"]
                source = "supabase_storage"
        except Exception as e:
            logger.warning(f"Supabase Storage upload failed; falling back to base64: {e}")

    # 2) Fallback to data URL in Mongo if Supabase Storage unavailable
    if not public_url:
        public_url = f"data:{content_type or 'image/jpeg'};base64,{raw_b64}"
        source = "mongodb_base64"

    # 3) Update Mongo cache (so reads stay fast)
    await _mongo_set_slot(user_id, picture_number, public_url, session_id)

    # 4) Append audit row in Supabase (non-blocking)
    try:
        await supa.log_picture_event(
            user_id=user_id,
            picture_number=picture_number,
            action="upload",
            storage_path=storage_path,
            picture_url=public_url,
            content_type=content_type,
            size_bytes=size_bytes,
            source=source,
            session_id=session_id,
        )
    except Exception as e:
        logger.warning(f"Audit log (upload) failed: {e}")

    logger.info(
        f"Picture {picture_number} stored for {user_id} via {source} "
        f"({size_bytes} bytes)"
    )
    return public_url


async def get_user_pictures(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user pictures (latest per slot) from Mongo cache."""
    return await _mongo_get_all(user_id)


async def delete_picture_from_storage(user_id: str, picture_number: int, session_id: Optional[str] = None) -> bool:
    """Delete one picture slot. Tries to remove the file from Supabase Storage
    if we recognise its public URL; clears the Mongo slot; appends audit row."""
    import supabase_service as supa

    existing = await _mongo_get_all(user_id) or {}
    current_url = existing.get(f"picture_{picture_number}")
    storage_path: Optional[str] = None

    # Extract storage path from public URL if it's a Supabase Storage URL
    if current_url and "/storage/v1/object/public/profile-pictures/" in current_url:
        try:
            storage_path = current_url.split("/storage/v1/object/public/profile-pictures/", 1)[1]
            supa.delete_image_from_supabase_storage(storage_path)
        except Exception as e:
            logger.warning(f"Supabase Storage delete failed (non-blocking): {e}")

    # Clear Mongo slot
    await _mongo_set_slot(user_id, picture_number, None, session_id)

    # Audit
    try:
        await supa.log_picture_event(
            user_id=user_id,
            picture_number=picture_number,
            action="delete",
            storage_path=storage_path,
            picture_url=None,
            source="supabase_storage" if storage_path else "mongodb_base64",
            session_id=session_id,
        )
    except Exception as e:
        logger.warning(f"Audit log (delete) failed: {e}")

    return True


async def save_user_pictures(
    user_id: str,
    session_id: str,
    picture_urls: Dict[str, Optional[str]],
) -> bool:
    """Bulk-save URL map (e.g. after batch upload). Used internally after
    upload_picture_to_storage has already written each slot; safe to call
    again for back-compat."""
    db = get_mongodb_db()
    if db is None:
        return False
    now = datetime.utcnow()
    update_data: Dict[str, Any] = {
        "last_modified_ts": now.isoformat(),
        "last_modified_date": now.strftime("%Y-%m-%d"),
        "session_id": session_id or "auto",
    }
    for key, value in picture_urls.items():
        update_data[key] = value
    await db.user_pictures.update_one(
        {"user_id": user_id},
        {"$set": update_data},
        upsert=True,
    )
    return True


async def update_single_picture(
    user_id: str,
    session_id: str,
    picture_number: int,
    picture_url: Optional[str],
) -> bool:
    """Legacy compatibility shim for server.py. The actual upload is performed
    by upload_picture_to_storage above; this just ensures the Mongo cache is
    in sync for callers that pass only the URL."""
    return await _mongo_set_slot(user_id, picture_number, picture_url, session_id)
