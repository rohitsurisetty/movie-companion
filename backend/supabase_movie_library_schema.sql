-- Movie Library Table Schema
-- This table stores comprehensive movie details ONLY for movies users have interacted with
-- It creates a curated catalog for analytics without storing all TMDB movies

-- Drop existing table if needed (careful in production!)
-- DROP TABLE IF EXISTS movie_library;

CREATE TABLE IF NOT EXISTS movie_library (
    id SERIAL PRIMARY KEY,
    
    -- Core identifiers
    movie_id INTEGER UNIQUE NOT NULL,
    movie_name TEXT,
    original_title TEXT,
    
    -- Release info
    movie_release_year TEXT,
    release_date DATE,
    status TEXT,
    
    -- Cast & Crew
    movie_cast TEXT,           -- Comma-separated top 10 cast names
    cast_ids TEXT,             -- Comma-separated cast IDs for mapping
    directors TEXT,            -- Comma-separated director names
    director_ids TEXT,         -- Comma-separated director IDs
    
    -- Content details
    movie_summary TEXT,
    tagline TEXT,
    
    -- Media paths
    poster_path TEXT,
    backdrop_path TEXT,
    homepage TEXT,
    
    -- Ratings & Popularity
    vote_average DECIMAL(3,1),
    vote_count INTEGER,
    popularity DECIMAL(10,3),
    
    -- Categories & Keywords
    genres TEXT,               -- Comma-separated genre names
    genre_ids TEXT,            -- Comma-separated genre IDs
    keywords TEXT,             -- Comma-separated keyword names
    keyword_ids TEXT,          -- Comma-separated keyword IDs
    
    -- Language & Production
    original_language TEXT,
    spoken_languages TEXT,     -- Comma-separated
    production_companies TEXT, -- Comma-separated
    production_countries TEXT, -- Comma-separated
    
    -- Technical details
    runtime INTEGER,           -- Minutes
    budget BIGINT,
    revenue BIGINT,
    
    -- External IDs
    imdb_id TEXT,
    
    -- Flags
    adult BOOLEAN DEFAULT FALSE,
    video BOOLEAN DEFAULT FALSE,
    
    -- Interaction tracking (for analytics)
    interaction_count INTEGER DEFAULT 1,
    first_added_ts TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_interaction_ts TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes for common queries
    CONSTRAINT movie_id_unique UNIQUE (movie_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_movie_library_name ON movie_library(movie_name);
CREATE INDEX IF NOT EXISTS idx_movie_library_year ON movie_library(movie_release_year);
CREATE INDEX IF NOT EXISTS idx_movie_library_genres ON movie_library(genres);
CREATE INDEX IF NOT EXISTS idx_movie_library_language ON movie_library(original_language);
CREATE INDEX IF NOT EXISTS idx_movie_library_popularity ON movie_library(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_movie_library_vote_avg ON movie_library(vote_average DESC);
CREATE INDEX IF NOT EXISTS idx_movie_library_interaction ON movie_library(interaction_count DESC);

-- Disable RLS for this table (it's reference data, not user data)
ALTER TABLE movie_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on movie_library" ON movie_library FOR ALL USING (true);

-- Comments for documentation
COMMENT ON TABLE movie_library IS 'Global movie catalog containing ONLY movies users have interacted with';
COMMENT ON COLUMN movie_library.movie_id IS 'TMDB movie ID - primary identifier';
COMMENT ON COLUMN movie_library.interaction_count IS 'Number of times any user has interacted with this movie';
COMMENT ON COLUMN movie_library.first_added_ts IS 'When this movie was first added to the catalog';
COMMENT ON COLUMN movie_library.last_interaction_ts IS 'Most recent user interaction with this movie';
