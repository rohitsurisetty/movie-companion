"""
End-to-end smoke test of the API with an in-memory MongoDB (mongomock-motor).

No network, no real Mongo, no OpenAI/Supabase keys: it exercises the real
FastAPI app (middleware, routes, services) the way the Android app does —
phone login with fixed test codes, profile, filters, matches, chat, privacy
and IDOR guards, photo upload without storage, and account deletion.

    pip install -r requirements-dev.txt
    cd backend && python -m pytest tests/test_api_smoke.py -q
"""

import base64
import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

# Configure BEFORE importing the app (settings are read at import time).
os.environ.update({
    "MONGO_URL": "mongodb://localhost:27017",
    "DB_NAME": "smoke_test",
    "APP_ENV": "development",
    "SMS_PROVIDER": "console",
    "TEST_OTP_NUMBERS": "+919999900001:123456,+919999900002:654321,+919999900003:111111",
    "MOCK_SEED_CHATS": "true",
    "MOCK_FEED_PROFILES": "true",
})
for key in ("OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_KEY",
            "ELEVENLABS_API_KEY", "TMDB_ACCESS_TOKEN", "GOOGLE_MAPS_API_KEY", "ADMIN_PASSWORD_HASH"):
    os.environ.pop(key, None)

mongomock_motor = pytest.importorskip("mongomock_motor")
from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402

server.db = mongomock_motor.AsyncMongoMockClient()["smoke_test"]


@pytest.fixture(scope="module")
def client():
    with TestClient(server.socket_app if hasattr(server, "socket_app") else server.app) as c:
        yield c


