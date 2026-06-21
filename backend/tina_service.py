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

TINA_SYSTEM_PROMPT = """You are Tina, a personal AI matchmaker helping users create their dating/movie buddy profile.

IDENTITY:
- You are NOT a chatbot or assistant - you are a MATCHMAKER, a dating wingwoman
- Think: best friend who works in matchmaking, relationship coach with personality
- Warm, playful, curious, and confident
- Slightly cheeky and fun - like Cupid with a sense of humor

CRITICAL STYLE RULES:
- MAXIMUM 1-3 short lines per message
- NEVER write walls of text
- NEVER list all options in your message - the UI shows chips
- Be conversational, not informational
- Sound like texting a friend, not filling a form

GOOD EXAMPLE:
"Okay first things first 😏

What brings you here?"

BAD EXAMPLE:
"Hey! Let's dive right in. Are you on the lookout for something casual, a new buddy to watch movies with, something serious, or just exploring your options? Totally cool with whatever you're feeling!"

PERSONALITY TOUCHES:
- Use 1 emoji per message MAX
- Add personality to questions (e.g., "Important question 😏" before asking movie frequency)
- React briefly to answers before moving on
- Make it feel like a fun conversation, not an interview

RESPONSE PATTERNS:
- After user selects something: Brief reaction (1 line) + next question (1-2 lines)
- Example: "Ooh I love that choice ✨" then "Now tell me..."
- Vary your reactions: "Nice!", "Love it", "Got it", "Perfect", "Ooh interesting"

RULES:
- NEVER prefix with "Tina:" 
- NEVER list options in text (UI handles this)
- NEVER ask multiple questions
- NEVER write more than 3 short lines
- Keep total message under 50 words ideally

CURRENT TASK:
Help user build their profile for a movie-based dating app. One topic at a time.

TECHNICAL:
- End with [SHOW_OPTIONS:field_name] when options are needed
- Include [COLLECTED:field_name:value] when value captured
- Include [EXIT_INTENT] if user wants to leave
"""

FIELD_CONVERSATION_STARTERS = {
    "relationshipIntent": "First things first 😏\n\nWhat brings you here?",
    "partnerPreference": "And who catches your eye?\n\nMen, women, or open to anyone?",
    "languagesSpoken": "Quick one - what languages do you speak?",
    "movieFrequency": "Important question 🎬\n\nHow often do you actually watch movies?",
    "ottTheatre": "Are you team Netflix-and-chill or team big-screen-experience?",
    "filmLanguages": "What language films do you usually watch?",
    "genres": "Now the fun part 🍿\n\nWhat genres get you excited?",
    "topMovies": "Time to show me your taste 🎬\n\nWhat are your all-time favorites?",
    "movieBuddyMode": "So here's the deal...\n\nWanna find movie buddies to watch with?",
    "movieDateMode": "What about movie dates? 💕\n\nInterested in romantic connections?",
    "height": "If you don't mind sharing - how tall are you?",
    "religion": "What about your background?",
    "education": "And education-wise?",
    "workProfile": "What do you do for work?",
    "smoking": "Quick lifestyle check - do you smoke?",
    "drinking": "What about drinks?",
    "exercise": "Are you into fitness?",
    "foodPreference": "Veggie, non-veg, or something else?",
    "zodiac": "Okay last fun one - what's your sign? ♈",
    "pets": "Are you a pet person?",
    "travel": "How often do you travel?",
    "familyPlanning": "What are your thoughts on family someday?",
    "siblings": "Got any siblings?",
    "maritalStatus": "What's your relationship status?",
    "bio": "Almost done! 🎉\n\nWant to add a short bio?",
}


# ============================================
# LLM INTEGRATION
# ============================================

