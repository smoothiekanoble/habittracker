"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { TodayHabitRow } from "@/components/TodayHabitRow";
import { TodayMonthBucketCalendar } from "@/components/TodayMonthBucketCalendar";
import { CodexUsageWidget } from "@/components/CodexUsageWidget";
import { toLocalYMD } from "@/lib/calendar";
import { buildDailyCompletionMap, habitAppliesOnDate } from "@/lib/today-month-stats";
import { createClient, type Habit, type HabitLog } from "@/lib/supabase";

const todayDate = () => toLocalYMD(new Date());

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

function monthBounds(d: Date): { start: string; end: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    start: toLocalYMD(new Date(y, m, 1)),
    end: toLocalYMD(new Date(y, m + 1, 0)),
  };
}

export function TodayPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [monthLogs, setMonthLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const supabase = createClient();

  const viewYear = calendarMonth.getFullYear();
  const viewMonthIndex = calendarMonth.getMonth();
  const todayStr = todayDate();
  const todayMonth = new Date();
  const isViewingCurrentMonth =
    viewYear === todayMonth.getFullYear() && viewMonthIndex === todayMonth.getMonth();

  const statsByDate = useMemo(
    () =>
      buildDailyCompletionMap(habits, monthLogs, viewYear, viewMonthIndex),
    [habits, monthLogs, viewYear, viewMonthIndex]
  );

  const habitsActiveToday = useMemo(
    () => habits.filter((h) => habitAppliesOnDate(h, todayStr)),
    [habits, todayStr]
  );

  const completedIds = useMemo(() => {
    const ids = new Set(habitsActiveToday.map((h) => h.id));
    return new Set(
      logs.filter((l) => ids.has(l.habit_id)).map((l) => l.habit_id)
    );
  }, [logs, habitsActiveToday]);

  const pendingHabits = useMemo(
    () => habitsActiveToday.filter((habit) => !completedIds.has(habit.id)),
    [habitsActiveToday, completedIds]
  );

  const completedHabits = useMemo(
    () => habitsActiveToday.filter((habit) => completedIds.has(habit.id)),
    [habitsActiveToday, completedIds]
  );

  const load = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setHabits([]);
        setLogs([]);
        setMonthLogs([]);
        return;
      }
      setLoadError(null);
      const { data: habitsData, error: habitsError } = await supabase
        .from("habits")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (habitsError) {
        setLoadError(habitsError.message);
        setHabits([]);
        setLogs([]);
        setMonthLogs([]);
        return;
      }
      const habitList = habitsData ?? [];
      setHabits(habitList);
      const today = todayDate();
      const { start, end } = monthBounds(calendarMonth);

      if (habitList.length === 0) {
        setLogs([]);
        setMonthLogs([]);
      } else {
        const ids = habitList.map((h) => h.id);
        const { data: monthData, error: monthError } = await supabase
          .from("habit_logs")
          .select("*")
          .eq("completed", true)
          .gte("date", start)
          .lte("date", end)
          .in("habit_id", ids);
        if (monthError) {
          setLoadError(monthError.message);
          setLogs([]);
          setMonthLogs([]);
          return;
        }
        const monthRows = monthData ?? [];
        setMonthLogs(monthRows);
        if (today >= start && today <= end) {
          setLogs(monthRows.filter((l) => l.date === today));
        } else {
          const { data: todayData, error: todayError } = await supabase
            .from("habit_logs")
            .select("*")
            .eq("completed", true)
            .eq("date", today)
            .in("habit_id", ids);
          if (todayError) {
            setLoadError(todayError.message);
            setLogs([]);
            return;
          }
          setLogs(todayData ?? []);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [calendarMonth, supabase]);

  useEffect(() => {
    load();
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) load();
      else {
        setHabits([]);
        setLogs([]);
        setMonthLogs([]);
        setLoading(false);
      }
    });
    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, [load, supabase.auth]);

  async function toggle(habit: Habit) {
    const today = todayDate();
    const existing = logs.find((l) => l.habit_id === habit.id);
    const updateWithTransition = (update: () => void) => {
      const transition = (document as ViewTransitionDocument).startViewTransition;
      if (transition) {
        transition.call(document, () => flushSync(update));
      } else {
        update();
      }
    };

    if (existing) {
      const { error } = await supabase
        .from("habit_logs")
        .delete()
        .eq("id", existing.id);
      if (error) return;
      updateWithTransition(() => {
        setLogs((prev) => prev.filter((l) => l.id !== existing.id));
        setMonthLogs((prev) => prev.filter((l) => l.id !== existing.id));
      });
    } else {
      const { data, error } = await supabase
        .from("habit_logs")
        .insert({ habit_id: habit.id, date: today, completed: true })
        .select()
        .single();
      if (error || !data) return;
      updateWithTransition(() => {
        setLogs((prev) => [...prev, data]);
        setMonthLogs((prev) => [...prev, data]);
      });
    }
  }

  function previousCalendarMonth() {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  function nextCalendarMonth() {
    setCalendarMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      const now = new Date();
      if (
        next.getFullYear() > now.getFullYear() ||
        (next.getFullYear() === now.getFullYear() && next.getMonth() > now.getMonth())
      ) {
        return new Date(now.getFullYear(), now.getMonth(), 1);
      }
      return next;
    });
  }

  function jumpToCurrentCalendarMonth() {
    const now = new Date();
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 px-4 sm:px-5">
      <div className="mx-auto max-w-6xl">
        {loadError && (
          <div className="mb-4 max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 lg:ml-auto lg:mr-0">
            <p className="font-medium">Could not load habits</p>
            <p className="mt-1">{loadError}</p>
            <p className="mt-2 text-red-700">
              If the table is missing, open Supabase SQL Editor and run the files in{" "}
              <code className="bg-red-100 px-1 rounded">supabase/migrations/</code>.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1 pt-0 lg:flex-row lg:items-start lg:justify-end lg:gap-4">
          <aside className="order-1 flex min-w-0 w-full flex-1 justify-center lg:max-w-none lg:justify-end lg:pr-2">
            <div className="w-full max-w-[min(100%,22rem)] origin-top scale-90 lg:max-w-none lg:origin-top-right -mb-6 sm:-mb-7 lg:-mb-5 lg:mr-1">
              <TodayMonthBucketCalendar
                year={viewYear}
                monthIndex={viewMonthIndex}
                statsByDate={statsByDate}
                todayStr={todayStr}
                canGoNext={!isViewingCurrentMonth}
                onPrevMonth={previousCalendarMonth}
                onNextMonth={nextCalendarMonth}
                onThisMonth={jumpToCurrentCalendarMonth}
              />
            </div>
          </aside>

          <div className="order-2 mx-auto w-full max-w-lg shrink-0 lg:mx-0 lg:ml-0">
            <div className="sticky top-0 z-10 -mx-4 mb-4 bg-zinc-50/95 px-4 pb-4 pt-2 shadow-[0_16px_22px_-24px_rgba(24,24,27,0.55)] backdrop-blur sm:-mx-5 sm:px-5 lg:top-0 lg:py-4">
              <header className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold">Today</h1>
                  <p className="mt-1 text-zinc-500 text-sm">
                    {new Date().toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <Link
                  href="/habits/new"
                  className="p-2 rounded-full bg-zinc-200 hover:bg-zinc-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Add habit"
                >
                  +
                </Link>
              </header>
            </div>
            <CodexUsageWidget />
            {habits.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <p>No habits yet.</p>
                <Link
                  href="/habits/new"
                  className="text-indigo-600 underline mt-2 inline-block"
                >
                  Add your first habit
                </Link>
              </div>
            ) : habitsActiveToday.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-sm">
                <p>No habits are active today.</p>
                <p className="mt-2">
                  Adjust <span className="text-zinc-600">Counts from / until</span> on the{" "}
                  <Link href="/habits" className="text-indigo-600 underline">
                    Habits
                  </Link>{" "}
                  screen if you meant to track something today.
                </p>
              </div>
            ) : (
              <ul className="today-habit-list-fade space-y-3">
                {[...pendingHabits, ...completedHabits].map((habit) => (
                  <li
                    key={habit.id}
                    className="today-habit-list-item list-none"
                    style={{ viewTransitionName: `today-habit-${habit.id}` }}
                  >
                    <TodayHabitRow
                      habit={habit}
                      completed={completedIds.has(habit.id)}
                      onToggle={() => toggle(habit)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
