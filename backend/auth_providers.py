"""
Login building blocks for Film Companion: phone OTP over SMS and native
Google Sign-In, plus the Mongo helpers that turn a verified identity into a
user + session. The HTTP layer is auth_routes.py; nothing here imports
server.py.

Setup notes (everything is configured through env vars, see settings.py)
------------------------------------------------------------------------
Google Sign-In (Android app, @react-native-google-signin/google-signin)
  In ONE Google Cloud project (APIs & Services -> Credentials) create:
    1. an OAuth client of type *Web application*. Its client ID is the
       audience ("aud") of the ID tokens the Android SDK hands to the app,
       so the SAME ID goes in both places:
         backend  GOOGLE_OAUTH_CLIENT_IDS=<id>.apps.googleusercontent.com
         app      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<same id>
       (comma-separate several IDs to accept more than one audience).
    2. an OAuth client of type *Android*: package name com.filmydating.app
       + the SHA-1 of the signing certificate (Expo dashboard -> project ->
       Credentials -> Android keystore; once the app is on Google Play also
       add the Play App Signing SHA-1 from Play Console -> App integrity).
       It is never referenced in code, but without it sign-in fails on the
       device with DEVELOPER_ERROR.
  Publish the OAuth consent screen (not "Testing") before real users log in.

Phone OTP (SMS_PROVIDER = console | msg91 | twilio)
  console  dev only: logs that a code was issued, never the code itself, and
           refuses to run with APP_ENV=production. Use TEST_OTP_NUMBERS to
           log in locally.
  msg91    MSG91_AUTH_KEY + MSG91_TEMPLATE_ID. SMS to Indian numbers needs a
           DLT-approved OTP template (registered on a DLT portal, linked in
           MSG91) containing the ##OTP## variable; we pass our own code.
  twilio   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER (a
           number or an MG... Messaging Service SID). Sending to +91 numbers
           ALSO needs DLT registration (entity, sender ID and this template):
           "Your Film Companion code is {code}. It expires in 5 minutes."
  OTP_TTL_SECONDS (300), OTP_MAX_ATTEMPTS (5), SESSION_TTL_DAYS (30).
  TEST_OTP_NUMBERS="+919999900001:123456,+919999900002:654321" - fixed codes
           for Google Play review / QA: no SMS is sent and only the listed
           code works. Give one to Play Console -> App content -> App access.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from pymongo import ReturnDocument

from settings import settings

logger = logging.getLogger(__name__)


class _DropOTPRequestLogs(logging.Filter):
    """httpx logs every request URL at INFO. The MSG91 OTP API takes the
    phone number and the code as query parameters, so keep those lines out
    of the logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            return "control.msg91.com" not in record.getMessage()
        except Exception:
            return True


logging.getLogger("httpx").addFilter(_DropOTPRequestLogs())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: Any) -> Optional[datetime]:
    """Mongo hands datetimes back naive (they are stored as UTC)."""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# ----------------------------------------------------------------------
# Phone numbers
# ----------------------------------------------------------------------

_PHONE_SEPARATORS_RE = re.compile(r"[\s\-().]")
_DIGITS_RE = re.compile(r"[0-9]+")
_CODE_RE = re.compile(r"[0-9]{6}")
_INDIA_CC = "91"


def normalize_phone(raw: Any, default_country_code: str = "+91") -> Optional[str]:
    """Return `raw` as E.164 ("+919876543210"), or None when it isn't a
    usable mobile number. Accepts what people actually type: spaces, dashes,
    dots, parentheses, a "00" international prefix, a leading trunk "0",
    the bare 10-digit national number or "91" + 10 digits. Indian (+91)
    numbers must be 10-digit mobiles starting with 6-9."""
    if raw is None:
        return None
    s = _PHONE_SEPARATORS_RE.sub("", str(raw).strip())
    if not s:
        return None
    if s.startswith("00"):
        s = "+" + s[2:]
    cc = (default_country_code or "").strip().lstrip("+")
    if not _DIGITS_RE.fullmatch(cc):
        cc = _INDIA_CC
    if s.startswith("+"):
        digits = s[1:]
        if not _DIGITS_RE.fullmatch(digits) or digits.startswith("0"):
            return None
        # "+91 0XXXXXXXXXX": the trunk 0 typed after the country code.
        if len(digits) == 13 and digits.startswith(_INDIA_CC + "0"):
            digits = _INDIA_CC + digits[3:]
    else:
        if not _DIGITS_RE.fullmatch(s):
            return None
        if len(s) == 11 and s.startswith("0"):
            s = s[1:]
        if len(s) == 10:
            digits = cc + s
        elif len(s) == 10 + len(cc) and s.startswith(cc):
            digits = s
        else:
            return None
    if not 8 <= len(digits) <= 15:
        return None
    if digits.startswith(_INDIA_CC):
        national = digits[len(_INDIA_CC):]
        if len(national) != 10 or national[0] not in "6789":
            return None
    return "+" + digits


