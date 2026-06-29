"""
Supabase Database Service - VERSIONED/AUDIT TRAIL MODE
Every modification creates a NEW ROW instead of updating.
This enables full history tracking and analytics.
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


def get_current_timestamp():
    """Get current UTC timestamp and date"""
    now = datetime.utcnow()
    return {
        "timestamp": now.isoformat(),
        "date": now.strftime("%Y-%m-%d")
    }


# ============== HELPER: GET LATEST ROW ==============

def get_latest_row(table: str, user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get the most recent row for a user from a table.
    Used to carry forward unchanged values.
    """
    try:
        client = get_supabase_client()
        result = client.table(table).select("*").eq("user_id", user_id).order("last_modified_ts", desc=True).limit(1).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Error getting latest row from {table}: {e}")
        return None


def merge_with_previous(previous: Optional[Dict], new_data: Dict, exclude_keys: List[str] = None) -> Dict:
    """
    Merge new data with previous row data.
    New values override previous, unchanged values carry forward.
    """
    if exclude_keys is None:
        exclude_keys = ["id", "last_modified_ts", "last_modified_date", "session_id"]
    
    if previous is None:
        return new_data
    
    merged = {}
    # Start with previous values (excluding system fields)
    for key, value in previous.items():
        if key not in exclude_keys:
            merged[key] = value
    
    # Override with new values (only if not None)
    for key, value in new_data.items():
        if value is not None:
            merged[key] = value
    
    return merged


# ============== USER LOGIN TRACKING ==============
# (Login events are always new rows - no merging needed)

async def log_user_login(
    user_id: str,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    login_method: str = "unknown",
    login_success_state: bool = True,
    device_info: Optional[str] = None,
    session_id: Optional[str] = None
) -> Dict[str, Any]:
    """Log user login event - always creates new row"""
    try:
        client = get_supabase_client()
        ts = get_current_timestamp()
        
        data = {
            "user_id": user_id,
            "email": email,
            "phone": phone,
            "login_method": login_method,
            "login_success_state": login_success_state,
            "logged_in_at": ts["timestamp"],
            "device_info": device_info,
            "session_id": session_id
        }
        
        result = client.table("user_logged_in").insert(data).execute()
        logger.info(f"Logged login for user {user_id}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error logging user login: {e}")
        return {"success": False, "error": str(e)}


# ============== USER SIGNUP DATA (VERSIONED) ==============

# Default values for user signup - used when creating first row
USER_SIGNUP_DEFAULTS = {
    "name": None,
    "gender": None,
    "date_of_birth": None,
    "looking_for": None,
    "who_do_you_want_to_meet": None,
    "who_do_you_want_to_meet_toggle_status": True,
    "languages_you_speak": None,
    "how_often_do_you_watch_movies": "Weekly",  # Default
    "what_describes_you_more": "Both",  # Default OTT/Theatre
    "languages_of_films_you_watch": None,
    "your_favourite_genres": None,
    "height": None,
    "food_preference": None,
    "education": None,
    "work_profile": None,
    "how_often_do_you_travel": "Sometimes",  # Default
    "religion": None,
    "marital_status": "Single",  # Default
    "smoking_habit": "Never",  # Default
    "drinking_habit": "Never",  # Default
    "exercise_habit": "Sometimes",  # Default
    "zodiac_sign": None,
    "pets_preference": None,
    "family_planning": None,
    "siblings": None,
    "bio": None,
    "mode_selected_during_signup": None,
}

