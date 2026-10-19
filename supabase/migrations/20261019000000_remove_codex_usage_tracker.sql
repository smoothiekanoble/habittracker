-- Retire the Codex usage tracker and remove its persisted data.
DROP TABLE IF EXISTS public.codex_daily_usage_stats;
DROP TABLE IF EXISTS public.codex_usage_snapshots;