def phone_lookup_candidates(e164: str) -> List[str]:
    """The spellings an E.164 number may have been stored under by the old
    login flow (which saved the phone exactly as typed)."""
    if not e164:
        return []
    digits = e164.lstrip("+")
    out = [e164, digits]
    if len(digits) == 12 and digits.startswith(_INDIA_CC):
        national = digits[2:]
        out += [
            national,
            "0" + national,
            "+91 " + national,
            "+91-" + national,
            "91 " + national,
            f"+91 {national[:5]} {national[5:]}",
            f"{national[:5]} {national[5:]}",
        ]
    return list(dict.fromkeys(out))


def mask_phone(e164: Optional[str]) -> str:
    """"+919876543210" -> "+91******3210" (safe for logs and analytics)."""
    if not e164:
        return ""
    digits = re.sub(r"\D", "", str(e164))
    plus = "+" if str(e164).startswith("+") else ""
    if len(digits) <= 6:
        return "*" * max(0, len(digits) - 2) + digits[-2:]
    return plus + digits[:2] + "*" * (len(digits) - 6) + digits[-4:]


def parse_test_numbers(raw: Optional[str]) -> Dict[str, str]:
    """Parse TEST_OTP_NUMBERS ("+919999900001:123456,...") into
    {E.164 phone: 6-digit code}. Malformed entries are ignored."""
    out: Dict[str, str] = {}
    if not raw:
        return out
    for entry in re.split(r"[,;\n]+", str(raw)):
        phone_part, sep, code = entry.strip().rpartition(":")
        if not sep:
            continue
        phone = normalize_phone(phone_part)
        code = code.strip()
        if phone and _CODE_RE.fullmatch(code):
            out[phone] = code
    return out


# ----------------------------------------------------------------------
# OTP codes
# ----------------------------------------------------------------------

def generate_code() -> str:
    """Cryptographically random 6-digit code (leading zeros kept)."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(identifier: str, code: str) -> str:
    """Only this hash is stored; it is bound to the identifier so a code
    issued for one phone can't verify another."""
    return hashlib.sha256(f"{identifier}:{code}".encode("utf-8")).hexdigest()


