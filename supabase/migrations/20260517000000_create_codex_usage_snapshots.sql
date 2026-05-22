-- Codex usage snapshots imported from the user's local Codex Usage Dashboard.
CREATE TABLE IF NOT EXISTS public.codex_usage_snapshots (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  captured_at                timestamptz NOT NULL DEFAULT now(),
  source                     text NOT NULL DEFAULT 'codex_usage_dashboard',
  status                     text NOT NULL CHECK (status IN ('ok', 'error')),
  credit_balance             numeric,
  five_hour_used_percent     numeric CHECK (five_hour_used_percent IS NULL OR (five_hour_used_percent >= 0 AND five_hour_used_percent <= 100)),
  weekly_used_percent        numeric CHECK (weekly_used_percent IS NULL OR (weekly_used_percent >= 0 AND weekly_used_percent <= 100)),
  raw_metrics                jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message              text,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_codex_usage_snapshots_user_captured
  ON public.codex_usage_snapshots(user_id, captured_at DESC);

ALTER TABLE public.codex_usage_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own Codex usage snapshots"
  ON public.codex_usage_snapshots
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.codex_usage_snapshots IS 'Private Codex usage snapshots imported from a local dashboard scraper.';
