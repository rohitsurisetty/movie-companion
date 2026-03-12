from fastapi import FastAPI, APIRouter, Request, Response, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import httpx
from pathlib import Path
from pydantic import BaseModel
import uuid
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# API Keys (hardcoded as per requirements)
GOOGLE_MAPS_API_KEY = "AIzaSyB-JXNABvg2sas93j8AycV82Ykn0IF2Erc"
TMDB_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxMDkyYWVhMzI1YWI2YWZhMTc0NjYxNjZmMDJiYjc4NiIsIm5iZiI6MTc3MzE5NDA5Mi4zNDcwMDAxLCJzdWIiOiI2OWIwY2I2YzM3MTk4MWM3MjJhYzFlODYiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.ZZcD2Bgm2DNiqXhzsBLP64R4cgWza-2CHOZ10k4Yoks"
EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class SessionRequest(BaseModel):
    session_id: str


class MockLoginRequest(BaseModel):
    email: str
    name: str


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
    """Search movies via TMDB API"""
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
    for m in data.get("results", [])[:20]:
        results.append({
            "id": m["id"], "title": m["title"],
            "poster_path": m.get("poster_path", ""),
            "release_date": m.get("release_date", ""),
            "overview": m.get("overview", ""),
        })
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
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
