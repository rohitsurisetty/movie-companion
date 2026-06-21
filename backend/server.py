from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import httpx
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import random
import socketio

# Import recommendation engine
from recommendation_engine import (
    TasteVector, 
    initialize_taste_vector_from_profile,
    update_taste_vector_from_swipe,
    get_personalized_feed,
    enrich_movie_with_details,
    enrich_top_movies,
    initialize_taste_vector_from_enriched_movies,
    enrich_movie_with_full_details,
    GENRE_ID_TO_NAME
)

# Import matchmaking service for AI-based user matching
from matchmaking_service import (
    get_matches_for_user,
    get_all_mock_users,
    get_mock_user_by_id,
    apply_hard_filters,
    set_db as set_matchmaking_db,
    invalidate_user_cache
)

# Import chat service
from chat_service import (
    get_or_create_conversation,
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

# Import picture service for profile photos
from picture_service import (
    upload_picture_to_storage,
    delete_picture_from_storage,
    save_user_pictures,
    get_user_pictures,
    update_single_picture,
    initialize_picture_service,
    set_mongodb_db
)

# Import Supabase service for analytics tracking
import supabase_service as supabase

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# =============================================
# Socket.IO Server Setup for Real-Time Updates
# =============================================
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=False
)

# Store connected admin clients
connected_admins: Dict[str, str] = {}  # sid -> admin_email


@sio.event
async def connect(sid, environ, auth):
    """Handle new WebSocket connection"""
    logger.info(f"Admin client connected: {sid}")
    # For now, allow all connections (in production, verify auth token)
    token = auth.get('token') if auth else None
    if token and token in admin_tokens:
        connected_admins[sid] = admin_tokens[token].get('email', 'unknown')
        await sio.emit('connection_status', {'status': 'connected'}, room=sid)
        # Send initial metrics
        await broadcast_metrics()
    else:
        # Allow connection but note it's unauthenticated
        connected_admins[sid] = 'guest'
        await sio.emit('connection_status', {'status': 'connected'}, room=sid)


@sio.event
async def disconnect(sid):
    """Handle WebSocket disconnection"""
    logger.info(f"Admin client disconnected: {sid}")
    if sid in connected_admins:
        del connected_admins[sid]


async def broadcast_metrics():
    """Broadcast updated metrics to all connected admins"""
    if not connected_admins:
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
        
        total_swipes = await db.user_swipes.count_documents({})
        swipes_today = await db.user_swipes.count_documents({
            "created_at": {"$gte": today_start.isoformat()}
        })
        
        try:
            total_matches = await db.user_matches.count_documents({})
        except:
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
        
        await sio.emit('metrics_update', metrics)
    except Exception as e:
        logger.error(f"Error broadcasting metrics: {e}")


async def broadcast_new_user(user_data: dict):
    """Broadcast new user event to all connected admins"""
    if connected_admins:
        await sio.emit('new_user', user_data)
        await broadcast_metrics()


async def broadcast_user_updated(user_data: dict):
    """Broadcast user update event to all connected admins"""
    if connected_admins:
        await sio.emit('user_updated', user_data)


async def broadcast_new_swipe(swipe_data: dict):
    """Broadcast new swipe event to all connected admins"""
    if connected_admins:
        await sio.emit('new_swipe', swipe_data)
        await broadcast_metrics()


async def broadcast_new_match(match_data: dict):
    """Broadcast new match event to all connected admins"""
    if connected_admins:
        await sio.emit('new_match', match_data)
        await broadcast_metrics()

# API Keys (hardcoded as per requirements)
GOOGLE_MAPS_API_KEY = "AIzaSyB-JXNABvg2sas93j8AycV82Ykn0IF2Erc"
TMDB_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxMDkyYWVhMzI1YWI2YWZhMTc0NjYxNjZmMDJiYjc4NiIsIm5iZiI6MTc3MzE5NDA5Mi4zNDcwMDAxLCJzdWIiOiI2OWIwY2I2YzM3MTk4MWM3MjJhYzFlODYiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.ZZcD2Bgm2DNiqXhzsBLP64R4cgWza-2CHOZ10k4Yoks"
EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class SessionRequest(BaseModel):
    session_id: str


class MockLoginRequest(BaseModel):
    email: str
    name: str


class SendEmailOTPRequest(BaseModel):
    email: str


class SendPhoneOTPRequest(BaseModel):
    phone: str


class VerifyOTPRequest(BaseModel):
    type: str  # 'email' or 'phone'
    identifier: str  # email or phone number
    otp: str
    name: Optional[str] = None  # Only required for new users


class ForgotPasswordRequest(BaseModel):
    email: str


# In-memory OTP store (for demo/mock purposes)
# In production, use Redis or database with TTL
otp_store: Dict[str, Dict[str, Any]] = {}


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
    user_id: str
    # Basic Info
    name: str = ""
    age: int = 0
    gender: str = ""
    location: str = ""
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


class SwipeRequest(BaseModel):
    user_id: str
    movie_id: int
    direction: str  # 'right' or 'left'
    rating: Optional[int] = None  # 1-5 stars (for right swipes)
    reason: Optional[str] = None  # Reason for like/dislike
    didnt_watch: bool = False  # User hasn't watched this movie


class RecommendationRequest(BaseModel):
    user_id: str
    page: int = 1
    limit: int = 20


class FiltersRequest(BaseModel):
    """User matching filters and preferences"""
    user_id: str
    session_id: Optional[str] = None
    # Filter values
    distance_radius: Optional[int] = None
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    height_min: Optional[str] = None
    height_max: Optional[str] = None
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
    # Toggle settings
    exclusive_toggles: Optional[Dict[str, bool]] = None
    expand_if_run_out_toggles: Optional[Dict[str, bool]] = None


