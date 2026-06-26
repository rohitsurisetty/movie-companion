"""
Backend tests for Match History + Unmatched Mocks (Anjali Iyer + Priya Bhatia)

Covers:
- Email OTP auth (mock) send + verify
- GET /api/user/match-history/{user_id} auto-seeds Anjali & Priya unmatched
  conversations with real names (not 'Unknown')
- GET /api/chat/unmatched/{conversation_id} returns is_read_only=true
- GET /api/chat/messages/{conversation_id} returns seeded mock messages
- POST /api/chat/report accepts report for unmatched conversation
- Idempotency of auto-seed
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
TEST_EMAIL = "testuser@example.com"
TEST_NAME = "Test User"

ANJALI_ID = "mock_unmatched_anjali_iyer"
PRIYA_ID = "mock_unmatched_priya_bhatia"


def _conv_id(a: str, b: str) -> str:
    return "_".join(sorted([a, b]))


# ============== Auth ==============
class TestAuthFlow:
    def test_send_email_otp_returns_otp(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/send-email-otp", json={"email": TEST_EMAIL}, timeout=15
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        assert "otp" in data and len(data["otp"]) == 6
        assert "is_new_user" in data
        # cache for next test on the class
        TestAuthFlow.otp = data["otp"]
        TestAuthFlow.is_new_user = data["is_new_user"]
        print(f"✓ send-email-otp OK, is_new_user={data['is_new_user']}")

    def test_verify_otp_returns_token_and_user_id(self):
        otp = getattr(TestAuthFlow, "otp", None)
        assert otp, "OTP not obtained from previous step"
        payload = {
            "type": "email",
            "identifier": TEST_EMAIL,
            "otp": otp,
            "name": TEST_NAME,
        }
        r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "user_id" in data
        assert "session_token" in data
        # share user_id
        TestAuthFlow.user_id = data["user_id"]
        print(f"✓ verify-otp OK, user_id={data['user_id']}")


def _get_user_id() -> str:
    """Helper to login (idempotent) and obtain user_id for downstream tests."""
    uid = getattr(TestAuthFlow, "user_id", None)
    if uid:
        return uid
    r = requests.post(
        f"{BASE_URL}/api/auth/send-email-otp", json={"email": TEST_EMAIL}, timeout=15
    )
    otp = r.json()["otp"]
    r2 = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"type": "email", "identifier": TEST_EMAIL, "otp": otp, "name": TEST_NAME},
        timeout=15,
    )
    uid = r2.json()["user_id"]
    TestAuthFlow.user_id = uid
    return uid


# ============== Match History Auto-Seed ==============
class TestMatchHistory:
    def test_match_history_seeds_anjali_priya(self):
        user_id = _get_user_id()
        r = requests.get(f"{BASE_URL}/api/user/match-history/{user_id}", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        history = data["history"]
        assert isinstance(history, list)

        names = {entry.get("other_user_name") for entry in history}
        ids = {entry.get("other_user_id") for entry in history}

        assert "Anjali Iyer" in names, f"Anjali Iyer missing. Names: {names}"
        assert "Priya Bhatia" in names, f"Priya Bhatia missing. Names: {names}"
        assert ANJALI_ID in ids, f"Anjali id missing. Ids: {ids}"
        assert PRIYA_ID in ids, f"Priya id missing. Ids: {ids}"
        assert "Unknown" not in names, f"Some user resolved as Unknown: {history}"

        # Find the two entries and validate status
        for entry in history:
            if entry["other_user_id"] in (ANJALI_ID, PRIYA_ID):
                assert entry["status"] == "unmatched", entry
                assert entry["was_unmatched_by_other"] is True, entry

        print(f"✓ match-history seeded Anjali & Priya as unmatched, total={len(history)}")

    def test_match_history_is_idempotent(self):
        user_id = _get_user_id()
        r1 = requests.get(f"{BASE_URL}/api/user/match-history/{user_id}", timeout=20)
        r2 = requests.get(f"{BASE_URL}/api/user/match-history/{user_id}", timeout=20)
        assert r1.status_code == 200 and r2.status_code == 200
        # Count Anjali/Priya entries in second call - must be exactly 2 combined
        count_target = sum(
            1
            for e in r2.json()["history"]
            if e.get("other_user_id") in (ANJALI_ID, PRIYA_ID)
        )
        assert count_target == 2, (
            f"Expected exactly 1 Anjali + 1 Priya entry, got {count_target}"
        )
        print("✓ match-history idempotent (no dup Anjali/Priya conversations)")


# ============== Unmatched Chat View (Read-Only) ==============
class TestUnmatchedConversation:
    @pytest.mark.parametrize(
        "other_id,expected_name",
        [(ANJALI_ID, "Anjali Iyer"), (PRIYA_ID, "Priya Bhatia")],
    )
    def test_unmatched_endpoint_returns_read_only(self, other_id, expected_name):
        user_id = _get_user_id()
        # Ensure seeded
        requests.get(f"{BASE_URL}/api/user/match-history/{user_id}", timeout=20)

        conv_id = _conv_id(user_id, other_id)
        r = requests.get(
            f"{BASE_URL}/api/chat/unmatched/{conv_id}",
            params={"user_id": user_id},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        conv = data["conversation"]
        assert conv.get("is_read_only") is True, conv
        assert conv.get("was_unmatched_by_other") is True, conv
        assert conv.get("other_user_name") == expected_name, conv
        print(f"✓ /chat/unmatched OK for {expected_name}")

    @pytest.mark.parametrize("other_id", [ANJALI_ID, PRIYA_ID])
    def test_chat_messages_returned(self, other_id):
        user_id = _get_user_id()
        requests.get(f"{BASE_URL}/api/user/match-history/{user_id}", timeout=20)

        conv_id = _conv_id(user_id, other_id)
        r = requests.get(f"{BASE_URL}/api/chat/messages/{conv_id}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        messages = data["messages"]
        assert isinstance(messages, list) and len(messages) > 0, "Seeded messages missing"
        # Validate structure
        m0 = messages[0]
        assert "content" in m0 and "sender_id" in m0
        print(f"✓ /chat/messages returned {len(messages)} for {other_id}")


# ============== Report ==============
class TestReport:
    def test_report_unmatched_user(self):
        user_id = _get_user_id()
        payload = {
            "reporter_id": user_id,
            "reported_id": ANJALI_ID,
            "reason": "Inappropriate behavior",
            "details": "TEST_automated_report",
        }
        r = requests.post(f"{BASE_URL}/api/chat/report", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert "report" in data
        print("✓ /chat/report accepted unmatched-user report")
