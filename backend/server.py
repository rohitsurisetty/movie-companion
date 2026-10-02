from fastapi import FastAPI, APIRouter, Request, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure
import hmac
import logging
import httpx
import bcrypt
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta, date
import random
import socketio

# Central runtime settings (env-driven) — see settings.py
from settings import settings, validate_required_env

# Import recommendation engine
from recommendation_engine import (
    TasteVector,
    initialize_taste_vector_from_profile,
    update_taste_vector_from_swipe,
    get_personalized_feed,
    enrich_top_movies,
    initialize_taste_vector_from_enriched_movies,
    enrich_movie_with_full_details,
    genre_vector_key,
)

# Import matchmaking service for AI-based user matching
from matchmaking_service import (
    get_matches_for_user,
    get_all_mock_users,
    get_mock_user_by_id,
    set_db as set_matchmaking_db,
    invalidate_user_cache
)

# Import chat service
from chat_service import (
    ChatAccessDenied,
    get_conversation_id,
    send_message,
    get_messages,
    get_conversations,
    get_message_requests,
    accept_message_request,
    decline_message_request,
    unmatch_user,
    report_user,
    set_meeting_status,
    mark_messages_read,
    generate_ice_breakers,
    generate_reply_suggestions,
    generate_ai_auto_reply,
    add_ai_reply_to_conversation,
    create_mock_conversations,
    set_chat_db,
    # History feature functions
    get_match_history,
    get_unmatched_conversation,
    delete_chat_history,
    can_user_view_conversation,
)

# Import Tina AI service for conversational profile building
from tina_service import (
    set_tina_db,
    process_tina_message,
    get_tina_greeting,
    get_missing_fields,
    get_collected_profile_data,
    clear_tina_session,
    PROFILE_FIELDS,
    generate_welcome_back_message,
    get_user_onboarding_status,
)

# Tina voice (ElevenLabs) – TTS + STT for the "Voice Call with Tina" feature.
# The service is fully async: `await synthesize_speech(...)`, `await
# transcribe_audio(...)`, and `stream_speech(...)` is an ASYNC generator.
from tina_voice_service import (
    synthesize_speech,
    stream_speech,
    transcribe_audio,
    is_voice_enabled,
)

# Tina personality engine – 360° Dating Profile Framework (hidden scoring engine)
from tina_personality import (
    set_personality_db,
    QUESTIONS as PERSONALITY_QUESTIONS,
    finalize_profile as personality_finalize_profile,
    save_tina_personality,
    get_tina_personality,
    get_dynamic_movie_genres,
    get_love_tropes,
)

# Import picture service for profile photos
from picture_service import (
    upload_picture_to_storage,
    delete_picture_from_storage,
    save_user_pictures,
    get_user_pictures,
    update_single_picture,
    set_mongodb_db
)
try:
    # Raised by picture_service when no photo storage backend is reachable.
    from picture_service import PhotoStorageUnavailable
except ImportError:  # older picture_service without the signal
    class PhotoStorageUnavailable(Exception):
        """Placeholder so the upload handlers' except clauses stay valid."""

# Centralised security dependencies — see security_deps.py for design notes.
from security_deps import (
    set_security_db,
    set_admin_tokens_provider,
    get_current_user_id,
    get_current_admin,
    require_owner,
    TTS_LIMITER,
    LLM_LIMITER,
    LOGIN_ATTEMPT_LIMITER,
    RateLimiter,
    client_ip,
)

# Auth routes (Google Sign-In, phone OTP, /auth/me, /auth/logout)
from auth_routes import router as auth_router, configure as configure_auth

# Import mock-data seeder for unmatched flow testing
from mock_unmatched_data import seed_unmatched_for_user

# Import Supabase service for analytics tracking
import supabase_service as supabase

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Fail fast with a readable message if MONGO_URL / DB_NAME are missing.
validate_required_env()
client = AsyncIOMotorClient(settings.mongo_url, serverSelectionTimeoutMS=5000)
db = client[settings.db_name]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# =============================================
# Per-endpoint rate limiters (in-memory sliding window, per user). LLM-backed
# routes (/tina/chat, /chat/ice-breakers, /chat/reply-suggestions) share
# security_deps.LLM_LIMITER under the key f"llm:{user_id}".
# =============================================
STT_LIMITER = RateLimiter(max_calls=20, window_seconds=60)              # /tina/voice/transcribe
EXTERNAL_API_LIMITER = RateLimiter(max_calls=120, window_seconds=60)    # /tmdb/* + /places/*
MATCH_REFRESH_LIMITER = RateLimiter(max_calls=3, window_seconds=60 * 10)  # /matches force_refresh
PICTURE_MAX_B64_CHARS = 7_000_000  # ≈5 MB decoded; reject before base64-decoding
STT_MAX_AUDIO_BYTES = 10 * 1024 * 1024  # voice clips for /tina/voice/transcribe


def _actor_key(request: Request) -> str:
    """Rate-limit key for the authenticated caller (falls back to IP)."""
    uid = getattr(request.state, "user_id", None)
    return uid or f"ip:{client_ip(request)}"

# =============================================
# Socket.IO Server Setup for Real-Time Updates
# =============================================
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=settings.allowed_origins,
    logger=True,
    engineio_logger=False
)

# Store connected admin clients (sid -> admin username). Only authenticated
# admins ever get in here; they are also placed in the "admins" room so every
# dashboard broadcast is scoped to that room.
connected_admins: Dict[str, str] = {}
ADMIN_ROOM = "admins"


def _lookup_admin_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    """Validate an admin token against the in-memory store with the same 24h
    aging rule `security_deps.get_current_admin` applies. Returns the token
    info dict, or None if missing/expired."""
    if not token:
        return None
    info = admin_tokens.get(token)
    if not info:
        return None
    created_str = info.get("created_at")
    if created_str:
        try:
            created = datetime.fromisoformat(created_str)
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - created).total_seconds() > 24 * 3600:
                admin_tokens.pop(token, None)
                return None
        except ValueError:
            pass
    return info


@sio.event
async def connect(sid, environ, auth):
    """Handle new WebSocket connection — admin dashboard only.

    A valid, unexpired admin token is REQUIRED (auth payload `token`, or a
    Bearer Authorization header). Anything else is rejected."""
    token = None
    if isinstance(auth, dict):
        token = auth.get('token') or auth.get('admin_token')
    if not token:
        hdr = (environ or {}).get('HTTP_AUTHORIZATION', '')
        if hdr.lower().startswith('bearer '):
            token = hdr[7:].strip()
    info = _lookup_admin_token(token)
    if not info:
        logger.warning(f"Rejected unauthenticated socket connection: {sid}")
        return False  # reject the connection
    connected_admins[sid] = info.get('username') or info.get('email') or 'admin'
    await sio.enter_room(sid, ADMIN_ROOM)
    logger.info(f"Admin client connected: {sid}")
    await sio.emit('connection_status', {'status': 'connected'}, room=sid)
    # Send initial metrics
    await broadcast_metrics()


@sio.event
async def disconnect(sid):
    """Handle WebSocket disconnection"""
    logger.info(f"Admin client disconnected: {sid}")
    if sid in connected_admins:
        del connected_admins[sid]
    try:
        await sio.leave_room(sid, ADMIN_ROOM)
    except Exception:
        pass


async def broadcast_metrics():
    """Broadcast updated metrics to all connected admins"""
    if not connected_admins:
        # Nobody is listening — skip the (fairly expensive) aggregation work.
        return

    try:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        
        total_users = await db.users.count_documents({})
        new_signups_today = await db.users.count_documents({
            "created_at": {"$gte": today_start.isoformat()}
        })
        
        profiles = await db.user_profiles.find({}, {"gender": 1}).to_list(length=10000)
        male = sum(1 for p in profiles if p.get("gender", "").lower() in ["male", "man", "m"])
        female = sum(1 for p in profiles if p.get("gender", "").lower() in ["female", "woman", "f"])
        other = len(profiles) - male - female
        total_with_gender = male + female + other or 1
        
        swipes_today = await db.user_swipes.count_documents({
            "created_at": {"$gte": today_start.isoformat()}
        })

        try:
            # A "match" is an accepted chat (chat_conversations.status == active)
            total_matches = await db.chat_conversations.count_documents({"status": "active"})
        except Exception:
            total_matches = 0

        active_today = await db.user_swipes.distinct("user_id", {
            "created_at": {"$gte": today_start.isoformat()}
        })

        wau_users = await db.user_swipes.distinct("user_id", {
            "created_at": {"$gte": week_ago.isoformat()}
        })
        mau_users = await db.user_swipes.distinct("user_id", {
            "created_at": {"$gte": month_ago.isoformat()}
        })

        metrics = {
            "totalUsers": total_users,
            "activeToday": len(active_today),
            "dau": len(active_today),
            "wau": len(wau_users),
            "mau": len(mau_users),
            "newSignupsToday": new_signups_today,
            "totalMatches": total_matches,
            "totalSwipesToday": swipes_today,
            "avgSessionDuration": 12,
            "subscriptionRate": 0,
            "retentionRate": 68,
            "genderDistribution": {
                "male": round(male / total_with_gender * 100),
                "female": round(female / total_with_gender * 100),
                "other": round(other / total_with_gender * 100),
            }
        }

        await sio.emit('metrics_update', metrics, room=ADMIN_ROOM)
    except Exception as e:
        logger.error(f"Error broadcasting metrics: {e}")


# Fields that must never leave the server over the admin socket (contact PII,
# moderation notes, Mongo internals, credentials).
_SOCKET_STRIP_FIELDS = {
    "_id", "email", "phone", "ban_reason", "session_token", "google_sub",
    "coordinates", "locationFull", "dob",
}


def _socket_safe(doc: Optional[dict]) -> dict:
    """Shallow copy of `doc` minus the fields in _SOCKET_STRIP_FIELDS."""
    if not isinstance(doc, dict):
        return {}
    return {k: v for k, v in doc.items() if k not in _SOCKET_STRIP_FIELDS}


async def broadcast_new_user(user_data: dict):
    """Broadcast new user event to all connected admins"""
    if connected_admins:
        await sio.emit('new_user', _socket_safe(user_data), room=ADMIN_ROOM)
        await broadcast_metrics()


async def broadcast_user_updated(user_data: dict):
    """Broadcast user update event to all connected admins"""
    if connected_admins:
        await sio.emit('user_updated', _socket_safe(user_data), room=ADMIN_ROOM)


async def broadcast_new_swipe(swipe_data: dict):
    """Broadcast new swipe event to all connected admins"""
    if connected_admins:
        await sio.emit('new_swipe', swipe_data, room=ADMIN_ROOM)
        await broadcast_metrics()


async def broadcast_new_match(match_data: dict):
    """Broadcast new match event to all connected admins"""
    if connected_admins:
        await sio.emit('new_match', match_data, room=ADMIN_ROOM)
        await broadcast_metrics()

# API Keys (centralised in settings.py — configured via env, see backend/.env.example)
GOOGLE_MAPS_API_KEY = settings.google_maps_api_key
TMDB_ACCESS_TOKEN = settings.tmdb_access_token


# =============================================
# Recommendation Engine Models
# =============================================

class MovieSelection(BaseModel):
    id: int
    title: str
    poster_path: str = ""
    release_date: str = ""
    vote_average: float = 0
    rating: float = 0  # User's personal rating
    genres: List[str] = []
    reasons: List[str] = []  # User's reasons for liking this movie


class UserProfileRequest(BaseModel):
    """
    Complete user profile with ALL signup fields.
    Every field matters for accurate taste profiling!
    """
    user_id: str = ""  # ignored — the session identity is used
    # Basic Info
    name: str = ""
    age: int = 0
    # Date of birth (ISO "YYYY-MM-DD") — when present the server derives
    # `age` from it and ignores the client-supplied value. PRIVATE.
    dob: Optional[str] = None
    dobDay: Optional[str] = None
    dobMonth: Optional[str] = None
    dobYear: Optional[str] = None
    gender: str = ""
    # Self-described identity when gender is Non-binary / Other. PRIVATE
    # (not part of the public profile whitelist).
    genderIdentity: Optional[str] = None
    location: str = ""  # city-level label — the only location field ever served to others
    # Full address + GPS fix from the location picker. PRIVATE: persisted for
    # distance filtering, never returned to other users.
    locationFull: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None
    # Dating Preferences
    partnerPreference: str = ""
    relationshipIntent: List[str] = []
    # Movie Preferences (Critical for recommendations)
    genres: List[str] = []
    filmLanguages: List[str] = []
    languagesSpoken: List[str] = []
    topMovies: List[MovieSelection] = []
    movieFrequency: str = ""
    ottTheatre: str = ""
    # Personal Details
    height: str = ""
    religion: str = ""
    maritalStatus: str = ""
    foodPreference: str = ""
    bio: str = ""
    # Lifestyle
    smoking: str = ""
    drinking: str = ""
    exercise: str = ""
    zodiac: str = ""
    pets: str = ""
    familyPlanning: str = ""
    siblings: str = ""
    education: str = ""
    workProfile: str = ""
    travel: str = ""
    # App modes
    movieBuddyMode: bool = False
    movieDateMode: bool = False
    # Visibility toggles — controls which profile sections show publicly.
    # Optional dict; absent on cold signup, populated on edits from the
    # Profile screen. Persisted to Supabase `toggle_visibility_profile`
    # for full audit trail.
    visibilityToggles: Optional[Dict[str, bool]] = None
    # Session id from frontend (for grouping signup events across multiple
    # PATCH-style profile saves)
    session_id: Optional[str] = None


class SwipeRequest(BaseModel):
    user_id: str = ""  # ignored — the session identity is used
    movie_id: int
    direction: str  # 'right' or 'left'
    rating: Optional[int] = None  # 1-5 stars (for right swipes)
    reason: Optional[str] = None  # Reason for like/dislike
    didnt_watch: bool = False  # User hasn't watched this movie


class RecommendationRequest(BaseModel):
    user_id: str = ""  # ignored — the session identity is used
    page: int = 1
    limit: int = 20


class UserFiltersRequest(BaseModel):
    """User matching filters and preferences.

    Mirrors `buildFiltersPayload()` in the mobile client. `user_id` is
    overridden server-side with the session identity."""
    user_id: str = ""
    # Filter values
    distance_radius: Optional[int] = None  # km; None = no cap
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    height_min: Optional[str] = None       # display label, e.g. 5'4"
    height_max: Optional[str] = None
    height_min_cm: Optional[int] = None
    height_max_cm: Optional[int] = None
    languages: Optional[List[str]] = None
    genres: Optional[List[str]] = None
    ott_theatre: Optional[str] = None
    film_languages: Optional[List[str]] = None
    religion: Optional[str] = None
    zodiac: Optional[str] = None
    siblings: Optional[str] = None
    education: Optional[str] = None
    travel: Optional[str] = None
    smoking: Optional[str] = None
    drinking: Optional[str] = None
    exercise: Optional[str] = None
    pets: Optional[str] = None
    family_planning: Optional[str] = None
    marital_status: Optional[str] = None
    food_preference: Optional[str] = None
    intent: Optional[str] = None
    # Full multi-select lists per section (the singles above are `selected[0]`)
    selected_lists: Optional[Dict[str, List[str]]] = None
    # Toggle settings
    exclusive_toggles: Optional[Dict[str, bool]] = None
    expand_if_run_out_toggles: Optional[Dict[str, bool]] = None


@api_router.get("/")
async def root():
    return {"message": "filmydating API"}


# ============================================================================
# GLOBAL AUTH MIDDLEWARE
# ============================================================================
# Defense-in-depth: every /api/* route (except a small explicit allow-list)
# REQUIRES a valid session before the handler runs. This closes the systemic
# BOLA hole flagged in the security audit — no more relying on every author
# remembering to add Depends(...) to each new endpoint.
#
# Auth flow:
#   • /api/auth/*  → public (login/signup paths)
#   • /api/admin/login → public (issues an admin token)
#   • /api/admin/*  → requires admin token (get_current_admin)
#   • everything else under /api/ → requires user session (get_current_user_id)
#
# Per-route handlers can additionally call `require_owner(body_user_id,
# request.state.user_id)` for the highest-risk endpoints that take user_id
# in the body or path.

# NOTE: /api/tmdb/* and /api/places/* proxy paid third-party APIs and
# therefore REQUIRE a session (they used to be public).
_PUBLIC_PREFIXES = (
    "/api/auth/",
)
_PUBLIC_EXACT = {
    "/api/",
    "/api",
    "/api/tina/greeting",
    "/api/tina/field-options",
    "/api/tina/360/questions",
    "/api/tina/voice/status",
    "/api/movie/catalog/stats",
    "/api/admin/login",
}


@app.middleware("http")
async def auth_gate(request: Request, call_next):
    path = request.url.path
    method = request.method

    # Non-API and CORS preflight always pass through
    if not path.startswith("/api") or method == "OPTIONS":
        return await call_next(request)

    if path in _PUBLIC_EXACT or any(path.startswith(p) for p in _PUBLIC_PREFIXES):
        return await call_next(request)

    # Admin routes (everything under /api/admin/ except /login)
    if path.startswith("/api/admin/"):
        try:
            admin_info = await get_current_admin(request)
            request.state.admin = admin_info
        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers=getattr(exc, "headers", {}) or {},
            )
        return await call_next(request)

    # Default: require a logged-in user session
    try:
        uid = await get_current_user_id(request)
        request.state.user_id = uid
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", {}) or {},
        )
    return await call_next(request)


@app.exception_handler(ChatAccessDenied)
async def chat_access_denied_handler(request: Request, exc: ChatAccessDenied):
    """chat_service raises ChatAccessDenied when the caller is not a participant
    of the conversation they are touching. Answer 404 (not 403) so we never
    confirm that a conversation id exists."""
    return JSONResponse(status_code=404, content={"detail": "Not found"})


