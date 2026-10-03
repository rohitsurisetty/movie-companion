"""
Security dependencies for the Film Companion FastAPI app.

Centralizes:
  • `get_current_user_id` — verifies session_token (cookie or Bearer) against
    Mongo `user_sessions`, returns the canonical user_id from the token. Use
    this on ALL user-scoped endpoints to prevent BOLA — never trust the
    `user_id` the client put in the body/path; always derive it server-side.
  • `require_owner` — extra guard for endpoints that take a `user_id` in the
    path/body. Confirms it matches the caller's identity.
  • `get_current_admin` — verifies admin_token (Bearer header, x-admin-token
    header or cookie — never a query param) against the in-memory
    admin_tokens store; rejects expired tokens.
  • `RateLimiter` — minimal in-memory sliding-window limiter for hot/expensive
    endpoints (OTP send, TTS). Per-key (per-user or per-IP).
  • `INSECURE_DEV_AUTH` — opt-in flag that, when set to "true", restores the
    old "OTP in response body + universal 123456" behavior for QA. OFF by
    default so production deploys are safe.
  • `redact_secrets` / `RedactSecretsFilter` — scrub API keys and tokens
    (`?key=`, `session_token=`, Bearer, sk-/AIza keys, JWTs) out of log lines.

NOTE: The auth model here is the existing session_token approach (a server-
generated opaque string stored in Mongo). NOT switching to JWT/Bearer-only
to minimize surface change. Cookie path stays supported alongside the
`Authorization: Bearer` header path.
"""

from __future__ import annotations

import logging
import os
import re
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

# The ONLY path allowed to carry the session token in the query string.
# Native <audio src=...> / expo-av players cannot attach cookies or headers,
# so the audio stream endpoint is the single sanctioned exception. Tokens in
# URLs leak into access logs / proxies, so nothing else may use it.
_QUERY_TOKEN_PATH_SUFFIX = "/tina/voice/speak-stream"


