"""Backend tests for Tina Voice (ElevenLabs) endpoints.

Endpoints under test:
  - GET  /api/tina/voice/status
  - POST /api/tina/voice/speak          (text -> base64 MP3 data URI)
  - POST /api/tina/voice/transcribe     (audio -> text)
  - Smoke: POST /api/tina/welcome-back, POST /api/tina/chat
"""

import os
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
TIMEOUT = 60  # ElevenLabs can take a few seconds


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def tts_audio_bytes(api_client):
    """Synthesize a short clip once and reuse it for STT tests."""
    r = api_client.post(
        f"{BASE_URL}/api/tina/voice/speak",
        json={"text": "Hi I am Tina from Film Companion"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"Setup TTS failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    audio_uri = body["audio"]
    assert audio_uri.startswith("data:audio/mpeg;base64,")
    raw = base64.b64decode(audio_uri.split(",", 1)[1])
    assert len(raw) > 1024, f"Audio too small: {len(raw)} bytes"
    return raw


# ---------- /api/tina/voice/status ----------

class TestTinaVoiceStatus:
    def test_status_enabled(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/tina/voice/status", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "enabled" in data
        assert data["enabled"] is True, f"Voice should be enabled, got {data}"


# ---------- /api/tina/voice/speak (TTS) ----------

class TestTinaVoiceSpeak:
    def test_speak_returns_audio_data_uri(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/tina/voice/speak",
            json={"text": "Hi I am Tina from Film Companion"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        audio = data.get("audio", "")
        assert isinstance(audio, str)
        assert audio.startswith("data:audio/mpeg;base64,"), audio[:60]
        raw = base64.b64decode(audio.split(",", 1)[1])
        assert len(raw) > 1024, f"Audio too small: {len(raw)} bytes"
        # MP3 files commonly start with ID3 tag or 0xFF 0xFB sync header
        assert raw[:3] == b"ID3" or raw[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"), \
            f"Unexpected audio header: {raw[:4].hex()}"

    def test_speak_empty_text_returns_400(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/tina/voice/speak",
            json={"text": ""},
            timeout=TIMEOUT,
        )
        assert r.status_code == 400, f"Expected 400 for empty text, got {r.status_code}: {r.text[:200]}"

    def test_speak_whitespace_text_returns_400(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/tina/voice/speak",
            json={"text": "   "},
            timeout=TIMEOUT,
        )
        assert r.status_code == 400, f"Expected 400 for whitespace text, got {r.status_code}"


# ---------- /api/tina/voice/transcribe (STT) ----------

class TestTinaVoiceTranscribe:
    def test_transcribe_audio_returns_text(self, api_client, tts_audio_bytes):
        # Use multipart upload (do NOT send the JSON content-type header)
        files = {"audio": ("tina_voice.mp3", tts_audio_bytes, "audio/mpeg")}
        r = requests.post(
            f"{BASE_URL}/api/tina/voice/transcribe",
            files=files,
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, f"STT failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data.get("success") is True
        assert "text" in data
        assert isinstance(data["text"], str)
        # Should be a non-empty transcription
        assert len(data["text"]) > 0, "Transcribed text should not be empty"

    def test_transcribe_no_file_returns_4xx(self):
        r = requests.post(f"{BASE_URL}/api/tina/voice/transcribe", timeout=TIMEOUT)
        assert 400 <= r.status_code < 500, f"Expected 4xx, got {r.status_code}: {r.text[:200]}"

    def test_transcribe_empty_file_returns_4xx(self):
        files = {"audio": ("empty.mp3", b"", "audio/mpeg")}
        r = requests.post(
            f"{BASE_URL}/api/tina/voice/transcribe",
            files=files,
            timeout=TIMEOUT,
        )
        # Server returns 400 for empty payload, but ElevenLabs may also reject -> 5xx
        # Accept anything non-2xx as failure detection.
        assert r.status_code != 200, f"Empty audio should not return 200, got {r.status_code}"


# ---------- Pre-existing Tina smoke checks ----------

class TestTinaSmoke:
    def test_welcome_back_smoke(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/tina/welcome-back",
            json={
                "user_id": "TEST_voice_user_001",
                "user_name": "TestUser",
                "is_onboarding_complete": False,
                "collected_fields": [],
            },
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, f"welcome-back failed: {r.status_code} {r.text[:200]}"
        body = r.json()
        assert body.get("success") is True

    def test_chat_smoke(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/tina/chat",
            json={
                "user_id": "TEST_voice_user_001",
                "message": "hi",
                "user_name": "TestUser",
                "is_onboarding_complete": False,
            },
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, f"tina/chat failed: {r.status_code} {r.text[:200]}"
