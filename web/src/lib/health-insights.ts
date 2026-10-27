export type MetricRow = {
  id: string;
  metric_date: string;
  metric_type: string;
  value: number | string;
  unit: string;
  source: string;
  updated_at: string;
};
export type Point = { date: string; value: number | null };
export type WeightUnit = "lb" | "kg";

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDay(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
export function calendar(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftDay(date, 1))
    dates.push(date);
  return dates;
}
export function mean(values: number[]): number | null {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}
export function deviation(values: number[]): number | null {
  const avg = mean(values);
  return avg === null
    ? null
    : Math.sqrt(mean(values.map((value) => (value - avg) ** 2))!);
}
export function prettyMetric(type: string): string {
  const names: Record<string, string> = {
    sleep_minutes: "Sleep duration",
    sleep_score: "Sleep score",
    body_weight: "Body weight",
    deep_sleep_minutes: "Deep sleep",
    rem_sleep_minutes: "REM sleep",
    light_sleep_minutes: "Light sleep",
    awake_minutes: "Awake time",
    avg_sleep_hr: "Overnight heart rate",
    avg_sleep_stress: "Overnight stress",
  };
  return names[type] ?? type.replaceAll("_", " ");
}
export function displayValue(value: number | null, unit: string): string {
  if (value === null) return "—";
  if (unit === "minutes") {
    const rounded = Math.round(value);
    return `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
  }
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}${unit && unit !== "score" ? ` ${unit}` : ""}`;
}
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// A chart must not silently combine units or pick an arbitrary provider.
export function metricSeries(
  rows: MetricRow[],
  type: string,
  dates: string[],
  weightUnit: WeightUnit,
  source?: string,
): Point[] {
  const relevant = rows.filter(
    (row) => row.metric_type === type && (!source || row.source === source),
  );
  const nativeUnit = relevant[0]?.unit;
  const days = new Map<
    string,
    { priority: number; updated: string; value: number }
  >();
  for (const row of relevant) {
    let value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    if (type === "body_weight") {
      const unit = row.unit.toLowerCase();
      if (!["kg", "lb", "lbs"].includes(unit) || value <= 0) continue;
      const kg = unit === "kg" ? value : value / 2.2046226218;
      value = weightUnit === "kg" ? kg : kg * 2.2046226218;
    } else if (row.unit !== nativeUnit) continue;
    if (value < 0 || (type === "sleep_score" && value > 100)) continue;
    const priority =
      type === "body_weight"
        ? Number(row.source.startsWith("medm"))
        : Number(row.source === "garmin");
    const previous = days.get(row.metric_date);
    if (
      !previous ||
      priority > previous.priority ||
      (priority === previous.priority && row.updated_at > previous.updated)
    ) {
      days.set(row.metric_date, { priority, updated: row.updated_at, value });
    }
  }
  return dates.map((date) => ({ date, value: days.get(date)?.value ?? null }));
}
export function rollingMean(points: Point[], window = 7): Point[] {
  return points.map((point, index) => {
    const values = points
      .slice(Math.max(0, index - window + 1), index + 1)
      .flatMap((p) => (p.value === null ? [] : [p.value]));
    return {
      date: point.date,
      value: point.value !== null && values.length >= 3 ? mean(values) : null,
    };
  });
}
export function values(points: Point[]): number[] {
  return points.flatMap((point) => (point.value === null ? [] : [point.value]));
}
export function last(points: Point[]): Point | undefined {
  return points.filter((point) => point.value !== null).at(-1);
}
