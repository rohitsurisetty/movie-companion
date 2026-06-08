"""
Tina AI Agent Service

Tina is a flirty, Gen-Z style AI assistant that helps users complete their dating profile
through natural conversation instead of boring forms.

Features:
- Conversational profile building
- Flirty, modern Gen-Z vibe with simple language
- Extracts profile data from natural conversation
- Handles exit commands (bye, done, cancel, etc.)
"""

import os
import json
import logging
import re
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Import emergent integrations for LLM
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    logger.warning("emergentintegrations not installed")

EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY")

# MongoDB database reference (will be set by server.py)
_db = None

def set_tina_db(db):
    """Set the MongoDB database reference"""
    global _db
    _db = db
    logger.info("Tina service connected to MongoDB")


# ============== TINA SYSTEM PROMPT ==============
TINA_SYSTEM_PROMPT = """You're a flirty friend helping someone create their dating profile for a movie app. Keep it super casual and fun.

**How to talk:**
- Use lowercase mostly, like texting a friend
- Short responses (2-3 sentences max)
- 1-2 emojis per message, no more
- Playful teasing, witty but never creepy
- React to what they say first, then ask something new
- NEVER start with your name or "Tina:"

**What to find out (one at a time):**
1. Are they looking for casual, friendship, serious, or just exploring?
2. Into guys, girls, or open to anyone?
3. How often do they watch movies?
4. OTT person or theatre person?
5. Favorite movie genres
6. 2-3 favorite movies
7. Something fun about themselves for their bio

**Rules:**
- ONE question per message
- Sound human, not like a bot
- Skip sensitive stuff (religion, drinking etc)
- If they say bye/done/gtg - wrap up warmly

**Example:**
User: "hey"
You: "heyyy 👋 finally someone with good taste in movies! so what brings you here - looking for something casual or ready for the real deal?"

User: "serious relationship"  
You: "ooh love that energy ✨ so are you hoping to meet guys, girls, or keeping your options open?"

Keep it real, keep it fun!"""


# ============== TINA CONVERSATION STATE ==============

# Fields Tina should collect
TINA_FIELDS = [
    "relationshipIntent",  # What they're looking for
    "partnerPreference",   # Who they want to meet
    "movieFrequency",      # How often they watch
    "ottTheatre",          # OTT vs theatre
    "genres",              # Favorite genres
    "topMovies",           # Favorite movies
    "bio",                 # About themselves
]

# Mapping of user responses to profile values
INTENT_MAP = {
    "casual": "Casual",
    "friends": "Friendship", 
    "friendship": "Friendship",
    "serious": "Serious relationship",
    "relationship": "Serious relationship",
    "exploring": "Exploring",
    "not sure": "Exploring",
}

PARTNER_MAP = {
    "men": "Men",
    "guys": "Men",
    "boys": "Men",
    "man": "Men",
    "women": "Women",
    "girls": "Women",
    "woman": "Women",
    "anyone": "Anyone",
    "both": "Anyone",
    "all": "Anyone",
}

FREQUENCY_MAP = {
    "daily": "More than twice a week",
    "every day": "More than twice a week",
    "all the time": "More than twice a week",
    "twice a week": "Twice a week",
    "couple times": "Twice a week",
    "weekly": "Once a week",
    "once a week": "Once a week",
    "weekends": "Once a week",
    "twice a month": "Twice a month",
    "few times a month": "Twice a month",
    "monthly": "Once a month",
    "once a month": "Once a month",
    "rarely": "Rarely",
    "not often": "Rarely",
    "sometimes": "Twice a month",
}

OTT_MAP = {
    "ott": "OTT Person",
    "streaming": "OTT Person",
    "netflix": "OTT Person",
    "home": "OTT Person",
    "theatre": "Theatre Person",
    "theater": "Theatre Person",
    "cinema": "Theatre Person",
    "imax": "Theatre Person",
    "both": "Both",
    "either": "Both",
    "depends": "Both",
}

GENRE_LIST = ["Action", "Romance", "Comedy", "Thriller", "Horror", "Sci-Fi", "Drama", "Documentary", "Adventure", "Animation", "Crime", "Fantasy", "Mystery"]


