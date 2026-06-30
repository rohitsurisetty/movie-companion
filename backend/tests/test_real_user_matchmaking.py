"""Phase 2 launch-prep test: real-user visibility in /api/matches.

Validates:
 - Real signed-up users (from MongoDB user_profiles) surface in match feeds.
 - Candidate pool is MIXED (real + bot) and properly tagged is_bot.
 - Recency boost — newest signup shows up in feed.
 - Global cache invalidation kicks in when a new user finishes onboarding.
 - Requesting user is excluded from their own feed.
 - System degrades gracefully (no crash) when zero real users exist.

Backend must be reachable at EXPO_BACKEND_URL (no /api suffix).
"""

import os
import uuid
import time
import pytest
import requests
from typing import Dict, Tuple

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or os.environ.get("EXPO_BACKEND_URL")
            or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def _unique_email(tag: str) -> str:
    return f"TEST_{tag}_{uuid.uuid4().hex[:8]}@example.com"


def _signup_full_profile(name: str, gender: str, age: int, partner_pref: str,
                          movie_date_mode: bool = True,
                          movie_buddy_mode: bool = False) -> Tuple[str, str]:
    """Sign up a fresh real user via OTP flow + complete /user/profile.

    Returns (user_id, email).
    """
    email = _unique_email(name.lower())

    # 1) Send OTP — backend returns OTP in test mode.
    r = requests.post(f"{API}/auth/send-email-otp", json={"email": email}, timeout=20)
    assert r.status_code == 200, f"send-email-otp failed: {r.status_code} {r.text}"
    otp = r.json().get("otp")
    assert otp, f"OTP not returned: {r.json()}"

    # 2) Verify OTP — creates user, returns user_id.
    r = requests.post(
        f"{API}/auth/verify-otp",
        json={"type": "email", "identifier": email, "otp": otp, "name": name},
        timeout=20,
    )
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    user_id = (data.get("user") or {}).get("user_id") or data.get("user_id")
    assert user_id, f"user_id missing from verify-otp response: {data}"

    # 3) POST /user/profile with the FULL payload (required by review).
    profile = {
        "user_id": user_id,
        "name": name,
        "age": age,
        "gender": gender,
        "location": "Mumbai",
        "partnerPreference": partner_pref,
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Drama", "Romance"],
        "filmLanguages": ["English", "Hindi"],
        "languagesSpoken": ["English", "Hindi"],
        "topMovies": [
            {"id": 313369, "title": "La La Land", "poster_path": "", "genres": ["Drama", "Romance"]},
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "movieBuddyMode": movie_buddy_mode,
        "movieDateMode": movie_date_mode,
        "bio": f"{name} loves cinema.",
    }
    r = requests.post(f"{API}/user/profile", json=profile, timeout=30)
    assert r.status_code == 200, f"/user/profile failed: {r.status_code} {r.text}"

    return user_id, email


@pytest.fixture(scope="module")
def seeded_users() -> Dict[str, str]:
    """Sign up Alice, Bob, Carol. Returns {alice, bob, carol} → user_id."""
    alice_id, _ = _signup_full_profile("Alice", "Female", 27, "Men")
    bob_id, _ = _signup_full_profile("Bob", "Male", 29, "Women")
    # Small gap so updated_at ordering is deterministic.
    time.sleep(0.5)
    carol_id, _ = _signup_full_profile("Carol", "Female", 26, "Men")
    return {"alice": alice_id, "bob": bob_id, "carol": carol_id}


# ===================== Tests =====================

# Sanity
def test_api_root_200():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert "message" in r.json()


# Real-user visibility & mixed pool
def test_real_user_appears_in_bobs_feed(seeded_users):
    bob = seeded_users["bob"]
    alice = seeded_users["alice"]

    r = requests.post(
        f"{API}/matches",
        json={"user_id": bob, "mode": "date", "force_refresh": True},
        timeout=120,
    )
    assert r.status_code == 200, f"/matches failed: {r.status_code} {r.text}"
    data = r.json()
    matches = data.get("matches") or []
    assert isinstance(matches, list) and len(matches) > 0, "matches list empty"

    ids = [m.get("user_id") for m in matches]
    assert alice in ids, f"Alice ({alice}) NOT in Bob's match feed. Got: {ids}"

    # Verify is_bot tagging on Alice's entry
    alice_entry = next((m for m in matches if m.get("user_id") == alice), None)
    assert alice_entry is not None
    assert alice_entry.get("is_bot") is False, (
        f"Alice entry should have is_bot=False, got: {alice_entry.get('is_bot')}"
    )

    # Mixed pool — must contain at least one bot too
    bot_ids = [i for i in ids if isinstance(i, str) and i.startswith("mock_user_")]
    assert len(bot_ids) > 0, f"Pool should be MIXED but no bots found. ids={ids}"


# Recency boost — Carol (newest) should be present
def test_recency_boost_includes_carol(seeded_users):
    bob = seeded_users["bob"]
    carol = seeded_users["carol"]

    r = requests.post(
        f"{API}/matches",
        json={"user_id": bob, "mode": "date", "force_refresh": True},
        timeout=120,
    )
    assert r.status_code == 200
    matches = r.json().get("matches") or []
    ids = [m.get("user_id") for m in matches]
    assert carol in ids, (
        f"Carol ({carol}, newest signup) NOT in Bob's feed. Recency boost broken. ids={ids}"
    )


# Exclusion — Bob never matches with himself
def test_self_exclusion(seeded_users):
    bob = seeded_users["bob"]
    r = requests.post(
        f"{API}/matches",
        json={"user_id": bob, "mode": "date", "force_refresh": True},
        timeout=120,
    )
    assert r.status_code == 200
    ids = [m.get("user_id") for m in (r.json().get("matches") or [])]
    assert bob not in ids, f"Bob ({bob}) appeared in his own match list."


# is_bot tag sanity
def test_is_bot_flag_consistency(seeded_users):
    bob = seeded_users["bob"]
    r = requests.post(
        f"{API}/matches",
        json={"user_id": bob, "mode": "date", "force_refresh": True},
        timeout=120,
    )
    assert r.status_code == 200
    matches = r.json().get("matches") or []
    assert matches, "no matches returned"

    bad = []
    for m in matches:
        uid = m.get("user_id") or ""
        flag = m.get("is_bot")
        if uid.startswith("mock_user_"):
            if flag is not True:
                bad.append(f"bot {uid} has is_bot={flag}")
        else:
            if flag is not False:
                bad.append(f"real {uid} has is_bot={flag}")
    assert not bad, "is_bot flag inconsistencies: " + "; ".join(bad)


# Cache invalidation on new signup
def test_cache_invalidation_on_new_signup(seeded_users):
    bob = seeded_users["bob"]

    # Prime cache
    r1 = requests.post(
        f"{API}/matches", json={"user_id": bob, "mode": "date"}, timeout=120
    )
    assert r1.status_code == 200

    # Sign up a brand-new user D — this MUST invalidate caches.
    dave_id, _ = _signup_full_profile("Dave", "Female", 25, "Men")

    # Same request (no force_refresh) — should now contain Dave.
    r2 = requests.post(
        f"{API}/matches", json={"user_id": bob, "mode": "date"}, timeout=120
    )
    assert r2.status_code == 200
    ids = [m.get("user_id") for m in (r2.json().get("matches") or [])]
    assert dave_id in ids, (
        f"Dave ({dave_id}) NOT in Bob's feed after fresh signup — cache invalidation broken. ids={ids}"
    )


# Regression: zero-real-users path should still return bot-only list, no crash.
def test_matches_with_no_profile_user_still_ok():
    """Call /matches with a brand-new user_id that has NO profile in DB.

    The endpoint defaults to demo profile and still returns bot candidates —
    confirming the real_users + bots union doesn't break the bot-only path.
    """
    fresh_id = f"user_{uuid.uuid4().hex[:12]}"
    r = requests.post(
        f"{API}/matches",
        json={"user_id": fresh_id, "mode": "date", "force_refresh": True},
        timeout=120,
    )
    assert r.status_code == 200, f"unexpected: {r.status_code} {r.text}"
    matches = r.json().get("matches") or []
    assert isinstance(matches, list)
    # Should have bot entries even if no real users compatible.
    bot_ids = [m.get("user_id") for m in matches if (m.get("user_id") or "").startswith("mock_user_")]
    assert len(bot_ids) > 0, "no bots returned — bot-only fallback broken"
