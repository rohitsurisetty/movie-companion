"""
Tina AI Service - Conversational Profile Builder
Handles AI-powered profile creation through natural conversation.
"""

import os
import json
import logging
import re
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# MongoDB reference (set from server.py)
_db = None

def set_tina_db(db):
    global _db
    _db = db
    logger.info("Tina service connected to MongoDB")


# ============================================
# PROFILE FIELD DEFINITIONS
# ============================================

PROFILE_FIELDS = {
    # Mandatory fields Tina should collect
    "relationshipIntent": {
        "type": "multi_select",
        "options": ["Casual", "Friendship", "Serious relationship", "Exploring"],
        "question_hint": "what they're looking for in terms of relationships",
        "priority": 1,
    },
    "partnerPreference": {
        "type": "single_select",
        "options": ["Men", "Women", "Anyone"],
        "question_hint": "who they want to meet (gender preference)",
        "priority": 2,
    },
    "languagesSpoken": {
        "type": "multi_select",
        "options": ["English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Bengali", "Marathi", "Gujarati", "Punjabi", "Urdu"],
        "question_hint": "languages they speak",
        "priority": 3,
    },
    "movieFrequency": {
        "type": "single_select",
        "options": ["More than twice a week", "Twice a week", "Once a week", "Twice a month", "Once a month", "Rarely"],
        "question_hint": "how often they watch movies",
        "priority": 4,
    },
    "ottTheatre": {
        "type": "single_select",
        "options": ["OTT Person", "Theatre Person", "Both", "None"],
        "question_hint": "whether they prefer OTT streaming or theatre",
        "priority": 5,
    },
    "filmLanguages": {
        "type": "multi_select",
        "options": ["Hindi", "English", "Telugu", "Tamil", "Malayalam", "Kannada", "Korean", "Others"],
        "question_hint": "what language films they watch",
        "priority": 6,
    },
    "genres": {
        "type": "multi_select",
        "options": ["Action", "Romance", "Comedy", "Thriller", "Horror", "Sci-Fi", "Drama", "Documentary"],
        "question_hint": "their favorite movie genres",
        "priority": 7,
    },
    "topMovies": {
        "type": "movie_picker",
        "question_hint": "their top favorite movies",
        "priority": 8,
    },
    "movieBuddyMode": {
        "type": "boolean",
        "question_hint": "if they want to find movie buddies (friends to watch with)",
        "priority": 9,
    },
    "movieDateMode": {
        "type": "boolean",
        "question_hint": "if they want to find movie dates (romantic connections)",
        "priority": 10,
    },
    # Optional fields
    "height": {
        "type": "height",
        "question_hint": "their height",
        "priority": 11,
        "optional": True,
    },
    "religion": {
        "type": "single_select",
        "options": ["Hindu", "Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Other", "Prefer not to say"],
        "question_hint": "their religion",
        "priority": 12,
        "optional": True,
    },
    "maritalStatus": {
        "type": "single_select",
        "options": ["Single", "Divorced", "Widowed", "Separated"],
        "question_hint": "their marital status",
        "priority": 13,
        "optional": True,
    },
    "foodPreference": {
        "type": "single_select",
        "options": ["Vegetarian", "Non-vegetarian", "Vegan", "Eggetarian", "Jain"],
        "question_hint": "their food preference",
        "priority": 14,
        "optional": True,
    },
    "bio": {
        "type": "text",
        "max_length": 500,
        "question_hint": "a short bio about themselves",
        "priority": 15,
        "optional": True,
    },
    "smoking": {
        "type": "single_select",
        "options": ["Never", "Socially", "Regularly", "Trying to quit"],
        "question_hint": "their smoking habits",
        "priority": 16,
        "optional": True,
    },
    "drinking": {
        "type": "single_select",
        "options": ["Never", "Socially", "Regularly", "Sober"],
        "question_hint": "their drinking habits",
        "priority": 17,
        "optional": True,
    },
    "exercise": {
        "type": "single_select",
        "options": ["Daily", "Often", "Sometimes", "Never"],
        "question_hint": "their exercise routine",
        "priority": 18,
        "optional": True,
    },
    "zodiac": {
        "type": "single_select",
        "options": ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"],
        "question_hint": "their zodiac sign",
        "priority": 19,
        "optional": True,
    },
    "pets": {
        "type": "single_select",
        "options": ["Dog lover", "Cat lover", "Both", "No pets", "Other"],
        "question_hint": "their pet preferences",
        "priority": 20,
        "optional": True,
    },
    "familyPlanning": {
        "type": "single_select",
        "options": ["Want kids", "Don't want kids", "Open to kids", "Have kids"],
        "question_hint": "their family planning views",
        "priority": 21,
        "optional": True,
    },
    "siblings": {
        "type": "single_select",
        "options": ["Only child", "Have siblings"],
        "question_hint": "if they have siblings",
        "priority": 22,
        "optional": True,
    },
    "education": {
        "type": "single_select",
        "options": ["High School", "Bachelor's", "Master's", "PhD", "Other"],
        "question_hint": "their education level",
        "priority": 23,
        "optional": True,
    },
    "workProfile": {
        "type": "single_select",
        "options": ["IT/Software", "Business Owner", "Lawyer", "Teacher", "Others"],
        "question_hint": "their work/profession",
        "priority": 24,
        "optional": True,
    },
    "travel": {
        "type": "single_select",
        "options": ["Frequently", "Occasionally", "Rarely", "Never"],
        "question_hint": "how often they travel",
        "priority": 25,
        "optional": True,
    },
}


