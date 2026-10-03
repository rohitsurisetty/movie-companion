"""
End-to-end smoke test of the API with an in-memory MongoDB (mongomock-motor).

No network, no real Mongo, no OpenAI/Supabase keys: it exercises the real
FastAPI app (middleware, routes, services) the way the Android app does —
phone login with fixed test codes, profile, filters, matches, chat, privacy
and IDOR guards, photo upload without storage, and account deletion — plus
the Google Play launch-readiness features: terms acceptance, blocking,
reporting Tina replies, the public deletion-request form and /legal pages.

    pip install -r requirements-dev.txt
    cd backend && python -m pytest tests/test_api_smoke.py -q
"""

import asyncio
import base64
import dataclasses
import logging
import os
import sys
from types import SimpleNamespace

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

# Configure BEFORE importing the app (settings are read at import time).
os.environ.update({
    "MONGO_URL": "mongodb://localhost:27017",
    "DB_NAME": "smoke_test",
    "APP_ENV": "development",
    "SMS_PROVIDER": "console",
    "TEST_OTP_NUMBERS": "+919999900001:123456,+919999900002:654321,+919999900003:111111",
    "MOCK_SEED_CHATS": "true",
    "MOCK_FEED_PROFILES": "true",
})
for key in ("OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_KEY",
            "ELEVENLABS_API_KEY", "TMDB_ACCESS_TOKEN", "GOOGLE_MAPS_API_KEY", "ADMIN_PASSWORD_HASH"):
    os.environ.pop(key, None)

mongomock_motor = pytest.importorskip("mongomock_motor")
from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402

server.db = mongomock_motor.AsyncMongoMockClient()["smoke_test"]


@pytest.fixture(scope="module")
def client():
    with TestClient(server.socket_app if hasattr(server, "socket_app") else server.app) as c:
        yield c


