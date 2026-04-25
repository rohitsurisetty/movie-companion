"""
Movie Recommendation Engine v2.0 - Enhanced with Full Profile Signals

This module implements a robust content-based recommendation system that:
1. Uses ALL user profile data from signup for personalization
2. Filters movies strictly by user's language preferences
3. Builds comprehensive taste vectors from preferences and swipe history
4. Uses cosine similarity to rank movies for each user
5. Adapts dynamically based on user behavior
"""

import math
from typing import Dict, List, Optional, Any, Set, Tuple
from datetime import datetime, timezone
import httpx

# TMDB Configuration
TMDB_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxMDkyYWVhMzI1YWI2YWZhMTc0NjYxNjZmMDJiYjc4NiIsIm5iZiI6MTc3MzE5NDA5Mi4zNDcwMDAxLCJzdWIiOiI2OWIwY2I2YzM3MTk4MWM3MjJhYzFlODYiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.ZZcD2Bgm2DNiqXhzsBLP64R4cgWza-2CHOZ10k4Yoks"

# =============================================
# MAPPINGS AND CONSTANTS
# =============================================

# Genre mappings (TMDB ID -> Name and vice versa)
GENRE_ID_TO_NAME = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
    53: 'Thriller', 10752: 'War', 37: 'Western'
}

GENRE_NAME_TO_ID = {v: k for k, v in GENRE_ID_TO_NAME.items()}

# Comprehensive language code mappings
LANGUAGE_TO_CODE = {
    # Indian Languages
    'English': 'en', 'Hindi': 'hi', 'Telugu': 'te', 'Tamil': 'ta',
    'Malayalam': 'ml', 'Kannada': 'kn', 'Bengali': 'bn', 'Marathi': 'mr',
    'Gujarati': 'gu', 'Punjabi': 'pa', 'Urdu': 'ur', 'Odia': 'or',
    'Assamese': 'as', 'Konkani': 'kok', 'Sindhi': 'sd', 'Nepali': 'ne',
    'Sanskrit': 'sa', 'Bhojpuri': 'bh',
    # East Asian
    'Korean': 'ko', 'Japanese': 'ja', 'Chinese': 'zh', 'Mandarin': 'zh',
    'Cantonese': 'zh', 'Thai': 'th', 'Vietnamese': 'vi', 'Indonesian': 'id',
    'Malay': 'ms', 'Filipino': 'tl', 'Tagalog': 'tl',
    # European
    'French': 'fr', 'Spanish': 'es', 'German': 'de', 'Italian': 'it',
    'Portuguese': 'pt', 'Russian': 'ru', 'Polish': 'pl', 'Dutch': 'nl',
    'Swedish': 'sv', 'Norwegian': 'no', 'Danish': 'da', 'Finnish': 'fi',
    'Greek': 'el', 'Turkish': 'tr', 'Romanian': 'ro', 'Hungarian': 'hu',
    'Czech': 'cs', 'Ukrainian': 'uk',
    # Middle Eastern
    'Arabic': 'ar', 'Hebrew': 'he', 'Persian': 'fa', 'Farsi': 'fa',
    # African
    'Swahili': 'sw', 'Zulu': 'zu', 'Afrikaans': 'af',
}

CODE_TO_LANGUAGE = {v: k for k, v in LANGUAGE_TO_CODE.items()}

# Movie frequency to content freshness mapping
FREQUENCY_TO_PREFERENCE = {
    'Daily': {'recency': 'new', 'mainstream': 0.8},
    'Multiple times a week': {'recency': 'new', 'mainstream': 0.7},
    'Once a week': {'recency': 'recent', 'mainstream': 0.6},
    'Few times a month': {'recency': 'any', 'mainstream': 0.5},
    'Once a month': {'recency': 'any', 'mainstream': 0.4},
    'Rarely': {'recency': 'any', 'mainstream': 0.3},
}

# OTT vs Theatre preference mapping
OTT_THEATRE_PREFERENCE = {
    'OTT all the way': {'blockbuster': 0.3, 'indie': 0.7, 'international': 0.8},
    'Mostly OTT': {'blockbuster': 0.4, 'indie': 0.6, 'international': 0.7},
    'Both equally': {'blockbuster': 0.5, 'indie': 0.5, 'international': 0.5},
    'Mostly Theatre': {'blockbuster': 0.7, 'indie': 0.3, 'international': 0.3},
    'Theatre experience always': {'blockbuster': 0.8, 'indie': 0.2, 'international': 0.2},
}

# Relationship intent to genre affinity (subtle signals)
INTENT_GENRE_AFFINITY = {
    'Something Casual': ['Comedy', 'Action', 'Adventure'],
    'Long-term Relationship': ['Romance', 'Drama', 'Family'],
    'Movie Buddy': ['Action', 'Sci-Fi', 'Thriller', 'Horror'],
    'Not Sure Yet': [],  # No bias
    'Marriage': ['Romance', 'Drama', 'Family'],
    'Friendship': ['Comedy', 'Adventure', 'Animation'],
}


# =============================================
# UTILITY FUNCTIONS
# =============================================

