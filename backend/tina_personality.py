"""
Tina Personality Engine — 360° Dating Profile Framework

Implements the multi-dimensional personality scoring system inspired by
how Netflix learns taste from a few ratings. Each "high signal" question
contributes to multiple hidden dimensions simultaneously.

Tina (a matchmaking wingmate) uses this engine to build a complete
compatibility vector in 8–10 playful questions without ever exposing the
dimensions to the user.

USAGE
-----
1. Initialize a session and feed answers via `record_answer(...)`.
2. Once `min_questions` are answered, call `finalize_profile(...)` to
   compute the personality_vector, intent scores, love language, and
   archetype.
3. Persist the result via `save_tina_personality(...)` into the
   `tina_profiles` MongoDB collection (keyed by user_id) so the
   matchmaking service can use it.
"""

from __future__ import annotations

import os
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mongo handle (set from server.py via set_personality_db)
# ---------------------------------------------------------------------------
_db = None


def set_personality_db(db):
    global _db
    _db = db
    logger.info("Tina personality engine connected to MongoDB")


# ===========================================================================
# 12 HIDDEN DIMENSIONS
# ===========================================================================
# The user never sees these — every question feeds 4–6 of them.
# Scores accumulate; we normalise to 0..100 at finalize.

DIMENSIONS: List[str] = [
    "relationship_intent_serious",   # 0..100  (vs casual)
    "communication_direct",          # vs flirty/reserved
    "communication_flirty",
    "emotional_availability",        # guarded vs open
    "attachment_secure",             # secure / anxious / avoidant blend
    "attachment_anxious",
    "social_extrovert",              # introvert(low) <-> extrovert(high)
    "lifestyle_explorer",            # homebody(low) <-> explorer(high)
    "planning_spontaneous",          # planner(low) <-> spontaneous(high)
    "humor_playful",
    "values_ambition",
    "values_family",
    "values_adventure",
    "romance_slow_burn",             # vs instant chemistry
    # Love language sub-scores (sum to ~100)
    "ll_words",
    "ll_time",
    "ll_touch",
    "ll_acts",
    "ll_gifts",
]


def _empty_scores() -> Dict[str, float]:
    return {d: 0.0 for d in DIMENSIONS}


# ===========================================================================
# 8 HIGH-SIGNAL QUESTIONS
# ===========================================================================
# Each question has a stable `id`. Tina conversationally adapts the wording
# (the LLM is told the question's intent + the option labels) — but the
# scoring vectors are deterministic and live here. This makes the engine
# unit-testable and decouples copy from math.
#
# `signals` maps option_key -> {dimension: delta}.

