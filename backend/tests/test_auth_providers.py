"""Unit + end-to-end tests for auth_providers.py and auth_routes.py.

No network and no Mongo: an in-memory FakeDB stands in for Motor and the
SMS / Google calls are monkeypatched. Run from backend/:

    python3 -m pytest tests/test_auth_providers.py -q
"""

import asyncio
import base64
import copy
import dataclasses
import itertools
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx
import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from pymongo import ReturnDocument

import auth_providers
import auth_routes
import security_deps
from auth_providers import (
    ConsoleSMSProvider,
    GoogleTokenError,
    MSG91Provider,
    OTPStore,
    SMSSendError,
    TwilioProvider,
    generate_code,
    get_sms_provider,
    hash_code,
    mask_phone,
    normalize_phone,
    parse_test_numbers,
    phone_lookup_candidates,
)
from security_deps import RateLimiter

PHONE = "+919876543210"
TEST_PHONE = "+919999900001"
TEST_CODE = "123456"
WEB_CLIENT_ID = "web-client.apps.googleusercontent.com"


# ----------------------------------------------------------------------
# In-memory stand-in for the Motor db
# ----------------------------------------------------------------------

def _match(doc, flt):
    for key, cond in (flt or {}).items():
        value = doc.get(key)
        if isinstance(cond, dict) and cond and all(k.startswith("$") for k in cond):
            for op, arg in cond.items():
                if op == "$in":
                    if value not in arg:
                        return False
                else:
                    raise NotImplementedError(op)
        elif value != cond:
            return False
    return True


def _project(doc, projection):
    out = copy.deepcopy(doc)
    if not projection:
        return out
    include = [k for k, v in projection.items() if v and k != "_id"]
    if include:
        out = {k: v for k, v in out.items() if k in include or k == "_id"}
    else:
        for key, keep in projection.items():
            if not keep:
                out.pop(key, None)
    if not projection.get("_id", 1):
        out.pop("_id", None)
    return out


class FakeCollection:
    _ids = itertools.count(1)

    def __init__(self):
        self.docs = []
        self.indexes = []

    def _index_of(self, flt):
        return next((i for i, d in enumerate(self.docs) if _match(d, flt)), None)

    @staticmethod
    def _apply(doc, update, inserting):
        for op, fields in update.items():
            if op == "$set":
                doc.update(copy.deepcopy(fields))
            elif op == "$inc":
                for key, delta in fields.items():
                    doc[key] = doc.get(key, 0) + delta
            elif op == "$setOnInsert":
                if inserting:
                    doc.update(copy.deepcopy(fields))
            else:
                raise NotImplementedError(op)

    async def find_one(self, filter=None, projection=None, sort=None, **_kwargs):
        idx = self._index_of(filter)
        return None if idx is None else _project(self.docs[idx], projection)

    async def insert_one(self, doc):
        doc.setdefault("_id", next(self._ids))
        self.docs.append(copy.deepcopy(doc))
        return SimpleNamespace(inserted_id=doc["_id"])

    async def update_one(self, filter, update, upsert=False):
        idx = self._index_of(filter)
        if idx is not None:
            self._apply(self.docs[idx], update, inserting=False)
            return SimpleNamespace(matched_count=1, modified_count=1, upserted_id=None)
        if not upsert:
            return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=None)
        doc = {k: v for k, v in filter.items() if not isinstance(v, dict)}
        self._apply(doc, update, inserting=True)
        doc["_id"] = next(self._ids)
        self.docs.append(doc)
        return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=doc["_id"])

    async def replace_one(self, filter, replacement, upsert=False):
        new = copy.deepcopy(replacement)
        idx = self._index_of(filter)
        if idx is not None:
            new["_id"] = self.docs[idx]["_id"]
            self.docs[idx] = new
            return SimpleNamespace(matched_count=1, modified_count=1, upserted_id=None)
        if not upsert:
            return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=None)
        new["_id"] = next(self._ids)
        self.docs.append(new)
        return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=new["_id"])

    async def delete_one(self, filter):
        idx = self._index_of(filter)
        if idx is None:
            return SimpleNamespace(deleted_count=0)
        del self.docs[idx]
        return SimpleNamespace(deleted_count=1)

    async def delete_many(self, filter):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not _match(d, filter)]
        return SimpleNamespace(deleted_count=before - len(self.docs))

    async def find_one_and_update(self, filter, update, projection=None,
                                  return_document=ReturnDocument.BEFORE, upsert=False, **_kwargs):
        idx = self._index_of(filter)
        if idx is None:
            return None
        before = copy.deepcopy(self.docs[idx])
        self._apply(self.docs[idx], update, inserting=False)
        chosen = self.docs[idx] if return_document == ReturnDocument.AFTER else before
        return _project(chosen, projection)

    async def create_index(self, keys, **kwargs):
        self.indexes.append((list(keys), kwargs))
        return "_".join(f"{k}_{v}" for k, v in keys)


