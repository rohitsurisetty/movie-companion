"""
Backend tests for the new POST /api/chat/delete endpoint and the soft-filter
on GET /api/user/match-history/{user_id} (deleted_by_users).

Covers:
- POST /api/chat/delete returns 200 + soft-deletes via $addToSet: deleted_by_users
- GET /api/user/match-history/{user_id} excludes conversations the user has
  soft-deleted (Anjali / Priya disappear from history once deleted)
- Idempotency: deleting an already-deleted conv returns 400 (no modified_count)
- Invalid payloads return 4xx (not 500)
- After delete the row stays gone across multiple GETs
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
# Use a per-run suffix so each pytest run gets fresh users (soft-deletes persist
# in mongo so we cannot reuse the same email across runs).
_RUN_TAG = str(int(time.time()))
TEST_EMAIL_TEMPLATE = "TEST_chatdelete_{}_" + _RUN_TAG + "@example.com"
ANJALI_ID = "mock_unmatched_anjali_iyer"
PRIYA_ID = "mock_unmatched_priya_bhatia"


def _conv_id(a: str, b: str) -> str:
    return "_".join(sorted([a, b]))


@pytest.fixture(scope="module")
def fresh_user_id():
    """Create a fresh test user for this module so soft-deletes don't pollute
    other tests. Returns user_id."""
    # Use a stable but TEST_-prefixed email so cleanup is easy
    email = TEST_EMAIL_TEMPLATE.format("primary")
    r = requests.post(
        f"{BASE_URL}/api/auth/send-email-otp", json={"email": email}, timeout=15
    )
    assert r.status_code == 200, r.text
    otp = r.json()["otp"]
    r2 = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={
            "type": "email",
            "identifier": email,
            "otp": otp,
            "name": "TEST Chat Delete",
        },
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    user_id = r2.json()["user_id"]
    # Auto-seed Anjali + Priya by hitting match-history once
    requests.get(f"{BASE_URL}/api/user/match-history/{user_id}", timeout=20)
    return user_id


@pytest.fixture(scope="module")
def second_user_id():
    """A second isolated user for the idempotency test path."""
    email = TEST_EMAIL_TEMPLATE.format("second")
    r = requests.post(
        f"{BASE_URL}/api/auth/send-email-otp", json={"email": email}, timeout=15
    )
    otp = r.json()["otp"]
    r2 = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"type": "email", "identifier": email, "otp": otp, "name": "TEST Chat Delete 2"},
        timeout=15,
    )
    user_id = r2.json()["user_id"]
    requests.get(f"{BASE_URL}/api/user/match-history/{user_id}", timeout=20)
    return user_id


# ============== Match history seeded baseline ==============
class TestSeededBaseline:
    def test_baseline_contains_anjali_and_priya(self, fresh_user_id):
        r = requests.get(
            f"{BASE_URL}/api/user/match-history/{fresh_user_id}", timeout=20
        )
        assert r.status_code == 200, r.text
        history = r.json()["history"]
        ids = {e["other_user_id"] for e in history}
        assert ANJALI_ID in ids, f"Anjali missing in baseline: {ids}"
        assert PRIYA_ID in ids, f"Priya missing in baseline: {ids}"


# ============== POST /api/chat/delete happy path ==============
class TestDeleteChatHappyPath:
    def test_delete_anjali_and_filter_from_history(self, fresh_user_id):
        conv_id = _conv_id(fresh_user_id, ANJALI_ID)

        # Delete it
        r = requests.post(
            f"{BASE_URL}/api/chat/delete",
            json={"user_id": fresh_user_id, "conversation_id": conv_id},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True
        assert "message" in body

        # Verify it's filtered from match history
        r2 = requests.get(
            f"{BASE_URL}/api/user/match-history/{fresh_user_id}", timeout=20
        )
        assert r2.status_code == 200
        ids_after = {e["other_user_id"] for e in r2.json()["history"]}
        assert ANJALI_ID not in ids_after, (
            f"Anjali should be filtered after delete but still present: {ids_after}"
        )
        # Priya should still be present (only Anjali was deleted)
        assert PRIYA_ID in ids_after, "Priya should NOT be affected by Anjali delete"

    def test_filter_persists_across_multiple_gets(self, fresh_user_id):
        """After delete the row must stay gone (persistence check)."""
        for _ in range(3):
            r = requests.get(
                f"{BASE_URL}/api/user/match-history/{fresh_user_id}", timeout=20
            )
            assert r.status_code == 200
            ids = {e["other_user_id"] for e in r.json()["history"]}
            assert ANJALI_ID not in ids, "Anjali reappeared in history"


# ============== Idempotency / re-delete behavior ==============
class TestDeleteChatIdempotency:
    def test_re_delete_same_conv_returns_400(self, fresh_user_id):
        """Deleting an already-deleted conv should NOT return 200 again because
        `delete_chat_history` returns False when modified_count == 0.
        Current implementation maps False -> HTTPException(400)."""
        conv_id = _conv_id(fresh_user_id, ANJALI_ID)
        # Anjali was already deleted in the previous class — try again
        r = requests.post(
            f"{BASE_URL}/api/chat/delete",
            json={"user_id": fresh_user_id, "conversation_id": conv_id},
            timeout=15,
        )
        # Expect 400 (since $addToSet didn't modify anything)
        assert r.status_code == 400, (
            f"Re-delete expected 400, got {r.status_code}: {r.text}"
        )


# ============== Bad input handling ==============
class TestDeleteChatBadInput:
    def test_delete_with_unknown_conversation_id(self, second_user_id):
        r = requests.post(
            f"{BASE_URL}/api/chat/delete",
            json={"user_id": second_user_id, "conversation_id": "does_not_exist_xyz"},
            timeout=15,
        )
        # delete_chat_history returns False (conv not found) → 400
        assert r.status_code == 400, r.text

    def test_delete_missing_fields_returns_422(self):
        r = requests.post(
            f"{BASE_URL}/api/chat/delete",
            json={"user_id": "x"},  # missing conversation_id
            timeout=15,
        )
        assert r.status_code == 422, r.text

    def test_delete_with_non_participant_user_returns_400(self, second_user_id):
        """A user who is NOT a participant in the conv should get 400, not 500.
        Uses the OTHER test user's conv with Anjali."""
        # Build the first user's Anjali conv id by querying their history? We
        # don't have it; instead build a fake conv id between two unrelated ids
        fake_conv = "userA__userB"
        r = requests.post(
            f"{BASE_URL}/api/chat/delete",
            json={"user_id": second_user_id, "conversation_id": fake_conv},
            timeout=15,
        )
        assert r.status_code == 400, r.text


# ============== Mock data still returns ==============
class TestMockUnmatchedData:
    def test_priya_remains_with_was_unmatched_by_other_flag(self, second_user_id):
        r = requests.get(
            f"{BASE_URL}/api/user/match-history/{second_user_id}", timeout=20
        )
        assert r.status_code == 200
        priya = next(
            (e for e in r.json()["history"] if e["other_user_id"] == PRIYA_ID), None
        )
        assert priya is not None, "Priya not auto-seeded for second_user_id"
        assert priya["was_unmatched_by_other"] is True
        assert priya["status"] == "unmatched"
        assert priya["other_user_name"] == "Priya Bhatia"
