"""
Canonical option values shared by the whole app.

The frontend renders exactly these strings as chips; Tina collects them;
matchmaking and the recommendation engine compare against them. Older
profiles (and the MOCK_USERS catalogue) still carry legacy spellings such
as "Both", "Non-smoker" or "Long-term relationship" — `normalize()` maps
those onto the canonical value case-insensitively so every comparison in
the backend hits.

    from enums import OPTIONS, normalize, normalize_list

    normalize("ottTheatre", "both")          -> "Both OTT & Theatre"
    normalize("genres", "Science Fiction")   -> "Sci-Fi"
    normalize("smoking", "something odd")    -> "something odd"   (unknown -> unchanged)
"""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional

OPTIONS: Dict[str, List[str]] = {
    "gender": ["Man", "Woman", "Non-binary", "Prefer not to say", "Other"],
    "relationshipIntent": ["Casual", "Friendship", "Serious relationship", "Exploring"],
    "partnerPreference": ["Men", "Women", "Anyone"],
    "movieFrequency": [
        "More than twice a week",
        "Twice a week",
        "Once a week",
        "Twice a month",
        "Once a month",
        "Rarely",
    ],
    "ottTheatre": ["OTT Person", "Theatre Person", "Both OTT & Theatre", "Neither"],
    "genres": ["Action", "Romance", "Comedy", "Thriller", "Horror", "Sci-Fi", "Drama", "Documentary"],
    "smoking": ["Never", "Socially", "Regularly", "Trying to quit"],
    "drinking": ["Never", "Socially", "Regularly", "Sober"],
    "exercise": ["Daily", "Often", "Sometimes", "Never"],
    "pets": ["Dog lover", "Cat lover", "Both", "No pets", "Other"],
    "familyPlanning": ["Want kids", "Don't want kids", "Open to kids", "Have kids"],
    "siblings": ["Only child", "Have siblings"],
    "education": ["High School", "Bachelor's", "Master's", "PhD", "Other"],
    "travel": ["Frequently", "Occasionally", "Rarely", "Never"],
    "religion": ["Hindu", "Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Atheist", "Other", "Prefer not to say"],
    "maritalStatus": ["Single", "Divorced", "Widowed", "Separated"],
    "foodPreference": ["Vegetarian", "Non-vegetarian", "Vegan", "Eggetarian", "Jain"],
    "zodiac": [
        "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
        "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
    ],
    # Spoken languages (profile field `languagesSpoken`, filter key `languages`)
    "languagesSpoken": [
        "English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam",
        "Bengali", "Marathi", "Gujarati", "Punjabi", "Urdu",
    ],
    "filmLanguages": ["Hindi", "English", "Telugu", "Tamil", "Malayalam", "Kannada", "Korean", "Others"],
}

# Alternate names the same field goes by in request payloads / filter docs.
FIELD_ALIASES: Dict[str, str] = {
    "languages": "languagesSpoken",
    "languages_spoken": "languagesSpoken",
    "spoken_languages": "languagesSpoken",
    "film_languages": "filmLanguages",
    "filmlanguages": "filmLanguages",
    "genre": "genres",
    "intent": "relationshipIntent",
    "relationship_intent": "relationshipIntent",
    "relationshipintent": "relationshipIntent",
    "partner_preference": "partnerPreference",
    "partnerpreference": "partnerPreference",
    "ott_theatre": "ottTheatre",
    "otttheatre": "ottTheatre",
    "movie_frequency": "movieFrequency",
    "moviefrequency": "movieFrequency",
    "family_planning": "familyPlanning",
    "familyplanning": "familyPlanning",
    "marital_status": "maritalStatus",
    "maritalstatus": "maritalStatus",
    "food_preference": "foodPreference",
    "foodpreference": "foodPreference",
}

