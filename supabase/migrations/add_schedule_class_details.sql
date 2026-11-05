-- =============================================================================
--  Excel schedule import: keep the subject / section / room from the
--  Instructor's Program on each schedule row.
--  Run once in Supabase → SQL Editor. Safe to re-run.
--  (The import still works without this — it just won't store these 3 fields.)
-- =============================================================================

ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS subject_code text;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS section text;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS room text;

-- Refresh the PostgREST schema cache so the app sees the new columns right away
NOTIFY pgrst, 'reload schema';
