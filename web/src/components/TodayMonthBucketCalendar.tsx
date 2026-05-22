"use client";

import { useRef } from "react";
import type { CSSProperties } from "react";
import {
  buildMonthGrid,
  WEEKDAY_INITIALS_SUN_FIRST,
} from "@/lib/calendar";

export type DayCompletionStats = { completed: number; total: number };

const CELL = "flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center";
const INNER =
  "relative h-[18px] w-[18px] sm:h-5 sm:w-5 overflow-hidden rounded-md shrink-0 border-2 border-zinc-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]";

const EMPTY_GRAY = "#d4d4d8";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Fill color: low completion = harsh red, mid = orange/amber, full = gold + glow. */
function completionFillStyle(ratio: number): CSSProperties {
  const t = Math.min(1, Math.max(0, ratio));
  const ease = Math.pow(t, 0.82);
  const h = lerp(4, 46, ease);
  const hBottom = lerp(2, 40, ease);
  const s = lerp(78, 95, t);
  const light = lerp(44, 58, t);
  const lightBottom = lerp(36, 50, t);

  const style: CSSProperties = {
    background: `linear-gradient(to top, hsl(${hBottom}, ${s}%, ${lightBottom}%), hsl(${h}, ${s}%, ${light}%))`,
    transition: "height 300ms ease-out, box-shadow 280ms ease-out, background 280ms ease-out",
  };

  if (t >= 0.999) {
    style.boxShadow =
      "0 0 8px 2px rgba(253, 224, 71, 0.95), 0 0 16px 5px rgba(245, 158, 11, 0.5), inset 0 -1px 0 rgba(255,255,255,0.4)";
  }

  return style;
}

function longDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

type Props = {
  year: number;
  monthIndex: number;
  statsByDate: ReadonlyMap<string, DayCompletionStats>;
  todayStr: string;
  canGoNext?: boolean;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onThisMonth?: () => void;
};

export function TodayMonthBucketCalendar({
  year,
  monthIndex,
  statsByDate,
  todayStr,
  canGoNext = false,
  onPrevMonth,
  onNextMonth,
  onThisMonth,
}: Props) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const grid = buildMonthGrid(year, monthIndex, "sunday");
  const weekRows = grid.length / 7;
  const monthWord = new Date(year, monthIndex, 1).toLocaleDateString("en-US", {
    month: "long",
  });
  const isCurrentMonth = !canGoNext;

  function finishSwipe(x: number, y: number) {
    if (!touchStartRef.current) return;
    const deltaX = x - touchStartRef.current.x;
    const deltaY = y - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    if (deltaX < 0 && canGoNext) onNextMonth?.();
    if (deltaX > 0) onPrevMonth?.();
  }

  return (
    <div
      data-swipe-ignore
      className="py-0 touch-pan-y"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        if (touch) finishSwipe(touch.clientX, touch.clientY);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        touchStartRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "mouse") return;
        finishSwipe(event.clientX, event.clientY);
      }}
    >
      <div className="mb-3 max-w-full border-l-[3px] border-zinc-900 py-2 pl-3 pr-2 sm:mb-3.5 sm:py-2.5 sm:pl-3.5 sm:pr-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-[11px]">
              Month at a glance
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0 sm:gap-x-2.5">
              <span className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
                {monthWord}
              </span>
              <span className="text-sm font-medium tabular-nums text-zinc-400 sm:text-base">
                {year}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-white/80 p-0.5 shadow-sm">
            <button
              type="button"
              onClick={onPrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200"
              aria-label="Previous month"
            >
              &lsaquo;
            </button>
            <button
              type="button"
              onClick={onThisMonth}
              disabled={isCurrentMonth}
              className="h-8 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 disabled:text-zinc-300"
            >
              Now
            </button>
            <button
              type="button"
              onClick={onNextMonth}
              disabled={!canGoNext}
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 disabled:text-zinc-300 disabled:hover:bg-transparent"
              aria-label="Next month"
            >
              &rsaquo;
            </button>
          </div>
        </div>
      </div>

      <div
        className={
          weekRows > 5
            ? "relative mx-auto h-[14.75rem] max-w-full overflow-visible sm:h-[16.3125rem]"
            : "relative mx-auto h-[12.5rem] max-w-full overflow-visible sm:h-[13.8125rem]"
        }
      >
        <div className="absolute left-1/2 top-0 grid w-max max-w-full -translate-x-1/2 grid-cols-7 gap-x-2 gap-y-0 text-center sm:gap-x-2.5 sm:gap-y-px">
        {WEEKDAY_INITIALS_SUN_FIRST.map((d, i) => (
          <div
            key={`${d}-${i}`}
            className="flex h-5 w-9 items-end justify-center text-[10px] font-medium text-zinc-500 leading-none sm:h-5 sm:w-10 sm:text-[11px]"
          >
            {d}
          </div>
        ))}
        {grid.map((cell) => {
          if (!cell.inMonth || !cell.dateStr) {
            return (
              <div key={cell.key} className="h-9 w-9 sm:h-10 sm:w-10" aria-hidden />
            );
          }

          const dateStr = cell.dateStr;
          const isFuture = dateStr > todayStr;
          const isToday = dateStr === todayStr;
          const stats = statsByDate.get(dateStr) ?? {
            completed: 0,
            total: 0,
          };
          const { completed, total } = stats;

          if (isFuture) {
            return (
              <div key={cell.key} className={CELL}>
                <div
                  role="img"
                  className="relative h-[18px] w-[18px] shrink-0 rounded-md border-2 border-dashed border-zinc-400 bg-transparent sm:h-5 sm:w-5"
                  aria-label={`Future day, ${longDateLabel(dateStr)}`}
                />
              </div>
            );
          }

          const noHabitsYet = total === 0;
          const ratio = noHabitsYet ? 0 : completed / total;
          const fillHeightPct = noHabitsYet ? 0 : ratio * 100;

          let ariaLabel: string;
          if (noHabitsYet) {
            ariaLabel = `${longDateLabel(dateStr)}, no habits yet`;
          } else {
            const pct = Math.round(ratio * 100);
            ariaLabel = `${longDateLabel(dateStr)}, ${completed} of ${total} habits, ${pct} percent`;
          }

          return (
            <div key={cell.key} className={CELL} aria-label={ariaLabel}>
              <div
                className={[
                  INNER,
                  isToday
                    ? "ring-2 ring-zinc-600 ring-offset-1 ring-offset-white"
                    : "",
                ].join(" ")}
                style={{ backgroundColor: EMPTY_GRAY }}
              >
                {!noHabitsYet && (
                  <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{
                      height: `${fillHeightPct}%`,
                      ...completionFillStyle(ratio),
                    }}
                    aria-hidden
                  />
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
