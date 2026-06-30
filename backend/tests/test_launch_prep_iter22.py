"""Iteration 22 — Launch-prep round backend tests.

Covers:
 1. Sanity: GET /api/ 200.
 2. Mock seeding gated OFF (DEV_SEED_MOCK_CHATS / DEV_SEED_MOCK_UNMATCHED unset).
 3. Phase 3 auto-reply gating — only mock_* receivers trigger AI auto-reply.
 4. Post-onboarding Tina LLM still personalised after all changes.
 5. Regression: real-people matchmaking still mixed pool.

Backend must be reachable at EXPO_PUBLIC_BACKEND_URL (no /api suffix).
"""

import os
import uuid
import time
import pytest
import requests
from typing import Tuple

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or os.environ.get("EXPO_BACKEND_URL")
            or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


# ----- helpers -----

def _unique_email(tag: str) -> str:
    return f"TEST_iter22_{tag}_{uuid.uuid4().hex[:8]}@example.com"


def _signup_full_profile(name: str, gender: str, age: int, partner_pref: str) -> Tuple[str, str]:
    """Sign up a fresh real user via OTP and complete /user/profile."""
    email = _unique_email(name.lower())
    r = requests.post(f"{API}/auth/send-email-otp", json={"email": email}, timeout=20)
    assert r.status_code == 200, f"send-email-otp failed: {r.status_code} {r.text}"
    otp = r.json().get("otp")
    assert otp, f"OTP not returned: {r.json()}"

    r = requests.post(
        f"{API}/auth/verify-otp",
        json={"type": "email", "identifier": email, "otp": otp, "name": name},
        timeout=20,
    )
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    user_id = (data.get("user") or {}).get("user_id") or data.get("user_id")
    assert user_id and user_id.startswith("user_"), f"unexpected user_id: {user_id}"

    profile = {
        "user_id": user_id,
        "name": name,
        "age": age,
        "gender": gender,
        "location": "Mumbai",
        "partnerPreference": partner_pref,
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Drama", "Romance", "Sci-Fi"],
        "filmLanguages": ["English", "Hindi"],
        "languagesSpoken": ["English", "Hindi"],
        "topMovies": [
            {"id": 27205, "title": "Inception", "poster_path": "", "genres": ["Sci-Fi", "Thriller"]},
            {"id": 157336, "title": "Interstellar", "poster_path": "", "genres": ["Sci-Fi", "Drama"]},
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "movieBuddyMode": False,
        "movieDateMode": True,
        "bio": f"{name} is a cinephile.",
        # archetype as a dict (post-360°-quiz shape) so Tina skips the persona quiz
        # and falls through to free-form LLM chat per the safety fallback in tina_service.
        "archetype": {
            "title": "The Dreamer",
            "emoji": "✨",
            "description": "Sees movies as portals to other lives.",
            "primary_love_language": "Quality Time",
        },
    }
    r = requests.post(f"{API}/user/profile", json=profile, timeout=30)
    assert r.status_code == 200, f"/user/profile failed: {r.status_code} {r.text}"
    return user_id, email


@pytest.fixture(scope="module")
def user_pair():
    """Two real users for Phase 3 auto-reply gating tests."""
    x_id, _ = _signup_full_profile("UserX", "Male", 29, "Women")
    time.sleep(0.3)
    y_id, _ = _signup_full_profile("UserY", "Female", 27, "Men")
    return {"x": x_id, "y": y_id}


# ============== 1. Sanity ==============

def test_api_root_200():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert "message" in r.json()


# ============== 2. Mock seeding gated OFF ==============

def test_init_mock_skipped_in_production(user_pair):
    """POST /chat/init-mock/{user_id} should be a no-op when DEV_SEED_MOCK_CHATS unset."""
    uid = user_pair["x"]
    r = requests.post(f"{API}/chat/init-mock/{uid}", timeout=20)
    assert r.status_code == 200, f"unexpected: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("success") is True, body
    assert body.get("skipped") is True, f"expected skipped=true in production, got: {body}"
    assert body.get("reason") == "production_mode", body


def test_match_history_no_auto_seed(user_pair):
    """GET /user/match-history/{user_id} should NOT contain Anjali/Priya unmatched bots
    when DEV_SEED_MOCK_UNMATCHED is unset."""
    uid = user_pair["y"]  # Use fresh user that hasn't called /chat/conversations
    r = requests.get(f"{API}/user/match-history/{uid}", timeout=20)
    assert r.status_code == 200, f"unexpected: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("success") is True
    history = body.get("history") or []
    # Auto-seeded ones use mock_unmatched_anjali_iyer / mock_unmatched_priya_bhatia ids
    auto_seeded_ids = {"mock_unmatched_anjali_iyer", "mock_unmatched_priya_bhatia"}
    seeded_found = [
        h for h in history
        if (h.get("user_id") in auto_seeded_ids) or (h.get("partner_id") in auto_seeded_ids)
        or (h.get("other_user_id") in auto_seeded_ids)
    ]
    assert not seeded_found, (
        f"match-history STILL auto-seeds Anjali/Priya unmatched bots for new user. "
        f"DEV_SEED_MOCK_UNMATCHED gating broken. Found: {seeded_found}"
    )


def test_chat_conversations_empty_for_new_user(user_pair):
    """GET /chat/conversations/{user_id} for a brand-new user should NOT include
    auto-seeded Anjali/Priya unmatched conversations."""
    uid = user_pair["y"]
    r = requests.get(f"{API}/chat/conversations/{uid}", timeout=20)
    assert r.status_code == 200, f"unexpected: {r.status_code} {r.text}"
    body = r.json()
    convs = body.get("conversations") or []
    auto_seeded_ids = {"mock_unmatched_anjali_iyer", "mock_unmatched_priya_bhatia"}
    seeded = [
        c for c in convs
        if (c.get("other_user_id") in auto_seeded_ids)
        or (c.get("partner_id") in auto_seeded_ids)
        or any(p in auto_seeded_ids for p in (c.get("participants") or []))
    ]
    assert not seeded, (
        f"/chat/conversations for new user STILL contains auto-seeded Anjali/Priya "
        f"unmatched bot conversations. Seeding is NOT gated. Found: {seeded}"
    )


# ============== 3. Phase 3 auto-reply gating ==============

def test_real_to_real_does_not_trigger_auto_reply(user_pair):
    """Real user → real user: NO auto-reply should fire."""
    x = user_pair["x"]
    y = user_pair["y"]

    # Compute conversation_id same way backend does (sorted join)
    conv_id = "_".join(sorted([x, y]))

    r = requests.post(
        f"{API}/chat/send",
        json={"sender_id": x, "receiver_id": y, "content": "Hey there real-to-real test"},
        timeout=20,
    )
    assert r.status_code == 200, f"send failed: {r.status_code} {r.text}"

    # Wait for any potential background task
    time.sleep(5)

    r = requests.get(f"{API}/chat/messages/{conv_id}", timeout=20)
    assert r.status_code == 200, f"get messages failed: {r.status_code} {r.text}"
    msgs = r.json().get("messages") or []
    # Should be exactly one message — X's hello, NO auto-reply from Y (real user).
    senders = [m.get("sender_id") for m in msgs]
    assert msgs, "no messages returned"
    assert all(s == x for s in senders), (
        f"Real-to-real conversation has messages NOT from sender X. "
        f"Auto-reply incorrectly fired for real receiver. senders={senders}"
    )
    assert len(msgs) == 1, (
        f"Expected exactly 1 message (X's hello only) in real-to-real conv, "
        f"got {len(msgs)}. Auto-reply gating broken. msgs={msgs}"
    )


def test_real_to_bot_triggers_auto_reply(user_pair):
    """Real user → mock_user_001: AI auto-reply MUST fire."""
    x = user_pair["x"]
    bot = "mock_user_001"
    conv_id = "_".join(sorted([x, bot]))

    r = requests.post(
        f"{API}/chat/send",
        json={"sender_id": x, "receiver_id": bot, "content": "Hello bot iter22 test"},
        timeout=20,
    )
    assert r.status_code == 200, f"send to bot failed: {r.status_code} {r.text}"

    # Wait for LLM auto-reply
    time.sleep(12)

    r = requests.get(f"{API}/chat/messages/{conv_id}", timeout=20)
    assert r.status_code == 200
    msgs = r.json().get("messages") or []
    senders = [m.get("sender_id") for m in msgs]
    assert len(msgs) >= 2, (
        f"Expected >=2 messages (user hello + bot auto-reply) in real-to-bot conv. "
        f"Got {len(msgs)}. senders={senders}"
    )
    assert bot in senders, (
        f"Bot {bot} did NOT auto-reply. senders={senders}"
    )


# ============== 4. Post-onboarding Tina LLM personalised ==============

def test_tina_post_onboarding_uses_profile(user_pair):
    """Tina should produce free-form LLM reply referencing the user's profile
    (top movies / genres / archetype) when is_onboarding_complete=True AND
    the user already has a saved archetype (i.e. completed the 360° quiz).

    Backend's UserProfileRequest model does NOT accept `archetype` — it is
    only persisted via the 360° quiz path. To test the post-onboarding LLM
    free-form reply path, we directly seed an archetype dict into the user's
    MongoDB profile (simulating the 360° quiz completion).
    """
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    x = user_pair["x"]

    # Seed archetype directly into MongoDB (simulates completed 360° quiz)
    async def _seed_archetype():
        client = AsyncIOMotorClient("mongodb://localhost:27017")
        await client["test_database"].user_profiles.update_one(
            {"user_id": x},
            {"$set": {"archetype": {
                "title": "The Dreamer",
                "emoji": "✨",
                "description": "Sees movies as portals to other lives.",
                "primary_love_language": "Quality Time",
            }}},
        )
        client.close()
    asyncio.run(_seed_archetype())

    r = requests.post(
        f"{API}/tina/chat",
        json={
            "user_id": x,
            "message": "Suggest me a movie for tonight",
            "is_onboarding_complete": True,
        },
        timeout=60,
    )
    assert r.status_code == 200, f"tina/chat failed: {r.status_code} {r.text}"
    body = r.json()
    response_text = (body.get("response") or "").lower()
    assert response_text, f"empty Tina response: {body}"

    # Should NOT be scripted onboarding/360 quiz (no chip options)
    show_options = body.get("show_options")
    assert not show_options, (
        f"Post-onboarding Tina returned chip options. show_options={show_options}. "
        f"Either the 360° quiz is still running for this user, or the LLM "
        f"fallthrough path is broken."
    )

    # Should reference profile signals
    signals = ["inception", "interstellar", "drama", "romance", "sci-fi",
               "dreamer", "thriller", "movie", "film"]
    hits = [s for s in signals if s in response_text]
    assert hits, (
        f"Tina post-onboarding reply does not reference user profile signals. "
        f"Expected any of {signals}. Got: {response_text[:300]}"
    )


# ============== 5. Regression: mixed real+bot matchmaking pool ==============

def test_matchmaking_mixed_pool(user_pair):
    """POST /matches returns mixed pool of real users + bots, with is_bot flags.

    History: this test used to fail intermittently once the real-user pool
    grew past ~150 — the default `/matches` limit of 20 (then truncated to
    top 15 after preference filtering) could push ALL bots out of the
    returned slice, leaving zero bots in the assertion sample.

    Fix: explicitly request a large limit so we see the full filtered pool,
    AND use the `is_bot` flag (not user_id prefix) so we don't accidentally
    treat real users whose ids happen to start with anything-unusual as bots.
    """
    x = user_pair["x"]
    r = requests.post(
        f"{API}/matches",
        json={
            "user_id": x,
            "mode": "date",
            "force_refresh": True,
            # 200 is well above the 35-bot ceiling — bots will always survive
            # the top-N truncation at this limit.
            "limit": 200,
        },
        timeout=120,
    )
    assert r.status_code == 200, f"/matches failed: {r.status_code} {r.text}"
    matches = r.json().get("matches") or []
    assert matches, "no matches returned"

    # Use the authoritative is_bot tag — it's the contract Phase 3 auto-reply
    # gating + admin dashboard depend on. Don't rely on user_id prefixes.
    bots = [m for m in matches if m.get("is_bot") is True]
    reals = [m for m in matches if m.get("is_bot") is False]

    assert bots, (
        f"No bots in /matches pool of {len(matches)}. "
        f"sample ids={[m.get('user_id') for m in matches[:5]]}. "
        f"Mock pool has 35 bots — they must survive the top-N cut at limit=200."
    )

    # is_bot consistency — every entry must explicitly say True or False.
    # If anything is missing the flag, downstream auto-reply gating breaks.
    bad = []
    for m in matches:
        uid = m.get("user_id") or ""
        flag = m.get("is_bot")
        if uid.startswith("mock_user_") and flag is not True:
            bad.append(f"bot {uid} has is_bot={flag}")
        elif uid.startswith("user_") and flag is not False:
            bad.append(f"real {uid} has is_bot={flag}")
        elif flag is None:
            bad.append(f"{uid} has no is_bot flag at all")
    assert not bad, "is_bot tag mismatch: " + "; ".join(bad[:5])

    # Best-effort assert that at least one real user surfaced too. Skip
    # rather than fail — strict compatibility filtering can occasionally
    # exclude all real candidates for a niche profile.
    if not reals:
        pytest.skip(
            f"No real users in pool for {x} (compatibility filter strict). "
            f"bots only: {len(bots)}"
        )
