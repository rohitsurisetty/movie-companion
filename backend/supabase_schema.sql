-- =============================================
-- SUPABASE SCHEMA FOR FILM COMPANION APP
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. USER LOGGED IN TABLE
CREATE TABLE IF NOT EXISTS user_logged_in (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    login_method TEXT,
    login_success_state BOOLEAN DEFAULT TRUE,
    logged_in_at TIMESTAMPTZ DEFAULT NOW(),
    device_info TEXT,
    session_id TEXT
);
CREATE INDEX idx_user_logged_in_user_id ON user_logged_in(user_id);
CREATE INDEX idx_user_logged_in_logged_at ON user_logged_in(logged_in_at);

-- 2. USER SIGN UP DETAILS TABLE
CREATE TABLE IF NOT EXISTS user_sign_up_details (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
    last_modified_date DATE DEFAULT CURRENT_DATE,
    name TEXT,
    gender TEXT,
    date_of_birth DATE,
    looking_for TEXT,
    who_do_you_want_to_meet TEXT,
    who_do_you_want_to_meet_toggle_status BOOLEAN DEFAULT TRUE,
    languages_you_speak TEXT,
    how_often_do_you_watch_movies TEXT,
    what_describes_you_more TEXT,
    languages_of_films_you_watch TEXT,
    your_favourite_genres TEXT,
    height TEXT,
    food_preference TEXT,
    education TEXT,
    work_profile TEXT,
    how_often_do_you_travel TEXT,
    religion TEXT,
    marital_status TEXT,
    smoking_habit TEXT,
    drinking_habit TEXT,
    exercise_habit TEXT,
    zodiac_sign TEXT,
    pets_preference TEXT,
    family_planning TEXT,
    siblings TEXT,
    bio TEXT,
    mode_selected_during_signup TEXT,
    session_id TEXT
);
CREATE INDEX idx_user_sign_up_user_id ON user_sign_up_details(user_id);

-- 3. PREFERENCES AND FILTERS TABLE
CREATE TABLE IF NOT EXISTS preferences_and_filters (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
    last_modified_date DATE DEFAULT CURRENT_DATE,
    session_id TEXT,
    distance_radius INTEGER,
    age_range TEXT,
    height_preference TEXT,
    languages_they_speak TEXT,
    favourite_genres TEXT,
    ott_or_theatre_preference TEXT,
    languages_they_watch TEXT,
    religion TEXT,
    zodiac_sign TEXT,
    siblings TEXT,
    education TEXT,
    travel_frequency TEXT,
    smoking_preference TEXT,
    drinking_preference TEXT,
    exercise_preference TEXT,
    pets_preference TEXT,
    family_planning TEXT,
    marital_status TEXT,
    food_preference TEXT,
    intent_preference TEXT
);
CREATE INDEX idx_preferences_user_id ON preferences_and_filters(user_id);