class FakeDB:
    def __init__(self):
        self._collections = {}

    def __getitem__(self, name):
        return self._collections.setdefault(name, FakeCollection())

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]


# ----------------------------------------------------------------------
# Fixtures / helpers
# ----------------------------------------------------------------------

def _use_settings(monkeypatch, **overrides):
    """settings is a frozen dataclass: swap in a modified copy everywhere."""
    new = dataclasses.replace(auth_providers.settings, **overrides)
    monkeypatch.setattr(auth_providers, "settings", new)
    monkeypatch.setattr(auth_routes, "settings", new)
    return new


@pytest.fixture(autouse=True)
def _reset_limiters():
    for limiter in (security_deps.OTP_LIMITER, security_deps.OTP_VERIFY_LIMITER,
                    auth_routes.SEND_IP_LIMITER, auth_routes.GOOGLE_IP_LIMITER):
        limiter._buckets.clear()
    yield


@pytest.fixture
def env(monkeypatch):
    db = FakeDB()
    _use_settings(
        monkeypatch,
        environment="development",
        sms_provider="console",
        test_otp_numbers=f"{TEST_PHONE}:{TEST_CODE}",
        google_oauth_client_ids=[WEB_CLIENT_ID],
        otp_ttl_seconds=300,
        otp_max_attempts=5,
        session_ttl_days=30,
    )
    sent = []

    class CapturingSMS:
        async def send_otp(self, phone, code):
            sent.append((phone, code))

    monkeypatch.setattr(auth_routes, "get_sms_provider", lambda: CapturingSMS())
    logged = []
    monkeypatch.setattr(auth_routes, "_log_login_blocking", lambda **fields: logged.append(fields))
    monkeypatch.setattr(security_deps, "_db", None)
    security_deps.set_security_db(db)
    monkeypatch.setattr(auth_routes, "_db", None)
    auth_routes.configure(db)

    app = FastAPI()
    api = APIRouter(prefix="/api")
    api.include_router(auth_routes.router)
    app.include_router(api)
    with TestClient(app) as client:
        yield SimpleNamespace(client=client, db=db, sent=sent, logged=logged)


def _send(client, phone):
    return client.post("/api/auth/send-phone-otp", json={"phone": phone})


def _verify(client, phone, otp):
    return client.post("/api/auth/verify-otp", json={"type": "phone", "identifier": phone, "otp": otp})


def _wrong(code):
    return "000000" if code != "000000" else "111111"


# ----------------------------------------------------------------------
# Pure functions
# ----------------------------------------------------------------------

