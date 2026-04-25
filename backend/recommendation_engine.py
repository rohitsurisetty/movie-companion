"""
Movie Recommendation Engine using Cosine Similarity and Taste Vectors

This module implements a content-based recommendation system that:
1. Builds user taste vectors from their preferences and swipe history
2. Computes movie feature vectors
3. Uses cosine similarity to rank movies for each user
"""

import math
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
import httpx

# TMDB Configuration
TMDB_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxMDkyYWVhMzI1YWI2YWZhMTc0NjYxNjZmMDJiYjc4NiIsIm5iZiI6MTc3MzE5NDA5Mi4zNDcwMDAxLCJzdWIiOiI2OWIwY2I2YzM3MTk4MWM3MjJhYzFlODYiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.ZZcD2Bgm2DNiqXhzsBLP64R4cgWza-2CHOZ10k4Yoks"

# Genre mappings (TMDB ID -> Name and vice versa)
GENRE_ID_TO_NAME = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
    53: 'Thriller', 10752: 'War', 37: 'Western'
}

GENRE_NAME_TO_ID = {v: k for k, v in GENRE_ID_TO_NAME.items()}

# Language mappings
LANGUAGE_CODES = {
    'English': 'en', 'Hindi': 'hi', 'Telugu': 'te', 'Tamil': 'ta',
    'Malayalam': 'ml', 'Kannada': 'kn', 'Korean': 'ko', 'Bengali': 'bn',
    'Marathi': 'mr', 'Gujarati': 'gu', 'Punjabi': 'pa', 'Urdu': 'ur',
    'Japanese': 'ja', 'French': 'fr', 'Spanish': 'es', 'German': 'de',
    'Italian': 'it', 'Portuguese': 'pt', 'Chinese': 'zh', 'Russian': 'ru'
}

# Era/Decade extraction
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


def cosine_similarity(vec1: Dict[str, float], vec2: Dict[str, float]) -> float:
    """
    Compute cosine similarity between two sparse vectors (dicts).
    Returns a value between -1 and 1, where 1 is identical.
    """
    # Get common keys
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


class TasteVector:
    """
    Represents a user's taste profile as a multi-dimensional vector.
    
    Dimensions:
    - genre_* : Genre preferences (e.g., genre_action, genre_comedy)
    - actor_* : Actor preferences (e.g., actor_tom_hanks)
    - director_* : Director preferences
    - era_* : Era/decade preferences (e.g., era_1990s, era_2000s)
    - lang_* : Language preferences
    - rating_* : Rating preferences (high_rated, low_rated)
    """
    
    def __init__(self):
        self.vector: Dict[str, float] = {}
        self.like_count = 0
        self.dislike_count = 0
        self.total_swipes = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "vector": self.vector,
            "like_count": self.like_count,
            "dislike_count": self.dislike_count,
            "total_swipes": self.total_swipes
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TasteVector':
        tv = cls()
        tv.vector = data.get("vector", {})
        tv.like_count = data.get("like_count", 0)
        tv.dislike_count = data.get("dislike_count", 0)
        tv.total_swipes = data.get("total_swipes", 0)
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


def initialize_taste_vector_from_profile(profile: Dict[str, Any]) -> TasteVector:
    """
    Initialize a taste vector from user's signup profile.
    
    Uses:
    - Top 5 favorite movies (extracts genres, actors, directors, era)
    - Favorite genres
    - Film languages
    """
    tv = TasteVector()
    
    # Add genre preferences (weight: 1.0 for initial preferences)
    genres = profile.get("genres", [])
    for genre in genres:
        genre_key = f"genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
        tv.add_signal(genre_key, 1.0)
    
    # Add language preferences (weight: 0.8)
    languages = profile.get("filmLanguages", [])
    for lang in languages:
        lang_key = f"lang_{lang.lower()}"
        tv.add_signal(lang_key, 0.8)
    
    # Add signals from top 5 movies (weight: 1.5 - these are strong indicators)
    top_movies = profile.get("topMovies", [])
    for movie in top_movies:
        # Genre signals from top movies
        movie_genres = movie.get("genres", [])
        for genre in movie_genres:
            genre_key = f"genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
            tv.add_signal(genre_key, 1.5)
        
        # Era signal
        release_date = movie.get("release_date", "")
        era = get_movie_era(release_date)
        if era != 'unknown':
            tv.add_signal(f"era_{era}", 0.5)
        
        # Rating signal (prefer similar rated movies)
        rating = movie.get("vote_average", 0)
        if rating >= 8.0:
            tv.add_signal("rating_excellent", 0.3)
        elif rating >= 7.0:
            tv.add_signal("rating_good", 0.3)
        elif rating >= 6.0:
            tv.add_signal("rating_average", 0.3)
    
    return tv


