"""
Tina Voice Service – ElevenLabs powered Text-to-Speech and Speech-to-Text.

Used by the "Voice Call" mode of Tina (premium feature). Both endpoints
deliberately keep the payload small (base64-encoded MP3) so the React Native
client can play the audio with `expo-audio` without needing any extra
plumbing.

Voice default: Sarah (premade female, ID `EXAVITQu4vr4xnSDxMaL`) – this is the
ElevenLabs Free-tier-compatible voice. To switch to an Indian English voice
such as `UYoWPkHjaRgjWccloxC5` (Monika Sogam) the user must upgrade to a paid
plan; that voice ID can then be set via the `ELEVENLABS_VOICE_ID` env var.
"""

import os
import io
import base64
import logging
from typing import Optional

from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from elevenlabs.types import VoiceSettings

load_dotenv()

logger = logging.getLogger(__name__)

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
DEFAULT_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")  # Sarah – premade female (Free-tier compatible)

# Models: eleven_multilingual_v2 handles English with non-native accents well.
# eleven_flash_v2_5 is much faster (~75ms) but a bit less expressive – we use it
# for low-latency voice-call responses.
TTS_MODEL_ID = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5")
STT_MODEL_ID = "scribe_v1"

_client: Optional[ElevenLabs] = None


def _get_client() -> ElevenLabs:
    """Lazily build (and cache) the ElevenLabs client."""
    global _client
    if _client is None:
        if not ELEVENLABS_API_KEY:
            raise RuntimeError(
                "ELEVENLABS_API_KEY is not configured. "
                "Please set it in backend/.env."
            )
        _client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
    return _client


def is_voice_enabled() -> bool:
    """Return True only when an API key is configured."""
    return bool(ELEVENLABS_API_KEY)


def synthesize_speech(text: str, voice_id: Optional[str] = None) -> str:
    """Generate speech audio for `text` and return a base64-encoded MP3 string.

    Returns a data URI (`data:audio/mpeg;base64,...`) so the frontend can pass
    it directly into expo-audio without any extra handling.
    """
    client = _get_client()
    voice = voice_id or DEFAULT_VOICE_ID

    # Defensive: cap text length so we don't accidentally rack up the bill
    # on huge messages.
    clean_text = (text or "").strip()
    if not clean_text:
        raise ValueError("No text provided for speech synthesis")
    if len(clean_text) > 800:
        clean_text = clean_text[:800].rstrip() + "…"

    audio_iter = client.text_to_speech.convert(
        text=clean_text,
        voice_id=voice,
        model_id=TTS_MODEL_ID,
        voice_settings=VoiceSettings(
            stability=0.55,
            similarity_boost=0.85,
            style=0.35,
            use_speaker_boost=True,
        ),
    )

    audio_bytes = b"".join(chunk for chunk in audio_iter if chunk)
    if not audio_bytes:
        raise RuntimeError("ElevenLabs returned empty audio")

    b64 = base64.b64encode(audio_bytes).decode("ascii")
    return f"data:audio/mpeg;base64,{b64}"


def stream_speech(text: str, voice_id: Optional[str] = None):
    """Yield raw MP3 audio chunks as soon as ElevenLabs returns them.

    Used by the `/api/tina/voice/speak-stream` endpoint so the frontend can
    start playback the moment the first chunk arrives instead of waiting for
    the full MP3 to be encoded + base64'd + parsed. Cuts perceived gap from
    ~1.5s to ~300-400ms on voice calls.
    """
    client = _get_client()
    voice = voice_id or DEFAULT_VOICE_ID

    clean_text = (text or "").strip()
    if not clean_text:
        raise ValueError("No text provided for speech synthesis")
    if len(clean_text) > 800:
        clean_text = clean_text[:800].rstrip() + "…"

    # ElevenLabs' convert() already returns a generator — we just pass each
    # chunk straight to the client. Using the streaming endpoint with
    # output_format default (mp3_44100_128) keeps frontend playback simple.
    audio_iter = client.text_to_speech.convert(
        text=clean_text,
        voice_id=voice,
        model_id=TTS_MODEL_ID,
        voice_settings=VoiceSettings(
            stability=0.55,
            similarity_boost=0.85,
            style=0.35,
            use_speaker_boost=True,
        ),
    )
    for chunk in audio_iter:
        if chunk:
            yield chunk


def transcribe_audio(audio_bytes: bytes, filename: str = "tina_voice.m4a") -> str:
    """Transcribe raw audio bytes to text using ElevenLabs Scribe."""
    client = _get_client()
    if not audio_bytes:
        raise ValueError("Empty audio payload")

    buf = io.BytesIO(audio_bytes)
    buf.name = filename  # the SDK reads the file name for MIME inference

    response = client.speech_to_text.convert(
        file=buf,
        model_id=STT_MODEL_ID,
    )

    text = getattr(response, "text", None) or str(response)
    text = (text or "").strip()
    logger.info(
        "Transcribed %s bytes of audio -> %s chars of text",
        len(audio_bytes),
        len(text),
    )
    return text