@pytest.mark.parametrize("raw, expected", [
    ("9876543210", PHONE),
    ("09876543210", PHONE),
    ("919876543210", PHONE),
    ("+919876543210", PHONE),
    ("+91 98765 43210", PHONE),
    ("+91 09876543210", PHONE),
    ("+91-98765-43210", PHONE),
    ("(+91) 98765.43210", PHONE),
    ("0091 98765 43210", PHONE),
    ("  98765 43210 ", PHONE),
    (9876543210, PHONE),
    ("+44 7700 900123", "+447700900123"),
    ("+1 (202) 555-0123", "+12025550123"),
    (None, None),
    ("", None),
    ("12345", None),
    ("abcdefghij", None),
    ("98765 4321", None),
    ("98765432101", None),
    ("5876543210", None),
    ("+91 12345 67890", None),
    ("+91 98765 4321", None),
    ("+9198765432101", None),
    ("+0123456789", None),
    ("++919876543210", None),
    ("+12345", None),
    ("+1234567890123456", None),
    ("٩٨٧٦٥٤٣٢١٠", None),
])
def test_normalize_phone(raw, expected):
    assert normalize_phone(raw) == expected


def test_normalize_phone_other_default_country():
    assert normalize_phone("07700900123", default_country_code="+44") == "+447700900123"


def test_phone_lookup_candidates():
    candidates = phone_lookup_candidates(PHONE)
    assert candidates[:5] == [PHONE, "919876543210", "9876543210", "09876543210", "+91 9876543210"]
    assert "+91 98765 43210" in candidates
    assert len(candidates) == len(set(candidates))
    assert phone_lookup_candidates("+447700900123") == ["+447700900123", "447700900123"]
    assert phone_lookup_candidates("") == []


def test_mask_phone():
    assert mask_phone(PHONE) == "+91******3210"
    assert mask_phone("+447700900123") == "+44******0123"
    assert mask_phone(None) == ""
    assert mask_phone("") == ""


def test_parse_test_numbers():
    raw = (" +919999900001:123456, 9999900002:654321 ,bad-entry,+91999990000:111111,"
           "+919999900003:12345,+919999900004:abcdef,:123456,+919999900005:000000")
    assert parse_test_numbers(raw) == {
        "+919999900001": "123456",
        "+919999900002": "654321",
        "+919999900005": "000000",
    }
    assert parse_test_numbers("") == {}
    assert parse_test_numbers(None) == {}


def test_generate_and_hash_code():
    codes = {generate_code() for _ in range(50)}
    assert all(len(c) == 6 and c.isdigit() for c in codes)
    assert len(codes) > 1
    digest = hash_code(PHONE, "123456")
    assert digest == hash_code(PHONE, "123456")
    assert len(digest) == 64 and int(digest, 16) >= 0
    assert digest != hash_code(PHONE, "123457")
    assert digest != hash_code("+919876543211", "123456")


def test_get_sms_provider_selection(monkeypatch):
    _use_settings(monkeypatch, environment="development", sms_provider="console")
    assert isinstance(get_sms_provider(), ConsoleSMSProvider)

    _use_settings(monkeypatch, environment="production", sms_provider="console")
    with pytest.raises(RuntimeError, match="production"):
        get_sms_provider()

    _use_settings(monkeypatch, sms_provider="msg91", msg91_auth_key="", msg91_template_id="")
    with pytest.raises(RuntimeError) as err:
        get_sms_provider()
    assert "MSG91_AUTH_KEY" in str(err.value) and "MSG91_TEMPLATE_ID" in str(err.value)

    _use_settings(monkeypatch, sms_provider="msg91", msg91_auth_key="key", msg91_template_id="tmpl")
    provider = get_sms_provider()
    assert isinstance(provider, MSG91Provider) and provider.template_id == "tmpl"

    _use_settings(monkeypatch, sms_provider="twilio", twilio_account_sid="AC1",
                  twilio_auth_token="tok", twilio_from_number="")
    with pytest.raises(RuntimeError) as err:
        get_sms_provider()
    assert "TWILIO_FROM_NUMBER" in str(err.value) and "TWILIO_AUTH_TOKEN" not in str(err.value)

    _use_settings(monkeypatch, sms_provider="twilio", twilio_from_number="+15550001111")
    assert isinstance(get_sms_provider(), TwilioProvider)

    _use_settings(monkeypatch, sms_provider="carrier-pigeon")
    with pytest.raises(RuntimeError, match="carrier-pigeon"):
        get_sms_provider()


