"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TodayHabitRow } from "@/components/TodayHabitRow";
import { TodayMonthBucketCalendar } from "@/components/TodayMonthBucketCalendar";
import { toLocalYMD } from "@/lib/calendar";
import { buildDailyCompletionMap, habitAppliesOnDate } from "@/lib/today-month-stats";
import { createClient, type Habit, type HabitLog } from "@/lib/supabase";

const todayDate = () => toLocalYMD(new Date());

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
  const supabase = createClient();

  const calendarNow = new Date();
  const viewYear = calendarNow.getFullYear();
  const viewMonthIndex = calendarNow.getMonth();
  const todayStr = todayDate();

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
      const { start, end } = monthBounds(new Date());

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
        setLogs(monthRows.filter((l) => l.date === today));
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

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
    if (existing) {
      const { error } = await supabase
        .from("habit_logs")
        .delete()
        .eq("id", existing.id);
      if (error) return;
      setLogs((prev) => prev.filter((l) => l.id !== existing.id));
      setMonthLogs((prev) => prev.filter((l) => l.id !== existing.id));
    } else {
      const { data, error } = await supabase
        .from("habit_logs")
        .insert({ habit_id: habit.id, date: today, completed: true })
        .select()
        .single();
      if (error || !data) return;
      setLogs((prev) => [...prev, data]);
      setMonthLogs((prev) => [...prev, data]);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-500">Loading…</p>
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
              If the table is missing, open Supabase → SQL Editor and run the files in{" "}
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
              />
            </div>
          </aside>

          <div className="order-2 mx-auto w-full max-w-lg shrink-0 lg:mx-0 lg:ml-0">
            <header className="flex items-center justify-between py-2 lg:py-4">
              <h1 className="text-xl font-semibold">Today</h1>
              <Link
                href="/habits/new"
                className="p-2 rounded-full bg-zinc-200 hover:bg-zinc-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Add habit"
              >
                +
              </Link>
            </header>
            <p className="text-zinc-500 text-sm mb-4">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </p>
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
              <ul className="space-y-3">
                {habitsActiveToday.map((habit) => (
                  <li key={habit.id} className="list-none">
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

      <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-200 bg-white p-2 flex gap-2 justify-center">
        <Link
          href="/"
          className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium"
        >
          Today
        </Link>
        <Link
          href="/habits"
          className="px-4 py-2 rounded-lg text-zinc-600 text-sm font-medium hover:bg-zinc-100"
        >
          Habits
        </Link>
      </nav>
    </div>
  );
}
