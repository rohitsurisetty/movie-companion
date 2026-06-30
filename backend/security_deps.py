"""
Security dependencies for the Film Companion FastAPI app.

Centralizes:
  • `get_current_user_id` — verifies session_token (cookie or Bearer) against
    Mongo `user_sessions`, returns the canonical user_id from the token. Use
    this on ALL user-scoped endpoints to prevent BOLA — never trust the
    `user_id` the client put in the body/path; always derive it server-side.
  • `require_owner` — extra guard for endpoints that take a `user_id` in the
    path/body. Confirms it matches the caller's identity.
  • `get_current_admin` — verifies admin_token (Bearer header or query) against
    the in-memory admin_tokens store; rejects expired tokens.
  • `RateLimiter` — minimal in-memory sliding-window limiter for hot/expensive
    endpoints (OTP send, TTS). Per-key (per-user or per-IP).
  • `INSECURE_DEV_AUTH` — opt-in flag that, when set to "true", restores the
    old "OTP in response body + universal 123456" behavior for QA. OFF by
    default so production deploys are safe.

NOTE: The auth model here is the existing session_token approach (a server-
generated opaque string stored in Mongo). NOT switching to JWT/Bearer-only
to minimize surface change. Cookie path stays supported alongside the
`Authorization: Bearer` header path.
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, Optional, Tuple

from fastapi import HTTPException, Request, status


# Flip to "true" in .env ONLY for local QA / automation tests. When true:
#   • /auth/send-*-otp echoes the OTP in the response body
#   • /auth/verify-otp accepts the universal "123456" for any account
# Default OFF — every public deploy is safe-by-default.
INSECURE_DEV_AUTH = os.getenv("INSECURE_DEV_AUTH", "false").strip().lower() == "true"


# ----------------------------------------------------------------------
# Session token extraction
# ----------------------------------------------------------------------

def _extract_session_token(request: Request) -> Optional[str]:
    """Pull a session token from the standard places. Cookie first, then
    Authorization Bearer header, then `X-Session-Token` for transport
    flexibility, then `?session_token=` query param (only for streaming
    media endpoints like /tina/voice/speak-stream where browsers/native
    <audio src> can't forward cookies or headers). Returns None if absent —
    caller decides how to handle.
    """
    token = request.cookies.get("session_token")
    if token:
        return token
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    xst = request.headers.get("x-session-token")
    if xst:
        return xst.strip() or None
    qtok = request.query_params.get("session_token")
    if qtok:
        return qtok.strip() or None
    return None


# ----------------------------------------------------------------------
# User session dependency
# ----------------------------------------------------------------------

# Reference to the running Mongo `db` — set once at startup via
# `set_security_db(db)`. We avoid importing `db` from server.py to prevent
# a circular import.
_db = None


def set_security_db(db) -> None:  # noqa: ANN001
    global _db
    _db = db


async def get_current_user_id(request: Request) -> str:
    """Return the canonical user_id for the caller. Raises 401 if missing /
    invalid / expired. This is the SOLE source of truth for "who is this
    request from" — never accept a client-supplied user_id without
    cross-checking against this.
    """
    if _db is None:
        # Should never happen — startup wires this up. Fail closed.
        raise HTTPException(status_code=503, detail="Auth subsystem unavailable")
    token = _extract_session_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    session = await _db.user_sessions.find_one(
        {"session_token": token}, {"_id": 0, "user_id": 1, "expires_at": 1}
    )
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = session.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            exp = None
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
    uid = session.get("user_id")
    if not uid:
        raise HTTPException(status_code=401, detail="Session has no associated user")
    return uid


def require_owner(path_user_id: str, current_user_id: str) -> None:
    """Reject the request if the caller is trying to access another user's
    data. Call this immediately after `Depends(get_current_user_id)` for any
    endpoint that takes `user_id` in the path/body.
    """
    if path_user_id != current_user_id:
        # 404 (not 403) to avoid leaking which user_ids exist
        raise HTTPException(status_code=404, detail="Not found")


# ----------------------------------------------------------------------
# Admin session dependency
# ----------------------------------------------------------------------

# server.py owns `admin_tokens: dict`. We accept a callable that returns it
# so this module stays import-safe.
_admin_tokens_provider = None


def set_admin_tokens_provider(provider) -> None:  # provider() -> dict
    global _admin_tokens_provider
    _admin_tokens_provider = provider


async def get_current_admin(request: Request) -> Dict[str, Any]:
    """Verify the admin token. Tokens are stored in-memory in server.py via
    `admin_tokens`. We tolerate transport via Bearer header, `x-admin-token`,
    `?admin_token=` query, or admin_token cookie (in that priority).
    """
    if _admin_tokens_provider is None:
        raise HTTPException(status_code=503, detail="Admin auth unavailable")
    admin_tokens = _admin_tokens_provider()
    token = None
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        token = request.headers.get("x-admin-token")
    if not token:
        token = request.query_params.get("admin_token")
    if not token:
        token = request.cookies.get("admin_token")
    if not token:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    info = admin_tokens.get(token)
    if not info:
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")
    # Optional: token-aging (24h)
    created_str = info.get("created_at")
    if created_str:
        try:
            created = datetime.fromisoformat(created_str)
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - created).total_seconds() > 24 * 3600:
                admin_tokens.pop(token, None)
                raise HTTPException(status_code=401, detail="Admin session expired")
        except ValueError:
            pass
    return info


# ----------------------------------------------------------------------
# Lightweight per-key sliding-window rate limiter
# ----------------------------------------------------------------------

class RateLimiter:
    """Minimal sliding-window rate limiter, in-memory. Fine for single-pod
    deployments. For multi-pod / horizontal scaling, swap to Redis later.
    """

    def __init__(self, max_calls: int, window_seconds: int) -> None:
        self.max_calls = max_calls
        self.window = window_seconds
        self._buckets: Dict[str, Deque[float]] = defaultdict(deque)

    def hit(self, key: str) -> Tuple[bool, int]:
        """Record a call for `key`. Returns (allowed, retry_after_seconds).
        retry_after is 0 when allowed.
        """
        now = time.monotonic()
        bucket = self._buckets[key]
        # Drop entries outside the window
        cutoff = now - self.window
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= self.max_calls:
            retry = max(1, int(self.window - (now - bucket[0])))
            return False, retry
        bucket.append(now)
        return True, 0

    def check_or_raise(self, key: str) -> None:
        allowed, retry = self.hit(key)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please slow down.",
                headers={"Retry-After": str(retry)},
            )


# Module-level limiters used by endpoints. Tuned for the demo phase — feel
# free to flex these later.
OTP_LIMITER = RateLimiter(max_calls=5, window_seconds=60 * 10)          # 5 / 10 min per identifier
TTS_LIMITER = RateLimiter(max_calls=30, window_seconds=60)              # 30 / min per user
LOGIN_ATTEMPT_LIMITER = RateLimiter(max_calls=10, window_seconds=60 * 5) # 10 admin login tries / 5 min per IP


def client_ip(request: Request) -> str:
    """Best-effort IP detection for rate-limit keys. Behind a proxy we honour
    X-Forwarded-For; otherwise fall back to the socket.
    """
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
