"""
/api/auth/* - native Google Sign-In, phone OTP login, current user, logout.

server.py mounts `router` on its /api router and calls `configure(db)` at
startup (no I/O there; the otp_codes indexes are created on first OTP use).
The auth_gate middleware treats /api/auth/* as public, so /auth/me and
/auth/logout resolve the session token themselves. Provider setup notes
(Google OAuth clients, MSG91 / Twilio, TEST_OTP_NUMBERS) are in the
auth_providers module docstring.

Both logins accept an optional `accepted_terms_version` (the Terms /
Privacy version the user agreed to on the login screen); when it differs from
the stored one it is recorded on the user as `terms_version` +
`terms_accepted_at`. Both return
    {success, session_token, user_id, is_new_user, onboarding_complete,
     name, email, phone, picture}
"""

from __future__ import annotations

import asyncio
import hmac
import logging
import re
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Optional, Union

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from pydantic import BaseModel, Field

from auth_providers import (
    GoogleTokenError,
    OTPStore,
    SMSSendError,
    create_session,
    get_sms_provider,
    is_onboarding_complete,
    mask_phone,
    normalize_phone,
    parse_test_numbers,
    phone_lookup_candidates,
    upsert_user_from_google,
    upsert_user_from_phone,
    verify_google_id_token,
)
from security_deps import (
    OTP_LIMITER,
    OTP_VERIFY_LIMITER,
    RateLimiter,
    _extract_session_token,
    client_ip,
    get_current_user_id,
)
from settings import settings

logger = logging.getLogger(__name__)

router = APIRouter()

RESEND_INTERVAL_SECONDS = 30

# Per-IP caps are deliberately loose: Indian carriers put many subscribers
# behind one CGNAT address. The per-phone limiters do the real work.
SEND_IP_LIMITER = RateLimiter(max_calls=30, window_seconds=600)
GOOGLE_IP_LIMITER = RateLimiter(max_calls=60, window_seconds=600)

_db = None
_on_new_user: Optional[Callable[[Dict[str, Any]], Awaitable[Any]]] = None
_otp_indexes_ready = False
_otp_indexes_lock: Optional[asyncio.Lock] = None


def configure(db, *, on_new_user: Optional[Callable[[Dict[str, Any]], Awaitable[Any]]] = None) -> None:  # noqa: ANN001
    """Wire the router to Mongo. Called once from server.py's startup; does
    no I/O. `on_new_user(user)` (optional coroutine function) runs in the
    background after a sign-up, e.g. server.broadcast_new_user."""
    global _db, _on_new_user, _otp_indexes_ready, _otp_indexes_lock
    _db = db
    _on_new_user = on_new_user
    _otp_indexes_ready = False
    _otp_indexes_lock = None
    test_numbers = len(parse_test_numbers(settings.test_otp_numbers))
    if test_numbers:
        logger.info("Phone OTP: %d fixed-code test number(s) configured", test_numbers)


def _require_db():
    if _db is None:
        raise HTTPException(status_code=503, detail="Auth subsystem unavailable")
    return _db


async def _otp_store() -> OTPStore:
    """OTPStore bound to the configured db; indexes created once, lazily."""
    global _otp_indexes_ready, _otp_indexes_lock
    store = OTPStore(_require_db())
    if not _otp_indexes_ready:
        if _otp_indexes_lock is None:
            _otp_indexes_lock = asyncio.Lock()
        async with _otp_indexes_lock:
            if not _otp_indexes_ready:
                try:
                    await store.ensure_indexes()
                    _otp_indexes_ready = True
                except Exception as exc:  # retried on the next OTP request
                    logger.warning("otp_codes indexes not created: %s", type(exc).__name__)
    return store


# ----------------------------------------------------------------------
# Request models
# ----------------------------------------------------------------------

class GoogleLoginRequest(BaseModel):
    id_token: str = Field(..., min_length=1, max_length=8192)
    # Version of the Terms / Privacy Policy accepted on the login screen.
    accepted_terms_version: Optional[str] = Field(None, max_length=32)


class SendPhoneOTPRequest(BaseModel):
    phone: str = Field(..., min_length=1, max_length=32)


class VerifyOTPRequest(BaseModel):
    type: str = Field("phone", max_length=16)
    identifier: str = Field(..., min_length=1, max_length=32)
    otp: Union[str, int]
    # Version of the Terms / Privacy Policy accepted on the login screen.
    accepted_terms_version: Optional[str] = Field(None, max_length=32)


