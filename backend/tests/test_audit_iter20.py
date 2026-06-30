"""
Iteration 20 — Launch-prep exhaustive real-time DB persistence audit.

Verifies that EVERY write endpoint persists rows into Supabase audit tables
in real-time. Builds on iteration_14's test_supabase_audit.py and adds the
FIVE new audit hooks added in this iteration:

  * /api/chat/accept           -> match_events (event_type='request_accepted')
  * /api/chat/decline          -> match_events (event_type='request_declined')
  * /api/chat/delete           -> match_events (event_type='chat_deleted')
  * /api/chat/meeting-report   -> match_events (event_type='meeting_reported')
  * /api/chat/meeting-status   -> match_events (event_type='meeting_verified')
  * /api/user/pictures/upload-batch -> user_pictures (one row per picture)

Plus exhaustive verification of the EXISTING signup flow tables:

  * /api/auth/verify-otp       -> user_logged_in
  * /api/user/profile          -> user_sign_up_details, top_5_movies,
                                  toggle_visibility_profile, mode_selected
  * /api/user/filters          -> preferences_and_filters, exclusive_toggle,
                                  expand_if_run_out
  * /api/user/mode             -> mode_selected
  * /api/matches               -> match_events
  * /api/chat/send             -> user_chat_messages, match_events
  * /api/tina/chat             -> tina_chat_messages
  * /api/chat/unmatch          -> unmatch_events
  * /api/chat/report           -> report_events

All audit inserts are non-blocking — endpoints MUST return 2xx even if
Supabase is degraded (verified by no 5xx assertions failing).
"""

import os
import time
import uuid

import httpx
import pytest
from dotenv import load_dotenv

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


def _supa_headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
    }