def _extract_session_token(request: Request) -> Optional[str]:
    """Pull a session token from the standard places. Cookie first, then
    Authorization Bearer header, then `X-Session-Token` for transport
    flexibility. The `?session_token=` query param is accepted ONLY for the
    streaming media endpoint /tina/voice/speak-stream (browsers/native
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
    if request.url.path.endswith(_QUERY_TOKEN_PATH_SUFFIX):
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
    # Banned accounts keep their (still valid) session rows, so the ban must
    # be enforced here on every request. One indexed lookup; no caching so an
    # admin ban takes effect immediately.
    user = await _db.users.find_one({"user_id": uid}, {"_id": 0, "status": 1})
    if user and user.get("status") == "banned":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")
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
    or admin_token cookie (in that priority). Query-string transport is NOT
    accepted — admin tokens must never end up in URLs / access logs.
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

    # Once this many distinct keys are tracked, drop the buckets that have
    # fully expired so a flood of one-off IPs can't grow memory unbounded.
    _PRUNE_THRESHOLD = 10_000

    def __init__(self, max_calls: int, window_seconds: int) -> None:
        self.max_calls = max_calls
        self.window = window_seconds
        self._buckets: Dict[str, Deque[float]] = defaultdict(deque)

    def _prune(self, now: float) -> None:
        cutoff = now - self.window
        stale = [k for k, b in self._buckets.items() if not b or b[-1] < cutoff]
        for k in stale:
            self._buckets.pop(k, None)

    def hit(self, key: str) -> Tuple[bool, int]:
        """Record a call for `key`. Returns (allowed, retry_after_seconds).
        retry_after is 0 when allowed.
        """
        now = time.monotonic()
        if len(self._buckets) >= self._PRUNE_THRESHOLD:
            self._prune(now)
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
OTP_VERIFY_LIMITER = RateLimiter(max_calls=8, window_seconds=600)       # 8 verify attempts / 10 min per identifier (brute-force guard)
TTS_LIMITER = RateLimiter(max_calls=30, window_seconds=60)              # 30 / min per user
LLM_LIMITER = RateLimiter(max_calls=30, window_seconds=60)              # 30 LLM-backed calls / min per user (ice-breakers, suggestions, Tina)
LOGIN_ATTEMPT_LIMITER = RateLimiter(max_calls=10, window_seconds=60 * 5) # 10 admin login tries / 5 min per IP


def client_ip(request: Request) -> str:
    """Best-effort IP detection for rate-limit keys. Behind a proxy we honour
    X-Forwarded-For; otherwise fall back to the socket.
    """
    # X-Forwarded-For is "client, proxy1, proxy2…" and each proxy APPENDS the
    # address it saw. Only the entries added by our own proxies can be
    # trusted, so read the Nth hop from the right (TRUSTED_PROXY_HOPS, default
    # 1 = Railway's edge). The leftmost entry is whatever the client sent.
    hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    if hops:
        try:
            from settings import settings as _settings
            n = max(1, int(getattr(_settings, "trusted_proxy_hops", 1) or 1))
        except Exception:  # pragma: no cover - settings import should never fail
            n = 1
        return hops[-n] if len(hops) >= n else hops[0]
    return request.client.host if request.client else "unknown"


# ----------------------------------------------------------------------
# Log redaction
# ----------------------------------------------------------------------

# Query parameters whose values never belong in logs: API keys (the Google
# Maps `key=`), session / OAuth tokens, OTP codes, and the TTS `text=` of
# /tina/voice/speak-stream (Tina's reply to the user - conversation content).
_SECRET_PARAM_RE = re.compile(
    r"(?i)([?&;](?:key|api_?key|authkey|access_token|refresh_token|id_token|session_token"
    r"|token|otp|code|text)=)[^&\s\"'#]+"
)
_BEARER_RE = re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9\-._~+/]{8,}=*")
# OpenAI / ElevenLabs style keys (also OpenAI's own partially-masked echo in
# 401 errors), Google API keys and JWTs (e.g. a Supabase service key).
_KEY_LITERAL_RE = re.compile(
    r"\b(?:sk[-_][A-Za-z0-9_\-*]{6,}|AIza[0-9A-Za-z_\-]{20,}"
    r"|eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,})"
)
_REDACTED = "[REDACTED]"


def redact_secrets(text: Any) -> str:
    """`text` as a string with API keys / tokens replaced by [REDACTED]."""
    out = str(text)
    if not out:
        return out
    out = _SECRET_PARAM_RE.sub(lambda m: m.group(1) + _REDACTED, out)
    out = _BEARER_RE.sub(lambda m: m.group(1) + _REDACTED, out)
    return _KEY_LITERAL_RE.sub(_REDACTED, out)


def _redact_log_arg(arg: Any) -> Any:
    if arg is None or isinstance(arg, (bool, int, float)):
        return arg
    if isinstance(arg, str):
        return redact_secrets(arg)
    text = str(arg)  # e.g. an httpx.URL
    cleaned = redact_secrets(text)
    return arg if cleaned == text else cleaned


class RedactSecretsFilter(logging.Filter):
    """Logging filter that scrubs secrets from a record's message, its
    %-style args (each arg separately, so formatters that unpack
    `record.args` - uvicorn's access log - keep working) and its traceback.
    Attach it to handlers (covers every logger that propagates to them) or
    to a logger. Never drops a record and never raises."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            if record.args:
                if isinstance(record.args, tuple):
                    record.args = tuple(_redact_log_arg(a) for a in record.args)
                elif isinstance(record.args, dict):
                    record.args = {k: _redact_log_arg(v) for k, v in record.args.items()}
            elif isinstance(record.msg, str):
                record.msg = redact_secrets(record.msg)
            if record.exc_info and not record.exc_text:
                # Exception messages can embed request URLs; pre-render the
                # traceback (Formatter.format reuses exc_text) and scrub it.
                record.exc_text = redact_secrets(logging.Formatter().formatException(record.exc_info))
        except Exception:  # pragma: no cover - logging must never break the app
            pass
        return True
