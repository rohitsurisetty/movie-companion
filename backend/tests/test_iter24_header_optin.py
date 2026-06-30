"""Iteration 24: verify X-Dev-Seed-Mock header opt-in for
/chat/init-mock and /chat/conversations endpoints.

Covers requirements 2a–2e and regression-check (5) from the iter24 review:
- prod (no header) => init-mock skipped, conversations empty
- with header => init-mock seeds, conversations seeds Anjali/Priya
- existing seeded conversations are returned without re-seeding
"""

import os
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

HEADER = {"X-Dev-Seed-Mock": "1"}


# ---------- helpers ----------

def _create_real_user(prefix="iter24"):
    """Create a verified real user via the mocked OTP flow.
    Returns dict with user_id, email, token.
    """
    email = f"TEST_{prefix}_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{API}/auth/send-email-otp", json={"email": email}, timeout=15)
    assert r.status_code == 200, f"send-email-otp: {r.status_code} {r.text}"
    otp = r.json().get("otp")
    assert otp, f"no otp in response: {r.json()}"

    r = requests.post(
        f"{API}/auth/verify-otp",
        json={
            "type": "email",
            "identifier": email,
            "otp": otp,
            "name": f"Iter24 {prefix}",
        },
        timeout=15,
    )
    assert r.status_code == 200, f"verify-otp: {r.status_code} {r.text}"
    body = r.json()
    user_id = body.get("user_id") or body.get("user", {}).get("user_id")
    assert user_id, f"no user_id in verify response: {body}"
    return {"user_id": user_id, "email": email, "token": body.get("session_token")}


# ---------- 1. Sanity ----------

class TestSanity:
    def test_root_health(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200


# ---------- 2. Header opt-in behavior ----------

class TestHeaderOptIn:

    def test_2a_init_mock_without_header_is_skipped(self):
        """2a: POST /chat/init-mock without header => skipped:true."""
        u = _create_real_user("2a")
        r = requests.post(f"{API}/chat/init-mock/{u['user_id']}", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True, body
        assert body.get("skipped") is True, f"expected skipped:true, got {body}"
        assert body.get("reason") == "production_mode", body

    def test_2b_init_mock_with_header_seeds(self):
        """2b: POST /chat/init-mock with header => seeds (not skipped)."""
        u = _create_real_user("2b")
        r = requests.post(
            f"{API}/chat/init-mock/{u['user_id']}",
            headers=HEADER,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True, body
        assert body.get("skipped") is not True, f"unexpected skipped flag: {body}"
        assert "Mock conversations created" in body.get("message", ""), body
        # save for 2c
        pytest._iter24_seeded_uid = u["user_id"]

    def test_2c_conversations_without_header_returns_existing_seeds(self):
        """2c: GET /chat/conversations (no header) for user already seeded in 2b
        => returns the seeded mock convos but does NOT re-seed Anjali Iyer /
        Priya Bhatia (the unmatched-Anjali/Priya pair).

        Note: init-mock seeds Priya Sharma / Rahul Kapoor / Ananya Reddy
        (mock_user_001/002/003) — distinct from the unmatched seed's
        Anjali Iyer + Priya Bhatia. So the proper invariant is:
        len stays at 3 (not 5) and the unmatched-Anjali Iyer name is absent.
        """
        uid = getattr(pytest, "_iter24_seeded_uid", None)
        assert uid, "test_2b did not run / set uid"
        r = requests.get(f"{API}/chat/conversations/{uid}", timeout=15)
        assert r.status_code == 200, r.text
        convos = r.json().get("conversations", [])
        assert len(convos) >= 3, (
            f"expected >= 3 mock convos already seeded by 2b, got {len(convos)}"
        )
        # The init-mock path seeds exactly 3 convos. The unmatched seed (which
        # adds Anjali Iyer + Priya Bhatia) must NOT have run on this call.
        assert len(convos) == 3, (
            f"expected exactly 3 (no extra Anjali/Priya unmatched seed), got {len(convos)}"
        )
        names = " ".join(str(c.get("other_user", {}).get("name", "")) for c in convos)
        assert "Anjali Iyer" not in names, (
            f"Anjali Iyer (unmatched seed) should NOT be auto-added without header: {names}"
        )
        assert "Priya Bhatia" not in names, (
            f"Priya Bhatia (unmatched seed) should NOT be auto-added without header: {names}"
        )

    def test_2d_conversations_fresh_user_no_header_returns_empty(self):
        """2d: GET /chat/conversations for a brand-new user with no header => 0."""
        u = _create_real_user("2d")
        r = requests.get(f"{API}/chat/conversations/{u['user_id']}", timeout=15)
        assert r.status_code == 200, r.text
        convos = r.json().get("conversations", [])
        assert convos == [], f"expected [], got {convos}"

    def test_2e_conversations_fresh_user_with_header_seeds_unmatched(self):
        """2e: GET /chat/conversations with header for fresh user => >= 2
        (Anjali + Priya seeded).
        """
        u = _create_real_user("2e")
        r = requests.get(
            f"{API}/chat/conversations/{u['user_id']}",
            headers=HEADER,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        convos = r.json().get("conversations", [])
        assert len(convos) >= 2, f"expected >= 2 seeded convos, got {len(convos)}: {convos}"
        names = " ".join(str(c.get("other_user", {}).get("name", "")) for c in convos)
        assert "Anjali" in names or "Priya" in names, (
            f"expected Anjali/Priya in seeded convos, got names={names}"
        )


# ---------- 5. Regression: prod fresh user is empty ----------

class TestRegression:
    def test_5_fresh_user_no_header_chat_empty(self):
        """5: confirm production behavior unchanged — fresh user, no header,
        /chat/conversations returns []. (Different fresh user from 2d.)
        """
        u = _create_real_user("reg5")
        r = requests.get(f"{API}/chat/conversations/{u['user_id']}", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("conversations", []) == []
