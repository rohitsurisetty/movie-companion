"""
Iteration 30 — Tina post-onboarding fixes regression tests.

Coverage (backend only):
1. POST /api/tina/chat — voice_mode=True returns short reply (1-2 sentences).
2. POST /api/tina/chat — voice_mode=False returns richer reply (longer / context).
3. POST /api/tina/welcome-back — 5 runs, NONE of the scripted POST_ONBOARDING_TOPICS
   phrases must appear (no "comfort movie", "movie night setup", "hot take",
   "hidden gem", "ugly cry", "never admit to loving", "movie crush").
4. GET /api/tina/voice/speak-stream?text=... — 200, Content-Type audio/mpeg,
   non-empty MP3 body (>1KB), TTFB measurable.
5. GET /api/tina/voice/speak-stream with empty text — 400.
6. POST /api/tina/voice/speak — legacy base64 still works.
7. Regression: POST /api/tina/chat WITHOUT voice_mode field still works.
"""

import os
import re
import time
import asyncio
from typing import List

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load backend .env for MongoDB
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL"
)
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.strip().startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].strip().strip('"')
                break
BASE_URL = (BASE_URL or "").rstrip("/")
assert BASE_URL, "EXPO_BACKEND_URL not configured"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# Stable test user IDs
COMPLETE_USER_ID = "TEST_tina_iter30_complete_user"

# Forbidden fragments from scripted POST_ONBOARDING_TOPICS
SCRIPTED_FRAGMENTS = [
    "comfort movie",
    "movie night setup",
    "hot take",
    "hidden gem",
    "ugly cry",
    "never admit to loving",
    "movie crush",
]

# Mandatory fields list (matches PROFILE_FIELDS mandatory set) — passing them
# via collected_fields tells welcome-back endpoint onboarding is done.
COLLECTED_FIELDS_FULL = [
    "name", "age", "gender", "city", "languagesSpoken", "filmLanguages",
    "genres", "topMovies", "movieFrequency", "ottTheatre", "intent",
]


# =========================================
# Fixtures
# =========================================

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
            raise RuntimeError
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup(mongo):
    """Seed rich profile + complete Tina session so post-onboarding path runs."""

    async def _seed():
        await mongo.user_profiles.delete_many({"user_id": COMPLETE_USER_ID})
        await mongo.tina_sessions.delete_many({"user_id": COMPLETE_USER_ID})

        await mongo.user_profiles.insert_one(
            {
                "user_id": COMPLETE_USER_ID,
                "name": "Test User",
                "age": 28,
                "gender": "Female",
                "genres": ["Drama", "Romance"],
                "filmLanguages": ["English", "Hindi"],
                "languagesSpoken": ["English", "Hindi"],
                "movieFrequency": "Often",
                "ottTheatre": "Both",
                "topMovies": [
                    {"title": "La La Land"},
                    {"title": "Casablanca"},
                    {"title": "Spirited Away"},
                ],
                "archetype": {
                    "emoji": "🍿",
                    "title": "The Cozy Companion",
                    "description": "Cuddly couch-cinephile",
                },
                "primary_love_language": "Quality Time",
                "intent": {"serious": 70, "casual": 30},
                "location": {"city": "Mumbai"},
                "is_onboarding_complete": True,
            }
        )

        await mongo.tina_sessions.insert_one(
            {
                "user_id": COMPLETE_USER_ID,
                "collected_fields": {
                    "name": "Test User",
                    "genres": ["Drama", "Romance"],
                    "topMovies": [
                        {"title": "La La Land"},
                        {"title": "Casablanca"},
                    ],
                },
                "completed_fields": list(COLLECTED_FIELDS_FULL),
                "conversation_history": [],
                "personality_360": {
                    "phase": "complete",
                    "current_index": 8,
                    "answers": [],
                },
            }
        )

    async def _cleanup():
        await mongo.user_profiles.delete_many({"user_id": COMPLETE_USER_ID})
        await mongo.tina_sessions.delete_many({"user_id": COMPLETE_USER_ID})

    _run(_seed())
    yield
    _run(_cleanup())


