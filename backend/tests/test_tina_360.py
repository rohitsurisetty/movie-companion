"""
Backend tests for the 360° persona-building quiz orchestration + persistence.
Covers:
  - POST /api/tina/chat with is_onboarding_complete=True triggers transition
    and returns first question chips (mode=personality_360, question_id=first_night_vibe)
  - 8 sequential chip answers produce archetype_reveal payload
  - tina_profiles upsert via GET /api/tina/360/profile/{user_id}
  - Free-text mid-quiz does NOT advance, re-prompts current question
  - personality_vector / raw scores NEVER appear in any response
  - GET /api/tina/360/questions returns 8 questions + dynamic genres + tropes
  - /api/matches still works (no regression)
"""

import os
import uuid
import json
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://match-history-dev.preview.emergentagent.com"

API = f"{BASE_URL}/api"

# 8 deterministic chip answers (must match tina_personality.QUESTIONS order)
# Choosing answers that lean cozy/serious so we get a deterministic archetype.
QUIZ_ANSWERS = [
    ("first_night_vibe",   "talk_2am"),
    ("perfect_first_date", "coffee_chat"),
    ("delayed_reply",      "probably_busy"),
    ("love_story_trope",   "slow_burn"),
    ("friday_night",       "netflix"),
    ("biggest_green_flag", "emotional_maturity"),
    ("fall_for_people_who","feel_like_home"),
    ("dating_superpower",  "deep_convos"),
]

FORBIDDEN_KEYS = {"personality_vector", "raw_scores"}


def _assert_no_hidden_scores(obj):
    """Walk JSON and assert no forbidden keys appear anywhere."""
    text = json.dumps(obj) if not isinstance(obj, str) else obj
    for k in FORBIDDEN_KEYS:
        assert k not in text, f"Forbidden key '{k}' leaked in response: {text[:300]}"


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def user_id(api):
    """Use a fresh user_id per run so quiz state is clean."""
    uid = f"TEST_360_{uuid.uuid4().hex[:10]}"
    # Best effort: clear any existing session
    try:
        api.delete(f"{API}/tina/session/{uid}", timeout=10)
    except Exception:
        pass
    return uid


