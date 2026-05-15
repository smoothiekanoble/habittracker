/** Canonical habit row; matches Supabase habits table. */
export type Habit = {
  id: string;
  user_id: string;
  title: string;
  color: string;
  icon: string;
  /** YYYY-MM-DD; habit counts from this day onward (inclusive). */
  active_from: string;
  /** YYYY-MM-DD inclusive end, or null = ongoing. */
  active_until: string | null;
  created_at: string;
  updated_at: string;
};

/** Canonical habit log row; matches Supabase habit_logs table. */
export type HabitLog = {
  id: string;
  habit_id: string;
  date: string;
  completed: boolean;
  created_at: string;
};
