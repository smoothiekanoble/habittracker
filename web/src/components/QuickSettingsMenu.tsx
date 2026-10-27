"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const KEY = "habittracker-ui-preferences";
export type CalendarStyle = "fill" | "heatmap";

export function getCalendarStyle(): CalendarStyle {
  try {
    return localStorage.getItem(KEY)?.includes('"calendar":"heatmap"')
      ? "heatmap"
      : "fill";
  } catch {
    return "fill";
  }
}

export function QuickSettingsMenu() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [calendar, setCalendar] = useState<CalendarStyle>("fill");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      setDark(saved.dark === true);
      setCalendar(saved.calendar === "heatmap" ? "heatmap" : "fill");
    } catch {
      /* Use defaults if storage is unavailable. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem(KEY, JSON.stringify({ dark, calendar }));
    } catch {
      /* Optional persistence. */
    }
  }, [dark, calendar]);
  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);
  const changeCalendar = (style: CalendarStyle) => {
    setCalendar(style);
    window.dispatchEvent(
      new CustomEvent("habittracker-calendar-style", { detail: style }),
    );
  };

  return (
    <div ref={root} className="relative" data-swipe-ignore>
      <button
        type="button"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-zinc-200 text-xl text-zinc-800 hover:bg-zinc-300"
        aria-label="Open settings and add task"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ☰
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-52 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">
          <Link
            href="/habits/new"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
          >
            ＋ Add task
          </Link>
          <button
            type="button"
            onClick={() => setSettingsOpen((value) => !value)}
            className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100"
          >
            ⚙ Settings
          </button>
          {settingsOpen && (
            <div className="mt-1 border-t border-zinc-200 px-3 py-3">
              <label className="flex items-center justify-between gap-3 py-2 text-sm text-zinc-700">
                <span>Dark mode</span>
                <input
                  type="checkbox"
                  checked={dark}
                  onChange={(event) => setDark(event.target.checked)}
                />
              </label>
              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Calendar style
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="calendar-style"
                  checked={calendar === "fill"}
                  onChange={() => changeCalendar("fill")}
                />
                Fill progress
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="calendar-style"
                  checked={calendar === "heatmap"}
                  onChange={() => changeCalendar("heatmap")}
                />
                GitHub heatmap
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
