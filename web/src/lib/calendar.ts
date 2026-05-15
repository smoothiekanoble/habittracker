export function formatMonthYear(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Local calendar date YYYY-MM-DD (avoids UTC shift from toISOString). */
export function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday-first: number of empty cells before the 1st (0–6). */
export function mondayFirstPadCount(year: number, monthIndex: number): number {
  const first = new Date(year, monthIndex, 1);
  const jsDay = first.getDay();
  return (jsDay + 6) % 7;
}

/** Sunday-first: empty cells before the 1st (0 = Sunday … 6 = Saturday). */
export function sundayFirstPadCount(year: number, monthIndex: number): number {
  return new Date(year, monthIndex, 1).getDay();
}

export type WeekStartsOn = "monday" | "sunday";

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export type CalendarCell = {
  key: string;
  dateStr: string | null;
  inMonth: boolean;
  dayNum: number | null;
};

export function buildMonthGrid(
  year: number,
  monthIndex: number,
  weekStartsOn: WeekStartsOn = "monday"
): CalendarCell[] {
  const pad =
    weekStartsOn === "sunday"
      ? sundayFirstPadCount(year, monthIndex)
      : mondayFirstPadCount(year, monthIndex);
  const dim = daysInMonth(year, monthIndex);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < pad; i++) {
    cells.push({ key: `pad-${year}-${monthIndex}-${i}`, dateStr: null, inMonth: false, dayNum: null });
  }
  for (let d = 1; d <= dim; d++) {
    const dateStr = toLocalYMD(new Date(year, monthIndex, d));
    cells.push({
      key: dateStr,
      dateStr,
      inMonth: true,
      dayNum: d,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({
      key: `trail-${year}-${monthIndex}-${cells.length}`,
      dateStr: null,
      inMonth: false,
      dayNum: null,
    });
  }
  return cells;
}

export const WEEKDAY_LABELS_MON_FIRST = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

/** Sunday-first single-letter headers (T = Tue & Thu). */
export const WEEKDAY_INITIALS_SUN_FIRST = ["S", "M", "T", "W", "T", "F", "S"];