# ============================================
# TINA PERSONALITY & PROMPTS
# ============================================

TINA_SYSTEM_PROMPT = """You are Tina, a friendly AI assistant helping users create their dating/movie buddy profile. 

PERSONALITY:
- Warm, playful, and slightly flirty (but appropriate)
- Fun, curious, and human-like
- Uses emojis naturally but not excessively (1-2 per message max)
- Speaks like a friend, not a form or survey
- Gen-Z friendly language, casual and engaging
- NEVER sounds robotic or like a questionnaire

CONVERSATION STYLE:
- Ask ONE topic at a time
- Transition naturally between topics
- Reference previous answers when relevant
- Keep messages concise (2-3 sentences max)
- Make the user feel comfortable sharing

RULES:
- NEVER prefix your messages with "Tina:" or your name
- NEVER ask multiple questions at once
- NEVER say "Great!" or "Awesome!" repeatedly - vary your responses
- NEVER suddenly end the conversation
- If the user's response doesn't match expected options, ask for clarification naturally
- If user wants to exit (says bye, done, later, etc.), acknowledge warmly and save progress

CURRENT TASK:
You're helping the user fill out their profile for a movie-based dating/friendship app. 
Collect information naturally through conversation, one field at a time.

IMPORTANT: When you need the user to select from specific options, end your message with:
[SHOW_OPTIONS:field_name]

When you've successfully collected a value, include in your response:
[COLLECTED:field_name:value]

When the user indicates they want to leave, include:
[EXIT_INTENT]
"""

FIELD_CONVERSATION_STARTERS = {
    "relationshipIntent": "So tell me... what brings you here? Looking for something casual, hoping to make some movie buddies, or maybe something more serious? 😊",
    "partnerPreference": "And who would you like to meet? Are you interested in meeting men, women, or open to anyone?",
    "languagesSpoken": "What languages do you speak? I'm curious!",
    "movieFrequency": "Okay here's an important one 😄 How often do you actually watch movies? Are you the type who's always got something playing, or more of an occasional viewer?",
    "ottTheatre": "Big question - are you more of an OTT-and-chill person or do you love the theatre experience? Or maybe both?",
    "filmLanguages": "What language movies do you usually watch? Hindi, English, Telugu, regional films...?",
    "genres": "Now for the fun part - what genres get you excited? Action? Romance? Horror? Tell me everything!",
    "topMovies": "I need to know your top movies! What are some films that you absolutely love? 🎬",
    "movieBuddyMode": "So here's how this app works - you can find Movie Buddies (friends to watch movies with) or Movie Dates (romantic connections). Would you like to find movie buddies?",
    "movieDateMode": "And what about Movie Dates? Would you like to find romantic connections who share your movie taste?",
    "height": "If you're comfortable sharing, what's your height?",
    "religion": "What about your religious background, if you don't mind sharing?",
    "education": "What's your educational background?",
    "workProfile": "And what do you do for work?",
    "smoking": "Quick lifestyle question - do you smoke?",
    "drinking": "What about drinking?",
    "exercise": "Are you into fitness? How often do you exercise?",
    "foodPreference": "Are you vegetarian, non-veg, or something else?",
    "zodiac": "Do you follow zodiac signs? What's yours?",
    "pets": "Are you a pet person? Dogs, cats, or neither?",
    "travel": "How often do you travel?",
    "familyPlanning": "What are your thoughts on family planning for the future?",
    "siblings": "Do you have siblings or are you an only child?",
    "maritalStatus": "What's your current relationship status?",
    "bio": "Last thing - want to write a short bio? Something fun that shows your personality!",
}


