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
  activeFrom?: string | null;
  activeUntil?: string | null;
  /** When false, only the weekday row + grid (for global month control elsewhere). */
  showMonthNavigation?: boolean;
  compact?: boolean;
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
  activeFrom,
  activeUntil,
  showMonthNavigation = true,
  compact = false,
  onPrevMonth,
  onNextMonth,
  title,
  interactive = false,
  onToggleDate,
}: Props) {
  const grid = buildMonthGrid(year, monthIndex, "sunday");
  const todayStr = toLocalYMD(new Date());
  const header = title ?? formatMonthYear(year, monthIndex);
  const navButtonClass = compact
    ? "shrink-0 w-7 h-7 rounded-md border border-zinc-200 text-zinc-600 text-xs hover:bg-zinc-50 flex items-center justify-center"
    : "shrink-0 w-8 h-8 rounded-md border border-zinc-200 text-zinc-600 text-sm hover:bg-zinc-50 flex items-center justify-center";
  const weekdayClass = compact
    ? "flex h-4 w-7 items-end justify-center text-[9px] font-medium text-zinc-400 leading-none"
    : "flex h-5 w-8 items-end justify-center text-[10px] font-medium text-zinc-400 leading-none";
  const cellClass = compact
    ? "flex h-6 w-7 items-center justify-center"
    : "flex h-8 w-8 items-center justify-center";
  const dotSizeClass = compact ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";

  return (
    <div className={compact ? "py-0" : "py-0.5"}>
      {showMonthNavigation && (
        <div className={compact ? "mb-1 flex items-center justify-between gap-1" : "flex items-center justify-between gap-1 mb-1.5"}>
          <button
            type="button"
            onClick={onPrevMonth}
            className={navButtonClass}
            aria-label="Previous month"
          >
            &lsaquo;
          </button>
          <h3 className="text-xs font-semibold text-zinc-800 text-center flex-1 truncate px-1">
            {header}
          </h3>
          <button
            type="button"
            onClick={onNextMonth}
            className={navButtonClass}
            aria-label="Next month"
          >
            &rsaquo;
          </button>
        </div>
      )}
      <div className={compact ? "mx-auto grid w-max max-w-full grid-cols-7 gap-x-1.5 gap-y-0 text-center" : "mx-auto grid w-max max-w-full grid-cols-7 gap-x-2 gap-y-0 text-center"}>
        {WEEKDAY_INITIALS_SUN_FIRST.map((d, i) => (
          <div
            key={`${d}-${i}`}
            className={weekdayClass}
          >
            {d}
          </div>
        ))}
        {grid.map((cell) => {
          if (!cell.inMonth || !cell.dateStr) {
            return (
              <div key={cell.key} className={compact ? "h-6 w-7" : "h-8 w-8"} aria-hidden />
            );
          }
          const done = completedDates.has(cell.dateStr);
          const isToday = cell.dateStr === todayStr;
          const isFuture = cell.dateStr > todayStr;
          const startDate = activeFrom?.slice(0, 10) ?? null;
          const endDate = activeUntil?.slice(0, 10) ?? null;
          const beforeStart = startDate != null && cell.dateStr < startDate;
          const afterEnd = endDate != null && cell.dateStr > endDate;
          const inactive = beforeStart || afterEnd;
          const isStart = startDate === cell.dateStr;
          const isEnd = endDate === cell.dateStr;
          const quiet = inactive || isFuture;
          const canToggle = interactive && onToggleDate && !isFuture && !inactive;
          const dot = (
            <span
              className={[
                "relative block shrink-0 rounded-md border transition-colors",
                dotSizeClass,
                isToday ? "ring-2 ring-zinc-600 ring-offset-1 ring-offset-white" : "",
                canToggle ? "cursor-pointer" : "",
                quiet ? "border-zinc-200 bg-transparent opacity-35" : "",
                !quiet && done ? "border-transparent" : "",
                !quiet && !done ? "border-zinc-200" : "",
                isStart || isEnd ? "outline outline-1 outline-offset-1 outline-zinc-500/50" : "",
              ].join(" ")}
              style={{
                backgroundColor: quiet
                  ? "transparent"
                  : done
                    ? accentColor || "#6366f1"
                    : `color-mix(in srgb, ${accentColor || "#6366f1"} 12%, #e4e4e7)`,
              }}
            >
              {(isStart || isEnd) && (
                <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[7px] font-bold uppercase leading-none text-zinc-500">
                  {isStart ? "S" : "E"}
                </span>
              )}
            </span>
          );
          return (
            <div
              key={cell.key}
              className={cellClass}
            >
              {canToggle ? (
                <button
                  type="button"
                  onClick={() => onToggleDate(cell.dateStr!)}
                  className={[cellClass, "rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"].join(" ")}
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