QUESTIONS: List[Dict[str, Any]] = [
    {
        "id": "first_night_vibe",
        "intent": "If you matched tonight, what's most likely to happen first?",
        "options": [
            {"key": "talk_2am",      "emoji": "❤️", "label": "Talk until 2 AM"},
            {"key": "roast_each_other", "emoji": "😂", "label": "Roast each other immediately"},
            {"key": "recommend_movies", "emoji": "🎬", "label": "Start recommending movies"},
            {"key": "memes_before_names", "emoji": "👀", "label": "Exchange memes before names"},
        ],
        "signals": {
            "talk_2am": {
                "communication_direct": 2, "emotional_availability": 5,
                "relationship_intent_serious": 4, "romance_slow_burn": 3,
                "attachment_secure": 3, "ll_words": 4, "ll_time": 3,
            },
            "roast_each_other": {
                "humor_playful": 5, "communication_flirty": 4,
                "social_extrovert": 3, "attachment_secure": 2,
                "relationship_intent_serious": 1, "ll_words": 2,
            },
            "recommend_movies": {
                "communication_direct": 3, "values_family": 1,
                "ll_time": 4, "romance_slow_burn": 4,
                "emotional_availability": 2, "relationship_intent_serious": 3,
            },
            "memes_before_names": {
                "humor_playful": 4, "communication_flirty": 3,
                "social_extrovert": 2, "romance_slow_burn": -1,
                "attachment_anxious": 1, "relationship_intent_serious": -1,
            },
        },
    },
    {
        "id": "perfect_first_date",
        "intent": "Pick your perfect first date.",
        "options": [
            {"key": "coffee_chat",  "emoji": "☕", "label": "Coffee and conversation"},
            {"key": "movie_night",  "emoji": "🍿", "label": "Movie night"},
            {"key": "arcade_food",  "emoji": "🎳", "label": "Arcade + food"},
            {"key": "long_drive",   "emoji": "🌅", "label": "Long drive"},
        ],
        "signals": {
            "coffee_chat": {
                "communication_direct": 4, "emotional_availability": 4,
                "relationship_intent_serious": 3, "social_extrovert": 1,
                "lifestyle_explorer": 1, "ll_time": 4, "ll_words": 3,
            },
            "movie_night": {
                "lifestyle_explorer": -2, "social_extrovert": -2,
                "romance_slow_burn": 3, "ll_time": 4, "ll_touch": 2,
                "relationship_intent_serious": 2,
            },
            "arcade_food": {
                "humor_playful": 4, "social_extrovert": 4,
                "planning_spontaneous": 3, "values_adventure": 3,
                "ll_time": 2, "ll_acts": 1,
            },
            "long_drive": {
                "values_adventure": 5, "planning_spontaneous": 4,
                "lifestyle_explorer": 4, "romance_slow_burn": 2,
                "ll_time": 4, "ll_words": 2,
            },
        },
    },
    {
        "id": "delayed_reply",
        "intent": "Your crush takes 8 hours to reply...",
        "options": [
            {"key": "probably_busy",   "emoji": "😅", "label": "They're probably busy"},
            {"key": "make_them_chase", "emoji": "😏", "label": "Time to make them chase me"},
            {"key": "another_meme",    "emoji": "😂", "label": "I'll send another meme tomorrow"},
            {"key": "overthinking",    "emoji": "😭", "label": "My overthinking has entered the chat"},
        ],
        "signals": {
            "probably_busy": {
                "attachment_secure": 5, "emotional_availability": 3,
                "communication_direct": 2, "values_family": 1,
            },
            "make_them_chase": {
                "communication_flirty": 4, "social_extrovert": 2,
                "attachment_secure": 1, "attachment_anxious": 1,
                "humor_playful": 2,
            },
            "another_meme": {
                "humor_playful": 5, "communication_flirty": 3,
                "attachment_secure": 3, "social_extrovert": 2,
            },
            "overthinking": {
                "attachment_anxious": 5, "emotional_availability": 2,
                "communication_direct": -1, "ll_words": 2,
                "relationship_intent_serious": 2,
            },
        },
    },
    {
        "id": "love_story_trope",
        "intent": "Which movie trope would you want your love story to be?",
        "options": [
            {"key": "friends_to_lovers", "emoji": "❤️", "label": "Friends to Lovers"},
            {"key": "enemies_to_lovers", "emoji": "🔥", "label": "Enemies to Lovers"},
            {"key": "slow_burn",         "emoji": "🎬", "label": "Slow Burn"},
            {"key": "love_at_first_sight", "emoji": "✨", "label": "Love at First Sight"},
        ],
        "signals": {
            "friends_to_lovers": {
                "relationship_intent_serious": 4, "romance_slow_burn": 4,
                "attachment_secure": 3, "emotional_availability": 3,
                "ll_time": 3,
            },
            "enemies_to_lovers": {
                "communication_flirty": 5, "humor_playful": 3,
                "romance_slow_burn": -1, "attachment_anxious": 2,
                "values_adventure": 2,
            },
            "slow_burn": {
                "romance_slow_burn": 5, "relationship_intent_serious": 4,
                "emotional_availability": 4, "communication_direct": 2,
                "attachment_secure": 3, "ll_time": 4,
            },
            "love_at_first_sight": {
                "romance_slow_burn": -3, "communication_flirty": 3,
                "values_adventure": 3, "planning_spontaneous": 4,
                "attachment_anxious": 2, "ll_touch": 2,
            },
        },
    },
    {
        "id": "friday_night",
        "intent": "Friday night?",
        "options": [
            {"key": "netflix",        "emoji": "🍕", "label": "Netflix"},
            {"key": "new_place",      "emoji": "🍷", "label": "Trying a new place"},
            {"key": "party",          "emoji": "🎉", "label": "Party"},
            {"key": "road_trip",      "emoji": "🏕️", "label": "Random road trip"},
        ],
        "signals": {
            "netflix": {
                "lifestyle_explorer": -3, "social_extrovert": -3,
                "planning_spontaneous": -1, "ll_time": 3, "ll_touch": 2,
                "romance_slow_burn": 2,
            },
            "new_place": {
                "lifestyle_explorer": 3, "values_adventure": 3,
                "social_extrovert": 2, "planning_spontaneous": 1,
                "ll_acts": 2,
            },
            "party": {
                "social_extrovert": 5, "lifestyle_explorer": 2,
                "planning_spontaneous": 2, "humor_playful": 2,
                "values_adventure": 2,
            },
            "road_trip": {
                "values_adventure": 5, "planning_spontaneous": 5,
                "lifestyle_explorer": 4, "social_extrovert": 2,
                "ll_time": 3,
            },
        },
    },
    {
        "id": "biggest_green_flag",
        "intent": "Biggest green flag?",
        "options": [
            {"key": "kindness",            "emoji": "💚", "label": "Kindness"},
            {"key": "ambition",            "emoji": "🚀", "label": "Ambition"},
            {"key": "humor",               "emoji": "😂", "label": "Humor"},
            {"key": "emotional_maturity",  "emoji": "🧠", "label": "Emotional maturity"},
        ],
        "signals": {
            "kindness": {
                "values_family": 5, "emotional_availability": 4,
                "ll_acts": 4, "attachment_secure": 3,
                "relationship_intent_serious": 3,
            },
            "ambition": {
                "values_ambition": 5, "relationship_intent_serious": 3,
                "communication_direct": 2, "values_adventure": 1,
            },
            "humor": {
                "humor_playful": 5, "communication_flirty": 3,
                "social_extrovert": 2, "attachment_secure": 1,
            },
            "emotional_maturity": {
                "attachment_secure": 5, "emotional_availability": 5,
                "relationship_intent_serious": 5, "communication_direct": 3,
                "ll_words": 3,
            },
        },
    },
    {
        "id": "fall_for_people_who",
        "intent": "I fall for people who...",
        "options": [
            {"key": "make_me_laugh",  "emoji": "😂", "label": "...make me laugh"},
            {"key": "listen_deeply",  "emoji": "🎧", "label": "...listen deeply"},
            {"key": "challenge_me",   "emoji": "🔥", "label": "...challenge me"},
            {"key": "feel_like_home", "emoji": "🏡", "label": "...feel like home"},
        ],
        "signals": {
            "make_me_laugh": {
                "humor_playful": 5, "ll_words": 3,
                "communication_flirty": 2, "social_extrovert": 1,
            },
            "listen_deeply": {
                "ll_time": 5, "emotional_availability": 5,
                "ll_words": 3, "communication_direct": 2,
                "relationship_intent_serious": 3,
            },
            "challenge_me": {
                "values_ambition": 4, "values_adventure": 3,
                "communication_direct": 3, "attachment_anxious": 1,
                "romance_slow_burn": -1,
            },
            "feel_like_home": {
                "ll_acts": 4, "ll_touch": 3, "ll_time": 3,
                "values_family": 5, "attachment_secure": 4,
                "relationship_intent_serious": 5, "romance_slow_burn": 3,
            },
        },
    },
    {
        "id": "dating_superpower",
        "intent": "What's your biggest dating superpower?",
        "options": [
            {"key": "flirting",        "emoji": "😎", "label": "Flirting"},
            {"key": "making_laugh",    "emoji": "😂", "label": "Making people laugh"},
            {"key": "deep_convos",     "emoji": "❤️", "label": "Deep conversations"},
            {"key": "planning_dates",  "emoji": "🎉", "label": "Planning amazing dates"},
        ],
        "signals": {
            "flirting": {
                "communication_flirty": 5, "social_extrovert": 3,
                "humor_playful": 2, "ll_touch": 2,
            },
            "making_laugh": {
                "humor_playful": 5, "social_extrovert": 3,
                "ll_words": 3, "communication_flirty": 2,
            },
            "deep_convos": {
                "emotional_availability": 5, "communication_direct": 4,
                "ll_words": 4, "ll_time": 3,
                "relationship_intent_serious": 4,
            },
            "planning_dates": {
                "ll_acts": 5, "planning_spontaneous": -3,
                "values_family": 2, "values_adventure": 2,
                "attachment_secure": 2,
            },
        },
    },
]