def test_console_provider_never_logs_the_code(monkeypatch, caplog):
    _use_settings(monkeypatch, environment="development", sms_provider="console")
    with caplog.at_level(logging.DEBUG):
        asyncio.run(ConsoleSMSProvider().send_otp(PHONE, "482913"))
    assert "+91******3210" in caplog.text
    assert "482913" not in caplog.text and "9876543210" not in caplog.text
    assert ConsoleSMSProvider.last_code_for_tests == "482913"

    _use_settings(monkeypatch, environment="production")
    asyncio.run(ConsoleSMSProvider().send_otp(PHONE, "111222"))
    assert ConsoleSMSProvider.last_code_for_tests is None


def test_msg91_provider_request_and_errors():
    seen = []
    replies = iter([
        httpx.Response(200, json={"type": "success", "request_id": "r1"}),
        httpx.Response(200, json={"type": "error", "message": "Invalid template"}),
        httpx.Response(401, json={"type": "error", "message": "Invalid authkey"}),
        httpx.Response(200, text="not json"),
    ])

    def handler(request):
        seen.append(request)
        return next(replies)

    provider = MSG91Provider("auth-key", "tmpl-1", transport=httpx.MockTransport(handler))
    asyncio.run(provider.send_otp(PHONE, "123456"))
    req = seen[0]
    assert req.method == "POST"
    assert (req.url.scheme, req.url.host, req.url.path) == ("https", "control.msg91.com", "/api/v5/otp")
    assert dict(req.url.params) == {"template_id": "tmpl-1", "mobile": "919876543210", "otp": "123456"}
    assert req.headers["authkey"] == "auth-key"
    for _ in range(3):
        with pytest.raises(SMSSendError):
            asyncio.run(provider.send_otp(PHONE, "123456"))


def test_msg91_request_lines_are_kept_out_of_httpx_logs(caplog):
    with caplog.at_level(logging.INFO, logger="httpx"):
        logging.getLogger("httpx").info(
            'HTTP Request: POST https://control.msg91.com/api/v5/otp?mobile=919876543210&otp=123456 "200"')
        logging.getLogger("httpx").info('HTTP Request: GET https://api.themoviedb.org/3/x "200"')
    assert "control.msg91.com" not in caplog.text
    assert "themoviedb" in caplog.text


def test_twilio_provider_request_and_errors(monkeypatch):
    _use_settings(monkeypatch, otp_ttl_seconds=300)
    seen = []
    replies = iter([httpx.Response(201, json={"sid": "SM1"}), httpx.Response(400, json={"code": 21211})])

    def handler(request):
        seen.append(request)
        return next(replies)

    provider = TwilioProvider("AC123", "secret", "+15550001111", transport=httpx.MockTransport(handler))
    asyncio.run(provider.send_otp(PHONE, "123456"))
    req = seen[0]
    assert str(req.url) == "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"
    assert req.headers["authorization"] == "Basic " + base64.b64encode(b"AC123:secret").decode()
    form = parse_qs(req.content.decode())
    assert form["To"] == [PHONE] and form["From"] == ["+15550001111"]
    assert form["Body"] == ["Your Film Companion code is 123456. It expires in 5 minutes."]
    with pytest.raises(SMSSendError):
        asyncio.run(provider.send_otp(PHONE, "123456"))


# ----------------------------------------------------------------------
# OTPStore
# ----------------------------------------------------------------------