# ---------------------------------------------------------------------------
# Endpoint: GET /api/tina/360/questions
# ---------------------------------------------------------------------------
class TestQuestionsEndpoint:
    def test_returns_8_questions_and_dynamic(self, api):
        r = api.get(f"{API}/tina/360/questions", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        assert data.get("total_questions") == 8
        questions = data["questions"]
        assert len(questions) == 8
        # First question must be first_night_vibe
        assert questions[0]["id"] == "first_night_vibe"
        # Each question has options with emoji/key/label
        for q in questions:
            assert "id" in q and "intent" in q and "options" in q
            assert len(q["options"]) >= 4
            for o in q["options"]:
                assert "key" in o and "label" in o
                assert "emoji" in o
        # Dynamic block
        assert "dynamic" in data
        assert "movie_genres" in data["dynamic"]
        assert "love_tropes" in data["dynamic"]
        assert len(data["dynamic"]["movie_genres"]) >= 1
        assert len(data["dynamic"]["love_tropes"]) >= 1
        # No hidden scoring leak
        _assert_no_hidden_scores(data)


# ---------------------------------------------------------------------------
# /api/tina/chat — 360 quiz orchestration
# ---------------------------------------------------------------------------
class TestPersona360Flow:
    def test_transition_message_returns_first_question(self, api, user_id):
        r = api.post(
            f"{API}/tina/chat",
            json={
                "user_id": user_id,
                "user_name": "Tester",
                "message": "",
                "is_onboarding_complete": True,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        _assert_no_hidden_scores(data)
        # Transition copy mentions help / understand
        resp = (data.get("response") or "").lower()
        assert any(kw in resp for kw in ["understand you better", "help me understand", "perfect match", "fun round"]), resp
        # First question chips
        opts = data.get("show_options") or {}
        assert opts.get("mode") == "personality_360", opts
        assert opts.get("question_id") == "first_night_vibe", opts
        assert len(opts.get("options", [])) == 4
        # Each option has key/emoji/label
        for o in opts["options"]:
            assert "key" in o and "emoji" in o and "label" in o
        assert data.get("persona_360_phase") == "active"
        # archetype_reveal must NOT be present yet
        assert not data.get("archetype_reveal")

    def test_free_text_mid_quiz_does_not_advance(self, api, user_id):
        # Start the quiz
        api.post(
            f"{API}/tina/chat",
            json={"user_id": user_id, "user_name": "T", "is_onboarding_complete": True, "message": ""},
            timeout=30,
        )
        # Send free text mid-quiz (no selected_360_option)
        r = api.post(
            f"{API}/tina/chat",
            json={
                "user_id": user_id,
                "user_name": "T",
                "message": "why this question",
                "is_onboarding_complete": True,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        _assert_no_hidden_scores(data)
        # Should re-show the SAME first question (not advance)
        opts = data.get("show_options") or {}
        assert opts.get("mode") == "personality_360", opts
        assert opts.get("question_id") == "first_night_vibe", opts
        assert data.get("persona_360_phase") == "active"
        # Response should gently re-prompt
        resp = (data.get("response") or "").lower()
        assert ("pick one" in resp) or ("fun read" in resp) or ("?" in resp), resp
        assert not data.get("archetype_reveal")

    def test_eight_sequential_answers_produce_archetype_reveal(self, api, user_id):
        # 1) Trigger quiz
        api.post(
            f"{API}/tina/chat",
            json={"user_id": user_id, "user_name": "T", "is_onboarding_complete": True, "message": ""},
            timeout=30,
        )

        last_resp = None
        for i, (qid, okey) in enumerate(QUIZ_ANSWERS, start=1):
            r = api.post(
                f"{API}/tina/chat",
                json={
                    "user_id": user_id,
                    "user_name": "T",
                    "message": "",
                    "is_onboarding_complete": True,
                    "selected_360_option": {"question_id": qid, "option_key": okey},
                },
                timeout=30,
            )
            assert r.status_code == 200, f"turn {i}: {r.text}"
            data = r.json()
            _assert_no_hidden_scores(data)
            last_resp = data
            if i < 8:
                # Still active, archetype_reveal should NOT be present
                assert data.get("persona_360_phase") == "active", f"turn {i}: phase={data.get('persona_360_phase')}"
                assert not data.get("archetype_reveal"), f"turn {i}: reveal leaked early"
                opts = data.get("show_options") or {}
                assert opts.get("mode") == "personality_360"
            else:
                # 8th turn: archetype reveal
                assert data.get("persona_360_phase") == "complete", data
                reveal = data.get("archetype_reveal")
                assert reveal is not None, "Missing archetype_reveal on 8th turn"
                for k in ("emoji", "title", "description", "primary_love_language", "intent"):
                    assert k in reveal, f"reveal missing {k}"
                assert "serious" in reveal["intent"] and "casual" in reveal["intent"]

        # ---- Validate persistence via GET /api/tina/360/profile/{user_id} ----
        rg = api.get(f"{API}/tina/360/profile/{user_id}", timeout=15)
        assert rg.status_code == 200, rg.text
        prof = rg.json()
        _assert_no_hidden_scores(prof)
        assert prof.get("success") is True
        assert prof.get("exists") is True
        assert prof.get("archetype") is not None
        assert prof.get("intent") is not None
        assert prof.get("primary_love_language")
        assert isinstance(prof.get("questions_answered"), list)
        assert len(prof["questions_answered"]) == 8
        # personality_vector must NOT leak
        assert "personality_vector" not in prof

    def test_profile_endpoint_for_unknown_user(self, api):
        uid = f"TEST_UNKNOWN_{uuid.uuid4().hex[:8]}"
        r = api.get(f"{API}/tina/360/profile/{uid}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("success") is True
        assert data.get("exists") is False


# ---------------------------------------------------------------------------
# /api/matches regression (no auth needed, accepts any user_id)
# ---------------------------------------------------------------------------
class TestMatchesRegression:
    def test_matches_endpoint_works_with_random_user(self, api):
        uid = f"TEST_MATCH_{uuid.uuid4().hex[:8]}"
        r = api.post(
            f"{API}/matches",
            json={"user_id": uid, "mode": "date", "limit": 5},
            timeout=60,
        )
        # Accept 200 or graceful error (404 if user not found),
        # but the endpoint must not 500.
        assert r.status_code in (200, 400, 404), f"unexpected {r.status_code}: {r.text[:300]}"
        if r.status_code == 200:
            data = r.json()
            _assert_no_hidden_scores(data)
            assert "matches" in data

    def test_matches_for_user_with_tina_profile(self, api, user_id):
        # Build a profile first
        api.post(
            f"{API}/tina/chat",
            json={"user_id": user_id, "user_name": "T", "is_onboarding_complete": True, "message": ""},
            timeout=30,
        )
        for qid, okey in QUIZ_ANSWERS:
            api.post(
                f"{API}/tina/chat",
                json={
                    "user_id": user_id,
                    "user_name": "T",
                    "is_onboarding_complete": True,
                    "selected_360_option": {"question_id": qid, "option_key": okey},
                },
                timeout=30,
            )
        # Now call matches; user likely doesn't exist as a full user but
        # endpoint should not 500 because of personality engine.
        r = api.post(
            f"{API}/matches",
            json={"user_id": user_id, "mode": "date", "limit": 5},
            timeout=90,
        )
        assert r.status_code in (200, 400, 404), f"unexpected {r.status_code}: {r.text[:300]}"
        if r.status_code == 200:
            data = r.json()
            _assert_no_hidden_scores(data)