# Legacy / free-text variants -> canonical value. Keys are matched after
# lower-casing and whitespace collapsing, so "LONG-TERM  Relationship" hits.
_LEGACY: Dict[str, Dict[str, str]] = {
    "gender": {
        "male": "Man",
        "m": "Man",
        "female": "Woman",
        "f": "Woman",
        "non binary": "Non-binary",
        "nonbinary": "Non-binary",
        "prefer not to say": "Prefer not to say",
        "rather not say": "Prefer not to say",
    },
    "relationshipIntent": {
        "something casual": "Casual",
        "casual dating": "Casual",
        "long-term relationship": "Serious relationship",
        "long term relationship": "Serious relationship",
        "long-term": "Serious relationship",
        "serious": "Serious relationship",
        "marriage": "Serious relationship",
        "not sure yet": "Exploring",
        "not sure": "Exploring",
        "movie buddy": "Friendship",
        "new friends": "Friendship",
        "friends": "Friendship",
    },
    "partnerPreference": {
        "man": "Men",
        "male": "Men",
        "males": "Men",
        "woman": "Women",
        "female": "Women",
        "females": "Women",
        "both": "Anyone",
        "everyone": "Anyone",
        "any": "Anyone",
        "all": "Anyone",
        "open to anyone": "Anyone",
    },
    "movieFrequency": {
        "daily": "More than twice a week",
        "multiple times a week": "More than twice a week",
        "every day": "More than twice a week",
        "weekly": "Once a week",
        "few times a month": "Twice a month",
        "a few times a month": "Twice a month",
        "monthly": "Once a month",
    },
    "ottTheatre": {
        "both": "Both OTT & Theatre",
        "both ott and theatre": "Both OTT & Theatre",
        "both equally": "Both OTT & Theatre",
        "none": "Neither",
        "ott": "OTT Person",
        "ott lover": "OTT Person",
        "ott all the way": "OTT Person",
        "mostly ott": "OTT Person",
        "streaming": "OTT Person",
        "theatre": "Theatre Person",
        "theater": "Theatre Person",
        "theatre enthusiast": "Theatre Person",
        "theater person": "Theatre Person",
        "mostly theatre": "Theatre Person",
        "theatre experience always": "Theatre Person",
    },
    "genres": {
        "science fiction": "Sci-Fi",
        "sci fi": "Sci-Fi",
        "scifi": "Sci-Fi",
        "sci-fi": "Sci-Fi",
        "documentaries": "Documentary",
        "romantic": "Romance",
        "thrillers": "Thriller",
    },
    "smoking": {
        "non-smoker": "Never",
        "non smoker": "Never",
        "no": "Never",
        "occasional smoker": "Socially",
        "occasionally": "Socially",
        "sometimes": "Socially",
        "regular smoker": "Regularly",
        "yes": "Regularly",
        "quitting": "Trying to quit",
    },
    "drinking": {
        "non-drinker": "Never",
        "non drinker": "Never",
        "no": "Never",
        "social drinker": "Socially",
        "occasionally": "Socially",
        "rarely": "Socially",
        "sometimes": "Socially",
        "regular drinker": "Regularly",
        "yes": "Regularly",
    },
    "exercise": {
        "regularly": "Often",
        "active": "Often",
        "very active": "Daily",
        "everyday": "Daily",
        "occasionally": "Sometimes",
        "rarely": "Sometimes",
        "no": "Never",
    },
    "pets": {
        "dog": "Dog lover",
        "dogs": "Dog lover",
        "cat": "Cat lover",
        "cats": "Cat lover",
        "none": "No pets",
        "no": "No pets",
        "prefer no pets": "No pets",
    },
    "familyPlanning": {
        "not sure yet": "Open to kids",
        "not sure": "Open to kids",
        "open": "Open to kids",
        "want children": "Want kids",
        "don't want children": "Don't want kids",
        "dont want kids": "Don't want kids",
        "have children": "Have kids",
    },
    "siblings": {
        "has siblings": "Have siblings",
        "yes": "Have siblings",
        "no": "Only child",
        "none": "Only child",
    },
    "education": {
        "bachelor's degree": "Bachelor's",
        "bachelors": "Bachelor's",
        "bachelor": "Bachelor's",
        "graduate": "Bachelor's",
        "master's degree": "Master's",
        "masters": "Master's",
        "master": "Master's",
        "mba": "Master's",
        "postgraduate": "Master's",
        "doctorate": "PhD",
        "phd.": "PhD",
        "high school": "High School",
        "highschool": "High School",
    },
    "travel": {
        "often": "Frequently",
        "always": "Frequently",
        "sometimes": "Occasionally",
    },
    "religion": {
        "hinduism": "Hindu",
        "islam": "Muslim",
        "christianity": "Christian",
        "sikhism": "Sikh",
        "buddhism": "Buddhist",
        "jainism": "Jain",
        "agnostic": "Atheist",
        "spiritual": "Other",
        "rather not say": "Prefer not to say",
    },
    "maritalStatus": {
        "never married": "Single",
        "unmarried": "Single",
    },
    "foodPreference": {
        "veg": "Vegetarian",
        "pure veg": "Vegetarian",
        "non veg": "Non-vegetarian",
        "non-veg": "Non-vegetarian",
        "nonveg": "Non-vegetarian",
        "non vegetarian": "Non-vegetarian",
        "eggitarian": "Eggetarian",
    },
    "filmLanguages": {
        "other": "Others",
        "any": "Others",
    },
}

