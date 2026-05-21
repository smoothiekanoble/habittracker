"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { HabitIcon } from "@/components/HabitIcon";
import { HabitExpandedMonthPanel } from "@/components/HabitExpandedMonthPanel";
import { formatMonthYear } from "@/lib/calendar";
import { createClient, type Habit } from "@/lib/supabase";

export function HabitsListPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonthIndex, setViewMonthIndex] = useState(() => new Date().getMonth());
  const supabase = createClient();

  const today = new Date();
  const isViewingCurrentMonth =
    viewYear === today.getFullYear() && viewMonthIndex === today.getMonth();

  function globalPrevMonth() {
    if (viewMonthIndex === 0) {
      setViewMonthIndex(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonthIndex((m) => m - 1);
    }
  }

  function globalNextMonth() {
    if (viewMonthIndex === 11) {
      setViewMonthIndex(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonthIndex((m) => m + 1);
    }
  }

  function jumpToThisMonth() {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonthIndex(t.getMonth());
  }

  useEffect(() => {
    const valid = new Set(habits.map((h) => h.id));
    setCollapsedIds((prev) => new Set([...prev].filter((id) => valid.has(id))));
  }, [habits]);

  const load = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setHabits([]);
        return;
      }
      const { data, error } = await supabase
        .from("habits")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) {
        console.error(error);
        setHabits([]);
        return;
      }
      setHabits(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) load();
      else setHabits([]);
    });
    return () => sub.data.subscription.unsubscribe();
  }, [load, supabase.auth]);

  function toggleRow(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen px-3 py-4 pb-24 sm:px-4">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-xl font-semibold">Habits</h1>
        <Link
          href="/habits/new"
          className="p-2 rounded-full bg-zinc-200 hover:bg-zinc-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Add habit"
        >
          +
        </Link>
      </header>
      {habits.length === 0 ? (
        <p className="text-zinc-500">
          No habits.{" "}
          <Link href="/habits/new" className="text-indigo-600 underline">
            Add one
          </Link>
          .
        </p>
      ) : (
        <>
          <section
            className="mb-3 rounded-xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/90 p-2 shadow-sm"
            aria-label="Month for all habit calendars"
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={globalPrevMonth}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-lg text-zinc-700 shadow-sm hover:bg-zinc-50 active:bg-zinc-100"
                aria-label="Previous month"
              >
                &lsaquo;
              </button>
              <div className="min-w-0 flex-1 flex flex-col items-center justify-center py-1 text-center">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Month
                </p>
                <p className="text-sm font-semibold text-zinc-900 leading-tight">
                  {formatMonthYear(viewYear, viewMonthIndex)}
                </p>
                {!isViewingCurrentMonth && (
                  <button
                    type="button"
                    onClick={jumpToThisMonth}
                    className="mt-1 text-[11px] font-medium text-indigo-600 hover:underline"
                  >
                    Back to this month
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={globalNextMonth}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-lg text-zinc-700 shadow-sm hover:bg-zinc-50 active:bg-zinc-100"
                aria-label="Next month"
              >
                &rsaquo;
              </button>
            </div>
          </section>
          <ul className="space-y-2">
            {habits.map((habit) => {
              const expanded = !collapsedIds.has(habit.id);
              const accent = habit.color || "#6366f1";
              return (
                <li
                  key={habit.id}
                  className="overflow-hidden rounded-xl border shadow-sm"
                  style={
                    {
                      borderColor: `color-mix(in srgb, ${accent} 22%, #e4e4e7)`,
                      background: `linear-gradient(145deg, color-mix(in srgb, ${accent} 13%, white) 0%, white 58%, color-mix(in srgb, ${accent} 8%, white) 100%)`,
                    } as CSSProperties
                  }
                >
                  <button
                    type="button"
                    id={`habit-trigger-${habit.id}`}
                    aria-expanded={expanded}
                    aria-controls={`habit-panel-${habit.id}`}
                    onClick={() => toggleRow(habit.id)}
                    className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/45 active:bg-white/65"
                  >
                    <span
                      className="pointer-events-none flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white shadow-sm"
                      style={{
                        backgroundColor: accent,
                        boxShadow: `0 8px 18px -10px ${accent}`,
                      }}
                    >
                      <HabitIcon icon={habit.icon} className="h-[18px] w-[18px]" />
                    </span>
                    <span className="pointer-events-none min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-zinc-900">
                        {habit.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-medium text-zinc-500">
                        {expanded ? "Hide history" : "Show history"}
                      </span>
                    </span>
                    <span
                      className={[
                        "pointer-events-none text-lg leading-none text-zinc-500 transition-transform",
                        expanded ? "rotate-90" : "",
                      ].join(" ")}
                      aria-hidden
                    >
                      &rsaquo;
                    </span>
                  </button>
                  {expanded && (
                    <div
                      id={`habit-panel-${habit.id}`}
                      role="region"
                      aria-labelledby={`habit-trigger-${habit.id}`}
                      className="habit-calendar-reveal-inner border-t border-white/70 bg-white/40"
                    >
                      <HabitExpandedMonthPanel
                        habitId={habit.id}
                        accentColor={accent}
                        activeFrom={habit.active_from}
                        activeUntil={habit.active_until}
                        compact
                        viewYear={viewYear}
                        viewMonthIndex={viewMonthIndex}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