_PUBLIC_PROFILE_FIELDS = (
    "user_id", "name", "age", "gender", "location", "bio",
    "genres", "topMovies", "filmLanguages", "languagesSpoken",
    "movieFrequency", "ottTheatre", "relationshipIntent", "partnerPreference",
    "height", "religion", "zodiac", "smoking", "drinking", "exercise",
    "pets", "familyPlanning", "siblings", "education", "travel",
    "workProfile", "maritalStatus", "foodPreference",
    "profile_picture", "pictures", "avatar", "avatarId",
    "archetype", "personality_summary", "primary_love_language",
    "movieBuddyMode", "movieDateMode", "is_mock",
)


def _public_profile_view(profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Project a stored profile onto the PUBLIC whitelist for viewing by
    OTHER logged-in users. This is the ONE place that decides what another
    user may see (used by /user/profile/{id}, /matches/profile/{id},
    /user/pictures/{id}, /tina/360/profile/{id} and the chat AI helpers).

    • Never includes email/phone/session/dob/coordinates/locationFull/
      visibilityToggles or any internal flag — only _PUBLIC_PROFILE_FIELDS.
    • Honours the owner's `visibilityToggles`: any field whose toggle is
      explicitly `false` is dropped.
    • `location` is the city-level label (the only location field stored at
      that granularity); the precise address/GPS fix is never projected.
    """
    if not profile:
        return {}
    toggles = profile.get("visibilityToggles") or {}
    if not isinstance(toggles, dict):
        toggles = {}
    view: Dict[str, Any] = {}
    for key in _PUBLIC_PROFILE_FIELDS:
        if key not in profile:
            continue
        if toggles.get(key) is False:
            continue
        view[key] = profile[key]
    return view


async def _profile_for_viewer(user_id: str, viewer_id: str) -> Optional[Dict[str, Any]]:
    """Profile doc for `user_id` as `viewer_id` may see it: the full stored doc
    for the owner, the public whitelist for anyone else (mock users included).
    None when no such profile exists."""
    mock_user = get_mock_user_by_id(user_id)
    if mock_user:
        return _public_profile_view(mock_user)
    doc = await db.user_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if doc is None:
        return None
    return doc if user_id == viewer_id else _public_profile_view(doc)


# ============================================================================
# AUTH (/api/auth/*) lives in auth_routes.py — Google Sign-In, phone OTP,
# /auth/me and /auth/logout. It is mounted onto api_router near the bottom of
# this file and wired to Mongo in startup_event via configure_auth(db).
# ============================================================================


async def _tmdb_json(resp: httpx.Response, what: str) -> Dict[str, Any]:
    """Validate an upstream TMDB response before touching `.json()`."""
    if resp.status_code != 200:
        logger.warning(f"TMDB {what} returned HTTP {resp.status_code}")
        raise HTTPException(status_code=502, detail="Movie database unavailable")
    try:
        data = resp.json()
    except ValueError:
        logger.warning(f"TMDB {what} returned a non-JSON body")
        raise HTTPException(status_code=502, detail="Movie database unavailable")
    return data if isinstance(data, dict) else {}


def _parse_int_csv(raw: str, field: str) -> List[int]:
    """Parse a comma-separated list of ints from a query param → 400 on junk."""
    try:
        return [int(x) for x in raw.split(',') if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field} must be a comma-separated list of integers")


def _check_int_range(value: int, field: str, lo: int, hi: int) -> int:
    """Validate an int query/path param → 400 when outside [lo, hi]."""
    if value < lo or value > hi:
        raise HTTPException(status_code=400, detail=f"{field} must be between {lo} and {hi}")
    return value


@api_router.get("/tmdb/search")
async def search_movies(query: str, request: Request):
    """Search movies via TMDB API - excludes unreleased movies"""
    EXTERNAL_API_LIMITER.check_or_raise(f"ext:{_actor_key(request)}")
    today = datetime.now().strftime("%Y-%m-%d")

    async with httpx.AsyncClient(timeout=10.0) as http_client:
        resp = await http_client.get(
            "https://api.themoviedb.org/3/search/movie",
            params={"query": query, "language": "en-US", "page": 1},
            headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
        )
    data = await _tmdb_json(resp, "search")
    results = []
    for m in data.get("results", [])[:30]:  # Get more to filter
        release_date = m.get("release_date", "")
        # Include movie if no release date or release date is today or earlier
        if not release_date or release_date <= today:
            results.append({
                "id": m["id"], "title": m["title"],
                "poster_path": m.get("poster_path", ""),
                "release_date": m.get("release_date", ""),
                "overview": m.get("overview", ""),
                "vote_average": m.get("vote_average", 0),
            })
        if len(results) >= 20:
            break
    return {"results": results}


@api_router.get("/places/autocomplete")
async def places_autocomplete(input: str, request: Request):
    """Google Places autocomplete for city search"""
    EXTERNAL_API_LIMITER.check_or_raise(f"ext:{_actor_key(request)}")
    if not input or not input.strip():
        raise HTTPException(status_code=400, detail="input is required")
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=503, detail="Location search is not configured")
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        resp = await http_client.get(
            "https://maps.googleapis.com/maps/api/place/autocomplete/json",
            params={"input": input.strip()[:200], "key": GOOGLE_MAPS_API_KEY, "types": "(cities)"}
        )
    if resp.status_code != 200:
        logger.warning(f"Places autocomplete returned HTTP {resp.status_code}")
        raise HTTPException(status_code=502, detail="Location service unavailable")
    try:
        data = resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Location service unavailable")
    if data.get("status") not in (None, "OK", "ZERO_RESULTS"):
        logger.warning(f"Places autocomplete status={data.get('status')}")
        raise HTTPException(status_code=502, detail="Location service unavailable")
    predictions = []
    for p in data.get("predictions", []) or []:
        if p.get("description") and p.get("place_id"):
            predictions.append({"description": p["description"], "place_id": p["place_id"]})
    return {"predictions": predictions}


@api_router.get("/places/geocode")
async def reverse_geocode(lat: float, lng: float, request: Request):
    """Reverse geocode coordinates to city name"""
    EXTERNAL_API_LIMITER.check_or_raise(f"ext:{_actor_key(request)}")
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=503, detail="Location search is not configured")
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        resp = await http_client.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"latlng": f"{lat},{lng}", "key": GOOGLE_MAPS_API_KEY}
        )
    if resp.status_code != 200:
        logger.warning(f"Geocode returned HTTP {resp.status_code}")
        raise HTTPException(status_code=502, detail="Location service unavailable")
    try:
        data = resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Location service unavailable")
    if data.get("results"):
        for result in data["results"]:
            for comp in result.get("address_components", []):
                if "locality" in comp.get("types", []):
                    return {"location": comp["long_name"], "formatted_address": result["formatted_address"]}
        return {"location": data["results"][0].get("formatted_address", ""), "formatted_address": data["results"][0].get("formatted_address", "")}
    return {"location": "", "formatted_address": ""}


TMDB_GENRE_IDS = {
    'Action': 28, 'Romance': 10749, 'Comedy': 35, 'Thriller': 53,
    'Horror': 27, 'Sci-Fi': 878, 'Drama': 18, 'Documentary': 99,
}

@api_router.get("/tmdb/trending")
async def get_trending_movies(request: Request, page: int = 1):
    """Get trending movies for the Library screen - excludes unreleased movies"""
    EXTERNAL_API_LIMITER.check_or_raise(f"ext:{_actor_key(request)}")
    page = max(1, min(page, 100))
    try:
        today = datetime.now().strftime("%Y-%m-%d")

        async with httpx.AsyncClient(timeout=10.0) as http_client:
            resp = await http_client.get(
                "https://api.themoviedb.org/3/trending/movie/week",
                params={"page": page},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            if resp.status_code == 200:
                data = resp.json()
                # Filter out unreleased movies (future release dates)
                if "results" in data:
                    released_movies = []
                    for movie in data["results"]:
                        release_date = movie.get("release_date", "")
                        # Include movie if no release date or release date is today or earlier
                        if not release_date or release_date <= today:
                            released_movies.append(movie)
                    data["results"] = released_movies
                    data["total_results"] = len(released_movies)
                return data
            logger.warning(f"TMDB trending returned HTTP {resp.status_code}")
            return {"results": [], "page": page, "total_results": 0}
    except Exception:
        logger.exception("Error fetching trending movies")
        return {"results": [], "page": page, "total_results": 0, "error": "Movie database unavailable"}


@api_router.get("/tmdb/feed")
async def get_movie_feed(
    request: Request,
    genres: str = "",
    languages: str = "",
    page: int = 1,
    exclude: str = "",
    seed_movie_id: int = 0,
    liked_genres: str = "",
):
    """Get movie feed based on user preferences with adaptive learning"""
    EXTERNAL_API_LIMITER.check_or_raise(f"ext:{_actor_key(request)}")
    page = max(1, min(page, 500))
    exclude_ids = set(_parse_int_csv(exclude, "exclude"))
    genre_names = [g.strip() for g in genres.split(',') if g.strip()]
    liked_genre_ids = _parse_int_csv(liked_genres, "liked_genres")

    # Build genre list: prioritize liked genres
    genre_id_list = []
    if liked_genre_ids:
        genre_id_list = liked_genre_ids[:3]
    elif genre_names:
        genre_id_list = [TMDB_GENRE_IDS[g] for g in genre_names if g in TMDB_GENRE_IDS]

    def _results(resp: httpx.Response) -> List[Dict[str, Any]]:
        # Only trust a 200 with a JSON object body; anything else contributes nothing.
        if resp.status_code != 200:
            logger.warning(f"TMDB feed sub-request returned HTTP {resp.status_code}")
            return []
        try:
            body = resp.json()
        except ValueError:
            return []
        items = body.get("results", []) if isinstance(body, dict) else []
        return [m for m in items if isinstance(m, dict) and m.get("id") is not None]

    all_movies = []
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        # 1. Discover by genre
        if genre_id_list:
            genre_str = ','.join(str(g) for g in genre_id_list[:3])
            resp = await http_client.get(
                "https://api.themoviedb.org/3/discover/movie",
                params={"with_genres": genre_str, "sort_by": "vote_average.desc",
                        "vote_count.gte": 100, "page": page},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            all_movies.extend(_results(resp))

        # 2. Recommendations from seed movie
        if seed_movie_id > 0:
            resp = await http_client.get(
                f"https://api.themoviedb.org/3/movie/{seed_movie_id}/recommendations",
                params={"page": 1},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            all_movies.extend(_results(resp))

        # 3. Popular fallback
        if len(all_movies) < 10:
            resp = await http_client.get(
                "https://api.themoviedb.org/3/movie/popular",
                params={"page": page},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            all_movies.extend(_results(resp))

        # 4. Top rated fallback
        if len(all_movies) < 15:
            resp = await http_client.get(
                "https://api.themoviedb.org/3/movie/top_rated",
                params={"page": page},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            all_movies.extend(_results(resp))

    # Deduplicate, exclude swiped, require poster
    seen = set()
    results = []
    for m in all_movies:
        mid = m["id"]
        if mid not in seen and mid not in exclude_ids and m.get("poster_path"):
            seen.add(mid)
            results.append({
                "id": mid, "title": m.get("title", ""),
                "poster_path": m.get("poster_path", ""),
                "backdrop_path": m.get("backdrop_path", ""),
                "release_date": m.get("release_date", ""),
                "overview": m.get("overview", ""),
                "vote_average": m.get("vote_average", 0),
                "genre_ids": m.get("genre_ids", []),
            })
    return {"results": results[:20], "page": page}


@api_router.get("/tmdb/movie/{movie_id}")
async def get_movie_details(movie_id: int, request: Request):
    """Get detailed movie info including cast and crew"""
    EXTERNAL_API_LIMITER.check_or_raise(f"ext:{_actor_key(request)}")
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        resp = await http_client.get(
            f"https://api.themoviedb.org/3/movie/{movie_id}",
            params={"append_to_response": "credits"},
            headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
        )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Movie not found")
    movie = await _tmdb_json(resp, "movie details")
    credits = movie.get("credits", {}) or {}
    cast = [{"name": c.get("name", ""), "character": c.get("character", "")}
            for c in credits.get("cast", [])[:10]]
    directors = [c.get("name", "") for c in credits.get("crew", []) if c.get("job") == "Director"]
    genres = [g.get("name", "") for g in movie.get("genres", [])]
    return {
        "id": movie.get("id", movie_id), "title": movie.get("title", ""),
        "poster_path": movie.get("poster_path", ""),
        "overview": movie.get("overview", ""),
        "release_date": movie.get("release_date", ""),
        "vote_average": movie.get("vote_average", 0),
        "runtime": movie.get("runtime", 0),
        "genres": genres, "cast": cast, "directors": directors,
        "vote_count": movie.get("vote_count", 0),
    }


# =============================================
# Recommendation Engine Endpoints
# =============================================

def _parse_dob(req: UserProfileRequest) -> Optional[date]:
    """Resolve a date of birth from `dob` (ISO) or the dobDay/Month/Year
    triplet. Returns None when nothing was sent; raises 400 on garbage."""
    raw = (req.dob or "").strip()
    if not raw and req.dobYear and req.dobMonth and req.dobDay:
        raw = f"{str(req.dobYear).strip()}-{str(req.dobMonth).strip().zfill(2)}-{str(req.dobDay).strip().zfill(2)}"
    if not raw:
        return None
    try:
        parsed = date.fromisoformat(raw[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date of birth")
    if parsed > date.today():
        raise HTTPException(status_code=400, detail="Invalid date of birth")
    return parsed


def _age_from_dob(dob: date) -> int:
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


@api_router.post("/user/profile")
async def save_user_profile(req: UserProfileRequest, request: Request):
    """
    Save user profile and initialize comprehensive taste vector.
    Called after user completes onboarding.

    ENHANCED: Now fetches FULL TMDB details for Top 5 movies to extract:
    - All cast members (actors)
    - All crew (directors, writers, composers, cinematographers)
    - Keywords/tags
    - Production companies and countries
    - Runtime, budget, popularity metrics

    This creates a highly accurate initial taste profile.

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id

    # ---- Server-side validation (never trust the client) ----
    dob = _parse_dob(req)
    if dob is not None:
        req.age = _age_from_dob(dob)   # dob wins over the client-supplied age
    if req.age and req.age < 18:
        raise HTTPException(status_code=400, detail="You must be 18 or older")
    if req.age < 0 or req.age > 120:
        raise HTTPException(status_code=400, detail="Invalid age")
    req.name = (req.name or "").strip()[:80]
    req.bio = (req.bio or "")[:1000]
    if req.locationFull:
        req.locationFull = req.locationFull.strip()[:300]
    if req.coordinates is not None:
        try:
            lat = float(req.coordinates.get("lat"))
            lng = float(req.coordinates.get("lng"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid coordinates")
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
            raise HTTPException(status_code=400, detail="Invalid coordinates")
        req.coordinates = {"lat": lat, "lng": lng}

    # Convert topMovies to dict format
    top_movies_data = [m.dict() for m in req.topMovies]
    
    # ========================
    # ENRICH TOP MOVIES with full TMDB data
    # ========================
    enriched_top_movies = []
    enrichment_stats = {
        "total_movies": len(top_movies_data),
        "enriched_count": 0,
        "total_actors": 0,
        "total_directors": 0,
        "total_keywords": 0,
    }
    
    if top_movies_data:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            enriched_top_movies = await enrich_top_movies(top_movies_data, http_client)
            
            # Calculate stats
            for movie in enriched_top_movies:
                if movie.get("directors"):  # Indicator of successful enrichment
                    enrichment_stats["enriched_count"] += 1
                    enrichment_stats["total_actors"] += len(movie.get("cast_names", movie.get("cast", [])))
                    enrichment_stats["total_directors"] += len(movie.get("directors", []))
                    enrichment_stats["total_keywords"] += len(movie.get("keywords", []))
    
    # Build complete profile data with ALL fields
    profile_data = {
        "user_id": req.user_id,
        # Basic Info
        "name": req.name,
        "age": req.age,
        "gender": req.gender,
        "location": req.location,
        # Dating Preferences
        "partnerPreference": req.partnerPreference,
        "relationshipIntent": req.relationshipIntent,
        # Movie Preferences (Critical)
        "genres": req.genres,
        "filmLanguages": req.filmLanguages,
        "languagesSpoken": req.languagesSpoken,
        "topMovies": top_movies_data,
        "topMoviesEnriched": enriched_top_movies,
        "movieFrequency": req.movieFrequency,
        "ottTheatre": req.ottTheatre,
        # Personal Details
        "height": req.height,
        "religion": req.religion,
        "maritalStatus": req.maritalStatus,
        "foodPreference": req.foodPreference,
        "bio": req.bio,
        # Lifestyle
        "smoking": req.smoking,
        "drinking": req.drinking,
        "exercise": req.exercise,
        "zodiac": req.zodiac,
        "pets": req.pets,
        "familyPlanning": req.familyPlanning,
        "siblings": req.siblings,
        "education": req.education,
        "workProfile": req.workProfile,
        "travel": req.travel,
        # App Modes
        "movieBuddyMode": req.movieBuddyMode,
        "movieDateMode": req.movieDateMode,
        # Metadata
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    # PRIVATE fields — only written when sent so a partial save never wipes
    # them; never projected to other users (see _public_profile_view).
    if dob is not None:
        profile_data["dob"] = dob.isoformat()
    if req.locationFull:
        profile_data["locationFull"] = req.locationFull
    if req.coordinates is not None:
        profile_data["coordinates"] = req.coordinates
    if req.genderIdentity is not None:
        profile_data["genderIdentity"] = req.genderIdentity.strip()[:60]
    if isinstance(req.visibilityToggles, dict):
        profile_data["visibilityToggles"] = {
            str(k): bool(v) for k, v in req.visibilityToggles.items()
        }

    # Save to MongoDB (upsert)
    await db.user_profiles.update_one(
        {"user_id": req.user_id},
        {"$set": profile_data},
        upsert=True
    )
    
    # ========================
    # Initialize taste vector with basic profile signals
    # ========================
    taste_vector = initialize_taste_vector_from_profile(profile_data)
    
    # ========================
    # ENHANCE taste vector with enriched top movies
    # ========================
    if enriched_top_movies:
        taste_vector = initialize_taste_vector_from_enriched_movies(taste_vector, enriched_top_movies)
    
    # Save taste vector with all metadata
    await db.user_taste_vectors.update_one(
        {"user_id": req.user_id},
        {"$set": {
            "user_id": req.user_id,
            "vector": taste_vector.to_dict(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )
    
    # Log the initialization
    preferred_langs = list(taste_vector.preferred_languages)
    logger.info(
        f"Saved profile for user {req.user_id} with {len(req.genres)} genres, "
        f"{len(preferred_langs)} languages, {len(req.topMovies)} top movies "
        f"({enrichment_stats['enriched_count']} enriched with {enrichment_stats['total_keywords']} keywords)"
    )
    
    # Broadcast profile update to admin dashboard
    try:
        await broadcast_user_updated({
            "user_id": req.user_id,
            "name": req.name,
            "gender": req.gender,
            "age": req.age,
            "location": req.location,
            "genres": req.genres,
            "filmLanguages": req.filmLanguages,
            "topMovies": top_movies_data,
            "total_swipes": 0,
        })
    except Exception as e:
        logger.error(f"Failed to broadcast profile update: {e}")
    
    # Save to Supabase for analytics
    try:
        # Save user signup details
        await supabase.save_user_signup_data(req.user_id, profile_data)
        
        # Save top 5 movies
        if top_movies_data:
            await supabase.save_top_movies(req.user_id, top_movies_data)
        
        # Save visibility toggles if provided
        if hasattr(req, 'visibilityToggles') and req.visibilityToggles:
            await supabase.save_visibility_toggles(req.user_id, req.visibilityToggles)
        
        # Save mode selection
        modes = []
        if req.movieBuddyMode:
            modes.append("movie_buddy")
        if req.movieDateMode:
            modes.append("movie_date")
        if modes:
            await supabase.save_mode_selected(req.user_id, ",".join(modes))
        
        logger.info(f"Saved profile to Supabase for user {req.user_id}")
    except Exception as e:
        logger.error(f"Failed to save to Supabase: {e}")

    # Invalidate THIS user's match cache so their next /matches call reflects
    # the updated profile. (The previous global all-users wipe made every
    # profile save re-run AI scoring for the whole user base.)
    try:
        await invalidate_user_cache(req.user_id)
    except Exception as cache_err:
        logger.warning(f"[matchmaking] cache invalidation skipped: {cache_err}")

    return {
        "success": True,
        "message": "Profile saved with comprehensive taste vector",
        "taste_dimensions": len(taste_vector.vector),
        "preferred_languages": preferred_langs,
        "signals_used": {
            "genres": len(req.genres),
            "film_languages": len(req.filmLanguages),
            "spoken_languages": len(req.languagesSpoken),
            "top_movies": len(req.topMovies),
            "top_movies_enriched": enrichment_stats["enriched_count"],
            "total_actors_from_top_movies": enrichment_stats["total_actors"],
            "total_directors_from_top_movies": enrichment_stats["total_directors"],
            "total_keywords_from_top_movies": enrichment_stats["total_keywords"],
            "movie_frequency": req.movieFrequency or "not set",
            "ott_theatre": req.ottTheatre or "not set",
            "relationship_intents": len(req.relationshipIntent),
            "age": req.age,
        }
    }


@api_router.post("/user/filters")
async def save_user_filters(req: UserFiltersRequest, request: Request):
    """
    Save user matching filters and preferences.

    Source of truth is the Mongo `user_filters` collection (one doc per user,
    read by matchmaking_service). The Supabase analytics sync is best-effort.

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id

    # Light sanity checks on the numeric ranges
    if req.age_min is not None and req.age_min < 18:
        req.age_min = 18
    if req.age_max is not None and req.age_max < 18:
        req.age_max = 18
    if req.age_min is not None and req.age_max is not None and req.age_min > req.age_max:
        raise HTTPException(status_code=400, detail="age_min cannot exceed age_max")
    if req.distance_radius is not None and req.distance_radius <= 0:
        req.distance_radius = None  # 0 / negative == "no cap"

    filters_doc = req.dict()
    filters_doc["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        await db.user_filters.update_one(
            {"user_id": req.user_id},
            {"$set": filters_doc},
            upsert=True,
        )
    except Exception:
        logger.exception("Failed to persist user filters")
        raise HTTPException(status_code=500, detail="Could not save filters")

    # Filters changed → the cached match list is stale for this user only.
    try:
        await invalidate_user_cache(req.user_id)
    except Exception as cache_err:
        logger.warning(f"[matchmaking] cache invalidation skipped: {cache_err}")

    # Best-effort analytics sync to Supabase (never fails the request)
    try:
        preferences_data = {
            "distanceRadius": req.distance_radius,
            "ageRange": f"{req.age_min}-{req.age_max}" if req.age_min and req.age_max else None,
            "heightPreference": f"{req.height_min}-{req.height_max}" if req.height_min and req.height_max else None,
            "languagesTheySpeak": ",".join(req.languages) if req.languages else None,
            "favouriteGenres": ",".join(req.genres) if req.genres else None,
            "ottOrTheatrePreference": req.ott_theatre,
            "languagesTheyWatch": ",".join(req.film_languages) if req.film_languages else None,
            "religion": req.religion,
            "zodiacSign": req.zodiac,
            "siblings": req.siblings,
            "education": req.education,
            "travelFrequency": req.travel,
            "smokingPreference": req.smoking,
            "drinkingPreference": req.drinking,
            "exercisePreference": req.exercise,
            "petsPreference": req.pets,
            "familyPlanning": req.family_planning,
            "maritalStatus": req.marital_status,
            "foodPreference": req.food_preference,
            "intentPreference": req.intent,
        }
        await supabase.save_preferences_and_filters(req.user_id, preferences_data, None)
        if req.exclusive_toggles:
            await supabase.save_exclusive_toggle(req.user_id, req.exclusive_toggles, None)
        if req.expand_if_run_out_toggles:
            await supabase.save_expand_if_run_out(req.user_id, req.expand_if_run_out_toggles, None)
    except Exception as e:
        logger.warning(f"Supabase filters sync skipped for user {req.user_id}: {type(e).__name__}")

    logger.info(f"Saved filters for user {req.user_id}")
    return {"success": True, "message": "Filters saved successfully"}


class ModeRequest(BaseModel):
    user_id: str = ""  # ignored — the session identity is used
    mode: str  # 'buddy' or 'date'


@api_router.post("/user/mode")
async def save_user_mode(req: ModeRequest, request: Request):
    """Save user's selected mode to Supabase"""
    req.user_id = request.state.user_id
    if req.mode not in ("buddy", "date", "movie_buddy", "movie_date", "both"):
        raise HTTPException(status_code=400, detail="Invalid mode")
    try:
        await supabase.save_mode_selected(req.user_id, req.mode)
        logger.info(f"Saved mode to Supabase for user {req.user_id}: {req.mode}")
        return {"success": True, "message": "Mode saved successfully"}
    except Exception:
        logger.exception("Failed to save mode to Supabase")
        raise HTTPException(status_code=500, detail="Could not save mode")


@api_router.post("/user/swipe")
async def record_swipe(req: SwipeRequest, request: Request):
    """
    Record a swipe action and update user's taste vector.
    This is the core learning mechanism.

    ENHANCED:
    - Tracks "didn't watch" movies separately to avoid recommending similar content
    - Extracts comprehensive signals from all TMDB data
    - Uses reasons to understand what user values in films

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id
    if req.direction not in ("left", "right"):
        raise HTTPException(status_code=400, detail="direction must be 'left' or 'right'")
    if req.rating is not None and not (1 <= req.rating <= 5):
        raise HTTPException(status_code=400, detail="rating must be between 1 and 5")
    # Get movie details from TMDB for extracting features
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        movie_details = await enrich_movie_with_full_details(req.movie_id, http_client)
    
    if not movie_details:
        raise HTTPException(status_code=404, detail="Could not fetch movie details")
    
    # Determine if this is a "didn't watch" swipe
    is_didnt_watch = req.didnt_watch or (req.reason and any(
        phrase in req.reason.lower() 
        for phrase in ["didn't watch", "haven't seen", "not seen", "not watched", "unwatched"]
    ))
    
    # Record the swipe with comprehensive data
    swipe_record = {
        "user_id": req.user_id,
        "movie_id": req.movie_id,
        "movie_title": movie_details.get("title", ""),
        "direction": req.direction,
        "rating": req.rating,
        "reason": req.reason,
        "didnt_watch": is_didnt_watch,
        # Store comprehensive movie data for analysis
        "movie_genres": movie_details.get("genres", []),
        "movie_keywords": movie_details.get("keywords", [])[:15],
        "movie_actors": movie_details.get("cast_names", [])[:5],
        "movie_directors": movie_details.get("directors", []),
        "movie_language": movie_details.get("original_language", ""),
        "movie_content_type": movie_details.get("content_type", ""),
        "movie_era": movie_details.get("release_date", "")[:4] if movie_details.get("release_date") else "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.user_swipes.insert_one(swipe_record)
    
    # Get current taste vector
    taste_doc = await db.user_taste_vectors.find_one({"user_id": req.user_id})
    
    if taste_doc:
        taste_vector = TasteVector.from_dict(taste_doc.get("vector", {}))
    else:
        # Initialize empty taste vector if not exists
        taste_vector = TasteVector()
    
    # Handle "didn't watch" movies differently
    if is_didnt_watch:
        # Track what types of films user hasn't watched (to deprioritize similar content)
        await db.user_unwatched_patterns.update_one(
            {"user_id": req.user_id},
            {
                "$push": {
                    "unwatched_genres": {"$each": movie_details.get("genres", [])},
                    "unwatched_keywords": {"$each": movie_details.get("keywords", [])[:10]},
                    "unwatched_languages": movie_details.get("original_language", ""),
                },
                "$inc": {"unwatched_count": 1},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            },
            upsert=True
        )
        
        # Add negative signals for unwatched content patterns (mild negative weight)
        for genre in movie_details.get("genres", []):
            genre_key = "unwatched_" + genre_vector_key(genre)
            taste_vector.add_signal(genre_key, -0.15)  # Mild negative
        
        for keyword in movie_details.get("keywords", [])[:5]:
            keyword_key = f"unwatched_keyword_{keyword.lower().replace(' ', '_').replace('-', '_')}"
            taste_vector.add_signal(keyword_key, -0.1)  # Very mild negative
        
        logger.info(f"Recorded 'didn't watch' for user {req.user_id} on movie {req.movie_id}")
    else:
        # Normal swipe - update taste vector with full learning
        taste_vector = update_taste_vector_from_swipe(
            taste_vector,
            movie_details,
            req.direction,
            req.rating,
            req.reason
        )
        
        logger.info(f"Recorded {req.direction} swipe for user {req.user_id} on movie {req.movie_id}")
    
    # Save updated taste vector
    await db.user_taste_vectors.update_one(
        {"user_id": req.user_id},
        {"$set": {
            "user_id": req.user_id,
            "vector": taste_vector.to_dict(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )
    
    # Broadcast swipe to admin dashboard (real-time update) — skipped entirely
    # (incl. the two name lookups) when no admin dashboard is connected.
    if connected_admins:
        try:
            # Get user name for display
            user = await db.users.find_one({"user_id": req.user_id}, {"name": 1})
            profile = await db.user_profiles.find_one({"user_id": req.user_id}, {"name": 1})
            user_name = profile.get("name") if profile else (user.get("name") if user else req.user_id)

            await broadcast_new_swipe({
                "user_id": req.user_id,
                "user_name": user_name,
                "movie_id": req.movie_id,
                "movie_title": movie_details.get("title", ""),
                "direction": req.direction,
                "rating": req.rating,
                "reason": req.reason,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.error(f"Failed to broadcast swipe: {e}")
    
    # Save swipe to Supabase for analytics
    try:
        await supabase.save_movie_swipe(
            user_id=req.user_id,
            movie_name=movie_details.get("title", ""),
            swiped_direction=req.direction,
            rating_given=req.rating,
            reasons=req.reason if isinstance(req.reason, list) else [req.reason] if req.reason else None
        )
        
        # Also save movie to library if not already there
        await supabase.save_movie_to_library(movie_details)
        
        logger.info(f"Saved swipe to Supabase for user {req.user_id}")
    except Exception as e:
        logger.error(f"Failed to save swipe to Supabase: {e}")
    
    return {
        "success": True,
        "message": "Swipe recorded and taste vector updated",
        "total_swipes": taste_vector.total_swipes,
        "like_count": taste_vector.like_count,
        "dislike_count": taste_vector.dislike_count,
        "didnt_watch": is_didnt_watch,
    }


class LibraryAddRequest(BaseModel):
    user_id: str = ""  # ignored — the session identity is used
    movie_id: int
    movie_title: str
    poster_path: Optional[str] = None
    release_date: Optional[str] = None
    is_like: bool
    rating: int = 0
    reasons: List[str] = []
    didnt_watch: bool = False


@api_router.post("/user/library/add")
async def add_to_library(req: LibraryAddRequest, request: Request):
    """Add a movie to the user's personal library with rating

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id
    # Save to MongoDB
    library_entry = {
        "user_id": req.user_id,
        "movie_id": req.movie_id,
        "movie_title": req.movie_title,
        "poster_path": req.poster_path,
        "release_date": req.release_date,
        "is_like": req.is_like,
        "rating": req.rating,
        "reasons": req.reasons,
        "didnt_watch": req.didnt_watch,
        "source": "library",  # Mark as manually added from library
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    
    # Upsert to allow re-rating
    await db.user_library.update_one(
        {"user_id": req.user_id, "movie_id": req.movie_id},
        {"$set": library_entry},
        upsert=True
    )
    
    # Also record as a swipe to influence recommendations
    await db.user_swipes.update_one(
        {"user_id": req.user_id, "movie_id": req.movie_id},
        {"$set": {
            "user_id": req.user_id,
            "movie_id": req.movie_id,
            "direction": "right" if req.is_like else "left",
            "reason": ",".join(req.reasons) if req.reasons else None,
            "rating": req.rating if req.is_like else None,
            "didnt_watch": req.didnt_watch,
            "source": "library",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )
    
    # Record interaction and store movie in Supabase catalog if not already there
    try:
        exists = await supabase.check_movie_exists(req.movie_id)
        if not exists:
            # Fetch full movie details from TMDB and store
            async with httpx.AsyncClient(timeout=10.0) as http_client:
                resp = await http_client.get(
                    f"https://api.themoviedb.org/3/movie/{req.movie_id}",
                    params={"append_to_response": "credits,keywords"},
                    headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
                )
                if resp.status_code == 200:
                    movie_details = resp.json()
                    await supabase.save_movie_to_library(movie_details)
                    logger.info(f"Stored movie {req.movie_title} in Supabase catalog")
        else:
            await supabase.increment_movie_interaction(req.movie_id)
    except Exception as e:
        logger.warning(f"Failed to sync movie to Supabase catalog: {e}")
    
    logger.info(f"Added movie {req.movie_title} to library for user {req.user_id}")
    
    return {"success": True, "message": "Movie added to library"}


@api_router.get("/user/library")
async def get_user_library(request: Request, user_id: Optional[str] = None):
    """Get user's personal movie library

    AUTH: private — `user_id` (optional) must be the caller's own id.
    """
    if user_id:
        require_owner(user_id, request.state.user_id)
    user_id = request.state.user_id
    library = await db.user_library.find(
        {"user_id": user_id}
    ).sort("updated_at", -1).to_list(length=500)
    
    # Convert to response format
    movies = []
    for entry in library:
        movies.append({
            "id": entry["movie_id"],
            "title": entry["movie_title"],
            "poster_path": entry.get("poster_path"),
            "release_date": entry.get("release_date"),
            "isLike": entry["is_like"],
            "rating": entry.get("rating", 0),
            "reasons": entry.get("reasons", []),
            "ratedAt": entry.get("updated_at"),
        })
    
    return {"movies": movies, "total": len(movies)}


class MovieInteractionRequest(BaseModel):
    movie_id: int
    interaction_type: str  # "search_click", "library_add", "swipe"
    user_id: Optional[str] = None


@api_router.post("/movie/interaction")
async def record_movie_interaction(req: MovieInteractionRequest, request: Request):
    """
    Record a user interaction with a movie.
    This fetches full movie details from TMDB and stores them in Supabase
    ONLY if the movie hasn't been stored before.
    This creates a curated catalog of movies users have actually interacted with.

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id
    try:
        # First check if movie already exists in Supabase
        exists = await supabase.check_movie_exists(req.movie_id)
        
        if exists:
            # Just increment the interaction count
            await supabase.increment_movie_interaction(req.movie_id)
            return {
                "success": True, 
                "message": "Interaction recorded", 
                "new_movie": False
            }
        
        # Movie doesn't exist - fetch full details from TMDB
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            resp = await http_client.get(
                f"https://api.themoviedb.org/3/movie/{req.movie_id}",
                params={"append_to_response": "credits,keywords"},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            
            if resp.status_code == 200:
                movie_details = resp.json()
                
                # Save to Supabase movie library
                result = await supabase.save_movie_to_library(movie_details)
                
                if result.get("success"):
                    logger.info(f"Stored new movie in catalog: {movie_details.get('title')} (ID: {req.movie_id})")
                    return {
                        "success": True,
                        "message": "New movie added to catalog",
                        "new_movie": True,
                        "movie_title": movie_details.get("title")
                    }
                else:
                    logger.warning(f"Catalog save failed for movie {req.movie_id}")
                    return {
                        "success": False,
                        "error": "Failed to save movie"
                    }
            else:
                logger.warning(f"Failed to fetch movie {req.movie_id} from TMDB: {resp.status_code}")
                return {
                    "success": False,
                    "error": "Movie database unavailable"
                }

    except Exception:
        logger.exception("Error recording movie interaction")
        return {"success": False, "error": "Could not record interaction"}


@api_router.get("/movie/catalog/stats")
async def get_catalog_stats():
    """Get statistics about the movie catalog"""
    try:
        client = supabase.get_supabase_client()
        
        # Get total count
        result = client.table("movie_library").select("movie_id", count="exact").execute()
        total_movies = result.count if hasattr(result, 'count') else len(result.data)
        
        # Get top movies by popularity (fallback if interaction_count doesn't exist)
        try:
            top_movies = client.table("movie_library").select(
                "movie_id,movie_name,interaction_count,genres,vote_average"
            ).order("interaction_count", desc=True).limit(10).execute()
        except Exception:
            # Fallback to popularity
            top_movies = client.table("movie_library").select(
                "movie_id,movie_name,genres,vote_average,popularity"
            ).order("popularity", desc=True).limit(10).execute()
        
        return {
            "success": True,
            "total_movies_in_catalog": total_movies,
            "top_interacted_movies": top_movies.data if top_movies.data else []
        }
    except Exception:
        logger.exception("Error getting catalog stats")
        return {"success": False, "error": "Catalog stats unavailable"}


@api_router.post("/recommendations")
async def get_recommendations(req: RecommendationRequest, request: Request):
    """
    Get personalized movie recommendations using cosine similarity.
    This is the main recommendation endpoint.

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id
    if req.page < 1 or req.limit < 1 or req.limit > 100:
        raise HTTPException(status_code=400, detail="page must be >= 1 and limit between 1 and 100")
    # Get user's taste vector
    taste_doc = await db.user_taste_vectors.find_one({"user_id": req.user_id})
    
    if taste_doc:
        taste_vector = TasteVector.from_dict(taste_doc.get("vector", {}))
    else:
        # If no taste vector, try to initialize from profile
        profile = await db.user_profiles.find_one({"user_id": req.user_id})
        if profile:
            taste_vector = initialize_taste_vector_from_profile(profile)
        else:
            # Cold start: use empty vector (will get popular movies)
            taste_vector = TasteVector()
    
    # Get all swiped movie IDs to exclude
    swipes = await db.user_swipes.find(
        {"user_id": req.user_id},
        {"movie_id": 1}
    ).to_list(length=5000)  # Increased limit to ensure we get all swipes
    
    swiped_ids = set(s["movie_id"] for s in swipes)
    
    # Get user's top 5 movie IDs to exclude from feed
    profile = await db.user_profiles.find_one({"user_id": req.user_id})
    top_movie_ids = set()
    if profile:
        top_movies = profile.get("topMovies", [])
        for movie in top_movies:
            if movie.get("id"):
                top_movie_ids.add(movie.get("id"))
    
    # Get previously shown movie IDs (to prevent duplicates across pages)
    shown_doc = await db.user_shown_movies.find_one({"user_id": req.user_id})
    shown_movie_ids = set(shown_doc.get("movie_ids", [])) if shown_doc else set()
    
    # Combine all exclusions
    all_exclude_ids = swiped_ids | top_movie_ids | shown_movie_ids
    
    # Get personalized feed with USER-SPECIFIC randomization
    recommendations = await get_personalized_feed(
        taste_vector,
        all_exclude_ids,  # Pass all movies to exclude
        req.page,
        req.limit,
        user_id=req.user_id,
        top_movie_ids=top_movie_ids
    )
    
    # Track the movie IDs we're about to show (to avoid showing them again)
    new_shown_ids = [m["id"] for m in recommendations]
    if new_shown_ids:
        await db.user_shown_movies.update_one(
            {"user_id": req.user_id},
            {
                "$addToSet": {"movie_ids": {"$each": new_shown_ids}},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            },
            upsert=True
        )
    
    logger.info(f"Generated {len(recommendations)} recommendations for user {req.user_id} "
                f"(excluded {len(all_exclude_ids)} movies: {len(swiped_ids)} swiped + {len(top_movie_ids)} top + {len(shown_movie_ids)} shown)")
    
    return {
        "results": recommendations,
        "page": req.page,
        "total_swipes": taste_vector.total_swipes,
        "taste_dimensions": len(taste_vector.vector),
        "excluded_movies": len(all_exclude_ids),
    }


@api_router.get("/user/{user_id}/taste-profile")
async def get_taste_profile(user_id: str, request: Request):
    """
    Get user's taste profile for debugging/display.
    Shows top preferences in each dimension.

    AUTH: private — caller must own this user_id.
    """
    require_owner(user_id, request.state.user_id)
    taste_doc = await db.user_taste_vectors.find_one({"user_id": user_id})
    
    if not taste_doc:
        return {"message": "No taste profile found", "top_genres": [], "top_actors": [], "top_directors": []}
    
    vector_data = taste_doc.get("vector", {})
    vector = vector_data.get("vector", {})
    
    # Extract top preferences by category
    genres = [(k.replace("genre_", "").replace("_", " ").title(), v) 
              for k, v in vector.items() if k.startswith("genre_") and v > 0]
    actors = [(k.replace("actor_", "").replace("_", " ").title(), v) 
              for k, v in vector.items() if k.startswith("actor_") and v > 0]
    directors = [(k.replace("director_", "").replace("_", " ").title(), v) 
                 for k, v in vector.items() if k.startswith("director_") and v > 0]
    eras = [(k.replace("era_", ""), v) 
            for k, v in vector.items() if k.startswith("era_") and v > 0]
    
    # Sort by weight
    genres.sort(key=lambda x: x[1], reverse=True)
    actors.sort(key=lambda x: x[1], reverse=True)
    directors.sort(key=lambda x: x[1], reverse=True)
    eras.sort(key=lambda x: x[1], reverse=True)
    
    return {
        "user_id": user_id,
        "total_swipes": vector_data.get("total_swipes", 0),
        "like_count": vector_data.get("like_count", 0),
        "dislike_count": vector_data.get("dislike_count", 0),
        "top_genres": [{"name": g[0], "weight": round(g[1], 2)} for g in genres[:10]],
        "top_actors": [{"name": a[0], "weight": round(a[1], 2)} for a in actors[:10]],
        "top_directors": [{"name": d[0], "weight": round(d[1], 2)} for d in directors[:5]],
        "preferred_eras": [{"era": e[0], "weight": round(e[1], 2)} for e in eras[:5]],
    }


@api_router.get("/user/{user_id}/swipe-history")
async def get_swipe_history(user_id: str, request: Request, limit: int = 50):
    """Get user's recent swipe history

    AUTH: private — caller must own this user_id.
    """
    require_owner(user_id, request.state.user_id)
    _check_int_range(limit, "limit", 1, 500)
    swipes = await db.user_swipes.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=limit)
    
    return {
        "user_id": user_id,
        "swipes": swipes,
        "count": len(swipes)
    }


@api_router.delete("/user/{user_id}/reset-feed")
async def reset_user_feed(user_id: str, request: Request):
    """
    Reset user's swipe history to get fresh recommendations.
    Useful for:
    - Testing with fresh data
    - When user wants to re-explore content
    - When user's preferences have changed significantly
    
    Note: This does NOT reset the taste profile, only swipe history.

    AUTH: Caller must own this user_id.
    """
    require_owner(user_id, request.state.user_id)
    # Delete swipe history
    swipe_result = await db.user_swipes.delete_many({"user_id": user_id})
    
    # Delete shown movies tracking (so they can see movies again)
    shown_result = await db.user_shown_movies.delete_many({"user_id": user_id})
    
    # Reset swipe counts in taste vector (but keep preferences)
    taste_doc = await db.user_taste_vectors.find_one({"user_id": user_id})
    if taste_doc:
        vector_data = taste_doc.get("vector", {})
        vector_data["like_count"] = 0
        vector_data["dislike_count"] = 0
        vector_data["total_swipes"] = 0
        
        await db.user_taste_vectors.update_one(
            {"user_id": user_id},
            {"$set": {"vector": vector_data, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    # Delete unwatched patterns
    await db.user_unwatched_patterns.delete_many({"user_id": user_id})
    
    logger.info(f"Reset feed for user {user_id}: deleted {swipe_result.deleted_count} swipes, {shown_result.deleted_count} shown records")
    
    return {
        "success": True,
        "message": f"Feed reset successfully. Deleted {swipe_result.deleted_count} swipes.",
        "swipes_deleted": swipe_result.deleted_count,
    }


@api_router.delete("/user/{user_id}/reset-all")
async def reset_user_completely(user_id: str, request: Request):
    """
    DELETE ACCOUNT — permanently removes the user and their data (Google
    Play's account-deletion requirement). The app calls this from
    Profile → Delete account, then wipes local state and signs out.

    Removed: the account + every session, profile, taste vector, swipes,
    shown/unwatched history, library, filters, photos (Mongo record AND the
    files in Supabase Storage), conversations + messages + requests the user
    is part of, Tina sessions/personality, match caches, pending OTPs, and
    the user's rows in the Supabase analytics tables.
    Kept on purpose: chat_reports / meeting_reports (trust & safety records).

    AUTH: Caller must own this user_id.
    """
    require_owner(user_id, request.state.user_id)
    uid = user_id
    deleted: Dict[str, int] = {}

    async def _purge(collection: str, query: Dict[str, Any]) -> None:
        try:
            res = await db[collection].delete_many(query)
            deleted[collection] = deleted.get(collection, 0) + res.deleted_count
        except Exception:
            logger.exception("[delete-account] %s cleanup failed", collection)

    user_doc = await db.users.find_one({"user_id": uid}, {"_id": 0, "phone": 1}) or {}

    # 1. Photos: storage files first (needs the Mongo record), then the record.
    for slot in range(1, 6):
        try:
            await delete_picture_from_storage(uid, slot)
        except Exception:
            logger.warning("[delete-account] photo slot %s cleanup failed", slot)

    def _purge_storage_folder() -> int:
        # Catch orphaned uploads that are no longer referenced by a slot.
        from supabase_service import get_supabase_client
        bucket = get_supabase_client().storage.from_("profile-pictures")
        names = [o.get("name") for o in (bucket.list(uid) or []) if o.get("name")]
        if names:
            bucket.remove([f"{uid}/{n}" for n in names])
        return len(names)

    try:
        deleted["storage_files"] = await asyncio.wait_for(asyncio.to_thread(_purge_storage_folder), timeout=20)
    except Exception:
        logger.warning("[delete-account] storage folder cleanup skipped")
    await _purge("user_pictures", {"user_id": uid})

    # 2. Conversations the user is part of (both sides' messages go with it).
    try:
        conv_ids = [
            c["conversation_id"]
            async for c in db.chat_conversations.find({"participants": uid}, {"_id": 0, "conversation_id": 1})
            if c.get("conversation_id")
        ]
    except Exception:
        conv_ids = []
        logger.exception("[delete-account] conversation lookup failed")
    if conv_ids:
        await _purge("chat_messages", {"conversation_id": {"$in": conv_ids}})
    await _purge("chat_messages", {"sender_id": uid})
    await _purge("chat_conversations", {"participants": uid})
    await _purge("chat_requests", {"$or": [{"from_user_id": uid}, {"to_user_id": uid}]})

    # 3. Profile, taste, activity, preferences, Tina, caches.
    for collection in (
        "user_profiles", "user_taste_vectors", "user_swipes", "user_shown_movies",
        "user_unwatched_patterns", "user_library", "user_filters",
        "tina_sessions", "tina_profiles",
    ):
        await _purge(collection, {"user_id": uid})
    await _purge("match_cache", {"$or": [{"user_id": uid}, {"owner_id": uid}]})
    if user_doc.get("phone"):
        await _purge("otp_codes", {"identifier": user_doc["phone"]})

    # 4. Supabase analytics copies (best effort; tables may not exist).
    def _purge_supabase() -> int:
        from supabase_service import get_supabase_client
        client = get_supabase_client()
        targets = [
            ("user_logged_in", "user_id"), ("user_sign_up_details", "user_id"),
            ("preferences_and_filters", "user_id"), ("exclusive_toggle", "user_id"),
            ("expand_if_run_out", "user_id"), ("mode_selected", "user_id"),
            ("top_5_movies", "user_id"), ("toggle_visibility_profile", "user_id"),
            ("movie_swipes", "user_id"), ("tina_chat_messages", "user_id"),
            ("tina_persona_360", "user_id"), ("user_pictures", "user_id"),
            ("match_events", "user_id"), ("unmatch_events", "user_id"),
            ("user_chat_messages", "sender_id"), ("report_events", "reporter_id"),
        ]
        done = 0
        for table, column in targets:
            try:
                client.table(table).delete().eq(column, uid).execute()
                done += 1
            except Exception:
                logger.warning("[delete-account] supabase %s cleanup skipped", table)
        return done

    try:
        deleted["supabase_tables"] = await asyncio.wait_for(asyncio.to_thread(_purge_supabase), timeout=30)
    except Exception:
        logger.warning("[delete-account] supabase cleanup skipped")

    # 5. Finally the account itself and every session (logs the user out).
    await _purge("user_sessions", {"user_id": uid})
    await _purge("users", {"user_id": uid})

    logger.info("[delete-account] account %s deleted", uid)
    return {
        "success": True,
        "message": "Your account and data have been deleted.",
        "deleted": deleted,
    }


# =============================================
# Admin Dashboard Endpoints
# =============================================

# Single admin account configured via env (settings.py): ADMIN_USERNAME +
# ADMIN_PASSWORD_HASH (bcrypt). No hardcoded credentials.

# Admin tokens store (in-memory; 24h aging enforced by get_current_admin and
# the Socket.IO connect handler)
admin_tokens: Dict[str, Dict[str, Any]] = {}


class AdminLoginRequest(BaseModel):
    # The dashboard form historically posts `email`; `username` is preferred.
    username: Optional[str] = None
    email: Optional[str] = None
    password: str


class AdminReportUpdate(BaseModel):
    status: str


@api_router.post("/admin/login")
async def admin_login(req: AdminLoginRequest, request: Request):
    """Admin login endpoint (rate-limited per IP)."""
    LOGIN_ATTEMPT_LIMITER.check_or_raise(f"admin:{client_ip(request)}")
    if not settings.admin_password_hash:
        raise HTTPException(status_code=503, detail="Admin login disabled (ADMIN_PASSWORD_HASH not set)")

    username = (req.username or req.email or "").strip()
    try:
        # Always run the bcrypt check so timing doesn't reveal the username.
        # bcrypt only uses the first 72 bytes (bcrypt>=5 raises beyond that).
        password_ok = bcrypt.checkpw(
            req.password.encode("utf-8")[:72], settings.admin_password_hash.encode("utf-8")
        )
    except ValueError:
        logger.error("ADMIN_PASSWORD_HASH is not a valid bcrypt hash")
        raise HTTPException(status_code=503, detail="Admin login disabled (ADMIN_PASSWORD_HASH is invalid)")
    username_ok = hmac.compare_digest(username.encode("utf-8"), settings.admin_username.encode("utf-8"))
    if not (username_ok and password_ok):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    admin_name = "Admin"
    admin_role = "super_admin"
    token = f"admin_{uuid.uuid4().hex}"
    admin_tokens[token] = {
        "username": username,
        "email": username,
        "name": admin_name,
        "role": admin_role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Also store admin in database for role management / last-login audit
    try:
        await db.admins.update_one(
            {"username": username},
            {"$set": {
                "username": username,
                "name": admin_name,
                "role": admin_role,
                "last_login": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True
        )
    except Exception:
        logger.exception("Admin last-login audit write failed")

    return {
        "token": token,
        "admin": {
            "id": username,
            "email": username,
            "name": admin_name,
            "role": admin_role,
        }
    }


@api_router.get("/admin/metrics")
async def get_admin_metrics():
    """Get dashboard metrics"""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    
    # Total users
    total_users = await db.users.count_documents({})
    
    # Users created today
    new_signups_today = await db.users.count_documents({
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    # Get all profiles for gender distribution
    profiles = await db.user_profiles.find({}, {"gender": 1}).to_list(length=10000)
    male = sum(1 for p in profiles if p.get("gender", "").lower() in ["male", "man", "m"])
    female = sum(1 for p in profiles if p.get("gender", "").lower() in ["female", "woman", "f"])
    other = len(profiles) - male - female
    total_with_gender = male + female + other or 1
    
    # Swipes today
    swipes_today = await db.user_swipes.count_documents({
        "created_at": {"$gte": today_start.isoformat()}
    })

    # Total matches = accepted chats (chat_conversations.status == "active")
    try:
        total_matches = await db.chat_conversations.count_documents({"status": "active"})
    except Exception:
        logger.exception("Admin metrics: match count failed")
        total_matches = 0
    
    # Active users (users with swipes in the last 24 hours)
    active_today = await db.user_swipes.distinct("user_id", {
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    # WAU/MAU approximations
    wau_users = await db.user_swipes.distinct("user_id", {
        "created_at": {"$gte": week_ago.isoformat()}
    })
    mau_users = await db.user_swipes.distinct("user_id", {
        "created_at": {"$gte": month_ago.isoformat()}
    })
    
    return {
        "totalUsers": total_users,
        "activeToday": len(active_today),
        "dau": len(active_today),
        "wau": len(wau_users),
        "mau": len(mau_users),
        "newSignupsToday": new_signups_today,
        "totalMatches": total_matches,
        "totalSwipesToday": swipes_today,
        "avgSessionDuration": 12,  # Placeholder
        "subscriptionRate": 0,  # Placeholder
        "retentionRate": 68,  # Placeholder
        "genderDistribution": {
            "male": round(male / total_with_gender * 100),
            "female": round(female / total_with_gender * 100),
            "other": round(other / total_with_gender * 100),
        }
    }


@api_router.get("/admin/users")
async def get_admin_users(limit: int = 500, skip: int = 0):
    """Get all users with their complete profiles - merges data from users and user_profiles tables"""
    _check_int_range(limit, "limit", 1, 1000)
    _check_int_range(skip, "skip", 0, 1_000_000)

    # Get all users from both tables
    auth_users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=1000)
    profile_users = await db.user_profiles.find({}, {"_id": 0}).sort("updated_at", -1).to_list(length=1000)
    
    # Create a map of all users by user_id
    all_users = {}
    
    # First add auth users (these have login credentials)
    for user in auth_users:
        uid = user.get("user_id", "")
        all_users[uid] = {
            "user_id": uid,
            "name": user.get("name", ""),
            "email": user.get("email", ""),
            "phone": user.get("phone", ""),
            "created_at": user.get("created_at", ""),
            "last_active": user.get("last_active", ""),
            "status": user.get("status", "active"),
            "subscription": user.get("subscription", "free"),
            "has_profile": False,
            # Empty profile fields
            "gender": "",
            "age": None,
            "height": "",
            "location": "",
            "city": "",
            "bio": "",
            "zodiac": "",
            "religion": "",
            "education": "",
            "workProfile": "",
            "maritalStatus": "",
            "siblings": "",
            "familyPlanning": "",
            "drinking": "",
            "smoking": "",
            "exercise": "",
            "foodPreference": "",
            "pets": "",
            "travel": "",
            "languagesSpoken": [],
            "relationshipIntent": [],
            "partnerPreference": "",
            "movieDateMode": False,
            "movieBuddyMode": False,
            "movieFrequency": "",
            "ottTheatre": "",
            "genres": [],
            "filmLanguages": [],
            "topMovies": [],
            "topMoviesEnriched": [],
            "total_swipes": 0,
            "total_matches": 0,
        }
    
    # Then add/merge profile users (these have detailed profile info)
    for profile in profile_users:
        uid = profile.get("user_id", "")
        swipe_count = await db.user_swipes.count_documents({"user_id": uid})
        
        profile_data = {
            "user_id": uid,
            "name": profile.get("name", ""),
            "email": profile.get("email", ""),
            "phone": profile.get("phone", ""),
            "gender": profile.get("gender", ""),
            "age": profile.get("age"),
            "height": profile.get("height", ""),
            "location": profile.get("location", ""),
            "city": profile.get("city", ""),
            "bio": profile.get("bio", ""),
            "zodiac": profile.get("zodiac", ""),
            "religion": profile.get("religion", ""),
            "education": profile.get("education", ""),
            "workProfile": profile.get("workProfile", ""),
            "maritalStatus": profile.get("maritalStatus", ""),
            "siblings": profile.get("siblings", ""),
            "familyPlanning": profile.get("familyPlanning", ""),
            "drinking": profile.get("drinking", ""),
            "smoking": profile.get("smoking", ""),
            "exercise": profile.get("exercise", ""),
            "foodPreference": profile.get("foodPreference", ""),
            "pets": profile.get("pets", ""),
            "travel": profile.get("travel", ""),
            "languagesSpoken": profile.get("languagesSpoken", []),
            "relationshipIntent": profile.get("relationshipIntent", []),
            "partnerPreference": profile.get("partnerPreference", ""),
            "movieDateMode": profile.get("movieDateMode", False),
            "movieBuddyMode": profile.get("movieBuddyMode", False),
            "movieFrequency": profile.get("movieFrequency", ""),
            "ottTheatre": profile.get("ottTheatre", ""),
            "genres": profile.get("genres", []),
            "filmLanguages": profile.get("filmLanguages", []),
            "topMovies": profile.get("topMovies", []),
            "topMoviesEnriched": profile.get("topMoviesEnriched", []),
            "created_at": profile.get("created_at", profile.get("updated_at", "")),
            "last_active": profile.get("updated_at", ""),
            "status": "active",
            "subscription": "free",
            "total_swipes": swipe_count,
            "total_matches": 0,
            "has_profile": True,
        }
        
        if uid in all_users:
            # Merge with existing auth user - keep auth email/phone if profile doesn't have them
            existing = all_users[uid]
            profile_data["email"] = profile_data["email"] or existing.get("email", "")
            profile_data["phone"] = profile_data["phone"] or existing.get("phone", "")
            profile_data["created_at"] = existing.get("created_at") or profile_data["created_at"]
            all_users[uid] = profile_data
        else:
            # New user from profiles (not in auth table)
            all_users[uid] = profile_data
    
    # Convert to list and sort by created_at (most recent first)
    enriched_users = list(all_users.values())
    enriched_users.sort(key=lambda x: x.get("created_at", "") or "", reverse=True)
    
    # Apply pagination
    paginated = enriched_users[skip:skip + limit]
    
    return {"users": paginated, "total": len(enriched_users)}


@api_router.get("/admin/swipes")
async def get_admin_swipes(limit: int = 500, user_id: str = None):
    """Get all swipes with user info"""
    _check_int_range(limit, "limit", 1, 1000)
    query = {}
    if user_id:
        query["user_id"] = user_id
    
    swipes = await db.user_swipes.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(length=limit)
    
    # Get user names for each swipe
    user_ids = list(set(s["user_id"] for s in swipes))
    users = await db.users.find({"user_id": {"$in": user_ids}}, {"user_id": 1, "name": 1}).to_list(length=len(user_ids))
    user_map = {u["user_id"]: u.get("name", "") for u in users}
    
    # Also check profiles for names
    profiles = await db.user_profiles.find({"user_id": {"$in": user_ids}}, {"user_id": 1, "name": 1}).to_list(length=len(user_ids))
    for p in profiles:
        if p.get("name"):
            user_map[p["user_id"]] = p["name"]
    
    enriched_swipes = []
    for swipe in swipes:
        enriched_swipes.append({
            **swipe,
            "user_name": user_map.get(swipe["user_id"], swipe["user_id"]),
        })
    
    return {"swipes": enriched_swipes, "total": len(enriched_swipes)}


@api_router.get("/admin/matches")
async def get_admin_matches(limit: int = 500):
    """Get all matches — an accepted chat (chat_conversations.status "active")
    is a match. Shaped as {user1_id, user2_id, matched_at, ...} for the
    dashboard's MatchesTab."""
    limit = max(1, min(limit, 1000))
    try:
        convs = await db.chat_conversations.find(
            {"status": "active"},
            {"_id": 0, "conversation_id": 1, "participants": 1, "created_at": 1,
             "last_message_at": 1, "initiated_by": 1, "meeting_status": 1},
        ).sort("created_at", -1).limit(limit).to_list(length=limit)
    except Exception:
        logger.exception("Admin matches query failed")
        convs = []
    matches = []
    for c in convs:
        parts = list(c.get("participants") or [])
        if len(parts) < 2:
            continue
        matches.append({
            "_id": c.get("conversation_id"),
            "conversation_id": c.get("conversation_id"),
            "user1_id": parts[0],
            "user2_id": parts[1],
            "matched_at": c.get("created_at"),
            "last_message_at": c.get("last_message_at"),
            "initiated_by": c.get("initiated_by"),
            "meeting_status": c.get("meeting_status"),
        })

    # Get user names
    user_ids = []
    for m in matches:
        user_ids.extend([m.get("user1_id"), m.get("user2_id")])
    user_ids = list(set(filter(None, user_ids)))
    
    if user_ids:
        profiles = await db.user_profiles.find({"user_id": {"$in": user_ids}}, {"user_id": 1, "name": 1}).to_list(length=len(user_ids))
        name_map = {p["user_id"]: p.get("name", "") for p in profiles}
    else:
        name_map = {}
    
    enriched_matches = []
    for match in matches:
        enriched_matches.append({
            **match,
            "user1_name": name_map.get(match.get("user1_id"), ""),
            "user2_name": name_map.get(match.get("user2_id"), ""),
        })
    
    return {"matches": enriched_matches, "total": len(enriched_matches)}


@api_router.get("/admin/reports")
async def get_admin_reports(limit: int = 100):
    """Get user reports for moderation (chat_reports, written by
    chat_service.report_user and keyed by `report_id`)."""
    limit = max(1, min(limit, 1000))
    try:
        reports = await db.chat_reports.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(length=limit)
    except Exception:
        logger.exception("Admin reports query failed")
        reports = []
    for r in reports:
        # Dashboard (ReportsTab) reads `id` and `description`.
        r.setdefault("id", r.get("report_id"))
        r.setdefault("description", r.get("details") or "")

    # Get user names
    user_ids = []
    for r in reports:
        user_ids.extend([r.get("reporter_id"), r.get("reported_id")])
    user_ids = list(set(filter(None, user_ids)))
    
    if user_ids:
        profiles = await db.user_profiles.find({"user_id": {"$in": user_ids}}, {"user_id": 1, "name": 1}).to_list(length=len(user_ids))
        name_map = {p["user_id"]: p.get("name", "") for p in profiles}
    else:
        name_map = {}
    
    enriched_reports = []
    for report in reports:
        enriched_reports.append({
            **report,
            "reporter_name": name_map.get(report.get("reporter_id"), "Unknown"),
            "reported_name": name_map.get(report.get("reported_id"), "Unknown"),
        })
    
    return {"reports": enriched_reports, "total": len(enriched_reports)}


@api_router.patch("/admin/reports/{report_id}")
async def update_report_status(report_id: str, req: AdminReportUpdate):
    """Update report status"""
    if req.status not in ("pending", "reviewed", "resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.chat_reports.update_one(
        {"report_id": report_id},
        {"$set": {"status": req.status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"success": True}


@api_router.patch("/admin/users/{user_id}/status")
async def update_user_status(user_id: str, status: str):
    """Update user status (active, inactive, banned)"""
    if status not in ("active", "inactive", "banned"):
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True}


class BanUserRequest(BaseModel):
    reason: Optional[str] = None


@api_router.post("/admin/users/{user_id}/ban")
async def ban_user(user_id: str, req: BanUserRequest = None):
    """Ban a user"""
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "status": "banned",
            "banned_at": datetime.now(timezone.utc).isoformat(),
            "ban_reason": req.reason if req else None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Broadcast user update to admin dashboard (PII stripped in broadcast_user_updated)
    if connected_admins:
        updated_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        await broadcast_user_updated(updated_user)

    # The free-text reason is moderation content — never logged.
    logger.info(f"User {user_id} has been banned")
    return {"success": True, "message": f"User {user_id} has been banned"}


@api_router.post("/admin/users/{user_id}/unban")
async def unban_user(user_id: str):
    """Unban a user"""
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "status": "active",
            "unbanned_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        },
        "$unset": {
            "banned_at": "",
            "ban_reason": ""
        }}
    )
    
    # Broadcast user update to admin dashboard (PII stripped in broadcast_user_updated)
    if connected_admins:
        updated_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        await broadcast_user_updated(updated_user)

    logger.info(f"User {user_id} has been unbanned")
    return {"success": True, "message": f"User {user_id} has been unbanned"}


@api_router.get("/admin/users/{user_id}")
async def get_user_details(user_id: str):
    """Get detailed user information"""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    profile = await db.user_profiles.find_one({"user_id": user_id}, {"_id": 0})
    swipe_count = await db.user_swipes.count_documents({"user_id": user_id})
    
    # Get recent swipes
    recent_swipes = await db.user_swipes.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(length=20)
    
    return {
        **user,
        "profile": profile,
        "total_swipes": swipe_count,
        "recent_swipes": recent_swipes
    }


# =============================================
# Matchmaking API Endpoints
# =============================================

class MatchRequest(BaseModel):
    """Request for AI-based matches"""
    user_id: str = ""  # ignored — the session identity is used
    filters: Optional[Dict] = None
    limit: int = 15
    force_refresh: bool = False  # If True, bypass cache and regenerate matches
    mode: str = "date"  # 'buddy' or 'date' - determines which mode users to match with


def _top_taste_names(weights: Dict[str, Any], prefix: str, n: int = 5) -> List[str]:
    """Top-n positively weighted names under `prefix` ("actor_", "director_")
    in a stored taste vector, e.g. "actor_christian_bale" -> "Christian Bale"."""
    scored = [
        (key[len(prefix):].replace("_", " ").title(), value)
        for key, value in weights.items()
        if key.startswith(prefix) and isinstance(value, (int, float)) and value > 0
    ]
    scored.sort(key=lambda item: item[1], reverse=True)
    return [name for name, _ in scored[:n]]


@api_router.post("/matches")
async def get_matches(req: MatchRequest, request: Request):
    """
    Get AI-matched profiles for a user.

    1. Fetches user profile
    2. Applies hard filters (gender, age, language, intent)
    3. Uses LLM to score compatibility based on movie taste
    4. Returns top matches with explanations

    AUTH: the body `user_id` is ignored — the session identity is used.
    No stored profile → {"matches": [], "reason": "profile_incomplete"}.
    """
    req.user_id = request.state.user_id
    if req.limit < 1 or req.limit > 200:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 200")
    # force_refresh re-runs the (LLM-backed) scorer: max 3 per 10 min per
    # user. Over the limit we quietly serve the cached list instead of a 429.
    force_refresh = req.force_refresh
    if force_refresh:
        allowed, _retry = MATCH_REFRESH_LIMITER.hit(f"match_refresh:{req.user_id}")
        if not allowed:
            force_refresh = False
    try:
        # Get user profile from database
        user_profile = await db.user_profiles.find_one({"user_id": req.user_id}, {"_id": 0})
        if not user_profile:
            return {
                "success": True,
                "matches": [],
                "total_candidates": 0,
                "cached": False,
                "reason": "profile_incomplete",
            }

        # Get user's swipe history for taste analysis
        swipes = await db.user_swipes.find(
            {"user_id": req.user_id}, {"_id": 0, "direction": 1, "movie_genres": 1}
        ).to_list(length=100)

        # Build taste profile from swipes (swipe docs store `movie_genres`)
        liked_genres = set()
        disliked_genres = set()

        for swipe in swipes:
            genres = [g for g in (swipe.get("movie_genres") or []) if isinstance(g, str)]
            if swipe.get("direction") == "right":
                liked_genres.update(genres)
            else:
                disliked_genres.update(genres)

        # Liked actors / directors come from the learned taste vector (if any)
        taste_doc = await db.user_taste_vectors.find_one(
            {"user_id": req.user_id}, {"_id": 0, "vector": 1}
        )
        weights = ((taste_doc or {}).get("vector") or {}).get("vector") or {}
        if not isinstance(weights, dict):
            weights = {}

        # Construct profile for matching — only what the user actually stored
        profile_for_matching = {
            "user_id": req.user_id,
            "name": user_profile.get("name") or "",
            "age": user_profile.get("age"),
            "gender": user_profile.get("gender") or "",
            "location": user_profile.get("location") or "",
            "partnerPreference": user_profile.get("partnerPreference") or "",
            "relationshipIntent": user_profile.get("relationshipIntent") or [],
            "genres": user_profile.get("genres") or [],
            "filmLanguages": user_profile.get("filmLanguages") or [],
            "languagesSpoken": user_profile.get("languagesSpoken") or [],
            "topMovies": user_profile.get("topMovies") or [],
            "movieFrequency": user_profile.get("movieFrequency") or "",
            "ottTheatre": user_profile.get("ottTheatre") or "",
            "bio": user_profile.get("bio") or "",
            "movieBuddyMode": bool(user_profile.get("movieBuddyMode", False)),
            "movieDateMode": bool(user_profile.get("movieDateMode", True)),
            # Server-side only (distance filter); never echoed to clients.
            "coordinates": user_profile.get("coordinates"),
            "swipe_history": {
                "liked_genres": list(liked_genres) or list(user_profile.get("genres") or []),
                "disliked_genres": list(disliked_genres),
                "liked_actors": _top_taste_names(weights, "actor_"),
                "liked_directors": _top_taste_names(weights, "director_"),
            }
        }

        # ---- 360° Persona signals — flow into AI matchmaking prompt ----
        try:
            tina_profile = await get_tina_personality(req.user_id)
            if tina_profile:
                profile_for_matching["personality_360"] = {
                    "archetype": tina_profile.get("archetype", {}),
                    "primary_love_language": tina_profile.get("primary_love_language"),
                    "intent": tina_profile.get("intent", {}),
                    "extra": tina_profile.get("extra", {}),
                }
        except Exception as e:
            logger.warning(f"360 persona fetch failed for matchmaking: {type(e).__name__}")

        # Get matches using AI (with caching)
        matches = await get_matches_for_user(
            user_id=req.user_id,
            user_profile=profile_for_matching,
            filters=req.filters,
            use_mock_data=settings.mock_feed_profiles,  # blend mock profiles (env flag)
            force_refresh=force_refresh,  # Pass cache bypass option (rate-limited)
            mode=req.mode,  # Pass the user's current mode (buddy/date)
            top_n=max(req.limit, 30),  # Plumb the caller's limit all the way
            # down so the AI scorer doesn't silently truncate to 15. Floor at
            # 30 so the cached pool is always rich enough for downstream
            # filtering / pagination.
        )

        logger.info(f"Found {len(matches)} matches for user {req.user_id} (mode={req.mode}, force_refresh={force_refresh})")

        # Audit: log matches_generated event (non-blocking)
        try:
            await supabase.log_match_event(
                user_id=req.user_id,
                event_type="matches_generated",
                mode=req.mode,
                source="ai_matchmaking" if force_refresh else "cache",
                payload={"count": len(matches), "limit": req.limit, "force_refresh": force_refresh},
            )
        except Exception as _e:
            logger.debug(f"audit (matches_generated) skipped: {_e}")

        return {
            "success": True,
            "matches": matches[:req.limit],
            "total_candidates": len(matches),
            "cached": not force_refresh  # Indicate if results may be cached
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Match error")
        raise HTTPException(status_code=500, detail="Could not load matches")


@api_router.get("/matches/profile/{user_id}")
async def get_match_profile(user_id: str, request: Request, viewer_id: Optional[str] = None):
    """Get detailed profile of a matched user.

    AUTH: the `viewer_id` query param is ignored — the viewer is the session
    user. Other users' profiles go through the public whitelist
    (_public_profile_view); the caller's own id returns the full doc.
    """
    viewer_id = request.state.user_id
    # Audit: log profile_viewed event (non-blocking)
    if viewer_id != user_id:
        try:
            await supabase.log_match_event(
                user_id=viewer_id,
                event_type="profile_viewed",
                target_user_id=user_id,
                source="feed",
            )
        except Exception as _e:
            logger.debug(f"audit (profile_viewed) skipped: {_e}")

    profile = await _profile_for_viewer(user_id, viewer_id)
    if profile is not None:
        return {
            "success": True,
            "profile": profile
        }

    raise HTTPException(status_code=404, detail="User not found")


@api_router.get("/matches/mock-users")
async def get_mock_users():
    """Get all mock users for testing (DEV-ONLY: ENABLE_DEV_ROUTES)"""
    if not settings.enable_dev_routes:
        raise HTTPException(status_code=404, detail="Not found")
    users = get_all_mock_users()
    return {
        "success": True,
        "users": users,
        "total": len(users)
    }


# =============================================
# Profile Pictures API Endpoints
# =============================================

@api_router.get("/user/profile/{user_id}")
async def get_user_profile_by_id(user_id: str, request: Request):
    """Get user profile by ID (supports mock users for testing).

    AUTH: your own id → the full stored profile; anyone else's → the public,
    visibility-filtered whitelist (_public_profile_view).
    """
    viewer_id = request.state.user_id
    profile = await _profile_for_viewer(user_id, viewer_id)
    if profile is not None:
        return {
            "success": True,
            "profile": profile
        }

    # Check basic user info (account exists but no profile saved yet)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "name": 1, "email": 1})
    if user:
        basic = {"user_id": user_id, "name": user.get("name", "Unknown")}
        if user_id == viewer_id:
            basic["email"] = user.get("email")
        return {
            "success": True,
            "profile": basic
        }

    raise HTTPException(status_code=404, detail="User not found")


class PictureUploadRequest(BaseModel):
    """Request to upload a profile picture"""
    user_id: str
    session_id: Optional[str] = None  # legacy audit tag; clients no longer send it
    picture_number: int  # 1-5
    image_data: str  # Base64 encoded image
    content_type: str = "image/jpeg"


class PicturesUpdateRequest(BaseModel):
    """Request to update multiple pictures at once"""
    user_id: str
    session_id: Optional[str] = None  # legacy audit tag; clients no longer send it
    pictures: Dict[str, Optional[str]]  # {"picture_1": "base64...", "picture_2": "base64...", ...}


def _reject_oversized_picture(image_data: Optional[str]) -> None:
    """413 before any base64 decoding when the payload is over the cap."""
    if image_data and len(image_data) > PICTURE_MAX_B64_CHARS:
        raise HTTPException(status_code=413, detail="Image too large (max 5 MB)")


@api_router.post("/user/pictures/upload")
async def upload_picture(req: PictureUploadRequest, request: Request):
    """
    Upload a single profile picture.
    Stores image in Supabase storage and updates user_pictures table.

    AUTH: req.user_id must match the authenticated user.
    """
    require_owner(req.user_id, request.state.user_id)
    _reject_oversized_picture(req.image_data)
    try:
        if req.picture_number < 1 or req.picture_number > 5:
            raise HTTPException(status_code=400, detail="picture_number must be between 1 and 5")
        if not req.image_data or len(req.image_data) < 32:
            raise HTTPException(status_code=400, detail="image_data is empty or too small")

        picture_url = await upload_picture_to_storage(
            user_id=req.user_id,
            picture_data=req.image_data,
            picture_number=req.picture_number,
            content_type=req.content_type
        )
        if not picture_url:
            # The service returns None for: invalid base64, oversized file
            # or unsupported MIME. Return a 400 (client error) with a clearer
            # message so the frontend can show something better than the
            # generic "Upload Failed. Please try again."
            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not process this image. Make sure it's a JPEG, PNG "
                    "or WEBP under 5 MB and try again."
                ),
            )

        success = await update_single_picture(
            user_id=req.user_id,
            session_id=req.session_id,
            picture_number=req.picture_number,
            picture_url=picture_url
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save picture to database")

        logger.info(f"Uploaded picture {req.picture_number} for user {req.user_id}")
        return {
            "success": True,
            "picture_number": req.picture_number,
            "picture_url": picture_url,
        }
    except HTTPException:
        raise
    except PhotoStorageUnavailable:
        logger.exception("Picture upload: photo storage unavailable")
        raise HTTPException(status_code=503, detail="Photo storage unavailable")
    except Exception:
        logger.exception("Picture upload error")
        raise HTTPException(status_code=500, detail="Could not upload picture")


@api_router.post("/user/pictures/upload-batch")
async def upload_pictures_batch(req: PicturesUpdateRequest, request: Request):
    """
    Upload multiple pictures at once.
    Used during onboarding to upload all pictures in one request.

    AUTH: req.user_id must match the authenticated user.
    """
    require_owner(req.user_id, request.state.user_id)
    if len(req.pictures) > 5:
        raise HTTPException(status_code=400, detail="At most 5 pictures per batch")
    for image_data in req.pictures.values():
        _reject_oversized_picture(image_data)
    try:
        picture_urls = {}
        errors = []

        for key, image_data in req.pictures.items():
            if not image_data:
                continue

            # Extract picture number from key (e.g., "picture_1" -> 1)
            try:
                picture_number = int(key.split("_")[1])
            except (IndexError, ValueError):
                errors.append(f"Invalid key format: {key[:20]}")
                continue
            
            if picture_number < 1 or picture_number > 5:
                errors.append(f"Invalid picture number: {picture_number}")
                continue
            
            # Upload to storage
            picture_url = await upload_picture_to_storage(
                user_id=req.user_id,
                picture_data=image_data,
                picture_number=picture_number,
                content_type="image/jpeg"
            )
            
            if picture_url:
                picture_urls[f"picture_{picture_number}"] = picture_url
            else:
                errors.append(f"Failed to upload picture_{picture_number}")
        
        if not picture_urls:
            raise HTTPException(status_code=400, detail="No pictures were uploaded successfully")
        
        # Save all URLs to database
        success = await save_user_pictures(
            user_id=req.user_id,
            session_id=req.session_id,
            picture_urls=picture_urls
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save pictures to database")

        # Audit: log every picture in the batch (one row each in user_pictures
        # table — previously the batch endpoint silently skipped audit, only
        # the single-image endpoint logged events).
        try:
            for key, url in picture_urls.items():
                try:
                    picture_number = int(key.split("_")[1])
                except Exception:
                    continue
                await supabase.log_picture_event(
                    user_id=req.user_id,
                    picture_number=picture_number,
                    action="upload",
                    picture_url=url,
                    source="supabase_storage",
                    session_id=req.session_id,
                )
        except Exception as audit_err:
            logger.warning(f"[audit] batch picture log failed: {audit_err}")

        logger.info(f"Uploaded {len(picture_urls)} pictures for user {req.user_id}")
        
        return {
            "success": True,
            "uploaded_count": len(picture_urls),
            "picture_urls": picture_urls,
            "errors": errors if errors else None
        }

    except HTTPException:
        raise
    except PhotoStorageUnavailable:
        logger.exception("Batch picture upload: photo storage unavailable")
        raise HTTPException(status_code=503, detail="Photo storage unavailable")
    except Exception:
        logger.exception("Batch picture upload error")
        raise HTTPException(status_code=500, detail="Could not upload pictures")


_EMPTY_PICTURE_SLOTS = {f"picture_{i}": None for i in range(1, 6)}


@api_router.get("/user/pictures/{user_id}")
async def get_pictures(user_id: str, request: Request):
    """Get all pictures for a user.

    AUTH: anyone logged in may view profile photos (they're public profile
    content), but for OTHER users the owner's visibility toggles are applied
    through _public_profile_view — a hidden `pictures` field returns empty
    slots.
    """
    try:
        if user_id != request.state.user_id and not get_mock_user_by_id(user_id):
            owner = await db.user_profiles.find_one(
                {"user_id": user_id}, {"_id": 0, "visibilityToggles": 1}
            ) or {}
            if "pictures" not in _public_profile_view({**owner, "pictures": True}):
                return {"success": True, "pictures": dict(_EMPTY_PICTURE_SLOTS), "count": 0}

        # First check for mock user with profile_picture
        mock_user = get_mock_user_by_id(user_id)
        if mock_user and mock_user.get("profile_picture"):
            pictures_list = mock_user.get("pictures", [mock_user.get("profile_picture")])
            # Convert list to picture_1, picture_2, etc. format
            picture_dict = {
                f"picture_{i+1}": pictures_list[i] if i < len(pictures_list) else None
                for i in range(5)
            }
            return {
                "success": True,
                "pictures": picture_dict,
                "count": len(pictures_list)
            }
        
        pictures = await get_user_pictures(user_id)
        
        if not pictures:
            return {
                "success": True,
                "pictures": {
                    "picture_1": None,
                    "picture_2": None,
                    "picture_3": None,
                    "picture_4": None,
                    "picture_5": None
                },
                "count": 0
            }
        
        # Count non-null pictures
        count = sum(1 for i in range(1, 6) if pictures.get(f"picture_{i}"))
        
        return {
            "success": True,
            "pictures": {
                "picture_1": pictures.get("picture_1"),
                "picture_2": pictures.get("picture_2"),
                "picture_3": pictures.get("picture_3"),
                "picture_4": pictures.get("picture_4"),
                "picture_5": pictures.get("picture_5"),
            },
            "count": count,
            "last_modified": pictures.get("last_modified_ts")
        }

    except Exception:
        logger.exception("Get pictures error")
        raise HTTPException(status_code=500, detail="Could not load pictures")


@api_router.delete("/user/pictures/{user_id}/{picture_number}")
async def delete_picture(user_id: str, picture_number: int, request: Request, session_id: str = ""):
    """Delete a specific picture

    AUTH: caller must own this user_id.
    """
    require_owner(user_id, request.state.user_id)
    try:
        if picture_number < 1 or picture_number > 5:
            raise HTTPException(status_code=400, detail="picture_number must be between 1 and 5")

        # Delete from storage
        await delete_picture_from_storage(user_id, picture_number)

        # Update database to set picture to null
        await update_single_picture(
            user_id=user_id,
            session_id=session_id or "system",
            picture_number=picture_number,
            picture_url=None
        )
        
        return {
            "success": True,
            "deleted_picture": picture_number
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Delete picture error")
        raise HTTPException(status_code=500, detail="Could not delete picture")


# ============== CHAT ENDPOINTS ==============

# AUTH (all chat models): the actor id field (sender_id / user_id /
# reporter_id) is ignored and overwritten with the session identity, so it
# defaults to "" — clients may omit it or send a stale value.
class SendMessageRequest(BaseModel):
    sender_id: str = ""
    receiver_id: str
    content: str
    message_type: str = "text"  # text, image, voice, gif
    media_url: Optional[str] = None

class AcceptDeclineRequest(BaseModel):
    user_id: str = ""
    conversation_id: str

class UnmatchRequest(BaseModel):
    user_id: str = ""
    other_user_id: str
    reason: Optional[str] = None

class ReportRequest(BaseModel):
    reporter_id: str = ""
    reported_id: str
    reason: str
    details: Optional[str] = None

class MeetingStatusRequest(BaseModel):
    user_id: str = ""
    other_user_id: str
    did_meet: bool
    was_same_person: Optional[bool] = None

class MeetingReportRequest(BaseModel):
    conversation_id: str
    user_id: str = ""
    did_meet: bool
    verification_result: Optional[str] = None  # 'yes', 'no', 'partially'
    reported_at: str

class IceBreakerRequest(BaseModel):
    user_id: str = ""
    match_user_id: str

class ReplySuggestionsRequest(BaseModel):
    user_id: str = ""
    conversation_id: str


async def _ai_profile(user_id: str, viewer_id: str) -> Dict[str, Any]:
    """Profile handed to the chat AI helpers: the viewer's own doc minus the
    private location/dob fields, or another user's public whitelist."""
    profile = await _profile_for_viewer(user_id, viewer_id)
    if not profile:
        return {"user_id": user_id}
    if user_id == viewer_id:
        profile = _public_profile_view({**profile, "visibilityToggles": {}})
    return profile


@api_router.post("/chat/meeting-report")
async def api_meeting_report(req: MeetingReportRequest, request: Request):
    """Record a meeting verification report

    AUTH: the body `user_id` is ignored — the session identity is used, and
    the caller must be a participant of the conversation (else 404).
    """
    req.user_id = request.state.user_id
    try:
        conv = await db.chat_conversations.find_one(
            {"conversation_id": req.conversation_id, "participants": req.user_id},
            {"_id": 1},
        )
        if not conv:
            raise ChatAccessDenied()
        report = {
            "conversation_id": req.conversation_id,
            "user_id": req.user_id,
            "did_meet": req.did_meet,
            "verification_result": req.verification_result,
            "reported_at": req.reported_at,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Store in MongoDB
        await db.meeting_reports.insert_one(report)

        # Update conversation with meeting status if they met
        if req.did_meet:
            await db.chat_conversations.update_one(
                {"conversation_id": req.conversation_id, "participants": req.user_id},
                {"$set": {
                    "meeting_status": "reported",
                    "verification_status": req.verification_result
                }}
            )

        # Audit: meeting reported (reuses match_events table)
        try:
            await supabase.log_match_event(
                user_id=req.user_id,
                event_type="meeting_reported",
                source="chat",
                payload={
                    "conversation_id": req.conversation_id,
                    "did_meet": req.did_meet,
                    "verification_result": req.verification_result,
                },
            )
        except Exception as audit_err:
            logger.warning(f"[audit] meeting report log failed: {audit_err}")

        logger.info(f"Meeting report saved for conversation {req.conversation_id}")
        return {"success": True}
    except (HTTPException, ChatAccessDenied):
        raise
    except Exception:
        logger.exception("Meeting report error")
        raise HTTPException(status_code=500, detail="Could not save meeting report")


@api_router.get("/chat/conversations/{user_id}")
async def api_get_conversations(user_id: str, request: Request):
    """Get all active conversations for a user.

    Side effect (only when MOCK_SEED_CHATS is on): ensures the demo
    Anjali/Priya unmatched conversations exist for this user so they can test
    the post-unmatch flow directly from the main Chat tab. The seed function
    is idempotent and skips if already done.

    AUTH: caller must own this user_id.
    """
    require_owner(user_id, request.state.user_id)
    try:
        # Best-effort seed; never block conversation fetch if seeding fails
        if settings.mock_seed_chats:
            try:
                await seed_unmatched_for_user(db, user_id)
            except Exception as seed_err:
                logger.warning(f"Auto-seed unmatched mocks failed for {user_id}: {type(seed_err).__name__}")

        conversations = await get_conversations(user_id)
        return {"success": True, "conversations": conversations}
    except ChatAccessDenied:
        raise
    except Exception:
        logger.exception("Get conversations error")
        raise HTTPException(status_code=500, detail="Could not load conversations")


@api_router.get("/chat/requests/{user_id}")
async def api_get_message_requests(user_id: str, request: Request):
    """Get pending message requests for a user

    AUTH: caller must own this user_id.
    """
    require_owner(user_id, request.state.user_id)
    try:
        requests = await get_message_requests(user_id)
        return {"success": True, "requests": requests}
    except ChatAccessDenied:
        raise
    except Exception:
        logger.exception("Get message requests error")
        raise HTTPException(status_code=500, detail="Could not load message requests")


@api_router.get("/chat/messages/{conversation_id}")
async def api_get_messages(conversation_id: str, request: Request, limit: int = 50, before: Optional[str] = None):
    """Get messages for a conversation

    AUTH: only a participant may read it (chat_service raises
    ChatAccessDenied → 404 otherwise).
    """
    _check_int_range(limit, "limit", 1, 200)
    try:
        messages = await get_messages(conversation_id, request.state.user_id, limit, before)
        return {"success": True, "messages": messages}
    except ChatAccessDenied:
        raise
    except Exception:
        logger.exception("Get messages error")
        raise HTTPException(status_code=500, detail="Could not load messages")


# Helper function for AI auto-reply (runs in background)
import asyncio

async def trigger_ai_auto_reply(
    conversation_id: str,
    user_message: str,
    match_profile: Dict[str, Any],
    sender_id: str,
    receiver_id: str
):
    """Background task to generate and send AI auto-reply"""
    try:
        # Wait 1-3 seconds to simulate typing
        await asyncio.sleep(random.uniform(1.5, 3.0))
        
        # Generate AI reply
        ai_reply = await generate_ai_auto_reply(conversation_id, user_message, match_profile)
        
        # Add the AI reply to the conversation
        await add_ai_reply_to_conversation(
            sender_id=receiver_id,  # The match is responding
            receiver_id=sender_id,   # To the user
            content=ai_reply
        )
        
        logger.info(f"AI auto-reply sent in conversation {conversation_id}")
    except Exception as e:
        logger.error(f"Error generating AI auto-reply: {type(e).__name__}")


@api_router.post("/chat/send")
async def api_send_message(req: SendMessageRequest, request: Request, background_tasks: BackgroundTasks):
    """Send a message and optionally trigger the mock-bot auto-reply.

    AUTH: the body `sender_id` is ignored — the session identity is used.
    Self-send → 400; closed / non-participant conversation → 404.
    """
    req.sender_id = request.state.user_id
    if req.receiver_id == req.sender_id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    try:
        message = await send_message(
            sender_id=req.sender_id,
            receiver_id=req.receiver_id,
            content=req.content,
            message_type=req.message_type,
            media_url=req.media_url
        )

        # Mock bots (MOCK_BOT_REPLIES): trigger an AI auto-reply after a short
        # delay. This simulates the match replying back.
        if settings.mock_bot_replies and req.receiver_id.startswith("mock_"):
            # Get match profile for context
            mock_profiles = {
                "mock_user_001": {
                    "user_id": "mock_user_001",
                    "name": "Priya Sharma",
                    "age": 28,
                    "location": "Mumbai",
                    "genres": ["Drama", "Romance", "Thriller"],
                    "topMovies": [{"title": "Interstellar"}, {"title": "The Dark Knight"}]
                },
                "mock_user_002": {
                    "user_id": "mock_user_002",
                    "name": "Rahul Kapoor",
                    "age": 30,
                    "location": "Delhi",
                    "genres": ["Action", "Sci-Fi", "Comedy"],
                    "topMovies": [{"title": "Inception"}, {"title": "The Matrix"}]
                },
                "mock_user_003": {
                    "user_id": "mock_user_003",
                    "name": "Ananya Reddy",
                    "age": 26,
                    "location": "Bangalore",
                    "genres": ["Comedy", "Drama", "Adventure"],
                    "topMovies": [{"title": "Oppenheimer"}, {"title": "Barbie"}]
                }
            }
            match_profile = mock_profiles.get(req.receiver_id, {
                "user_id": req.receiver_id,
                "name": "Movie Buddy",
                "age": 27,
                "location": "India",
                "genres": ["Drama", "Comedy"],
                "topMovies": []
            })
            
            # Schedule AI auto-reply in background
            background_tasks.add_task(
                trigger_ai_auto_reply,
                conversation_id=get_conversation_id(req.sender_id, req.receiver_id),
                user_message=req.content,
                match_profile=match_profile,
                sender_id=req.sender_id,
                receiver_id=req.receiver_id
            )
        
        return {
            "success": True,
            "message": message,
            "conversation_status": message.get("conversation_status", "pending")
        }
    except ChatAccessDenied:
        raise
    except ValueError as e:
        # chat_service's own validation messages (e.g. "Cannot message yourself")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Send message error")
        raise HTTPException(status_code=500, detail="Could not send message")


@api_router.post("/chat/accept")
async def api_accept_request(req: AcceptDeclineRequest, request: Request):
    """Accept a message request

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id
    try:
        success = await accept_message_request(req.user_id, req.conversation_id)
        # Audit: chat request accepted (reuses match_events table)
        try:
            await supabase.log_match_event(
                user_id=req.user_id,
                event_type="request_accepted",
                source="chat",
                payload={"conversation_id": req.conversation_id},
            )
        except Exception as audit_err:
            logger.warning(f"[audit] accept request log failed: {audit_err}")
        return {"success": success}
    except ChatAccessDenied:
        raise
    except Exception:
        logger.exception("Accept request error")
        raise HTTPException(status_code=500, detail="Could not accept request")


@api_router.post("/chat/decline")
async def api_decline_request(req: AcceptDeclineRequest, request: Request):
    """Decline a message request

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id
    try:
        success = await decline_message_request(req.user_id, req.conversation_id)
        try:
            await supabase.log_match_event(
                user_id=req.user_id,
                event_type="request_declined",
                source="chat",
                payload={"conversation_id": req.conversation_id},
            )
        except Exception as audit_err:
            logger.warning(f"[audit] decline request log failed: {audit_err}")
        return {"success": success}
    except ChatAccessDenied:
        raise
    except Exception:
        logger.exception("Decline request error")
        raise HTTPException(status_code=500, detail="Could not decline request")


@api_router.post("/chat/unmatch")
async def api_unmatch(req: UnmatchRequest, request: Request):
    """Unmatch with a user

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id
    try:
        success = await unmatch_user(req.user_id, req.other_user_id, req.reason)
        return {"success": success}
    except ChatAccessDenied:
        raise
    except Exception:
        logger.exception("Unmatch error")
        raise HTTPException(status_code=500, detail="Could not unmatch")


@api_router.post("/chat/report")
async def api_report_user(req: ReportRequest, request: Request):
    """Report a user

    AUTH: the body `reporter_id` is ignored — the session identity is used.
    """
    req.reporter_id = request.state.user_id
    try:
        report = await report_user(
            reporter_id=req.reporter_id,
            reported_id=req.reported_id,
            reason=req.reason,
            details=req.details
        )
        return {"success": True, "report": report}
    except ChatAccessDenied:
        raise
    except ValueError as e:
        # chat_service's own validation messages (e.g. "Cannot report yourself")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Report user error")
        raise HTTPException(status_code=500, detail="Could not submit report")


@api_router.post("/chat/meeting-status")
async def api_set_meeting_status(req: MeetingStatusRequest, request: Request):
    """Set meeting verification status

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id
    try:
        success = await set_meeting_status(
            user_id=req.user_id,
            other_user_id=req.other_user_id,
            did_meet=req.did_meet,
            was_same_person=req.was_same_person
        )
        # Audit
        try:
            await supabase.log_match_event(
                user_id=req.user_id,
                target_user_id=req.other_user_id,
                event_type="meeting_verified",
                source="chat",
                payload={
                    "did_meet": req.did_meet,
                    "was_same_person": req.was_same_person,
                },
            )
        except Exception as audit_err:
            logger.warning(f"[audit] meeting status log failed: {audit_err}")
        return {"success": success}
    except ChatAccessDenied:
        raise
    except Exception:
        logger.exception("Set meeting status error")
        raise HTTPException(status_code=500, detail="Could not update meeting status")


@api_router.post("/chat/read/{conversation_id}")
async def api_mark_read(conversation_id: str, request: Request, user_id: str = ""):
    """Mark messages as read

    AUTH: the `user_id` query param is ignored (legacy) — the session
    identity is used; non-participants get 404.
    """
    user_id = request.state.user_id
    if not conversation_id or not conversation_id.strip():
        raise HTTPException(status_code=400, detail="conversation_id is required")
    try:
        success = await mark_messages_read(user_id, conversation_id)
        return {"success": success}
    except ChatAccessDenied:
        raise
    except Exception:
        logger.exception("Mark read error")
        raise HTTPException(status_code=500, detail="Could not mark messages read")


@api_router.post("/chat/ice-breakers")
async def api_get_ice_breakers(req: IceBreakerRequest, request: Request):
    """Get AI-generated ice breaker suggestions

    AUTH: the body `user_id` is ignored — the session identity is used. The
    match is only seen through the public profile whitelist. LLM-limited.
    """
    req.user_id = request.state.user_id
    LLM_LIMITER.check_or_raise(f"llm:{req.user_id}")
    try:
        # Get user profiles (sender's own + the match's public view)
        user_profile = await _ai_profile(req.user_id, req.user_id)
        match_profile = await _ai_profile(req.match_user_id, req.user_id)
        if not match_profile.get("name"):
            match_profile = {"name": "Match", "genres": ["Drama"], "topMovies": []}

        ice_breakers = await generate_ice_breakers(user_profile, match_profile)
        return {"success": True, "ice_breakers": ice_breakers}
    except Exception:
        logger.exception("Ice breakers error")
        raise HTTPException(status_code=500, detail="Could not generate ice breakers")


@api_router.post("/chat/reply-suggestions")
async def api_get_reply_suggestions(req: ReplySuggestionsRequest, request: Request):
    """Get AI-generated reply suggestions

    AUTH: the body `user_id` is ignored — the session identity is used; only
    a participant of the conversation gets suggestions (else 404).
    LLM-limited.
    """
    req.user_id = request.state.user_id
    LLM_LIMITER.check_or_raise(f"llm:{req.user_id}")
    try:
        # Get messages (participant-checked) and profiles
        messages = await get_messages(req.conversation_id, req.user_id, limit=10)
        user_profile = await _ai_profile(req.user_id, req.user_id)

        # Get other user from conversation
        conv = await db.chat_conversations.find_one(
            {"conversation_id": req.conversation_id}, {"_id": 0, "participants": 1}
        ) or {}
        other_id = next((p for p in (conv.get("participants") or []) if p != req.user_id), None)
        match_profile = await _ai_profile(other_id, req.user_id) if other_id else {}
        if not match_profile.get("name"):
            match_profile = {"name": "Match", "genres": ["Drama"]}

        suggestions = await generate_reply_suggestions(
            conversation_messages=list(reversed(messages)),
            user_profile=user_profile,
            match_profile=match_profile
        )
        return {"success": True, "suggestions": suggestions}
    except ChatAccessDenied:
        raise
    except Exception:
        logger.exception("Reply suggestions error")
        raise HTTPException(status_code=500, detail="Could not generate suggestions")


@api_router.post("/chat/init-mock/{user_id}")
async def api_init_mock_conversations(user_id: str, request: Request):
    """Seed mock_user_001/002/003 conversations into a user's inbox.

    DEV-ONLY (ENABLE_DEV_ROUTES); caller must own this user_id.
    """
    if not settings.enable_dev_routes:
        raise HTTPException(status_code=404, detail="Not found")
    require_owner(user_id, request.state.user_id)
    try:
        mock_users = get_all_mock_users()[:3]
        await create_mock_conversations(user_id, mock_users)
        return {"success": True, "message": "Mock conversations created"}
    except Exception:
        logger.exception("Init mock conversations error")
        raise HTTPException(status_code=500, detail="Could not create mock conversations")


# =============================================
# Match History API Endpoints (Trust & Safety Feature)
# =============================================

@api_router.get("/user/match-history/{user_id}")
async def api_get_match_history(user_id: str, request: Request):
    """
    Get complete match history for a user.
    This is a differentiating trust & safety feature that allows users to:
    - See all their past matches (active and unmatched)
    - Report users even after they've unmatched
    - View read-only chat history if they were unmatched by someone

    Side effect (only when MOCK_SEED_CHATS is on): ensures the demo
    Anjali/Priya unmatched conversations exist for this user so they can
    manually test the post-unmatch flows. The seed function is idempotent
    and skips if already done.

    AUTH: caller must own this user_id.
    """
    require_owner(user_id, request.state.user_id)
    try:
        # Best-effort seed; never block history fetch if seeding fails
        if settings.mock_seed_chats:
            try:
                await seed_unmatched_for_user(db, user_id)
            except Exception as seed_err:
                logger.warning(f"Auto-seed unmatched mocks failed for {user_id}: {type(seed_err).__name__}")

        history = await get_match_history(user_id)
        return {"success": True, "history": history, "total": len(history)}
    except ChatAccessDenied:
        raise
    except Exception:
        logger.exception("Get match history error")
        raise HTTPException(status_code=500, detail="Could not load match history")


@api_router.post("/dev/seed-unmatched-mocks/{user_id}")
async def api_seed_unmatched_mocks(user_id: str, request: Request):
    """
    DEV-ONLY (ENABLE_DEV_ROUTES): Seeds two recognisable mock users (Anjali
    Iyer & Priya Bhatia) with realistic chat history with the given user,
    then marks both conversations as unmatched (by them).
    Used to manually test the Match History + post-unmatch flows.

    AUTH: caller must own this user_id.
    """
    if not settings.enable_dev_routes:
        raise HTTPException(status_code=404, detail="Not found")
    require_owner(user_id, request.state.user_id)
    try:
        result = await seed_unmatched_for_user(db, user_id)
        return result
    except Exception:
        logger.exception("Seed unmatched mocks error")
        raise HTTPException(status_code=500, detail="Could not seed mock conversations")


@api_router.get("/chat/conversation-access/{conversation_id}")
async def api_check_conversation_access(conversation_id: str, request: Request, user_id: str = ""):
    """
    Check if a user can view a conversation and in what mode.
    Returns whether the conversation is read-only (for users who were unmatched).

    AUTH: the `user_id` query param is ignored (legacy) — the session
    identity is used.
    """
    user_id = request.state.user_id
    try:
        access = await can_user_view_conversation(user_id, conversation_id)
        return access
    except ChatAccessDenied:
        raise
    except Exception:
        logger.exception("Check conversation access error")
        raise HTTPException(status_code=500, detail="Could not check conversation access")


@api_router.get("/chat/unmatched/{conversation_id}")
async def api_get_unmatched_conversation(conversation_id: str, request: Request, user_id: str = ""):
    """
    Get details of an unmatched conversation for read-only viewing.
    Only available to users who were unmatched (not the ones who initiated).

    AUTH: the `user_id` query param is ignored (legacy) — the session
    identity is used.
    """
    user_id = request.state.user_id
    try:
        conv = await get_unmatched_conversation(user_id, conversation_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found or access denied")
        return {"success": True, "conversation": conv}
    except (HTTPException, ChatAccessDenied):
        raise
    except Exception:
        logger.exception("Get unmatched conversation error")
        raise HTTPException(status_code=500, detail="Could not load conversation")


class DeleteChatRequest(BaseModel):
    user_id: str = ""  # ignored — the session identity is used
    conversation_id: str


@api_router.post("/chat/delete")
async def api_delete_chat(req: DeleteChatRequest, request: Request):
    """
    Delete chat history from a user's view.
    This is a soft delete - the other user's view and any reports are not affected.

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id
    try:
        success = await delete_chat_history(req.user_id, req.conversation_id)
        if success:
            # Audit: chat deletion (soft delete)
            try:
                await supabase.log_match_event(
                    user_id=req.user_id,
                    event_type="chat_deleted",
                    source="chat",
                    payload={"conversation_id": req.conversation_id},
                )
            except Exception as audit_err:
                logger.warning(f"[audit] chat delete log failed: {audit_err}")
            return {"success": True, "message": "Chat deleted successfully"}
        else:
            raise HTTPException(status_code=400, detail="Could not delete chat")
    except (HTTPException, ChatAccessDenied):
        raise
    except Exception:
        logger.exception("Delete chat error")
        raise HTTPException(status_code=500, detail="Could not delete chat")


# =============================================
# Tina AI Profile Builder API Endpoints
# =============================================

class TinaChatRequest(BaseModel):
    """Request model for Tina chat"""
    user_id: str = ""  # ignored — the session identity is used
    user_name: Optional[str] = ""
    message: str = ""
    selected_option: Optional[str] = None
    selected_options: Optional[List[str]] = None
    selected_movies: Optional[List[Dict[str, Any]]] = None
    is_onboarding_complete: bool = False
    collected_fields: Optional[List[str]] = None
    conversation_context: Optional[List[Dict[str, str]]] = None
    selected_360_option: Optional[Dict[str, str]] = None  # {question_id, option_key}
    # When True, instructs Tina to use the low-latency model (gpt-4o-mini)
    # AND aggressive 1-2 sentence brevity so TTS finishes faster on voice
    # calls. Defaults to False (text chat → gpt-4o, longer replies allowed).
    voice_mode: bool = False


@api_router.post("/tina/chat")
async def tina_chat_endpoint(req: TinaChatRequest, request: Request):
    """
    Chat with Tina AI for conversational profile building.
    
    Returns Tina's response along with:
    - Options to show as chips (if applicable)
    - Whether to show movie picker
    - Collected field info
    - Profile completion percentage

    AUTH: We derive the canonical user_id from the session token instead of
    trusting `req.user_id`. In production we observed the mobile client
    sometimes sending a stale/desynced user_id (e.g. right after login,
    before AsyncStorage had fully caught up), which caused every /tina/chat
    to 404 via require_owner. Silently overriding `req.user_id` with the
    session-resolved value is safe: only the caller's own data is ever
    accessed, and require_owner is now redundant (kept for defence-in-depth
    but downgraded — see below).
    """
    # Trust the session, not the client. If the client sent a mismatched
    # user_id, log it (so we can spot buggy clients in the field) then
    # rewrite the request to the session user.
    session_uid = request.state.user_id
    if req.user_id and req.user_id != session_uid:
        logger.warning(
            f"/tina/chat: client body user_id={req.user_id!r} != session "
            f"user_id={session_uid!r}. Using session identity."
        )
    req.user_id = session_uid
    LLM_LIMITER.check_or_raise(f"llm:{req.user_id}")
    try:
        result = await process_tina_message(
            user_id=req.user_id,
            user_message=req.message,
            user_name=req.user_name or "",
            selected_option=req.selected_option,
            selected_options=req.selected_options,
            selected_movies=req.selected_movies,
            is_onboarding_complete=req.is_onboarding_complete,
            conversation_context=req.conversation_context,
            selected_360_option=req.selected_360_option,
            voice_mode=req.voice_mode,
        )

        # Audit log: store user message + Tina's response (best-effort)
        try:
            # User-side message
            if req.message or req.selected_option or req.selected_360_option:
                sel_opt = req.selected_option
                sel_opt_key = None
                q_id = None
                if isinstance(req.selected_360_option, dict):
                    sel_opt = req.selected_360_option.get("label") or sel_opt
                    sel_opt_key = req.selected_360_option.get("option_key")
                    q_id = req.selected_360_option.get("question_id")
                await supabase.log_tina_chat_message(
                    user_id=req.user_id,
                    role="user",
                    content=req.message,
                    selected_option=sel_opt,
                    selected_option_key=sel_opt_key,
                    question_id=q_id,
                )
            # Tina's response
            await supabase.log_tina_chat_message(
                user_id=req.user_id,
                role="tina",
                content=result.get("response"),
                collected_field=result.get("collected_field"),
                collected_value=result.get("collected_value"),
                show_options=result.get("show_options"),
                show_movie_picker=bool(result.get("show_movie_picker")),
                completion_percentage=result.get("completion_percentage"),
                exit_intent=bool(result.get("exit_intent")),
            )
        except Exception as _e:
            logger.debug(f"audit (tina chat) skipped: {_e}")

        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Tina chat error")
        raise HTTPException(status_code=500, detail="Tina is unavailable right now")


@api_router.get("/tina/greeting")
async def tina_greeting_endpoint(user_name: str = ""):
    """Get Tina's initial greeting message."""
    try:
        greeting = await get_tina_greeting(user_name[:80])
        return {"success": True, "greeting": greeting}
    except Exception:
        logger.exception("Tina greeting error")
        raise HTTPException(status_code=500, detail="Tina is unavailable right now")


@api_router.get("/tina/missing-fields/{user_id}")
async def tina_missing_fields_endpoint(user_id: str, request: Request):
    """Get list of profile fields not yet collected by Tina."""
    require_owner(user_id, request.state.user_id)
    try:
        missing = await get_missing_fields(user_id)
        return {"success": True, "missing_fields": missing, "count": len(missing)}
    except Exception:
        logger.exception("Get missing fields error")
        raise HTTPException(status_code=500, detail="Could not load missing fields")


@api_router.get("/tina/profile-data/{user_id}")
async def tina_profile_data_endpoint(user_id: str, request: Request):
    """Get all profile data collected by Tina."""
    require_owner(user_id, request.state.user_id)
    try:
        data = await get_collected_profile_data(user_id)
        return {"success": True, "profile_data": data}
    except Exception:
        logger.exception("Get Tina profile data error")
        raise HTTPException(status_code=500, detail="Could not load profile data")


@api_router.delete("/tina/session/{user_id}")
async def tina_clear_session_endpoint(user_id: str, request: Request):
    """Clear Tina session for a user (start fresh)."""
    require_owner(user_id, request.state.user_id)
    try:
        await clear_tina_session(user_id)
        return {"success": True, "message": "Tina session cleared"}
    except Exception:
        logger.exception("Clear Tina session error")
        raise HTTPException(status_code=500, detail="Could not clear Tina session")


class WelcomeBackRequest(BaseModel):
    user_id: str = ""  # ignored — the session identity is used
    user_name: str = ""
    is_onboarding_complete: bool = False
    collected_fields: List[str] = []  # Fields already collected from frontend


@api_router.post("/tina/welcome-back")
async def tina_welcome_back_endpoint(req: WelcomeBackRequest, request: Request):
    """
    Generate a contextual welcome-back message when user returns to Tina.

    AUTH: Same rationale as /tina/chat — we trust the session token over the
    request body. If the client sends a stale/desynced user_id right after
    login (before SecureStore has finished persisting), we silently rewrite
    it to the session identity. This eliminates spurious 404s from
    require_owner while still guaranteeing users only ever touch their own
    data.
    """
    session_uid = request.state.user_id
    if req.user_id and req.user_id != session_uid:
        logger.warning(
            f"/tina/welcome-back: client body user_id={req.user_id!r} != "
            f"session user_id={session_uid!r}. Using session identity."
        )
    req.user_id = session_uid
    # LLM-backed opener → shares the per-user LLM budget.
    LLM_LIMITER.check_or_raise(f"llm:{req.user_id}")
    try:
        result = await generate_welcome_back_message(
            user_id=req.user_id,
            user_name=req.user_name,
            is_onboarding_complete=req.is_onboarding_complete,
            collected_fields_list=req.collected_fields,
        )
        return {"success": True, **result}
    except Exception:
        logger.exception("Welcome back error")
        raise HTTPException(status_code=500, detail="Tina is unavailable right now")


@api_router.get("/tina/onboarding-status/{user_id}")
async def tina_onboarding_status_endpoint(user_id: str, request: Request):
    """Check user's onboarding status."""
    require_owner(user_id, request.state.user_id)
    try:
        status = await get_user_onboarding_status(user_id)
        return {"success": True, **status}
    except Exception:
        logger.exception("Onboarding status error")
        raise HTTPException(status_code=500, detail="Could not load onboarding status")


@api_router.get("/tina/field-options")
async def tina_field_options_endpoint():
    """Get all profile fields and their options (for reference)."""
    try:
        fields = {}
        for field_name, config in PROFILE_FIELDS.items():
            fields[field_name] = {
                "type": config.get("type"),
                "options": config.get("options", []),
                "optional": config.get("optional", False),
                "priority": config.get("priority", 100),
            }
        return {"success": True, "fields": fields}
    except Exception:
        logger.exception("Get field options error")
        raise HTTPException(status_code=500, detail="Could not load field options")


# ---------------------------------------------------------------------------
# Tina Voice (ElevenLabs) – Premium "Talk to Tina" feature
# ---------------------------------------------------------------------------

class TinaSpeakRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None


@api_router.get("/tina/voice/status")
async def tina_voice_status_endpoint():
    """Tells the client whether voice mode is currently available."""
    return {"enabled": is_voice_enabled()}


@api_router.post("/tina/voice/speak")
async def tina_voice_speak_endpoint(req: TinaSpeakRequest, request: Request):
    """Generate Tina's voice reply (Sarah – premade female, Free-tier compatible)
    and return a base64-encoded MP3 audio data URI suitable for `expo-audio`.

    Auth: handled by global middleware. Rate-limited per user via TTS_LIMITER.
    """
    try:
        if not req.text or not req.text.strip():
            raise HTTPException(status_code=400, detail="text is required")
        if not is_voice_enabled():
            raise HTTPException(status_code=503, detail="Voice service is not configured")
        # Per-user rate limit so ElevenLabs quota can't be drained by a single
        # compromised session or runaway client retry.
        TTS_LIMITER.check_or_raise(f"tts:{getattr(request.state, 'user_id', 'anon')}")
        audio_data_uri = await synthesize_speech(req.text, req.voice_id)
        return {"success": True, "audio": audio_data_uri}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Tina TTS error")
        raise HTTPException(status_code=500, detail="Voice synthesis failed")


@api_router.get("/tina/voice/speak-stream")
async def tina_voice_speak_stream_endpoint(
    request: Request,
    text: Optional[str] = None,
    voice_id: Optional[str] = None,
):
    """Streaming TTS — yields MP3 chunks as ElevenLabs produces them so the
    frontend can start playback after the first chunk (~300ms) instead of
    waiting for the full base64 audio (~1.5s). Used by the voice-call mode
    to cut perceived reply latency.

    Auth: handled by the global middleware. The middleware extracts the
    session token from `?session_token=` query param when present, which is
    the only way native `<audio src=>` players can pass auth (no header
    support). Rate-limited per user via TTS_LIMITER.
    """
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if not is_voice_enabled():
        raise HTTPException(status_code=503, detail="Voice service is not configured")
    TTS_LIMITER.check_or_raise(f"tts:{getattr(request.state, 'user_id', 'anon')}")

    # Eagerly pull the first MP3 chunk from ElevenLabs BEFORE constructing
    # the StreamingResponse. Any auth / quota / config error will surface
    # here as a clean 5xx instead of a 200 with a broken stream body.
    agen = stream_speech(text, voice_id)
    try:
        first = await agen.__anext__()
    except StopAsyncIteration:
        raise HTTPException(status_code=502, detail="TTS upstream returned empty audio")
    except Exception:
        logger.exception("Tina TTS stream init failed")
        raise HTTPException(status_code=502, detail="Voice service unavailable")

    async def _relay():
        # Replay the first chunk we already fetched, then continue draining
        # the rest. Errors mid-stream can only be logged — by this point the
        # client already has a 200 + audio/mpeg response.
        try:
            yield first
            async for chunk in agen:
                if chunk:
                    yield chunk
        except Exception as e:
            logger.warning(f"Tina TTS stream interrupted mid-flight: {type(e).__name__}")
        finally:
            await agen.aclose()  # release the upstream stream on disconnect

    return StreamingResponse(
        _relay(),
        media_type="audio/mpeg",
        headers={
            # Cache aggressively for identical replies (rare but cheap),
            # disable buffering on intermediary proxies so chunks land
            # immediately client-side.
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )


@api_router.post("/tina/voice/transcribe")
async def tina_voice_transcribe_endpoint(request: Request, audio: UploadFile = File(...)):
    """Convert a user-recorded clip to text (ElevenLabs Scribe).

    Rate-limited per user via STT_LIMITER (20/min).
    """
    if not is_voice_enabled():
        raise HTTPException(status_code=503, detail="Voice service is not configured")
    STT_LIMITER.check_or_raise(f"stt:{_actor_key(request)}")
    try:
        raw = await audio.read(STT_MAX_AUDIO_BYTES + 1)
        if not raw:
            raise HTTPException(status_code=400, detail="Empty audio file")
        if len(raw) > STT_MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio clip too large")
        text = await transcribe_audio(raw, filename=(audio.filename or "tina_voice.m4a")[:100])
        return {"success": True, "text": text}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Tina STT error")
        raise HTTPException(status_code=500, detail="Transcription failed")


# ---------------------------------------------------------------------------
# 360° Dating Profile Framework — hidden scoring engine endpoints
# ---------------------------------------------------------------------------

class Tina360Answer(BaseModel):
    question_id: str
    option_key: str


class Tina360SubmitRequest(BaseModel):
    user_id: str = ""  # ignored — the session identity is used
    answers: List[Tina360Answer]
    # Optional explicit extras like favourite genres/tropes captured during chat
    favourite_genres: Optional[List[str]] = None
    favourite_trope: Optional[str] = None


@api_router.get("/tina/360/questions")
async def tina_360_questions_endpoint():
    """
    Return the 8 high-signal onboarding questions Tina asks (with options as
    tappable chips) PLUS dynamic TMDB-backed extras (current movie genres and
    curated love-story tropes) so Tina can adapt conversationally.
    The hidden scoring vectors stay server-side.
    """
    try:
        genres = await get_dynamic_movie_genres(limit=12)
        tropes = await get_love_tropes()
        public_questions = [
            {
                "id": q["id"],
                "intent": q["intent"],
                "options": [
                    {"key": o["key"], "emoji": o.get("emoji", ""), "label": o["label"]}
                    for o in q["options"]
                ],
            }
            for q in PERSONALITY_QUESTIONS
        ]
        return {
            "success": True,
            "questions": public_questions,
            "dynamic": {
                "movie_genres": genres,
                "love_tropes": tropes,
            },
            "total_questions": len(public_questions),
        }
    except Exception:
        logger.exception("360 questions error")
        raise HTTPException(status_code=500, detail="Could not load questions")


@api_router.post("/tina/360/submit")
async def tina_360_submit_endpoint(req: Tina360SubmitRequest, request: Request):
    """
    Take the user's 8 answers, compute the hidden 360° personality profile,
    persist it to `tina_profiles` and return ONLY the public-safe parts
    (archetype, intent split, primary love language) plus a fun reveal copy.
    The raw scores/vector are NEVER returned to the client.

    AUTH: the body `user_id` is ignored — the session identity is used.
    """
    req.user_id = request.state.user_id
    try:
        answers_dict = [
            {"question_id": a.question_id, "option_key": a.option_key}
            for a in req.answers
        ]
        if len(answers_dict) < 4:
            raise HTTPException(
                status_code=400,
                detail="At least 4 answers are required to build a profile."
            )
        extra: Dict[str, Any] = {}
        if req.favourite_genres:
            extra["favourite_genres"] = req.favourite_genres
        if req.favourite_trope:
            extra["favourite_trope"] = req.favourite_trope

        profile = personality_finalize_profile(answers_dict, extra=extra)
        await save_tina_personality(req.user_id, profile)

        archetype = profile["archetype"]
        intent = profile["intent"]
        ll = profile["primary_love_language"]

        reveal = (
            f"Okay {req.user_id and 'you'} — I've got you figured out 💫\n"
            f"You're {archetype['emoji']} **{archetype['title']}** — {archetype['description']}\n"
            f"Your love language reads as **{ll}**, and your vibe leans "
            f"{intent['serious']}% serious / {intent['casual']}% casual.\n"
            f"Ready to meet your people?"
        )

        # ONLY return public-safe data (NEVER the raw personality_vector)
        return {
            "success": True,
            "archetype": archetype,
            "intent": intent,
            "primary_love_language": ll,
            "reveal_message": reveal,
            "questions_answered": profile["questions_answered"],
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("360 submit error")
        raise HTTPException(status_code=500, detail="Could not save your answers")


@api_router.get("/tina/360/profile/{user_id}")
async def tina_360_profile_endpoint(user_id: str, request: Request):
    """
    Returns the *public-safe* personality summary for a user. Hidden vector
    and intermediate scores are intentionally stripped.

    AUTH: your own id → the full summary; anyone else's → only the
    archetype / love language, filtered by the owner's visibility toggles
    through _public_profile_view.
    """
    try:
        doc = await get_tina_personality(user_id)
        if not doc:
            return {"success": True, "exists": False}
        if user_id != request.state.user_id:
            owner = await db.user_profiles.find_one(
                {"user_id": user_id}, {"_id": 0, "visibilityToggles": 1}
            ) or {}
            public = _public_profile_view({
                **owner,
                "archetype": doc.get("archetype"),
                "primary_love_language": doc.get("primary_love_language"),
            })
            return {
                "success": True,
                "exists": True,
                "archetype": public.get("archetype"),
                "primary_love_language": public.get("primary_love_language"),
            }
        return {
            "success": True,
            "exists": True,
            "archetype": doc.get("archetype"),
            "intent": doc.get("intent"),
            "primary_love_language": doc.get("primary_love_language"),
            "questions_answered": doc.get("questions_answered", []),
            "computed_at": doc.get("computed_at"),
        }
    except Exception:
        logger.exception("360 profile fetch error")
        raise HTTPException(status_code=500, detail="Could not load personality profile")


# Auth routes (auth_routes.py) mount under /api/auth/* — must be attached to
# api_router BEFORE api_router itself is included into the app.
api_router.include_router(auth_router)

# Include router after all routes are defined
app.include_router(api_router)


# Mount Socket.IO server
socket_app = socketio.ASGIApp(sio, app)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    # Lock CORS to known origins (settings.py: ALLOWED_ORIGINS, comma-separated,
    # no trailing slashes; optional ALLOWED_ORIGIN_REGEX). Wildcard "*" +
    # allow_credentials=True is browser-rejected AND a CSRF foot-gun, so we
    # never use it. Only the admin web dashboard / local web preview need
    # this — the Android app sends no Origin header, so CORS doesn't apply.
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.allowed_origin_regex or None,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Session-Token",
        "X-Admin-Token",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
    expose_headers=["Content-Disposition", "Content-Length"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# (collection, keys, extra create_index kwargs). create_index is idempotent for
# an identical spec; a conflicting pre-existing index or duplicate data under a
# unique key only logs a warning so boot never fails on it. otp_codes indexes
# are owned by auth_routes.py.
_MONGO_INDEXES = [
    ("user_sessions", [("session_token", 1)], {"unique": True}),
    ("user_sessions", [("expires_at", 1)], {}),
    ("users", [("user_id", 1)], {"unique": True}),
    ("users", [("email", 1)], {}),
    ("users", [("phone", 1)], {}),
    ("users", [("google_sub", 1)], {}),
    ("users", [("status", 1)], {}),
    ("match_cache", [("owner_id", 1)], {}),
    ("user_profiles", [("user_id", 1)], {"unique": True}),
    ("user_taste_vectors", [("user_id", 1)], {}),
    ("user_swipes", [("user_id", 1), ("created_at", 1)], {}),
    ("user_shown_movies", [("user_id", 1)], {}),
    ("chat_conversations", [("conversation_id", 1)], {"unique": True}),
    ("chat_conversations", [("participants", 1)], {}),
    ("chat_messages", [("conversation_id", 1), ("created_at", 1)], {}),
    ("chat_requests", [("to_user_id", 1)], {}),
    ("chat_reports", [("reported_id", 1)], {}),
    ("chat_reports", [("reporter_id", 1)], {}),
    ("match_cache", [("user_id", 1)], {}),
    ("tina_sessions", [("user_id", 1)], {}),
    ("tina_profiles", [("user_id", 1)], {}),
    ("user_pictures", [("user_id", 1)], {}),
    ("user_filters", [("user_id", 1)], {"unique": True}),
]


async def _ensure_indexes() -> None:
    """Create the Mongo indexes the hot query paths rely on (idempotent)."""
    for coll, keys, opts in _MONGO_INDEXES:
        try:
            await db[coll].create_index(keys, **opts)
        except ConnectionFailure as exc:
            # Unreachable cluster: don't stall boot 5s per index — bail out.
            logger.warning(f"Mongo unreachable, skipping index creation: {type(exc).__name__}")
            return
        except Exception as exc:
            logger.warning(
                f"Index {coll}{[k for k, _ in keys]} not created: {type(exc).__name__}: {exc}"
            )


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    # Wire the centralised security deps to Mongo + admin tokens store.
    # Done FIRST so any subsequent startup task can rely on auth being live.
    set_security_db(db)
    configure_auth(db, on_new_user=broadcast_new_user)
    set_admin_tokens_provider(lambda: admin_tokens)
    logger.info(
        "Security subsystem initialised (ALLOWED_ORIGINS=%s)",
        ",".join(settings.allowed_origins) or "<none>",
    )

    await _ensure_indexes()

    # Pass MongoDB db to picture service
    set_mongodb_db(db)
    logger.info("Picture service connected to MongoDB")
    
    # Pass MongoDB db to matchmaking service for caching
    set_matchmaking_db(db)
    logger.info("Matchmaking service cache connected to MongoDB")
    
    # Pass MongoDB db to chat service for message persistence
    set_chat_db(db)
    logger.info("Chat service connected to MongoDB")
    
    # Pass MongoDB db to Tina AI service
    set_tina_db(db)
    logger.info("Tina AI service connected to MongoDB")

    # Pass MongoDB db to Tina personality engine (360° framework)
    set_personality_db(db)
    logger.info("Tina personality engine connected to MongoDB")

    # Run Supabase bootstrap: ensures storage bucket exists & probes audit
    # tables. Non-blocking, best-effort. Logs a clear warning if the
    # migration SQL has not been applied yet.
    try:
        from supabase_bootstrap import run_bootstrap as _run_supa_bootstrap
        _run_supa_bootstrap()
    except Exception as _e:
        logger.warning(f"Supabase bootstrap raised (non-fatal): {_e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
