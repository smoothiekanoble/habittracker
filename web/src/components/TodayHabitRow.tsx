"use client";

import type { CSSProperties } from "react";
import type { Habit } from "@/lib/supabase";

type Props = {
  habit: Habit;
  completed: boolean;
  onToggle: () => void;
};

export function TodayHabitRow({ habit, completed, onToggle }: Props) {
  const accent = habit.color?.trim() || "#6366f1";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={completed}
      aria-label={
        completed ? `${habit.title}, completed. Tap to mark not done` : `${habit.title}. Tap to mark done`
      }
      style={{ "--habit-color": accent } as CSSProperties}
      className={[
        "group relative w-full flex items-center gap-4 rounded-2xl border p-4 text-left",
        "min-h-[72px] touch-manipulation overflow-hidden",
        "transition-[transform,box-shadow,background-color,border-color] duration-300 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
        "motion-safe:active:scale-[0.985]",
        completed
          ? "today-habit-row-complete border-transparent"
          : "border-zinc-200/90 bg-white shadow-sm hover:border-zinc-300 hover:bg-zinc-50/80",
      ].join(" ")}
    >
      <div
        className={[
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300",
          completed ? "today-habit-row-shine opacity-100" : "",
        ].join(" ")}
        aria-hidden
      />

      <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center">
        <div
          className={[
            "flex h-[48px] w-[48px] items-center justify-center rounded-full border-[2.5px] border-solid transition-all duration-300 ease-out",
            completed
              ? "today-habit-check-glow scale-100 border-transparent shadow-lg"
              : "bg-white",
          ].join(" ")}
          style={
            completed
              ? { backgroundColor: "var(--habit-color)" }
              : {
                  borderColor: `color-mix(in srgb, var(--habit-color) 44%, #e4e4e7)`,
                }
          }
        >
          {completed ? (
            <svg
              key="done"
              className="today-habit-check-icon h-[26px] w-[26px] text-white drop-shadow-sm"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 12.5l4 4 7.5-9.5" />
            </svg>
          ) : (
            <span
              key="open"
              className="text-[11px] font-medium text-zinc-400 transition-colors group-hover:text-zinc-500"
              aria-hidden
            >
              {habit.icon === "circle" ? "" : "·"}
            </span>
          )}
        </div>
      </div>

      <div className="relative min-w-0 flex-1">
        <span
          className={[
            "block truncate text-base font-semibold tracking-tight transition-colors duration-300",
            completed ? "text-zinc-800" : "text-zinc-900",
          ].join(" ")}
        >
          {habit.title}
        </span>
        <span
          className={[
            "mt-0.5 block text-xs font-medium transition-all duration-300",
            completed ? "text-zinc-600" : "text-zinc-400",
          ].join(" ")}
        >
          {completed ? "Logged for today" : "Tap anywhere to complete"}
        </span>
      </div>

      {completed && (
        <span
          className="today-habit-badge relative shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-md"
          style={{
            backgroundColor: "var(--habit-color)",
            boxShadow: "0 2px 10px -2px color-mix(in srgb, var(--habit-color) 55%, transparent)",
          }}
        >
          Done
        </span>
      )}
    </button>
  );
}
