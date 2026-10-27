"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase";
import {
  calendar,
  dateKey,
  deviation,
  displayValue,
  last,
  mean,
  metricSeries,
  MetricRow,
  prettyMetric,
  shiftDay,
  shortDate,
  values,
  WeightUnit,
} from "@/lib/health-insights";
import {
  ChartEmpty,
  ScatterChart,
  StageChart,
  TrendChart,
} from "./HealthCharts";

const MODULES = [
  {
    id: "sleep",
    title: "Sleep duration",
    note: "Nightly sleep and the direction of your week",
    wide: true,
  },
  {
    id: "weight",
    title: "Body weight",
    note: "Daily variation beside the slower trend",
    wide: true,
  },
  {
    id: "score",
    title: "Sleep score",
    note: "Garmin’s estimate, in your own context",
  },
  {
    id: "stages",
    title: "Sleep architecture",
    note: "How each night breaks down",
  },
  {
    id: "consistency",
    title: "Sleep consistency",
    note: "Duration variability and days of the week",
  },
  {
    id: "heart",
    title: "Resting heart rate",
    note: "Daily resting heart rate reported by Garmin",
  },
  {
    id: "steps",
    title: "Steps",
    note: "Daily total from Garmin Connect",
  },
  {
    id: "calories",
    title: "Calories burned",
    note: "Total and active energy estimates from Garmin",
  },
  {
    id: "daily-stress",
    title: "Daily stress",
    note: "Garmin’s daily stress estimate",
  },
  {
    id: "stress",
    title: "Overnight stress",
    note: "Garmin’s overnight stress estimate",
  },
  {
    id: "relationship",
    title: "Duration × score",
    note: "Explore paired nights",
  },
  {
    id: "coverage",
    title: "Data coverage",
    note: "What is available, missing, or stale",
    wide: true,
  },
  {
    id: "explorer",
    title: "Metric explorer",
    note: "Every imported metric, including future integrations",
    wide: true,
  },
] as const;
type ModuleId = (typeof MODULES)[number]["id"];
type Settings = {
  order: ModuleId[];
  hidden: ModuleId[];
  range: number;
  unit: WeightUnit;
  target: number;
  averages: boolean;
  bars: boolean;
};
const DEFAULTS: Settings = {
  order: MODULES.map((m) => m.id),
  hidden: [],
  range: 90,
  unit: "lb",
  target: 8,
  averages: true,
  bars: false,
};
const control =
  "min-h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600";

function readSettings(key: string): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!saved || typeof saved !== "object") return DEFAULTS;
    const valid = (id: ModuleId) => MODULES.some((m) => m.id === id);
    const order: ModuleId[] = Array.isArray(saved.order)
      ? [...new Set<ModuleId>(saved.order.filter(valid))]
      : [];
    return {
      ...DEFAULTS,
      order: [...order, ...DEFAULTS.order.filter((id) => !order.includes(id))],
      hidden: Array.isArray(saved.hidden) ? saved.hidden.filter(valid) : [],
      range: [28, 90, 180, 0].includes(saved.range) ? saved.range : 90,
      unit: saved.unit === "kg" ? "kg" : "lb",
      target:
        Number.isFinite(saved.target) && saved.target >= 1 && saved.target <= 16
          ? saved.target
          : 8,
      averages: saved.averages !== false,
      bars: saved.bars === true,
    };
  } catch {
    return DEFAULTS;
  }
}