QUESTION_BY_ID: Dict[str, Dict[str, Any]] = {q["id"]: q for q in QUESTIONS}


# ===========================================================================
# ARCHETYPES — derived after finalize
# ===========================================================================

ARCHETYPES: List[Dict[str, Any]] = [
    {
        "key": "slow_burn_romantic",
        "title": "The Slow Burn Romantic",
        "emoji": "🎬",
        "description": (
            "You don't rush love—you let it build. You value trust, "
            "consistency, and meaningful conversations over instant sparks."
        ),
        "match": lambda v: v["romance_slow_burn"] + v["relationship_intent_serious"] + v["emotional_availability"],
    },
    {
        "key": "cozy_companion",
        "title": "The Cozy Companion",
        "emoji": "🍿",
        "description": (
            "Your idea of romance is comfort, laughter, and sharing everyday "
            "moments. Home feels better when it's with the right person."
        ),
        "match": lambda v: (100 - v["social_extrovert"]) + (100 - v["lifestyle_explorer"]) + v["values_family"] + v["ll_time"],
    },
    {
        "key": "adventure_catalyst",
        "title": "The Adventure Catalyst",
        "emoji": "🎢",
        "description": (
            "You bring energy wherever you go. For you, relationships are "
            "built through experiences, spontaneity, and unforgettable memories."
        ),
        "match": lambda v: v["values_adventure"] + v["planning_spontaneous"] + v["lifestyle_explorer"] + v["social_extrovert"] * 0.5,
    },
    {
        "key": "playful_charmer",
        "title": "The Playful Charmer",
        "emoji": "😏",
        "description": (
            "Flirting is your love language. You believe chemistry starts "
            "with laughter and grows through effortless banter."
        ),
        "match": lambda v: v["communication_flirty"] + v["humor_playful"] + v["social_extrovert"] * 0.5,
    },
    {
        "key": "heart_first_dreamer",
        "title": "The Heart-First Dreamer",
        "emoji": "❤️",
        "description": (
            "You wear your heart with confidence. You're hopeful, "
            "affectionate, and searching for a relationship that feels genuine."
        ),
        "match": lambda v: v["emotional_availability"] + v["ll_words"] + v["relationship_intent_serious"] * 0.5 + (100 - v["romance_slow_burn"]) * 0.3,
    },
    {
        "key": "quiet_connector",
        "title": "The Quiet Connector",
        "emoji": "🎭",
        "description": (
            "You don't open up quickly, but when you do, your relationships "
            "tend to be deep, loyal, and emotionally rich."
        ),
        "match": lambda v: (100 - v["social_extrovert"]) + v["romance_slow_burn"] + v["communication_direct"] + v["relationship_intent_serious"] * 0.5,
    },
]

