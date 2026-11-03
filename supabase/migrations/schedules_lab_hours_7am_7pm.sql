-- =============================================================================
--  Lock schedules to lab hours: 7:00 AM – 7:00 PM, end after start.
--  Run in Supabase → SQL Editor. Safe to re-run.
-- =============================================================================

-- 1. (Optional) See any EXISTING schedules that break the rule — fix or delete these.
SELECT s.id, p.name, s.day_of_week, s.start_time, s.end_time
FROM public.schedules s
LEFT JOIN public.profiles p ON p.id = s.faculty_id
WHERE s.start_time < '07:00' OR s.end_time > '19:00' OR s.end_time <= s.start_time;

-- 2. Reject any NEW or EDITED schedule outside 7 AM – 7 PM (from the app,
--    the Table Editor, or anywhere else). NOT VALID = existing rows are not
--    re-checked, so this never fails even if step 1 found old bad rows.
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_lab_hours_check;
ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_lab_hours_check
  CHECK (start_time >= '07:00' AND end_time <= '19:00' AND end_time > start_time)
  NOT VALID;
