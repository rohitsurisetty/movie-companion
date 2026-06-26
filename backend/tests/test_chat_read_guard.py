"""
Regression test: POST /api/chat/read/{conversation_id} guard.

Previously a missing/empty user_id returned 500 (Mongo path blew up).
The new guard MUST return HTTP 400 instead, while a valid user_id still
returns 200 success=true.
"""
import os
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
TEST_EMAIL = "testuser@example.com"
TEST_NAME = "Test User"


def _login_user_id() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/send-email-otp", json={"email": TEST_EMAIL}, timeout=15
    )
    otp = r.json()["otp"]
    r2 = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"type": "email", "identifier": TEST_EMAIL, "otp": otp, "name": TEST_NAME},
        timeout=15,
    )
    return r2.json()["user_id"]


class TestChatReadGuard:
    def test_chat_read_missing_user_id_returns_400(self):
        """No user_id query param at all → 400 (not 500)."""
        conv_id = "some_conv_xyz"
        r = requests.post(f"{BASE_URL}/api/chat/read/{conv_id}", timeout=15)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        body = r.json()
        # FastAPI returns {"detail": "..."}
        assert "user_id" in (body.get("detail") or "").lower(), body
        print(f"✓ empty user_id → 400 as expected: {body}")

    def test_chat_read_empty_user_id_returns_400(self):
        """Explicit empty string user_id → 400."""
        conv_id = "some_conv_xyz"
        r = requests.post(
            f"{BASE_URL}/api/chat/read/{conv_id}", params={"user_id": ""}, timeout=15
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        print(f"✓ user_id='' → 400 as expected")

    def test_chat_read_whitespace_user_id_returns_400(self):
        """Whitespace-only user_id → 400."""
        conv_id = "some_conv_xyz"
        r = requests.post(
            f"{BASE_URL}/api/chat/read/{conv_id}", params={"user_id": "   "}, timeout=15
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        print(f"✓ whitespace user_id → 400 as expected")

    def test_chat_read_valid_user_id_returns_200(self):
        """Real user_id still returns 200 success=true (no regression)."""
        user_id = _login_user_id()
        # Use a real conversation id from the auto-seeded data
        anjali_conv = "_".join(sorted([user_id, "mock_unmatched_anjali_iyer"]))
        # Make sure seeds exist
        requests.get(f"{BASE_URL}/api/user/match-history/{user_id}", timeout=20)
        r = requests.post(
            f"{BASE_URL}/api/chat/read/{anjali_conv}",
            params={"user_id": user_id},
            timeout=15,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is True, data
        print(f"✓ valid user_id → 200 success=true (no regression)")
