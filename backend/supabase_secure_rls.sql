-- =============================================================
-- Re-secure Supabase (undoes supabase_disable_rls.sql).
-- Run ONCE in the Supabase SQL editor.
--
-- The backend talks to Supabase with the SERVICE ROLE key, which bypasses
-- RLS. The mobile app never talks to Supabase directly. So: enable RLS on
-- every public table with NO policies and revoke the anon/authenticated
-- grants -> the public anon key can no longer read or write anything.
-- =============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.tablename);
  END LOOP;
END $$;

REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- The "allow everything" policy from supabase_movie_library_schema.sql
DROP POLICY IF EXISTS "Allow all operations on movie_library" ON public.movie_library;

-- Profile photos: keep public READ (the app shows photos by public URL), but
-- only the backend (service role) may upload / replace / delete.
DROP POLICY IF EXISTS "profile-pictures-insert" ON storage.objects;
DROP POLICY IF EXISTS "profile-pictures-update" ON storage.objects;
DROP POLICY IF EXISTS "profile-pictures-delete" ON storage.objects;