async def get_llm_response(messages: List[Dict[str, str]], user_name: str = "") -> str:
    """Get response from LLM (GPT-4o via Emergent)"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY")
        
        # Build system message
        system_msg = TINA_SYSTEM_PROMPT
        if user_name:
            system_msg += f"\n\nThe user's name is {user_name}. Use it occasionally to make the conversation personal."
        
        # Build conversation context
        context_parts = [system_msg, "\n\nConversation so far:"]
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                context_parts.append(f"\n[Context: {content}]")
            elif role == "user":
                context_parts.append(f"\nUser: {content}")
            elif role == "assistant":
                context_parts.append(f"\nTina: {content}")
        
        full_prompt = "".join(context_parts) + "\n\nGenerate Tina's next response:"
        
        # Initialize chat with correct syntax
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"tina_{user_name or 'user'}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            system_message="You are Tina, a friendly AI assistant."
        ).with_model("openai", "gpt-4o")
        
        # Send message and get response (await the async call)
        response = await chat.send_message(UserMessage(text=full_prompt))
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
    if _db is None:
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
    if _db is None:
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
    is_onboarding_complete: bool = False,
    conversation_context: List[Dict] = None,
) -> Dict[str, Any]:
    """
    Process a message in the Tina conversation.
    
    Returns:
        {
            "success": bool,
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
        "success": True,
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
    
    # Check if onboarding is complete - either from flag or all mandatory fields done
    mandatory_fields = [f for f, c in PROFILE_FIELDS.items() if not c.get("optional", False)]
    completed_count = len([f for f in mandatory_fields if f in session.get("completed_fields", [])])
    actually_complete = is_onboarding_complete or completed_count >= len(mandatory_fields)
    
    # Build conversation history for LLM
    history = session.get("conversation_history", [])
    
    # Add conversation context from frontend if provided
    if conversation_context:
        for ctx in conversation_context:
            if ctx not in history:
                history.append(ctx)
    
    if user_message:
        history.append({"role": "user", "content": user_message})
    
    # POST-ONBOARDING: Engage in free-form conversation
    if actually_complete and user_message:
        logger.info(f"Post-onboarding chat for user {user_id}: {user_message[:50]}...")
        
        # Build engaging conversation context
        context = f"""
You are Tina, a warm and playful matchmaker chatbot on a movie-based dating app.
The user has completed their profile setup. Now you're just chatting!

USER INFO:
- Name: {user_name or 'friend'}

YOUR PERSONALITY:
- Warm, playful, curious, slightly cheeky
- Like a fun friend who loves movies and dating talk
- Use 1 emoji per message MAX
- Keep messages SHORT (1-3 lines)
- Be engaging and ask follow-up questions
- React to what they say with personality

TOPICS YOU CAN DISCUSS:
- Movies, TV shows, cinema experiences
- Dating advice, relationship talk
- Fun questions about preferences
- Movie recommendations
- Their taste in movies and what it says about them
- Fun movie trivia or hot takes

User's message: {user_message}

Recent conversation:
{chr(10).join([f"{'User' if m.get('role')=='user' else 'Tina'}: {m.get('content','')[:100]}" for m in history[-4:]])}

Generate a friendly, engaging response. Ask a follow-up question to keep the conversation going.
DO NOT prefix with "Tina:" - just write the response directly.
"""
        
        # Get LLM response for post-onboarding chat
        tina_response = await get_llm_response([{"role": "system", "content": context}], user_name)
        
        # Clean up response
        tina_response = tina_response.replace("Tina:", "").strip()
        
        result["response"] = tina_response
        result["completion_percentage"] = 100
        
        # Update history
        history.append({"role": "assistant", "content": tina_response})
        session["conversation_history"] = history[-20:]
        
        await save_tina_session(session)
        return result
    
    # ONBOARDING: Collect profile fields
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
    """Get Tina's initial greeting - SHORT and personality-driven."""
    name_part = f" {user_name}" if user_name else ""
    greetings = [
        f"Hey{name_part}! 💫\n\nI'm Tina, your personal matchmaker.\n\nLet's make your profile shine ✨",
        f"Hi{name_part}! 😊\n\nI'm Tina - think of me as your dating wingwoman.\n\nReady to find your perfect match?",
        f"Hey there{name_part}! 👋\n\nI'm Tina, and I'll be your matchmaker today.\n\nLet's get you set up!",
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
    if _db is not None:
        try:
            await _db.tina_sessions.delete_one({"user_id": user_id})
        except Exception as e:
            logger.error(f"Error clearing Tina session: {e}")


# ============================================
# WELCOME BACK & RE-ENGAGEMENT
# ============================================

# Topics for post-onboarding engagement
POST_ONBOARDING_TOPICS = [
    {
        "topic": "comfort_movies",
        "question": "Quick question - what's your go-to comfort movie? The one you put on when nothing else sounds good 🛋️",
        "follow_up": True
    },
    {
        "topic": "movie_night_setup", 
        "question": "Curious 🍿 What's your perfect movie night setup? Popcorn? Blankets? Snacks?",
        "follow_up": True
    },
    {
        "topic": "first_movie_date",
        "question": "If you had to pick a movie for a first date, what would it be? 🎬",
        "follow_up": True
    },
    {
        "topic": "unpopular_opinion",
        "question": "Time for a hot take 🔥 What's your most unpopular movie opinion?",
        "follow_up": True
    },
    {
        "topic": "favorite_actor",
        "question": "Who's your ultimate movie crush? Actor or actress who you'd watch in anything 😏",
        "follow_up": True
    },
    {
        "topic": "rewatched_most",
        "question": "What movie have you rewatched the most times? Be honest 😄",
        "follow_up": True
    },
    {
        "topic": "movie_character",
        "question": "Here's a fun one - which movie character would you want to grab coffee with? ☕",
        "follow_up": True
    },
    {
        "topic": "hidden_gem",
        "question": "Got a hidden gem movie that not enough people know about? Share your secret 🤫",
        "follow_up": True
    },
    {
        "topic": "theatre_vs_home",
        "question": "Big debate time - is the theatre experience worth it, or is home better? 🎭",
        "follow_up": True
    },
    {
        "topic": "movie_partner_ideal",
        "question": "What's your ideal movie buddy like? Someone who talks during movies or stays quiet? 🤔",
        "follow_up": True
    },
]


async def generate_welcome_back_message(
    user_id: str,
    user_name: str = "",
    is_onboarding_complete: bool = False,
    conversation_history: List[Dict] = None,
    collected_fields: Dict = None,
    collected_fields_list: List[str] = None,
) -> Dict[str, Any]:
    """
    Generate a contextual welcome-back message when user returns to Tina.
    
    Args:
        user_id: User identifier
        user_name: User's name
        is_onboarding_complete: Whether onboarding is done
        conversation_history: Previous messages (optional)
        collected_fields: Dict of collected fields (deprecated)
        collected_fields_list: List of field names already collected from frontend
    
    Returns:
        {
            "message": str,  # Tina's welcome back message
            "show_options": Optional[Dict],  # Options to show
            "next_field": Optional[str],  # Field to collect next (if onboarding incomplete)
            "topic": Optional[str],  # Engagement topic (if post-onboarding)
        }
    """
    session = await get_tina_session(user_id)
    
    # Merge collected fields from frontend with session
    frontend_collected = set(collected_fields_list or [])
    session_completed = set(session.get("completed_fields", []))
    all_collected = frontend_collected | session_completed
    
    # Update session with frontend data
    session["completed_fields"] = list(all_collected)
    await save_tina_session(session)
    
    # Track asked topics to avoid repetition
    asked_topics = session.get("asked_engagement_topics", [])
    
    result = {
        "message": "",
        "show_options": None,
        "next_field": None,
        "topic": None,
    }
    
    name = user_name or session.get("collected_fields", {}).get("name", "there")
    
    # Check if we should consider onboarding complete based on collected fields
    mandatory_fields = [f for f, c in PROFILE_FIELDS.items() if not c.get("optional", False)]
    mandatory_completed = len([f for f in mandatory_fields if f in all_collected])
    actual_onboarding_complete = is_onboarding_complete or (mandatory_completed >= len(mandatory_fields))
    
    if not actual_onboarding_complete:
        # === ONBOARDING INCOMPLETE ===
        # Find next field NOT in collected fields
        sorted_fields = sorted(
            [(f, c.get("priority", 100)) for f, c in PROFILE_FIELDS.items() if not c.get("optional", False)],
            key=lambda x: x[1]
        )
        
        next_field = None
        for field_name, _ in sorted_fields:
            if field_name not in all_collected:
                next_field = field_name
                break
        
        completion = int((mandatory_completed / len(mandatory_fields)) * 100) if mandatory_fields else 100
        
        if next_field:
            result["next_field"] = next_field
            field_config = PROFILE_FIELDS.get(next_field, {})
            
            # Generate contextual welcome back based on progress
            if completion < 30:
                greetings = [
                    f"Hey {name}! 👋 Let's keep building your profile!",
                    f"Welcome back, {name}! Ready to continue? 😊",
                    f"Good to see you again! Let's pick up where we left off 💫",
                ]
            elif completion < 60:
                greetings = [
                    f"You're back! 🎉 We're making great progress, {name}!",
                    f"Hey {name}! Almost halfway there - let's keep going! 💪",
                    f"Welcome back! Your profile is coming together nicely 😊",
                ]
            elif completion < 90:
                greetings = [
                    f"So close, {name}! Just a few more things and you're all set 🚀",
                    f"Almost there! Let's finish up your profile 🎯",
                    f"Hey! You're nearly done - let's wrap this up! ✨",
                ]
            else:
                greetings = [
                    f"Just one more thing, {name}! Let's complete your profile 🎊",
                    f"Final stretch! One more question and you're good to go 💫",
                ]
            
            import random
            result["message"] = random.choice(greetings)
            
            # Only add options if the next field needs them AND hasn't been collected
            if field_config.get("type") in ["single_select", "multi_select"]:
                result["show_options"] = {
                    "field": next_field,
                    "options": field_config.get("options", []),
                    "multiSelect": field_config.get("type") == "multi_select"
                }
        else:
            # All fields collected but not marked complete - just greet
            result["message"] = f"Welcome back, {name}! Looks like your profile is ready 🎉"
    
    else:
        # === ONBOARDING COMPLETE - ENGAGEMENT MODE ===
        # Find a topic we haven't asked yet
        available_topics = [t for t in POST_ONBOARDING_TOPICS if t["topic"] not in asked_topics]
        
        # Always pick a fresh engaging greeting + question
        import random
        
        # Varied opening greetings to make it feel personal
        opening_greetings = [
            f"Hey {name}! Look who's back 💕",
            f"Oooh, {name}'s here! 🥰",
            f"Well, well, well... {name}! 💫",
            f"There you are, {name}! 😊",
            f"Yay! {name}'s back! 🎉",
            f"Hey you! Missed chatting with you 💭",
            f"Oh hello, {name}! 👋",
            f"Back for more? I like that, {name} 😏",
            f"{name}! Perfect timing ✨",
            f"Hey stranger! JK, it's my fave, {name} 💫",
        ]
        
        greeting = random.choice(opening_greetings)
        
        if available_topics:
            chosen = random.choice(available_topics)
            result["message"] = f"{greeting}\n\n{chosen['question']}"
            result["topic"] = chosen["topic"]
            
            # Save that we asked this topic
            asked_topics.append(chosen["topic"])
            session["asked_engagement_topics"] = asked_topics
            await save_tina_session(session)
        else:
            # Asked all topics, generate AI-powered response for variety
            generic_questions = [
                "What's the last movie that made you ugly cry? 🥹",
                "Quick - name a movie you'd never admit to loving 😅",
                "What movie do you wish you could watch for the first time again? 🎬",
                "Got any movie plans this weekend? 🍿",
                "What's your go-to comfort movie? The one you watch when you need a hug? 🤗",
                "Movie hot take time - which beloved movie do you just not get? 😬",
                "If you could live in any movie universe, which would you pick? 🌟",
                "What movie made you fall in love with cinema? 💕",
                "Popcorn or nachos at the theatre? This is important 🍿",
                "Who would play you in a movie about your life? 🎭",
            ]
            
            result["message"] = f"{greeting}\n\n{random.choice(generic_questions)}"
            
            # Reset topics so we can ask again next time
            session["asked_engagement_topics"] = []
            await save_tina_session(session)
    
    return result


async def get_user_onboarding_status(user_id: str) -> Dict[str, Any]:
    """Check if user has completed onboarding."""
    session = await get_tina_session(user_id)
    completed = set(session.get("completed_fields", []))
    
    # Count mandatory fields completed
    mandatory_fields = [f for f, c in PROFILE_FIELDS.items() if not c.get("optional", False)]
    mandatory_completed = len([f for f in mandatory_fields if f in completed])
    total_mandatory = len(mandatory_fields)
    
    return {
        "is_complete": mandatory_completed >= total_mandatory,
        "completion_percentage": get_completion_percentage(session),
        "completed_fields": list(completed),
        "missing_fields": [f for f in mandatory_fields if f not in completed],
    }

