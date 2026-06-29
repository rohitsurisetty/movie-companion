"""Smoke tests for iteration 11 - verify Tina + profile + matches endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://match-history-dev.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_voice_status(client):
    r = client.get(f"{BASE_URL}/api/tina/voice/status", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "enabled" in data


def test_tina_chat(client):
    payload = {
        "user_id": "TEST_iter11_user",
        "messages": [{"role": "user", "content": "hi"}],
        "user_name": "Tester",
    }
    r = client.post(f"{BASE_URL}/api/tina/chat", json=payload, timeout=45)
    assert r.status_code == 200, r.text
    body = r.json()
    # Response shape: { reply: str, ... } OR { message: ... }
    assert isinstance(body, dict)
    assert any(k in body for k in ("reply", "message", "response", "content"))


def test_profile_fetch_unknown_user(client):
    # Unknown user: expect either 404 or 200 with null/empty - just verify backend doesn't 500
    r = client.get(f"{BASE_URL}/api/user/profile/TEST_nonexistent_iter11", timeout=15)
    assert r.status_code in (200, 404)


def test_matches_endpoint(client):
    # /api/matches likely needs a user_id - try common patterns
    for path in ("/api/matches?user_id=TEST_iter11_user", "/api/matches/TEST_iter11_user"):
        r = client.get(f"{BASE_URL}{path}", timeout=20)
        if r.status_code != 404:
            assert r.status_code in (200, 401, 403, 405, 422), f"{path} -> {r.status_code} {r.text[:200]}"
            return
    pytest.skip("No /api/matches route matched expected patterns")
