# Film Companion - Product Requirements Document

## Product Overview
Film Companion is a cinema-inspired social/dating platform that matches users based on movie taste similarity rather than traditional profile-based matching. This MVP focuses exclusively on the complete onboarding experience.

## Current MVP Scope
- **Authentication**: Emergent-managed Google Auth + mock email/phone/Apple login
- **12-Step Onboarding Flow**: Complete user profile collection and cinema preference setup
- **Success Screen**: Cinematic curtain animation upon onboarding completion

## Tech Stack
- **Frontend**: Expo (React Native) with expo-router, AsyncStorage, react-native-reanimated
- **Backend**: FastAPI (Python) with MongoDB, httpx for API proxying
- **External APIs**: TMDB (movie search), Google Places (location autocomplete), Emergent Auth (Google OAuth)

## Features Implemented

### 1. Authentication Screen
- Continue with Google (Emergent Auth integration)
- Continue with Apple (mock)
- Login with Email (mock)
- Login with Phone Number (mock)
- Forgot Password link

### 2. Onboarding Steps (12 total)
1. **Basic Info**: Name, Gender (5 options), DOB (age verification), Location (Google Places)
2. **Relationship Intent**: Multi-select (Casual, Friendship, Serious, Exploring)
3. **Partner Preference**: Single select (Men, Women, Anyone)
4. **Languages Spoken**: Multi-select chips (11 Indian languages)
5. **Movie Watching Frequency**: Single select list (6 options)
6. **OTT/Theatre**: Single select (OTT Person, Theatre Person, Both, None)
7. **Film Languages Watched**: Multi-select tiles (8 film languages)
8. **Favourite Genres**: Multi-select chips (8 genres)
9. **Top 5 Movies**: TMDB search with poster grid, 5-star rating, reason tagging
10. **Optional Profile**: Avatar, height, religion, food preference, bio, habits, zodiac, etc.
11. **Profile Preview**: Full data preview with show/hide visibility toggles
12. **Mode Selection**: Movie Buddy Mode / Movie Date Mode with feature descriptions

### 3. Success Screen
- Animated cinema curtain opening effect
- "Let's Begin The Show!" title with gold accent
- "Enter Film Companion" call-to-action button

## Design System
- **Theme**: Dark Cinema (Netflix/Letterboxd inspired)
- **Colors**: #121212 (bg), #E50914 (primary/cinema red), #FFD700 (gold accent)
- **Components**: Pill-shaped buttons, rounded cards, chips, tiles, film-strip progress bar

## Data Storage
- AsyncStorage for profile data (local-first MVP)
- MongoDB for auth sessions and user records

## Not Implemented (Future Iterations)
- Movie swiping/discovery
- Matching algorithm
- User discovery
- Chat system (Green Room Chat)
- Push notifications
- Real photo upload (currently avatar-based)

## Business Enhancement Opportunity
**Freemium tier with "Director's Cut" premium** - Premium users get expanded movie matching (beyond genres to directors, cinematographers, film eras), priority visibility, and "Premiere Night" virtual movie watch parties to drive conversion and retention.
