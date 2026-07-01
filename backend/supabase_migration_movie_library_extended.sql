-- =============================================================================
-- MIGRATION: Extend `movie_library` with the newer columns the backend expects.
-- =============================================================================
-- Symptom being fixed:
--   supabase-py raises PGRST204:
--     "Could not find the 'cast_ids' column of 'movie_library' in the schema cache"
--   ...whenever the backend tries to upsert a movie with the extended payload
--   (cast_ids, directors, keywords, spoken_languages, release_date, ...).
--
-- Root cause:
--   The initial deployment used the shorter `movie_library` schema. The Python
--   service in /app/backend/supabase_service.py has a graceful fallback (it
--   retries with only the base columns), so this is a WARNING, not a hard
--   failure. But we lose all the extended analytics data and pollute logs.
--
-- Run this migration in your Supabase SQL Editor (Dashboard → SQL Editor →
-- New Query → paste → Run). It is idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- ---- Extended columns ----------------------------------------------------
ALTER TABLE movie_library
    ADD COLUMN IF NOT EXISTS original_title         TEXT,
    ADD COLUMN IF NOT EXISTS release_date           DATE,
    ADD COLUMN IF NOT EXISTS cast_ids               TEXT,
    ADD COLUMN IF NOT EXISTS directors              TEXT,
    ADD COLUMN IF NOT EXISTS director_ids           TEXT,
    ADD COLUMN IF NOT EXISTS genre_ids              TEXT,
    ADD COLUMN IF NOT EXISTS keywords               TEXT,
    ADD COLUMN IF NOT EXISTS keyword_ids            TEXT,
    ADD COLUMN IF NOT EXISTS spoken_languages       TEXT,
    ADD COLUMN IF NOT EXISTS production_companies   TEXT,
    ADD COLUMN IF NOT EXISTS production_countries   TEXT,
    ADD COLUMN IF NOT EXISTS homepage               TEXT,
    ADD COLUMN IF NOT EXISTS adult                  BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS video                  BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS interaction_count      INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS first_added_ts         TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_interaction_ts    TIMESTAMPTZ DEFAULT NOW();

-- ---- Helpful indexes (safe to re-run) ------------------------------------
CREATE INDEX IF NOT EXISTS idx_movie_library_name        ON movie_library (movie_name);
CREATE INDEX IF NOT EXISTS idx_movie_library_year        ON movie_library (movie_release_year);
CREATE INDEX IF NOT EXISTS idx_movie_library_genres      ON movie_library (genres);
CREATE INDEX IF NOT EXISTS idx_movie_library_language    ON movie_library (original_language);
CREATE INDEX IF NOT EXISTS idx_movie_library_popularity  ON movie_library (popularity DESC);
CREATE INDEX IF NOT EXISTS idx_movie_library_vote_avg    ON movie_library (vote_average DESC);
CREATE INDEX IF NOT EXISTS idx_movie_library_interaction ON movie_library (interaction_count DESC);

COMMIT;

-- =============================================================================
-- After running, force PostgREST to reload its schema cache so supabase-py
-- picks up the new columns immediately (otherwise you may still see the
-- PGRST204 warning for a few minutes until Supabase auto-reloads):
-- =============================================================================
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verification query (optional): confirm the new columns are present.
-- =============================================================================
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_name = 'movie_library'
--  ORDER BY ordinal_position;
