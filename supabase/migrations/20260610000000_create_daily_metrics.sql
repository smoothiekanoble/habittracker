-- Generic daily metrics table for private health and activity measurements.
-- Initial importer: MedM Health body weight only.
CREATE TABLE IF NOT EXISTS public.daily_metrics (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_date    date NOT NULL,
  metric_type    text NOT NULL,
  value          numeric NOT NULL,
  unit           text NOT NULL,
  source         text NOT NULL,
  source_detail  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_metrics_metric_type_check CHECK (metric_type <> ''),
  CONSTRAINT daily_metrics_unit_check CHECK (unit <> ''),
  CONSTRAINT daily_metrics_source_check CHECK (source <> ''),
  CONSTRAINT daily_metrics_unique_source_metric
    UNIQUE(user_id, metric_date, metric_type, source)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_user_date
  ON public.daily_metrics(user_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_user_type_date
  ON public.daily_metrics(user_id, metric_type, metric_date DESC);

ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own daily metrics"
  ON public.daily_metrics
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily metrics"
  ON public.daily_metrics
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily metrics"
  ON public.daily_metrics
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_daily_metrics_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_metrics_updated_at ON public.daily_metrics;

CREATE TRIGGER trg_daily_metrics_updated_at
  BEFORE UPDATE ON public.daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_daily_metrics_updated_at();

COMMENT ON TABLE public.daily_metrics IS 'Private normalized daily metrics such as body weight. RLS by user_id.';
COMMENT ON COLUMN public.daily_metrics.source_detail IS 'Adapter metadata only; do not store raw health export rows.';