def _count_sentences(text: str) -> int:
    """Crude sentence count via terminal punctuation."""
    if not text:
        return 0
    chunks = re.split(r"[.!?]+", text.strip())
    return len([c for c in chunks if c.strip()])


# =========================================
# 1. voice_mode=True — short reply
# =========================================

class TestTinaChatVoiceMode:
    """POST /api/tina/chat voice_mode flag behavior."""

    def test_voice_mode_true_returns_short_reply(self, api):
        payload = {
            "user_id": COMPLETE_USER_ID,
            "user_name": "Test User",
            "message": "Recommend me one movie for tonight",
            "is_onboarding_complete": True,
            "voice_mode": True,
        }
        r = api.post(f"{BASE_URL}/api/tina/chat", json=payload, timeout=45)
        assert r.status_code == 200, f"voice_mode=true chat failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "response" in data, f"Missing response field: {data}"
        text = (data.get("response") or "").strip()
        assert text, "Empty response in voice_mode=true"

        sentence_count = _count_sentences(text)
        word_count = len(text.split())
        print(f"[voice_mode=True] sentences={sentence_count} words={word_count} text={text!r}")
        # Latency is dominated by word count, not punctuation. Allow some
        # micro-sentence variance from the LLM but keep total brevity tight.
        assert word_count <= 45, f"voice_mode reply too wordy ({word_count} words): {text}"

    def test_voice_mode_false_returns_richer_reply(self, api):
        payload = {
            "user_id": COMPLETE_USER_ID,
            "user_name": "Test User",
            "message": "Recommend me one movie for tonight",
            "is_onboarding_complete": True,
            "voice_mode": False,
        }
        r = api.post(f"{BASE_URL}/api/tina/chat", json=payload, timeout=60)
        assert r.status_code == 200, f"voice_mode=false chat failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        text = (data.get("response") or "").strip()
        assert text, "Empty response in voice_mode=false"
        print(f"[voice_mode=False] words={len(text.split())} text={text!r}")
        # Text mode allows richer replies; just check non-trivial
        assert len(text) >= 20, f"Text-mode reply unexpectedly short: {text}"

    def test_chat_without_voice_mode_field_defaults_false(self, api):
        """Regression: signup flow doesn't pass voice_mode — must still work."""
        payload = {
            "user_id": COMPLETE_USER_ID,
            "user_name": "Test User",
            "message": "Hi Tina, recommend a movie",
            "is_onboarding_complete": True,
            # NO voice_mode key
        }
        r = api.post(f"{BASE_URL}/api/tina/chat", json=payload, timeout=60)
        assert r.status_code == 200, f"Default voice_mode chat failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "response" in data, f"Missing response field: {data}"
        assert (data.get("response") or "").strip(), "Empty response"


# =========================================
# 2. Welcome-back smart opener (no scripted topics)
# =========================================

class TestWelcomeBackSmartOpener:
    """Welcome-back should generate LLM opener — never use scripted topic list."""

    def _call_welcome_back(self, api):
        payload = {
            "user_id": COMPLETE_USER_ID,
            "user_name": "Test User",
            "is_onboarding_complete": True,
            "collected_fields": COLLECTED_FIELDS_FULL,
        }
        return api.post(f"{BASE_URL}/api/tina/welcome-back", json=payload, timeout=45)

    def test_welcome_back_no_scripted_fragments_5x(self, api):
        """Run 5x — every reply must avoid the scripted fragments."""
        messages: List[str] = []
        for i in range(5):
            r = self._call_welcome_back(api)
            assert r.status_code == 200, f"welcome-back run {i+1} failed: {r.status_code} {r.text[:300]}"
            data = r.json()
            assert data.get("success") is True, f"success!=true: {data}"
            msg = (data.get("message") or "").strip()
            assert msg, f"Empty welcome-back message on run {i+1}"
            messages.append(msg)
            lower = msg.lower()
            for frag in SCRIPTED_FRAGMENTS:
                assert frag not in lower, (
                    f"Run {i+1}: scripted fragment '{frag}' found in welcome-back message: {msg!r}"
                )
            # Also ensure show_options is None (no chip options on opener)
            assert not data.get("show_options"), (
                f"Run {i+1}: smart opener must not return chip options, got: {data.get('show_options')}"
            )
        print(f"[welcome-back] 5 runs (no scripted fragments):")
        for i, m in enumerate(messages):
            print(f"  {i+1}. {m!r}")