# ============================================
# LLM INTEGRATION
# ============================================

async def get_llm_response(messages: List[Dict[str, str]], user_name: str = "") -> str:
    """Get response from LLM (GPT-4o via Emergent)"""
    try:
        from emergentintegrations.llm.chat import LlmChat
        
        # Initialize chat with model
        chat = LlmChat.with_model("gpt-4o")
        
        # Add system prompt
        system_msg = TINA_SYSTEM_PROMPT
        if user_name:
            system_msg += f"\n\nThe user's name is {user_name}. Use it occasionally to make the conversation personal."
        
        chat.add_message("system", system_msg)
        
        # Add conversation history
        for msg in messages:
            chat.add_message(msg["role"], msg["content"])
        
        # Get response
        response = await chat.chat()
        return response
        
    except Exception as e:
        logger.error(f"LLM error: {e}")
        # Fallback response
        return "Hmm, I got a bit distracted there! Could you repeat that? 😅"


# ============================================
# FIELD EXTRACTION & NORMALIZATION
# ============================================

def normalize_response(field: str, user_response: str) -> Optional[Any]:
    """
    Normalize free-text user response to valid field values.
    Returns None if clarification is needed.
    """
    field_config = PROFILE_FIELDS.get(field)
    if not field_config:
        return None
    
    response_lower = user_response.lower().strip()
    
    if field_config["type"] == "single_select":
        options = field_config["options"]
        
        # Direct match
        for opt in options:
            if opt.lower() == response_lower or opt.lower() in response_lower:
                return opt
        
        # Fuzzy matching for common variations
        mappings = get_field_mappings(field)
        for pattern, value in mappings.items():
            if pattern in response_lower:
                return value
        
        return None  # Need clarification
    
    elif field_config["type"] == "multi_select":
        options = field_config["options"]
        selected = []
        
        for opt in options:
            if opt.lower() in response_lower:
                selected.append(opt)
        
        # Check mappings
        mappings = get_field_mappings(field)
        for pattern, value in mappings.items():
            if pattern in response_lower and value not in selected:
                if isinstance(value, list):
                    selected.extend(value)
                else:
                    selected.append(value)
        
        return selected if selected else None
    
    elif field_config["type"] == "boolean":
        positive = ["yes", "yeah", "yep", "sure", "definitely", "absolutely", "of course", "yup", "ya"]
        negative = ["no", "nope", "nah", "not really", "maybe later", "skip"]
        
        if any(p in response_lower for p in positive):
            return True
        if any(n in response_lower for n in negative):
            return False
        return None
    
    elif field_config["type"] == "text":
        max_len = field_config.get("max_length", 500)
        return user_response[:max_len]
    
    elif field_config["type"] == "height":
        # Parse height from text
        feet_match = re.search(r"(\d)'?\s*(\d{1,2})\"?", user_response)
        if feet_match:
            return f"{feet_match.group(1)}'{feet_match.group(2)}\""
        
        cm_match = re.search(r"(\d{2,3})\s*cm", response_lower)
        if cm_match:
            return f"{cm_match.group(1)} cm"
        
        # Try just numbers
        num_match = re.search(r"(\d{2,3})", user_response)
        if num_match:
            num = int(num_match.group(1))
            if num > 100:  # Likely cm
                return f"{num} cm"
            elif num < 10:  # Likely feet
                return f"{num}'0\""
        
        return None
    
    return user_response