export function HealthInsightsPage() {
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    async function load() {
      setRefreshing(true);
      try {
        const supabase = createClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user)
          throw new Error(
            "Your session has expired. Sign in again to load Insights.",
          );
        const collected: MetricRow[] = [];
        // Supabase defaults to 1,000 rows; a full Garmin backfill exceeds that.
        for (let offset = 0; ; offset += 500) {
          const { data, error: queryError } = await supabase
            .from("daily_metrics")
            .select("id,metric_date,metric_type,value,unit,source,updated_at")
            .eq("user_id", user.id)
            .lte("metric_date", dateKey(new Date()))
            .order("metric_date", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + 499);
          if (queryError) throw queryError;
          if (!alive) return;
          collected.push(...((data ?? []) as MetricRow[]));
          if ((data?.length ?? 0) < 500) break;
        }
        if (alive) {
          setRows(collected);
          setUserId(user.id);
          setError(null);
        }
      } catch (reason) {
        if (alive)
          setError(
            reason instanceof Error
              ? reason.message
              : String(
                  (reason as { message?: string })?.message ??
                    "Could not load measurements. Try refreshing.",
                ),
          );
      } finally {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [revision]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return (
    <InsightsDashboard
      rows={rows}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRefresh={refresh}
      preferenceKey={userId ? `health-dashboard-v2:${userId}` : null}
    />
  );
}

export function InsightsDashboard({
  rows,
  loading = false,
  refreshing = false,
  error = null,
  onRefresh,
  preferenceKey,
}: {
  rows: MetricRow[];
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  onRefresh: () => void;
  preferenceKey: string | null;
}) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [explorer, setExplorer] = useState("");
  const [explorerSource, setExplorerSource] = useState("");
  const [tableOpen, setTableOpen] = useState(false);
  useEffect(() => {
    if (preferenceKey) {
      setSettings(readSettings(preferenceKey));
      setLoadedKey(preferenceKey);
    }
  }, [preferenceKey]);
  useEffect(() => {
    if (preferenceKey && loadedKey === preferenceKey) {
      try {
        localStorage.setItem(preferenceKey, JSON.stringify(settings));
      } catch {
        /* Browser may disable storage. */
      }
    }
  }, [settings, preferenceKey, loadedKey]);
  const today = dateKey(new Date());
  const firstDate = rows.reduce(
    (first, row) => (row.metric_date < first ? row.metric_date : first),
    today,
  );
  const start = settings.range
    ? shiftDay(today, -(settings.range - 1))
    : firstDate;
  const dates = useMemo(() => calendar(start, today), [start, today]);
  const series = (type: string) =>
    metricSeries(rows, type, dates, settings.unit);
  const sleep = series("sleep_minutes"),
    weight = series("body_weight"),
    score = series("sleep_score");
  const lastSleep = last(sleep),
    lastWeight = last(weight),
    lastScore = last(score);
  const recentDates = calendar(shiftDay(today, -6), today);
  const previousDates = calendar(shiftDay(today, -13), shiftDay(today, -7));
  const recentMean = (type: string) =>
    mean(values(metricSeries(rows, type, recentDates, settings.unit)));
  const previousMean = (type: string) =>
    mean(values(metricSeries(rows, type, previousDates, settings.unit)));
  const weeklyWeight = recentMean("body_weight"),
    priorWeight = previousMean("body_weight");
  const weightDelta =
    weeklyWeight === null || priorWeight === null
      ? null
      : weeklyWeight - priorWeight;
  const sleepValues = values(sleep),
    variability = deviation(sleepValues);
  const inventory = [...new Set(rows.map((row) => row.metric_type))].sort();
  const explorerType = inventory.includes(explorer)
    ? explorer
    : (inventory[0] ?? "sleep_minutes");
  const sources = [
    ...new Set(
      rows
        .filter((row) => row.metric_type === explorerType)
        .map((row) => row.source),
    ),
  ].sort();
  const selectedSource = sources.includes(explorerSource)
    ? explorerSource
    : sources[0];
  const explorerRows = rows.filter(
    (row) => row.metric_type === explorerType && row.source === selectedSource,
  );
  const explorerUnit =
    explorerType === "body_weight"
      ? settings.unit
      : (explorerRows[0]?.unit ?? "");
  const selectedRows = rows.filter(
    (row) => row.metric_date >= start && row.metric_date <= today,
  );
  const updated = rows.reduce(
    (latest, row) => (row.updated_at > latest ? row.updated_at : latest),
    "",
  );
  function patch(update: Partial<Settings>) {
    setSettings((current) => ({ ...current, ...update }));
  }
  function move(id: ModuleId, direction: number) {
    const order = [...settings.order],
      index = order.indexOf(id),
      destination = index + direction;
    if (destination < 0 || destination >= order.length) return;
    [order[index], order[destination]] = [order[destination], order[index]];
    patch({ order });
  }
  const unitFor = (type: string) =>
    type === "body_weight"
      ? settings.unit
      : (rows.find((row) => row.metric_type === type)?.unit ?? "");
  const chart = (type: string, color: string, target?: number) => (
    <TrendChart
      points={series(type)}
      unit={unitFor(type)}
      label={prettyMetric(type)}
      color={color}
      average={settings.averages}
      mode={settings.bars ? "bars" : "line"}
      target={target}
    />
  );

  function moduleBody(id: ModuleId): ReactNode {
    switch (id) {
      case "sleep":
        return (
          <>
            <div className="mb-5 flex flex-wrap items-end gap-8">
              <BigNumber
                value={displayValue(mean(sleepValues), "minutes")}
                label={`Average · ${sleepValues.length}/${dates.length} nights`}
              />
              <BigNumber
                value={displayValue(recentMean("sleep_minutes"), "minutes")}
                label="Last 7 calendar days"
              />
              <div className="ml-auto text-xs text-zinc-500">
                {
                  sleepValues.filter((value) => value >= settings.target * 60)
                    .length
                }{" "}
                of {sleepValues.length} measured nights met your target
              </div>
            </div>
            {chart("sleep_minutes", "#0d9488", settings.target * 60)}
          </>
        );
      case "weight": {
        const recentCount = values(
          metricSeries(rows, "body_weight", recentDates, settings.unit),
        ).length;
        const priorCount = values(
          metricSeries(rows, "body_weight", previousDates, settings.unit),
        ).length;
        return (
          <>
            <div className="mb-5 flex flex-wrap gap-8">
              <BigNumber
                value={displayValue(weeklyWeight, settings.unit)}
                label={`Last 7 days · ${recentCount} weigh-ins`}
              />
              <BigNumber
                value={
                  weightDelta === null
                    ? "—"
                    : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} ${settings.unit}`
                }
                label={`vs previous 7 days · ${priorCount} weigh-ins`}
              />
            </div>
            {chart("body_weight", "#d97706")}
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Calendar-week averages help separate direction from daily
              fluctuation. No interpolation across missing weigh-ins.
            </p>
          </>
        );
      }
      case "score":
        return chart("sleep_score", "#6366f1");
      case "stages":
        return (
          <StageChart
            series={[
              {
                label: "Deep",
                color: "#312e81",
                points: series("deep_sleep_minutes"),
              },
              {
                label: "Light",
                color: "#a5b4fc",
                points: series("light_sleep_minutes"),
              },
              {
                label: "REM",
                color: "#2dd4bf",
                points: series("rem_sleep_minutes"),
              },
              {
                label: "Awake",
                color: "#fbbf24",
                points: series("awake_minutes"),
              },
            ]}
          />
        );
      case "heart":
        return chart("resting_hr", "#e11d48");
      case "steps":
        return chart("steps", "#16a34a");
      case "calories":
        return (
          <>
            {chart("calories_burned", "#ea580c")}
            <div className="mt-6 border-t border-zinc-100 pt-5">
              <h3 className="mb-3 text-sm font-medium text-zinc-700">
                Active calories
              </h3>
              {chart("active_calories_burned", "#f97316")}
            </div>
          </>
        );
      case "daily-stress":
        return chart("daily_stress", "#a21caf");
      case "stress":
        return chart("avg_sleep_stress", "#c026d3");
      case "relationship":
        return <ScatterChart xPoints={sleep} yPoints={score} />;
      case "consistency":
        return sleepValues.length ? (
          <>
            <div className="mb-5 flex gap-8">
              <BigNumber
                value={
                  variability === null ? "—" : `±${Math.round(variability)}m`
                }
                label="Duration standard deviation"
              />
              <BigNumber
                value={displayValue(mean(sleepValues), "minutes")}
                label="Your average in this range"
              />
            </div>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
                const readings = sleep.filter(
                  (p) =>
                    new Date(`${p.date}T12:00:00`).getDay() === weekday &&
                    p.value !== null,
                );
                const avg = mean(values(readings));
                return (
                  <div
                    key={weekday}
                    className="grid grid-cols-[2rem_1fr_6rem] items-center gap-3 text-xs"
                  >
                    <span className="text-zinc-500">
                      {
                        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                          weekday
                        ]
                      }
                    </span>
                    <div className="h-2 rounded bg-zinc-100">
                      <div
                        className="h-2 rounded bg-teal-500"
                        style={{
                          width: `${avg === null ? 0 : (avg / Math.max(...sleepValues)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-right tabular-nums">
                      {displayValue(avg, "minutes")}{" "}
                      <span className="text-zinc-400">({readings.length})</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-5 text-xs leading-5 text-zinc-500">
              Lower variability means steadier duration. This doesn’t measure
              bedtime consistency; bedtime timestamps aren’t imported.
            </p>
          </>
        ) : (
          <ChartEmpty />
        );
      case "coverage":
        return (
          <div className="overflow-x-auto" data-swipe-ignore>
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs text-zinc-400">
                  <th className="pb-3 font-medium">Metric</th>
                  <th className="pb-3 font-medium">Coverage in range</th>
                  <th className="pb-3 font-medium">Latest in range</th>
                  <th className="pb-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((type) => {
                  const points = series(type),
                    count = values(points).length,
                    latest = last(points);
                  return (
                    <tr
                      key={type}
                      className="border-b border-zinc-100 last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium text-zinc-700">
                        {prettyMetric(type)}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="tabular-nums">
                          {count}/{dates.length}
                        </span>
                        <span className="ml-2 text-xs text-zinc-400">
                          {Math.round((count / dates.length) * 100)}%
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-zinc-500">
                        {latest ? shortDate(latest.date) : "No data"}
                      </td>
                      <td className="py-3 text-xs text-zinc-500">
                        {[
                          ...new Set(
                            rows
                              .filter((row) => row.metric_type === type)
                              .map((row) => row.source),
                          ),
                        ].join(", ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-4 text-xs text-zinc-400">
              Coverage measures days with a value, not whether that measurement
              is accurate. Optional metrics may never be available on your
              watch.
            </p>
          </div>
        );
      case "explorer":
        return (
          <>
            <div className="mb-5 flex flex-wrap gap-2" data-swipe-ignore>
              <label className="sr-only" htmlFor="metric-picker">
                Metric
              </label>
              <select
                id="metric-picker"
                className={control}
                value={explorerType}
                onChange={(event) => {
                  setExplorer(event.target.value);
                  setExplorerSource("");
                }}
              >
                {inventory.map((type) => (
                  <option key={type} value={type}>
                    {prettyMetric(type)}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="source-picker">
                Source
              </label>
              <select
                id="source-picker"
                className={control}
                value={selectedSource ?? ""}
                onChange={(event) => setExplorerSource(event.target.value)}
              >
                {sources.map((source) => (
                  <option key={source}>{source}</option>
                ))}
              </select>
              <button
                className={`${control} ml-auto`}
                aria-expanded={tableOpen}
                onClick={() => setTableOpen(!tableOpen)}
              >
                {tableOpen ? "Hide readings" : "View readings"}
              </button>
            </div>
            <TrendChart
              points={metricSeries(
                rows,
                explorerType,
                dates,
                settings.unit,
                selectedSource,
              )}
              unit={explorerUnit}
              label={prettyMetric(explorerType)}
              average={settings.averages}
              mode={settings.bars ? "bars" : "line"}
            />
            {tableOpen && (
              <div className="mt-4 max-h-72 overflow-auto" data-swipe-ignore>
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className="py-2">Date</th>
                      <th>Value</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {explorerRows
                      .filter((row) => row.metric_date >= start)
                      .slice()
                      .reverse()
                      .map((row) => (
                        <tr key={row.id} className="border-t border-zinc-100">
                          <td className="py-2">{row.metric_date}</td>
                          <td>{displayValue(Number(row.value), row.unit)}</td>
                          <td className="text-xs text-zinc-500">
                            {row.source}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f4f0] px-4 pb-28 pt-6 text-zinc-900 sm:px-8 lg:px-12 lg:pt-10">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              <span className="h-2 w-2 rounded-full bg-teal-600" /> Personal
              performance / 01
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              The long game<span className="text-teal-600">.</span>
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Sleep, body weight, and the patterns between sessions.
            </p>
          </div>
          <div className="flex gap-2" data-swipe-ignore>
            <button
              className={control}
              disabled={refreshing}
              onClick={onRefresh}
            >
              {refreshing ? "Refreshing…" : "↻ Refresh data"}
            </button>
            <button
              className="min-h-10 rounded-lg border border-zinc-900 bg-zinc-900 px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Done editing" : "Customize"}
            </button>
          </div>
        </header>

        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y border-zinc-300/70 py-3"
          data-swipe-ignore
        >
          <div className="flex flex-wrap gap-1">
            {[
              { days: 28, label: "4 weeks" },
              { days: 90, label: "3 months" },
              { days: 180, label: "6 months" },
              { days: 0, label: "All history" },
            ].map((range) => (
              <button
                key={range.days}
                aria-pressed={settings.range === range.days}
                className={`min-h-10 rounded-lg px-3 text-sm ${settings.range === range.days ? "bg-white font-semibold shadow-sm" : "text-zinc-500 hover:bg-white/60"}`}
                onClick={() => patch({ range: range.days })}
              >
                {range.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>
              {shortDate(start)} – {shortDate(today)}
            </span>
            <label>
              <span className="sr-only">Weight unit</span>
              <select
                className={control}
                value={settings.unit}
                onChange={(event) =>
                  patch({ unit: event.target.value as WeightUnit })
                }
              >
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
            </label>
          </div>
        </div>

        {editing && (
          <section
            className="mb-6 rounded-xl border border-zinc-300 bg-white p-5"
            data-swipe-ignore
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Make this dashboard yours</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Hide modules and use their arrows to reorder. Settings stay in
                  this browser.
                </p>
              </div>
              <button className={control} onClick={() => setSettings(DEFAULTS)}>
                Reset layout
              </button>
            </div>
            <div className="my-5 flex flex-wrap gap-x-5 gap-y-3">
              {settings.order.map((id) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-teal-600"
                    checked={!settings.hidden.includes(id)}
                    onChange={(event) =>
                      patch({
                        hidden: event.target.checked
                          ? settings.hidden.filter((hidden) => hidden !== id)
                          : [...settings.hidden, id],
                      })
                    }
                  />
                  {MODULES.find((m) => m.id === id)!.title}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-5 border-t border-zinc-100 pt-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-teal-600"
                  checked={settings.averages}
                  onChange={(event) =>
                    patch({ averages: event.target.checked })
                  }
                />
                7-day averages
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-teal-600"
                  checked={settings.bars}
                  onChange={(event) => patch({ bars: event.target.checked })}
                />
                Bar charts
              </label>
              <label className="flex items-center gap-2">
                My sleep target{" "}
                <input
                  type="number"
                  min="1"
                  max="16"
                  step="0.5"
                  className={`${control} w-20`}
                  value={settings.target}
                  onChange={(event) => {
                    const target = Number(event.target.value);
                    if (target >= 1 && target <= 16) patch({ target });
                  }}
                />
                hours
              </label>
            </div>
          </section>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
          >
            Couldn’t refresh measurements. {error}{" "}
            <button className="ml-2 underline" onClick={onRefresh}>
              Try again
            </button>
          </div>
        )}
        {loading ? (
          <div role="status" className="grid gap-5 md:grid-cols-2">
            <span className="sr-only">Loading dashboard</span>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-80 animate-pulse rounded-xl bg-zinc-200"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <ChartEmpty text="Your dashboard is ready. Measurements will appear after your Garmin or MedM import completes." />
        ) : (
          <>
            <section className="mb-6 grid grid-cols-2 overflow-hidden rounded-xl bg-[#182a2a] text-white lg:grid-cols-4">
              {[
                {
                  title: "Latest sleep",
                  value: displayValue(lastSleep?.value ?? null, "minutes"),
                  note: lastSleep
                    ? shortDate(lastSleep.date)
                    : "No sleep in range",
                },
                {
                  title: "Latest sleep score",
                  value: displayValue(lastScore?.value ?? null, "score"),
                  note: lastScore
                    ? `${shortDate(lastScore.date)} · Garmin estimate`
                    : "No score in range",
                },
                {
                  title: "Latest body weight",
                  value: displayValue(lastWeight?.value ?? null, settings.unit),
                  note: lastWeight
                    ? shortDate(lastWeight.date)
                    : "No weigh-ins in range",
                },
                {
                  title: "Sleep coverage",
                  value: `${Math.round((sleepValues.length / dates.length) * 100)}%`,
                  note: `${sleepValues.length} / ${dates.length} nights in range`,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="border-b border-r border-white/10 p-5 sm:p-6"
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-teal-100/60">
                    {item.title}
                  </p>
                  <p className="mt-3 text-2xl font-medium tracking-tight tabular-nums sm:text-3xl">
                    {item.value}
                  </p>
                  <p className="mt-2 text-xs text-teal-100/60">{item.note}</p>
                </div>
              ))}
            </section>
            <div className="mb-6 flex flex-wrap justify-between gap-2 text-xs text-zinc-500">
              <span>
                {selectedRows.length.toLocaleString()} values in view ·{" "}
                {rows.length.toLocaleString()} imported overall ·{" "}
                {inventory.length} metrics
              </span>
              <span>
                {updated
                  ? `Latest imported value updated ${new Date(updated).toLocaleString()}`
                  : "No import timestamp"}
              </span>
            </div>
            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-4">
              {settings.order
                .filter((id) => !settings.hidden.includes(id))
                .map((id) => {
                  const panel = MODULES.find((m) => m.id === id)!;
                  return (
                    <article
                      key={id}
                      className={`min-w-0 rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 ${"wide" in panel ? "lg:col-span-2" : "xl:col-span-2"}`}
                    >
                      <header className="mb-6 flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold tracking-tight">
                            {panel.title}
                          </h2>
                          <p className="mt-1 text-xs leading-5 text-zinc-500">
                            {panel.note}
                          </p>
                        </div>
                        {editing && (
                          <div
                            className="flex shrink-0 gap-1"
                            data-swipe-ignore
                          >
                            <button
                              className="min-h-9 min-w-9 rounded border border-zinc-200 disabled:opacity-30"
                              aria-label={`Move ${panel.title} earlier`}
                              disabled={settings.order.indexOf(id) === 0}
                              onClick={() => move(id, -1)}
                            >
                              ↑
                            </button>
                            <button
                              className="min-h-9 min-w-9 rounded border border-zinc-200 disabled:opacity-30"
                              aria-label={`Move ${panel.title} later`}
                              disabled={
                                settings.order.indexOf(id) ===
                                settings.order.length - 1
                              }
                              onClick={() => move(id, 1)}
                            >
                              ↓
                            </button>
                          </div>
                        )}
                      </header>
                      {moduleBody(id)}
                    </article>
                  );
                })}
            </section>
            {settings.hidden.length === MODULES.length && (
              <button
                className={`${control} w-full`}
                onClick={() => setEditing(true)}
              >
                All modules hidden · customize dashboard
              </button>
            )}
            <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-zinc-300/70 pt-4 text-xs leading-5 text-zinc-500">
              <p>
                Recovery context for your training. Lifting volume, RPE, and
                strength progress need a training log connection.
              </p>
              <a
                href="https://www.ausport.gov.au/ais/gmr/mental_performance_in_competition/science/wearables"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                About wearable recovery metrics ↗
              </a>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

function BigNumber({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-400">{label}</p>
    </div>
  );
}