def get_movie_era(release_date: str) -> str:
    """Extract decade from release date"""
    if not release_date:
        return 'unknown'
    try:
        year = int(release_date[:4])
        decade = (year // 10) * 10
        return f"{decade}s"
    except:
        return 'unknown'


def get_language_codes(languages: List[str]) -> Set[str]:
    """Convert language names to ISO codes"""
    codes = set()
    for lang in languages:
        lang_clean = lang.strip()
        if lang_clean in LANGUAGE_TO_CODE:
            codes.add(LANGUAGE_TO_CODE[lang_clean])
        elif len(lang_clean) == 2:  # Already a code
            codes.add(lang_clean.lower())
    return codes


def cosine_similarity(vec1: Dict[str, float], vec2: Dict[str, float]) -> float:
    """
    Compute cosine similarity between two sparse vectors (dicts).
    Returns a value between -1 and 1, where 1 is identical.
    """
    all_keys = set(vec1.keys()) | set(vec2.keys())
    
    if not all_keys:
        return 0.0
    
    dot_product = 0.0
    norm1 = 0.0
    norm2 = 0.0
    
    for key in all_keys:
        v1 = vec1.get(key, 0.0)
        v2 = vec2.get(key, 0.0)
        dot_product += v1 * v2
        norm1 += v1 * v1
        norm2 += v2 * v2
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return dot_product / (math.sqrt(norm1) * math.sqrt(norm2))


# =============================================
# TASTE VECTOR CLASS
# =============================================

class TasteVector:
    """
    Represents a user's comprehensive taste profile as a multi-dimensional vector.
    
    Dimensions include:
    - genre_* : Genre preferences
    - actor_* : Actor preferences  
    - director_* : Director preferences
    - era_* : Era/decade preferences
    - lang_* : Language preferences (from both spoken and film languages)
    - rating_* : Rating preferences
    - mood_* : Mood preferences (action-packed, emotional, etc.)
    - content_* : Content type preferences (blockbuster, indie, international)
    """
    
    def __init__(self):
        self.vector: Dict[str, float] = {}
        self.like_count = 0
        self.dislike_count = 0
        self.total_swipes = 0
        self.preferred_languages: Set[str] = set()  # ISO codes for filtering
        self.movie_frequency: str = ''
        self.ott_theatre: str = ''
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "vector": self.vector,
            "like_count": self.like_count,
            "dislike_count": self.dislike_count,
            "total_swipes": self.total_swipes,
            "preferred_languages": list(self.preferred_languages),
            "movie_frequency": self.movie_frequency,
            "ott_theatre": self.ott_theatre,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TasteVector':
        tv = cls()
        tv.vector = data.get("vector", {})
        tv.like_count = data.get("like_count", 0)
        tv.dislike_count = data.get("dislike_count", 0)
        tv.total_swipes = data.get("total_swipes", 0)
        tv.preferred_languages = set(data.get("preferred_languages", []))
        tv.movie_frequency = data.get("movie_frequency", "")
        tv.ott_theatre = data.get("ott_theatre", "")
        return tv
    
    def add_signal(self, key: str, weight: float):
        """Add a signal to the taste vector"""
        if key not in self.vector:
            self.vector[key] = 0.0
        self.vector[key] += weight
    
    def normalize(self):
        """Normalize the vector to unit length"""
        magnitude = math.sqrt(sum(v * v for v in self.vector.values()))
        if magnitude > 0:
            for key in self.vector:
                self.vector[key] /= magnitude


# =============================================
# PROFILE-BASED INITIALIZATION
# =============================================

def initialize_taste_vector_from_profile(profile: Dict[str, Any]) -> TasteVector:
    """
    Initialize a comprehensive taste vector from user's complete signup profile.
    
    Uses ALL available signals:
    - Favorite genres (strong signal)
    - Film languages (for filtering AND preference)
    - Languages spoken (secondary language signal)
    - Top 5 movies (extract genres, actors, directors, era)
    - Movie frequency (mainstream vs niche preference)
    - OTT/Theatre preference (blockbuster vs indie)
    - Relationship intent (subtle genre affinity)
    """
    tv = TasteVector()
    
    # ========================
    # 1. LANGUAGE PREFERENCES (Critical for filtering)
    # ========================
    film_languages = profile.get("filmLanguages", [])
    spoken_languages = profile.get("languagesSpoken", [])
    
    # Combine both for filtering (union of languages user watches + speaks)
    all_languages = set(film_languages) | set(spoken_languages)
    tv.preferred_languages = get_language_codes(list(all_languages))
    
    # Add language signals to vector (film languages weighted higher)
    for lang in film_languages:
        lang_code = LANGUAGE_TO_CODE.get(lang, lang.lower()[:2])
        tv.add_signal(f"lang_{lang_code}", 1.0)  # Strong signal for film languages
    
    for lang in spoken_languages:
        lang_code = LANGUAGE_TO_CODE.get(lang, lang.lower()[:2])
        tv.add_signal(f"lang_{lang_code}", 0.5)  # Moderate signal for spoken languages
    
    # ========================
    # 2. GENRE PREFERENCES
    # ========================
    genres = profile.get("genres", [])
    for genre in genres:
        genre_key = f"genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
        tv.add_signal(genre_key, 1.5)  # Strong weight for explicitly selected genres
    
    # ========================
    # 3. TOP 5 MOVIES (Rich signal source)
    # ========================
    top_movies = profile.get("topMovies", [])
    for i, movie in enumerate(top_movies):
        # Weight decreases slightly for lower-ranked movies
        rank_weight = 1.5 - (i * 0.1)  # 1.5, 1.4, 1.3, 1.2, 1.1
        
        # Genre signals from top movies
        movie_genres = movie.get("genres", [])
        for genre in movie_genres:
            genre_key = f"genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
            tv.add_signal(genre_key, rank_weight)
        
        # Era signal
        release_date = movie.get("release_date", "")
        era = get_movie_era(release_date)
        if era != 'unknown':
            tv.add_signal(f"era_{era}", 0.5 * rank_weight)
        
        # Rating preference signal
        vote_avg = movie.get("vote_average", 0)
        personal_rating = movie.get("rating", 0)
        
        # Use personal rating if available, otherwise use TMDB rating
        effective_rating = personal_rating if personal_rating > 0 else vote_avg
        
        if effective_rating >= 8.0:
            tv.add_signal("quality_excellent", 0.3 * rank_weight)
        elif effective_rating >= 7.0:
            tv.add_signal("quality_good", 0.3 * rank_weight)
        elif effective_rating >= 6.0:
            tv.add_signal("quality_decent", 0.2 * rank_weight)
    
    # ========================
    # 4. MOVIE FREQUENCY (Mainstream vs Niche)
    # ========================
    movie_frequency = profile.get("movieFrequency", "")
    tv.movie_frequency = movie_frequency
    
    if movie_frequency in FREQUENCY_TO_PREFERENCE:
        pref = FREQUENCY_TO_PREFERENCE[movie_frequency]
        mainstream_weight = pref['mainstream']
        
        # Frequent watchers tend to explore more
        if mainstream_weight >= 0.6:
            tv.add_signal("content_mainstream", mainstream_weight)
            tv.add_signal("content_popular", mainstream_weight * 0.8)
        else:
            tv.add_signal("content_niche", 1 - mainstream_weight)
            tv.add_signal("content_indie", (1 - mainstream_weight) * 0.8)
        
        # Recency preference
        if pref['recency'] == 'new':
            tv.add_signal("era_2020s", 0.5)
            tv.add_signal("era_2010s", 0.3)
        elif pref['recency'] == 'recent':
            tv.add_signal("era_2020s", 0.3)
            tv.add_signal("era_2010s", 0.4)
            tv.add_signal("era_2000s", 0.2)
    
    # ========================
    # 5. OTT vs THEATRE PREFERENCE
    # ========================
    ott_theatre = profile.get("ottTheatre", "")
    tv.ott_theatre = ott_theatre
    
    if ott_theatre in OTT_THEATRE_PREFERENCE:
        pref = OTT_THEATRE_PREFERENCE[ott_theatre]
        
        if pref['blockbuster'] >= 0.6:
            tv.add_signal("content_blockbuster", pref['blockbuster'])
            tv.add_signal("popularity_high", pref['blockbuster'] * 0.5)
        
        if pref['indie'] >= 0.5:
            tv.add_signal("content_indie", pref['indie'])
            tv.add_signal("content_arthouse", pref['indie'] * 0.5)
        
        if pref['international'] >= 0.5:
            tv.add_signal("content_international", pref['international'])
            tv.add_signal("content_foreign", pref['international'] * 0.5)
    
    # ========================
    # 6. RELATIONSHIP INTENT (Subtle genre affinity)
    # ========================
    relationship_intents = profile.get("relationshipIntent", [])
    for intent in relationship_intents:
        if intent in INTENT_GENRE_AFFINITY:
            affinity_genres = INTENT_GENRE_AFFINITY[intent]
            for genre in affinity_genres:
                genre_key = f"genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
                tv.add_signal(genre_key, 0.3)  # Subtle boost
    
    # ========================
    # 7. AGE-BASED PREFERENCES (if available)
    # ========================
    age = profile.get("age", 0)
    if age > 0:
        if age < 25:
            # Younger users might prefer newer, action-packed content
            tv.add_signal("era_2020s", 0.3)
            tv.add_signal("era_2010s", 0.2)
            tv.add_signal("genre_action", 0.2)
            tv.add_signal("genre_comedy", 0.2)
        elif age < 35:
            # 25-35: Mix of new and classic
            tv.add_signal("era_2020s", 0.2)
            tv.add_signal("era_2010s", 0.3)
            tv.add_signal("era_2000s", 0.2)
        elif age < 50:
            # 35-50: Appreciates classics
            tv.add_signal("era_2000s", 0.3)
            tv.add_signal("era_1990s", 0.3)
            tv.add_signal("genre_drama", 0.2)
        else:
            # 50+: Classic cinema appreciation
            tv.add_signal("era_1990s", 0.3)
            tv.add_signal("era_1980s", 0.3)
            tv.add_signal("era_1970s", 0.2)
            tv.add_signal("genre_drama", 0.3)
    
    return tv


# =============================================
# COMPREHENSIVE MOVIE DATA EXTRACTION
# =============================================

async def enrich_movie_with_full_details(movie_id: int, http_client: httpx.AsyncClient) -> Dict[str, Any]:
    """
    Fetch COMPREHENSIVE movie details from TMDB including:
    - Basic info (title, overview, runtime, etc.)
    - All genres
    - Full cast (top 10 actors)
    - Full crew (directors, writers, composers, cinematographers)
    - Keywords/tags
    - Production companies
    - Spoken languages
    - Budget & Revenue (for blockbuster vs indie classification)
    - Popularity metrics
    - Release info
    
    This is the main enrichment function used for both Top 5 movies and swiped movies.
    """
    try:
        # Fetch movie with credits AND keywords in a single call
        resp = await http_client.get(
            f"https://api.themoviedb.org/3/movie/{movie_id}",
            params={"append_to_response": "credits,keywords"},
            headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
        )
        if resp.status_code == 200:
            data = resp.json()
            credits = data.get("credits", {})
            keywords_data = data.get("keywords", {})
            
            # Extract cast (top 10 main actors)
            cast = []
            for c in credits.get("cast", [])[:10]:
                cast.append({
                    "name": c.get("name", ""),
                    "character": c.get("character", ""),
                    "order": c.get("order", 99),  # Billing order
                    "known_for": c.get("known_for_department", "Acting"),
                })
            
            # Extract directors
            directors = [c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"]
            
            # Extract writers (screenplay, story, writer)
            writers = [c["name"] for c in credits.get("crew", []) 
                      if c.get("job") in ["Screenplay", "Writer", "Story", "Novel"]]
            
            # Extract composers (music)
            composers = [c["name"] for c in credits.get("crew", []) 
                        if c.get("job") in ["Original Music Composer", "Music", "Composer"]]
            
            # Extract cinematographers
            cinematographers = [c["name"] for c in credits.get("crew", []) 
                               if c.get("job") in ["Director of Photography", "Cinematography"]]
            
            # Extract producers (top 3)
            producers = [c["name"] for c in credits.get("crew", [])[:20] 
                        if c.get("job") in ["Producer", "Executive Producer"]][:3]
            
            # Extract keywords/tags
            keywords = [k.get("name", "") for k in keywords_data.get("keywords", [])]
            
            # Extract production companies
            production_companies = [p.get("name", "") for p in data.get("production_companies", [])]
            
            # Extract spoken languages
            spoken_languages = [l.get("english_name", l.get("name", "")) 
                               for l in data.get("spoken_languages", [])]
            
            # Extract production countries
            production_countries = [c.get("name", "") for c in data.get("production_countries", [])]
            
            # Determine content type based on budget/revenue
            budget = data.get("budget", 0)
            revenue = data.get("revenue", 0)
            popularity = data.get("popularity", 0)
            
            content_type = "unknown"
            if budget > 100_000_000 or popularity > 100:
                content_type = "blockbuster"
            elif budget > 30_000_000 or popularity > 50:
                content_type = "mainstream"
            elif budget > 5_000_000 or popularity > 20:
                content_type = "mid_budget"
            elif budget > 0 or popularity > 5:
                content_type = "indie"
            else:
                content_type = "unknown"
            
            # Determine runtime category
            runtime = data.get("runtime", 0)
            runtime_category = "standard"
            if runtime > 0:
                if runtime < 90:
                    runtime_category = "short"
                elif runtime < 120:
                    runtime_category = "standard"
                elif runtime < 150:
                    runtime_category = "long"
                else:
                    runtime_category = "epic"
            
            return {
                "id": data["id"],
                "title": data.get("title", ""),
                "original_title": data.get("original_title", ""),
                "tagline": data.get("tagline", ""),
                "overview": data.get("overview", ""),
                "genres": [g["name"] for g in data.get("genres", [])],
                "cast": cast,
                "cast_names": [c["name"] for c in cast],  # Just names for quick access
                "directors": directors,
                "writers": writers,
                "composers": composers,
                "cinematographers": cinematographers,
                "producers": producers,
                "keywords": keywords,
                "production_companies": production_companies,
                "production_countries": production_countries,
                "spoken_languages": spoken_languages,
                "release_date": data.get("release_date", ""),
                "vote_average": data.get("vote_average", 0),
                "vote_count": data.get("vote_count", 0),
                "original_language": data.get("original_language", ""),
                "popularity": popularity,
                "budget": budget,
                "revenue": revenue,
                "runtime": runtime,
                "runtime_category": runtime_category,
                "content_type": content_type,
                "adult": data.get("adult", False),
                "status": data.get("status", ""),
            }
    except Exception as e:
        print(f"Error fetching full movie details for {movie_id}: {e}")
    return {}


# Backward compatibility alias
async def enrich_movie_with_details(movie_id: int, http_client: httpx.AsyncClient) -> Dict[str, Any]:
    """Backward compatible wrapper - now uses full details"""
    return await enrich_movie_with_full_details(movie_id, http_client)


async def enrich_top_movies(top_movies: List[Dict[str, Any]], http_client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    """
    Fetch comprehensive TMDB details for all top 5 movies.
    This enrichment is crucial for building an accurate initial taste profile.
    
    For each movie, we get:
    - Full cast and crew
    - Keywords/tags
    - Production details
    - All metadata
    """
    enriched_movies = []
    
    for movie in top_movies:
        movie_id = movie.get("id")
        if not movie_id:
            enriched_movies.append(movie)
            continue
        
        try:
            full_details = await enrich_movie_with_full_details(movie_id, http_client)
            if full_details:
                # Merge original user data (like personal rating) with TMDB data
                enriched = {**full_details}
                enriched["personal_rating"] = movie.get("rating", 0)
                enriched["user_reasons"] = movie.get("reasons", [])
                enriched_movies.append(enriched)
            else:
                enriched_movies.append(movie)
        except Exception as e:
            print(f"Error enriching top movie {movie_id}: {e}")
            enriched_movies.append(movie)
    
    return enriched_movies


def initialize_taste_vector_from_enriched_movies(
    tv: TasteVector,
    enriched_movies: List[Dict[str, Any]]
) -> TasteVector:
    """
    Extract comprehensive signals from enriched top 5 movies.
    Uses ALL available TMDB data for each movie.
    """
    for i, movie in enumerate(enriched_movies):
        # Weight decreases slightly for lower-ranked movies (1st = 1.5, 5th = 1.1)
        rank_weight = 1.5 - (i * 0.1)
        personal_rating = movie.get("personal_rating", 0)
        
        # Boost weight based on personal rating (user gave 5 stars = very important)
        if personal_rating >= 5:
            rank_weight *= 1.3
        elif personal_rating >= 4:
            rank_weight *= 1.15
        
        # ========================
        # 1. GENRES (Strong signal)
        # ========================
        for genre in movie.get("genres", []):
            if isinstance(genre, str):
                genre_key = f"genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
                tv.add_signal(genre_key, rank_weight * 1.2)
        
        # ========================
        # 2. DIRECTORS (Very strong signal - users who like a movie usually like director)
        # ========================
        for director in movie.get("directors", []):
            if isinstance(director, str):
                director_key = f"director_{director.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
                tv.add_signal(director_key, rank_weight * 1.5)
        
        # ========================
        # 3. WRITERS (Strong signal)
        # ========================
        for writer in movie.get("writers", [])[:3]:
            if isinstance(writer, str):
                writer_key = f"writer_{writer.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
                tv.add_signal(writer_key, rank_weight * 0.8)
        
        # ========================
        # 4. ACTORS (Lead actors get more weight)
        # ========================
        cast_names = movie.get("cast_names", [])
        if not cast_names:
            # Fallback to cast if cast_names not available
            cast = movie.get("cast", [])
            if cast and isinstance(cast[0], dict):
                cast_names = [c.get("name", "") for c in cast if c.get("name")]
            elif cast and isinstance(cast[0], str):
                cast_names = cast
        
        for j, actor_name in enumerate(cast_names[:8]):
            if isinstance(actor_name, str) and actor_name:
                actor_key = f"actor_{actor_name.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
                # Lead actors get full weight
                if j < 3:
                    tv.add_signal(actor_key, rank_weight * 1.0)
                elif j < 5:
                    tv.add_signal(actor_key, rank_weight * 0.6)
                else:
                    tv.add_signal(actor_key, rank_weight * 0.3)
        
        # ========================
        # 5. COMPOSERS (Music lovers signal)
        # ========================
        for composer in movie.get("composers", [])[:2]:
            if isinstance(composer, str):
                composer_key = f"composer_{composer.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
                tv.add_signal(composer_key, rank_weight * 0.5)
        
        # ========================
        # 6. KEYWORDS (Thematic signals - very valuable!)
        # ========================
        for keyword in movie.get("keywords", [])[:12]:
            if isinstance(keyword, str):
                keyword_key = f"keyword_{keyword.lower().replace(' ', '_').replace('-', '_')}"
                tv.add_signal(keyword_key, rank_weight * 0.7)
        
        # ========================
        # 7. PRODUCTION COMPANIES (Studio preference)
        # ========================
        for company in movie.get("production_companies", [])[:2]:
            if isinstance(company, str):
                company_key = f"studio_{company.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
                tv.add_signal(company_key, rank_weight * 0.3)
        
        # ========================
        # 8. PRODUCTION COUNTRIES
        # ========================
        for country in movie.get("production_countries", [])[:2]:
            if isinstance(country, str):
                country_key = f"country_{country.lower().replace(' ', '_').replace('-', '_')}"
                tv.add_signal(country_key, rank_weight * 0.4)
        
        # ========================
        # 9. ERA/DECADE
        # ========================
        era = get_movie_era(movie.get("release_date", ""))
        if era != 'unknown':
            tv.add_signal(f"era_{era}", rank_weight * 0.5)
        
        # ========================
        # 10. LANGUAGE
        # ========================
        orig_lang = movie.get("original_language", "")
        if orig_lang:
            tv.add_signal(f"lang_{orig_lang}", rank_weight * 0.6)
        
        # ========================
        # 11. CONTENT TYPE
        # ========================
        content_type = movie.get("content_type", "")
        if content_type and content_type != "unknown":
            tv.add_signal(f"content_{content_type}", rank_weight * 0.4)
        
        # ========================
        # 12. RUNTIME CATEGORY
        # ========================
        runtime_category = movie.get("runtime_category", "")
        if runtime_category and runtime_category != "standard":
            tv.add_signal(f"runtime_{runtime_category}", rank_weight * 0.3)
        
        # ========================
        # 13. QUALITY SIGNALS
        # ========================
        vote_avg = movie.get("vote_average", 0)
        vote_count = movie.get("vote_count", 0)
        
        if vote_avg >= 8.0 and vote_count >= 1000:
            tv.add_signal("quality_critically_acclaimed", rank_weight * 0.4)
        elif vote_avg >= 7.0:
            tv.add_signal("quality_well_received", rank_weight * 0.3)
        
        # ========================
        # 14. USER'S REASONS (from rating modal)
        # ========================
        user_reasons = movie.get("user_reasons", [])
        for reason in user_reasons:
            reason_lower = reason.lower() if isinstance(reason, str) else ""
            
            if any(word in reason_lower for word in ['story', 'plot', 'narrative']):
                tv.add_signal("quality_story", rank_weight * 0.5)
            if any(word in reason_lower for word in ['performance', 'acting', 'cast']):
                tv.add_signal("quality_acting", rank_weight * 0.5)
            if any(word in reason_lower for word in ['emotional', 'connection', 'heartfelt']):
                tv.add_signal("quality_emotional", rank_weight * 0.5)
            if any(word in reason_lower for word in ['craft', 'visual', 'cinematography']):
                tv.add_signal("quality_visuals", rank_weight * 0.5)
    
    return tv


def update_taste_vector_from_swipe(
    tv: TasteVector,
    movie_details: Dict[str, Any],
    direction: str,  # 'right' (like) or 'left' (dislike)
    rating: Optional[int] = None,
    reason: Optional[str] = None
) -> TasteVector:
    """
    Update taste vector based on a swipe action with COMPREHENSIVE learning.
    
    Extracts signals from ALL available TMDB data:
    - Direction: Like adds positive weight, dislike adds negative
    - Rating (1-5): Modifies the intensity of learning
    - Reason: Adds specific signals (e.g., "Great cast" boosts actor weights)
    - Movie features: Genres, actors, directors, writers, composers, cinematographers
    - Keywords: Thematic tags from TMDB
    - Production: Companies, countries
    - Languages: Original and spoken
    - Content type: Blockbuster, mainstream, indie
    - Runtime: Short, standard, long, epic
    - Era: Decade of release
    """
    # Base weight depends on direction
    if direction == 'right':
        base_weight = 1.0
        tv.like_count += 1
        
        # Rating modifies weight (1-5 stars → 0.4-1.2 weight)
        if rating:
            base_weight = 0.2 + (rating * 0.2)
    else:
        base_weight = -0.4  # Negative but not too strong for dislikes
        tv.dislike_count += 1
    
    tv.total_swipes += 1
    
    # ========================
    # 1. GENRE SIGNALS (Primary signal)
    # ========================
    for genre in movie_details.get("genres", []):
        genre_key = f"genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
        tv.add_signal(genre_key, base_weight * 1.0)
    
    # ========================
    # 2. ACTOR SIGNALS (with billing order weighting)
    # ========================
    cast = movie_details.get("cast", [])
    cast_names = movie_details.get("cast_names", [])
    
    # Process actors - handle multiple data formats
    actor_names_to_process = []
    
    if cast_names and isinstance(cast_names, list) and len(cast_names) > 0:
        # Prefer cast_names if available (list of strings)
        actor_names_to_process = [(name, i) for i, name in enumerate(cast_names[:8]) if isinstance(name, str)]
    elif cast and isinstance(cast, list) and len(cast) > 0:
        # Check if cast is a list of dicts
        if isinstance(cast[0], dict):
            for i, actor_info in enumerate(cast[:8]):
                actor_name = actor_info.get("name", "")
                order = actor_info.get("order", i)
                if actor_name and isinstance(actor_name, str):
                    actor_names_to_process.append((actor_name, order))
        # Or if cast is a list of strings (legacy)
        elif isinstance(cast[0], str):
            actor_names_to_process = [(name, i) for i, name in enumerate(cast[:5]) if isinstance(name, str)]
    
    # Now process the actors with proper weighting
    for actor_name, order in actor_names_to_process:
        try:
            actor_key = f"actor_{actor_name.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
            # Lead actors (billing 0-2) get full weight, supporting cast gets less
            if order < 3:
                actor_weight = base_weight * 1.0
            elif order < 5:
                actor_weight = base_weight * 0.7
            else:
                actor_weight = base_weight * 0.4
            tv.add_signal(actor_key, actor_weight)
        except Exception as e:
            print(f"Error processing actor {actor_name}: {e}")
    
    # ========================
    # 3. DIRECTOR SIGNALS (Very strong signal)
    # ========================
    for director in movie_details.get("directors", []):
        director_key = f"director_{director.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
        tv.add_signal(director_key, base_weight * 1.5)  # Directors are very strong signals
    
    # ========================
    # 4. WRITER SIGNALS (Strong signal for story lovers)
    # ========================
    for writer in movie_details.get("writers", [])[:3]:
        writer_key = f"writer_{writer.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
        tv.add_signal(writer_key, base_weight * 0.8)
    
    # ========================
    # 5. COMPOSER SIGNALS (For music appreciation)
    # ========================
    for composer in movie_details.get("composers", [])[:2]:
        composer_key = f"composer_{composer.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
        tv.add_signal(composer_key, base_weight * 0.5)
    
    # ========================
    # 6. CINEMATOGRAPHER SIGNALS (For visual style lovers)
    # ========================
    for cinematographer in movie_details.get("cinematographers", [])[:2]:
        dop_key = f"dop_{cinematographer.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
        tv.add_signal(dop_key, base_weight * 0.5)
    
    # ========================
    # 7. KEYWORDS/TAGS (Thematic signals - very valuable!)
    # ========================
    for keyword in movie_details.get("keywords", [])[:10]:
        keyword_key = f"keyword_{keyword.lower().replace(' ', '_').replace('-', '_')}"
        tv.add_signal(keyword_key, base_weight * 0.6)
    
    # ========================
    # 8. PRODUCTION COMPANY SIGNALS (Studio preference)
    # ========================
    for company in movie_details.get("production_companies", [])[:3]:
        company_key = f"studio_{company.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
        tv.add_signal(company_key, base_weight * 0.3)
    
    # ========================
    # 9. PRODUCTION COUNTRY SIGNALS
    # ========================
    for country in movie_details.get("production_countries", [])[:2]:
        country_key = f"country_{country.lower().replace(' ', '_').replace('-', '_')}"
        tv.add_signal(country_key, base_weight * 0.4)
    
    # ========================
    # 10. ERA/DECADE SIGNAL
    # ========================
    era = get_movie_era(movie_details.get("release_date", ""))
    if era != 'unknown':
        tv.add_signal(f"era_{era}", base_weight * 0.5)
    
    # ========================
    # 11. LANGUAGE SIGNALS (Original + Spoken)
    # ========================
    orig_lang = movie_details.get("original_language", "")
    if orig_lang:
        tv.add_signal(f"lang_{orig_lang}", base_weight * 0.7)
    
    # Spoken languages also matter
    for spoken_lang in movie_details.get("spoken_languages", [])[:3]:
        lang_code = LANGUAGE_TO_CODE.get(spoken_lang, spoken_lang[:2].lower() if len(spoken_lang) >= 2 else "")
        if lang_code:
            tv.add_signal(f"lang_{lang_code}", base_weight * 0.3)
    
    # ========================
    # 12. CONTENT TYPE SIGNALS
    # ========================
    content_type = movie_details.get("content_type", "")
    if content_type and content_type != "unknown":
        tv.add_signal(f"content_{content_type}", base_weight * 0.5)
    else:
        # Fallback: determine from popularity/budget
        popularity = movie_details.get("popularity", 0)
        budget = movie_details.get("budget", 0)
        
        if popularity > 100 or budget > 100_000_000:
            tv.add_signal("content_blockbuster", base_weight * 0.4)
        elif popularity > 50 or budget > 30_000_000:
            tv.add_signal("content_mainstream", base_weight * 0.3)
        elif popularity < 20 and budget < 10_000_000:
            tv.add_signal("content_indie", base_weight * 0.4)
    
    # ========================
    # 13. RUNTIME CATEGORY SIGNAL
    # ========================
    runtime_category = movie_details.get("runtime_category", "")
    if runtime_category and runtime_category != "standard":
        tv.add_signal(f"runtime_{runtime_category}", base_weight * 0.3)
    
    # ========================
    # 14. QUALITY SIGNALS (Vote average based)
    # ========================
    vote_avg = movie_details.get("vote_average", 0)
    vote_count = movie_details.get("vote_count", 0)
    
    if vote_avg >= 8.0 and vote_count >= 1000:
        tv.add_signal("quality_critically_acclaimed", base_weight * 0.3)
    elif vote_avg >= 7.0 and vote_count >= 500:
        tv.add_signal("quality_well_received", base_weight * 0.2)
    elif vote_avg < 5.0 and vote_count >= 100:
        tv.add_signal("quality_cult_potential", base_weight * 0.1)
    
    # ========================
    # 15. REASON-BASED LEARNING (User's explicit reasons)
    # ========================
    if reason:
        reason_lower = reason.lower()
        
        # Cast-related reasons - boost actors more
        if any(word in reason_lower for word in ['cast', 'actor', 'actress', 'performance', 'acting', 'performances']):
            for actor_name in movie_details.get("cast_names", movie_details.get("cast", []))[:3]:
                if isinstance(actor_name, str):
                    actor_key = f"actor_{actor_name.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
                    tv.add_signal(actor_key, 0.6 if direction == 'right' else -0.4)
        
        # Director-related reasons
        if any(word in reason_lower for word in ['director', 'directed', 'filmmaker', 'vision', 'auteur']):
            for director in movie_details.get("directors", []):
                director_key = f"director_{director.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
                tv.add_signal(director_key, 0.8 if direction == 'right' else -0.4)
        
        # Story/writing-related
        if any(word in reason_lower for word in ['story', 'plot', 'narrative', 'script', 'writing', 'screenplay']):
            tv.add_signal("quality_story", 0.4 if direction == 'right' else -0.2)
            for writer in movie_details.get("writers", [])[:2]:
                writer_key = f"writer_{writer.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
                tv.add_signal(writer_key, 0.5 if direction == 'right' else -0.3)
        
        # Visuals/cinematography-related
        if any(word in reason_lower for word in ['visual', 'cinematography', 'beautiful', 'stunning', 'gorgeous', 'shots']):
            tv.add_signal("quality_visuals", 0.4 if direction == 'right' else -0.2)
            for dop in movie_details.get("cinematographers", [])[:1]:
                dop_key = f"dop_{dop.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
                tv.add_signal(dop_key, 0.5 if direction == 'right' else -0.3)
        
        # Music/score-related
        if any(word in reason_lower for word in ['music', 'score', 'soundtrack', 'songs', 'composer']):
            tv.add_signal("quality_music", 0.4 if direction == 'right' else -0.2)
            for composer in movie_details.get("composers", [])[:1]:
                comp_key = f"composer_{composer.lower().replace(' ', '_').replace('.', '').replace('-', '_')}"
                tv.add_signal(comp_key, 0.5 if direction == 'right' else -0.3)
        
        # Emotional connection
        if any(word in reason_lower for word in ['emotional', 'touched', 'moved', 'cry', 'tears', 'heartfelt']):
            tv.add_signal("quality_emotional", 0.4 if direction == 'right' else -0.2)
        
        # Fun/entertaining
        if any(word in reason_lower for word in ['fun', 'entertaining', 'enjoyable', 'popcorn', 'laugh']):
            tv.add_signal("quality_entertaining", 0.3 if direction == 'right' else -0.2)
        
        # Thought-provoking
        if any(word in reason_lower for word in ['thought', 'think', 'deep', 'meaningful', 'profound']):
            tv.add_signal("quality_thoughtful", 0.3 if direction == 'right' else -0.2)
        
        # "Didn't watch" handling - minimal negative impact
        if any(word in reason_lower for word in ["didn't watch", "haven't seen", "not seen", "unwatched", "not watched"]):
            # Partially reverse the negative signals we added for genres
            for genre in movie_details.get("genres", []):
                genre_key = f"genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
                tv.add_signal(genre_key, 0.3)  # Partial reversal
    
    return tv


# =============================================
# MOVIE SCORING AND FILTERING
# =============================================

def compute_movie_vector(movie: Dict[str, Any]) -> Dict[str, float]:
    """
    Compute a feature vector for a movie.
    This vector represents the movie in the same space as user taste vectors.
    """
    vector: Dict[str, float] = {}
    
    # Genre features
    for genre_id in movie.get("genre_ids", []):
        genre_name = GENRE_ID_TO_NAME.get(genre_id, "")
        if genre_name:
            genre_key = f"genre_{genre_name.lower().replace(' ', '_').replace('-', '_')}"
            vector[genre_key] = 1.0
    
    # Era feature
    era = get_movie_era(movie.get("release_date", ""))
    if era != 'unknown':
        vector[f"era_{era}"] = 0.6
    
    # Rating/quality feature
    rating = movie.get("vote_average", 0)
    if rating >= 8.0:
        vector["quality_excellent"] = 1.0
    elif rating >= 7.0:
        vector["quality_good"] = 0.8
    elif rating >= 6.0:
        vector["quality_decent"] = 0.6
    else:
        vector["quality_below_average"] = 0.4
    
    # Popularity/content type feature
    popularity = movie.get("popularity", 0)
    if popularity > 100:
        vector["content_blockbuster"] = 0.8
        vector["popularity_high"] = 1.0
        vector["content_mainstream"] = 0.7
    elif popularity > 50:
        vector["popularity_medium"] = 0.7
        vector["content_mainstream"] = 0.5
    else:
        vector["popularity_low"] = 0.4
        vector["content_indie"] = 0.5
        vector["content_niche"] = 0.4
    
    # Language feature
    orig_lang = movie.get("original_language", "")
    if orig_lang:
        vector[f"lang_{orig_lang}"] = 1.0
        if orig_lang != 'en':
            vector["content_international"] = 0.6
            vector["content_foreign"] = 0.5
    
    return vector


def score_movie_for_user(
    movie: Dict[str, Any],
    user_taste: TasteVector,
    swiped_ids: Set[int]
) -> Tuple[float, bool]:
    """
    Score a movie for a user based on their taste vector.
    
    Returns:
        Tuple of (score, passes_language_filter)
        - score: 0-1, higher is better match
        - passes_language_filter: True if movie language matches user preferences
    """
    movie_id = movie.get("id")
    
    # Skip already swiped movies
    if movie_id in swiped_ids:
        return (-1.0, False)
    
    # Check language filter
    movie_lang = movie.get("original_language", "")
    passes_language = True
    
    if user_taste.preferred_languages:
        # Movie must be in one of user's preferred languages
        passes_language = movie_lang in user_taste.preferred_languages
    
    # Compute movie vector
    movie_vector = compute_movie_vector(movie)
    
    # Compute cosine similarity
    similarity = cosine_similarity(user_taste.vector, movie_vector)
    
    # Normalize to 0-1 range (cosine similarity is -1 to 1)
    score = (similarity + 1) / 2
    
    # Apply quality boost
    rating = movie.get("vote_average", 0)
    vote_count = movie.get("vote_count", 0)
    
    if rating >= 7.5 and vote_count >= 1000:
        score *= 1.15
    elif rating >= 7.0 and vote_count >= 500:
        score *= 1.08
    
    # Language match boost (if it matches preferred languages, extra boost)
    if passes_language and movie_lang in user_taste.preferred_languages:
        score *= 1.1
    
    # Cold start: boost popular movies for new users
    if user_taste.total_swipes < 10:
        popularity = movie.get("popularity", 0)
        if popularity > 50:
            score *= 1.05
    
    return (min(score, 1.0), passes_language)


# =============================================
# CANDIDATE FETCHING
# =============================================

async def get_candidate_movies(
    user_taste: TasteVector,
    page: int = 1,
    exclude_ids: Set[int] = None
) -> List[Dict[str, Any]]:
    """
    Get candidate movies from TMDB based on user's preferences.
    
    Strategy:
    1. Query by preferred languages (CRITICAL)
    2. Query by top genres
    3. Add trending/popular for diversity
    4. Filter and deduplicate
    """
    if exclude_ids is None:
        exclude_ids = set()
    
    all_movies = []
    
    # Extract top genres from taste vector
    genre_scores = []
    for key, value in user_taste.vector.items():
        if key.startswith("genre_") and value > 0:
            genre_name = key.replace("genre_", "").replace("_", " ").title()
            if genre_name == "Sci Fi":
                genre_name = "Sci-Fi"
            genre_id = GENRE_NAME_TO_ID.get(genre_name)
            if genre_id:
                genre_scores.append((genre_id, value))
    
    genre_scores.sort(key=lambda x: x[1], reverse=True)
    top_genre_ids = [g[0] for g in genre_scores[:3]]
    
    # Get preferred language codes for filtering
    preferred_langs = list(user_taste.preferred_languages) if user_taste.preferred_languages else []
    
    async with httpx.AsyncClient(timeout=15.0) as http_client:
        
        # 1. LANGUAGE-SPECIFIC DISCOVERY (Primary source)
        if preferred_langs:
            for lang_code in preferred_langs[:3]:  # Top 3 languages
                params = {
                    "with_original_language": lang_code,
                    "sort_by": "popularity.desc",
                    "vote_count.gte": 50,
                    "page": page
                }
                
                # Add genre filter if available
                if top_genre_ids:
                    params["with_genres"] = ','.join(str(g) for g in top_genre_ids[:2])
                
                try:
                    resp = await http_client.get(
                        "https://api.themoviedb.org/3/discover/movie",
                        params=params,
                        headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
                    )
                    if resp.status_code == 200:
                        results = resp.json().get("results", [])
                        all_movies.extend(results)
                except Exception as e:
                    print(f"Error fetching {lang_code} movies: {e}")
        
        # 2. GENRE-BASED DISCOVERY (if we have genre preferences)
        if top_genre_ids and len(all_movies) < 40:
            genre_str = ','.join(str(g) for g in top_genre_ids)
            params = {
                "with_genres": genre_str,
                "sort_by": "vote_average.desc",
                "vote_count.gte": 100,
                "page": page
            }
            
            # Add language filter if available
            if preferred_langs:
                params["with_original_language"] = '|'.join(preferred_langs[:5])
            
            try:
                resp = await http_client.get(
                    "https://api.themoviedb.org/3/discover/movie",
                    params=params,
                    headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
                )
                if resp.status_code == 200:
                    all_movies.extend(resp.json().get("results", []))
            except:
                pass
        
        # 3. TRENDING MOVIES (for diversity)
        try:
            resp = await http_client.get(
                "https://api.themoviedb.org/3/trending/movie/week",
                params={"page": page},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            if resp.status_code == 200:
                trending = resp.json().get("results", [])
                # Filter trending by language if preferences exist
                if preferred_langs:
                    trending = [m for m in trending if m.get("original_language") in preferred_langs]
                all_movies.extend(trending)
        except:
            pass
        
        # 4. TOP RATED (quality content)
        try:
            resp = await http_client.get(
                "https://api.themoviedb.org/3/movie/top_rated",
                params={"page": page},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            if resp.status_code == 200:
                top_rated = resp.json().get("results", [])
                # Filter by language
                if preferred_langs:
                    top_rated = [m for m in top_rated if m.get("original_language") in preferred_langs]
                all_movies.extend(top_rated)
        except:
            pass
        
        # 5. POPULAR (for cold start and diversity)
        if user_taste.total_swipes < 10 or len(all_movies) < 30:
            try:
                resp = await http_client.get(
                    "https://api.themoviedb.org/3/movie/popular",
                    params={"page": page},
                    headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
                )
                if resp.status_code == 200:
                    popular = resp.json().get("results", [])
                    # Filter by language
                    if preferred_langs:
                        popular = [m for m in popular if m.get("original_language") in preferred_langs]
                    all_movies.extend(popular)
            except:
                pass
    
    # Deduplicate while preserving order
    seen = set()
    unique_movies = []
    for movie in all_movies:
        mid = movie.get("id")
        if mid and mid not in seen and mid not in exclude_ids and movie.get("poster_path"):
            seen.add(mid)
            unique_movies.append(movie)
    
    return unique_movies


# =============================================
# MAIN RECOMMENDATION FUNCTION
# =============================================

async def get_personalized_feed(
    user_taste: TasteVector,
    swiped_ids: Set[int],
    page: int = 1,
    limit: int = 20
) -> List[Dict[str, Any]]:
    """
    Get a personalized movie feed for the user.
    
    Process:
    1. Get candidate movies (filtered by language)
    2. Score each movie using cosine similarity
    3. Apply language filter (strict)
    4. Sort by score
    5. Return top N
    """
    # Get candidates
    candidates = await get_candidate_movies(user_taste, page, swiped_ids)
    
    # Score each movie
    scored_movies = []
    for movie in candidates:
        score, passes_language = score_movie_for_user(movie, user_taste, swiped_ids)
        
        # Only include movies that pass the language filter (if filter is set)
        if score >= 0:
            if not user_taste.preferred_languages or passes_language:
                scored_movies.append((movie, score))
    
    # Sort by score (descending)
    scored_movies.sort(key=lambda x: x[1], reverse=True)
    
    # Format results
    results = []
    for movie, score in scored_movies[:limit]:
        results.append({
            "id": movie["id"],
            "title": movie["title"],
            "poster_path": movie.get("poster_path", ""),
            "backdrop_path": movie.get("backdrop_path", ""),
            "release_date": movie.get("release_date", ""),
            "overview": movie.get("overview", ""),
            "vote_average": movie.get("vote_average", 0),
            "vote_count": movie.get("vote_count", 0),
            "genre_ids": movie.get("genre_ids", []),
            "original_language": movie.get("original_language", ""),
            "recommendation_score": round(score, 3),
        })
    
    return results