def get_field_mappings(field: str) -> Dict[str, Any]:
    """Get common text-to-value mappings for a field."""
    mappings = {
        "relationshipIntent": {
            "friends": "Friendship",
            "buddy": "Friendship",
            "buddies": "Friendship",
            "serious": "Serious relationship",
            "long term": "Serious relationship",
            "committed": "Serious relationship",
            "casual": "Casual",
            "hookup": "Casual",
            "fun": "Casual",
            "exploring": "Exploring",
            "see where things go": "Exploring",
            "open": "Exploring",
        },
        "partnerPreference": {
            "guys": "Men",
            "boys": "Men",
            "male": "Men",
            "girls": "Women",
            "female": "Women",
            "both": "Anyone",
            "either": "Anyone",
            "doesn't matter": "Anyone",
            "don't care": "Anyone",
        },
        "movieFrequency": {
            "every day": "More than twice a week",
            "daily": "More than twice a week",
            "always": "More than twice a week",
            "lot": "Twice a week",
            "often": "Twice a week",
            "weekend": "Once a week",
            "sometimes": "Twice a month",
            "occasionally": "Once a month",
            "hardly": "Rarely",
            "not much": "Rarely",
            "rarely": "Rarely",
        },
        "ottTheatre": {
            "netflix": "OTT Person",
            "streaming": "OTT Person",
            "home": "OTT Person",
            "prime": "OTT Person",
            "hotstar": "OTT Person",
            "cinema": "Theatre Person",
            "theater": "Theatre Person",
            "theatre": "Theatre Person",
            "imax": "Theatre Person",
            "both": "Both",
            "neither": "None",
        },
        "smoking": {
            "don't smoke": "Never",
            "non-smoker": "Never",
            "no": "Never",
            "sometimes": "Socially",
            "parties": "Socially",
            "social": "Socially",
            "yes": "Regularly",
            "daily": "Regularly",
            "quitting": "Trying to quit",
            "cutting down": "Trying to quit",
        },
        "drinking": {
            "don't drink": "Never",
            "non-drinker": "Never",
            "no": "Never",
            "teetotal": "Never",
            "sometimes": "Socially",
            "parties": "Socially",
            "social": "Socially",
            "weekends": "Socially",
            "yes": "Regularly",
            "daily": "Regularly",
            "recovering": "Sober",
            "quit": "Sober",
        },
        "exercise": {
            "gym rat": "Daily",
            "everyday": "Daily",
            "daily": "Daily",
            "regular": "Often",
            "few times": "Often",
            "sometimes": "Sometimes",
            "occasionally": "Sometimes",
            "rarely": "Never",
            "no": "Never",
            "hate": "Never",
        },
        "travel": {
            "love": "Frequently",
            "lot": "Frequently",
            "always": "Frequently",
            "sometimes": "Occasionally",
            "vacations": "Occasionally",
            "rarely": "Rarely",
            "not much": "Rarely",
            "never": "Never",
            "don't": "Never",
        },
    }
    return mappings.get(field, {})


# ============================================
# CONVERSATION STATE MANAGEMENT
# ============================================

async def get_tina_session(user_id: str) -> Dict[str, Any]:
    """Get or create Tina conversation session."""
    if not _db:
        return create_empty_session(user_id)
    
    try:
        session = await _db.tina_sessions.find_one({"user_id": user_id})
        if session:
            return session
        return create_empty_session(user_id)
    except Exception as e:
        logger.error(f"Error getting Tina session: {e}")
        return create_empty_session(user_id)


def create_empty_session(user_id: str) -> Dict[str, Any]:
    """Create a new empty session."""
    return {
        "user_id": user_id,
        "collected_fields": {},
        "completed_fields": [],
        "conversation_history": [],
        "current_field": None,
        "awaiting_clarification": False,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }


async def save_tina_session(session: Dict[str, Any]):
    """Save Tina session to database."""
    if not _db:
        return
    
    try:
        session["updated_at"] = datetime.utcnow().isoformat()
        await _db.tina_sessions.update_one(
            {"user_id": session["user_id"]},
            {"$set": session},
            upsert=True
        )
    except Exception as e:
        logger.error(f"Error saving Tina session: {e}")