def extract_profile_data(conversation_history: List[Dict], current_data: Dict) -> Dict:
    """Extract profile data from conversation history using pattern matching"""
    
    extracted = current_data.copy()
    
    for msg in conversation_history:
        if msg.get("role") == "user":
            text = msg.get("content", "").lower()
            
            # Extract relationship intent
            if not extracted.get("relationshipIntent"):
                for keyword, value in INTENT_MAP.items():
                    if keyword in text:
                        extracted["relationshipIntent"] = [value]
                        break
            
            # Extract partner preference
            if not extracted.get("partnerPreference"):
                for keyword, value in PARTNER_MAP.items():
                    if keyword in text:
                        extracted["partnerPreference"] = value
                        break
            
            # Extract movie frequency
            if not extracted.get("movieFrequency"):
                for keyword, value in FREQUENCY_MAP.items():
                    if keyword in text:
                        extracted["movieFrequency"] = value
                        break
            
            # Extract OTT/Theatre preference
            if not extracted.get("ottTheatre"):
                for keyword, value in OTT_MAP.items():
                    if keyword in text:
                        extracted["ottTheatre"] = value
                        break
            
            # Extract genres
            if not extracted.get("genres") or len(extracted.get("genres", [])) == 0:
                found_genres = []
                for genre in GENRE_LIST:
                    if genre.lower() in text:
                        found_genres.append(genre)
                if found_genres:
                    extracted["genres"] = found_genres
            
            # Extract movie mentions (simple approach - look for capitalized words/phrases)
            # This will be enhanced by LLM extraction
    
    return extracted


def check_exit_intent(text: str) -> bool:
    """Check if user wants to exit the conversation"""
    exit_phrases = [
        "bye", "goodbye", "done", "exit", "cancel", "quit", "leave",
        "gotta go", "gtg", "ttyl", "later", "that's all", "i'm done",
        "no more", "stop", "end", "finish", "enough", "all good",
        "that's it", "thanks bye", "thank you bye", "ok bye", "okay bye"
    ]
    text_lower = text.lower().strip()
    
    for phrase in exit_phrases:
        if phrase in text_lower:
            return True
    
    # Also check if it's a very short message that could be a goodbye
    if len(text_lower) < 10 and any(word in text_lower for word in ["bye", "done", "ok", "thanks", "thx"]):
        return True
    
    return False