def test_otp_store_lifecycle(monkeypatch):
    _use_settings(monkeypatch, otp_ttl_seconds=300, otp_max_attempts=3)
    db = FakeDB()
    store = OTPStore(db)
    col = db.otp_codes

    async def scenario():
        await store.ensure_indexes()
        assert ([("expires_at", 1)], {"expireAfterSeconds": 0}) in col.indexes
        assert ([("identifier", 1)], {"unique": True}) in col.indexes

        assert await store.resend_allowed(PHONE) is True
        code = await store.issue(PHONE, meta={"is_new_user": True})
        doc = col.docs[0]
        assert doc["code_hash"] == hash_code(PHONE, code) and doc["attempts"] == 0
        assert code not in doc.values()
        assert isinstance(doc["expires_at"], datetime)
        assert await store.resend_allowed(PHONE, 30) is False
        doc["last_sent_at"] = datetime.now(timezone.utc) - timedelta(seconds=31)
        assert await store.resend_allowed(PHONE, 30) is True

        assert await store.verify(PHONE, _wrong(code)) == (False, {"is_new_user": True}, "mismatch")
        assert await store.verify(PHONE, code) == (True, {"is_new_user": True}, "ok")
        assert await store.verify(PHONE, code) == (False, None, "not_found")
        assert col.docs == []

        # Too many attempts: the right code is refused after max attempts.
        code = await store.issue(PHONE)
        for _ in range(3):
            assert (await store.verify(PHONE, _wrong(code)))[2] == "mismatch"
        assert (await store.verify(PHONE, code))[2] == "too_many_attempts"
        assert col.docs == []

        # Expired codes are refused and removed.
        code = await store.issue(PHONE, ttl_seconds=-1)
        assert (await store.verify(PHONE, code))[2] == "expired"
        assert col.docs == []

        # Mongo returns naive datetimes: they are treated as UTC.
        code = await store.issue(PHONE)
        col.docs[0]["expires_at"] = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=2)
        assert (await store.verify(PHONE, code))[2] == "ok"
        code = await store.issue(PHONE)
        col.docs[0]["expires_at"] = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=5)
        assert (await store.verify(PHONE, code))[2] == "expired"

        await store.issue(PHONE)
        await store.discard(PHONE)
        assert col.docs == []

    asyncio.run(scenario())


# ----------------------------------------------------------------------
# Google ID token verification
# ----------------------------------------------------------------------

def test_verify_google_id_token_checks_claims(monkeypatch):
    from google.oauth2 import id_token as google_id_token

    good = {
        "aud": WEB_CLIENT_ID,
        "iss": "https://accounts.google.com",
        "sub": "1093",
        "email": "Film.Fan@Example.com",
        "email_verified": True,
        "name": "Film Fan",
        "picture": "https://example.com/p.jpg",
    }
    state = {"claims": good, "audience": None}

    def fake_verify(token, request, audience=None, **_kwargs):
        state["audience"] = audience
        if isinstance(state["claims"], Exception):
            raise state["claims"]
        return dict(state["claims"])

    monkeypatch.setattr(google_id_token, "verify_oauth2_token", fake_verify)

    _use_settings(monkeypatch, google_oauth_client_ids=[])
    with pytest.raises(GoogleTokenError, match="not configured"):
        asyncio.run(auth_providers.verify_google_id_token("token"))

    _use_settings(monkeypatch, google_oauth_client_ids=[WEB_CLIENT_ID])
    info = asyncio.run(auth_providers.verify_google_id_token("token"))
    assert info == {
        "sub": "1093",
        "email": "film.fan@example.com",
        "name": "Film Fan",
        "picture": "https://example.com/p.jpg",
        "email_verified": True,
    }
    assert state["audience"] == [WEB_CLIENT_ID]

    for bad in ({"aud": "someone-else"}, {"iss": "evil.example.com"},
                {"email_verified": False}, {"email_verified": "false"}, {"sub": ""}):
        state["claims"] = {**good, **bad}
        with pytest.raises(GoogleTokenError):
            asyncio.run(auth_providers.verify_google_id_token("token"))

    state["claims"] = {**good, "email_verified": "true", "iss": "accounts.google.com"}
    assert asyncio.run(auth_providers.verify_google_id_token("token"))["sub"] == "1093"

    state["claims"] = ValueError("Token expired")
    with pytest.raises(GoogleTokenError):
        asyncio.run(auth_providers.verify_google_id_token("token"))
    with pytest.raises(GoogleTokenError):
        asyncio.run(auth_providers.verify_google_id_token(""))


