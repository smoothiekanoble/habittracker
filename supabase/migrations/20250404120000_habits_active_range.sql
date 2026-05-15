-- Track when each habit counts toward daily completion (local calendar dates).
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS active_from date,
  ADD COLUMN IF NOT EXISTS active_until date;

UPDATE public.habits
SET active_from = (created_at AT TIME ZONE 'UTC')::date
WHERE active_from IS NULL;

ALTER TABLE public.habits
  ALTER COLUMN active_from SET NOT NULL,
  ALTER COLUMN active_from SET DEFAULT CURRENT_DATE;

ALTER TABLE public.habits DROP CONSTRAINT IF EXISTS habits_active_range_chk;
ALTER TABLE public.habits
  ADD CONSTRAINT habits_active_range_chk
  CHECK (active_until IS NULL OR active_until >= active_from);

COMMENT ON COLUMN public.habits.active_from IS 'First calendar day this habit counts toward totals (inclusive)';
COMMENT ON COLUMN public.habits.active_until IS 'Last calendar day inclusive; NULL = no end';