# ----------------------------------------------------------------------
# Shared login completion
# ----------------------------------------------------------------------

def _log_login_blocking(**fields: Any) -> None:
    """Supabase login analytics, best-effort. BackgroundTasks runs sync
    callables in the threadpool, which keeps supabase_service's synchronous
    client off the event loop."""
    try:
        from supabase_service import log_user_login

        asyncio.run(log_user_login(**fields))
    except Exception as exc:
        logger.debug("Supabase login log skipped: %s", type(exc).__name__)


async def _notify_new_user(hook: Callable[[Dict[str, Any]], Awaitable[Any]], user: Dict[str, Any]) -> None:
    try:
        await hook(user)
    except Exception as exc:
        logger.warning("on_new_user hook failed: %s", type(exc).__name__)


async def _record_terms_acceptance(db, user: Dict[str, Any], version: Optional[str]) -> None:  # noqa: ANN001
    """Store the accepted Terms version (+ UTC timestamp) on the user when
    it is new for them; a repeat login with the same version writes nothing."""
    version = (version or "").strip()
    if not version or user.get("terms_version") == version:
        return
    accepted_at = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"terms_version": version, "terms_accepted_at": accepted_at}},
    )
    user["terms_version"] = version
    user["terms_accepted_at"] = accepted_at


async def _complete_login(
    db,  # noqa: ANN001
    user: Dict[str, Any],
    is_new_user: bool,
    background_tasks: BackgroundTasks,
    *,
    method: str,
    accepted_terms_version: Optional[str] = None,
) -> Dict[str, Any]:
    if user.get("status") == "banned":
        raise HTTPException(status_code=403, detail="Account suspended")
    uid = user["user_id"]
    await _record_terms_acceptance(db, user, accepted_terms_version)
    session = await create_session(db, uid)
    onboarding_complete = await is_onboarding_complete(db, uid)

    # Analytics get the masked phone and never the session token.
    background_tasks.add_task(
        _log_login_blocking,
        user_id=uid,
        email=user.get("email") or None,
        phone=mask_phone(user.get("phone")) or None,
        login_method=method,
        login_success_state=True,
    )
    if is_new_user and _on_new_user is not None:
        background_tasks.add_task(
            _notify_new_user,
            _on_new_user,
            {k: user.get(k) for k in ("user_id", "name", "picture", "created_at", "auth_provider", "status")},
        )
    logger.info("Login: %s via %s%s", uid, method, " (new account)" if is_new_user else "")
    return {
        "success": True,
        "session_token": session["session_token"],
        "user_id": uid,
        "is_new_user": bool(is_new_user),
        "onboarding_complete": bool(onboarding_complete),
        "name": user.get("name") or None,
        "email": user.get("email") or None,
        "phone": user.get("phone") or None,
        "picture": user.get("picture") or None,
    }


# ----------------------------------------------------------------------
# Google Sign-In
# ----------------------------------------------------------------------

@router.post("/auth/google")
async def login_with_google(req: GoogleLoginRequest, request: Request, background_tasks: BackgroundTasks):
    """Exchange a Google ID token from the native SDK for a session."""
    if not settings.google_oauth_client_ids:
        raise HTTPException(status_code=503, detail="Google Sign-In isn't set up yet")
    GOOGLE_IP_LIMITER.check_or_raise(f"google_ip:{client_ip(request)}")
    try:
        info = await verify_google_id_token(req.id_token)
    except GoogleTokenError as exc:
        logger.info("Google sign-in rejected: %s", exc)
        raise HTTPException(status_code=401, detail="Google sign-in failed")
    db = _require_db()
    user, is_new_user = await upsert_user_from_google(db, info)
    return await _complete_login(
        db, user, is_new_user, background_tasks,
        method="google", accepted_terms_version=req.accepted_terms_version,
    )


# ----------------------------------------------------------------------
# Phone OTP
# ----------------------------------------------------------------------

def _country_allowed(phone: str) -> bool:
    allowed = [c.strip() for c in (settings.otp_allowed_country_codes or []) if c.strip()]
    return not allowed or any(phone.startswith(c if c.startswith("+") else "+" + c) for c in allowed)


_COUNTRY_MSG = "Phone login is currently available for Indian (+91) mobile numbers only."