def _login(client, phone, code, **verify_extra):
    r = client.post("/api/auth/send-phone-otp", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = client.post("/api/auth/verify-otp",
                    json={"type": "phone", "identifier": phone, "otp": code, **verify_extra})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["session_token"] and data["user_id"].startswith("user_")
    return data["user_id"], {"Authorization": f"Bearer {data['session_token']}"}


PROFILE_A = {
    "name": "Asha", "age": 25, "dob": "2000-01-01", "gender": "Woman", "partnerPreference": "Men",
    "location": "Koramangala, Bengaluru", "coordinates": {"lat": 12.93, "lng": 77.62},
    "relationshipIntent": ["Serious relationship"], "genres": ["Drama", "Sci-Fi"],
    "filmLanguages": ["Hindi", "English"], "languagesSpoken": ["English", "Hindi"],
    "movieFrequency": "Once a week", "ottTheatre": "Both OTT & Theatre", "religion": "Hindu",
    "bio": "Nolan fan", "visibilityToggles": {"religion": False},
}
PROFILE_B = {
    "name": "Ravi", "age": 27, "dob": "1998-05-05", "gender": "Man", "partnerPreference": "Women",
    "location": "Indiranagar, Bengaluru", "relationshipIntent": ["Serious relationship"],
    "genres": ["Drama", "Thriller"], "filmLanguages": ["Hindi"], "languagesSpoken": ["Hindi"],
    "movieFrequency": "Twice a week", "ottTheatre": "OTT Person",
}


def test_full_flow(client):
    # --- auth ---
    assert client.get("/api/tmdb/search", params={"query": "x"}).status_code == 401
    r = client.post("/api/auth/send-phone-otp", json={"phone": "+447700900123"})
    assert r.status_code == 400  # only +91 numbers
    client.post("/api/auth/send-phone-otp", json={"phone": "9999900001"})
    bad = client.post("/api/auth/verify-otp", json={"type": "phone", "identifier": "+919999900001", "otp": "000000"})
    assert bad.status_code == 401

    a_id, A = _login(client, "9999900001", "123456")
    b_id, B = _login(client, "+91 99999 00002", "654321")
    c_id, C = _login(client, "09999900003", "111111")
    me = client.get("/api/auth/me", headers=A)
    assert me.status_code == 200 and me.json()["onboarding_complete"] is False

    # --- profile: validation, privacy ---
    under18 = client.post("/api/user/profile", headers=A, json={**PROFILE_A, "dob": "2012-01-01"})
    assert under18.status_code == 400
    assert client.post("/api/user/profile", headers=A, json={**PROFILE_A, "user_id": b_id}).status_code == 200
    assert client.post("/api/user/profile", headers=B, json=PROFILE_B).status_code == 200
    assert client.get("/api/auth/me", headers=A).json()["onboarding_complete"] is True

    own = client.get(f"/api/user/profile/{a_id}", headers=A).json()["profile"]
    assert own["dob"] == "2000-01-01" and own["name"] == "Asha"
    seen_by_b = client.get(f"/api/user/profile/{a_id}", headers=B).json()["profile"]
    for private in ("dob", "coordinates", "locationFull", "phone", "email", "religion"):
        assert private not in seen_by_b, private
    # body user_id was ignored: B's profile is still B's
    assert client.get(f"/api/user/profile/{b_id}", headers=B).json()["profile"]["name"] == "Ravi"

    # --- filters ---
    f = client.post("/api/user/filters", headers=A, json={
        "distance_radius": None, "age_min": 21, "age_max": 35, "genres": ["Drama"],
        "exclusive_toggles": {"ageRange": True}, "expand_if_run_out_toggles": {"ageRange": True},
    })
    assert f.status_code == 200 and f.json()["success"] is True

    # --- matches: real users are matchable, mocks are flagged ---
    m = client.post("/api/matches", headers=A, json={"user_id": a_id, "limit": 20, "force_refresh": True, "mode": "date"})
    assert m.status_code == 200, m.text
    matches = m.json()["matches"]
    assert any(x.get("user_id") == b_id for x in matches), "real user B should be in A's feed"
    assert all("is_mock" in x for x in matches)

    # --- chat: IDOR + participation guards ---
    assert client.get(f"/api/chat/conversations/{b_id}", headers=A).status_code == 404
    assert client.post("/api/chat/send", headers=A, json={"sender_id": a_id, "receiver_id": a_id, "content": "hi"}).status_code == 400
    sent = client.post("/api/chat/send", headers=A, json={"sender_id": b_id, "receiver_id": b_id if False else b_id, "content": "Hi Ravi!"})
    # sender_id is forced to the caller (A), so this is A → B, not B → B
    assert sent.status_code == 200, sent.text
    convs = client.get(f"/api/chat/conversations/{a_id}", headers=A).json()["conversations"]
    cid = next(cv["conversation_id"] for cv in convs if (cv.get("other_user") or {}).get("user_id") == b_id)
    assert client.get(f"/api/chat/messages/{cid}", headers=A).status_code == 200
    assert client.get(f"/api/chat/messages/{cid}", headers=C).status_code == 404
    assert client.delete(f"/api/user/pictures/{b_id}/1", headers=A).status_code == 404
    assert client.get(f"/api/user/match-history/{a_id}", headers=A).status_code == 200

    # --- photos without storage configured → clear 503, nothing stored as base64 ---
    tiny_png = base64.b64encode(bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")).decode()
    up = client.post("/api/user/pictures/upload", headers=A, json={
        "user_id": a_id, "picture_number": 1, "image_data": tiny_png, "content_type": "image/png"})
    assert up.status_code == 503, up.text

    # --- Tina works without an OpenAI key (deterministic fallback) ---
    t = client.post("/api/tina/chat", headers=C, json={
        "user_id": c_id, "user_name": "Chitra", "message": "hi", "is_onboarding_complete": False})
    assert t.status_code == 200, t.text
    assert t.json().get("success") is True and t.json().get("response")
    assert client.get("/api/tina/greeting", params={"user_name": "Chitra"}).status_code == 200

    # --- Google Sign-In without GOOGLE_OAUTH_CLIENT_IDS → explicit 503 ---
    assert client.post("/api/auth/google", json={"id_token": "x" * 40}).status_code == 503

    # --- admin login disabled without a password hash ---
    assert client.post("/api/admin/login", json={"username": "admin", "password": "admin123"}).status_code == 503

    # --- delete account: everything goes, session dies ---
    d = client.delete(f"/api/user/{a_id}/reset-all", headers=A)
    assert d.status_code == 200, d.text
    assert client.get("/api/auth/me", headers=A).status_code == 401
    assert client.get(f"/api/chat/messages/{cid}", headers=B).status_code == 404

    # --- logout ---
    assert client.post("/api/auth/logout", headers=B).status_code == 200
    assert client.get("/api/auth/me", headers=B).status_code == 401


# ---------------------------------------------------------------------------
# Launch readiness: terms acceptance, block, Tina reports, deletion requests,
# legal pages, log hygiene, Supabase helpers
# ---------------------------------------------------------------------------

TERMS_VERSION = "2026-10-03"
PROFILE_C = {
    "name": "Chetan", "age": 28, "dob": "1997-03-03", "gender": "Man", "partnerPreference": "Women",
    "location": "HSR Layout, Bengaluru", "coordinates": {"lat": 12.91, "lng": 77.64},
    "relationshipIntent": ["Serious relationship"], "genres": ["Drama", "Sci-Fi"],
    "filmLanguages": ["Hindi", "English"], "languagesSpoken": ["English", "Hindi"],
    "movieFrequency": "Once a week", "ottTheatre": "Both OTT & Theatre",
}
LEGAL_PAGES = ("/legal", "/legal/terms", "/legal/privacy", "/legal/guidelines",
               "/legal/delete-account", "/legal/contact")


def _db_call(client, fn, *args):
    """Run a Motor (mongomock) call on the app's event loop."""
    return client.portal.call(lambda: fn(*args))


def _matches(client, headers, force_refresh=False):
    r = client.post("/api/matches", headers=headers,
                    json={"limit": 200, "force_refresh": force_refresh, "mode": "date"})
    assert r.status_code == 200, r.text
    return {m.get("user_id"): m for m in r.json()["matches"]}


def test_terms_block_and_tina_report(client, caplog):
    db = server.db
    # --- terms acceptance is recorded on the user at verify-otp ---
    a_id, A = _login(client, "9999900001", "123456", accepted_terms_version=TERMS_VERSION)
    user = _db_call(client, db.users.find_one, {"user_id": a_id}, {"_id": 0})
    assert user["terms_version"] == TERMS_VERSION and user["terms_accepted_at"]
    accepted_at = user["terms_accepted_at"]
    verify = {"type": "phone", "identifier": "+919999900001", "otp": "123456"}
    # same version (or none) again → nothing rewritten; a new version → recorded
    assert client.post("/api/auth/verify-otp", json={**verify, "accepted_terms_version": TERMS_VERSION}).status_code == 200
    assert client.post("/api/auth/verify-otp", json=verify).status_code == 200
    user = _db_call(client, db.users.find_one, {"user_id": a_id}, {"_id": 0})
    assert (user["terms_version"], user["terms_accepted_at"]) == (TERMS_VERSION, accepted_at)
    assert client.post("/api/auth/verify-otp", json={**verify, "accepted_terms_version": "2027-01-01"}).status_code == 200
    assert _db_call(client, db.users.find_one, {"user_id": a_id}, {"_id": 0})["terms_version"] == "2027-01-01"
    assert client.post("/api/auth/verify-otp", json={**verify, "accepted_terms_version": "x" * 33}).status_code == 422

    c_id, C = _login(client, "09999900003", "111111")
    assert client.post("/api/user/profile", headers=A, json=PROFILE_A).status_code == 200
    assert client.post("/api/user/profile", headers=C, json=PROFILE_C).status_code == 200

    # --- before the block A and C see each other (without private fields) ---
    assert c_id in _matches(client, A, force_refresh=True)
    a_in_c = _matches(client, C, force_refresh=True).get(a_id)
    assert a_in_c is not None
    for private in ("coordinates", "dob", "phone", "email", "locationFull"):
        assert private not in a_in_c, private
    sent = client.post("/api/chat/send", headers=C, json={"receiver_id": a_id, "content": "Hi Asha!"})
    assert sent.status_code == 200, sent.text
    requests = client.get(f"/api/chat/requests/{a_id}", headers=A).json()["requests"]
    assert any(r.get("from_user_id") == c_id for r in requests)

    # --- A blocks C ---
    assert client.post("/api/user/block", headers=A, json={"blocked_user_id": a_id}).status_code == 400
    assert client.post("/api/user/block", headers=A, json={"blocked_user_id": "  "}).status_code == 400
    assert client.post("/api/user/block", headers=A, json={"blocked_user_id": ""}).status_code == 422
    assert client.post("/api/user/block", json={"blocked_user_id": c_id}).status_code == 401
    r = client.post("/api/user/block", headers=A, json={"blocked_user_id": c_id, "reason": "Rude messages"})
    assert r.status_code == 200 and r.json() == {"success": True}
    blocks = _db_call(client, lambda: db.user_blocks.find({"blocker_id": a_id}, {"_id": 0}).to_list(length=None))
    assert [(b["blocked_id"], b["reason"]) for b in blocks] == [(c_id, "Rude messages")] and blocks[0]["created_at"]

    # Gone from both feeds — cached lists (exclusion applied on read) and fresh ones.
    assert c_id not in _matches(client, A)
    assert a_id not in _matches(client, C)
    assert c_id not in _matches(client, A, force_refresh=True)
    assert a_id not in _matches(client, C, force_refresh=True)

    # Nobody can message, and nothing reopens the conversation.
    cid = server.get_conversation_id(a_id, c_id)
    assert client.post("/api/chat/send", headers=C, json={"receiver_id": a_id, "content": "hello?"}).status_code == 404
    assert client.post("/api/chat/send", headers=A, json={"receiver_id": c_id, "content": "hi"}).status_code == 404
    assert client.post("/api/chat/accept", headers=A, json={"conversation_id": cid}).status_code == 404
    assert client.post("/api/chat/decline", headers=A, json={"conversation_id": cid}).status_code == 404
    assert client.post("/api/chat/unmatch", headers=C, json={"other_user_id": a_id}).json()["success"] is False
    conv = _db_call(client, db.chat_conversations.find_one, {"conversation_id": cid}, {"_id": 0})
    assert conv["status"] == "blocked" and conv["blocked_by"] == a_id and conv["block_reason"] == "Rude messages"
    assert not any(r.get("from_user_id") == c_id
                   for r in client.get(f"/api/chat/requests/{a_id}", headers=A).json()["requests"])
    for uid, hdrs, other in ((a_id, A, c_id), (c_id, C, a_id)):
        convs = client.get(f"/api/chat/conversations/{uid}", headers=hdrs).json()["conversations"]
        assert all(cv.get("other_user_id") != other for cv in convs)
    assert client.get(f"/api/chat/unmatched/{cid}", headers=C).status_code == 404

    # A block with no conversation behind it still hides both directions.
    import matchmaking_service
    _db_call(client, db.user_blocks.insert_one, {"blocker_id": "user_x1", "blocked_id": "user_y1"})
    assert "user_x1" in _db_call(client, matchmaking_service.build_exclusion_set, "user_y1")
    assert "user_y1" in _db_call(client, matchmaking_service.build_exclusion_set, "user_x1")
    _db_call(client, db.user_blocks.delete_many, {"blocker_id": "user_x1"})

    # Blocking someone you never talked to creates the closed conversation.
    b_id, B = _login(client, "+91 99999 00002", "654321")
    assert client.post("/api/user/block", headers=B, json={"blocked_user_id": c_id}).status_code == 200
    conv_bc = _db_call(client, db.chat_conversations.find_one,
                       {"conversation_id": server.get_conversation_id(b_id, c_id)}, {"_id": 0})
    assert conv_bc["status"] == "blocked" and conv_bc["initiated_by"] == b_id
    assert sorted(conv_bc["participants"]) == sorted([b_id, c_id]) and conv_bc["last_message"] is None
    assert client.post("/api/chat/send", headers=C, json={"receiver_id": b_id, "content": "hey"}).status_code == 404

    # --- report a Tina reply ---
    secret_reply = "Tina reply text 7f3a9 that must not be logged"
    with caplog.at_level(logging.INFO):
        r = client.post("/api/tina/report", headers=A,
                        json={"message": secret_reply, "reason": "offensive", "source": "chat"})
    assert r.status_code == 200 and r.json() == {"success": True}
    assert secret_reply not in caplog.text and "Tina reply reported" in caplog.text
    reports = _db_call(client, lambda: db.tina_ai_reports.find({"user_id": a_id}, {"_id": 0}).to_list(length=None))
    assert len(reports) == 1
    assert {k: reports[0][k] for k in ("message", "reason", "source", "status", "details")} == {
        "message": secret_reply, "reason": "offensive", "source": "chat", "status": "pending", "details": None}
    assert reports[0]["report_id"] and reports[0]["created_at"]
    assert client.post("/api/tina/report", json={"message": "x", "reason": "other"}).status_code == 401
    assert client.post("/api/tina/report", headers=A, json={"message": "", "reason": "other"}).status_code == 422
    assert client.post("/api/tina/report", headers=A, json={"message": "x" * 4001, "reason": "other"}).status_code == 422
    assert client.post("/api/tina/report", headers=A, json={"message": "x", "reason": "r" * 33}).status_code == 422

    # --- deleting the account also removes blocks (both directions) and Tina reports ---
    d = client.delete(f"/api/user/{a_id}/reset-all", headers=A)
    assert d.status_code == 200, d.text
    assert d.json()["deleted"]["user_blocks"] == 1 and d.json()["deleted"]["tina_ai_reports"] == 1
    left = _db_call(client, db.user_blocks.count_documents, {"$or": [{"blocker_id": a_id}, {"blocked_id": a_id}]})
    assert left == 0
    assert _db_call(client, db.tina_ai_reports.count_documents, {"user_id": a_id}) == 0
    assert _db_call(client, db.user_blocks.count_documents, {"blocker_id": b_id}) == 1  # others' blocks stay


def test_account_deletion_request_is_public(client, caplog):
    server.DELETION_REQUEST_LIMITER._buckets.clear()
    try:
        with caplog.at_level(logging.INFO):
            r = client.post("/api/account-deletion-request",
                            json={"contact": "+91 98765 43210", "reason": "Not using it any more"})
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True and r.json()["message"]
        assert "98765 43210" not in caplog.text and "9876543210" not in caplog.text
        assert "+91******3210" in caplog.text
        doc = _db_call(client, server.db.account_deletion_requests.find_one,
                       {"contact": "+91 98765 43210"}, {"_id": 0})
        assert doc["status"] == "pending" and doc["reason"] == "Not using it any more"
        assert doc["request_id"].startswith("delreq_") and doc["created_at"]

        with caplog.at_level(logging.INFO):
            assert client.post("/api/account-deletion-request",
                               json={"contact": "someone@example.com"}).status_code == 200
        assert "someone@example.com" not in caplog.text and "s***@example.com" in caplog.text

        assert client.post("/api/account-deletion-request", json={"contact": "ab"}).status_code == 422
        assert client.post("/api/account-deletion-request", json={"contact": "x" * 101}).status_code == 422
        assert client.post("/api/account-deletion-request",
                           json={"contact": "abc", "reason": "r" * 501}).status_code == 422
        # 5 per hour per IP (2 used above)
        for _ in range(3):
            assert client.post("/api/account-deletion-request", json={"contact": "abc@example.com"}).status_code == 200
        assert client.post("/api/account-deletion-request", json={"contact": "abc@example.com"}).status_code == 429
    finally:
        server.DELETION_REQUEST_LIMITER._buckets.clear()


def test_legal_pages_are_public_html(client):
    for path in LEGAL_PAGES:
        r = client.get(path)
        assert r.status_code == 200, path
        assert r.headers["content-type"].startswith("text/html"), path
        assert "default-src 'none'" in r.headers["content-security-policy"]
        assert "Film Companion" in r.text and "[Company legal name]" in r.text
        assert client.head(path).status_code == 200
    terms = client.get("/legal/terms").text
    assert "zero tolerance" in terms.lower() and "Grievance Officer" in terms
    assert 'id="child-safety"' in client.get("/legal/guidelines").text
    privacy = client.get("/legal/privacy").text
    assert "Digital Personal Data Protection Act, 2023" in privacy and "support@example.com" in privacy
    delete = client.get("/legal/delete-account").text
    assert "/api/account-deletion-request" in delete and "mailto:support@example.com" in delete
    contact = client.get("/legal/contact").text
    assert "[Grievance Officer name]" in contact and "mailto:support@example.com" in contact


def test_legal_pages_escape_configured_values(client, monkeypatch):
    import legal_pages
    hostile = dataclasses.replace(
        legal_pages.settings,
        app_display_name="<script>alert(1)</script>",
        legal_company_name='Films & Co "Pvt" Ltd',
        legal_company_address="1 <b>Main</b> Road\nBengaluru",
        support_email='x"><img src=x onerror=alert(1)>@example.com',
        grievance_officer_name="<i>Officer</i>",
    )
    monkeypatch.setattr(legal_pages, "settings", hostile)
    for path in LEGAL_PAGES:
        text = client.get(path).text
        assert "<script>alert(1)" not in text and "&lt;script&gt;alert(1)&lt;/script&gt;" in text, path
        assert "<img" not in text and "<b>Main" not in text and "<i>Officer" not in text, path
        assert "Films &amp; Co &quot;Pvt&quot; Ltd" in text, path


def test_log_hygiene():
    from security_deps import RedactSecretsFilter, redact_secrets
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING
    assert logging.getLogger("httpcore").getEffectiveLevel() >= logging.WARNING
    line = redact_secrets('HTTP Request: GET https://maps.googleapis.com/maps/api/geocode/json'
                          '?latlng=12.9,77.6&key=AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE12345 "HTTP/1.1 200 OK"')
    assert "AIza" not in line and "key=[REDACTED]" in line and "latlng=12.9,77.6" in line
    assert "sk-proj-abc" not in redact_secrets("Incorrect API key provided: sk-proj-abc123****wxyz.")
    # uvicorn's access formatter unpacks record.args — the filter must keep the tuple shape.
    assert any(isinstance(f, RedactSecretsFilter) for f in logging.getLogger("uvicorn.access").filters)
    record = logging.LogRecord(
        "uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d',
        ("1.2.3.4:5", "GET", "/api/tina/voice/speak-stream?text=Hi%20Asha&session_token=tok123", "1.1", 200),
        None,
    )
    assert RedactSecretsFilter().filter(record) is True
    assert record.args[2] == "/api/tina/voice/speak-stream?text=[REDACTED]&session_token=[REDACTED]"
    assert len(record.args) == 5 and record.args[4] == 200


def test_supabase_keepalive_not_started_under_tests(client):
    assert server._supabase_keepalive_task is None


def test_supabase_keepalive_loop_pings_and_survives_errors(monkeypatch):
    calls = []

    def flaky_query():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("project paused")

    monkeypatch.setattr(server, "SUPABASE_KEEPALIVE_INTERVAL_SECONDS", 0.01)
    monkeypatch.setattr(server, "_supabase_keepalive_query", flaky_query)

    async def run_briefly():
        task = asyncio.create_task(server._supabase_keepalive_loop())
        for _ in range(500):  # up to ~5 s on a slow machine
            if len(calls) >= 2:
                break
            await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run_briefly())
    assert len(calls) >= 2  # kept going after the first failure


class _FakeMovieLibraryTable:
    def __init__(self, owner):
        self.owner, self.op, self.payload = owner, None, None

    def select(self, *_args, **_kwargs):
        self.op = "select"
        return self

    def eq(self, *_args):
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def execute(self):
        if self.op == "select":
            return SimpleNamespace(data=[])
        extended = "cast_ids" in self.payload
        self.owner.inserts.append("extended" if extended else "base")
        if extended and self.owner.error is not None:
            raise self.owner.error
        return SimpleNamespace(data=[self.payload])


class _FakeSupabase:
    def __init__(self, error):
        self.error, self.inserts = error, []

    def table(self, _name):
        return _FakeMovieLibraryTable(self)


def test_movie_library_missing_extended_columns_warns_once(monkeypatch, caplog):
    import supabase_service
    from postgrest.exceptions import APIError

    missing = APIError({"code": "PGRST204", "details": None, "hint": None,
                        "message": "Could not find the 'cast_ids' column of 'movie_library' in the schema cache"})
    fake = _FakeSupabase(missing)
    monkeypatch.setattr(supabase_service, "get_supabase_client", lambda: fake)
    monkeypatch.setattr(supabase_service, "_movie_library_extended_missing", False)
    with caplog.at_level(logging.WARNING, logger="supabase_service"):
        for movie_id in (1, 2, 3):
            out = asyncio.run(supabase_service.save_movie_to_library({"id": movie_id, "title": f"M{movie_id}"}))
            assert out["success"] is True
    assert fake.inserts == ["extended", "base", "base", "base"]
    assert caplog.text.count("no extended columns") == 1

    # Any other error keeps the old behaviour: fall back for this save only.
    other = _FakeSupabase(APIError({"code": "23505", "details": None, "hint": None, "message": "duplicate key"}))
    monkeypatch.setattr(supabase_service, "get_supabase_client", lambda: other)
    monkeypatch.setattr(supabase_service, "_movie_library_extended_missing", False)
    for movie_id in (4, 5):
        assert asyncio.run(supabase_service.save_movie_to_library({"id": movie_id, "title": "M"}))["success"] is True
    assert other.inserts == ["extended", "base", "extended", "base"]
    assert supabase_service._movie_library_extended_missing is False