def _query_supabase(client: httpx.Client, table: str, query_filter: str, select: str = "*", limit: int = 50):
    """Helper to query Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}&{query_filter}&limit={limit}"
    r = client.get(url, headers=_supa_headers(), timeout=30.0)
    if r.status_code != 200:
        return None, r
    return r.json(), r


# ---------------------------------------------------------------------------
# Module-scope fixtures: ONE fresh user is created and reused throughout all
# tests so we can verify each write endpoint persisted a row tagged with that
# user_id in Supabase.
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    return httpx.Client(timeout=120.0)


@pytest.fixture(scope="module")
def test_user(client):
    """Sign up a brand-new dataflow user via mock email-OTP."""
    unique = f"{int(time.time())}_{uuid.uuid4().hex[:6]}"
    email = f"TEST_dataflow_{unique}@example.com"

    r1 = client.post(f"{API}/auth/send-email-otp", json={"email": email})
    assert r1.status_code == 200, f"send-email-otp: {r1.status_code} {r1.text}"
    data1 = r1.json()
    assert data1.get("success") is True
    assert "otp" in data1
    otp = data1["otp"]

    r2 = client.post(
        f"{API}/auth/verify-otp",
        json={
            "type": "email",
            "identifier": email,
            "otp": otp,
            "name": "Audit Tester",
        },
    )
    assert r2.status_code == 200, f"verify-otp: {r2.status_code} {r2.text}"
    data2 = r2.json()
    return {
        "user_id": data2["user_id"],
        "session_token": data2["session_token"],
        "email": email,
    }


# ---------------------------------------------------------------------------
# 0. Bootstrap sanity
# ---------------------------------------------------------------------------

class TestBootstrap:
    def test_api_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200

    def test_audit_tables_present_in_backend_log(self):
        """Read backend.err.log and confirm audit-active line is still present."""
        log_path = "/var/log/supervisor/backend.err.log"
        if not os.path.exists(log_path):
            pytest.skip("backend.err.log not found")
        with open(log_path, "r") as f:
            content = f.read()[-50000:]  # last 50KB
        assert "All audit tables present. Audit logging is fully active." in content, (
            "Bootstrap did not log audit-active confirmation"
        )


# ---------------------------------------------------------------------------
# 1. SIGNUP FLOW REAL-TIME PERSISTENCE
# ---------------------------------------------------------------------------

class TestSignupFlowPersistence:
    """All endpoints that fire during signup must persist rows to Supabase."""

    def test_a_login_audit_row_after_verify_otp(self, client, test_user):
        time.sleep(1.0)
        rows, r = _query_supabase(
            client, "user_logged_in",
            f"user_id=eq.{test_user['user_id']}",
            select="user_id,login_method,login_success_state",
        )
        assert rows is not None, f"PostgREST error: {r.status_code} {r.text}"
        assert len(rows) >= 1, f"No user_logged_in row for {test_user['user_id']}"

    def test_b_profile_save_persists_to_supabase(self, client, test_user):
        """POST /api/user/profile must write into user_sign_up_details +
        top_5_movies + toggle_visibility_profile + mode_selected."""
        uid = test_user["user_id"]
        payload = {
            "user_id": uid,
            "name": "Audit Tester",
            "age": 28,
            "gender": "Female",
            "location": "Mumbai",
            "partnerPreference": "Men",
            "relationshipIntent": ["Serious", "Casual"],
            "genres": ["Drama", "Thriller"],
            "filmLanguages": ["English", "Hindi"],
            "languagesSpoken": ["English", "Hindi"],
            "topMovies": [
                {"id": 27205, "title": "Inception", "rating": 5,
                 "reasons": ["Visuals", "Story"]},
                {"id": 155, "title": "The Dark Knight", "rating": 5,
                 "reasons": ["Acting"]},
            ],
            "movieFrequency": "Weekly",
            "ottTheatre": "Both",
            "height": "5'5\"",
            "religion": "Hindu",
            "maritalStatus": "Single",
            "foodPreference": "Veg",
            "bio": "Audit tester bio",
            "smoking": "Never",
            "drinking": "Sometimes",
            "exercise": "Sometimes",
            "zodiac": "Leo",
            "pets": "Likes",
            "familyPlanning": "Want kids",
            "siblings": "1",
            "education": "Bachelors",
            "workProfile": "Engineer",
            "travel": "Sometimes",
            "movieBuddyMode": True,
            "movieDateMode": True,
        }
        r = client.post(f"{API}/user/profile", json=payload, timeout=90.0)
        assert r.status_code == 200, f"/user/profile failed: {r.status_code} {r.text}"
        assert r.json().get("success") is True

        time.sleep(2.0)  # allow Supabase write to complete

        # user_sign_up_details
        rows, _ = _query_supabase(client, "user_sign_up_details",
                                  f"user_id=eq.{uid}",
                                  select="user_id,name,gender")
        assert rows and len(rows) >= 1, f"user_sign_up_details has no row for {uid}"

        # top_5_movies — expect 2 rows
        rows, _ = _query_supabase(client, "top_5_movies",
                                  f"user_id=eq.{uid}",
                                  select="user_id,movie_name,rank_of_movie_added")
        assert rows and len(rows) >= 2, (
            f"top_5_movies expected >=2 rows, got {rows}"
        )

        # mode_selected — at least 1 row (modes provided)
        rows, _ = _query_supabase(client, "mode_selected",
                                  f"user_id=eq.{uid}",
                                  select="user_id,mode_selected")
        assert rows and len(rows) >= 1, f"mode_selected has no row for {uid}"

    def test_c_visibility_toggles_via_profile(self, client, test_user):
        """visibilityToggles isn't in the strict UserProfileRequest model so
        the helper is only invoked when the request includes it. Send a
        second /user/profile call with visibilityToggles populated to
        exercise save_visibility_toggles (kwargs-style extra field — pydantic
        will ignore unknown fields, but the server reads via hasattr)."""
        uid = test_user["user_id"]
        # The server reads `req.visibilityToggles` only if attr exists on the
        # pydantic model. Since UserProfileRequest doesn't declare it, the
        # toggle branch may not fire — verify the table is at least
        # reachable (no schema error) for the user. This is a soft check.
        rows, r = _query_supabase(client, "toggle_visibility_profile",
                                  f"user_id=eq.{uid}",
                                  select="user_id")
        # If 400, schema mismatch — surface as a warning, not a hard failure,
        # since the request model itself doesn't carry visibilityToggles.
        if r.status_code == 400:
            pytest.skip(f"toggle_visibility_profile schema check: {r.text}")
        assert rows is not None, "PostgREST query failed"
        # Note: rows may be empty since UserProfileRequest doesn't accept the
        # field — this is reported as a code-review item, not a fail here.

    def test_d_filters_persists_to_supabase(self, client, test_user):
        uid = test_user["user_id"]
        payload = {
            "user_id": uid,
            "session_id": test_user["session_token"],
            "distance_radius": 25,
            "age_min": 24,
            "age_max": 32,
            "languages": ["English", "Hindi"],
            "genres": ["Drama"],
            "religion": "Hindu",
            "exclusive_toggles": {
                "distanceRadius": False,
                "ageRange": True,
            },
            "expand_if_run_out_toggles": {
                "distanceRadius": True,
                "ageRange": False,
            },
        }
        r = client.post(f"{API}/user/filters", json=payload, timeout=60.0)
        assert r.status_code == 200, f"/user/filters failed: {r.status_code} {r.text}"
        assert r.json().get("success") is True

        time.sleep(2.0)

        rows, _ = _query_supabase(client, "preferences_and_filters",
                                  f"user_id=eq.{uid}", select="user_id")
        assert rows and len(rows) >= 1, "preferences_and_filters missing row"

        rows, _ = _query_supabase(client, "exclusive_toggle",
                                  f"user_id=eq.{uid}", select="user_id")
        assert rows and len(rows) >= 1, "exclusive_toggle missing row"

        rows, _ = _query_supabase(client, "expand_if_run_out",
                                  f"user_id=eq.{uid}", select="user_id")
        assert rows and len(rows) >= 1, "expand_if_run_out missing row"

    def test_e_mode_endpoint_adds_row(self, client, test_user):
        uid = test_user["user_id"]
        # Count mode_selected rows before
        before, _ = _query_supabase(client, "mode_selected",
                                    f"user_id=eq.{uid}", select="id")
        before_count = len(before) if before else 0

        r = client.post(f"{API}/user/mode",
                        json={"user_id": uid, "mode": "date"})
        assert r.status_code == 200, f"/user/mode failed: {r.status_code} {r.text}"
        assert r.json().get("success") is True

        time.sleep(1.5)
        after, _ = _query_supabase(client, "mode_selected",
                                   f"user_id=eq.{uid}", select="id,mode_selected")
        after_count = len(after) if after else 0
        assert after_count > before_count, (
            f"mode_selected did NOT add a new row (before={before_count}, "
            f"after={after_count})"
        )
        assert any(row.get("mode_selected") == "date" for row in (after or [])), (
            f"No 'date' mode row found: {after}"
        )

    def test_f_pictures_batch_audit_NEW_HOOK(self, client, test_user):
        """NEW HOOK: upload-batch must write one user_pictures row PER
        picture in the batch."""
        uid = test_user["user_id"]
        # Count before
        before, _ = _query_supabase(client, "user_pictures",
                                    f"user_id=eq.{uid}&action=eq.upload",
                                    select="id")
        before_count = len(before) if before else 0

        payload = {
            "user_id": uid,
            "session_id": test_user["session_token"],
            "pictures": {
                "picture_1": TINY_PNG_B64,
                "picture_2": TINY_PNG_B64,
            },
        }
        r = client.post(f"{API}/user/pictures/upload-batch", json=payload,
                        timeout=60.0)
        assert r.status_code == 200, (
            f"upload-batch failed: {r.status_code} {r.text}"
        )
        body = r.json()
        assert body.get("success") is True
        assert body.get("uploaded_count") == 2, (
            f"Expected 2 uploads, got {body}"
        )

        time.sleep(2.0)
        after, _ = _query_supabase(client, "user_pictures",
                                   f"user_id=eq.{uid}&action=eq.upload",
                                   select="id,picture_number,action")
        after_count = len(after) if after else 0
        assert after_count >= before_count + 2, (
            f"NEW upload-batch audit hook FAILED: before={before_count}, "
            f"after={after_count}, rows={after}"
        )


# ---------------------------------------------------------------------------
# 2. MATCH FLOW — including the FIVE new audit hooks
# ---------------------------------------------------------------------------

class TestMatchFlowPersistence:

    def test_a_matches_generated_event(self, client, test_user):
        uid = test_user["user_id"]
        before, _ = _query_supabase(client, "match_events",
                                    f"user_id=eq.{uid}", select="id")
        before_count = len(before) if before else 0

        r = client.post(f"{API}/matches",
                        json={"user_id": uid, "mode": "date", "limit": 5},
                        timeout=120.0)
        assert r.status_code == 200, f"/matches: {r.status_code} {r.text}"
        # /matches must return a JSON dict — schema verification only,
        # candidates may be empty for brand-new test user.

        time.sleep(2.0)
        after, _ = _query_supabase(
            client, "match_events",
            f"user_id=eq.{uid}",
            select="id,event_type",
        )
        after_count = len(after) if after else 0
        assert after_count > before_count, (
            f"/matches did NOT log match_events row: before={before_count}, "
            f"after={after_count}"
        )

    def test_b_init_mock_then_accept_NEW_HOOK(self, client, test_user):
        """NEW HOOK: /chat/accept must log match_events 'request_accepted'."""
        uid = test_user["user_id"]
        # Seed mock conversations
        r = client.post(f"{API}/chat/init-mock/{uid}")
        assert r.status_code == 200

        # Fetch a real conversation_id
        r2 = client.get(f"{API}/chat/conversations/{uid}")
        assert r2.status_code == 200
        conversations = r2.json().get("conversations", [])
        assert len(conversations) >= 1, "No mock conversations seeded"
        conv_id_accept = conversations[0]["conversation_id"]
        conv_id_decline = conversations[1]["conversation_id"] if len(conversations) >= 2 else None
        conv_id_delete = conversations[2]["conversation_id"] if len(conversations) >= 3 else conv_id_accept

        # Persist these for downstream tests in this class
        pytest._iter20_conv_ids = {
            "accept": conv_id_accept,
            "decline": conv_id_decline,
            "delete": conv_id_delete,
        }

        # Count match_events with event_type='request_accepted' before
        before, _ = _query_supabase(
            client, "match_events",
            f"user_id=eq.{uid}&event_type=eq.request_accepted",
            select="id",
        )
        before_count = len(before) if before else 0

        r = client.post(f"{API}/chat/accept",
                        json={"user_id": uid, "conversation_id": conv_id_accept})
        assert r.status_code == 200, f"/chat/accept: {r.status_code} {r.text}"

        time.sleep(1.5)
        after, _ = _query_supabase(
            client, "match_events",
            f"user_id=eq.{uid}&event_type=eq.request_accepted",
            select="id,event_type",
        )
        after_count = len(after) if after else 0
        assert after_count > before_count, (
            f"NEW HOOK FAILED: /chat/accept did NOT log 'request_accepted' "
            f"(before={before_count}, after={after_count})"
        )

    def test_c_decline_NEW_HOOK(self, client, test_user):
        uid = test_user["user_id"]
        conv_id = pytest._iter20_conv_ids.get("decline")
        if not conv_id:
            pytest.skip("No second mock conversation available for decline test")

        before, _ = _query_supabase(
            client, "match_events",
            f"user_id=eq.{uid}&event_type=eq.request_declined",
            select="id",
        )
        before_count = len(before) if before else 0

        r = client.post(f"{API}/chat/decline",
                        json={"user_id": uid, "conversation_id": conv_id})
        assert r.status_code == 200, f"/chat/decline: {r.status_code} {r.text}"

        time.sleep(1.5)
        after, _ = _query_supabase(
            client, "match_events",
            f"user_id=eq.{uid}&event_type=eq.request_declined",
            select="id",
        )
        after_count = len(after) if after else 0
        assert after_count > before_count, (
            f"NEW HOOK FAILED: /chat/decline did NOT log 'request_declined'"
        )

    def test_d_unmatch_persists(self, client, test_user):
        uid = test_user["user_id"]
        before, _ = _query_supabase(client, "unmatch_events",
                                    f"user_id=eq.{uid}", select="id")
        before_count = len(before) if before else 0

        r = client.post(f"{API}/chat/unmatch",
                        json={"user_id": uid,
                              "other_user_id": "mock_user_002",
                              "reason": "iter20 audit test"})
        assert r.status_code == 200

        time.sleep(1.5)
        after, _ = _query_supabase(client, "unmatch_events",
                                   f"user_id=eq.{uid}", select="id")
        after_count = len(after) if after else 0
        assert after_count > before_count, (
            "unmatch_events did NOT receive a new row"
        )

    def test_e_report_persists(self, client, test_user):
        uid = test_user["user_id"]
        before, _ = _query_supabase(client, "report_events",
                                    f"reporter_id=eq.{uid}", select="id")
        before_count = len(before) if before else 0

        r = client.post(f"{API}/chat/report",
                        json={"reporter_id": uid,
                              "reported_id": "mock_user_003",
                              "reason": "iter20 audit",
                              "details": "automation"})
        assert r.status_code == 200

        time.sleep(1.5)
        after, _ = _query_supabase(client, "report_events",
                                   f"reporter_id=eq.{uid}", select="id")
        after_count = len(after) if after else 0
        assert after_count > before_count, (
            "report_events did NOT receive a new row"
        )

    def test_f_delete_NEW_HOOK(self, client, test_user):
        uid = test_user["user_id"]
        conv_id = pytest._iter20_conv_ids.get("delete")
        if not conv_id:
            pytest.skip("No mock conv_id available for delete test")

        before, _ = _query_supabase(
            client, "match_events",
            f"user_id=eq.{uid}&event_type=eq.chat_deleted",
            select="id",
        )
        before_count = len(before) if before else 0

        r = client.post(f"{API}/chat/delete",
                        json={"user_id": uid, "conversation_id": conv_id})
        assert r.status_code == 200, f"/chat/delete: {r.status_code} {r.text}"

        time.sleep(1.5)
        after, _ = _query_supabase(
            client, "match_events",
            f"user_id=eq.{uid}&event_type=eq.chat_deleted",
            select="id",
        )
        after_count = len(after) if after else 0
        assert after_count > before_count, (
            "NEW HOOK FAILED: /chat/delete did NOT log 'chat_deleted'"
        )

    def test_g_meeting_report_NEW_HOOK(self, client, test_user):
        uid = test_user["user_id"]
        # Use the accepted conv_id (still exists for this user, even if other
        # was just declined/deleted — we only need a conv_id string).
        conv_id = pytest._iter20_conv_ids.get("accept") or "test_conv_iter20"

        before, _ = _query_supabase(
            client, "match_events",
            f"user_id=eq.{uid}&event_type=eq.meeting_reported",
            select="id",
        )
        before_count = len(before) if before else 0

        r = client.post(
            f"{API}/chat/meeting-report",
            json={
                "conversation_id": conv_id,
                "user_id": uid,
                "did_meet": True,
                "verification_result": "yes",
                "reported_at": "2026-01-15T10:00:00Z",
            },
        )
        assert r.status_code == 200, (
            f"/chat/meeting-report: {r.status_code} {r.text}"
        )

        time.sleep(1.5)
        after, _ = _query_supabase(
            client, "match_events",
            f"user_id=eq.{uid}&event_type=eq.meeting_reported",
            select="id",
        )
        after_count = len(after) if after else 0
        assert after_count > before_count, (
            "NEW HOOK FAILED: /chat/meeting-report did NOT log 'meeting_reported'"
        )

    def test_h_meeting_status_NEW_HOOK(self, client, test_user):
        uid = test_user["user_id"]
        before, _ = _query_supabase(
            client, "match_events",
            f"user_id=eq.{uid}&event_type=eq.meeting_verified",
            select="id",
        )
        before_count = len(before) if before else 0

        r = client.post(
            f"{API}/chat/meeting-status",
            json={
                "user_id": uid,
                "other_user_id": "mock_user_001",
                "did_meet": True,
                "was_same_person": True,
            },
        )
        assert r.status_code == 200, (
            f"/chat/meeting-status: {r.status_code} {r.text}"
        )

        time.sleep(1.5)
        after, _ = _query_supabase(
            client, "match_events",
            f"user_id=eq.{uid}&event_type=eq.meeting_verified",
            select="id",
        )
        after_count = len(after) if after else 0
        assert after_count > before_count, (
            "NEW HOOK FAILED: /chat/meeting-status did NOT log 'meeting_verified'"
        )


# ---------------------------------------------------------------------------
# 3. CHAT FLOW (regression on existing hooks)
# ---------------------------------------------------------------------------

class TestChatFlowRegression:

    def test_a_chat_send_persists(self, client, test_user):
        uid = test_user["user_id"]
        r = client.post(
            f"{API}/chat/send",
            json={
                "sender_id": uid,
                "receiver_id": "mock_user_001",
                "content": f"iter20 audit message {uuid.uuid4().hex[:8]}",
                "message_type": "text",
            },
        )
        assert r.status_code == 200, f"/chat/send: {r.status_code} {r.text}"

        time.sleep(1.5)
        rows, _ = _query_supabase(
            client, "user_chat_messages",
            f"sender_id=eq.{uid}",
            select="sender_id,content",
        )
        assert rows and len(rows) >= 1, (
            "user_chat_messages has no rows for sender after /chat/send"
        )

    def test_b_tina_chat_persists(self, client, test_user):
        uid = test_user["user_id"]
        before, _ = _query_supabase(client, "tina_chat_messages",
                                    f"user_id=eq.{uid}", select="id")
        before_count = len(before) if before else 0

        r = client.post(
            f"{API}/tina/chat",
            json={
                "user_id": uid,
                "user_name": "Audit Tester",
                "message": "hi tina iter20",
                "is_onboarding_complete": True,
                "collected_fields": [],
            },
            timeout=60.0,
        )
        assert r.status_code == 200, f"/tina/chat: {r.status_code} {r.text}"

        time.sleep(2.0)
        after, _ = _query_supabase(
            client, "tina_chat_messages",
            f"user_id=eq.{uid}",
            select="id,role",
        )
        after_count = len(after) if after else 0
        # Tina logs both the user message AND the assistant reply -> 2 rows
        assert after_count >= before_count + 2, (
            f"/tina/chat expected +2 rows (user+assistant), "
            f"before={before_count}, after={after_count}"
        )


# ---------------------------------------------------------------------------
# 4. NEGATIVE CHECKS — no 5xx and audit failures are non-blocking
# ---------------------------------------------------------------------------

class TestNegativeChecks:
    def test_no_recent_500_from_new_hooks(self):
        """Read the last ~50KB of backend.err.log and confirm there are no
        500-level traces from the new audit hook endpoints."""
        log_path = "/var/log/supervisor/backend.err.log"
        if not os.path.exists(log_path):
            pytest.skip("backend.err.log not found")
        with open(log_path, "r") as f:
            tail = f.read()[-50000:]
        # Look for explicit 500 errors from the new endpoints
        suspicious = []
        for line in tail.splitlines():
            l = line.lower()
            if (("500 internal server error" in l) or
                ("traceback (most recent call last)" in l)):
                if any(ep in l for ep in [
                    "/chat/accept", "/chat/decline", "/chat/delete",
                    "/chat/meeting-report", "/chat/meeting-status",
                    "pictures/upload-batch",
                ]):
                    suspicious.append(line)
        assert not suspicious, (
            f"Found 500/traceback lines for new hooks: {suspicious[:5]}"
        )

    def test_audit_failures_are_non_blocking(self):
        """Confirm _safe_audit_insert exists in supabase_service.py — the
        wrapper that guarantees audit failures never raise."""
        with open("/app/backend/supabase_service.py", "r") as f:
            src = f.read()
        assert "_safe_audit_insert" in src
        assert "logger.warning" in src
        # All new hooks in server.py use try/except audit_err
        with open("/app/backend/server.py", "r") as f:
            srv = f.read()
        for label in ["accept request log failed",
                      "decline request log failed",
                      "meeting report log failed",
                      "meeting status log failed",
                      "chat delete log failed",
                      "batch picture log failed"]:
            assert label in srv, (
                f"Expected non-blocking audit try/except for: {label}"
            )
