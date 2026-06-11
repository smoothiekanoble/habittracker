-- Raw normalized metric events. One row per imported measurement.
-- Initial importer: MedM Health body weight.
CREATE TABLE IF NOT EXISTS public.metric_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at       timestamptz NOT NULL,
  metric_date       date NOT NULL,
  metric_type       text NOT NULL,
  value             numeric NOT NULL,
  unit              text NOT NULL,
  source            text NOT NULL,
  source_record_id  text,
  source_detail     text,
  raw_metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metric_events_metric_type_check CHECK (metric_type <> ''),
  CONSTRAINT metric_events_unit_check CHECK (unit <> ''),
  CONSTRAINT metric_events_source_check CHECK (source <> ''),
  CONSTRAINT metric_events_source_record_id_check CHECK (
    source_record_id IS NULL OR source_record_id <> ''
  ),
  CONSTRAINT metric_events_unique_source_record
    UNIQUE(user_id, source, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_metric_events_user_occurred_at
  ON public.metric_events(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_events_user_type_date
  ON public.metric_events(user_id, metric_type, metric_date DESC);

ALTER TABLE public.metric_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own metric events"
  ON public.metric_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own metric events"
  ON public.metric_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metric events"
  ON public.metric_events
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_metric_events_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_metric_events_updated_at ON public.metric_events;

CREATE TRIGGER trg_metric_events_updated_at
  BEFORE UPDATE ON public.metric_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_metric_events_updated_at();

COMMENT ON TABLE public.metric_events IS 'Private normalized metric events. Stores every MedM weigh-in; RLS by user_id.';
COMMENT ON COLUMN public.metric_events.raw_metadata IS 'Adapter metadata only; do not store raw health export rows.';
