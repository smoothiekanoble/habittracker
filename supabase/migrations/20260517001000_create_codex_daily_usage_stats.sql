-- Daily Codex activity summary imported from local Codex session metadata.
CREATE TABLE IF NOT EXISTS public.codex_daily_usage_stats (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                          date NOT NULL,
  local_thread_count            integer NOT NULL DEFAULT 0 CHECK (local_thread_count >= 0),
  local_turn_count              integer NOT NULL DEFAULT 0 CHECK (local_turn_count >= 0),
  max_five_hour_used_percent    numeric CHECK (max_five_hour_used_percent IS NULL OR (max_five_hour_used_percent >= 0 AND max_five_hour_used_percent <= 100)),
  max_weekly_used_percent       numeric CHECK (max_weekly_used_percent IS NULL OR (max_weekly_used_percent >= 0 AND max_weekly_used_percent <= 100)),
  sample_count                  integer NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  last_captured_at              timestamptz NOT NULL DEFAULT now(),
  status                        text NOT NULL CHECK (status IN ('ok', 'error')),
  error_message                 text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_codex_daily_usage_stats_user_date
  ON public.codex_daily_usage_stats(user_id, date DESC);

ALTER TABLE public.codex_daily_usage_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own Codex daily usage stats"
  ON public.codex_daily_usage_stats
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.codex_daily_usage_stats IS 'Private daily Codex activity summaries. Does not store prompt or response content.';