async def get_tina_response(
    user_id: str,
    user_message: str,
    conversation_history: List[Dict],
    current_profile_data: Dict
) -> Tuple[str, Dict, bool]:
    """
    Get Tina's response to a user message.
    
    Returns:
        Tuple of (response_text, updated_profile_data, is_conversation_ended)
    """
    
    # Check for exit intent
    is_exit = check_exit_intent(user_message)
    
    # Extract any new profile data from the message
    updated_data = extract_profile_data(
        conversation_history + [{"role": "user", "content": user_message}],
        current_profile_data
    )
    
    if not EMERGENT_LLM_KEY:
        # Fallback response
        if is_exit:
            return (
                "aww leaving already? 🥺 no worries, i saved everything we talked about! can't wait to find you some amazing matches. see you soon! ✨",
                updated_data,
                True
            )
        return (
            "haha that's so cool! tell me more about your movie taste - what genres are you into? 🎬",
            updated_data,
            False
        )
    
    try:
        # Build conversation context for LLM
        messages_context = ""
        for msg in conversation_history[-10:]:  # Last 10 messages for context
            role = "User" if msg.get("role") == "user" else "Tina"
            messages_context += f"{role}: {msg.get('content', '')}\n"
        
        # Build prompt with collected data info
        collected_fields = [k for k, v in updated_data.items() if v and k in TINA_FIELDS]
        remaining_fields = [f for f in TINA_FIELDS if f not in collected_fields]
        
        extraction_prompt = ""
        if is_exit:
            extraction_prompt = f"""
The user wants to leave. Say a warm, flirty goodbye and confirm you've saved their profile.
Mention that you're excited to find them great matches!
"""
        else:
            extraction_prompt = f"""
Data collected so far: {json.dumps({k: v for k, v in updated_data.items() if v and k in TINA_FIELDS})}
Still need to collect: {remaining_fields}

Latest user message: "{user_message}"

Respond naturally to what they said, then smoothly ask about ONE of the remaining fields if there are any.
If we have most info (5+ fields), you can start wrapping up and ask if there's anything else they want to share.
"""
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"tina_{user_id}",
            system_message=TINA_SYSTEM_PROMPT
        ).with_model("openai", "gpt-4o")
        
        full_prompt = f"""
Previous conversation:
{messages_context}

{extraction_prompt}

Remember: Keep it SHORT (2-3 sentences), flirty, and Gen-Z casual!
"""
        
        response = await chat.send_message(UserMessage(text=full_prompt))
        response_text = response if isinstance(response, str) else str(response)
        
        # Clean up response
        response_text = response_text.strip()
        
        # Also ask LLM to extract structured data if we got movie/genre mentions
        if "movie" in user_message.lower() or any(g.lower() in user_message.lower() for g in GENRE_LIST):
            try:
                extraction_chat = LlmChat(
                    api_key=EMERGENT_LLM_KEY,
                    session_id=f"tina_extract_{user_id}",
                    system_message="You extract structured data from text. Return ONLY valid JSON, no other text."
                ).with_model("openai", "gpt-4o")
                
                extract_prompt = f"""
From this user message, extract any mentioned:
1. genres (from: Action, Romance, Comedy, Thriller, Horror, Sci-Fi, Drama, Documentary, Adventure, Animation, Crime, Fantasy, Mystery)
2. movie titles

User message: "{user_message}"

Return JSON like: {{"genres": ["Genre1", "Genre2"], "movies": ["Movie Title 1", "Movie Title 2"]}}
If nothing found, return: {{"genres": [], "movies": []}}
"""
                extract_response = await extraction_chat.send_message(UserMessage(text=extract_prompt))
                extract_text = extract_response if isinstance(extract_response, str) else str(extract_response)
                
                # Try to parse JSON
                try:
                    # Find JSON in response
                    json_match = re.search(r'\{[^}]+\}', extract_text)
                    if json_match:
                        extracted_json = json.loads(json_match.group())
                        
                        if extracted_json.get("genres"):
                            current_genres = updated_data.get("genres", [])
                            for g in extracted_json["genres"]:
                                if g not in current_genres:
                                    current_genres.append(g)
                            updated_data["genres"] = current_genres[:8]  # Max 8 genres
                        
                        if extracted_json.get("movies"):
                            current_movies = updated_data.get("topMoviesTina", [])
                            for m in extracted_json["movies"]:
                                if m not in current_movies:
                                    current_movies.append(m)
                            updated_data["topMoviesTina"] = current_movies[:5]  # Max 5 movies
                            
                except json.JSONDecodeError:
                    pass  # Extraction failed, that's ok
                    
            except Exception as e:
                logger.error(f"Error in extraction: {e}")
        
        return (response_text, updated_data, is_exit)
        
    except Exception as e:
        logger.error(f"Error getting Tina response: {e}")
        if is_exit:
            return (
                "bye for now! 👋 i saved all the good stuff we talked about. excited to find you some matches! ✨",
                updated_data,
                True
            )
        return (
            "oops my brain glitched for a sec 😅 anyway, tell me what kind of movies make your heart happy?",
            updated_data,
            False
        )


async def save_tina_profile_data(user_id: str, profile_data: Dict) -> bool:
    """Save the profile data collected by Tina to MongoDB"""
    try:
        # Prepare data for storage
        tina_data = {
            "user_id": user_id,
            "collected_via": "tina",
            "collected_at": datetime.utcnow().isoformat(),
            "data": profile_data,
        }
        
        # Upsert to tina_profiles collection
        await _db.tina_profiles.update_one(
            {"user_id": user_id},
            {"$set": tina_data},
            upsert=True
        )
        
        logger.info(f"Saved Tina profile data for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error saving Tina profile data: {e}")
        return False


async def get_tina_profile_data(user_id: str) -> Optional[Dict]:
    """Get previously collected Tina profile data"""
    try:
        result = await _db.tina_profiles.find_one({"user_id": user_id}, {"_id": 0})
        return result.get("data") if result else None
    except Exception as e:
        logger.error(f"Error getting Tina profile data: {e}")
        return None


async def get_missing_fields(user_id: str) -> List[str]:
    """Get list of profile fields not yet collected by Tina"""
    tina_data = await get_tina_profile_data(user_id)
    
    if not tina_data:
        return TINA_FIELDS.copy()
    
    missing = []
    for field in TINA_FIELDS:
        value = tina_data.get(field)
        if not value or (isinstance(value, list) and len(value) == 0):
            missing.append(field)
    
    return missing


# ============== TINA GREETING ==============

def get_tina_greeting(user_name: str = "") -> str:
    """Get Tina's opening message"""
    name_part = f" {user_name}" if user_name else ""
    return f"heyyy{name_part}! 👋 let's skip the boring forms and just chat. i'll help you create a profile that actually shows the real you. so what brings you here - looking for something casual or ready for something real?"