class OTPStore:
    """One pending code per identifier in Mongo `otp_codes`. Survives
    restarts and works across several backend instances."""

    COLLECTION = "otp_codes"

    def __init__(self, db) -> None:  # noqa: ANN001
        self._col = db[self.COLLECTION]

    async def ensure_indexes(self) -> None:
        # TTL index: Mongo drops a doc once `expires_at` (a real datetime)
        # has passed. verify() checks expiry too, the TTL monitor is lazy.
        await self._col.create_index([("expires_at", 1)], expireAfterSeconds=0)
        await self._col.create_index([("identifier", 1)], unique=True)

    async def issue(
        self,
        identifier: str,
        *,
        ttl_seconds: Optional[int] = None,
        meta: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Create (or replace) the pending code and return it in clear text
        for the SMS. Only its hash is persisted."""
        code = generate_code()
        now = _utcnow()
        ttl = settings.otp_ttl_seconds if ttl_seconds is None else ttl_seconds
        await self._col.replace_one(
            {"identifier": identifier},
            {
                "identifier": identifier,
                "code_hash": hash_code(identifier, code),
                "attempts": 0,
                "created_at": now,
                "last_sent_at": now,
                "expires_at": now + timedelta(seconds=ttl),
                "meta": dict(meta or {}),
            },
            upsert=True,
        )
        return code

    async def verify(self, identifier: str, code: str) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """Returns (ok, meta, reason); reason is one of "ok", "not_found",
        "expired", "too_many_attempts", "mismatch". Every call counts as an
        attempt; the code is single-use."""
        doc = await self._col.find_one_and_update(
            {"identifier": identifier},
            {"$inc": {"attempts": 1}},
            return_document=ReturnDocument.AFTER,
        )
        if not doc:
            return False, None, "not_found"
        meta = doc.get("meta") or {}
        expires_at = _as_utc(doc.get("expires_at"))
        if expires_at is None or expires_at <= _utcnow():
            await self._col.delete_one({"identifier": identifier})
            return False, meta, "expired"
        if int(doc.get("attempts") or 0) > settings.otp_max_attempts:
            await self._col.delete_one({"identifier": identifier})
            return False, meta, "too_many_attempts"
        expected = str(doc.get("code_hash") or "")
        if not expected or not hmac.compare_digest(expected, hash_code(identifier, str(code))):
            return False, meta, "mismatch"
        # Conditional delete: if two requests race with the right code only
        # the one that actually removes the doc wins.
        res = await self._col.delete_one({"identifier": identifier, "code_hash": expected})
        if getattr(res, "deleted_count", 1) == 0:
            return False, None, "not_found"
        return True, meta, "ok"

    async def resend_allowed(self, identifier: str, min_interval_seconds: int = 30) -> bool:
        doc = await self._col.find_one({"identifier": identifier}, {"_id": 0, "last_sent_at": 1})
        if not doc:
            return True
        last = _as_utc(doc.get("last_sent_at"))
        if last is None:
            return True
        return (_utcnow() - last).total_seconds() >= min_interval_seconds

    async def discard(self, identifier: str) -> None:
        await self._col.delete_one({"identifier": identifier})


# ----------------------------------------------------------------------
# SMS providers
# ----------------------------------------------------------------------

class SMSSendError(Exception):
    """The SMS provider rejected the message or couldn't be reached."""


def _scrub(text: Any) -> str:
    """Provider error text for logs: no long digit runs (phones / codes)."""
    return re.sub(r"\d{6,}", "<redacted>", str(text or ""))[:200]


def _expiry_phrase() -> str:
    minutes = max(1, round(settings.otp_ttl_seconds / 60))
    return f"{minutes} minute{'' if minutes == 1 else 's'}"


class ConsoleSMSProvider:
    """Development stand-in: logs that a code was issued, never the code."""

    name = "console"
    # Last code "sent", for local QA only; always None in production.
    last_code_for_tests: Optional[str] = None

    async def send_otp(self, phone_e164: str, code: str) -> None:
        logger.info("OTP issued for %s (console SMS provider, nothing sent)", mask_phone(phone_e164))
        ConsoleSMSProvider.last_code_for_tests = None if settings.is_production else code


class MSG91Provider:
    """MSG91 SendOTP v5 with our own code (needs a DLT-approved template)."""

    name = "msg91"
    URL = "https://control.msg91.com/api/v5/otp"

    def __init__(self, auth_key: str, template_id: str, *, timeout: float = 10.0, transport=None) -> None:  # noqa: ANN001
        self.auth_key = auth_key
        self.template_id = template_id
        self.timeout = timeout
        self._transport = transport  # tests inject httpx.MockTransport

    async def send_otp(self, phone_e164: str, code: str) -> None:
        params = {"template_id": self.template_id, "mobile": phone_e164.lstrip("+"), "otp": code}
        headers = {"authkey": self.auth_key, "accept": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout, transport=self._transport) as client:
                resp = await client.post(self.URL, params=params, headers=headers, json={})
        except httpx.HTTPError as exc:
            raise SMSSendError(f"MSG91 unreachable: {type(exc).__name__}") from exc
        if not 200 <= resp.status_code < 300:
            raise SMSSendError(f"MSG91 HTTP {resp.status_code}")
        try:
            data = resp.json()
        except ValueError:
            data = None
        if not isinstance(data, dict) or str(data.get("type", "")).lower() != "success":
            detail = data.get("message") if isinstance(data, dict) else "unexpected response"
            raise SMSSendError(f"MSG91 rejected the request: {_scrub(detail)}")


class TwilioProvider:
    """Twilio Programmable SMS (Messages API)."""

    name = "twilio"

    def __init__(
        self,
        account_sid: str,
        auth_token: str,
        from_number: str,
        *,
        timeout: float = 10.0,
        transport=None,  # noqa: ANN001
    ) -> None:
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_number = from_number
        self.timeout = timeout
        self._transport = transport

    async def send_otp(self, phone_e164: str, code: str) -> None:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        form = {
            "To": phone_e164,
            "Body": f"Your Film Companion code is {code}. It expires in {_expiry_phrase()}.",
        }
        if self.from_number.startswith("MG"):
            form["MessagingServiceSid"] = self.from_number
        else:
            form["From"] = self.from_number
        try:
            async with httpx.AsyncClient(timeout=self.timeout, transport=self._transport) as client:
                resp = await client.post(url, data=form, auth=(self.account_sid, self.auth_token))
        except httpx.HTTPError as exc:
            raise SMSSendError(f"Twilio unreachable: {type(exc).__name__}") from exc
        if not 200 <= resp.status_code < 300:
            raise SMSSendError(f"Twilio HTTP {resp.status_code}")


def get_sms_provider():
    """Provider for settings.sms_provider. RuntimeError (naming the missing
    env vars) when it isn't usable."""
    name = (settings.sms_provider or "console").strip().lower()
    if name == "console":
        if settings.is_production:
            raise RuntimeError(
                "SMS_PROVIDER=console can't deliver codes in production; set SMS_PROVIDER=msg91 or twilio"
            )
        return ConsoleSMSProvider()
    if name == "msg91":
        missing = [
            env
            for env, value in (
                ("MSG91_AUTH_KEY", settings.msg91_auth_key),
                ("MSG91_TEMPLATE_ID", settings.msg91_template_id),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f"SMS_PROVIDER=msg91 needs {', '.join(missing)}")
        return MSG91Provider(settings.msg91_auth_key, settings.msg91_template_id)
    if name == "twilio":
        missing = [
            env
            for env, value in (
                ("TWILIO_ACCOUNT_SID", settings.twilio_account_sid),
                ("TWILIO_AUTH_TOKEN", settings.twilio_auth_token),
                ("TWILIO_FROM_NUMBER", settings.twilio_from_number),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f"SMS_PROVIDER=twilio needs {', '.join(missing)}")
        return TwilioProvider(settings.twilio_account_sid, settings.twilio_auth_token, settings.twilio_from_number)
    raise RuntimeError(f"Unknown SMS_PROVIDER={name!r}; use console, msg91 or twilio")


# ----------------------------------------------------------------------
# Google Sign-In
# ----------------------------------------------------------------------

_GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


class GoogleTokenError(Exception):
    """The Google ID token is missing, invalid, expired or for another app."""


def _truthy(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() == "true"
    return value is True


async def verify_google_id_token(token: str) -> Dict[str, Any]:
    """Verify an ID token from the native Google Sign-In SDK (signature,
    expiry, audience, issuer, verified email). Returns
    {sub, email, name, picture, email_verified}."""
    audiences = [aud for aud in (settings.google_oauth_client_ids or []) if aud]
    if not audiences:
        raise GoogleTokenError("not configured")
    if not isinstance(token, str) or not token.strip():
        raise GoogleTokenError("missing token")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError as exc:  # pragma: no cover - google-auth is in requirements.txt
        raise GoogleTokenError("google-auth is not installed") from exc

    def _verify() -> Dict[str, Any]:
        # Blocking: fetches Google's public certs over HTTPS.
        return google_id_token.verify_oauth2_token(
            token.strip(), google_requests.Request(), audience=audiences, clock_skew_in_seconds=10
        )

    try:
        claims = await asyncio.to_thread(_verify)
    except Exception as exc:
        raise GoogleTokenError(f"verification failed ({type(exc).__name__})") from exc
    if not isinstance(claims, dict):
        raise GoogleTokenError("verification failed")
    if claims.get("aud") not in audiences:
        raise GoogleTokenError("wrong audience")
    if claims.get("iss") not in _GOOGLE_ISSUERS:
        raise GoogleTokenError("wrong issuer")
    sub = str(claims.get("sub") or "").strip()
    if not sub:
        raise GoogleTokenError("missing subject")
    if not _truthy(claims.get("email_verified")):
        raise GoogleTokenError("email not verified")
    return {
        "sub": sub,
        "email": (str(claims.get("email") or "").strip().lower() or None),
        "name": (str(claims.get("name") or "").strip() or None),
        "picture": claims.get("picture") or None,
        "email_verified": True,
    }


# ----------------------------------------------------------------------
# Users + sessions
# ----------------------------------------------------------------------

def new_user_id() -> str:
    return f"user_{secrets.token_hex(6)}"


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


async def create_session(db, user_id: str) -> Dict[str, Any]:  # noqa: ANN001
    """Insert a `user_sessions` row (ISO-8601 string timestamps, the format
    security_deps and the admin stats expect) and return it."""
    now = _utcnow()
    session = {
        "session_token": new_session_token(),
        "user_id": user_id,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=settings.session_ttl_days)).isoformat(),
    }
    await db.user_sessions.insert_one(dict(session))
    return session


def _new_user_doc(
    *,
    auth_provider: str,
    name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    picture: Optional[str] = None,
    google_sub: Optional[str] = None,
) -> Dict[str, Any]:
    doc: Dict[str, Any] = {
        "user_id": new_user_id(),
        "name": name or "",
        "picture": picture or "",
        "created_at": _utcnow().isoformat(),
        "status": "active",
        "auth_provider": auth_provider,
    }
    if email:
        doc["email"] = email
    if phone:
        doc["phone"] = phone
    if google_sub:
        doc["google_sub"] = google_sub
    return doc


async def _insert_user(db, key: Dict[str, Any], doc: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:  # noqa: ANN001
    """Upsert keyed on the identity so a double-tapped first login doesn't
    create two accounts. Returns (stored user, created?)."""
    res = await db.users.update_one(key, {"$setOnInsert": doc}, upsert=True)
    created = getattr(res, "upserted_id", None) is not None
    stored = await db.users.find_one(key, {"_id": 0})
    if created:
        logger.info("New user %s via %s", doc["user_id"], doc["auth_provider"])
    return (stored or doc), created


async def upsert_user_from_google(db, info: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:  # noqa: ANN001
    """Find the user by Google subject, else link an existing account with
    the same (Google-verified) email, else create one. Returns
    (user, is_new)."""
    sub = str(info.get("sub") or "").strip()
    if not sub:
        raise ValueError("Google identity without a subject")
    email = (str(info.get("email") or "").strip().lower() or None)
    name = (str(info.get("name") or "").strip() or None)
    picture = info.get("picture") or None

    user = await db.users.find_one({"google_sub": sub}, {"_id": 0})
    if user is None and email:
        candidate = await db.users.find_one({"email": email}, {"_id": 0})
        # Never re-point an account already bound to another Google identity.
        if candidate is not None and candidate.get("google_sub") in (None, "", sub):
            user = candidate
    if user is not None:
        updates: Dict[str, Any] = {}
        if user.get("google_sub") != sub:
            updates["google_sub"] = sub
        if not user.get("auth_provider"):
            updates["auth_provider"] = "google"
        if email and not user.get("email"):
            updates["email"] = email
        if name and not user.get("name"):
            updates["name"] = name
        if picture and not user.get("picture"):
            updates["picture"] = picture
        if updates:
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
            user.update(updates)
        return user, False

    doc = _new_user_doc(auth_provider="google", name=name, email=email, picture=picture, google_sub=sub)
    return await _insert_user(db, {"google_sub": sub}, doc)


async def upsert_user_from_phone(db, e164: str) -> Tuple[Dict[str, Any], bool]:  # noqa: ANN001
    """Find the user by phone (matching the legacy as-typed spellings and
    rewriting them to E.164), else create one. Returns (user, is_new)."""
    user = await db.users.find_one({"phone": e164}, {"_id": 0})
    if user is None:
        user = await db.users.find_one(
            {"phone": {"$in": phone_lookup_candidates(e164)}},
            {"_id": 0},
            sort=[("created_at", 1)],
        )
        if user is not None:
            updates: Dict[str, Any] = {"phone": e164}
            if not user.get("auth_provider"):
                updates["auth_provider"] = "phone"
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
            user.update(updates)
    if user is not None:
        return user, False

    doc = _new_user_doc(auth_provider="phone", phone=e164)
    return await _insert_user(db, {"phone": e164}, doc)


async def is_onboarding_complete(db, user_id: str) -> bool:  # noqa: ANN001
    profile = await db.user_profiles.find_one(
        {"user_id": user_id},
        {"_id": 0, "onboarding_complete": 1, "tina_onboarding_complete": 1, "name": 1, "genres": 1, "topMovies": 1},
    )
    if not profile:
        return False
    if profile.get("onboarding_complete") or profile.get("tina_onboarding_complete"):
        return True
    return bool(profile.get("name") and (profile.get("genres") or profile.get("topMovies")))
