"use client";

import {
  buildMonthGrid,
  formatMonthYear,
  toLocalYMD,
  WEEKDAY_INITIALS_SUN_FIRST,
} from "@/lib/calendar";

type Props = {
  year: number;
  monthIndex: number;
  completedDates: Set<string>;
  accentColor: string;
  /** When false, only the weekday row + grid (for global month control elsewhere). */
  showMonthNavigation?: boolean;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  title?: string;
  /** Tap past/today to toggle completion (future days stay inert). */
  interactive?: boolean;
  onToggleDate?: (dateStr: string) => void;
};

export function HabitMonthCalendar({
  year,
  monthIndex,
  completedDates,
  accentColor,
  showMonthNavigation = true,
  onPrevMonth,
  onNextMonth,
  title,
  interactive = false,
  onToggleDate,
}: Props) {
  const grid = buildMonthGrid(year, monthIndex, "sunday");
  const todayStr = toLocalYMD(new Date());
  const header = title ?? formatMonthYear(year, monthIndex);

  return (
    <div className="py-0.5">
      {showMonthNavigation && (
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <button
            type="button"
            onClick={onPrevMonth}
            className="shrink-0 w-8 h-8 rounded-md border border-zinc-200 text-zinc-600 text-sm hover:bg-zinc-50 flex items-center justify-center"
            aria-label="Previous month"
          >
            ‹
          </button>
          <h3 className="text-xs font-semibold text-zinc-800 text-center flex-1 truncate px-1">
            {header}
          </h3>
          <button
            type="button"
            onClick={onNextMonth}
            className="shrink-0 w-8 h-8 rounded-md border border-zinc-200 text-zinc-600 text-sm hover:bg-zinc-50 flex items-center justify-center"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      )}
      <div className="mx-auto grid w-max max-w-full grid-cols-7 gap-x-2 gap-y-0 text-center">
        {WEEKDAY_INITIALS_SUN_FIRST.map((d, i) => (
          <div
            key={`${d}-${i}`}
            className="flex h-5 w-8 items-end justify-center text-[10px] font-medium text-zinc-400 leading-none"
          >
            {d}
          </div>
        ))}
        {grid.map((cell) => {
          if (!cell.inMonth || !cell.dateStr) {
            return (
              <div key={cell.key} className="h-8 w-8" aria-hidden />
            );
          }
          const done = completedDates.has(cell.dateStr);
          const isToday = cell.dateStr === todayStr;
          const isFuture = cell.dateStr > todayStr;
          const canToggle = interactive && onToggleDate && !isFuture;
          const dot = (
            <span
              className={`block h-[18px] w-[18px] rounded-md shrink-0 ${
                isToday ? "ring-2 ring-zinc-600 ring-offset-1 ring-offset-white" : ""
              } ${canToggle ? "cursor-pointer" : ""}`}
              style={{
                backgroundColor: done ? accentColor || "#6366f1" : "#e4e4e7",
              }}
            />
          );
          return (
            <div
              key={cell.key}
              className="flex h-8 w-8 items-center justify-center"
            >
              {canToggle ? (
                <button
                  type="button"
                  onClick={() => onToggleDate(cell.dateStr!)}
                  className="flex h-8 w-8 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                  title={cell.dateStr}
                  aria-label={
                    done
                      ? `${cell.dateStr}, completed. Tap to uncheck`
                      : `${cell.dateStr}, not completed. Tap to check off`
                  }
                  aria-pressed={done}
                >
                  {dot}
                </button>
              ) : (
                <div title={cell.dateStr} aria-label={cell.dateStr}>
                  {dot}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
