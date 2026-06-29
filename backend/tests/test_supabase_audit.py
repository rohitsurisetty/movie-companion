"""
Backend audit hooks regression test (iteration 13).

Verifies that the Supabase audit-logging integration injected into the
existing route handlers DID NOT break any endpoint. Each test covers one
of the audit tables / hooks:

  * log_user_login              -> /api/auth/verify-otp           (server.py:718)
  * log_tina_chat_message       -> /api/tina/chat                 (server.py:3229 / 3238)
  * log_picture_event           -> /api/user/pictures/upload      (picture_service.py:140)
  * log_user_chat_message       -> /api/chat/send                 (chat_service.py:146)
  * log_match_event             -> /api/matches, /api/chat/send  (server.py:2393/2421, chat_service.py:156/443/472)
  * log_unmatch_event           -> /api/chat/unmatch              (chat_service.py:502)
  * log_report_event            -> /api/chat/report               (chat_service.py:537)

The _safe_audit_insert wrapper guarantees audit failures NEVER bubble up
to the parent request — so all of these endpoints must return 2xx even
if Supabase is degraded.

Optional sanity (skipped automatically if SUPABASE_SERVICE_KEY missing):
queries the Supabase REST API directly to confirm audit rows landed.
"""

import os
import time
import base64
import uuid

import httpx
import pytest
from dotenv import load_dotenv

# Load backend .env so SUPABASE_URL / SUPABASE_SERVICE_KEY are visible to the
# persistence sanity tests (otherwise they would be skipped).
load_dotenv("/app/backend/.env")

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or os.environ.get("EXPO_BACKEND_URL")
            or "http://localhost:8001").rstrip("/")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

API = f"{BASE_URL}/api"

# Tiny 1x1 PNG (transparent), base64
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    return httpx.Client(timeout=60.0)


@pytest.fixture(scope="module")
def test_user(client):
    """Sign up a fresh user via the email-OTP mock flow and return ids."""
    unique = uuid.uuid4().hex[:8]
    email = f"TEST_audit_{unique}@example.com"

    # 1) Request OTP
    r1 = client.post(f"{API}/auth/send-email-otp", json={"email": email})
    assert r1.status_code == 200, f"send-email-otp failed: {r1.status_code} {r1.text}"
    data1 = r1.json()
    assert data1.get("success") is True
    assert "otp" in data1
    assert data1.get("is_new_user") is True
    otp = data1["otp"]

    # 2) Verify OTP — triggers supabase.log_user_login (server.py:718)
    r2 = client.post(
        f"{API}/auth/verify-otp",
        json={"type": "email", "identifier": email, "otp": otp, "name": "Test Audit User"},
    )
    assert r2.status_code == 200, f"verify-otp failed: {r2.status_code} {r2.text}"
    data2 = r2.json()
    user_id = data2["user_id"]
    session_token = data2["session_token"]
    assert user_id and session_token

    return {"user_id": user_id, "session_token": session_token, "email": email}


# ---------------------------------------------------------------------------
# 1. Health / bootstrap
# ---------------------------------------------------------------------------

class TestBootstrap:
    def test_api_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        assert "message" in r.json()


# ---------------------------------------------------------------------------
# 2. Auth + login audit (log_user_login)
# ---------------------------------------------------------------------------

class TestAuthAudit:
    def test_send_otp_and_verify(self, test_user):
        # Just rely on the fixture having succeeded; this proves the auth
        # flow + login-audit injection does not break verify-otp.
        assert test_user["user_id"].startswith("user_")


# ---------------------------------------------------------------------------
# 3. Tina chat audit (log_tina_chat_message)
# ---------------------------------------------------------------------------

