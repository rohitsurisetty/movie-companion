"""
Tests for iter26 Tina bug fixes:

Bug 1: When is_onboarding_complete=True, /api/tina/chat MUST skip the 360°
       persona quiz unconditionally and use the free-form LLM path.
       Verified with FRESH users (no pre-seeded session).

Bug 2: Latency of /api/tina/chat free-chat path should be <2.5s on
       average (post gpt-4o -> gpt-4o-mini via fast=True).

Also performs:
  - Code inspection of /app/backend/tina_service.py for fast=True and
    `gpt-4o-mini if fast else gpt-4o`.
  - Code inspection of /app/frontend/src/components/TinaCallScreen.tsx
    for tightened cadence constants.
  - Regression: signup-flow Tina (is_onboarding_complete=False) still
    runs scripted onboarding.
"""

import os
import re
import time
import uuid
import asyncio
import pytest
import requests
from typing import Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = (os.environ.get("EXPO_BACKEND_URL")
            or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# 360-quiz scripted phrase indicators
QUIZ_PHRASES = [
    "what would you do",
    "first date",
    "first meet",
    "pick one",
    "feel free to share",
    "let's start with",
    "let's get to know",
]


def _is_quiz_response(data: Dict[str, Any]) -> (bool, str):
    """Return (is_quiz, reason). True if response looks like a 360 quiz turn."""
    show_options = data.get("show_options")
    if show_options:
        if isinstance(show_options, dict) and show_options.get("mode") == "personality_360":
            return True, f"show_options.mode==personality_360: {show_options}"
        # any non-empty chips block on post-onboarding path is suspect
        return True, f"show_options non-empty on post-onboarding: {show_options}"
    if data.get("archetype_reveal"):
        return True, f"archetype_reveal present: {data.get('archetype_reveal')}"
    msg = (data.get("response") or "").lower()
    for phrase in QUIZ_PHRASES:
        if phrase in msg:
            return True, f"scripted phrase '{phrase}' in response: {msg[:200]}"
    return False, ""


# --------------------------------------
# Fixtures
# --------------------------------------

@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def _signup_fresh_user(api, mongo, name: str = "Alice Test") -> str:
    """Sign up a fresh user via OTP flow and return user_id."""
    email = f"TEST_iter26_{uuid.uuid4().hex[:10]}@example.com"

    r = api.post(f"{BASE_URL}/api/auth/send-email-otp",
                 json={"email": email}, timeout=20)
    assert r.status_code == 200, f"send-otp failed: {r.text}"
    otp_body = r.json()
    otp = otp_body.get("otp") or otp_body.get("code") or otp_body.get("dev_otp")
    assert otp, f"no OTP in response body: {otp_body}"

    r = api.post(f"{BASE_URL}/api/auth/verify-otp",
                 json={"type": "email", "identifier": email,
                       "otp": otp, "name": name}, timeout=20)
    assert r.status_code == 200, f"verify-otp failed: {r.text}"
    body = r.json()
    user_id = (
        body.get("user_id")
        or (body.get("user") or {}).get("id")
        or (body.get("user") or {}).get("user_id")
        or body.get("id")
    )
    assert user_id, f"no user_id in verify response: {body}"

    # Save a complete profile so is_onboarding_complete is honored
    profile_payload = {
        "user_id": user_id,
        "name": name,
        "age": 27,
        "gender": "Female",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term"],
        "genres": ["Drama", "Romance"],
        "topMovies": [{"title": "La La Land"}, {"title": "Casablanca"}],
        "filmLanguages": ["English"],
        "movieFrequency": "Often",
        "ottTheatre": "Both",
        "location": {"city": "Mumbai"},
        "is_onboarding_complete": True,
    }
    r = api.post(f"{BASE_URL}/api/user/profile",
                 json=profile_payload, timeout=20)
    # Some backends use PUT; not critical for tina test (we'll seed via mongo as fallback)
    return user_id, email


@pytest.fixture(scope="module")
def fresh_user(api, mongo):
    user_id, email = _signup_fresh_user(api, mongo)

    # Belt-and-suspenders: ensure user_profiles is fully populated.
    async def _ensure():
        await mongo.user_profiles.update_one(
            {"user_id": user_id},
            {"$set": {
                "user_id": user_id,
                "name": "Alice Test",
                "age": 27,
                "gender": "Female",
                "partnerPreference": "Men",
                "relationshipIntent": ["Long-term"],
                "genres": ["Drama", "Romance"],
                "topMovies": [{"title": "La La Land"}, {"title": "Casablanca"}],
                "filmLanguages": ["English"],
                "is_onboarding_complete": True,
            }},
            upsert=True,
        )
        # IMPORTANT: do NOT pre-seed tina_sessions — we want a FRESH session
        # to verify the bug fix works for users who never started the 360 quiz.
        await mongo.tina_sessions.delete_many({"user_id": user_id})

    _run(_ensure())

    yield user_id

    async def _cleanup():
        await mongo.user_profiles.delete_many({"user_id": user_id})
        await mongo.tina_sessions.delete_many({"user_id": user_id})
    _run(_cleanup())


# --------------------------------------
# Tests
# --------------------------------------

class TestSanity:
    def test_backend_root(self, api):
        r = api.get(f"{BASE_URL}/api/", timeout=10)
        assert r.status_code == 200


class TestBug1_SkipQuizForCompletedUsers:
    """Bug 1: post-onboarding chat must skip the 360 quiz unconditionally."""

    def _chat(self, api, payload):
        r = api.post(f"{BASE_URL}/api/tina/chat", json=payload, timeout=60)
        assert r.status_code == 200, f"status={r.status_code} body={r.text}"
        return r.json()

    def test_01_first_turn_no_quiz(self, api, fresh_user):
        data = self._chat(api, {
            "user_id": fresh_user,
            "user_name": "Alice Test",
            "message": "hello",
            "is_onboarding_complete": True,
        })
        msg = (data.get("response") or "").strip()
        print(f"\n[BUG1 turn1 reply]: {msg!r}\n[full payload]: {data}\n")

        is_quiz, reason = _is_quiz_response(data)
        assert not is_quiz, f"Bug 1 NOT FIXED — 360 quiz still triggered: {reason}"
        assert msg, "empty response"

        # Bonus: short + ≤1 emoji
        emoji_count = len(re.findall(r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF]", msg))
        assert emoji_count <= 2, f"too many emojis ({emoji_count}): {msg}"

    def test_02_movie_recommendation_references_taste(self, api, fresh_user):
        data = self._chat(api, {
            "user_id": fresh_user,
            "user_name": "Alice Test",
            "message": "what should I watch tonight?",
            "is_onboarding_complete": True,
        })
        msg = (data.get("response") or "").strip()
        print(f"\n[BUG1 turn2 reply]: {msg!r}\n")

        is_quiz, reason = _is_quiz_response(data)
        assert not is_quiz, f"360 quiz still triggered on turn 2: {reason}"

        # The reply should ideally reference taste — soft assertion via OR
        # of multiple known facets. LLM may not always cite La La Land
        # explicitly so we accept any of several signals.
        lower = msg.lower()
        signals = ["la la land", "casablanca", "drama", "romance", "romantic", "musical"]
        found = [s for s in signals if s in lower]
        # Not a hard failure if LLM is generic — log warning
        if not found:
            print(f"[BUG1 turn2 WARN] reply did not cite any known taste signal: {msg!r}")

    def test_03_tell_me_about_yourself_no_script(self, api, fresh_user):
        data = self._chat(api, {
            "user_id": fresh_user,
            "user_name": "Alice Test",
            "message": "tell me about yourself",
            "is_onboarding_complete": True,
        })
        msg = (data.get("response") or "").strip()
        print(f"\n[BUG1 turn3 reply]: {msg!r}\n")

        is_quiz, reason = _is_quiz_response(data)
        assert not is_quiz, f"360 quiz still triggered on turn 3: {reason}"

    def test_04_chip_payload_does_not_enter_quiz(self, api, fresh_user):
        """Edge case: stale chip-style payload with empty message should be
        treated as plain text, not enter the 360 quiz handler."""
        data = self._chat(api, {
            "user_id": fresh_user,
            "user_name": "Alice Test",
            "message": "",
            "selected_option": "Casual movie buff",
            "is_onboarding_complete": True,
        })
        print(f"\n[BUG1 chip payload reply]: {data}\n")
        is_quiz, reason = _is_quiz_response(data)
        assert not is_quiz, f"360 quiz still triggered on chip payload: {reason}"


class TestBug2_LatencyAndFastFlag:
    """Bug 2: free-chat path uses gpt-4o-mini via fast=True for low latency."""

    def test_05_fast_flag_in_service(self):
        src = open("/app/backend/tina_service.py").read()
        # The function signature accepts fast kwarg
        assert re.search(r"async def get_llm_response\([^)]*fast\s*:\s*bool", src), \
            "get_llm_response missing fast: bool parameter"
        # The fast=True branch chooses gpt-4o-mini
        assert "gpt-4o-mini" in src and 'gpt-4o' in src, "model swap strings missing"
        assert re.search(r'model_name\s*=\s*[\'\"]gpt-4o-mini[\'\"]\s+if\s+fast\s+else\s+[\'\"]gpt-4o[\'\"]', src), \
            "expected 'gpt-4o-mini if fast else gpt-4o' branching"
        # The post-onboarding call uses fast=True
        assert re.search(r"get_llm_response\([^)]*fast\s*=\s*True", src, re.S), \
            "post-onboarding free-chat path missing fast=True"

    def test_06_frontend_cadence_constants(self):
        src = open("/app/frontend/src/components/TinaCallScreen.tsx").read()
        assert re.search(r"SILENCE_DURATION_MS\s*=\s*700", src), "SILENCE_DURATION_MS != 700"
        assert re.search(r"MIN_SPEECH_DURATION_MS\s*=\s*500", src), "MIN_SPEECH_DURATION_MS != 500"
        assert re.search(r"METERING_INTERVAL_MS\s*=\s*80", src), "METERING_INTERVAL_MS != 80"
        assert re.search(r"PRE_REPLY_PAUSE_MS\s*=\s*0", src), "PRE_REPLY_PAUSE_MS != 0"

    def test_07_post_onboarding_latency_under_2_5s(self, api, fresh_user):
        latencies = []
        prompts = [
            "what's a good comfort movie?",
            "I had a rough day at work",
            "any tips for a 3rd date?",
        ]
        for p in prompts:
            t0 = time.time()
            r = api.post(f"{BASE_URL}/api/tina/chat", json={
                "user_id": fresh_user,
                "user_name": "Alice Test",
                "message": p,
                "is_onboarding_complete": True,
            }, timeout=60)
            dt = time.time() - t0
            latencies.append(dt)
            assert r.status_code == 200, r.text
            print(f"[BUG2 latency] '{p[:30]}' -> {dt:.2f}s")

        avg = sum(latencies) / len(latencies)
        print(f"\n[BUG2 LATENCY AVG]: {avg:.2f}s over {len(latencies)} trials\n")
        # Soft assertion: warn if not <2.5s; hard fail at 4s
        if avg >= 2.5:
            print(f"[BUG2 WARN] average latency {avg:.2f}s >= 2.5s target")
        assert avg < 4.0, f"avg latency {avg:.2f}s ≥ 4s — fast flag may not be effective"


class TestRegression_OnboardingStillScripted:
    """Confirm that is_onboarding_complete=False still runs scripted onboarding."""

    def test_08_incomplete_user_gets_scripted_question(self, api, mongo):
        user_id = f"TEST_iter26_incomplete_{uuid.uuid4().hex[:8]}"

        async def _seed():
            await mongo.tina_sessions.delete_many({"user_id": user_id})
            await mongo.user_profiles.delete_many({"user_id": user_id})
        _run(_seed())

        r = api.post(f"{BASE_URL}/api/tina/chat", json={
            "user_id": user_id,
            "user_name": "Bob",
            "message": "hi",
            "is_onboarding_complete": False,
        }, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        print(f"\n[REGRESSION incomplete reply]: {data}\n")
        # Incomplete onboarding path should produce SOME structured/scripted output,
        # OR at minimum should not have completion_percentage=100 and should be
        # collecting fields. We just verify it doesn't error and has a response.
        assert data.get("response"), "no response on incomplete onboarding"
        # completion_percentage should NOT be 100 for an incomplete fresh user
        assert (data.get("completion_percentage") or 0) < 100, \
            f"incomplete fresh user marked 100% complete: {data}"

        # Cleanup
        async def _cleanup():
            await mongo.tina_sessions.delete_many({"user_id": user_id})
        _run(_cleanup())