async def enrich_movie_with_details(movie_id: int, http_client: httpx.AsyncClient) -> Dict[str, Any]:
    """Fetch detailed movie info including cast and crew from TMDB"""
    try:
        resp = await http_client.get(
            f"https://api.themoviedb.org/3/movie/{movie_id}",
            params={"append_to_response": "credits"},
            headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
        )
        if resp.status_code == 200:
            data = resp.json()
            credits = data.get("credits", {})
            return {
                "id": data["id"],
                "title": data.get("title", ""),
                "genres": [g["name"] for g in data.get("genres", [])],
                "cast": [c["name"] for c in credits.get("cast", [])[:5]],
                "directors": [c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"],
                "release_date": data.get("release_date", ""),
                "vote_average": data.get("vote_average", 0),
                "original_language": data.get("original_language", ""),
                "popularity": data.get("popularity", 0),
            }
    except Exception as e:
        print(f"Error fetching movie {movie_id}: {e}")
    return {}


def update_taste_vector_from_swipe(
    tv: TasteVector,
    movie_details: Dict[str, Any],
    direction: str,  # 'right' (like) or 'left' (dislike)
    rating: Optional[int] = None,
    reason: Optional[str] = None
) -> TasteVector:
    """
    Update taste vector based on a swipe action.
    
    - Right swipe (like): Adds positive weight to movie features
    - Left swipe (dislike): Adds negative weight to movie features
    - Rating: Modifies weight based on rating (1-5 stars)
    - Reason: Adds specific signals based on why user liked/disliked
    """
    # Base weight depends on direction
    if direction == 'right':
        base_weight = 1.0
        tv.like_count += 1
        
        # Modify weight based on rating
        if rating:
            # Rating 1-5 maps to weight 0.2-1.0
            base_weight = 0.2 + (rating - 1) * 0.2
    else:
        base_weight = -0.5  # Negative for dislikes
        tv.dislike_count += 1
    
    tv.total_swipes += 1
    
    # Add genre signals
    for genre in movie_details.get("genres", []):
        genre_key = f"genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
        tv.add_signal(genre_key, base_weight)
    
    # Add actor signals (top 3 actors get strongest signal)
    for i, actor in enumerate(movie_details.get("cast", [])[:5]):
        actor_key = f"actor_{actor.lower().replace(' ', '_')}"
        # Diminishing weight for supporting actors
        actor_weight = base_weight * (1.0 - i * 0.15)
        tv.add_signal(actor_key, actor_weight)
    
    # Add director signals
    for director in movie_details.get("directors", []):
        director_key = f"director_{director.lower().replace(' ', '_')}"
        tv.add_signal(director_key, base_weight * 1.2)  # Directors are strong signals
    
    # Add era signal
    era = get_movie_era(movie_details.get("release_date", ""))
    if era != 'unknown':
        tv.add_signal(f"era_{era}", base_weight * 0.3)
    
    # Add language signal
    orig_lang = movie_details.get("original_language", "")
    if orig_lang:
        tv.add_signal(f"lang_{orig_lang}", base_weight * 0.5)
    
    # Add reason-based signals for right swipes
    if direction == 'right' and reason:
        reason_lower = reason.lower()
        if 'cast' in reason_lower or 'actor' in reason_lower:
            # Boost actor signals
            for actor in movie_details.get("cast", [])[:3]:
                actor_key = f"actor_{actor.lower().replace(' ', '_')}"
                tv.add_signal(actor_key, 0.5)
        elif 'director' in reason_lower:
            for director in movie_details.get("directors", []):
                director_key = f"director_{director.lower().replace(' ', '_')}"
                tv.add_signal(director_key, 0.5)
        elif 'genre' in reason_lower or 'type' in reason_lower:
            for genre in movie_details.get("genres", []):
                genre_key = f"genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
                tv.add_signal(genre_key, 0.5)
    
    # Add reason-based negative signals for left swipes
    if direction == 'left' and reason:
        reason_lower = reason.lower()
        if "didn't watch" in reason_lower or "haven't seen" in reason_lower:
            # Don't penalize too much for unwatched movies
            # Reduce the negative signals we just added
            for genre in movie_details.get("genres", []):
                genre_key = f"genre_{genre.lower().replace(' ', '_').replace('-', '_')}"
                tv.add_signal(genre_key, 0.3)  # Partial reversal
    
    return tv


def compute_movie_vector(movie: Dict[str, Any]) -> Dict[str, float]:
    """
    Compute a feature vector for a movie.
    
    This vector represents the movie in the same space as user taste vectors,
    allowing cosine similarity comparison.
    """
    vector: Dict[str, float] = {}
    
    # Genre features (weight: 1.0)
    for genre_id in movie.get("genre_ids", []):
        genre_name = GENRE_ID_TO_NAME.get(genre_id, "")
        if genre_name:
            genre_key = f"genre_{genre_name.lower().replace(' ', '_').replace('-', '_')}"
            vector[genre_key] = 1.0
    
    # Era feature
    era = get_movie_era(movie.get("release_date", ""))
    if era != 'unknown':
        vector[f"era_{era}"] = 0.5
    
    # Rating feature
    rating = movie.get("vote_average", 0)
    if rating >= 8.0:
        vector["rating_excellent"] = 1.0
    elif rating >= 7.0:
        vector["rating_good"] = 1.0
    elif rating >= 6.0:
        vector["rating_average"] = 1.0
    else:
        vector["rating_below_average"] = 1.0
    
    # Popularity feature (normalized)
    popularity = movie.get("popularity", 0)
    if popularity > 100:
        vector["popularity_high"] = 1.0
    elif popularity > 50:
        vector["popularity_medium"] = 0.7
    else:
        vector["popularity_low"] = 0.3
    
    # Language feature
    orig_lang = movie.get("original_language", "")
    if orig_lang:
        vector[f"lang_{orig_lang}"] = 0.8
    
    return vector


def compute_movie_vector_detailed(movie_details: Dict[str, Any]) -> Dict[str, float]:
    """
    Compute a detailed feature vector for a movie (with cast/director info).
    Used when we have full movie details.
    """
    vector = compute_movie_vector(movie_details)
    
    # Add actor features
    for i, actor in enumerate(movie_details.get("cast", [])[:5]):
        actor_key = f"actor_{actor.lower().replace(' ', '_')}"
        # Diminishing weight for supporting actors
        vector[actor_key] = 1.0 - i * 0.15
    
    # Add director features
    for director in movie_details.get("directors", []):
        director_key = f"director_{director.lower().replace(' ', '_')}"
        vector[director_key] = 1.2
    
    return vector


def score_movie_for_user(
    movie: Dict[str, Any],
    user_taste: TasteVector,
    swiped_ids: set
) -> float:
    """
    Score a movie for a user based on their taste vector.
    
    Returns a score between 0 and 1, where higher is better.
    """
    # Skip already swiped movies
    if movie.get("id") in swiped_ids:
        return -1.0
    
    # Compute movie vector
    movie_vector = compute_movie_vector(movie)
    
    # Compute cosine similarity
    similarity = cosine_similarity(user_taste.vector, movie_vector)
    
    # Normalize to 0-1 range (cosine similarity is -1 to 1)
    score = (similarity + 1) / 2
    
    # Boost for highly rated movies
    rating = movie.get("vote_average", 0)
    if rating >= 7.5:
        score *= 1.1
    
    # Slight boost for popular movies (helps with cold start)
    if user_taste.total_swipes < 10:
        popularity = movie.get("popularity", 0)
        if popularity > 50:
            score *= 1.05
    
    return min(score, 1.0)  # Cap at 1.0


async def get_candidate_movies(
    user_taste: TasteVector,
    page: int = 1,
    exclude_ids: set = None
) -> List[Dict[str, Any]]:
    """
    Get candidate movies from TMDB based on user's top preferences.
    
    Strategy:
    1. Extract top genres from taste vector
    2. Query TMDB discover with those genres
    3. Also get some popular/trending for diversity
    """
    if exclude_ids is None:
        exclude_ids = set()
    
    # Extract top genres from taste vector
    genre_scores = []
    for key, value in user_taste.vector.items():
        if key.startswith("genre_") and value > 0:
            genre_name = key.replace("genre_", "").replace("_", " ").title()
            # Handle special cases
            if genre_name == "Sci Fi":
                genre_name = "Sci-Fi"
            genre_id = GENRE_NAME_TO_ID.get(genre_name)
            if genre_id:
                genre_scores.append((genre_id, value))
    
    # Sort by score and take top 3
    genre_scores.sort(key=lambda x: x[1], reverse=True)
    top_genre_ids = [g[0] for g in genre_scores[:3]]
    
    all_movies = []
    
    async with httpx.AsyncClient(timeout=15.0) as http_client:
        # 1. Discover by top genres
        if top_genre_ids:
            genre_str = ','.join(str(g) for g in top_genre_ids)
            resp = await http_client.get(
                "https://api.themoviedb.org/3/discover/movie",
                params={
                    "with_genres": genre_str,
                    "sort_by": "vote_average.desc",
                    "vote_count.gte": 100,
                    "page": page
                },
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            if resp.status_code == 200:
                all_movies.extend(resp.json().get("results", []))
        
        # 2. Get trending movies for diversity
        resp = await http_client.get(
            "https://api.themoviedb.org/3/trending/movie/week",
            params={"page": page},
            headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
        )
        if resp.status_code == 200:
            all_movies.extend(resp.json().get("results", []))
        
        # 3. Get top rated for quality
        resp = await http_client.get(
            "https://api.themoviedb.org/3/movie/top_rated",
            params={"page": page},
            headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
        )
        if resp.status_code == 200:
            all_movies.extend(resp.json().get("results", []))
        
        # 4. Get popular for cold start
        if user_taste.total_swipes < 5:
            resp = await http_client.get(
                "https://api.themoviedb.org/3/movie/popular",
                params={"page": page},
                headers={"Authorization": f"Bearer {TMDB_ACCESS_TOKEN}"}
            )
            if resp.status_code == 200:
                all_movies.extend(resp.json().get("results", []))
    
    # Deduplicate
    seen = set()
    unique_movies = []
    for movie in all_movies:
        mid = movie.get("id")
        if mid and mid not in seen and mid not in exclude_ids and movie.get("poster_path"):
            seen.add(mid)
            unique_movies.append(movie)
    
    return unique_movies


async def get_personalized_feed(
    user_taste: TasteVector,
    swiped_ids: set,
    page: int = 1,
    limit: int = 20
) -> List[Dict[str, Any]]:
    """
    Get a personalized movie feed for the user.
    
    1. Get candidate movies
    2. Score each movie against user's taste vector
    3. Sort by score
    4. Return top N
    """
    # Get candidates
    candidates = await get_candidate_movies(user_taste, page, swiped_ids)
    
    # Score each movie
    scored_movies = []
    for movie in candidates:
        score = score_movie_for_user(movie, user_taste, swiped_ids)
        if score >= 0:  # -1 means skip
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
            "genre_ids": movie.get("genre_ids", []),
            "recommendation_score": round(score, 3),
        })
    
    return results
