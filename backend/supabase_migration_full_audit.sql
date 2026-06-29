-- =====================================================================
-- FILM COMPANION — FULL AUDIT-TRAIL MIGRATION
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- It is idempotent: safe to run multiple times.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART 1 — FIX SILENT VERSIONING BUG
-- The original schema declared `user_id UNIQUE` on tables we want to
-- version (every change = new row). UNIQUE blocks re-inserts, so most
-- updates were silently failing. Drop those UNIQUE constraints.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
  cons_name TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'user_sign_up_details',
    'preferences_and_filters',
    'exclusive_toggle',
    'expand_if_run_out',
    'mode_selected',
    'toggle_visibility_profile'
  ])
  LOOP
    -- find a UNIQUE constraint on user_id (if any) and drop it
    FOR cons_name IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = tbl
        AND con.contype = 'u'
        AND EXISTS (
          SELECT 1 FROM unnest(con.conkey) k
          JOIN pg_attribute att ON att.attnum = k AND att.attrelid = con.conrelid
          WHERE att.attname = 'user_id'
        )
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', tbl, cons_name);
      RAISE NOTICE 'Dropped UNIQUE(user_id) on %', tbl;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- PART 2 — NEW VERSIONED TABLES (each change = new row)
-- ---------------------------------------------------------------------

-- 2.1 USER PICTURES — audit log of every photo upload/replace/delete
CREATE TABLE IF NOT EXISTS user_pictures (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  picture_number INTEGER,             -- 1..5
  action TEXT NOT NULL,               -- 'upload' | 'replace' | 'delete'
  storage_path TEXT,                  -- e.g. 'user_xxx/picture_1_abcd.jpg' in bucket
  picture_url TEXT,                   -- public URL (or empty if deleted)
  content_type TEXT,
  size_bytes INTEGER,
  source TEXT,                        -- 'supabase_storage' | 'mongodb_base64' (during migration)
  last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
  last_modified_date DATE DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_user_pictures_user_id ON user_pictures(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pictures_ts ON user_pictures(last_modified_ts DESC);

-- 2.2 TINA CHAT MESSAGES — every message Tina exchanges
CREATE TABLE IF NOT EXISTS tina_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,                 -- 'user' | 'tina'
  content TEXT,
  selected_option TEXT,
  selected_option_key TEXT,           -- 360 chip option_key
  question_id TEXT,                   -- 360 question id (if any)
  collected_field TEXT,               -- field Tina just collected (legacy)
  collected_value JSONB,
  persona_360_phase TEXT,             -- 'inactive' | 'active' | 'complete'
  show_options JSONB,                 -- payload of chips shown
  show_movie_picker BOOLEAN DEFAULT FALSE,
  archetype_reveal JSONB,             -- emoji/title/desc/intent/LL (public-safe only)
  completion_percentage INTEGER,
  exit_intent BOOLEAN DEFAULT FALSE,
  last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
  last_modified_date DATE DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_tina_chat_user_id ON tina_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_tina_chat_ts ON tina_chat_messages(last_modified_ts DESC);

-- 2.3 TINA 360° PERSONA — every archetype reveal event (no raw scores)
CREATE TABLE IF NOT EXISTS tina_persona_360 (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  archetype_key TEXT,
  archetype_title TEXT,
  archetype_emoji TEXT,
  archetype_description TEXT,
  primary_love_language TEXT,
  intent_serious INTEGER,
  intent_casual INTEGER,
  questions_answered JSONB,           -- [{question_id, option_key}, ...] - 8 deterministic answers
  favourite_trope TEXT,
  favourite_genres TEXT,
  last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
  last_modified_date DATE DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_tina_persona_user_id ON tina_persona_360(user_id);
CREATE INDEX IF NOT EXISTS idx_tina_persona_ts ON tina_persona_360(last_modified_ts DESC);

-- 2.4 USER-TO-USER CHAT MESSAGES — every chat message audit
CREATE TABLE IF NOT EXISTS user_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',   -- 'text' | 'icebreaker' | 'ai_auto_reply' | 'system'
  content TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  is_first_message BOOLEAN DEFAULT FALSE,  -- TRUE for message requests
  last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
  last_modified_date DATE DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_user_chat_conv ON user_chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_user_chat_sender ON user_chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_user_chat_receiver ON user_chat_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_user_chat_ts ON user_chat_messages(last_modified_ts DESC);

-- 2.5 MATCH EVENTS — match generated / viewed / right-swiped / etc.
CREATE TABLE IF NOT EXISTS match_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_user_id TEXT,                -- the user being matched WITH
  event_type TEXT NOT NULL,           -- 'matches_generated' | 'profile_viewed' | 'liked' | 'rejected' | 'request_sent' | 'request_accepted' | 'request_declined' | 'meeting_marked'
  match_level TEXT,                   -- 'Perfect Match' | 'Great Match' | ...
  compatibility_score INTEGER,
  mode TEXT,                          -- 'date' | 'buddy'
  source TEXT,                        -- 'ai_matchmaking' | 'cache' | 'feed' | 'chat_request'
  payload JSONB,                      -- any extra context
  last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
  last_modified_date DATE DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_match_events_user_id ON match_events(user_id);
CREATE INDEX IF NOT EXISTS idx_match_events_target ON match_events(target_user_id);
CREATE INDEX IF NOT EXISTS idx_match_events_ts ON match_events(last_modified_ts DESC);

-- 2.6 UNMATCH EVENTS
CREATE TABLE IF NOT EXISTS unmatch_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  other_user_id TEXT NOT NULL,
  conversation_id TEXT,
  reason TEXT,
  last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
  last_modified_date DATE DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_unmatch_user_id ON unmatch_events(user_id);

-- 2.7 REPORT EVENTS
CREATE TABLE IF NOT EXISTS report_events (
  id BIGSERIAL PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  reported_user_id TEXT NOT NULL,
  conversation_id TEXT,
  reason TEXT,
  details TEXT,
  last_modified_ts TIMESTAMPTZ DEFAULT NOW(),
  last_modified_date DATE DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_report_reporter ON report_events(reporter_id);
CREATE INDEX IF NOT EXISTS idx_report_target ON report_events(reported_user_id);

-- ---------------------------------------------------------------------
-- PART 3 — STORAGE BUCKET (for profile pictures)
-- ---------------------------------------------------------------------
-- This creates a public bucket called 'profile-pictures' if it doesn't
-- exist. Storage rows live in the storage.* schema.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-pictures',
  'profile-pictures',
  TRUE,
  5242880,   -- 5 MB per image
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies: allow anon role to read + insert + update + delete
-- (we use the anon key from backend — locked down via service role in prod)
DO $$
BEGIN
  -- READ
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profile-pictures-read') THEN
    CREATE POLICY "profile-pictures-read" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'profile-pictures');
  END IF;
  -- WRITE
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profile-pictures-insert') THEN
    CREATE POLICY "profile-pictures-insert" ON storage.objects
      FOR INSERT TO public
      WITH CHECK (bucket_id = 'profile-pictures');
  END IF;
  -- UPDATE
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profile-pictures-update') THEN
    CREATE POLICY "profile-pictures-update" ON storage.objects
      FOR UPDATE TO public
      USING (bucket_id = 'profile-pictures');
  END IF;
  -- DELETE
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profile-pictures-delete') THEN
    CREATE POLICY "profile-pictures-delete" ON storage.objects
      FOR DELETE TO public
      USING (bucket_id = 'profile-pictures');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- DONE
-- ---------------------------------------------------------------------
-- Expected output: 'Dropped UNIQUE(user_id) on …' notices,
-- and no errors. Verify by selecting one row from each new table.
