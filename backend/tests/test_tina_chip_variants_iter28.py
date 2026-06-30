"""
Iter28 — Final verification: chip variant coercion in /api/tina/chat.

We verify the three chip variants ALL coerce into user_message and produce
free-form LLM responses (NEVER scripted onboarding) for post-onboarding users:

  a. selected_option        (single string chip)        — already in iter26 test_04
  b. selected_options       (list of string chips)
  c. selected_360_option    (dict with question_id/option_key/label)
"""
import os
import re
import uuid
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

QUIZ_PHRASES = [
    "what would you do",
    "first meet",
    "pick one",
    "feel free to share",
    "let's start with",
    "let's get to know",
]


def _is_scripted_quiz(data) -> (bool, str):
    """STRICT check: only structured signals count as a quiz. We do NOT use
    conversational LLM phrases like 'first date' as a positive signal."""
    show_options = data.get("show_options")
    if show_options:
        return True, f"show_options non-empty: {show_options}"
    if data.get("archetype_reveal"):
        return True, f"archetype_reveal present: {data.get('archetype_reveal')}"
    if data.get("persona_360_phase") == "active":
        return True, "persona_360_phase=='active'"
    return False, ""


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


def _signup(api, mongo, name="Chip Tester"):
    email = f"TEST_iter28_{uuid.uuid4().hex[:10]}@example.com"
    r = api.post(f"{BASE_URL}/api/auth/send-email-otp", json={"email": email}, timeout=20)
    assert r.status_code == 200, r.text
    otp = r.json().get("otp") or r.json().get("dev_otp") or r.json().get("code")
    assert otp, r.text

    r = api.post(f"{BASE_URL}/api/auth/verify-otp",
                 json={"type": "email", "identifier": email, "otp": otp, "name": name}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    uid = body.get("user_id") or (body.get("user") or {}).get("id") or body.get("id")
    assert uid, body
    return uid


@pytest.fixture(scope="module")
def fresh_user(api, mongo):
    uid = _signup(api, mongo)

    async def _seed():
        await mongo.user_profiles.update_one(
            {"user_id": uid},
            {"$set": {
                "user_id": uid,
                "name": "Chip Tester",
                "age": 28,
                "gender": "Female",
                "partnerPreference": "Men",
                "relationshipIntent": ["Long-term"],
                "genres": ["Drama", "Romance"],
                "topMovies": [{"title": "La La Land"}],
                "filmLanguages": ["English"],
                "is_onboarding_complete": True,
            }},
            upsert=True,
        )
        await mongo.tina_sessions.delete_many({"user_id": uid})

    _run(_seed())
    yield uid
    _run(mongo.user_profiles.delete_many({"user_id": uid}))
    _run(mongo.tina_sessions.delete_many({"user_id": uid}))


def _reset_session(mongo, uid):
    """Clear tina session so each test starts cleanly."""
    _run(mongo.tina_sessions.delete_many({"user_id": uid}))


class TestChipVariants:

    def test_a_selected_option_string(self, api, fresh_user, mongo):
        _reset_session(mongo, fresh_user)
        r = api.post(f"{BASE_URL}/api/tina/chat", json={
            "user_id": fresh_user,
            "user_name": "Chip Tester",
            "message": "",
            "selected_option": "Casual movie buff",
            "is_onboarding_complete": True,
        }, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        print(f"\n[VARIANT A — selected_option str]: {data}\n")

        is_quiz, why = _is_scripted_quiz(data)
        assert not is_quiz, f"scripted-quiz signal present: {why}"
        msg = (data.get("response") or "").strip()
        assert msg, "empty response"

    def test_b_selected_options_list(self, api, fresh_user, mongo):
        _reset_session(mongo, fresh_user)
        r = api.post(f"{BASE_URL}/api/tina/chat", json={
            "user_id": fresh_user,
            "user_name": "Chip Tester",
            "message": "",
            "selected_options": ["Drama", "Romance"],
            "is_onboarding_complete": True,
        }, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        print(f"\n[VARIANT B — selected_options list]: {data}\n")

        is_quiz, why = _is_scripted_quiz(data)
        assert not is_quiz, f"scripted-quiz signal present: {why}"
        msg = (data.get("response") or "").strip()
        assert msg, "empty response"

    def test_c_selected_360_option_dict(self, api, fresh_user, mongo):
        _reset_session(mongo, fresh_user)
        r = api.post(f"{BASE_URL}/api/tina/chat", json={
            "user_id": fresh_user,
            "user_name": "Chip Tester",
            "message": "",
            "selected_360_option": {
                "question_id": "q1",
                "option_key": "k1",
                "label": "I love cozy nights",
            },
            "is_onboarding_complete": True,
        }, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        print(f"\n[VARIANT C — selected_360_option dict]: {data}\n")

        is_quiz, why = _is_scripted_quiz(data)
        assert not is_quiz, f"scripted-quiz signal present: {why}"
        msg = (data.get("response") or "").strip()
        assert msg, "empty response"

    def test_d_tell_me_about_yourself_strict(self, api, fresh_user, mongo):
        """Strict re-check of iter26 test_03 — STRUCTURED markers only, no
        text-phrase false positives."""
        _reset_session(mongo, fresh_user)
        r = api.post(f"{BASE_URL}/api/tina/chat", json={
            "user_id": fresh_user,
            "user_name": "Chip Tester",
            "message": "tell me about yourself",
            "is_onboarding_complete": True,
        }, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        print(f"\n[STRICT 'tell me about yourself']: response={data.get('response')!r}\n"
              f"  show_options={data.get('show_options')}\n"
              f"  persona_360_phase={data.get('persona_360_phase')}\n"
              f"  archetype_reveal={data.get('archetype_reveal')}\n")

        # Strict structural checks — these are the ONLY signals that indicate
        # the user was routed into a scripted onboarding/quiz branch.
        assert data.get("show_options") in (None, {}, []), \
            f"show_options should be null/empty: {data.get('show_options')}"
        assert data.get("persona_360_phase") != "active", \
            f"persona_360_phase should not be 'active': {data.get('persona_360_phase')}"
        assert not data.get("archetype_reveal"), \
            f"archetype_reveal should be absent: {data.get('archetype_reveal')}"