_WS = re.compile(r"\s+")


def _key(value: str) -> str:
    return _WS.sub(" ", str(value)).strip().lower()


def canonical_field(field: str) -> str:
    """Resolve payload / filter spellings (e.g. 'film_languages') to the
    profile field name (e.g. 'filmLanguages'). Unknown names pass through."""
    if not field:
        return field
    if field in OPTIONS:
        return field
    return FIELD_ALIASES.get(field, FIELD_ALIASES.get(field.lower(), field))


# Pre-computed lower-cased canonical lookups per field.
_CANON_BY_KEY: Dict[str, Dict[str, str]] = {
    field: {_key(v): v for v in values} for field, values in OPTIONS.items()
}


def normalize(field: str, value: Any) -> Any:
    """Map `value` for `field` onto its canonical spelling.

    Case-insensitive; collapses whitespace; understands the legacy variants
    in `_LEGACY`. Returns the input unchanged if the field is unknown or the
    value doesn't match anything (so unexpected data is never destroyed).
    Non-string values are returned as-is.
    """
    if not isinstance(value, str):
        return value
    field = canonical_field(field)
    canon = _CANON_BY_KEY.get(field)
    if canon is None:
        return value
    k = _key(value)
    if not k:
        return value
    if k in canon:
        return canon[k]
    legacy = _LEGACY.get(field, {}).get(k)
    if legacy is not None:
        return legacy
    # Tolerate stray punctuation such as "Bachelor's degree." or "Sci-Fi,"
    k2 = k.strip(" .,!;:")
    if k2 != k:
        if k2 in canon:
            return canon[k2]
        legacy = _LEGACY.get(field, {}).get(k2)
        if legacy is not None:
            return legacy
    return value


def normalize_list(field: str, values: Optional[Iterable[Any]]) -> List[Any]:
    """`normalize()` over a list, de-duplicated with order preserved.

    Accepts a single string too (wrapped into a one-item list) and ignores
    None / empty entries.
    """
    if values is None:
        return []
    if isinstance(values, str):
        values = [values]
    out: List[Any] = []
    seen = set()
    for v in values:
        if v is None or v == "":
            continue
        nv = normalize(field, v)
        marker = nv if isinstance(nv, str) else repr(nv)
        if marker in seen:
            continue
        seen.add(marker)
        out.append(nv)
    return out


def is_canonical(field: str, value: Any) -> bool:
    """True when `value` is already one of the canonical options for `field`."""
    field = canonical_field(field)
    return field in OPTIONS and value in OPTIONS[field]


__all__ = [
    "OPTIONS",
    "FIELD_ALIASES",
    "canonical_field",
    "normalize",
    "normalize_list",
    "is_canonical",
]
