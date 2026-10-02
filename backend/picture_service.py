"""
Profile Pictures Service - Supabase Storage only.

Storage of record (after SQL migration is applied):
  * Files: Supabase Storage bucket `profile-pictures` at `<user_id>/picture_<n>_<rand>.<ext>`
  * Latest URLs (per user, picture slot) cached in MongoDB `user_pictures` for fast read
  * Append-only audit log in Supabase `user_pictures` table (one row per upload/replace/delete)

Uploads are JPEG / PNG / WEBP only (sniffed from the file header), max 5 MB
decoded. There is NO base64-in-MongoDB fallback any more: if Supabase Storage
is not configured, unreachable or rejects the upload, upload_picture_to_storage()
raises PhotoStorageUnavailable (server.py -> 503) and nothing is stored.
Oversized images raise PhotoTooLarge (an HTTPException -> 413).
"""

import re
import asyncio
import base64
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

logger = logging.getLogger(__name__)

# Max DECODED image size. The app resizes to 1080 px JPEG (q=0.75) before
# uploading (typically 150-600 KB), so 5 MB is generous.
MAX_PICTURE_BYTES = 5 * 1024 * 1024
ALLOWED_PICTURE_MIMES = ("image/jpeg", "image/png", "image/webp")
# user ids go into the storage path - keep them to a safe charset
# ("user_" + 12 hex, "mock_user_001", ...); never "/" or "..".
_SAFE_USER_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_STORAGE_URL_MARKER = "/storage/v1/object/public/profile-pictures/"
_PICTURE_KEYS = {f"picture_{n}" for n in range(1, 6)}


class PhotoStorageUnavailable(Exception):
    """Supabase Storage is not configured / unreachable, or the upload
    failed. server.py maps this to 503. Nothing is written to MongoDB."""


class PhotoTooLarge(HTTPException):
    """Decoded image exceeds MAX_PICTURE_BYTES. Being an HTTPException (413),
    server.py's `except HTTPException: raise` passes it straight through."""

    def __init__(self, detail: str = "Image is too large (max 5 MB).") -> None:
        super().__init__(status_code=413, detail=detail)


# MongoDB client (URL cache) – set from server.py
_mongodb_db = None


def set_mongodb_db(db):
    global _mongodb_db
    _mongodb_db = db


def get_mongodb_db():
    return _mongodb_db


def initialize_picture_service():
    logger.info("Picture service initialized (Supabase Storage only, Mongo URL cache)")
    return True


def _sniff_image_mime(data: bytes) -> Optional[str]:
    """MIME type from the file header: JPEG / PNG / WEBP only. GIF, AVIF,
    HEIC/HEIF and anything else -> None (rejected)."""
    head = data[:16]
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


# ============== INTERNAL: MONGODB CACHE ==============