-- 4. EXCLUSIVE TOGGLE TABLE
CREATE TABLE IF NOT EXISTS exclusive_toggle (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
    last_modified_date DATE DEFAULT CURRENT_DATE,
    session_id TEXT,
    distance_radius_exclusive_status BOOLEAN DEFAULT FALSE,
    age_range_exclusive_status BOOLEAN DEFAULT FALSE,
    height_preference_exclusive_status BOOLEAN DEFAULT FALSE,
    languages_they_speak_exclusive_status BOOLEAN DEFAULT FALSE,
    favourite_genres_exclusive_status BOOLEAN DEFAULT FALSE,
    ott_or_theatre_preference_exclusive_status BOOLEAN DEFAULT FALSE,
    languages_they_watch_exclusive_status BOOLEAN DEFAULT FALSE,
    religion_exclusive_status BOOLEAN DEFAULT FALSE,
    zodiac_sign_exclusive_status BOOLEAN DEFAULT FALSE,
    siblings_exclusive_status BOOLEAN DEFAULT FALSE,
    education_exclusive_status BOOLEAN DEFAULT FALSE,
    travel_frequency_exclusive_status BOOLEAN DEFAULT FALSE,
    smoking_preference_exclusive_status BOOLEAN DEFAULT FALSE,
    drinking_preference_exclusive_status BOOLEAN DEFAULT FALSE,
    exercise_preference_exclusive_status BOOLEAN DEFAULT FALSE,
    pets_preference_exclusive_status BOOLEAN DEFAULT FALSE,
    family_planning_exclusive_status BOOLEAN DEFAULT FALSE,
    marital_status_exclusive_status BOOLEAN DEFAULT FALSE,
    food_preference_exclusive_status BOOLEAN DEFAULT FALSE,
    intent_preference_exclusive_status BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_exclusive_toggle_user_id ON exclusive_toggle(user_id);

-- 5. EXPAND IF RUN OUT TABLE
CREATE TABLE IF NOT EXISTS expand_if_run_out (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
    last_modified_date DATE DEFAULT CURRENT_DATE,
    session_id TEXT,
    distance_radius_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    age_range_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    height_preference_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    languages_they_speak_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    favourite_genres_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    ott_or_theatre_preference_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    languages_they_watch_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    religion_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    zodiac_sign_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    siblings_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    education_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    travel_frequency_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    smoking_preference_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    drinking_preference_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    exercise_preference_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    pets_preference_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    family_planning_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    marital_status_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    food_preference_expand_if_run_out_status BOOLEAN DEFAULT TRUE,
    intent_preference_expand_if_run_out_status BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_expand_if_run_out_user_id ON expand_if_run_out(user_id);

-- 6. MODE SELECTED TABLE
CREATE TABLE IF NOT EXISTS mode_selected (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
    last_modified_date DATE DEFAULT CURRENT_DATE,
    mode_selected TEXT
);
CREATE INDEX idx_mode_selected_user_id ON mode_selected(user_id);

-- 7. TOP 5 MOVIES TABLE
CREATE TABLE IF NOT EXISTS top_5_movies (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    rank_of_movie_added INTEGER,
    movie_name TEXT,
    rating_given INTEGER,
    why_do_you_love_it TEXT,
    last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
    last_modified_date DATE DEFAULT CURRENT_DATE,
    session_id TEXT
);
CREATE INDEX idx_top_5_movies_user_id ON top_5_movies(user_id);

-- 8. TOGGLE VISIBILITY PROFILE TABLE
CREATE TABLE IF NOT EXISTS toggle_visibility_profile (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
    last_modified_date DATE DEFAULT CURRENT_DATE,
    session_id TEXT,
    location_toggle_status BOOLEAN DEFAULT TRUE,
    looking_for_toggle_status BOOLEAN DEFAULT TRUE,
    want_to_meet_toggle_status BOOLEAN DEFAULT TRUE,
    movie_frequency_toggle_status BOOLEAN DEFAULT TRUE,
    preference_toggle_status BOOLEAN DEFAULT TRUE,
    film_languages_toggle_status BOOLEAN DEFAULT TRUE,
    genres_toggle_status BOOLEAN DEFAULT TRUE,
    height_toggle_status BOOLEAN DEFAULT TRUE,
    religion_toggle_status BOOLEAN DEFAULT TRUE,
    marital_status_toggle_status BOOLEAN DEFAULT TRUE,
    food_toggle_status BOOLEAN DEFAULT TRUE,
    bio_toggle_status BOOLEAN DEFAULT TRUE,
    smoking_toggle_status BOOLEAN DEFAULT TRUE,
    drinking_toggle_status BOOLEAN DEFAULT TRUE,
    exercise_toggle_status BOOLEAN DEFAULT TRUE,
    zodiac_toggle_status BOOLEAN DEFAULT TRUE,
    pets_toggle_status BOOLEAN DEFAULT TRUE,
    family_planning_toggle_status BOOLEAN DEFAULT TRUE,
    siblings_toggle_status BOOLEAN DEFAULT TRUE,
    education_toggle_status BOOLEAN DEFAULT TRUE,
    work_toggle_status BOOLEAN DEFAULT TRUE,
    travel_toggle_status BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_toggle_visibility_user_id ON toggle_visibility_profile(user_id);

-- 9. MOVIE SWIPES TABLE
CREATE TABLE IF NOT EXISTS movie_swipes (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
    last_modified_date DATE DEFAULT CURRENT_DATE,
    movie_name TEXT,
    swiped_left_or_right TEXT,
    rating_given INTEGER,
    reason_given TEXT
);
CREATE INDEX idx_movie_swipes_user_id ON movie_swipes(user_id);
CREATE INDEX idx_movie_swipes_date ON movie_swipes(last_modified_date);

-- 10. MOVIE LIBRARY TABLE
CREATE TABLE IF NOT EXISTS movie_library (
    id BIGSERIAL PRIMARY KEY,
    movie_id INTEGER UNIQUE,
    movie_name TEXT,
    movie_release_year TEXT,
    movie_cast TEXT,
    movie_summary TEXT,
    poster_path TEXT,
    backdrop_path TEXT,
    vote_average DECIMAL(3,1),
    vote_count INTEGER,
    popularity DECIMAL(10,3),
    genres TEXT,
    original_language TEXT,
    runtime INTEGER,
    budget BIGINT,
    revenue BIGINT,
    tagline TEXT,
    status TEXT,
    imdb_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_movie_library_movie_id ON movie_library(movie_id);
CREATE INDEX idx_movie_library_name ON movie_library(movie_name);

-- Enable Row Level Security (optional - for production)
-- ALTER TABLE user_logged_in ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_sign_up_details ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE preferences_and_filters ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE exclusive_toggle ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE expand_if_run_out ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE mode_selected ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE top_5_movies ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE toggle_visibility_profile ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE movie_swipes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE movie_library ENABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated users (if using Supabase Auth)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