async def save_user_signup_data(user_id: str, profile_data: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Save user signup/profile data - VERSIONED (always inserts new row).
    Carries forward unchanged values from previous row.
    """
    try:
        client = get_supabase_client()
        ts = get_current_timestamp()
        
        # Get the latest existing row for this user
        previous = get_latest_row("user_sign_up_details", user_id)
        
        # Build new data from incoming profile
        new_data = {
            "user_id": user_id,
            "last_modified_ts": ts["timestamp"],
            "last_modified_date": ts["date"],
            "session_id": session_id,
            "name": profile_data.get("name"),
            "gender": profile_data.get("gender"),
            "date_of_birth": profile_data.get("dateOfBirth") or profile_data.get("date_of_birth"),
            "age": profile_data.get("age"),
            "looking_for": ",".join(profile_data.get("lookingFor", [])) if isinstance(profile_data.get("lookingFor"), list) else (profile_data.get("lookingFor") or ",".join(profile_data.get("relationshipIntent", [])) if isinstance(profile_data.get("relationshipIntent"), list) else profile_data.get("relationshipIntent")),
            "who_do_you_want_to_meet": profile_data.get("whoDoYouWantToMeet") or profile_data.get("partnerPreference"),
            "who_do_you_want_to_meet_toggle_status": profile_data.get("whoDoYouWantToMeetToggle"),
            "languages_you_speak": ",".join(profile_data.get("languagesSpoken", [])) if isinstance(profile_data.get("languagesSpoken"), list) else profile_data.get("languagesSpoken"),
            "how_often_do_you_watch_movies": profile_data.get("movieFrequency"),
            "what_describes_you_more": profile_data.get("ottTheatre"),
            "languages_of_films_you_watch": ",".join(profile_data.get("filmLanguages", [])) if isinstance(profile_data.get("filmLanguages"), list) else profile_data.get("filmLanguages"),
            "your_favourite_genres": ",".join(profile_data.get("genres", [])) if isinstance(profile_data.get("genres"), list) else profile_data.get("genres"),
            "height": profile_data.get("height"),
            "food_preference": ",".join(profile_data.get("foodPreference", [])) if isinstance(profile_data.get("foodPreference"), list) else profile_data.get("foodPreference"),
            "education": profile_data.get("education"),
            "work_profile": profile_data.get("workProfile"),
            "how_often_do_you_travel": profile_data.get("travelFrequency") or profile_data.get("travel"),
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
        }
        
        # If this is the first row, apply defaults for None values
        if previous is None:
            for key, default_value in USER_SIGNUP_DEFAULTS.items():
                if new_data.get(key) is None and default_value is not None:
                    new_data[key] = default_value
        else:
            # Merge with previous - carry forward unchanged values
            new_data = merge_with_previous(previous, new_data)
            # Ensure timestamps are updated
            new_data["last_modified_ts"] = ts["timestamp"]
            new_data["last_modified_date"] = ts["date"]
            new_data["session_id"] = session_id
        
        # Remove 'id' if present (auto-generated)
        new_data.pop("id", None)
        
        # Always INSERT new row
        result = client.table("user_sign_up_details").insert(new_data).execute()
        logger.info(f"Inserted new signup data row for user {user_id}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving user signup data: {e}")
        return {"success": False, "error": str(e)}


# ============== TOP 5 MOVIES (VERSIONED) ==============

async def save_top_movies(user_id: str, movies: List[Dict[str, Any]], session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Save user's top 5 movies - VERSIONED.
    Each save creates 5 new rows (one per movie rank).
    """
    try:
        client = get_supabase_client()
        ts = get_current_timestamp()
        
        # Always insert new rows for each movie
        for idx, movie in enumerate(movies[:5], 1):
            data = {
                "user_id": user_id,
                "rank_of_movie_added": idx,
                "movie_name": movie.get("title") or movie.get("movie_name"),
                "rating_given": int(movie.get("rating")) if movie.get("rating") is not None else None,
                "why_do_you_love_it": ",".join(movie.get("reasons", [])) if isinstance(movie.get("reasons"), list) else movie.get("reasons"),
                "last_modified_ts": ts["timestamp"],
                "last_modified_date": ts["date"],
                "session_id": session_id
            }
            client.table("top_5_movies").insert(data).execute()
        
        logger.info(f"Inserted {len(movies)} top movies rows for user {user_id}")
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving top movies: {e}")
        return {"success": False, "error": str(e)}


# ============== MOVIE SWIPES (ALWAYS NEW ROW) ==============

async def save_movie_swipe(
    user_id: str,
    movie_name: str,
    swiped_direction: str,
    rating_given: Optional[int] = None,
    reasons: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Save a movie swipe action - always creates new row"""
    try:
        client = get_supabase_client()
        ts = get_current_timestamp()
        
        data = {
            "user_id": user_id,
            "last_modified_ts": ts["timestamp"],
            "last_modified_date": ts["date"],
            "movie_name": movie_name,
            "swiped_left_or_right": swiped_direction,
            "rating_given": rating_given,
            "reason_given": ",".join(reasons) if reasons else None
        }
        
        result = client.table("movie_swipes").insert(data).execute()
        logger.info(f"Inserted swipe for user {user_id}: {movie_name} -> {swiped_direction}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving movie swipe: {e}")
        return {"success": False, "error": str(e)}


# ============== PREFERENCES AND FILTERS (VERSIONED) ==============

PREFERENCES_DEFAULTS = {
    "distance_radius": 50,  # Default 50km
    "age_range": "18-35",  # Default
    "height_preference": None,
    "languages_they_speak": None,
    "favourite_genres": None,
    "ott_or_theatre_preference": None,
    "languages_they_watch": None,
    "religion": None,
    "zodiac_sign": None,
    "siblings": None,
    "education": None,
    "travel_frequency": None,
    "smoking_preference": None,
    "drinking_preference": None,
    "exercise_preference": None,
    "pets_preference": None,
    "family_planning": None,
    "marital_status": None,
    "food_preference": None,
    "intent_preference": None,
}

async def save_preferences_and_filters(user_id: str, preferences: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
    """Save user preferences - VERSIONED (always inserts new row)"""
    try:
        client = get_supabase_client()
        ts = get_current_timestamp()
        
        # Get latest existing row
        previous = get_latest_row("preferences_and_filters", user_id)
        
        new_data = {
            "user_id": user_id,
            "last_modified_ts": ts["timestamp"],
            "last_modified_date": ts["date"],
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
        
        if previous is None:
            for key, default_value in PREFERENCES_DEFAULTS.items():
                if new_data.get(key) is None and default_value is not None:
                    new_data[key] = default_value
        else:
            new_data = merge_with_previous(previous, new_data)
            new_data["last_modified_ts"] = ts["timestamp"]
            new_data["last_modified_date"] = ts["date"]
            new_data["session_id"] = session_id
        
        new_data.pop("id", None)
        
        result = client.table("preferences_and_filters").insert(new_data).execute()
        logger.info(f"Inserted preferences row for user {user_id}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving preferences: {e}")
        return {"success": False, "error": str(e)}


# ============== EXCLUSIVE TOGGLE (VERSIONED) ==============

EXCLUSIVE_TOGGLE_DEFAULTS = {
    "distance_radius_exclusive_status": False,
    "age_range_exclusive_status": False,
    "height_preference_exclusive_status": False,
    "languages_they_speak_exclusive_status": False,
    "favourite_genres_exclusive_status": False,
    "ott_or_theatre_preference_exclusive_status": False,
    "languages_they_watch_exclusive_status": False,
    "religion_exclusive_status": False,
    "zodiac_sign_exclusive_status": False,
    "siblings_exclusive_status": False,
    "education_exclusive_status": False,
    "travel_frequency_exclusive_status": False,
    "smoking_preference_exclusive_status": False,
    "drinking_preference_exclusive_status": False,
    "exercise_preference_exclusive_status": False,
    "pets_preference_exclusive_status": False,
    "family_planning_exclusive_status": False,
    "marital_status_exclusive_status": False,
    "food_preference_exclusive_status": False,
    "intent_preference_exclusive_status": False,
}

async def save_exclusive_toggle(user_id: str, toggles: Dict[str, bool], session_id: Optional[str] = None) -> Dict[str, Any]:
    """Save exclusive toggle settings - VERSIONED"""
    try:
        client = get_supabase_client()
        ts = get_current_timestamp()
        
        previous = get_latest_row("exclusive_toggle", user_id)
        
        new_data = {
            "user_id": user_id,
            "last_modified_ts": ts["timestamp"],
            "last_modified_date": ts["date"],
            "session_id": session_id,
            "distance_radius_exclusive_status": toggles.get("distanceRadius"),
            "age_range_exclusive_status": toggles.get("ageRange"),
            "height_preference_exclusive_status": toggles.get("heightPreference"),
            "languages_they_speak_exclusive_status": toggles.get("languagesTheySpeak"),
            "favourite_genres_exclusive_status": toggles.get("favouriteGenres"),
            "ott_or_theatre_preference_exclusive_status": toggles.get("ottOrTheatrePreference"),
            "languages_they_watch_exclusive_status": toggles.get("languagesTheyWatch"),
            "religion_exclusive_status": toggles.get("religion"),
            "zodiac_sign_exclusive_status": toggles.get("zodiacSign"),
            "siblings_exclusive_status": toggles.get("siblings"),
            "education_exclusive_status": toggles.get("education"),
            "travel_frequency_exclusive_status": toggles.get("travelFrequency"),
            "smoking_preference_exclusive_status": toggles.get("smokingPreference"),
            "drinking_preference_exclusive_status": toggles.get("drinkingPreference"),
            "exercise_preference_exclusive_status": toggles.get("exercisePreference"),
            "pets_preference_exclusive_status": toggles.get("petsPreference"),
            "family_planning_exclusive_status": toggles.get("familyPlanning"),
            "marital_status_exclusive_status": toggles.get("maritalStatus"),
            "food_preference_exclusive_status": toggles.get("foodPreference"),
            "intent_preference_exclusive_status": toggles.get("intentPreference"),
        }
        
        if previous is None:
            for key, default_value in EXCLUSIVE_TOGGLE_DEFAULTS.items():
                if new_data.get(key) is None:
                    new_data[key] = default_value
        else:
            new_data = merge_with_previous(previous, new_data)
            new_data["last_modified_ts"] = ts["timestamp"]
            new_data["last_modified_date"] = ts["date"]
            new_data["session_id"] = session_id
        
        new_data.pop("id", None)
        
        result = client.table("exclusive_toggle").insert(new_data).execute()
        logger.info(f"Inserted exclusive toggles row for user {user_id}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving exclusive toggles: {e}")
        return {"success": False, "error": str(e)}


# ============== EXPAND IF RUN OUT (VERSIONED) ==============

EXPAND_DEFAULTS = {
    "distance_radius_expand_if_run_out_status": True,
    "age_range_expand_if_run_out_status": True,
    "height_preference_expand_if_run_out_status": True,
    "languages_they_speak_expand_if_run_out_status": True,
    "favourite_genres_expand_if_run_out_status": True,
    "ott_or_theatre_preference_expand_if_run_out_status": True,
    "languages_they_watch_expand_if_run_out_status": True,
    "religion_expand_if_run_out_status": True,
    "zodiac_sign_expand_if_run_out_status": True,
    "siblings_expand_if_run_out_status": True,
    "education_expand_if_run_out_status": True,
    "travel_frequency_expand_if_run_out_status": True,
    "smoking_preference_expand_if_run_out_status": True,
    "drinking_preference_expand_if_run_out_status": True,
    "exercise_preference_expand_if_run_out_status": True,
    "pets_preference_expand_if_run_out_status": True,
    "family_planning_expand_if_run_out_status": True,
    "marital_status_expand_if_run_out_status": True,
    "food_preference_expand_if_run_out_status": True,
    "intent_preference_expand_if_run_out_status": True,
}

async def save_expand_if_run_out(user_id: str, toggles: Dict[str, bool], session_id: Optional[str] = None) -> Dict[str, Any]:
    """Save expand if run out settings - VERSIONED"""
    try:
        client = get_supabase_client()
        ts = get_current_timestamp()
        
        previous = get_latest_row("expand_if_run_out", user_id)
        
        new_data = {
            "user_id": user_id,
            "last_modified_ts": ts["timestamp"],
            "last_modified_date": ts["date"],
            "session_id": session_id,
            "distance_radius_expand_if_run_out_status": toggles.get("distanceRadius"),
            "age_range_expand_if_run_out_status": toggles.get("ageRange"),
            "height_preference_expand_if_run_out_status": toggles.get("heightPreference"),
            "languages_they_speak_expand_if_run_out_status": toggles.get("languagesTheySpeak"),
            "favourite_genres_expand_if_run_out_status": toggles.get("favouriteGenres"),
            "ott_or_theatre_preference_expand_if_run_out_status": toggles.get("ottOrTheatrePreference"),
            "languages_they_watch_expand_if_run_out_status": toggles.get("languagesTheyWatch"),
            "religion_expand_if_run_out_status": toggles.get("religion"),
            "zodiac_sign_expand_if_run_out_status": toggles.get("zodiacSign"),
            "siblings_expand_if_run_out_status": toggles.get("siblings"),
            "education_expand_if_run_out_status": toggles.get("education"),
            "travel_frequency_expand_if_run_out_status": toggles.get("travelFrequency"),
            "smoking_preference_expand_if_run_out_status": toggles.get("smokingPreference"),
            "drinking_preference_expand_if_run_out_status": toggles.get("drinkingPreference"),
            "exercise_preference_expand_if_run_out_status": toggles.get("exercisePreference"),
            "pets_preference_expand_if_run_out_status": toggles.get("petsPreference"),
            "family_planning_expand_if_run_out_status": toggles.get("familyPlanning"),
            "marital_status_expand_if_run_out_status": toggles.get("maritalStatus"),
            "food_preference_expand_if_run_out_status": toggles.get("foodPreference"),
            "intent_preference_expand_if_run_out_status": toggles.get("intentPreference"),
        }
        
        if previous is None:
            for key, default_value in EXPAND_DEFAULTS.items():
                if new_data.get(key) is None:
                    new_data[key] = default_value
        else:
            new_data = merge_with_previous(previous, new_data)
            new_data["last_modified_ts"] = ts["timestamp"]
            new_data["last_modified_date"] = ts["date"]
            new_data["session_id"] = session_id
        
        new_data.pop("id", None)
        
        result = client.table("expand_if_run_out").insert(new_data).execute()
        logger.info(f"Inserted expand settings row for user {user_id}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving expand settings: {e}")
        return {"success": False, "error": str(e)}


# ============== MODE SELECTED (VERSIONED) ==============

async def save_mode_selected(user_id: str, mode: str) -> Dict[str, Any]:
    """Save user's selected mode - VERSIONED (always inserts new row)"""
    try:
        client = get_supabase_client()
        ts = get_current_timestamp()
        
        # Always insert new row for mode changes
        data = {
            "user_id": user_id,
            "last_modified_ts": ts["timestamp"],
            "last_modified_date": ts["date"],
            "mode_selected": mode
        }
        
        result = client.table("mode_selected").insert(data).execute()
        logger.info(f"Inserted mode row for user {user_id}: {mode}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving mode: {e}")
        return {"success": False, "error": str(e)}


# ============== TOGGLE VISIBILITY PROFILE (VERSIONED) ==============

VISIBILITY_DEFAULTS = {
    "location_toggle_status": True,
    "looking_for_toggle_status": True,
    "want_to_meet_toggle_status": True,
    "movie_frequency_toggle_status": True,
    "preference_toggle_status": True,
    "film_languages_toggle_status": True,
    "genres_toggle_status": True,
    "height_toggle_status": True,
    "religion_toggle_status": True,
    "marital_status_toggle_status": True,
    "food_toggle_status": True,
    "bio_toggle_status": True,
    "smoking_toggle_status": True,
    "drinking_toggle_status": True,
    "exercise_toggle_status": True,
    "zodiac_toggle_status": True,
    "pets_toggle_status": True,
    "family_planning_toggle_status": True,
    "siblings_toggle_status": True,
    "education_toggle_status": True,
    "work_toggle_status": True,
    "travel_toggle_status": True,
}

async def save_visibility_toggles(user_id: str, toggles: Dict[str, bool], session_id: Optional[str] = None) -> Dict[str, Any]:
    """Save profile visibility toggle settings - VERSIONED"""
    try:
        client = get_supabase_client()
        ts = get_current_timestamp()
        
        previous = get_latest_row("toggle_visibility_profile", user_id)
        
        new_data = {
            "user_id": user_id,
            "last_modified_ts": ts["timestamp"],
            "last_modified_date": ts["date"],
            "session_id": session_id,
            "location_toggle_status": toggles.get("location"),
            "looking_for_toggle_status": toggles.get("relationshipIntent"),
            "want_to_meet_toggle_status": toggles.get("wantToMeet"),
            "movie_frequency_toggle_status": toggles.get("movieFrequency"),
            "preference_toggle_status": toggles.get("ottTheatre"),
            "film_languages_toggle_status": toggles.get("filmLanguages"),
            "genres_toggle_status": toggles.get("genres"),
            "height_toggle_status": toggles.get("height"),
            "religion_toggle_status": toggles.get("religion"),
            "marital_status_toggle_status": toggles.get("maritalStatus"),
            "food_toggle_status": toggles.get("foodPreference"),
            "bio_toggle_status": toggles.get("bio"),
            "smoking_toggle_status": toggles.get("smoking"),
            "drinking_toggle_status": toggles.get("drinking"),
            "exercise_toggle_status": toggles.get("exercise"),
            "zodiac_toggle_status": toggles.get("zodiac"),
            "pets_toggle_status": toggles.get("pets"),
            "family_planning_toggle_status": toggles.get("familyPlanning"),
            "siblings_toggle_status": toggles.get("siblings"),
            "education_toggle_status": toggles.get("education"),
            "work_toggle_status": toggles.get("workProfile"),
            "travel_toggle_status": toggles.get("travelFrequency"),
        }
        
        if previous is None:
            for key, default_value in VISIBILITY_DEFAULTS.items():
                if new_data.get(key) is None:
                    new_data[key] = default_value
        else:
            new_data = merge_with_previous(previous, new_data)
            new_data["last_modified_ts"] = ts["timestamp"]
            new_data["last_modified_date"] = ts["date"]
            new_data["session_id"] = session_id
        
        new_data.pop("id", None)
        
        result = client.table("toggle_visibility_profile").insert(new_data).execute()
        logger.info(f"Inserted visibility toggles row for user {user_id}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"Error saving visibility toggles: {e}")
        return {"success": False, "error": str(e)}


# ============== MOVIE LIBRARY (GLOBAL CATALOG) ==============
# Stores full movie details for movies users have interacted with
# This is NOT user-specific - it's a global movie reference table

async def save_movie_to_library(movie_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save comprehensive movie information to the global movie library.
    Only stores movies that users have interacted with (searched, liked, disliked).
    This creates a curated catalog for analytics.
    """
    try:
        client = get_supabase_client()
        
        movie_id = movie_data.get("id")
        if not movie_id:
            logger.warning(f"Movie data missing ID, skipping library save")
            return {"success": False, "error": "Missing movie ID"}
        
        # Check if movie already exists
        existing = client.table("movie_library").select("movie_id").eq("movie_id", movie_id).execute()
        if existing.data:
            logger.debug(f"Movie {movie_id} already in library, skipping")
            return {"success": True, "message": "Movie already exists", "data": existing.data}
        
        # Extract cast names safely (top 10)
        cast_names = []
        cast_ids = []
        credits = movie_data.get("credits")
        if credits and isinstance(credits, dict):
            cast_list = credits.get("cast")
            if cast_list and isinstance(cast_list, list):
                for c in cast_list[:10]:
                    if isinstance(c, dict):
                        cast_names.append(c.get("name", ""))
                        cast_ids.append(str(c.get("id", "")))
        
        # Extract director(s) from crew
        directors = []
        director_ids = []
        if credits and isinstance(credits, dict):
            crew_list = credits.get("crew")
            if crew_list and isinstance(crew_list, list):
                for c in crew_list:
                    if isinstance(c, dict) and c.get("job") == "Director":
                        directors.append(c.get("name", ""))
                        director_ids.append(str(c.get("id", "")))
        
        # Extract genres
        genres_list = movie_data.get("genres", [])
        genres_str = ""
        genre_ids_str = ""
        if genres_list and isinstance(genres_list, list):
            genre_names = []
            genre_ids = []
            for g in genres_list:
                if isinstance(g, dict):
                    genre_names.append(g.get("name", ""))
                    genre_ids.append(str(g.get("id", "")))
            genres_str = ",".join(genre_names)
            genre_ids_str = ",".join(genre_ids)
        
        # Extract keywords
        keywords_list = []
        keyword_ids = []
        keywords_data = movie_data.get("keywords")
        if keywords_data:
            kw_list = keywords_data.get("keywords") if isinstance(keywords_data, dict) else keywords_data
            if kw_list and isinstance(kw_list, list):
                for k in kw_list[:20]:  # Top 20 keywords
                    if isinstance(k, dict):
                        keywords_list.append(k.get("name", ""))
                        keyword_ids.append(str(k.get("id", "")))
        
        # Extract production companies
        production_companies = []
        prod_companies_data = movie_data.get("production_companies", [])
        if prod_companies_data and isinstance(prod_companies_data, list):
            for pc in prod_companies_data[:5]:  # Top 5
                if isinstance(pc, dict):
                    production_companies.append(pc.get("name", ""))
        
        # Extract production countries
        production_countries = []
        prod_countries_data = movie_data.get("production_countries", [])
        if prod_countries_data and isinstance(prod_countries_data, list):
            for pc in prod_countries_data:
                if isinstance(pc, dict):
                    production_countries.append(pc.get("name", ""))
        
        # Extract spoken languages
        spoken_languages = []
        spoken_lang_data = movie_data.get("spoken_languages", [])
        if spoken_lang_data and isinstance(spoken_lang_data, list):
            for sl in spoken_lang_data:
                if isinstance(sl, dict):
                    spoken_languages.append(sl.get("english_name", sl.get("name", "")))
        
        # Get release year safely
        release_date = movie_data.get("release_date", "")
        release_year = release_date[:4] if release_date and len(release_date) >= 4 else None
        
        # Build data object - only include columns that exist in the table
        # Note: Run supabase_movie_library_schema.sql to add new columns for full functionality
        data = {
            "movie_id": movie_id,
            "movie_name": movie_data.get("title"),
            "movie_release_year": release_year,
            "movie_cast": ",".join(cast_names) if cast_names else None,
            "movie_summary": movie_data.get("overview"),
            "poster_path": movie_data.get("poster_path"),
            "backdrop_path": movie_data.get("backdrop_path"),
            "vote_average": movie_data.get("vote_average"),
            "vote_count": movie_data.get("vote_count"),
            "popularity": movie_data.get("popularity"),
            "genres": genres_str if genres_str else None,
            "original_language": movie_data.get("original_language"),
            "runtime": movie_data.get("runtime"),
            "budget": movie_data.get("budget"),
            "revenue": movie_data.get("revenue"),
            "tagline": movie_data.get("tagline"),
            "status": movie_data.get("status"),
            "imdb_id": movie_data.get("imdb_id"),
        }
        
        # Try to add extended columns (will be ignored if they don't exist)
        extended_data = {
            "original_title": movie_data.get("original_title"),
            "release_date": release_date if release_date else None,
            "cast_ids": ",".join(cast_ids) if cast_ids else None,
            "directors": ",".join(directors) if directors else None,
            "director_ids": ",".join(director_ids) if director_ids else None,
            "genre_ids": genre_ids_str if genre_ids_str else None,
            "keywords": ",".join(keywords_list) if keywords_list else None,
            "keyword_ids": ",".join(keyword_ids) if keyword_ids else None,
            "spoken_languages": ",".join(spoken_languages) if spoken_languages else None,
            "production_companies": ",".join(production_companies) if production_companies else None,
            "production_countries": ",".join(production_countries) if production_countries else None,
            "homepage": movie_data.get("homepage"),
            "first_added_ts": datetime.utcnow().isoformat(),
            "interaction_count": 1,
        }
        
        # Try inserting with extended columns first, fall back to base columns if needed
        try:
            merged_data = {**data, **extended_data}
            result = client.table("movie_library").insert(merged_data).execute()
            logger.info(f"Saved movie to library with extended data: {movie_data.get('title')} (ID: {movie_id})")
            return {"success": True, "data": result.data}
        except Exception as ext_err:
            # Extended columns don't exist, use base data only
            logger.warning(f"Extended columns not available, using base data: {ext_err}")
            result = client.table("movie_library").insert(data).execute()
            logger.info(f"Saved movie to library: {movie_data.get('title')} (ID: {movie_id})")
            return {"success": True, "data": result.data}
        
    except Exception as e:
        logger.error(f"Error saving movie to library: {e}")
        return {"success": False, "error": str(e)}


async def increment_movie_interaction(movie_id: int) -> Dict[str, Any]:
    """Increment the interaction count for a movie (tracks popularity)"""
    try:
        client = get_supabase_client()
        
        # Get current count
        existing = client.table("movie_library").select("interaction_count").eq("movie_id", movie_id).execute()
        if existing.data:
            current_count = existing.data[0].get("interaction_count", 0) or 0
            result = client.table("movie_library").update({
                "interaction_count": current_count + 1,
                "last_interaction_ts": datetime.utcnow().isoformat()
            }).eq("movie_id", movie_id).execute()
            return {"success": True, "data": result.data}
        return {"success": False, "error": "Movie not found"}
    except Exception as e:
        logger.error(f"Error incrementing movie interaction: {e}")
        return {"success": False, "error": str(e)}


async def check_movie_exists(movie_id: int) -> bool:
    """Check if a movie exists in the library"""
    try:
        client = get_supabase_client()
        result = client.table("movie_library").select("movie_id").eq("movie_id", movie_id).execute()
        return bool(result.data)
    except Exception as e:
        logger.error(f"Error checking movie existence: {e}")
        return False


# =====================================================================
# AUDIT LOGGING — APPEND-ONLY (one row per event)
# These functions are best-effort: failures NEVER block the main flow.
# Requires `supabase_migration_full_audit.sql` to be applied first.
# =====================================================================


def _safe_audit_insert(table: str, row: Dict[str, Any]) -> Dict[str, Any]:
    """Insert into an audit table. Never raises - just logs warning if it
    fails (e.g. migration SQL not yet applied)."""
    try:
        client = get_supabase_client()
        # Drop None-only sparse fields? Keep nullable so we have explicit history.
        result = client.table(table).insert(row).execute()
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.warning(f"[audit] insert into {table} failed (non-blocking): {e}")
        return {"success": False, "error": str(e)}


# ----- PICTURES AUDIT ----------------------------------------------------

async def log_picture_event(
    user_id: str,
    picture_number: Optional[int],
    action: str,                    # 'upload' | 'replace' | 'delete'
    storage_path: Optional[str] = None,
    picture_url: Optional[str] = None,
    content_type: Optional[str] = None,
    size_bytes: Optional[int] = None,
    source: str = "supabase_storage",  # or 'mongodb_base64'
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    ts = get_current_timestamp()
    row = {
        "user_id": user_id,
        "session_id": session_id,
        "picture_number": picture_number,
        "action": action,
        "storage_path": storage_path,
        "picture_url": picture_url,
        "content_type": content_type,
        "size_bytes": size_bytes,
        "source": source,
        "last_modified_ts": ts["timestamp"],
        "last_modified_date": ts["date"],
    }
    return _safe_audit_insert("user_pictures", row)


# ----- TINA CHAT AUDIT ---------------------------------------------------

async def log_tina_chat_message(
    user_id: str,
    role: str,                                      # 'user' | 'tina'
    content: Optional[str] = None,
    selected_option: Optional[str] = None,
    selected_option_key: Optional[str] = None,
    question_id: Optional[str] = None,
    collected_field: Optional[str] = None,
    collected_value: Any = None,
    persona_360_phase: Optional[str] = None,
    show_options: Any = None,
    show_movie_picker: bool = False,
    archetype_reveal: Any = None,
    completion_percentage: Optional[int] = None,
    exit_intent: bool = False,
) -> Dict[str, Any]:
    ts = get_current_timestamp()
    row = {
        "user_id": user_id,
        "role": role,
        "content": content,
        "selected_option": selected_option,
        "selected_option_key": selected_option_key,
        "question_id": question_id,
        "collected_field": collected_field,
        "collected_value": collected_value if collected_value is None or isinstance(collected_value, (dict, list)) else {"value": collected_value},
        "persona_360_phase": persona_360_phase,
        "show_options": show_options if (show_options is None or isinstance(show_options, (dict, list))) else None,
        "show_movie_picker": bool(show_movie_picker),
        "archetype_reveal": archetype_reveal,
        "completion_percentage": completion_percentage,
        "exit_intent": bool(exit_intent),
        "last_modified_ts": ts["timestamp"],
        "last_modified_date": ts["date"],
    }
    return _safe_audit_insert("tina_chat_messages", row)


async def log_tina_persona_360(
    user_id: str,
    profile: Dict[str, Any],
) -> Dict[str, Any]:
    """Log a 360° persona reveal event. Stores ONLY public-safe data
    (never the raw personality vector or hidden scores)."""
    ts = get_current_timestamp()
    archetype = profile.get("archetype", {}) or {}
    intent = profile.get("intent", {}) or {}
    extra = profile.get("extra", {}) or {}
    row = {
        "user_id": user_id,
        "archetype_key": archetype.get("key"),
        "archetype_title": archetype.get("title"),
        "archetype_emoji": archetype.get("emoji"),
        "archetype_description": archetype.get("description"),
        "primary_love_language": profile.get("primary_love_language"),
        "intent_serious": intent.get("serious"),
        "intent_casual": intent.get("casual"),
        "questions_answered": profile.get("questions_answered", []),
        "favourite_trope": extra.get("favourite_trope") or profile.get("favourite_trope"),
        "favourite_genres": ",".join(extra.get("favourite_genres", []) or profile.get("favourite_genres", []) or []) or None,
        "last_modified_ts": ts["timestamp"],
        "last_modified_date": ts["date"],
    }
    return _safe_audit_insert("tina_persona_360", row)


# ----- USER-TO-USER CHAT AUDIT ------------------------------------------

async def log_user_chat_message(
    conversation_id: str,
    sender_id: str,
    receiver_id: str,
    content: str,
    message_type: str = "text",
    is_read: bool = False,
    is_first_message: bool = False,
) -> Dict[str, Any]:
    ts = get_current_timestamp()
    row = {
        "conversation_id": conversation_id,
        "sender_id": sender_id,
        "receiver_id": receiver_id,
        "message_type": message_type,
        "content": content,
        "is_read": bool(is_read),
        "is_first_message": bool(is_first_message),
        "last_modified_ts": ts["timestamp"],
        "last_modified_date": ts["date"],
    }
    return _safe_audit_insert("user_chat_messages", row)


# ----- MATCH / UNMATCH / REPORT AUDIT -----------------------------------

async def log_match_event(
    user_id: str,
    event_type: str,                       # see column comment in SQL
    target_user_id: Optional[str] = None,
    match_level: Optional[str] = None,
    compatibility_score: Optional[int] = None,
    mode: Optional[str] = None,
    source: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    ts = get_current_timestamp()
    row = {
        "user_id": user_id,
        "target_user_id": target_user_id,
        "event_type": event_type,
        "match_level": match_level,
        "compatibility_score": compatibility_score,
        "mode": mode,
        "source": source,
        "payload": payload,
        "last_modified_ts": ts["timestamp"],
        "last_modified_date": ts["date"],
    }
    return _safe_audit_insert("match_events", row)


async def log_unmatch_event(
    user_id: str,
    other_user_id: str,
    conversation_id: Optional[str] = None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    ts = get_current_timestamp()
    row = {
        "user_id": user_id,
        "other_user_id": other_user_id,
        "conversation_id": conversation_id,
        "reason": reason,
        "last_modified_ts": ts["timestamp"],
        "last_modified_date": ts["date"],
    }
    return _safe_audit_insert("unmatch_events", row)


async def log_report_event(
    reporter_id: str,
    reported_user_id: str,
    reason: Optional[str] = None,
    details: Optional[str] = None,
    conversation_id: Optional[str] = None,
) -> Dict[str, Any]:
    ts = get_current_timestamp()
    row = {
        "reporter_id": reporter_id,
        "reported_user_id": reported_user_id,
        "conversation_id": conversation_id,
        "reason": reason,
        "details": details,
        "last_modified_ts": ts["timestamp"],
        "last_modified_date": ts["date"],
    }
    return _safe_audit_insert("report_events", row)


# ----- STORAGE BUCKET HELPER (profile pictures) -------------------------

def upload_image_to_supabase_storage(
    user_id: str,
    picture_number: int,
    image_bytes: bytes,
    content_type: str = "image/jpeg",
    bucket: str = "profile-pictures",
) -> Optional[Dict[str, str]]:
    """Upload an image to Supabase Storage. Returns {storage_path, public_url}
    or None on failure."""
    try:
        client = get_supabase_client()
        # Deterministic-ish path: <user_id>/picture_<n>_<short-uuid>.<ext>
        import uuid as _uuid
        ext_map = {
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/heic": "heic",
            "image/heif": "heif",
        }
        ext = ext_map.get((content_type or "").lower(), "jpg")
        path = f"{user_id}/picture_{picture_number}_{_uuid.uuid4().hex[:8]}.{ext}"

        # Supabase storage upload
        # NB: the storage3 SDK expects file_options as a dict of strings
        res = client.storage.from_(bucket).upload(
            path=path,
            file=image_bytes,
            file_options={"content-type": content_type or "image/jpeg", "upsert": "true"},
        )
        # Get public URL
        public_url = client.storage.from_(bucket).get_public_url(path)
        # Some SDK versions return the URL with a trailing "?" – clean it.
        if public_url and public_url.endswith("?"):
            public_url = public_url[:-1]
        logger.info(f"[storage] uploaded {path} → {public_url}")
        return {"storage_path": path, "public_url": public_url}
    except Exception as e:
        logger.warning(f"[storage] upload failed (non-blocking): {e}")
        return None


def delete_image_from_supabase_storage(
    storage_path: str,
    bucket: str = "profile-pictures",
) -> bool:
    try:
        client = get_supabase_client()
        client.storage.from_(bucket).remove([storage_path])
        return True
    except Exception as e:
        logger.warning(f"[storage] delete failed (non-blocking): {e}")
        return False
