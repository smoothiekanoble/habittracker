"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";

type MetricRow = {
  metric_date: string;
  metric_type: string;
  value: number | string;
  unit: string;
  source: string;
};

type DayMetrics = {
  date: string;
  sleepMinutes?: number;
  sleepScore?: number;
  weight?: number;
};

const LOOKBACK_DAYS = 28;

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNumber(value: number | string): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function formatSleep(minutes: number | null): string {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return `${hours}h ${remaining}m`;
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function shortError(message: string): string {
  if (/daily_metrics|schema cache|could not find the table/i.test(message)) {
    return "The metrics table is not connected yet. Apply the daily_metrics migration, then refresh.";
  }
  return message;
}

function buildDays(rows: MetricRow[]): DayMetrics[] {
  const byDate = new Map<string, DayMetrics>();
  for (const row of rows) {
    const value = toNumber(row.value);
    if (value === null) continue;
    const day = byDate.get(row.metric_date) ?? { date: row.metric_date };
    if (row.metric_type === "sleep_minutes") day.sleepMinutes = value;
    if (row.metric_type === "sleep_score") day.sleepScore = value;
    if (row.metric_type === "body_weight") day.weight = value;
    byDate.set(row.metric_date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function InsightCard({
  eyebrow,
  title,
  value,
  detail,
  tone,
}: {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  tone: "indigo" | "emerald" | "amber";
}) {
  const toneClass = {
    indigo: "border-indigo-100 bg-indigo-50/70",
    emerald: "border-emerald-100 bg-emerald-50/70",
    amber: "border-amber-100 bg-amber-50/70",
  }[tone];
  return (
    <article className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-sm font-medium text-zinc-700">{title}</h2>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-600">{detail}</p>
    </article>
  );
}

export function HealthInsightsPage() {
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let alive = true;
    const start = new Date();
    start.setDate(start.getDate() - (LOOKBACK_DAYS - 1));

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        if (alive) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const { data, error: queryError } = await supabase
        .from("daily_metrics")
        .select("metric_date,metric_type,value,unit,source")
        .eq("user_id", session.user.id)
        .gte("metric_date", localDateString(start))
        .lte("metric_date", localDateString(new Date()))
        .in("metric_type", ["sleep_minutes", "sleep_score", "body_weight"])
        .order("metric_date", { ascending: true });

      if (!alive) return;
      if (queryError) {
        setError(shortError(queryError.message));
        setRows([]);
      } else {
        setError(null);
        setRows((data ?? []) as MetricRow[]);
      }
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const days = useMemo(() => buildDays(rows), [rows]);
  const sleepDays = useMemo(() => days.filter((day) => day.sleepMinutes !== undefined), [days]);
  const weightDays = useMemo(() => days.filter((day) => day.weight !== undefined), [days]);
  const latestSleep = sleepDays.at(-1)?.sleepMinutes ?? null;
  const latestScore = sleepDays.at(-1)?.sleepScore ?? null;
  const latestWeight = weightDays.at(-1)?.weight ?? null;
  const averageSleep = average(
    sleepDays.flatMap((day) => (day.sleepMinutes === undefined ? [] : [day.sleepMinutes])),
  );
  const averageScore = average(
    sleepDays.flatMap((day) => (day.sleepScore === undefined ? [] : [day.sleepScore])),
  );
  const firstWeight = weightDays[0]?.weight ?? null;
  const weightChange = latestWeight !== null && firstWeight !== null ? latestWeight - firstWeight : null;
  const coverage = Math.round((sleepDays.length / LOOKBACK_DAYS) * 100);
  const chartDays = days.slice(-14);
  const maxSleep = Math.max(...chartDays.map((day) => day.sleepMinutes ?? 0), 1);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 pb-24 pt-8 sm:px-5">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-indigo-600">
              Personal dashboard
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Insights</h1>
            <p className="mt-1 max-w-sm text-sm leading-6 text-zinc-500">
              A small set of signals from your recent health data.
            </p>
          </div>
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500">
            28 days
          </span>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3" aria-label="Loading insights">
            <div className="h-32 animate-pulse rounded-2xl bg-zinc-200" />
            <div className="h-32 animate-pulse rounded-2xl bg-zinc-200" />
            <div className="h-64 animate-pulse rounded-2xl bg-zinc-200" />
          </div>
        ) : days.length === 0 && !error ? (
          <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl">✦</div>
            <h2 className="mt-4 text-base font-semibold text-zinc-900">Your dashboard is ready</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-zinc-500">
              Sleep and weight insights will appear here after Garmin or MedM sends data to Supabase.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2">
              <InsightCard
                eyebrow="Last sleep"
                title="Sleep duration"
                value={formatSleep(latestSleep)}
                detail={latestSleep === null ? "No recent sleep reading" : `28-day average ${formatSleep(averageSleep)}`}
                tone="indigo"
              />
              <InsightCard
                eyebrow="Sleep quality"
                title="Sleep score"
                value={latestScore === null ? "—" : `${Math.round(latestScore)}`}
                detail={averageScore === null ? "No score readings yet" : `28-day average ${Math.round(averageScore)}`}
                tone="emerald"
              />
              <InsightCard
                eyebrow="Weight"
                title="Latest reading"
                value={latestWeight === null ? "—" : `${latestWeight.toFixed(1)} lb`}
                detail={weightChange === null ? "No trend yet" : `${weightChange >= 0 ? "+" : ""}${weightChange.toFixed(1)} lb across available readings`}
                tone="amber"
              />
              <InsightCard
                eyebrow="Trust signal"
                title="Sleep data coverage"
                value={`${coverage}%`}
                detail={`${sleepDays.length} of ${LOOKBACK_DAYS} days have a sleep reading`}
                tone="indigo"
              />
            </section>

            <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">Sleep trend</p>
                  <h2 className="mt-1 text-base font-semibold text-zinc-900">Recent nights</h2>
                </div>
                <span className="text-xs text-zinc-400">hours</span>
              </div>
              <div className="mt-5 flex h-36 items-end gap-1.5">
                {chartDays.map((day) => {
                  const minutes = day.sleepMinutes ?? 0;
                  const height = minutes ? Math.max(10, (minutes / maxSleep) * 100) : 4;
                  return (
                    <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <div
                        className={`w-full rounded-t-md ${minutes ? "bg-indigo-400" : "bg-zinc-200"}`}
                        style={{ height: `${height}%` }}
                        title={minutes ? `${formatDate(day.date)}: ${formatSleep(minutes)}` : `${formatDate(day.date)}: no data`}
                      />
                      <span className="text-[10px] text-zinc-400">{formatDate(day.date).split(" ")[1]}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs leading-5 text-zinc-500">
                This is descriptive data, not a health score. More consistent days make the trend more useful.
              </p>
            </section>

            <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">Data sources</p>
                  <h2 className="mt-1 text-base font-semibold text-zinc-900">What is informing this view</h2>
                </div>
                <span className="text-xs text-zinc-400">{rows.length} values</span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <span className="text-zinc-600">Sleep</span>
                  <span className="font-medium text-zinc-900">Garmin · {sleepDays.length} days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Weight</span>
                  <span className="font-medium text-zinc-900">MedM · {weightDays.length} readings</span>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