@api_router.get("/")
async def root():
    return {"message": "Film Companion API"}


@api_router.post("/auth/session")
async def exchange_session(req: SessionRequest, response: Response):
    """Exchange Emergent Auth session_id for user data"""
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.get(
            EMERGENT_AUTH_URL,
            headers={"X-Session-ID": req.session_id}
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    user_data = resp.json()
    session_token = user_data.get("session_token", f"session_{uuid.uuid4().hex}")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    existing = await db.users.find_one({"email": user_data["email"]}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        await db.users.insert_one({
            "user_id": user_id,
            "email": user_data["email"],
            "name": user_data["name"],
            "picture": user_data.get("picture", ""),
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    response.set_cookie(
        key="session_token", value=session_token, path="/",
        secure=True, samesite="none", httponly=True, max_age=604800
    )
    return {
        "user_id": user_id, "email": user_data["email"],
        "name": user_data["name"], "picture": user_data.get("picture", ""),
        "session_token": session_token
    }


@api_router.post("/auth/mock-login")
async def mock_login(req: MockLoginRequest):
    """Mock login for email/phone auth"""
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    session_token = f"session_{uuid.uuid4().hex}"
    existing = await db.users.find_one({"email": req.email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        await db.users.insert_one({
            "user_id": user_id, "email": req.email, "name": req.name,
            "picture": "", "created_at": datetime.now(timezone.utc).isoformat()
        })
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"user_id": user_id, "email": req.email, "name": req.name, "session_token": session_token}


def generate_otp() -> str:
    """Generate a 6-digit OTP"""
    return str(random.randint(100000, 999999))


def send_mock_welcome_email(email: str, name: str):
    """
    Mock welcome email - prints to console (from noreply@filmcompanion.com)
    In production, this would use SendGrid/AWS SES/etc.
    """
    logger.info(f"""
    ================================================================================
    📧 WELCOME EMAIL SENT (MOCK)
    ================================================================================
    From: noreply@filmcompanion.com
    To: {email}
    Subject: Welcome to Film Companion! 🎬
    
    Hi {name}!
    
    Welcome to Film Companion - where movie lovers find their film soulmates!
    
    Start swiping on movies you love (or skip the ones you don't) and we'll help 
    you connect with people who share your taste in cinema.
    
    Happy watching!
    
    - The Film Companion Team
    ================================================================================
    """)


@api_router.post("/auth/send-email-otp")
async def send_email_otp(req: SendEmailOTPRequest):
    """
    Send OTP to email address (mocked).
    Returns is_new_user to indicate if name is needed during verification.
    """
    email = req.email.lower().strip()
    
    # Check if this email is already registered with another account (1:1 mapping)
    existing = await db.users.find_one({"email": email})
    is_new_user = existing is None
    
    # Generate 6-digit OTP
    otp = generate_otp()
    
    # Store OTP with 5 min expiry
    otp_store[f"email:{email}"] = {
        "otp": otp,
        "expires": datetime.now(timezone.utc) + timedelta(minutes=5),
        "is_new_user": is_new_user,
        "existing_user_id": existing.get("user_id") if existing else None,
        "existing_name": existing.get("name") if existing else None,
    }
    
    # In production, send actual email here
    logger.info(f"""
    ================================================================================
    📧 EMAIL OTP SENT (MOCK)
    ================================================================================
    From: noreply@filmcompanion.com
    To: {email}
    Subject: Your Film Companion OTP
    
    Your verification code is: {otp}
    
    This code will expire in 5 minutes.
    ================================================================================
    """)
    
    return {
        "success": True,
        "message": "OTP sent to your email",
        "is_new_user": is_new_user,
        "otp": otp,  # ONLY for testing - remove in production
    }


@api_router.post("/auth/send-phone-otp")
async def send_phone_otp(req: SendPhoneOTPRequest):
    """
    Send OTP to phone number (mocked).
    Returns is_new_user to indicate if name is needed during verification.
    """
    phone = req.phone.strip()
    
    # Check if this phone is already registered with another account (1:1 mapping)
    existing = await db.users.find_one({"phone": phone})
    is_new_user = existing is None
    
    # Generate 6-digit OTP
    otp = generate_otp()
    
    # Store OTP with 5 min expiry
    otp_store[f"phone:{phone}"] = {
        "otp": otp,
        "expires": datetime.now(timezone.utc) + timedelta(minutes=5),
        "is_new_user": is_new_user,
        "existing_user_id": existing.get("user_id") if existing else None,
        "existing_name": existing.get("name") if existing else None,
    }
    
    # In production, send actual SMS here via Twilio/etc
    logger.info(f"""
    ================================================================================
    📱 SMS OTP SENT (MOCK)
    ================================================================================
    To: {phone}
    Message: Your Film Companion OTP is: {otp}. Valid for 5 minutes.
    ================================================================================
    """)
    
    return {
        "success": True,
        "message": "OTP sent to your phone",
        "is_new_user": is_new_user,
        "otp": otp,  # ONLY for testing - remove in production
    }


@api_router.post("/auth/verify-otp")
async def verify_otp(req: VerifyOTPRequest):
    """
    Verify OTP and login/signup user.
    For new users: creates account with provided name.
    For existing users: logs in and returns existing data.
    Enforces strict 1:1 mapping of email/phone to user_id.
    """
    identifier = req.identifier.lower().strip() if req.type == "email" else req.identifier.strip()
    otp_key = f"{req.type}:{identifier}"
    
    # Check if OTP exists
    stored = otp_store.get(otp_key)
    
    # Test mode: Accept "123456" as a valid OTP for any user (for automation testing)
    is_test_otp = req.otp == "123456"
    
    if not stored and not is_test_otp:
        raise HTTPException(status_code=400, detail="OTP expired or not found. Please request a new one.")
    
    # If using test OTP, create a mock stored value
    if is_test_otp and not stored:
        # Check if user exists
        existing_user = await db.users.find_one({
            "$or": [{"email": identifier}, {"phone": identifier}]
        })
        stored = {
            "otp": "123456",
            "expires": datetime.now(timezone.utc) + timedelta(hours=1),
            "is_new_user": existing_user is None
        }
    
    # Check expiry (skip for test OTP)
    if not is_test_otp and datetime.now(timezone.utc) > stored["expires"]:
        del otp_store[otp_key]
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")
    
    # Verify OTP
    if stored["otp"] != req.otp and not is_test_otp:
        raise HTTPException(status_code=400, detail="Invalid OTP. Please check and try again.")
    
    # OTP is valid - clean up (only if real OTP was stored)
    if otp_key in otp_store:
        del otp_store[otp_key]
    
    is_new_user = stored["is_new_user"]
    
    if is_new_user:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        session_token = f"session_{uuid.uuid4().hex}"
        
        # Name is optional - can be set later during onboarding
        user_name = req.name.strip() if req.name else ""
        
        user_data = {
            "user_id": user_id,
            "name": user_name,
            "picture": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        # Store email or phone based on login type (strict 1:1 mapping)
        if req.type == "email":
            user_data["email"] = identifier
        else:
            user_data["phone"] = identifier
        
        await db.users.insert_one(user_data)
        
        # Send welcome email
        send_mock_welcome_email(
            identifier if req.type == "email" else f"{identifier}@phone.filmcompanion.com",
            user_name if user_name else "there"
        )
        
        logger.info(f"New user created: {user_id} via {req.type}: {identifier}")
        
        # Broadcast new user to admin dashboard
        try:
            await broadcast_new_user(user_data)
        except Exception as e:
            logger.error(f"Failed to broadcast new user: {e}")
        
    else:
        # Existing user login
        user_id = stored["existing_user_id"]
        session_token = f"session_{uuid.uuid4().hex}"
        
        logger.info(f"Existing user login: {user_id} via {req.type}: {identifier}")
    
    # Create session
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    
    # Get user data
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    # Log to Supabase for analytics
    try:
        await supabase.log_user_login(
            user_id=user_id,
            email=user.get("email"),
            phone=user.get("phone"),
            login_method=req.type,
            login_success_state=True,
            session_id=session_token
        )
        logger.info(f"Logged login to Supabase for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to log to Supabase: {e}")
    
    return {
        "user_id": user_id,
        "email": user.get("email", ""),
        "phone": user.get("phone", ""),
        "name": user.get("name", ""),
        "picture": user.get("picture", ""),
        "session_token": session_token,
        "is_new_user": is_new_user,
    }


@api_router.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    """
    Send password reset link (mocked).
    For OTP-based auth, this essentially sends a new OTP for re-verification.
    """
    email = req.email.lower().strip()
    
    # Check if user exists
    existing = await db.users.find_one({"email": email})
    
    # Always return success to prevent email enumeration
    logger.info(f"""
    ================================================================================
    📧 PASSWORD RESET EMAIL SENT (MOCK)
    ================================================================================
    From: noreply@filmcompanion.com
    To: {email}
    Subject: Reset your Film Companion Password
    
    Hi there!
    
    {"We received a request to reset your password." if existing else "If you have an account with us, you'll receive further instructions."}
    
    {"Click here to reset your password: https://filmcompanion.com/reset?token=mock_token_123" if existing else ""}
    
    If you didn't request this, please ignore this email.
    
    - The Film Companion Team
    ================================================================================
    """)
    
    return {
        "success": True,
        "message": "If an account with that email exists, we've sent a reset link.",
    }


@api_router.get("/auth/me")
async def get_me(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_str = session["expires_at"]
    expires_at = datetime.fromisoformat(expires_str) if isinstance(expires_str, str) else expires_str
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@api_router.get("/tmdb/search")
async def search_movies(query: str):
    """Search movies via TMDB API - excludes unreleased movies"""
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")
    
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.get(
            "https://api.themoviedb.org/3/search/movie",
            params={"query": query, "language": "en-US", "page": 1},
            headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="TMDB error")
    data = resp.json()
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
async def places_autocomplete(input: str):
    """Google Places autocomplete for city search"""
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.get(
            "https://maps.googleapis.com/maps/api/place/autocomplete/json",
            params={"input": input, "key": GOOGLE_MAPS_API_KEY, "types": "(cities)"}
        )
    data = resp.json()
    predictions = []
    for p in data.get("predictions", []):
        predictions.append({"description": p["description"], "place_id": p["place_id"]})
    return {"predictions": predictions}


@api_router.get("/places/geocode")
async def reverse_geocode(lat: float, lng: float):
    """Reverse geocode coordinates to city name"""
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"latlng": f"{lat},{lng}", "key": GOOGLE_MAPS_API_KEY}
        )
    data = resp.json()
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

TMDB_LANG_CODES = {
    'Hindi': 'hi', 'English': 'en', 'Telugu': 'te', 'Tamil': 'ta',
    'Malayalam': 'ml', 'Kannada': 'kn', 'Korean': 'ko', 'Bengali': 'bn',
    'Marathi': 'mr', 'Gujarati': 'gu',
}


@api_router.get("/tmdb/trending")
async def get_trending_movies(page: int = 1):
    """Get trending movies for the Library screen - excludes unreleased movies"""
    try:
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            resp = await http_client.get(
                "https://api.themoviedb.org/3/trending/movie/week",
                params={"page": min(page, 100)},
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
            return {"results": [], "page": page, "total_results": 0}
    except Exception as e:
        logger.error(f"Error fetching trending movies: {e}")
        return {"results": [], "page": page, "total_results": 0, "error": str(e)}


@api_router.get("/tmdb/feed")
async def get_movie_feed(
    genres: str = "",
    languages: str = "",
    page: int = 1,
    exclude: str = "",
    seed_movie_id: int = 0,
    liked_genres: str = "",
):
    """Get movie feed based on user preferences with adaptive learning"""
    exclude_ids = set(int(x) for x in exclude.split(',') if x.strip())
    genre_names = [g.strip() for g in genres.split(',') if g.strip()]
    liked_genre_ids = [int(x) for x in liked_genres.split(',') if x.strip()]

    # Build genre list: prioritize liked genres
    genre_id_list = []
    if liked_genre_ids:
        genre_id_list = liked_genre_ids[:3]
    elif genre_names:
        genre_id_list = [TMDB_GENRE_IDS[g] for g in genre_names if g in TMDB_GENRE_IDS]

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
            if resp.status_code == 200:
                all_movies.extend(resp.json().get("results", []))

        # 2. Recommendations from seed movie
        if seed_movie_id > 0:
            resp = await http_client.get(
                f"https://api.themoviedb.org/3/movie/{seed_movie_id}/recommendations",
                params={"page": 1},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            if resp.status_code == 200:
                all_movies.extend(resp.json().get("results", []))

        # 3. Popular fallback
        if len(all_movies) < 10:
            resp = await http_client.get(
                "https://api.themoviedb.org/3/movie/popular",
                params={"page": page},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            if resp.status_code == 200:
                all_movies.extend(resp.json().get("results", []))

        # 4. Top rated fallback
        if len(all_movies) < 15:
            resp = await http_client.get(
                "https://api.themoviedb.org/3/movie/top_rated",
                params={"page": page},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            if resp.status_code == 200:
                all_movies.extend(resp.json().get("results", []))

    # Deduplicate, exclude swiped, require poster
    seen = set()
    results = []
    for m in all_movies:
        mid = m["id"]
        if mid not in seen and mid not in exclude_ids and m.get("poster_path"):
            seen.add(mid)
            results.append({
                "id": mid, "title": m["title"],
                "poster_path": m.get("poster_path", ""),
                "backdrop_path": m.get("backdrop_path", ""),
                "release_date": m.get("release_date", ""),
                "overview": m.get("overview", ""),
                "vote_average": m.get("vote_average", 0),
                "genre_ids": m.get("genre_ids", []),
            })
    return {"results": results[:20], "page": page}


@api_router.get("/tmdb/movie/{movie_id}")
async def get_movie_details(movie_id: int):
    """Get detailed movie info including cast and crew"""
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        resp = await http_client.get(
            f"https://api.themoviedb.org/3/movie/{movie_id}",
            params={"append_to_response": "credits"},
            headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="TMDB error")
    movie = resp.json()
    credits = movie.get("credits", {})
    cast = [{"name": c["name"], "character": c.get("character", "")}
            for c in credits.get("cast", [])[:10]]
    directors = [c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"]
    genres = [g["name"] for g in movie.get("genres", [])]
    return {
        "id": movie["id"], "title": movie["title"],
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

@api_router.post("/user/profile")
async def save_user_profile(req: UserProfileRequest):
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
    """
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
async def save_user_filters(req: FiltersRequest):
    """
    Save user matching filters and preferences to Supabase.
    Also saves exclusive toggles and expand_if_run_out settings.
    """
    try:
        # Prepare preferences data
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
        
        # Save to Supabase
        await supabase.save_preferences_and_filters(req.user_id, preferences_data, req.session_id)
        
        # Save exclusive toggles if provided
        if req.exclusive_toggles:
            await supabase.save_exclusive_toggle(req.user_id, req.exclusive_toggles, req.session_id)
        
        # Save expand_if_run_out toggles if provided
        if req.expand_if_run_out_toggles:
            await supabase.save_expand_if_run_out(req.user_id, req.expand_if_run_out_toggles, req.session_id)
        
        logger.info(f"Saved filters to Supabase for user {req.user_id}")
        return {"success": True, "message": "Filters saved successfully"}
    except Exception as e:
        logger.error(f"Failed to save filters to Supabase: {e}")
        return {"success": False, "error": str(e)}


class ModeRequest(BaseModel):
    user_id: str
    mode: str  # 'buddy' or 'date'


@api_router.post("/user/mode")
async def save_user_mode(req: ModeRequest):
    """Save user's selected mode to Supabase"""
    try:
        await supabase.save_mode_selected(req.user_id, req.mode)
        logger.info(f"Saved mode to Supabase for user {req.user_id}: {req.mode}")
        return {"success": True, "message": "Mode saved successfully"}
    except Exception as e:
        logger.error(f"Failed to save mode to Supabase: {e}")
        return {"success": False, "error": str(e)}


@api_router.post("/user/swipe")
async def record_swipe(req: SwipeRequest):
    """
    Record a swipe action and update user's taste vector.
    This is the core learning mechanism.
    
    ENHANCED:
    - Tracks "didn't watch" movies separately to avoid recommending similar content
    - Extracts comprehensive signals from all TMDB data
    - Uses reasons to understand what user values in films
    """
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
            genre_key = f"unwatched_genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
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
    
    # Broadcast swipe to admin dashboard (real-time update)
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
        "message": f"Swipe recorded and taste vector updated",
        "total_swipes": taste_vector.total_swipes,
        "like_count": taste_vector.like_count,
        "dislike_count": taste_vector.dislike_count,
        "didnt_watch": is_didnt_watch,
    }


class LibraryAddRequest(BaseModel):
    user_id: str
    movie_id: int
    movie_title: str
    poster_path: Optional[str] = None
    release_date: Optional[str] = None
    is_like: bool
    rating: int = 0
    reasons: List[str] = []
    didnt_watch: bool = False


@api_router.post("/user/library/add")
async def add_to_library(req: LibraryAddRequest):
    """Add a movie to the user's personal library with rating"""
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
async def get_user_library(user_id: str):
    """Get user's personal movie library"""
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
async def record_movie_interaction(req: MovieInteractionRequest):
    """
    Record a user interaction with a movie.
    This fetches full movie details from TMDB and stores them in Supabase
    ONLY if the movie hasn't been stored before.
    This creates a curated catalog of movies users have actually interacted with.
    """
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
                    return {
                        "success": False,
                        "error": result.get("error", "Failed to save movie")
                    }
            else:
                logger.warning(f"Failed to fetch movie {req.movie_id} from TMDB: {resp.status_code}")
                return {
                    "success": False,
                    "error": f"TMDB returned status {resp.status_code}"
                }
                
    except Exception as e:
        logger.error(f"Error recording movie interaction: {e}")
        return {"success": False, "error": str(e)}


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
    except Exception as e:
        logger.error(f"Error getting catalog stats: {e}")
        return {"success": False, "error": str(e)}


@api_router.post("/recommendations")
async def get_recommendations(req: RecommendationRequest):
    """
    Get personalized movie recommendations using cosine similarity.
    This is the main recommendation endpoint.
    """
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
async def get_taste_profile(user_id: str):
    """
    Get user's taste profile for debugging/display.
    Shows top preferences in each dimension.
    """
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
async def get_swipe_history(user_id: str, limit: int = 50):
    """Get user's recent swipe history"""
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
async def reset_user_feed(user_id: str):
    """
    Reset user's swipe history to get fresh recommendations.
    Useful for:
    - Testing with fresh data
    - When user wants to re-explore content
    - When user's preferences have changed significantly
    
    Note: This does NOT reset the taste profile, only swipe history.
    """
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
async def reset_user_completely(user_id: str):
    """
    Completely reset user - removes profile, taste vector, and swipes.
    User will need to go through onboarding again.
    """
    # Delete everything
    profile_result = await db.user_profiles.delete_many({"user_id": user_id})
    taste_result = await db.user_taste_vectors.delete_many({"user_id": user_id})
    swipe_result = await db.user_swipes.delete_many({"user_id": user_id})
    unwatched_result = await db.user_unwatched_patterns.delete_many({"user_id": user_id})
    
    logger.info(f"Complete reset for user {user_id}: {profile_result.deleted_count} profiles, "
                f"{taste_result.deleted_count} taste vectors, {swipe_result.deleted_count} swipes")
    
    return {
        "success": True,
        "message": "User completely reset. Please complete onboarding again.",
        "deleted": {
            "profiles": profile_result.deleted_count,
            "taste_vectors": taste_result.deleted_count,
            "swipes": swipe_result.deleted_count,
            "unwatched_patterns": unwatched_result.deleted_count,
        }
    }


# =============================================
# Admin Dashboard Endpoints
# =============================================

# Admin credentials (for MVP - in production, use proper auth)
ADMIN_CREDENTIALS = {
    "admin@filmcompanion.com": {
        "password": "admin123",
        "name": "Admin User",
        "role": "super_admin",
    }
}

# Admin tokens store (in-memory for MVP)
admin_tokens: Dict[str, Dict[str, Any]] = {}


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminReportUpdate(BaseModel):
    status: str


@api_router.post("/admin/login")
async def admin_login(req: AdminLoginRequest):
    """Admin login endpoint"""
    admin = ADMIN_CREDENTIALS.get(req.email.lower())
    if not admin or admin["password"] != req.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = f"admin_{uuid.uuid4().hex}"
    admin_tokens[token] = {
        "email": req.email.lower(),
        "name": admin["name"],
        "role": admin["role"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    # Also store admin in database for role management
    await db.admins.update_one(
        {"email": req.email.lower()},
        {"$set": {
            "email": req.email.lower(),
            "name": admin["name"],
            "role": admin["role"],
            "last_login": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )
    
    return {
        "token": token,
        "admin": {
            "id": req.email.lower(),
            "email": req.email.lower(),
            "name": admin["name"],
            "role": admin["role"],
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
    
    # Total swipes
    total_swipes = await db.user_swipes.count_documents({})
    swipes_today = await db.user_swipes.count_documents({
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    # Total matches (placeholder - matches collection may not exist yet)
    try:
        total_matches = await db.user_matches.count_documents({})
    except:
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
    """Get all matches"""
    try:
        matches = await db.user_matches.find({}, {"_id": 0}).sort("matched_at", -1).limit(limit).to_list(length=limit)
    except:
        matches = []
    
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
    """Get user reports for moderation"""
    try:
        reports = await db.user_reports.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(length=limit)
    except:
        reports = []
    
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
    result = await db.user_reports.update_one(
        {"id": report_id},
        {"$set": {"status": req.status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"success": True}


@api_router.patch("/admin/users/{user_id}/status")
async def update_user_status(user_id: str, status: str):
    """Update user status (active, inactive, banned)"""
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
    
    # Broadcast user update to admin dashboard
    updated_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    await broadcast_user_updated(updated_user)
    
    logger.info(f"User {user_id} has been banned. Reason: {req.reason if req else 'No reason provided'}")
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
    
    # Broadcast user update to admin dashboard
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
    user_id: str
    filters: Optional[Dict] = None
    limit: int = 15
    force_refresh: bool = False  # If True, bypass cache and regenerate matches
    mode: str = "date"  # 'buddy' or 'date' - determines which mode users to match with


@api_router.post("/matches")
async def get_matches(req: MatchRequest):
    """
    Get AI-matched profiles for a user.
    
    1. Fetches user profile
    2. Applies hard filters (gender, age, language, intent)
    3. Uses LLM to score compatibility based on movie taste
    4. Returns top matches with explanations
    """
    try:
        # Get user profile from database
        user_profile = await db.user_profiles.find_one({"user_id": req.user_id})
        
        # Get user's swipe history for taste analysis
        swipes = await db.user_swipes.find(
            {"user_id": req.user_id}
        ).to_list(length=100)
        
        # Build taste profile from swipes
        liked_genres = set()
        disliked_genres = set()
        liked_movies = []
        
        for swipe in swipes:
            if swipe.get("direction") == "right":
                liked_genres.update(swipe.get("genres", []))
                liked_movies.append(swipe.get("movie_title", ""))
            else:
                disliked_genres.update(swipe.get("genres", []))
        
        # Construct profile for matching
        # If user has no profile, use defaults that will show women (for demo purposes)
        has_profile = user_profile is not None
        profile_for_matching = {
            "user_id": req.user_id,
            "name": user_profile.get("name", "User") if has_profile else "Demo User",
            "age": user_profile.get("age", 28) if has_profile else 28,
            "gender": user_profile.get("gender", "Male") if has_profile else "Male",
            "location": user_profile.get("location", "Mumbai") if has_profile else "Mumbai",
            "partnerPreference": user_profile.get("partnerPreference", "Women") if has_profile else "Women",
            "relationshipIntent": user_profile.get("relationshipIntent", ["Long-term relationship"]) if has_profile else ["Long-term relationship"],
            "genres": user_profile.get("genres", ["Drama", "Sci-Fi", "Thriller"]) if has_profile else ["Drama", "Sci-Fi", "Thriller"],
            "filmLanguages": user_profile.get("filmLanguages", ["Hindi", "English"]) if has_profile else ["Hindi", "English"],
            "languagesSpoken": user_profile.get("languagesSpoken", ["Hindi", "English"]) if has_profile else ["Hindi", "English"],
            "topMovies": user_profile.get("topMovies", []) if has_profile else [{"title": "Inception"}, {"title": "Interstellar"}],
            "movieFrequency": user_profile.get("movieFrequency", "Weekly") if has_profile else "Weekly",
            "ottTheatre": user_profile.get("ottTheatre", "Both") if has_profile else "Both",
            "bio": user_profile.get("bio", "") if has_profile else "Looking for movie companions!",
            "movieBuddyMode": user_profile.get("movieBuddyMode", False) if has_profile else True,
            "movieDateMode": user_profile.get("movieDateMode", True) if has_profile else True,
            "swipe_history": {
                "liked_genres": list(liked_genres) if liked_genres else ["Drama", "Sci-Fi", "Thriller"],
                "disliked_genres": list(disliked_genres),
                "liked_actors": ["Leonardo DiCaprio", "Christian Bale"],
                "liked_directors": ["Christopher Nolan", "Denis Villeneuve"]
            }
        }
        
        # Get matches using AI (with caching)
        matches = await get_matches_for_user(
            user_id=req.user_id,
            user_profile=profile_for_matching,
            filters=req.filters,
            use_mock_data=True,  # Using mock users for now
            force_refresh=req.force_refresh,  # Pass cache bypass option
            mode=req.mode  # Pass the user's current mode (buddy/date)
        )
        
        logger.info(f"Found {len(matches)} matches for user {req.user_id} (mode={req.mode}, force_refresh={req.force_refresh})")
        
        return {
            "success": True,
            "matches": matches[:req.limit],
            "total_candidates": len(matches),
            "cached": not req.force_refresh  # Indicate if results may be cached
        }
        
    except Exception as e:
        logger.error(f"Match error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/matches/profile/{user_id}")
async def get_match_profile(user_id: str):
    """Get detailed profile of a matched user"""
    # First check mock users
    mock_user = get_mock_user_by_id(user_id)
    if mock_user:
        return {
            "success": True,
            "profile": mock_user
        }
    
    # Then check real users in database
    user_profile = await db.user_profiles.find_one({"user_id": user_id})
    if user_profile:
        user_profile.pop("_id", None)
        return {
            "success": True,
            "profile": user_profile
        }
    
    raise HTTPException(status_code=404, detail="User not found")


@api_router.get("/matches/mock-users")
async def get_mock_users():
    """Get all mock users for testing (admin endpoint)"""
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
async def get_user_profile_by_id(user_id: str):
    """Get user profile by ID (supports mock users for testing)"""
    # First check mock users
    mock_user = get_mock_user_by_id(user_id)
    if mock_user:
        return {
            "success": True,
            "profile": mock_user
        }
    
    # Then check real users in database
    user_profile = await db.user_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if user_profile:
        return {
            "success": True,
            "profile": user_profile
        }
    
    # Check basic user info
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if user:
        return {
            "success": True, 
            "profile": {
                "user_id": user_id,
                "name": user.get("name", "Unknown"),
                "email": user.get("email"),
            }
        }
    
    raise HTTPException(status_code=404, detail="User not found")


class PictureUploadRequest(BaseModel):
    """Request to upload a profile picture"""
    user_id: str
    session_id: str
    picture_number: int  # 1-5
    image_data: str  # Base64 encoded image
    content_type: str = "image/jpeg"


class PicturesUpdateRequest(BaseModel):
    """Request to update multiple pictures at once"""
    user_id: str
    session_id: str
    pictures: Dict[str, Optional[str]]  # {"picture_1": "base64...", "picture_2": "base64...", ...}


@api_router.post("/user/pictures/upload")
async def upload_picture(req: PictureUploadRequest):
    """
    Upload a single profile picture.
    Stores image in Supabase storage and updates user_pictures table.
    """
    try:
        if req.picture_number < 1 or req.picture_number > 5:
            raise HTTPException(status_code=400, detail="picture_number must be between 1 and 5")
        
        # Upload to MongoDB storage
        picture_url = await upload_picture_to_storage(
            user_id=req.user_id,
            picture_data=req.image_data,
            picture_number=req.picture_number,
            content_type=req.content_type
        )
        
        if not picture_url:
            raise HTTPException(status_code=500, detail="Failed to upload picture to storage")
        
        # Update database
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
            "picture_url": picture_url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Picture upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/user/pictures/upload-batch")
async def upload_pictures_batch(req: PicturesUpdateRequest):
    """
    Upload multiple pictures at once.
    Used during onboarding to upload all pictures in one request.
    """
    try:
        picture_urls = {}
        errors = []
        
        for key, image_data in req.pictures.items():
            if not image_data:
                continue
                
            # Extract picture number from key (e.g., "picture_1" -> 1)
            try:
                picture_number = int(key.split("_")[1])
            except:
                errors.append(f"Invalid key format: {key}")
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
        
        logger.info(f"Uploaded {len(picture_urls)} pictures for user {req.user_id}")
        
        return {
            "success": True,
            "uploaded_count": len(picture_urls),
            "picture_urls": picture_urls,
            "errors": errors if errors else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch picture upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/user/pictures/{user_id}")
async def get_pictures(user_id: str):
    """Get all pictures for a user"""
    try:
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
        
    except Exception as e:
        logger.error(f"Get pictures error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/user/pictures/{user_id}/{picture_number}")
async def delete_picture(user_id: str, picture_number: int, session_id: str = ""):
    """Delete a specific picture"""
    try:
        if picture_number < 1 or picture_number > 5:
            raise HTTPException(status_code=400, detail="picture_number must be between 1 and 5")
        
        # Delete from storage
        deleted = await delete_picture_from_storage(user_id, picture_number)
        
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
    except Exception as e:
        logger.error(f"Delete picture error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== CHAT ENDPOINTS ==============

class SendMessageRequest(BaseModel):
    sender_id: str
    receiver_id: str
    content: str
    message_type: str = "text"  # text, image, voice, gif
    media_url: Optional[str] = None

class AcceptDeclineRequest(BaseModel):
    user_id: str
    conversation_id: str

class UnmatchRequest(BaseModel):
    user_id: str
    other_user_id: str
    reason: Optional[str] = None

class ReportRequest(BaseModel):
    reporter_id: str
    reported_id: str
    reason: str
    details: Optional[str] = None

class MeetingStatusRequest(BaseModel):
    user_id: str
    other_user_id: str
    did_meet: bool
    was_same_person: Optional[bool] = None

class IceBreakerRequest(BaseModel):
    user_id: str
    match_user_id: str

class ReplySuggestionsRequest(BaseModel):
    user_id: str
    conversation_id: str


@api_router.get("/chat/conversations/{user_id}")
async def api_get_conversations(user_id: str):
    """Get all active conversations for a user"""
    try:
        conversations = await get_conversations(user_id)
        return {"success": True, "conversations": conversations}
    except Exception as e:
        logger.error(f"Get conversations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/chat/requests/{user_id}")
async def api_get_message_requests(user_id: str):
    """Get pending message requests for a user"""
    try:
        requests = await get_message_requests(user_id)
        return {"success": True, "requests": requests}
    except Exception as e:
        logger.error(f"Get message requests error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/chat/messages/{conversation_id}")
async def api_get_messages(conversation_id: str, limit: int = 50, before: Optional[str] = None):
    """Get messages for a conversation"""
    try:
        messages = await get_messages(conversation_id, limit, before)
        return {"success": True, "messages": messages}
    except Exception as e:
        logger.error(f"Get messages error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        
        logger.info(f"AI auto-reply sent in conversation {conversation_id}: {ai_reply[:50]}...")
    except Exception as e:
        logger.error(f"Error generating AI auto-reply: {e}")


@api_router.post("/chat/send")
async def api_send_message(req: SendMessageRequest, background_tasks: BackgroundTasks):
    """Send a message and optionally trigger AI auto-reply for testing"""
    try:
        message = await send_message(
            sender_id=req.sender_id,
            receiver_id=req.receiver_id,
            content=req.content,
            message_type=req.message_type,
            media_url=req.media_url
        )
        
        # For testing: trigger AI auto-reply after a short delay
        # This simulates the match replying back
        if req.receiver_id.startswith("mock_"):
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
    except Exception as e:
        logger.error(f"Send message error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/chat/accept")
async def api_accept_request(req: AcceptDeclineRequest):
    """Accept a message request"""
    try:
        success = await accept_message_request(req.user_id, req.conversation_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Accept request error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/chat/decline")
async def api_decline_request(req: AcceptDeclineRequest):
    """Decline a message request"""
    try:
        success = await decline_message_request(req.user_id, req.conversation_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Decline request error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/chat/unmatch")
async def api_unmatch(req: UnmatchRequest):
    """Unmatch with a user"""
    try:
        success = await unmatch_user(req.user_id, req.other_user_id, req.reason)
        return {"success": success}
    except Exception as e:
        logger.error(f"Unmatch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/chat/report")
async def api_report_user(req: ReportRequest):
    """Report a user"""
    try:
        report = await report_user(
            reporter_id=req.reporter_id,
            reported_id=req.reported_id,
            reason=req.reason,
            details=req.details
        )
        return {"success": True, "report": report}
    except Exception as e:
        logger.error(f"Report user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/chat/meeting-status")
async def api_set_meeting_status(req: MeetingStatusRequest):
    """Set meeting verification status"""
    try:
        success = await set_meeting_status(
            user_id=req.user_id,
            other_user_id=req.other_user_id,
            did_meet=req.did_meet,
            was_same_person=req.was_same_person
        )
        return {"success": success}
    except Exception as e:
        logger.error(f"Set meeting status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/chat/read/{conversation_id}")
async def api_mark_read(conversation_id: str, user_id: str):
    """Mark messages as read"""
    try:
        success = await mark_messages_read(user_id, conversation_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Mark read error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/chat/ice-breakers")
async def api_get_ice_breakers(req: IceBreakerRequest):
    """Get AI-generated ice breaker suggestions"""
    try:
        # Get user profiles
        user_profile = {"user_id": req.user_id, "name": "User", "genres": ["Drama", "Sci-Fi"]}
        match_profile = get_mock_user_by_id(req.match_user_id)
        
        if not match_profile:
            match_profile = {"name": "Match", "genres": ["Drama"], "topMovies": []}
        
        ice_breakers = await generate_ice_breakers(user_profile, match_profile)
        return {"success": True, "ice_breakers": ice_breakers}
    except Exception as e:
        logger.error(f"Ice breakers error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/chat/reply-suggestions")
async def api_get_reply_suggestions(req: ReplySuggestionsRequest):
    """Get AI-generated reply suggestions"""
    try:
        # Get messages and profiles
        messages = await get_messages(req.conversation_id, limit=10)
        user_profile = {"user_id": req.user_id, "name": "User", "genres": ["Drama", "Sci-Fi"]}
        
        # Get other user from conversation
        match_profile = {"name": "Match", "genres": ["Drama"]}
        
        suggestions = await generate_reply_suggestions(
            conversation_messages=list(reversed(messages)),
            user_profile=user_profile,
            match_profile=match_profile
        )
        return {"success": True, "suggestions": suggestions}
    except Exception as e:
        logger.error(f"Reply suggestions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/chat/init-mock/{user_id}")
async def api_init_mock_conversations(user_id: str):
    """Initialize mock conversations for testing"""
    try:
        mock_users = get_all_mock_users()[:3]
        await create_mock_conversations(user_id, mock_users)
        return {"success": True, "message": "Mock conversations created"}
    except Exception as e:
        logger.error(f"Init mock conversations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================
# Tina AI Profile Builder API Endpoints
# =============================================

class TinaChatRequest(BaseModel):
    """Request model for Tina chat"""
    user_id: str
    user_name: Optional[str] = ""
    message: str = ""
    selected_option: Optional[str] = None
    selected_options: Optional[List[str]] = None
    selected_movies: Optional[List[Dict[str, Any]]] = None
    is_onboarding_complete: bool = False
    collected_fields: Optional[List[str]] = None
    conversation_context: Optional[List[Dict[str, str]]] = None


@api_router.post("/tina/chat")
async def tina_chat_endpoint(req: TinaChatRequest):
    """
    Chat with Tina AI for conversational profile building.
    
    Returns Tina's response along with:
    - Options to show as chips (if applicable)
    - Whether to show movie picker
    - Collected field info
    - Profile completion percentage
    """
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
        )
        return result
    except Exception as e:
        logger.error(f"Tina chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/tina/greeting")
async def tina_greeting_endpoint(user_name: str = ""):
    """Get Tina's initial greeting message."""
    try:
        greeting = await get_tina_greeting(user_name)
        return {"success": True, "greeting": greeting}
    except Exception as e:
        logger.error(f"Tina greeting error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/tina/missing-fields/{user_id}")
async def tina_missing_fields_endpoint(user_id: str):
    """Get list of profile fields not yet collected by Tina."""
    try:
        missing = await get_missing_fields(user_id)
        return {"success": True, "missing_fields": missing, "count": len(missing)}
    except Exception as e:
        logger.error(f"Get missing fields error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/tina/profile-data/{user_id}")
async def tina_profile_data_endpoint(user_id: str):
    """Get all profile data collected by Tina."""
    try:
        data = await get_collected_profile_data(user_id)
        return {"success": True, "profile_data": data}
    except Exception as e:
        logger.error(f"Get Tina profile data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/tina/session/{user_id}")
async def tina_clear_session_endpoint(user_id: str):
    """Clear Tina session for a user (start fresh)."""
    try:
        await clear_tina_session(user_id)
        return {"success": True, "message": "Tina session cleared"}
    except Exception as e:
        logger.error(f"Clear Tina session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class WelcomeBackRequest(BaseModel):
    user_id: str
    user_name: str = ""
    is_onboarding_complete: bool = False
    collected_fields: List[str] = []  # Fields already collected from frontend


@api_router.post("/tina/welcome-back")
async def tina_welcome_back_endpoint(req: WelcomeBackRequest):
    """Generate a contextual welcome-back message when user returns to Tina."""
    try:
        result = await generate_welcome_back_message(
            user_id=req.user_id,
            user_name=req.user_name,
            is_onboarding_complete=req.is_onboarding_complete,
            collected_fields_list=req.collected_fields,
        )
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"Welcome back error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/tina/onboarding-status/{user_id}")
async def tina_onboarding_status_endpoint(user_id: str):
    """Check user's onboarding status."""
    try:
        status = await get_user_onboarding_status(user_id)
        return {"success": True, **status}
    except Exception as e:
        logger.error(f"Onboarding status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    except Exception as e:
        logger.error(f"Get field options error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Include router after all routes are defined
app.include_router(api_router)


# Mount Socket.IO server
socket_app = socketio.ASGIApp(sio, app)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