LOVE_LANGUAGES = {
    "ll_words": "Words of Affirmation",
    "ll_time":  "Quality Time",
    "ll_touch": "Physical Touch",
    "ll_acts":  "Acts of Service",
    "ll_gifts": "Receiving Gifts",
}


# ===========================================================================
# SCORING
# ===========================================================================

def record_answer(
    raw_scores: Dict[str, float],
    question_id: str,
    option_key: str,
) -> Dict[str, float]:
    """Apply a single answer's signals into a running raw_scores dict."""
    q = QUESTION_BY_ID.get(question_id)
    if not q:
        logger.warning(f"Unknown question_id: {question_id}")
        return raw_scores
    signals = q["signals"].get(option_key)
    if not signals:
        logger.warning(f"Unknown option {option_key} for {question_id}")
        return raw_scores
    for dim, delta in signals.items():
        if dim in raw_scores:
            raw_scores[dim] += float(delta)
    return raw_scores


def _normalise_0_100(raw: Dict[str, float]) -> Dict[str, float]:
    """
    Map raw cumulative scores to a 0..100 percentile-ish scale.
    Each dimension has a roughly observed empirical range of [-3, +25] across
    the 8 questions. We clamp and linearly stretch.
    """
    LOW, HIGH = -5.0, 25.0
    out: Dict[str, float] = {}
    for dim in DIMENSIONS:
        v = raw.get(dim, 0.0)
        pct = (v - LOW) / (HIGH - LOW) * 100.0
        out[dim] = max(0.0, min(100.0, round(pct, 1)))
    # Re-normalise love-language family to sum ≈ 100
    ll_keys = [k for k in DIMENSIONS if k.startswith("ll_")]
    total = sum(out[k] for k in ll_keys) or 1.0
    for k in ll_keys:
        out[k] = round(out[k] / total * 100.0, 1)
    return out


def _pick_archetype(vec: Dict[str, float]) -> Dict[str, str]:
    best = max(ARCHETYPES, key=lambda a: a["match"](vec))
    return {
        "key": best["key"],
        "title": best["title"],
        "emoji": best["emoji"],
        "description": best["description"],
    }


