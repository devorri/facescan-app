-- =============================================================================
--  Fix: deleting a faculty fails  +  phone column  +  diagnose "only 3 faculty"
--  Run ONCE in Supabase → SQL Editor → New query → Run.   Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A real `phone` column (the app was storing phones as avatar_url = 'phone:09..')
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

UPDATE public.profiles
SET phone = substring(avatar_url FROM 7), avatar_url = NULL
WHERE phone IS NULL AND avatar_url LIKE 'phone:%';

-- -----------------------------------------------------------------------------
-- 2. Deleting a profile must not be blocked by rows that point to it.
--    Your schema has 7 foreign keys to profiles, all with NO ACTION, so ANY
--    schedule / access log / instructor row made the delete fail (error 23503).
--      schedules, instructors            -> deleted with the faculty (CASCADE)
--      access_logs, reports, grades,
--      activity_logs, students           -> kept, reference set to NULL
-- -----------------------------------------------------------------------------
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_faculty_id_fkey;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_faculty_id_fkey
  FOREIGN KEY (faculty_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.access_logs DROP CONSTRAINT IF EXISTS access_logs_faculty_id_fkey;
ALTER TABLE public.access_logs ADD CONSTRAINT access_logs_faculty_id_fkey
  FOREIGN KEY (faculty_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.instructors DROP CONSTRAINT IF EXISTS instructors_profile_id_fkey;
ALTER TABLE public.instructors ADD CONSTRAINT instructors_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
-- (if that instructor still has rows in `classes`, the delete is refused on purpose
--  so no grades are lost — the app shows that message)

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_profile_id_fkey;
ALTER TABLE public.students ADD CONSTRAINT students_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_encoded_by_fkey;
ALTER TABLE public.grades ADD CONSTRAINT grades_encoded_by_fkey
  FOREIGN KEY (encoded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_generated_by_fkey;
ALTER TABLE public.reports ADD CONSTRAINT reports_generated_by_fkey
  FOREIGN KEY (generated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_actor_id_fkey;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 3. The app uses the anon key (custom login, no Supabase Auth). If Row Level
--    Security is ON and an operation has no policy, Postgres silently affects
--    0 rows ("delete does nothing"). Add only the policies that are missing.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  op text;
  pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'schedules', 'access_logs', 'instructors'] LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity) THEN
      FOREACH op IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        pol := 'app_' || lower(op) || '_' || t;
        IF NOT EXISTS (SELECT 1 FROM pg_policies
                       WHERE schemaname = 'public' AND tablename = t AND (cmd = op OR cmd = 'ALL')) THEN
          IF op = 'INSERT' THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)', pol, t);
          ELSIF op = 'UPDATE' THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', pol, t);
          ELSE
            EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO anon, authenticated USING (true)', pol, t, op);
          END IF;
          RAISE NOTICE 'Created policy % on %', pol, t;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4. DIAGNOSE "only 3 faculty can be registered". Nothing in the app code limits
--    the count, so it is something in the database. Look at the results of these:
-- -----------------------------------------------------------------------------

-- 4a. Triggers on profiles (e.g. one that auto-creates an `instructors` row with a
--     generated employee_no — employee_no is UNIQUE, so a bad generator fails on
--     the 4th insert; or one that RAISEs when count(*) >= 3)
SELECT t.tgname AS trigger_name, pg_get_triggerdef(t.oid) AS definition, p.prosrc AS function_body
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.profiles'::regclass AND NOT t.tgisinternal;

-- 4b. Unique / check constraints and unique indexes on profiles + instructors
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.profiles'::regclass, 'public.instructors'::regclass) AND contype IN ('u', 'c', 'x');

-- 4c. RLS policies on profiles (a WITH CHECK using a count would also cap inserts)
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles';

-- 4d. Same face registered under two names (causes the "wrong name" at the door).
--     face_embedding is a pgvector column, <=> is cosine distance.
SELECT a.name AS profile_a, b.name AS profile_b,
       round((a.face_embedding <=> b.face_embedding)::numeric, 4) AS cosine_distance
FROM public.profiles a
JOIN public.profiles b ON a.id < b.id
WHERE a.face_embedding IS NOT NULL AND b.face_embedding IS NOT NULL
ORDER BY cosine_distance
LIMIT 15;
-- cosine_distance < 0.05  => almost certainly the SAME person enrolled twice.
-- Re-enroll or delete one of them (the new Pi code now refuses such duplicates).
