import { daysInMonth, toLocalYMD } from "@/lib/calendar";

export type MonthLogRow = {
  habit_id: string;
  date: string;
  completed: boolean;
};

/** Minimal habit fields for stats (matches Habit row from Supabase). */
export type HabitForStats = {
  id: string;
  created_at: string;
  active_from?: string | null;
  active_until?: string | null;
};

function normDate(s: string | null | undefined): string | null {
  if (s == null || s === "") return null;
  return s.slice(0, 10);
}

/** Whether `dateStr` (YYYY-MM-DD) falls in this habit's active range (local dates). */
export function habitAppliesOnDate(habit: HabitForStats, dateStr: string): boolean {
  const from =
    normDate(habit.active_from ?? undefined) ??
    toLocalYMD(new Date(habit.created_at));
  const until = normDate(habit.active_until ?? undefined);
  if (dateStr < from) return false;
  if (until != null && dateStr > until) return false;
  return true;
}

/**
 * Per calendar day in the month: how many habits applied that day vs completed logs.
 * A habit applies only when date is within [active_from, active_until] (defaults from created_at).
 */
export function buildDailyCompletionMap(
  habits: HabitForStats[],
  monthLogs: MonthLogRow[],
  year: number,
  monthIndex: number
): Map<string, { completed: number; total: number }> {
  const map = new Map<string, { completed: number; total: number }>();
  const dim = daysInMonth(year, monthIndex);

  for (let d = 1; d <= dim; d++) {
    const dateStr = toLocalYMD(new Date(year, monthIndex, d));
    const applicable = new Set<string>();
    for (const h of habits) {
      if (habitAppliesOnDate(h, dateStr)) {
        applicable.add(h.id);
      }
    }
    const total = applicable.size;

    let completed = 0;
    if (total > 0) {
      for (const log of monthLogs) {
        if (
          log.date === dateStr &&
          log.completed &&
          applicable.has(log.habit_id)
        ) {
          completed++;
        }
      }
    }

    map.set(dateStr, { completed, total });
  }

  return map;
}
