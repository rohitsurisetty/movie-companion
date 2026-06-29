"""
Supabase Bootstrap — runs once on backend startup.

Goals:
  1. Verify Supabase connectivity using the SERVICE KEY (if available)
     and fall back to the ANON key.
  2. Create the `profile-pictures` storage bucket automatically (service
     key only — anon key cannot create buckets).
  3. Probe whether all audit tables required by the "Full Audit Trail"
     migration exist; if any are missing, log ONE big, very visible
     warning telling the operator how to apply the migration. We do NOT
     crash the backend — audit inserts are best-effort, so the rest of
     the app keeps working.
"""

import os
import logging
from typing import List, Tuple
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # admin / DDL-ish
SUPABASE_ANON_KEY = os.getenv("SUPABASE_KEY")             # read/write (anon)

# Tables created by supabase_migration_full_audit.sql
AUDIT_TABLES: List[str] = [
    "user_pictures",
    "tina_chat_messages",
    "tina_persona_360",
    "user_chat_messages",
    "match_events",
    "unmatch_events",
    "report_events",
]

PROFILE_PICTURES_BUCKET = "profile-pictures"


def _get_admin_client():
    """Build a Supabase client using the SERVICE KEY when present, else
    the anon key. Returns (client, mode) tuple."""
    from supabase import create_client

    if SUPABASE_SERVICE_KEY:
        return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY), "service_key"
    if SUPABASE_ANON_KEY:
        return create_client(SUPABASE_URL, SUPABASE_ANON_KEY), "anon_key"
    return None, "none"


def _ensure_profile_pictures_bucket(client) -> bool:
    """Create the public bucket if it doesn't exist. Idempotent."""
    try:
        buckets = client.storage.list_buckets()
        # buckets is a list of objects with .name / dict with 'name'
        names = []
        for b in buckets or []:
            if hasattr(b, "name"):
                names.append(b.name)
            elif isinstance(b, dict):
                names.append(b.get("name"))
        if PROFILE_PICTURES_BUCKET in names:
            logger.info(f"[bootstrap] Bucket '{PROFILE_PICTURES_BUCKET}' already exists.")
            return True

        client.storage.create_bucket(
            PROFILE_PICTURES_BUCKET,
            options={
                "public": True,
                "file_size_limit": 5242880,   # 5 MB
                "allowed_mime_types": [
                    "image/jpeg", "image/png", "image/webp",
                    "image/heic", "image/heif",
                ],
            },
        )
        logger.info(f"[bootstrap] Created bucket '{PROFILE_PICTURES_BUCKET}'.")
        return True
    except Exception as e:
        # Most common failure: anon key (Storage admin needs service role).
        logger.warning(
            f"[bootstrap] Could not auto-create bucket '{PROFILE_PICTURES_BUCKET}' "
            f"(this is OK if it already exists or you'll create it via SQL): {e}"
        )
        return False


def _check_audit_tables(client) -> Tuple[List[str], List[str]]:
    """Returns (existing, missing) audit-table names."""
    existing: List[str] = []
    missing: List[str] = []
    for tbl in AUDIT_TABLES:
        try:
            client.table(tbl).select("id", count="exact").limit(1).execute()
            existing.append(tbl)
        except Exception as e:
            err = str(e).lower()
            if "could not find the table" in err or "pgrst205" in err or "does not exist" in err:
                missing.append(tbl)
            else:
                # Other error (RLS / permission) — treat as existing since the
                # table is reachable.
                existing.append(tbl)
    return existing, missing


def run_bootstrap() -> None:
    """Idempotent bootstrap. Safe to call every backend boot."""
    if not SUPABASE_URL:
        logger.warning("[bootstrap] SUPABASE_URL is not set — skipping bootstrap.")
        return

    client, mode = _get_admin_client()
    if client is None:
        logger.warning("[bootstrap] No Supabase key configured — skipping bootstrap.")
        return

    logger.info(f"[bootstrap] Supabase bootstrap starting (auth mode: {mode}).")

    # 1) Storage bucket
    _ensure_profile_pictures_bucket(client)

    # 2) Audit tables probe
    existing, missing = _check_audit_tables(client)
    logger.info(f"[bootstrap] Audit tables present: {existing or 'none'}")
    if missing:
        msg = (
            "================================================================================\n"
            "⚠️  SUPABASE AUDIT MIGRATION NOT YET APPLIED\n"
            "================================================================================\n"
            f"Missing tables: {missing}\n"
            "Audit logging for these will silently no-op until you apply the migration.\n\n"
            "TO APPLY (one-time, 30 seconds):\n"
            "  1. Open https://supabase.com/dashboard → your project → SQL Editor → New query\n"
            "  2. Paste the contents of:  /app/backend/supabase_migration_full_audit.sql\n"
            "  3. Click 'Run'.\n"
            "  4. Restart the backend (supervisor will pick it up on next call).\n"
            "================================================================================"
        )
        logger.warning(msg)
    else:
        logger.info("[bootstrap] ✅ All audit tables present. Audit logging is fully active.")