def get_next_field_to_collect(session: Dict[str, Any]) -> Optional[str]:
    """Get the next field that needs to be collected, by priority."""
    completed = set(session.get("completed_fields", []))
    
    # Sort fields by priority
    sorted_fields = sorted(
        PROFILE_FIELDS.items(),
        key=lambda x: x[1].get("priority", 100)
    )
    
    for field_name, field_config in sorted_fields:
        if field_name not in completed:
            # Skip optional fields initially, we'll come back to them
            if not field_config.get("optional", False):
                return field_name
    
    # All mandatory done, try optional
    for field_name, field_config in sorted_fields:
        if field_name not in completed and field_config.get("optional", False):
            return field_name
    
    return None  # All fields collected


def get_completion_percentage(session: Dict[str, Any]) -> int:
    """Calculate profile completion percentage."""
    completed = len(session.get("completed_fields", []))
    # Count mandatory fields
    mandatory = sum(1 for f in PROFILE_FIELDS.values() if not f.get("optional", False))
    return min(100, int((completed / mandatory) * 100))


# ============================================
# MAIN CONVERSATION HANDLER
# ============================================

async def process_tina_message(
    user_id: str,
    user_message: str,
    user_name: str = "",
    selected_option: Optional[str] = None,
    selected_options: Optional[List[str]] = None,
    selected_movies: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """
    Process a message in the Tina conversation.
    
    Returns:
        {
            "response": str,  # Tina's response
            "show_options": Optional[Dict],  # Options to show as chips
            "show_movie_picker": bool,  # Whether to show movie picker
            "collected_field": Optional[str],  # Field that was just collected
            "collected_value": Any,  # Value that was collected
            "exit_intent": bool,  # User wants to leave
            "completion_percentage": int,
            "profile_data": Dict,  # All collected profile data
        }
    """
    session = await get_tina_session(user_id)
    
    result = {
        "response": "",
        "show_options": None,
        "show_movie_picker": False,
        "collected_field": None,
        "collected_value": None,
        "exit_intent": False,
        "completion_percentage": get_completion_percentage(session),
        "profile_data": session.get("collected_fields", {}),
    }
    
    # Check for exit intent
    exit_phrases = ["bye", "goodbye", "see you", "later", "exit", "close", "skip", "done", "that's all", "continue later", "thanks bye"]
    if any(phrase in user_message.lower() for phrase in exit_phrases):
        result["exit_intent"] = True
        result["response"] = f"No worries! 😊 I've saved everything we've talked about. You're at {result['completion_percentage']}% complete. We can pick up right where we left off whenever you're ready!"
        await save_tina_session(session)
        return result
    
    current_field = session.get("current_field")
    
    # Handle option selection
    if selected_option and current_field:
        field_config = PROFILE_FIELDS.get(current_field)
        if field_config and field_config["type"] in ["single_select", "boolean"]:
            session["collected_fields"][current_field] = selected_option
            session["completed_fields"].append(current_field)
            result["collected_field"] = current_field
            result["collected_value"] = selected_option
    
    # Handle multi-select
    if selected_options and current_field:
        field_config = PROFILE_FIELDS.get(current_field)
        if field_config and field_config["type"] == "multi_select":
            session["collected_fields"][current_field] = selected_options
            session["completed_fields"].append(current_field)
            result["collected_field"] = current_field
            result["collected_value"] = selected_options
    
    # Handle movie selection
    if selected_movies and current_field == "topMovies":
        session["collected_fields"]["topMovies"] = selected_movies
        session["completed_fields"].append("topMovies")
        result["collected_field"] = "topMovies"
        result["collected_value"] = selected_movies
    
    # Process free text response
    if user_message and current_field and not selected_option and not selected_options:
        normalized = normalize_response(current_field, user_message)
        if normalized is not None:
            session["collected_fields"][current_field] = normalized
            session["completed_fields"].append(current_field)
            result["collected_field"] = current_field
            result["collected_value"] = normalized
            session["awaiting_clarification"] = False
        else:
            # Need clarification
            session["awaiting_clarification"] = True
    
    # Build conversation history for LLM
    history = session.get("conversation_history", [])
    if user_message:
        history.append({"role": "user", "content": user_message})
    
    # Get next field to collect
    next_field = get_next_field_to_collect(session)
    
    if next_field:
        session["current_field"] = next_field
        field_config = PROFILE_FIELDS.get(next_field)
        
        # Build context for LLM
        context = f"""
Current conversation state:
- Fields collected so far: {list(session.get('collected_fields', {}).keys())}
- Next field to collect: {next_field}
- Field hint: {field_config.get('question_hint', '')}
- Field type: {field_config.get('type', 'text')}
- Options (if applicable): {field_config.get('options', [])}

User's last message: {user_message or '(conversation starting)'}

Generate a natural, friendly response that transitions to asking about {next_field}.
If the user just answered a question, acknowledge their answer briefly first.
Remember to end with [SHOW_OPTIONS:{next_field}] if this field has predefined options.
"""
        
        if session.get("awaiting_clarification"):
            context += f"\nThe user's response didn't match expected options. Ask for clarification in a friendly way."
        
        history.append({"role": "system", "content": context})
        
        # Get LLM response
        tina_response = await get_llm_response(history, user_name)
        
        # Clean up response
        tina_response = tina_response.replace("Tina:", "").strip()
        
        # Check for show_options tag
        if f"[SHOW_OPTIONS:{next_field}]" in tina_response or field_config.get("type") in ["single_select", "multi_select"]:
            tina_response = re.sub(r'\[SHOW_OPTIONS:\w+\]', '', tina_response).strip()
            if field_config.get("options"):
                result["show_options"] = {
                    "field": next_field,
                    "options": field_config["options"],
                    "multi_select": field_config["type"] == "multi_select",
                }
        
        # Check for movie picker
        if next_field == "topMovies":
            result["show_movie_picker"] = True
        
        result["response"] = tina_response
        
        # Update history
        history = [h for h in history if h["role"] != "system"]  # Remove system context
        history.append({"role": "assistant", "content": tina_response})
        session["conversation_history"] = history[-20:]  # Keep last 20 messages
        
    else:
        # All fields collected!
        result["response"] = f"Wow, we covered a lot! 🎉 Your profile is looking great. I've saved everything - you're ready to start matching with people who share your movie taste!"
        result["completion_percentage"] = 100
    
    # Update result with latest data
    result["completion_percentage"] = get_completion_percentage(session)
    result["profile_data"] = session.get("collected_fields", {})
    
    # Save session
    await save_tina_session(session)
    
    return result


async def get_tina_greeting(user_name: str = "") -> str:
    """Get Tina's initial greeting."""
    name_part = f" {user_name}" if user_name else ""
    greetings = [
        f"Hey{name_part}! 👋 I'm Tina, and I'm here to help you create an awesome profile. Instead of boring forms, let's just chat! Ready?",
        f"Hi{name_part}! ✨ I'm Tina - think of me as your profile wingwoman. Let's skip the forms and just have a conversation. Sound good?",
        f"Hello{name_part}! 😊 I'm Tina, and I'll be helping you set up your profile today. Don't worry, this won't feel like filling out a form - we're just going to chat!",
    ]
    import random
    return random.choice(greetings)


async def get_missing_fields(user_id: str) -> List[str]:
    """Get list of fields not yet collected."""
    session = await get_tina_session(user_id)
    completed = set(session.get("completed_fields", []))
    
    missing = []
    for field_name, field_config in PROFILE_FIELDS.items():
        if field_name not in completed:
            missing.append(field_name)
    
    return missing


async def get_collected_profile_data(user_id: str) -> Dict[str, Any]:
    """Get all profile data collected by Tina."""
    session = await get_tina_session(user_id)
    return session.get("collected_fields", {})


async def clear_tina_session(user_id: str):
    """Clear Tina session for a user."""
    if _db:
        try:
            await _db.tina_sessions.delete_one({"user_id": user_id})
        except Exception as e:
            logger.error(f"Error clearing Tina session: {e}")