# ----------------------------------------------------------------------
# End-to-end through the FastAPI router
# ----------------------------------------------------------------------

def test_phone_otp_end_to_end(env):
    c = env.client
    r = _send(c, "98765 43210")
    assert r.status_code == 200, r.text
    assert r.json() == {"success": True, "is_new_user": True, "resend_after": 30}
    assert len(env.sent) == 1
    phone, code = env.sent[0]
    assert phone == PHONE and len(code) == 6 and code.isdigit()
    stored = env.db.otp_codes.docs[0]
    assert stored["code_hash"] == hash_code(PHONE, code) and code not in stored.values()

    r = _verify(c, PHONE, _wrong(code))
    assert r.status_code == 401 and r.json()["detail"] == "Incorrect code"

    r = _verify(c, "09876543210", code)
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"success", "session_token", "user_id", "is_new_user", "onboarding_complete",
                         "name", "email", "phone", "picture"}
    assert body["success"] is True and body["is_new_user"] is True
    assert body["onboarding_complete"] is False
    assert body["phone"] == PHONE and body["email"] is None and body["picture"] is None
    assert body["user_id"].startswith("user_") and len(body["user_id"]) == 17
    token = body["session_token"]

    user = env.db.users.docs[0]
    assert user["status"] == "active" and user["auth_provider"] == "phone" and user["phone"] == PHONE
    datetime.fromisoformat(user["created_at"])
    session = env.db.user_sessions.docs[0]
    assert session["session_token"] == token and session["user_id"] == body["user_id"]
    assert datetime.fromisoformat(session["expires_at"]) > datetime.now(timezone.utc) + timedelta(days=29)
    assert env.db.otp_codes.docs == []  # single use
    assert env.logged == [{"user_id": body["user_id"], "email": None, "phone": "+91******3210",
                           "login_method": "phone", "login_success_state": True}]
    assert token not in repr(env.logged)

    r = _verify(c, PHONE, code)
    assert r.status_code == 401 and r.json()["detail"] == "Code expired. Please request a new one."

    auth = {"Authorization": f"Bearer {token}"}
    r = c.get("/api/auth/me", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json() == {"user_id": body["user_id"], "name": None, "email": None, "phone": PHONE,
                        "picture": None, "auth_provider": "phone", "onboarding_complete": False}

    env.db.user_profiles.docs.append({"user_id": body["user_id"], "name": "Asha", "genres": ["Drama"]})
    assert c.get("/api/auth/me", headers=auth).json()["onboarding_complete"] is True

    assert c.post("/api/auth/logout", headers=auth).json() == {"ok": True}
    assert env.db.user_sessions.docs == []
    assert c.get("/api/auth/me", headers=auth).status_code == 401
    assert c.post("/api/auth/logout").json() == {"ok": True}
    assert c.get("/api/auth/me").status_code == 401


def test_returning_legacy_phone_user_is_matched_and_rewritten(env):
    env.db.users.docs.append({"_id": "legacy", "user_id": "user_aaaaaaaaaaaa", "name": "Ravi",
                              "phone": "+91 98765 43210", "picture": "",
                              "created_at": "2025-01-01T00:00:00+00:00"})
    env.db.user_profiles.docs.append({"user_id": "user_aaaaaaaaaaaa", "onboarding_complete": True})
    c = env.client
    r = _send(c, PHONE)
    assert r.status_code == 200 and r.json()["is_new_user"] is False
    r = _verify(c, PHONE, env.sent[-1][1])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user_id"] == "user_aaaaaaaaaaaa" and body["is_new_user"] is False
    assert body["onboarding_complete"] is True and body["name"] == "Ravi"
    assert len(env.db.users.docs) == 1
    assert env.db.users.docs[0]["phone"] == PHONE


def test_test_number_uses_fixed_code_without_sms(env):
    c = env.client
    r = _send(c, "+91 99999 00001")
    assert r.status_code == 200 and r.json()["is_new_user"] is True
    assert env.sent == [] and env.db.otp_codes.docs == []

    r = _verify(c, TEST_PHONE, "654321")
    assert r.status_code == 401 and r.json()["detail"] == "Incorrect code"
    r = _verify(c, "9999900001", TEST_CODE)
    assert r.status_code == 200, r.text
    first = r.json()
    assert first["is_new_user"] is True and first["phone"] == TEST_PHONE

    r = _verify(c, TEST_PHONE, TEST_CODE)
    assert r.status_code == 200
    assert r.json()["is_new_user"] is False and r.json()["user_id"] == first["user_id"]
    assert r.json()["session_token"] != first["session_token"]


def test_banned_user_gets_403(env):
    env.db.users.docs.append({"_id": "banned", "user_id": "user_bbbbbbbbbbbb", "phone": "9876543210",
                              "status": "banned", "created_at": "2025-01-01T00:00:00+00:00"})
    c = env.client
    assert _send(c, PHONE).json()["is_new_user"] is False
    r = _verify(c, PHONE, env.sent[-1][1])
    assert r.status_code == 403 and r.json()["detail"] == "Account suspended"
    assert env.db.user_sessions.docs == []

    # A session that already exists is refused by /auth/me too.
    env.db.user_sessions.docs.append({"session_token": "old-token", "user_id": "user_bbbbbbbbbbbb",
                                      "created_at": "2025-01-01T00:00:00+00:00",
                                      "expires_at": "2999-01-01T00:00:00+00:00"})
    assert c.get("/api/auth/me", headers={"Authorization": "Bearer old-token"}).status_code == 403


def test_send_otp_validation_resend_and_limits(env, monkeypatch):
    c = env.client
    r = _send(c, "12345")
    assert r.status_code == 400 and r.json()["detail"] == "Enter a valid mobile number"

    assert _send(c, PHONE).status_code == 200
    r = _send(c, PHONE)
    assert r.status_code == 429
    assert r.json()["detail"] == "Please wait 30 seconds before requesting another code"
    assert len(env.sent) == 1

    monkeypatch.setattr(auth_routes, "SEND_IP_LIMITER", RateLimiter(max_calls=1, window_seconds=600))
    assert _send(c, "+919876500001").status_code == 200
    assert _send(c, "+919876500002").status_code == 429

    r = c.post("/api/auth/verify-otp", json={"type": "email", "identifier": "a@b.c", "otp": "123456"})
    assert r.status_code == 400
    r = _verify(c, "not a phone", "123456")
    assert r.status_code == 400


def test_sms_failure_returns_502_and_discards_code(env, monkeypatch):
    class FailingSMS:
        async def send_otp(self, phone, code):
            raise SMSSendError("MSG91 HTTP 500")

    monkeypatch.setattr(auth_routes, "get_sms_provider", lambda: FailingSMS())
    r = _send(env.client, PHONE)
    assert r.status_code == 502 and r.json()["detail"] == "Couldn't send the code. Please try again."
    assert env.db.otp_codes.docs == []

    def misconfigured():
        raise RuntimeError("SMS_PROVIDER=msg91 needs MSG91_AUTH_KEY")

    monkeypatch.setattr(auth_routes, "get_sms_provider", misconfigured)
    assert _send(env.client, PHONE).status_code == 502
    assert env.db.otp_codes.docs == []


def test_verify_too_many_attempts(env, monkeypatch):
    _use_settings(monkeypatch, otp_max_attempts=2, test_otp_numbers="")
    c = env.client
    assert _send(c, PHONE).status_code == 200
    code = env.sent[-1][1]
    assert _verify(c, PHONE, _wrong(code)).status_code == 401
    assert _verify(c, PHONE, _wrong(code)).status_code == 401
    r = _verify(c, PHONE, code)
    assert r.status_code == 429 and r.json()["detail"] == "Too many attempts. Request a new code."
    assert env.db.users.docs == []

    security_deps.OTP_VERIFY_LIMITER._buckets.clear()
    for _ in range(security_deps.OTP_VERIFY_LIMITER.max_calls):
        _verify(c, PHONE, "000000")
    assert _verify(c, PHONE, "000000").status_code == 429


def test_google_sign_in_creates_then_reuses_user(env, monkeypatch):
    profile = {"sub": "google-sub-1", "email": "film.fan@example.com", "name": "Film Fan",
               "picture": "https://example.com/p.jpg", "email_verified": True}

    async def fake_verify(token):
        if token != "good-token":
            raise GoogleTokenError("verification failed (ValueError)")
        return dict(profile)

    monkeypatch.setattr(auth_routes, "verify_google_id_token", fake_verify)
    c = env.client

    r = c.post("/api/auth/google", json={"id_token": "good-token"})
    assert r.status_code == 200, r.text
    first = r.json()
    assert first["is_new_user"] is True and first["onboarding_complete"] is False
    assert (first["email"], first["name"], first["picture"]) == (
        "film.fan@example.com", "Film Fan", "https://example.com/p.jpg")
    assert first["phone"] is None
    user = env.db.users.docs[0]
    assert user["google_sub"] == "google-sub-1" and user["auth_provider"] == "google"
    assert user["status"] == "active"

    r = c.post("/api/auth/google", json={"id_token": "good-token"})
    assert r.status_code == 200
    second = r.json()
    assert second["is_new_user"] is False and second["user_id"] == first["user_id"]
    assert second["session_token"] != first["session_token"]
    assert len(env.db.users.docs) == 1

    me = c.get("/api/auth/me", headers={"Authorization": f"Bearer {second['session_token']}"}).json()
    assert me["auth_provider"] == "google" and "google_sub" not in me

    r = c.post("/api/auth/google", json={"id_token": "forged"})
    assert r.status_code == 401 and r.json()["detail"] == "Google sign-in failed"
    assert env.logged[0]["login_method"] == "google"


def test_google_links_existing_email_account_and_respects_bans(env, monkeypatch):
    env.db.users.docs.append({"_id": "legacy", "user_id": "user_cccccccccccc", "name": "",
                              "email": "fan@example.com", "picture": "",
                              "created_at": "2025-01-01T00:00:00+00:00"})

    async def fake_verify(token):
        return {"sub": token, "email": "fan@example.com", "name": "Fan", "picture": None,
                "email_verified": True}

    monkeypatch.setattr(auth_routes, "verify_google_id_token", fake_verify)
    c = env.client
    r = c.post("/api/auth/google", json={"id_token": "sub-A"})
    assert r.status_code == 200
    assert r.json()["user_id"] == "user_cccccccccccc" and r.json()["is_new_user"] is False
    legacy = env.db.users.docs[0]
    assert legacy["google_sub"] == "sub-A" and legacy["name"] == "Fan"

    # Another Google identity with the same email never takes over the account.
    r = c.post("/api/auth/google", json={"id_token": "sub-B"})
    assert r.status_code == 200
    assert r.json()["user_id"] != "user_cccccccccccc" and r.json()["is_new_user"] is True

    legacy["status"] = "banned"
    r = c.post("/api/auth/google", json={"id_token": "sub-A"})
    assert r.status_code == 403 and r.json()["detail"] == "Account suspended"


def test_google_not_configured_returns_503(env, monkeypatch):
    _use_settings(monkeypatch, google_oauth_client_ids=[])
    r = env.client.post("/api/auth/google", json={"id_token": "anything"})
    assert r.status_code == 503 and r.json()["detail"] == "Google Sign-In isn't set up yet"
