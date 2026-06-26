"""
Backend tests for the new feature: Unmatched Profiles in Main Chat Tab.

GET /api/chat/conversations/{user_id} now auto-seeds Anjali Iyer + Priya
Bhatia unmatched conversations (via seed_unmatched_for_user) and returns
them with is_unmatched=True, is_read_only=True, status="unmatched",
unmatched_at present, and sorted to the bottom of the list.

Covers:
A. POST /api/auth/send-email-otp  - returns OTP
B. POST /api/auth/verify-otp     - returns user_id + session_token
C. GET /api/chat/conversations/{user_id} - includes Anjali + Priya as
   read-only unmatched conversations
D. GET /api/chat/messages/{conv_id} for both - returns message arrays
E. Idempotency - second call returns same exact 2 unmatched (no dups)
F. Regression - /api/user/match-history/{user_id} + /api/chat/report
   still work.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
TEST_NAME = "Test User"

ANJALI_ID = "mock_unmatched_anjali_iyer"
PRIYA_ID = "mock_unmatched_priya_bhatia"


def _conv_id(a: str, b: str) -> str:
    return "_".join(sorted([a, b]))


@pytest.fixture(scope="module")
def fresh_user():
    """Create a brand-new user via OTP so we are guaranteed an un-seeded state."""
    email = f"unmatched_test_{int(time.time())}@example.com"
    r = requests.post(
        f"{BASE_URL}/api/auth/send-email-otp", json={"email": email}, timeout=15
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("success") is True
    assert "otp" in body and len(body["otp"]) == 6
    otp = body["otp"]

    r2 = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"type": "email", "identifier": email, "otp": otp, "name": TEST_NAME},
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert "user_id" in data
    assert "session_token" in data
    return {
        "email": email,
        "user_id": data["user_id"],
        "session_token": data["session_token"],
    }


# ============== A + B: Auth ==============
class TestAuth:
    def test_send_and_verify_otp(self, fresh_user):
        """Verify the fixture itself - send+verify OTP for fresh email."""
        assert fresh_user["user_id"]
        assert fresh_user["session_token"]
        print(f"✓ Auth OK, user_id={fresh_user['user_id']}")


# ============== C: Conversations Auto-Seed ==============
class TestConversationsAutoSeed:
    def test_conversations_contains_anjali_and_priya_unmatched(self, fresh_user):
        user_id = fresh_user["user_id"]

        r = requests.get(
            f"{BASE_URL}/api/chat/conversations/{user_id}", timeout=20
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        conversations = data.get("conversations")
        assert isinstance(conversations, list), data

        # Find Anjali + Priya by other_user.name
        anjali = next(
            (c for c in conversations
             if (c.get("other_user") or {}).get("name") == "Anjali Iyer"),
            None,
        )
        priya = next(
            (c for c in conversations
             if (c.get("other_user") or {}).get("name") == "Priya Bhatia"),
            None,
        )
        assert anjali is not None, (
            f"Anjali Iyer missing from /chat/conversations. "
            f"Got names: {[(c.get('other_user') or {}).get('name') for c in conversations]}"
        )
        assert priya is not None, (
            f"Priya Bhatia missing from /chat/conversations. "
            f"Got names: {[(c.get('other_user') or {}).get('name') for c in conversations]}"
        )

        for label, conv in (("Anjali", anjali), ("Priya", priya)):
            assert conv.get("is_unmatched") is True, f"{label}: is_unmatched not True: {conv}"
            assert conv.get("is_read_only") is True, f"{label}: is_read_only not True: {conv}"
            assert conv.get("status") == "unmatched", f"{label}: status != unmatched: {conv}"
            assert conv.get("unmatched_at"), f"{label}: unmatched_at missing: {conv}"

        print("✓ /chat/conversations returns Anjali + Priya as unmatched read-only")

    def test_unmatched_sorted_to_bottom(self, fresh_user):
        user_id = fresh_user["user_id"]
        r = requests.get(
            f"{BASE_URL}/api/chat/conversations/{user_id}", timeout=20
        )
        assert r.status_code == 200
        conversations = r.json()["conversations"]
        # Find index of last non-unmatched and first unmatched
        statuses = [c.get("status") for c in conversations]
        # All unmatched should be a contiguous suffix
        seen_unmatched = False
        for s in statuses:
            if s == "unmatched":
                seen_unmatched = True
            else:
                assert not seen_unmatched, (
                    f"Active/pending conversation appeared AFTER unmatched. "
                    f"Statuses order: {statuses}"
                )

        # Verify unmatched ordering: unmatched_at desc
        unmatched_only = [c for c in conversations if c.get("status") == "unmatched"]
        if len(unmatched_only) >= 2:
            for i in range(len(unmatched_only) - 1):
                a = unmatched_only[i].get("unmatched_at") or ""
                b = unmatched_only[i + 1].get("unmatched_at") or ""
                assert a >= b, (
                    f"Unmatched not sorted desc by unmatched_at: {a} < {b}"
                )
        print(f"✓ Unmatched (count={len(unmatched_only)}) at bottom, sorted desc")


# ============== D: Messages Endpoint for Unmatched Conversations ==============
class TestUnmatchedMessages:
    @pytest.mark.parametrize(
        "other_id,name",
        [(ANJALI_ID, "Anjali Iyer"), (PRIYA_ID, "Priya Bhatia")],
    )
    def test_messages_for_unmatched_conversation(self, fresh_user, other_id, name):
        user_id = fresh_user["user_id"]
        # Ensure seeded by hitting conversations once
        requests.get(f"{BASE_URL}/api/chat/conversations/{user_id}", timeout=20)

        conv_id = _conv_id(user_id, other_id)
        r = requests.get(f"{BASE_URL}/api/chat/messages/{conv_id}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        messages = data.get("messages")
        assert isinstance(messages, list)
        assert len(messages) > 0, f"No messages seeded for {name} conversation"
        m0 = messages[0]
        assert "content" in m0 and "sender_id" in m0, m0
        print(f"✓ /chat/messages returned {len(messages)} messages for {name}")


# ============== E: Idempotency ==============
class TestIdempotency:
    def test_second_call_returns_exactly_two_unmatched(self, fresh_user):
        user_id = fresh_user["user_id"]

        r1 = requests.get(f"{BASE_URL}/api/chat/conversations/{user_id}", timeout=20)
        r2 = requests.get(f"{BASE_URL}/api/chat/conversations/{user_id}", timeout=20)
        assert r1.status_code == 200 and r2.status_code == 200

        convs = r2.json()["conversations"]
        unmatched = [c for c in convs if c.get("status") == "unmatched"]

        anjali_count = sum(
            1 for c in unmatched if (c.get("other_user") or {}).get("name") == "Anjali Iyer"
        )
        priya_count = sum(
            1 for c in unmatched if (c.get("other_user") or {}).get("name") == "Priya Bhatia"
        )
        assert anjali_count == 1, f"Expected exactly 1 Anjali, got {anjali_count}"
        assert priya_count == 1, f"Expected exactly 1 Priya, got {priya_count}"

        # Compare conversation_id sets between two calls
        ids1 = {c.get("conversation_id") for c in r1.json()["conversations"]}
        ids2 = {c.get("conversation_id") for c in convs}
        assert ids1 == ids2, f"Conversation set changed between calls: {ids1} vs {ids2}"
        print("✓ Idempotent: exactly 1 Anjali + 1 Priya across repeated calls")


# ============== F: Regression - Match History + Report ==============
class TestRegression:
    def test_match_history_still_works(self, fresh_user):
        user_id = fresh_user["user_id"]
        r = requests.get(f"{BASE_URL}/api/user/match-history/{user_id}", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        history = data.get("history")
        assert isinstance(history, list)
        names = {e.get("other_user_name") for e in history}
        assert "Anjali Iyer" in names, f"Anjali missing in history: {names}"
        assert "Priya Bhatia" in names, f"Priya missing in history: {names}"
        print(f"✓ /api/user/match-history still works ({len(history)} entries)")

    def test_chat_report_still_works(self, fresh_user):
        user_id = fresh_user["user_id"]
        payload = {
            "reporter_id": user_id,
            "reported_id": ANJALI_ID,
            "reason": "Inappropriate behavior",
            "details": "TEST_automated_chat_tab_report",
        }
        r = requests.post(f"{BASE_URL}/api/chat/report", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        assert "report" in data
        print("✓ /api/chat/report still accepts unmatched-user report")
