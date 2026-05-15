-- Habit completion logs: one row per habit per day
CREATE TABLE IF NOT EXISTS public.habit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id      uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  date          date NOT NULL,
  completed     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(habit_id, date)
);

CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON public.habit_logs(habit_id, date);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date_desc ON public.habit_logs(habit_id, date DESC);

ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage logs for own habits"
  ON public.habit_logs
  FOR ALL
  USING (
    habit_id IN (SELECT id FROM public.habits WHERE user_id = auth.uid())
  )
  WITH CHECK (
    habit_id IN (SELECT id FROM public.habits WHERE user_id = auth.uid())
  );

COMMENT ON TABLE public.habit_logs IS 'Daily completion logs; RLS via habits.user_id';
