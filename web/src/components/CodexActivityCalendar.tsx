"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMonthGrid, WEEKDAY_INITIALS_SUN_FIRST } from "@/lib/calendar";
import { createClient } from "@/lib/supabase";

type CodexDailyUsageStat = {
  date: string;
  local_thread_count: number;
  local_turn_count: number;
  status: "ok" | "error";
  error_message: string | null;
};

function formatLoadError(message: string): string {
  if (/codex_daily_usage_stats|schema cache|could not find the table/i.test(message)) {
    return "Codex activity table is not in Supabase yet. Run the codex_daily_usage_stats migration, then refresh this page.";
  }
  return message;
}

function longDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function monthBounds(year: number, monthIndex: number) {
  const start = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const end = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

function intensityClass(turns: number, peak: number): string {
  if (turns <= 0 || peak <= 0) return "bg-zinc-100 border-zinc-200";
  const ratio = turns / peak;
  if (ratio >= 0.75) return "bg-indigo-700 border-indigo-700";
  if (ratio >= 0.45) return "bg-indigo-500 border-indigo-500";
  if (ratio >= 0.2) return "bg-indigo-300 border-indigo-300";
  return "bg-indigo-100 border-indigo-200";
}

export function CodexActivityCalendar() {
  const [stats, setStats] = useState<CodexDailyUsageStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const supabase = createClient();

  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const todayStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const { start, end } = monthBounds(year, monthIndex);

  useEffect(() => {
    let alive = true;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        if (alive) {
          setStats([]);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("codex_daily_usage_stats")
        .select("date,local_thread_count,local_turn_count,status,error_message")
        .eq("user_id", session.user.id)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });

      if (!alive) return;
      if (error) {
        setLoadError(formatLoadError(error.message));
        setStats([]);
      } else {
        setLoadError(null);
        setStats((data ?? []) as CodexDailyUsageStat[]);
      }
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [end, start, supabase]);

  const statsByDate = useMemo(
    () => new Map(stats.map((row) => [row.date, row])),
    [stats]
  );
  const monthTotal = stats.reduce((sum, row) => sum + row.local_turn_count, 0);
  const todayTurns = statsByDate.get(todayStr)?.local_turn_count ?? 0;
  const peak = stats.reduce((max, row) => Math.max(max, row.local_turn_count), 0);
  const peakDay = stats.find((row) => row.local_turn_count === peak && peak > 0);
  const grid = buildMonthGrid(year, monthIndex, "sunday");

  return (
    <section className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-zinc-500">
          Local activity
        </p>
        <h2 className="mt-0.5 text-base font-semibold text-zinc-900">Codex calendar</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          {loading
            ? "Loading local usage..."
            : `${todayTurns} turns today, ${monthTotal} this month${
                peakDay ? `, peak ${peakDay.local_turn_count} on ${longDateLabel(peakDay.date)}` : ""
              }`}
        </p>
      </div>

      {loadError && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_INITIALS_SUN_FIRST.map((day, index) => (
          <div
            key={`${day}-${index}`}
            className="flex h-5 items-center justify-center text-[10px] font-medium text-zinc-500"
          >
            {day}
          </div>
        ))}
        {grid.map((cell) => {
          if (!cell.inMonth || !cell.dateStr) {
            return <div key={cell.key} className="aspect-square" aria-hidden />;
          }

          const row = statsByDate.get(cell.dateStr);
          const turns = row?.local_turn_count ?? 0;
          const threads = row?.local_thread_count ?? 0;
          const isToday = cell.dateStr === todayStr;

          return (
            <div
              key={cell.key}
              className={[
                "aspect-square rounded-md border transition-colors",
                intensityClass(turns, peak),
                isToday ? "ring-2 ring-zinc-700 ring-offset-1 ring-offset-white" : "",
              ].join(" ")}
              aria-label={`${longDateLabel(cell.dateStr)}, ${turns} Codex turns, ${threads} threads`}
              title={`${longDateLabel(cell.dateStr)}: ${turns} turns, ${threads} threads`}
            />
          );
        })}
      </div>

      {!loading && stats.length === 0 && !loadError && (
        <p className="mt-3 text-sm text-zinc-500">
          Run the importer to start collecting daily Codex activity.
        </p>
      )}
    </section>
  );
}
