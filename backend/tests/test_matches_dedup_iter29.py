"""Iter-29 backend-only test: /api/matches must never return duplicate user_ids.

Validates the two-layer dedup fix shipped in:
  - matchmaking_service.py:get_matches_for_user (raw_candidates → seen_ids dedup)

Tests:
  1. Sanity — GET /api/ → 200.
  2. Dedup contract — /api/matches response.matches has zero duplicate user_ids.
  3. Limit contract — default limit=20 returns ≤20 unique matches.
  4. Induced-duplicate — monkey-patch get_all_real_users so its first entry
     collides with mock_user_001. The endpoint must STILL return unique ids.
  5. is_bot flag preserved — dedup must not strip the flag.
"""

import os
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")
API = f"{BASE_URL}/api"


# ===================== Helpers =====================

def _fresh_user_id() -> str:
    """Return a user_id that has no DB profile — endpoint will default-profile it."""
    return f"user_{uuid.uuid4().hex[:12]}"


def _post_matches(user_id: str, *, limit: int = 200, mode: str = "date",
                  force_refresh: bool = True) -> dict:
    r = requests.post(
        f"{API}/matches",
        json={"user_id": user_id, "mode": mode,
              "force_refresh": force_refresh, "limit": limit},
        timeout=120,
    )
    assert r.status_code == 200, f"/matches {r.status_code}: {r.text}"
    return r.json()


# ===================== Tests =====================

# 1. SANITY
def test_api_root_200():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert "message" in r.json()


# 2. DEDUP CONTRACT
def test_matches_response_has_unique_user_ids():
    """Core regression: /api/matches must not emit duplicate user_id entries."""
    uid = _fresh_user_id()
    data = _post_matches(uid, limit=200)
    matches = data.get("matches") or []
    assert isinstance(matches, list)
    assert len(matches) > 0, "no matches returned at all"

    ids = [m.get("user_id") for m in matches]
    # Filter Nones (shouldn't exist but defensive)
    ids = [i for i in ids if i]
    assert len(ids) == len(set(ids)), (
        f"DUPLICATE user_ids in /matches response: "
        f"{[i for i in ids if ids.count(i) > 1]}"
    )


# 3. LIMIT CONTRACT — default limit=20 → ≤20 unique
def test_matches_default_limit_capped_at_20_and_unique():
    uid = _fresh_user_id()
    r = requests.post(
        f"{API}/matches",
        json={"user_id": uid, "mode": "date", "force_refresh": True},
        timeout=120,
    )
    assert r.status_code == 200
    matches = r.json().get("matches") or []
    assert len(matches) <= 20, f"expected ≤20 matches, got {len(matches)}"
    ids = [m.get("user_id") for m in matches if m.get("user_id")]
    assert len(ids) == len(set(ids)), "duplicates in default-limit response"


# 4. INDUCED DUPLICATE — directly exercise get_matches_for_user with a
# monkey-patched real-user fetcher that COLLIDES with a known bot id.
def test_induced_duplicate_is_deduped_by_backend(monkeypatch, capsys):
    """If get_all_real_users returns a doc with user_id='mock_user_001',
    the merged candidate pool must still produce a unique-id final list."""
    import asyncio
    import sys
    sys.path.insert(0, "/app/backend")
    import matchmaking_service as mm

    # Confirm bot pool exists — pick a real bot id to collide with.
    bots = mm.get_all_mock_users()
    assert bots, "bot pool is empty"

    # Craft a fake "real" user that aliases the bot id.
    fake_real = dict(bots[0])
    fake_real["is_bot"] = False  # pretend real

    async def fake_get_all_real_users(*, exclude_user_id=None, limit=200):
        return [fake_real]

    monkeypatch.setattr(mm, "get_all_real_users", fake_get_all_real_users)

    test_user = _fresh_user_id()

    async def _run():
        await mm.invalidate_user_cache(test_user)
        return await mm.get_matches_for_user(
            user_id=test_user,
            user_profile=None,
            filters=None,
            use_mock_data=True,
            force_refresh=True,
            mode="date",
            top_n=200,
        )

    matches = asyncio.run(_run())

    ids = [m.get("user_id") for m in matches if m.get("user_id")]
    assert len(ids) == len(set(ids)), (
        f"INDUCED duplicate leaked through dedup! ids={ids}"
    )

    # The collision was real, so dedup must have logged the drop.
    out = capsys.readouterr().out
    assert "dropped" in out and "duplicate user_ids" in out, (
        f"expected dedup-drop log, didn't see it. stdout={out!r}"
    )


# 5. is_bot FLAG PRESERVED
def test_is_bot_flag_present_after_dedup():
    uid = _fresh_user_id()
    data = _post_matches(uid, limit=200)
    matches = data.get("matches") or []
    assert matches, "no matches returned"

    missing_flag = [m.get("user_id") for m in matches if "is_bot" not in m]
    assert not missing_flag, (
        f"is_bot flag missing on {len(missing_flag)} match(es): {missing_flag[:5]}"
    )

    # Verify mock_user_* are flagged True, others False.
    bad = []
    for m in matches:
        mid = m.get("user_id") or ""
        flag = m.get("is_bot")
        if mid.startswith("mock_user_"):
            if flag is not True:
                bad.append(f"bot {mid} is_bot={flag}")
        else:
            if flag is not False:
                bad.append(f"real {mid} is_bot={flag}")
    assert not bad, "is_bot inconsistencies: " + "; ".join(bad)
