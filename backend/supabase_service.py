"""
Supabase Database Service
Handles all Supabase operations for the Film Companion app
"""
import os
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logger = logging.getLogger(__name__)

# Initialize Supabase client
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Optional[Client] = None

def get_supabase_client() -> Client:
    """Get or create Supabase client"""
    global supabase
    if supabase is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment")
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized")
    return supabase

# ============== USER LOGIN TRACKING ==============

async def log_user_login(
    user_id: str,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    login_method: str = "unknown",
    login_success_state: bool = True,
    device_info: Optional[str] = None,
    session_id: Optional[str] = None
) -> Dict[str, Any]:
    """Log user login event"""
    try:
        client = get_supabase_client()
        data = {
            "user_id": user_id,
            "email": email,
            "phone": phone,
            "login_method": login_method,
            "login_success_state": login_success_state,
            "logged_in_at": datetime.utcnow().isoformat(),
            "device_info": device_info,
            "session_id": session_id
        }
        result = client.table("user_logged_in").insert(data).execute()
        logger.info(f"Logged login for user {user_id}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error logging user login: {e}")
        return {"success": False, "error": str(e)}

# ============== USER SIGNUP DATA ==============

async def save_user_signup_data(user_id: str, profile_data: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
    """Save or update user signup/profile data"""
    try:
        client = get_supabase_client()
        now = datetime.utcnow()
        
        data = {
            "user_id": user_id,
            "last_modified_ts": now.isoformat(),
            "last_modified_date": now.strftime("%Y-%m-%d"),
            "name": profile_data.get("name"),
            "gender": profile_data.get("gender"),
            "date_of_birth": profile_data.get("dateOfBirth"),
            "looking_for": ",".join(profile_data.get("lookingFor", [])) if isinstance(profile_data.get("lookingFor"), list) else profile_data.get("lookingFor"),
            "who_do_you_want_to_meet": profile_data.get("whoDoYouWantToMeet"),
            "who_do_you_want_to_meet_toggle_status": profile_data.get("whoDoYouWantToMeetToggle", True),
            "languages_you_speak": ",".join(profile_data.get("languagesSpoken", [])) if isinstance(profile_data.get("languagesSpoken"), list) else profile_data.get("languagesSpoken"),
            "how_often_do_you_watch_movies": profile_data.get("movieFrequency"),
            "what_describes_you_more": profile_data.get("ottTheatre"),
            "languages_of_films_you_watch": ",".join(profile_data.get("filmLanguages", [])) if isinstance(profile_data.get("filmLanguages"), list) else profile_data.get("filmLanguages"),
            "your_favourite_genres": ",".join(profile_data.get("genres", [])) if isinstance(profile_data.get("genres"), list) else profile_data.get("genres"),
            "height": profile_data.get("height"),
            "food_preference": ",".join(profile_data.get("foodPreference", [])) if isinstance(profile_data.get("foodPreference"), list) else profile_data.get("foodPreference"),
            "education": profile_data.get("education"),
            "work_profile": profile_data.get("workProfile"),
            "how_often_do_you_travel": profile_data.get("travelFrequency"),
            "religion": profile_data.get("religion"),
            "marital_status": profile_data.get("maritalStatus"),
            "smoking_habit": profile_data.get("smoking"),
            "drinking_habit": profile_data.get("drinking"),
            "exercise_habit": profile_data.get("exercise"),
            "zodiac_sign": profile_data.get("zodiac"),
            "pets_preference": profile_data.get("pets"),
            "family_planning": profile_data.get("familyPlanning"),
            "siblings": profile_data.get("siblings"),
            "bio": profile_data.get("bio"),
            "mode_selected_during_signup": ",".join(profile_data.get("modeSelected", [])) if isinstance(profile_data.get("modeSelected"), list) else profile_data.get("modeSelected"),
            "session_id": session_id
        }
        
        # Check if user exists
        existing = client.table("user_sign_up_details").select("user_id").eq("user_id", user_id).execute()
        
        if existing.data:
            result = client.table("user_sign_up_details").update(data).eq("user_id", user_id).execute()
            logger.info(f"Updated signup data for user {user_id}")
        else:
            result = client.table("user_sign_up_details").insert(data).execute()
            logger.info(f"Inserted signup data for user {user_id}")
            
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving user signup data: {e}")
        return {"success": False, "error": str(e)}

# ============== TOP 5 MOVIES ==============

async def save_top_movies(user_id: str, movies: List[Dict[str, Any]], session_id: Optional[str] = None) -> Dict[str, Any]:
    """Save user's top 5 movies"""
    try:
        client = get_supabase_client()
        now = datetime.utcnow()
        
        # Delete existing entries for this user
        client.table("top_5_movies").delete().eq("user_id", user_id).execute()
        
        # Insert new movies
        for idx, movie in enumerate(movies[:5], 1):
            data = {
                "user_id": user_id,
                "rank_of_movie_added": idx,
                "movie_name": movie.get("title") or movie.get("movie_name"),
                "rating_given": movie.get("rating"),
                "why_do_you_love_it": ",".join(movie.get("reasons", [])) if isinstance(movie.get("reasons"), list) else movie.get("reasons"),
                "last_modified_ts": now.isoformat(),
                "last_modified_date": now.strftime("%Y-%m-%d"),
                "session_id": session_id
            }
            client.table("top_5_movies").insert(data).execute()
        
        logger.info(f"Saved {len(movies)} top movies for user {user_id}")
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving top movies: {e}")
        return {"success": False, "error": str(e)}

# ============== MOVIE SWIPES ==============

async def save_movie_swipe(
    user_id: str,
    movie_name: str,
    swiped_direction: str,  # "left" or "right"
    rating_given: Optional[int] = None,
    reasons: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Save a movie swipe action"""
    try:
        client = get_supabase_client()
        now = datetime.utcnow()
        
        data = {
            "user_id": user_id,
            "last_modified_ts": now.isoformat(),
            "last_modified_date": now.strftime("%Y-%m-%d"),
            "movie_name": movie_name,
            "swiped_left_or_right": swiped_direction,
            "rating_given": rating_given,
            "reason_given": ",".join(reasons) if reasons else None
        }
        
        result = client.table("movie_swipes").insert(data).execute()
        logger.info(f"Saved swipe for user {user_id}: {movie_name} -> {swiped_direction}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving movie swipe: {e}")
        return {"success": False, "error": str(e)}

# ============== PREFERENCES AND FILTERS ==============

async def save_preferences_and_filters(user_id: str, preferences: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
    """Save user preferences and filters"""
    try:
        client = get_supabase_client()
        now = datetime.utcnow()
        
        data = {
            "user_id": user_id,
            "last_modified_ts": now.isoformat(),
            "last_modified_date": now.strftime("%Y-%m-%d"),
            "session_id": session_id,
            "distance_radius": preferences.get("distanceRadius"),
            "age_range": preferences.get("ageRange"),
            "height_preference": preferences.get("heightPreference"),
            "languages_they_speak": preferences.get("languagesTheySpeak"),
            "favourite_genres": preferences.get("favouriteGenres"),
            "ott_or_theatre_preference": preferences.get("ottOrTheatrePreference"),
            "languages_they_watch": preferences.get("languagesTheyWatch"),
            "religion": preferences.get("religion"),
            "zodiac_sign": preferences.get("zodiacSign"),
            "siblings": preferences.get("siblings"),
            "education": preferences.get("education"),
            "travel_frequency": preferences.get("travelFrequency"),
            "smoking_preference": preferences.get("smokingPreference"),
            "drinking_preference": preferences.get("drinkingPreference"),
            "exercise_preference": preferences.get("exercisePreference"),
            "pets_preference": preferences.get("petsPreference"),
            "family_planning": preferences.get("familyPlanning"),
            "marital_status": preferences.get("maritalStatus"),
            "food_preference": preferences.get("foodPreference"),
            "intent_preference": preferences.get("intentPreference")
        }
        
        existing = client.table("preferences_and_filters").select("user_id").eq("user_id", user_id).execute()
        
        if existing.data:
            result = client.table("preferences_and_filters").update(data).eq("user_id", user_id).execute()
        else:
            result = client.table("preferences_and_filters").insert(data).execute()
            
        logger.info(f"Saved preferences for user {user_id}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving preferences: {e}")
        return {"success": False, "error": str(e)}

# ============== EXCLUSIVE TOGGLE ==============

async def save_exclusive_toggle(user_id: str, toggles: Dict[str, bool], session_id: Optional[str] = None) -> Dict[str, Any]:
    """Save exclusive toggle settings"""
    try:
        client = get_supabase_client()
        now = datetime.utcnow()
        
        data = {
            "user_id": user_id,
            "last_modified_ts": now.isoformat(),
            "last_modified_date": now.strftime("%Y-%m-%d"),
            "session_id": session_id,
            "distance_radius_exclusive_status": toggles.get("distanceRadius", False),
            "age_range_exclusive_status": toggles.get("ageRange", False),
            "height_preference_exclusive_status": toggles.get("heightPreference", False),
            "languages_they_speak_exclusive_status": toggles.get("languagesTheySpeak", False),
            "favourite_genres_exclusive_status": toggles.get("favouriteGenres", False),
            "ott_or_theatre_preference_exclusive_status": toggles.get("ottOrTheatrePreference", False),
            "languages_they_watch_exclusive_status": toggles.get("languagesTheyWatch", False),
            "religion_exclusive_status": toggles.get("religion", False),
            "zodiac_sign_exclusive_status": toggles.get("zodiacSign", False),
            "siblings_exclusive_status": toggles.get("siblings", False),
            "education_exclusive_status": toggles.get("education", False),
            "travel_frequency_exclusive_status": toggles.get("travelFrequency", False),
            "smoking_preference_exclusive_status": toggles.get("smokingPreference", False),
            "drinking_preference_exclusive_status": toggles.get("drinkingPreference", False),
            "exercise_preference_exclusive_status": toggles.get("exercisePreference", False),
            "pets_preference_exclusive_status": toggles.get("petsPreference", False),
            "family_planning_exclusive_status": toggles.get("familyPlanning", False),
            "marital_status_exclusive_status": toggles.get("maritalStatus", False),
            "food_preference_exclusive_status": toggles.get("foodPreference", False),
            "intent_preference_exclusive_status": toggles.get("intentPreference", False)
        }
        
        existing = client.table("exclusive_toggle").select("user_id").eq("user_id", user_id).execute()
        
        if existing.data:
            result = client.table("exclusive_toggle").update(data).eq("user_id", user_id).execute()
        else:
            result = client.table("exclusive_toggle").insert(data).execute()
            
        logger.info(f"Saved exclusive toggles for user {user_id}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving exclusive toggles: {e}")
        return {"success": False, "error": str(e)}

# ============== EXPAND IF RUN OUT ==============

async def save_expand_if_run_out(user_id: str, toggles: Dict[str, bool], session_id: Optional[str] = None) -> Dict[str, Any]:
    """Save expand if run out settings"""
    try:
        client = get_supabase_client()
        now = datetime.utcnow()
        
        data = {
            "user_id": user_id,
            "last_modified_ts": now.isoformat(),
            "last_modified_date": now.strftime("%Y-%m-%d"),
            "session_id": session_id,
            "distance_radius_expand_if_run_out_status": toggles.get("distanceRadius", True),
            "age_range_expand_if_run_out_status": toggles.get("ageRange", True),
            "height_preference_expand_if_run_out_status": toggles.get("heightPreference", True),
            "languages_they_speak_expand_if_run_out_status": toggles.get("languagesTheySpeak", True),
            "favourite_genres_expand_if_run_out_status": toggles.get("favouriteGenres", True),
            "ott_or_theatre_preference_expand_if_run_out_status": toggles.get("ottOrTheatrePreference", True),
            "languages_they_watch_expand_if_run_out_status": toggles.get("languagesTheyWatch", True),
            "religion_expand_if_run_out_status": toggles.get("religion", True),
            "zodiac_sign_expand_if_run_out_status": toggles.get("zodiacSign", True),
            "siblings_expand_if_run_out_status": toggles.get("siblings", True),
            "education_expand_if_run_out_status": toggles.get("education", True),
            "travel_frequency_expand_if_run_out_status": toggles.get("travelFrequency", True),
            "smoking_preference_expand_if_run_out_status": toggles.get("smokingPreference", True),
            "drinking_preference_expand_if_run_out_status": toggles.get("drinkingPreference", True),
            "exercise_preference_expand_if_run_out_status": toggles.get("exercisePreference", True),
            "pets_preference_expand_if_run_out_status": toggles.get("petsPreference", True),
            "family_planning_expand_if_run_out_status": toggles.get("familyPlanning", True),
            "marital_status_expand_if_run_out_status": toggles.get("maritalStatus", True),
            "food_preference_expand_if_run_out_status": toggles.get("foodPreference", True),
            "intent_preference_expand_if_run_out_status": toggles.get("intentPreference", True)
        }
        
        existing = client.table("expand_if_run_out").select("user_id").eq("user_id", user_id).execute()
        
        if existing.data:
            result = client.table("expand_if_run_out").update(data).eq("user_id", user_id).execute()
        else:
            result = client.table("expand_if_run_out").insert(data).execute()
            
        logger.info(f"Saved expand settings for user {user_id}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving expand settings: {e}")
        return {"success": False, "error": str(e)}

# ============== MODE SELECTED ==============

async def save_mode_selected(user_id: str, mode: str) -> Dict[str, Any]:
    """Save user's selected mode"""
    try:
        client = get_supabase_client()
        now = datetime.utcnow()
        
        data = {
            "user_id": user_id,
            "last_modified_ts": now.isoformat(),
            "last_modified_date": now.strftime("%Y-%m-%d"),
            "mode_selected": mode
        }
        
        existing = client.table("mode_selected").select("user_id").eq("user_id", user_id).execute()
        
        if existing.data:
            result = client.table("mode_selected").update(data).eq("user_id", user_id).execute()
        else:
            result = client.table("mode_selected").insert(data).execute()
            
        logger.info(f"Saved mode for user {user_id}: {mode}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving mode: {e}")
        return {"success": False, "error": str(e)}

# ============== TOGGLE VISIBILITY PROFILE ==============

async def save_visibility_toggles(user_id: str, toggles: Dict[str, bool], session_id: Optional[str] = None) -> Dict[str, Any]:
    """Save profile visibility toggle settings"""
    try:
        client = get_supabase_client()
        now = datetime.utcnow()
        
        data = {
            "user_id": user_id,
            "last_modified_ts": now.isoformat(),
            "last_modified_date": now.strftime("%Y-%m-%d"),
            "session_id": session_id,
            "location_toggle_status": toggles.get("location", True),
            "looking_for_toggle_status": toggles.get("relationshipIntent", True),
            "want_to_meet_toggle_status": toggles.get("wantToMeet", True),
            "movie_frequency_toggle_status": toggles.get("movieFrequency", True),
            "preference_toggle_status": toggles.get("ottTheatre", True),
            "film_languages_toggle_status": toggles.get("filmLanguages", True),
            "genres_toggle_status": toggles.get("genres", True),
            "height_toggle_status": toggles.get("height", True),
            "religion_toggle_status": toggles.get("religion", True),
            "marital_status_toggle_status": toggles.get("maritalStatus", True),
            "food_toggle_status": toggles.get("foodPreference", True),
            "bio_toggle_status": toggles.get("bio", True),
            "smoking_toggle_status": toggles.get("smoking", True),
            "drinking_toggle_status": toggles.get("drinking", True),
            "exercise_toggle_status": toggles.get("exercise", True),
            "zodiac_toggle_status": toggles.get("zodiac", True),
            "pets_toggle_status": toggles.get("pets", True),
            "family_planning_toggle_status": toggles.get("familyPlanning", True),
            "siblings_toggle_status": toggles.get("siblings", True),
            "education_toggle_status": toggles.get("education", True),
            "work_toggle_status": toggles.get("workProfile", True),
            "travel_toggle_status": toggles.get("travelFrequency", True)
        }
        
        existing = client.table("toggle_visibility_profile").select("user_id").eq("user_id", user_id).execute()
        
        if existing.data:
            result = client.table("toggle_visibility_profile").update(data).eq("user_id", user_id).execute()
        else:
            result = client.table("toggle_visibility_profile").insert(data).execute()
            
        logger.info(f"Saved visibility toggles for user {user_id}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving visibility toggles: {e}")
        return {"success": False, "error": str(e)}

# ============== MOVIE LIBRARY ==============

async def save_movie_to_library(movie_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save movie information to the library"""
    try:
        client = get_supabase_client()
        
        # Extract cast names
        cast_names = []
        if movie_data.get("credits", {}).get("cast"):
            cast_names = [c["name"] for c in movie_data["credits"]["cast"][:10]]
        
        data = {
            "movie_id": movie_data.get("id"),
            "movie_name": movie_data.get("title"),
            "movie_release_year": movie_data.get("release_date", "")[:4] if movie_data.get("release_date") else None,
            "movie_cast": ",".join(cast_names),
            "movie_summary": movie_data.get("overview"),
            "poster_path": movie_data.get("poster_path"),
            "backdrop_path": movie_data.get("backdrop_path"),
            "vote_average": movie_data.get("vote_average"),
            "vote_count": movie_data.get("vote_count"),
            "popularity": movie_data.get("popularity"),
            "genres": ",".join([g["name"] for g in movie_data.get("genres", [])]),
            "original_language": movie_data.get("original_language"),
            "runtime": movie_data.get("runtime"),
            "budget": movie_data.get("budget"),
            "revenue": movie_data.get("revenue"),
            "tagline": movie_data.get("tagline"),
            "status": movie_data.get("status"),
            "imdb_id": movie_data.get("imdb_id")
        }
        
        # Upsert - insert or update if exists
        existing = client.table("movie_library").select("movie_id").eq("movie_id", movie_data.get("id")).execute()
        
        if existing.data:
            result = client.table("movie_library").update(data).eq("movie_id", movie_data.get("id")).execute()
        else:
            result = client.table("movie_library").insert(data).execute()
            
        logger.info(f"Saved movie to library: {movie_data.get('title')}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving movie to library: {e}")
        return {"success": False, "error": str(e)}