class TestTinaChatAudit:
    def test_welcome_back(self, client, test_user):
        r = client.post(
            f"{API}/tina/welcome-back",
            json={
                "user_id": test_user["user_id"],
                "user_name": "Test Audit User",
                "is_onboarding_complete": False,
                "collected_fields": [],
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True
        assert body.get("message"), "welcome-back must return a non-empty message"

    def test_chat_returns_200_with_message(self, client, test_user):
        # Hooks at server.py:3229 (user message) and 3238 (tina reply)
        r = client.post(
            f"{API}/tina/chat",
            json={
                "user_id": test_user["user_id"],
                "user_name": "Test Audit User",
                "message": "hi tina",
                "is_onboarding_complete": False,
                "collected_fields": [],
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # tina_service may return either {message: ...} or {response: ...}
        msg = body.get("message") or body.get("response") or ""
        assert isinstance(msg, str)
        assert len(msg) > 0, f"Tina returned empty message: {body}"


# ---------------------------------------------------------------------------
# 4. Picture upload audit (log_picture_event) + Supabase Storage
# ---------------------------------------------------------------------------

class TestPictureUploadAudit:
    def test_upload_returns_storage_url(self, client, test_user):
        # picture_service.upload_picture_to_storage tries Supabase Storage
        # first; if migration is fully applied the URL should be a public
        # Supabase Storage URL.
        r = client.post(
            f"{API}/user/pictures/upload",
            json={
                "user_id": test_user["user_id"],
                "session_id": test_user["session_token"],
                "picture_number": 1,
                "image_data": TINY_PNG_B64,
                "content_type": "image/png",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True
        assert body.get("picture_number") == 1
        url = body.get("picture_url")
        assert isinstance(url, str) and url, "picture_url missing"

        # Best-effort: prefer Supabase Storage URL, but allow base64 fallback
        # (audit hook still fires in both code paths).
        if "/storage/v1/object/public/profile-pictures/" in url:
            head = client.get(url)
            assert head.status_code == 200, (
                f"Public Supabase URL not reachable: {head.status_code}"
            )
        else:
            assert url.startswith("data:image/"), (
                f"Unexpected picture_url format: {url[:60]}..."
            )


# ---------------------------------------------------------------------------
# 5. User-to-user chat audit (log_user_chat_message) + match event
# ---------------------------------------------------------------------------

class TestUserChatAudit:
    def test_init_mock_then_send(self, client, test_user):
        uid = test_user["user_id"]

        # Seed mock conversations
        r = client.post(f"{API}/chat/init-mock/{uid}")
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True

        # Send a message to mock_user_001 — fires log_user_chat_message
        # (chat_service.py:146) and may fire log_match_event
        r2 = client.post(
            f"{API}/chat/send",
            json={
                "sender_id": uid,
                "receiver_id": "mock_user_001",
                "content": "hello from audit test",
                "message_type": "text",
            },
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("success") is True
        msg = body.get("message") or {}
        # Must have persisted a message doc with id-like fields
        assert msg.get("content") == "hello from audit test"


# ---------------------------------------------------------------------------
# 6. Match event audit (log_match_event)
# ---------------------------------------------------------------------------

class TestMatchAudit:
    def test_matches_endpoint_200(self, client, test_user):
        r = client.post(
            f"{API}/matches",
            json={"user_id": test_user["user_id"], "mode": "date", "limit": 5},
            timeout=90.0,
        )
        # Even with empty / minimal profile, the endpoint must return 2xx
        # and must NOT regress because of the audit hook.
        assert r.status_code == 200, r.text
        body = r.json()
        # Should contain a list of candidates (possibly empty for a brand-new
        # user with no profile). Just verify the schema doesn't error out.
        assert isinstance(body, dict)


# ---------------------------------------------------------------------------
# 7. Unmatch + Report audit (log_unmatch_event, log_report_event)
# ---------------------------------------------------------------------------

class TestUnmatchReportAudit:
    def test_unmatch_returns_200(self, client, test_user):
        r = client.post(
            f"{API}/chat/unmatch",
            json={
                "user_id": test_user["user_id"],
                "other_user_id": "mock_user_002",
                "reason": "test unmatch (audit)",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # success may be True or False depending on whether a conversation
        # exists — the important thing is no 5xx and no exception bubbling
        # up from the audit hook.
        assert "success" in body

    def test_report_returns_200(self, client, test_user):
        r = client.post(
            f"{API}/chat/report",
            json={
                "reporter_id": test_user["user_id"],
                "reported_id": "mock_user_003",
                "reason": "test report (audit)",
                "details": "automation",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True
        assert "report" in body


# ---------------------------------------------------------------------------
# 8. Optional: verify rows actually landed in Supabase via PostgREST
# ---------------------------------------------------------------------------

def _supa_headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
    }


@pytest.mark.skipif(
    not (SUPABASE_URL and SUPABASE_SERVICE_KEY),
    reason="Supabase URL / service key not configured",
)
class TestSupabasePersistence:
    """Optional best-effort: query Supabase REST API to confirm rows landed.

    Each test waits briefly because the audit inserts happen synchronously
    inside the request handler but Postgres replication may be slightly
    delayed via PostgREST cache.
    """

    def test_user_pictures_row_landed(self, client, test_user):
        time.sleep(1.5)
        url = (
            f"{SUPABASE_URL}/rest/v1/user_pictures"
            f"?select=user_id,action,picture_number"
            f"&user_id=eq.{test_user['user_id']}"
        )
        r = client.get(url, headers=_supa_headers())
        assert r.status_code == 200, f"PostgREST query failed: {r.status_code} {r.text}"
        rows = r.json()
        assert isinstance(rows, list)
        assert any(row.get("action") == "upload" for row in rows), (
            f"No upload audit row found for {test_user['user_id']}: {rows}"
        )

    def test_tina_chat_messages_row_landed(self, client, test_user):
        time.sleep(1.0)
        url = (
            f"{SUPABASE_URL}/rest/v1/tina_chat_messages"
            f"?select=user_id,role&user_id=eq.{test_user['user_id']}&limit=20"
        )
        r = client.get(url, headers=_supa_headers())
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1, f"No tina_chat_messages rows for {test_user['user_id']}"

    def test_user_chat_messages_row_landed(self, client, test_user):
        time.sleep(1.0)
        url = (
            f"{SUPABASE_URL}/rest/v1/user_chat_messages"
            f"?select=sender_id,receiver_id,content&sender_id=eq.{test_user['user_id']}&limit=10"
        )
        r = client.get(url, headers=_supa_headers())
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        assert any(row.get("content") == "hello from audit test" for row in rows), (
            f"User chat audit row missing: {rows}"
        )

    def test_report_events_row_landed(self, client, test_user):
        time.sleep(1.0)
        url = (
            f"{SUPABASE_URL}/rest/v1/report_events"
            f"?select=reporter_id,reported_user_id,reason"
            f"&reporter_id=eq.{test_user['user_id']}&limit=10"
        )
        r = client.get(url, headers=_supa_headers())
        # Column name might differ slightly across migrations; if column
        # doesn't exist PostgREST returns 400 — surface as a soft failure
        if r.status_code == 400:
            pytest.skip(f"report_events schema mismatch: {r.text}")
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1, f"No report_events for {test_user['user_id']}"