async def _mongo_set_slot(user_id: str, picture_number: int, picture_url: Optional[str], session_id: Optional[str] = None) -> bool:
    db = get_mongodb_db()
    if db is None:
        return False
    if isinstance(picture_url, str) and picture_url.startswith("data:"):
        # Images live in Supabase Storage only - never store base64 in Mongo.
        logger.warning("Refusing to cache a data: URL as a picture slot")
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
    """Upload one picture to Supabase Storage and cache its public URL in the
    Mongo slot; writes a best-effort audit row to Supabase `user_pictures`.

    Returns the public URL, or None for invalid input (bad user id / slot,
    bad or empty base64, not JPEG/PNG/WEBP). Raises PhotoTooLarge (413) when
    the decoded image exceeds MAX_PICTURE_BYTES and PhotoStorageUnavailable
    (503) when storage is not available or the upload fails - there is no
    base64-in-Mongo fallback. `content_type` is ignored: the type is sniffed."""
    # The user id becomes the storage folder: only ever "<user_id>/..." for
    # the caller server.py already authorised (require_owner).
    if not _SAFE_USER_ID.match(user_id or "") or picture_number not in (1, 2, 3, 4, 5):
        logger.warning("Picture upload rejected: invalid user id or picture slot")
        return None

    # Normalise input: accept either raw base64 string or data URL
    raw_b64 = picture_data or ""
    if "base64," in raw_b64:
        raw_b64 = raw_b64.split("base64,", 1)[1]

    # Cheap pre-check on the encoded length (base64 is ~4/3 of the bytes) so
    # a huge payload is refused before it is decoded into memory.
    if len(raw_b64) > MAX_PICTURE_BYTES * 3 // 2:
        logger.warning(f"Picture upload rejected: payload too large (user_id={user_id} pic#{picture_number})")
        raise PhotoTooLarge()

    try:
        image_bytes = base64.b64decode(raw_b64) if raw_b64 else b""
    except Exception as e:
        logger.warning(f"Picture upload: invalid base64 ({type(e).__name__})")
        return None
    if not image_bytes:
        logger.warning("Picture upload rejected: empty image")
        return None

    # Reject oversized uploads so we don't burn Supabase storage / egress.
    if len(image_bytes) > MAX_PICTURE_BYTES:
        logger.warning(
            f"Picture upload rejected: {len(image_bytes)} bytes exceeds "
            f"{MAX_PICTURE_BYTES} cap (user_id={user_id} pic#{picture_number})"
        )
        raise PhotoTooLarge()

    # Validate by sniffing the file header (JPEG / PNG / WEBP only). The
    # sniffed type replaces the client-provided content_type so the CDN
    # serves the correct header.
    content_type = _sniff_image_mime(image_bytes)
    if content_type not in ALLOWED_PICTURE_MIMES:
        logger.warning(
            f"Picture upload rejected: unsupported image type "
            f"(user_id={user_id} pic#{picture_number}, {len(image_bytes)} bytes)"
        )
        return None

    size_bytes = len(image_bytes)

    # 1) Supabase Storage is the only store. Lazy import avoids circular
    #    imports; the SDK call is blocking, so it runs in a worker thread.
    try:
        import supabase_service as supa
    except Exception as e:
        logger.error(f"Photo storage unavailable: supabase_service import failed ({type(e).__name__})")
        raise PhotoStorageUnavailable("Photo storage is not available") from e

    try:
        upload_res = await asyncio.to_thread(
            supa.upload_image_to_supabase_storage,
            user_id=user_id,
            picture_number=picture_number,
            image_bytes=image_bytes,
            content_type=content_type,
        )
    except Exception as e:
        logger.warning(f"Supabase Storage upload failed: {type(e).__name__}")
        raise PhotoStorageUnavailable("Photo upload failed") from e
    if not upload_res or not upload_res.get("public_url"):
        # The helper logs the cause and returns None (storage not
        # configured, bucket missing, network error / timeout, ...).
        raise PhotoStorageUnavailable("Photo upload failed")

    storage_path = upload_res.get("storage_path")
    public_url = upload_res["public_url"]

    # 2) Update Mongo cache (so reads stay fast)
    await _mongo_set_slot(user_id, picture_number, public_url, session_id)

    # 3) Append audit row in Supabase (non-blocking)
    try:
        await supa.log_picture_event(
            user_id=user_id,
            picture_number=picture_number,
            action="upload",
            storage_path=storage_path,
            picture_url=public_url,
            content_type=content_type,
            size_bytes=size_bytes,
            source="supabase_storage",
            session_id=session_id,
        )
    except Exception as e:
        logger.warning(f"Audit log (upload) failed: {type(e).__name__}")

    logger.info(
        f"Picture {picture_number} stored for {user_id} via supabase_storage "
        f"({size_bytes} bytes)"
    )
    return public_url


async def get_user_pictures(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user pictures (latest per slot) from Mongo cache."""
    return await _mongo_get_all(user_id)


async def delete_picture_from_storage(user_id: str, picture_number: int, session_id: Optional[str] = None) -> bool:
    """Delete one picture slot. Tries to remove the file from Supabase Storage
    if we recognise its public URL; clears the Mongo slot; appends audit row.

    Ownership: only objects inside this user's own "<user_id>/" storage
    folder are ever removed, even if a foreign URL ended up in the slot."""
    try:
        import supabase_service as supa
    except Exception as e:  # storage/audit unavailable - still clear the slot
        logger.warning(f"supabase_service unavailable for picture delete: {type(e).__name__}")
        supa = None

    existing = await _mongo_get_all(user_id) or {}
    current_url = existing.get(f"picture_{picture_number}")
    storage_path: Optional[str] = None

    # Extract storage path from public URL if it's a Supabase Storage URL
    if isinstance(current_url, str) and _STORAGE_URL_MARKER in current_url:
        candidate = current_url.split(_STORAGE_URL_MARKER, 1)[1].split("?", 1)[0]
        if user_id and candidate.startswith(f"{user_id}/") and ".." not in candidate:
            storage_path = candidate
            if supa is not None:
                try:
                    await asyncio.to_thread(supa.delete_image_from_supabase_storage, storage_path)
                except Exception as e:
                    logger.warning(f"Supabase Storage delete failed (non-blocking): {type(e).__name__}")
        else:
            logger.warning(
                f"Picture delete: slot {picture_number} of {user_id} points outside the "
                f"user's storage folder - file not deleted, slot cleared"
            )

    # Clear Mongo slot
    await _mongo_set_slot(user_id, picture_number, None, session_id)

    # Audit
    if supa is not None:
        try:
            await supa.log_picture_event(
                user_id=user_id,
                picture_number=picture_number,
                action="delete",
                storage_path=storage_path,
                picture_url=None,
                source="supabase_storage" if storage_path else (
                    "mongodb_base64" if isinstance(current_url, str) and current_url.startswith("data:") else None
                ),
                session_id=session_id,
            )
        except Exception as e:
            logger.warning(f"Audit log (delete) failed: {type(e).__name__}")

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
    for key, value in (picture_urls or {}).items():
        # Only the five slot fields (never user_id etc.) and never base64.
        if key not in _PICTURE_KEYS:
            continue
        if isinstance(value, str) and value.startswith("data:"):
            logger.warning(f"Refusing to cache a data: URL for {key}")
            continue
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