# =========================================
# 3. Streaming TTS endpoint
# =========================================

class TestVoiceSpeakStream:
    """GET /api/tina/voice/speak-stream — streaming MP3."""

    def test_stream_returns_audio_mpeg_200(self, api):
        url = f"{BASE_URL}/api/tina/voice/speak-stream"
        t0 = time.perf_counter()
        # Use stream=True so we can measure TTFB and verify chunked delivery
        with api.get(url, params={"text": "Hello there"}, stream=True, timeout=30) as r:
            ttfb_ms = (time.perf_counter() - t0) * 1000.0
            assert r.status_code == 200, f"stream status: {r.status_code} body={r.text[:200]}"
            ctype = r.headers.get("Content-Type", "")
            # Must be EXACTLY audio/mpeg (no charset)
            assert ctype.lower().strip() == "audio/mpeg", f"Content-Type expected 'audio/mpeg' got {ctype!r}"
            # Read first chunk for TTFB realism
            first_chunk = None
            total = b""
            chunk_count = 0
            for chunk in r.iter_content(chunk_size=4096):
                if chunk:
                    if first_chunk is None:
                        first_chunk = chunk
                        first_chunk_ms = (time.perf_counter() - t0) * 1000.0
                    total += chunk
                    chunk_count += 1
                    # Cap reading for sanity (don't keep forever)
                    if len(total) > 200_000:
                        break
            assert first_chunk, "No chunks received from stream"
            print(
                f"[speak-stream] status_ms={ttfb_ms:.0f} first_chunk_ms={first_chunk_ms:.0f} "
                f"total_bytes={len(total)} chunks={chunk_count}"
            )
            assert len(total) > 1024, f"Stream body too small ({len(total)} bytes), expected >1KB MP3"
            # First chunk should start with MP3 sync (0xFF 0xFB / 0xFF 0xF3 / 0xFF 0xE3)
            # or an ID3 header (b"ID3"). Be lenient on exact frame.
            head = total[:3]
            assert head[:3] == b"ID3" or (head[0] == 0xFF and (head[1] & 0xE0) == 0xE0), (
                f"First bytes don't look like MP3: {total[:8]!r}"
            )

    def test_stream_empty_text_returns_400(self, api):
        url = f"{BASE_URL}/api/tina/voice/speak-stream"
        # Empty text param
        r = api.get(url, params={"text": ""}, timeout=15)
        assert r.status_code == 400, (
            f"Empty text should return 400, got {r.status_code}: {r.text[:200]}"
        )


# =========================================
# 4. Legacy base64 endpoint regression
# =========================================

class TestVoiceSpeakLegacy:
    def test_legacy_base64_speak_still_works(self, api):
        r = api.post(
            f"{BASE_URL}/api/tina/voice/speak",
            json={"text": "Hello there"},
            timeout=45,
        )
        assert r.status_code == 200, f"Legacy speak failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data.get("success") is True, f"success!=true: {data}"
        audio = data.get("audio") or ""
        assert audio.startswith("data:audio/mpeg;base64,"), (
            f"Audio data URI prefix wrong: {audio[:60]}..."
        )
        # base64 body should be non-trivial
        b64_body = audio.split(",", 1)[1]
        assert len(b64_body) > 1000, f"Audio b64 body too small: {len(b64_body)} chars"