def _login(client, phone, code):
    r = client.post("/api/auth/send-phone-otp", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = client.post("/api/auth/verify-otp", json={"type": "phone", "identifier": phone, "otp": code})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["session_token"] and data["user_id"].startswith("user_")
    return data["user_id"], {"Authorization": f"Bearer {data['session_token']}"}


PROFILE_A = {
    "name": "Asha", "age": 25, "dob": "2000-01-01", "gender": "Woman", "partnerPreference": "Men",
    "location": "Koramangala, Bengaluru", "coordinates": {"lat": 12.93, "lng": 77.62},
    "relationshipIntent": ["Serious relationship"], "genres": ["Drama", "Sci-Fi"],
    "filmLanguages": ["Hindi", "English"], "languagesSpoken": ["English", "Hindi"],
    "movieFrequency": "Once a week", "ottTheatre": "Both OTT & Theatre", "religion": "Hindu",
    "bio": "Nolan fan", "visibilityToggles": {"religion": False},
}
PROFILE_B = {
    "name": "Ravi", "age": 27, "dob": "1998-05-05", "gender": "Man", "partnerPreference": "Women",
    "location": "Indiranagar, Bengaluru", "relationshipIntent": ["Serious relationship"],
    "genres": ["Drama", "Thriller"], "filmLanguages": ["Hindi"], "languagesSpoken": ["Hindi"],
    "movieFrequency": "Twice a week", "ottTheatre": "OTT Person",
}


def test_full_flow(client):
    # --- auth ---
    assert client.get("/api/tmdb/search", params={"query": "x"}).status_code == 401
    r = client.post("/api/auth/send-phone-otp", json={"phone": "+447700900123"})
    assert r.status_code == 400  # only +91 numbers
    client.post("/api/auth/send-phone-otp", json={"phone": "9999900001"})
    bad = client.post("/api/auth/verify-otp", json={"type": "phone", "identifier": "+919999900001", "otp": "000000"})
    assert bad.status_code == 401

    a_id, A = _login(client, "9999900001", "123456")
    b_id, B = _login(client, "+91 99999 00002", "654321")
    c_id, C = _login(client, "09999900003", "111111")
    me = client.get("/api/auth/me", headers=A)
    assert me.status_code == 200 and me.json()["onboarding_complete"] is False

    # --- profile: validation, privacy ---
    under18 = client.post("/api/user/profile", headers=A, json={**PROFILE_A, "dob": "2012-01-01"})
    assert under18.status_code == 400
    assert client.post("/api/user/profile", headers=A, json={**PROFILE_A, "user_id": b_id}).status_code == 200
    assert client.post("/api/user/profile", headers=B, json=PROFILE_B).status_code == 200
    assert client.get("/api/auth/me", headers=A).json()["onboarding_complete"] is True

    own = client.get(f"/api/user/profile/{a_id}", headers=A).json()["profile"]
    assert own["dob"] == "2000-01-01" and own["name"] == "Asha"
    seen_by_b = client.get(f"/api/user/profile/{a_id}", headers=B).json()["profile"]
    for private in ("dob", "coordinates", "locationFull", "phone", "email", "religion"):
        assert private not in seen_by_b, private
    # body user_id was ignored: B's profile is still B's
    assert client.get(f"/api/user/profile/{b_id}", headers=B).json()["profile"]["name"] == "Ravi"

    # --- filters ---
    f = client.post("/api/user/filters", headers=A, json={
        "distance_radius": None, "age_min": 21, "age_max": 35, "genres": ["Drama"],
        "exclusive_toggles": {"ageRange": True}, "expand_if_run_out_toggles": {"ageRange": True},
    })
    assert f.status_code == 200 and f.json()["success"] is True

    # --- matches: real users are matchable, mocks are flagged ---
    m = client.post("/api/matches", headers=A, json={"user_id": a_id, "limit": 20, "force_refresh": True, "mode": "date"})
    assert m.status_code == 200, m.text
    matches = m.json()["matches"]
    assert any(x.get("user_id") == b_id for x in matches), "real user B should be in A's feed"
    assert all("is_mock" in x for x in matches)

    # --- chat: IDOR + participation guards ---
    assert client.get(f"/api/chat/conversations/{b_id}", headers=A).status_code == 404
    assert client.post("/api/chat/send", headers=A, json={"sender_id": a_id, "receiver_id": a_id, "content": "hi"}).status_code == 400
    sent = client.post("/api/chat/send", headers=A, json={"sender_id": b_id, "receiver_id": b_id if False else b_id, "content": "Hi Ravi!"})
    # sender_id is forced to the caller (A), so this is A → B, not B → B
    assert sent.status_code == 200, sent.text
    convs = client.get(f"/api/chat/conversations/{a_id}", headers=A).json()["conversations"]
    cid = next(cv["conversation_id"] for cv in convs if (cv.get("other_user") or {}).get("user_id") == b_id)
    assert client.get(f"/api/chat/messages/{cid}", headers=A).status_code == 200
    assert client.get(f"/api/chat/messages/{cid}", headers=C).status_code == 404
    assert client.delete(f"/api/user/pictures/{b_id}/1", headers=A).status_code == 404
    assert client.get(f"/api/user/match-history/{a_id}", headers=A).status_code == 200

    # --- photos without storage configured → clear 503, nothing stored as base64 ---
    tiny_png = base64.b64encode(bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")).decode()
    up = client.post("/api/user/pictures/upload", headers=A, json={
        "user_id": a_id, "picture_number": 1, "image_data": tiny_png, "content_type": "image/png"})
    assert up.status_code == 503, up.text

    # --- Tina works without an OpenAI key (deterministic fallback) ---
    t = client.post("/api/tina/chat", headers=C, json={
        "user_id": c_id, "user_name": "Chitra", "message": "hi", "is_onboarding_complete": False})
    assert t.status_code == 200, t.text
    assert t.json().get("success") is True and t.json().get("response")
    assert client.get("/api/tina/greeting", params={"user_name": "Chitra"}).status_code == 200

    # --- Google Sign-In without GOOGLE_OAUTH_CLIENT_IDS → explicit 503 ---
    assert client.post("/api/auth/google", json={"id_token": "x" * 40}).status_code == 503

    # --- admin login disabled without a password hash ---
    assert client.post("/api/admin/login", json={"username": "admin", "password": "admin123"}).status_code == 503

    # --- delete account: everything goes, session dies ---
    d = client.delete(f"/api/user/{a_id}/reset-all", headers=A)
    assert d.status_code == 200, d.text
    assert client.get("/api/auth/me", headers=A).status_code == 401
    assert client.get(f"/api/chat/messages/{cid}", headers=B).status_code == 404

    # --- logout ---
    assert client.post("/api/auth/logout", headers=B).status_code == 200
    assert client.get("/api/auth/me", headers=B).status_code == 401
