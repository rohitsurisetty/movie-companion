-- =============================================
-- DISABLE ROW LEVEL SECURITY FOR ALL TABLES
-- Run this in Supabase SQL Editor
-- =============================================

-- Disable RLS on all tables to allow inserts from API
ALTER TABLE user_logged_in DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_sign_up_details DISABLE ROW LEVEL SECURITY;
ALTER TABLE preferences_and_filters DISABLE ROW LEVEL SECURITY;
ALTER TABLE exclusive_toggle DISABLE ROW LEVEL SECURITY;
ALTER TABLE expand_if_run_out DISABLE ROW LEVEL SECURITY;
ALTER TABLE mode_selected DISABLE ROW LEVEL SECURITY;
ALTER TABLE top_5_movies DISABLE ROW LEVEL SECURITY;
ALTER TABLE toggle_visibility_profile DISABLE ROW LEVEL SECURITY;
ALTER TABLE movie_swipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE movie_library DISABLE ROW LEVEL SECURITY;

-- Grant full access to anon and authenticated roles
GRANT ALL ON user_logged_in TO anon, authenticated;
GRANT ALL ON user_sign_up_details TO anon, authenticated;
GRANT ALL ON preferences_and_filters TO anon, authenticated;
GRANT ALL ON exclusive_toggle TO anon, authenticated;
GRANT ALL ON expand_if_run_out TO anon, authenticated;
GRANT ALL ON mode_selected TO anon, authenticated;
GRANT ALL ON top_5_movies TO anon, authenticated;
GRANT ALL ON toggle_visibility_profile TO anon, authenticated;
GRANT ALL ON movie_swipes TO anon, authenticated;
GRANT ALL ON movie_library TO anon, authenticated;

-- Grant sequence permissions (for auto-increment IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