def _intent_split(vec: Dict[str, float]) -> Dict[str, int]:
    serious = vec["relationship_intent_serious"]
    # Casual is the inverse leaning, but shifted by social/playful
    casual = max(
        0.0,
        100.0 - serious + (vec["communication_flirty"] - 50) * 0.3
        + (vec["planning_spontaneous"] - 50) * 0.2,
    )
    total = serious + casual or 1.0
    return {
        "serious": int(round(serious / total * 100)),
        "casual": int(round(casual / total * 100)),
    }


def _primary_love_language(vec: Dict[str, float]) -> str:
    ll = {k: v for k, v in vec.items() if k.startswith("ll_")}
    if not ll:
        return LOVE_LANGUAGES["ll_time"]
    top = max(ll, key=ll.get)
    return LOVE_LANGUAGES.get(top, "Quality Time")


def finalize_profile(
    answers: List[Dict[str, str]],
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Compute the final 360° personality profile.

    answers: [{ "question_id": "...", "option_key": "..." }, ...]
    extra:   optional explicit data (favourite genres, favourite trope, etc.)
    """
    raw = _empty_scores()
    used: List[str] = []
    for a in answers:
        qid, ok = a.get("question_id"), a.get("option_key")
        if not qid or not ok:
            continue
        record_answer(raw, qid, ok)
        used.append(qid)

    vec = _normalise_0_100(raw)
    archetype = _pick_archetype(vec)
    intent = _intent_split(vec)
    ll = _primary_love_language(vec)

    return {
        "personality_vector": vec,
        "archetype": archetype,
        "intent": intent,                       # {serious: x, casual: y}
        "primary_love_language": ll,
        "questions_answered": used,
        "extra": extra or {},
        "version": 1,
        "computed_at": datetime.utcnow().isoformat(),
    }


# ===========================================================================
# PERSISTENCE — separate `tina_profiles` collection
# ===========================================================================

async def save_tina_personality(user_id: str, profile: Dict[str, Any]) -> None:
    if _db is None:
        return
    try:
        doc = {
            "user_id": user_id,
            **profile,
            "updated_at": datetime.utcnow().isoformat(),
        }
        await _db.tina_profiles.update_one(
            {"user_id": user_id},
            {"$set": doc},
            upsert=True,
        )
    except Exception as e:
        logger.error(f"save_tina_personality error: {e}")


async def get_tina_personality(user_id: str) -> Optional[Dict[str, Any]]:
    if _db is None:
        return None
    try:
        doc = await _db.tina_profiles.find_one({"user_id": user_id}, {"_id": 0})
        return doc
    except Exception as e:
        logger.error(f"get_tina_personality error: {e}")
        return None


# ===========================================================================
# COMPATIBILITY SCORING — used by matchmaking_service
# ===========================================================================

# Weights for cosine-style similarity. Higher weights = more important.
DIM_WEIGHTS: Dict[str, float] = {
    "relationship_intent_serious": 2.0,
    "emotional_availability":      1.5,
    "attachment_secure":           1.2,
    "attachment_anxious":          0.8,
    "communication_direct":        1.0,
    "communication_flirty":        1.0,
    "social_extrovert":            1.0,
    "lifestyle_explorer":          1.0,
    "planning_spontaneous":        0.8,
    "humor_playful":               1.0,
    "values_ambition":             1.0,
    "values_family":               1.2,
    "values_adventure":            1.0,
    "romance_slow_burn":           1.2,
    # love languages are softer
    "ll_words": 0.6, "ll_time": 0.6, "ll_touch": 0.6,
    "ll_acts":  0.6, "ll_gifts": 0.4,
}


def personality_compatibility(
    a: Dict[str, float],
    b: Dict[str, float],
) -> Tuple[int, List[str]]:
    """
    Returns (score_0_100, list_of_strong_shared_traits).
    Uses 100 - weighted_mean_absolute_difference (lower diff => higher score).
    """
    if not a or not b:
        return (50, [])

    total_w = 0.0
    total_diff = 0.0
    shared: List[Tuple[str, float]] = []

    for dim in DIMENSIONS:
        w = DIM_WEIGHTS.get(dim, 1.0)
        av = a.get(dim, 50.0)
        bv = b.get(dim, 50.0)
        diff = abs(av - bv)
        total_diff += diff * w
        total_w += w
        # Strong shared trait: both > 65 and diff < 15
        if av > 65 and bv > 65 and diff < 15:
            shared.append((dim, (av + bv) / 2))

    mean_diff = total_diff / total_w if total_w else 50
    score = max(0, min(100, int(round(100 - mean_diff))))

    # Top 3 shared traits, human readable
    shared.sort(key=lambda x: -x[1])
    human = []
    for dim, _ in shared[:3]:
        human.append(_dim_to_label(dim))

    return (score, human)


_DIM_LABELS = {
    "relationship_intent_serious": "wanting something serious",
    "communication_direct":        "direct communication",
    "communication_flirty":        "playful flirting",
    "emotional_availability":      "emotional openness",
    "attachment_secure":           "secure attachment",
    "attachment_anxious":          "expressive emotional needs",
    "social_extrovert":            "extroverted energy",
    "lifestyle_explorer":          "explorer lifestyle",
    "planning_spontaneous":        "spontaneity",
    "humor_playful":               "playful humor",
    "values_ambition":             "ambition",
    "values_family":               "family values",
    "values_adventure":            "adventure",
    "romance_slow_burn":           "slow-burn romance",
    "ll_words":  "words of affirmation",
    "ll_time":   "quality time",
    "ll_touch":  "physical touch",
    "ll_acts":   "acts of service",
    "ll_gifts":  "thoughtful gifts",
}


def _dim_to_label(dim: str) -> str:
    return _DIM_LABELS.get(dim, dim.replace("_", " "))


# ===========================================================================
# DYNAMIC TMDB-BACKED MOVIE QUESTIONS (used by Tina conversationally)
# ===========================================================================

import httpx

_TMDB_BEARER = os.getenv("TMDB_ACCESS_TOKEN", "")
_GENRE_CACHE: Optional[List[Dict[str, Any]]] = None


async def get_dynamic_movie_genres(limit: int = 10) -> List[Dict[str, Any]]:
    """
    Pulls genres directly from TMDB so the movie taste question stays fresh
    and reflects whatever TMDB currently supports.
    Returns a cached list per process.
    """
    global _GENRE_CACHE
    if _GENRE_CACHE is not None:
        return _GENRE_CACHE[:limit]
    fallback = [
        {"id": 28, "name": "Action"}, {"id": 35, "name": "Comedy"},
        {"id": 18, "name": "Drama"}, {"id": 10749, "name": "Romance"},
        {"id": 53, "name": "Thriller"}, {"id": 27, "name": "Horror"},
        {"id": 878, "name": "Sci-Fi"}, {"id": 16, "name": "Animation"},
        {"id": 99, "name": "Documentary"}, {"id": 9648, "name": "Mystery"},
    ]
    if not _TMDB_BEARER:
        _GENRE_CACHE = fallback
        return fallback[:limit]
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                "https://api.themoviedb.org/3/genre/movie/list",
                params={"language": "en-US"},
                headers={"Authorization": f"Bearer {_TMDB_BEARER}"},
            )
            if r.status_code == 200:
                data = r.json()
                _GENRE_CACHE = data.get("genres", fallback)
                return _GENRE_CACHE[:limit]
    except Exception as e:
        logger.warning(f"TMDB genres fetch failed, using fallback: {e}")
    _GENRE_CACHE = fallback
    return fallback[:limit]


# Curated list of "love story tropes" — TMDB has keyword IDs for many of
# these (e.g. friends-to-lovers = 161176, enemies-to-lovers = 246716) so we
# can expand and validate dynamically.
LOVE_TROPES: List[Dict[str, Any]] = [
    {"key": "friends_to_lovers",  "label": "Friends to Lovers",  "tmdb_keyword_id": 161176},
    {"key": "enemies_to_lovers",  "label": "Enemies to Lovers",  "tmdb_keyword_id": 246716},
    {"key": "slow_burn",          "label": "Slow Burn",          "tmdb_keyword_id": 0},
    {"key": "love_at_first_sight","label": "Love at First Sight","tmdb_keyword_id": 0},
    {"key": "second_chance",      "label": "Second Chance",      "tmdb_keyword_id": 0},
    {"key": "forbidden_love",     "label": "Forbidden Love",     "tmdb_keyword_id": 0},
]


async def get_love_tropes() -> List[Dict[str, Any]]:
    """For now we return the curated list; in the future this can validate
    against TMDB keyword endpoints."""
    return LOVE_TROPES