@router.post("/auth/send-phone-otp")
async def send_phone_otp(req: SendPhoneOTPRequest, request: Request):
    phone = normalize_phone(req.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Enter a valid mobile number")
    if not _country_allowed(phone):
        raise HTTPException(status_code=400, detail=_COUNTRY_MSG)
    SEND_IP_LIMITER.check_or_raise(f"otp_send_ip:{client_ip(request)}")
    OTP_LIMITER.check_or_raise(f"otp_phone:{phone}")

    db = _require_db()
    existing = await db.users.find_one(
        {"phone": {"$in": phone_lookup_candidates(phone)}}, {"_id": 0, "user_id": 1}
    )
    response = {"success": True, "is_new_user": existing is None, "resend_after": RESEND_INTERVAL_SECONDS}

    if phone in parse_test_numbers(settings.test_otp_numbers):
        logger.info("Test number %s: fixed code, no SMS sent", mask_phone(phone))
        return response

    store = await _otp_store()
    if not await store.resend_allowed(phone, RESEND_INTERVAL_SECONDS):
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {RESEND_INTERVAL_SECONDS} seconds before requesting another code",
            headers={"Retry-After": str(RESEND_INTERVAL_SECONDS)},
        )
    code = await store.issue(phone, meta={"is_new_user": existing is None})
    try:
        await get_sms_provider().send_otp(phone, code)
    except (SMSSendError, RuntimeError) as exc:
        await store.discard(phone)
        logger.error("OTP SMS to %s failed: %s", mask_phone(phone), exc)
        raise HTTPException(status_code=502, detail="Couldn't send the code. Please try again.")
    return response


@router.post("/auth/verify-otp")
async def verify_otp(req: VerifyOTPRequest, request: Request, background_tasks: BackgroundTasks):
    if (req.type or "").strip().lower() != "phone":
        raise HTTPException(status_code=400, detail="Only phone login is supported")
    phone = normalize_phone(req.identifier)
    if not phone:
        raise HTTPException(status_code=400, detail="Enter a valid mobile number")
    if not _country_allowed(phone):
        raise HTTPException(status_code=400, detail=_COUNTRY_MSG)
    OTP_VERIFY_LIMITER.check_or_raise(f"otp_verify:{phone}")

    code = re.sub(r"\s+", "", str(req.otp))
    fixed_code = parse_test_numbers(settings.test_otp_numbers).get(phone)
    if not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(status_code=401, detail="Incorrect code")
    if fixed_code is not None:
        if not hmac.compare_digest(code, fixed_code):
            raise HTTPException(status_code=401, detail="Incorrect code")
    else:
        ok, _meta, reason = await (await _otp_store()).verify(phone, code)
        if not ok:
            if reason == "mismatch":
                raise HTTPException(status_code=401, detail="Incorrect code")
            if reason == "too_many_attempts":
                raise HTTPException(status_code=429, detail="Too many attempts. Request a new code.")
            raise HTTPException(status_code=401, detail="Code expired. Please request a new one.")

    db = _require_db()
    user, is_new_user = await upsert_user_from_phone(db, phone)
    return await _complete_login(
        db, user, is_new_user, background_tasks,
        method="phone", accepted_terms_version=req.accepted_terms_version,
    )


# ----------------------------------------------------------------------
# Current user + logout
# ----------------------------------------------------------------------

@router.get("/auth/me")
async def auth_me(request: Request):
    uid = await get_current_user_id(request)  # 401 / 403 (banned)
    db = _require_db()
    user = await db.users.find_one({"user_id": uid}, {"_id": 0, "google_sub": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return {
        "user_id": uid,
        "name": user.get("name") or None,
        "email": user.get("email") or None,
        "phone": user.get("phone") or None,
        "picture": user.get("picture") or None,
        "auth_provider": user.get("auth_provider") or None,
        "onboarding_complete": await is_onboarding_complete(db, uid),
    }


@router.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    """Revoke the caller's session. Always succeeds so the app can clear
    local state even with an already-expired token."""
    token = _extract_session_token(request)
    if token and _db is not None:
        try:
            await _db.user_sessions.delete_one({"session_token": token})
        except Exception as exc:
            logger.warning("Logout: session delete failed (%s)", type(exc).__name__)
    response.delete_cookie("session_token", path="/")
    return {"ok": True}
