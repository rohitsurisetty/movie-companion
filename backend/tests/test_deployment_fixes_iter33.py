"""
Iteration 33 deployment-fix regression tests.

Covers:
 1. /api/tina/chat — silently ignores stale/mismatched body.user_id (was 404 → now 200).
 2. /api/tina/welcome-back — same behaviour.
 3. CORS preflight for known dynamic origins.
 4. Regression: require_owner still enforces BOLA on GET endpoints.
 5. Sanity: /api/auth/me, /api/tina/greeting, /api/tina/field-options.
"""

import os
import time
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://match-history-dev.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TEST_EMAIL = f"testuser_iter33_{int(time.time())}@example.com"
UNIVERSAL_OTP = "123456"


# ---------------------------- fixtures ----------------------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth(session):
    """Create test user & return (session_token, user_id)."""
    r = session.post(f"{API}/auth/send-email-otp", json={"email": TEST_EMAIL}, timeout=15)
    assert r.status_code == 200, f"send-email-otp failed: {r.status_code} {r.text}"

    r = session.post(
        f"{API}/auth/verify-otp",
        json={
            "identifier": TEST_EMAIL,
            "type": "email",
            "otp": UNIVERSAL_OTP,
            "name": "Iter33 Tester",
        },
        timeout=15,
    )
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    assert "session_token" in data and "user_id" in data, data
    return data["session_token"], data["user_id"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------------------- 1. /api/tina/chat ----------------------------
class TestTinaChatFix:
    def test_chat_with_correct_user_id_returns_200(self, session, auth):
        token, uid = auth
        r = session.post(
            f"{API}/tina/chat",
            headers=_hdr(token),
            json={"user_id": uid, "message": "Hello Tina!", "user_name": "Iter33 Tester"},
            timeout=45,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        body = r.json()
        # Response must contain Tina's message under some standard key.
        assert any(k in body for k in ("response", "message", "reply", "text")), body

    def test_chat_with_stale_user_id_still_returns_200(self, session, auth):
        token, _uid = auth
        stale = "user_stale123"
        r = session.post(
            f"{API}/tina/chat",
            headers=_hdr(token),
            json={"user_id": stale, "message": "Testing stale id path", "user_name": "Iter33 Tester"},
            timeout=45,
        )
        assert r.status_code == 200, (
            f"stale user_id should be silently overridden by session uid, "
            f"got {r.status_code}: {r.text[:400]}"
        )


# ---------------------------- 2. /api/tina/welcome-back ----------------------------
class TestTinaWelcomeBackFix:
    def test_welcome_back_correct_user_id(self, session, auth):
        token, uid = auth
        r = session.post(
            f"{API}/tina/welcome-back",
            headers=_hdr(token),
            json={"user_id": uid, "user_name": "Iter33 Tester"},
            timeout=45,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"

    def test_welcome_back_stale_user_id(self, session, auth):
        token, _uid = auth
        r = session.post(
            f"{API}/tina/welcome-back",
            headers=_hdr(token),
            json={"user_id": "user_stale123", "user_name": "Iter33 Tester"},
            timeout=45,
        )
        assert r.status_code == 200, (
            f"stale user_id should be silently overridden, got {r.status_code}: {r.text[:400]}"
        )


# ---------------------------- 3. CORS preflight ----------------------------
# NOTE: We hit the backend on localhost:8001 directly because the public URL
# is fronted by Cloudflare, which rewrites CORS headers to `*` and hides the
# origin-reflection behaviour of the FastAPI CORS middleware. The review
# request explicitly used the same localhost target for its curl example.
LOCAL_API = "http://localhost:8001/api"


@pytest.mark.parametrize(
    "origin",
    [
        "https://foo.emergent.host",
        "https://bar.preview.emergentagent.com",
        "https://baz.emergent.sh",
    ],
)
def test_cors_preflight(session, origin):
    r = session.options(
        f"{LOCAL_API}/tina/chat",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
        timeout=15,
    )
    assert r.status_code in (200, 204), f"CORS preflight failed for {origin}: {r.status_code}"
    allow_origin = r.headers.get("access-control-allow-origin", "")
    assert allow_origin == origin, (
        f"CORS allow-origin mismatch for {origin}: got {allow_origin!r}, headers={dict(r.headers)}"
    )


# ---------------------------- 4. BOLA regression ----------------------------
def test_require_owner_still_blocks_other_users_data(session, auth):
    """
    require_owner intentionally returns 404 (not 403) to avoid leaking
    which user_ids exist — see /app/backend/security_deps.py:123. So the
    BOLA protection is preserved as long as the caller does NOT get a 2xx.
    """
    token, _uid = auth
    other = "user_other_person_id"
    r = session.get(f"{API}/tina/missing-fields/{other}", headers=_hdr(token), timeout=15)
    assert r.status_code in (403, 404), (
        f"require_owner regression! Expected 403/404 accessing someone else's data, "
        f"got {r.status_code}: {r.text[:300]}"
    )
    assert r.status_code >= 400, "must not return 2xx for cross-user access"


# ---------------------------- 5. Sanity checks ----------------------------
def test_auth_me(session, auth):
    token, uid = auth
    r = session.get(f"{API}/auth/me", headers=_hdr(token), timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    body = r.json()
    # Common shape: {user: {...}} or {id/user_id: ...}
    assert body, "empty /auth/me body"
    text = str(body)
    assert uid in text, f"session user_id {uid} not present in /auth/me response: {text[:300]}"


def test_tina_greeting_public(session):
    r = session.get(f"{API}/tina/greeting", timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"


def test_tina_field_options(session, auth):
    token, _uid = auth
    r = session.get(f"{API}/tina/field-options", headers=_hdr(token), timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
