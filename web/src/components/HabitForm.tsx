"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  HABIT_COLOR_PRESETS,
  HABIT_ICON_PRESETS,
  HabitIcon,
  isPresetHabitIcon,
} from "@/components/HabitIcon";
import { HabitExpandedMonthPanel } from "@/components/HabitExpandedMonthPanel";
import { toLocalYMD } from "@/lib/calendar";
import { createClient, type Habit } from "@/lib/supabase";

export function HabitForm({
  mode,
  habit,
}: {
  mode: "create" | "edit";
  habit?: Habit;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(habit?.title ?? "");
  const [color, setColor] = useState(habit?.color ?? "#4f46e5");
  const [icon, setIcon] = useState(habit?.icon ?? "circle");
  const [customIcon, setCustomIcon] = useState(() =>
    habit?.icon && !isPresetHabitIcon(habit.icon) ? habit.icon : ""
  );
  const [activeFrom, setActiveFrom] = useState(() => {
    if (habit?.active_from) return habit.active_from.slice(0, 10);
    if (habit?.created_at) return toLocalYMD(new Date(habit.created_at));
    return toLocalYMD(new Date());
  });
  const [activeUntil, setActiveUntil] = useState(
    () => habit?.active_until?.slice(0, 10) ?? ""
  );
  const [saving, setSaving] = useState(false);
  const supabase = createClient();
  const customColorSelected = !HABIT_COLOR_PRESETS.some((preset) => preset === color);

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/habits");
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const untilNorm = activeUntil.trim();
    if (untilNorm && untilNorm < activeFrom) {
      alert("End date must be on or after the start date.");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        alert("Not signed in. Refresh the page and try again.");
        return;
      }
      if (mode === "create") {
        const { error } = await supabase.from("habits").insert({
          user_id: user.id,
          title: t,
          color,
          icon,
          active_from: activeFrom,
          active_until: untilNorm === "" ? null : untilNorm,
        });
        if (error) {
          alert(
            error.message +
              (error.message.includes("relation") || error.code === "42P01"
                ? "\n\nRun the SQL in supabase/migrations/ in the Supabase SQL Editor (Table habits may be missing)."
                : "")
          );
          return;
        }
        router.push("/");
      } else if (habit) {
        const { error } = await supabase
          .from("habits")
          .update({
            title: t,
            color,
            icon,
            active_from: activeFrom,
            active_until: untilNorm === "" ? null : untilNorm,
            updated_at: new Date().toISOString(),
          })
          .eq("id", habit.id)
          .eq("user_id", user.id);
        if (error) {
          alert(error.message);
          return;
        }
        router.replace("/habits");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (mode !== "edit" || !habit) return;
    if (!confirm("Delete this habit and its history?")) return;
    await supabase.from("habits").delete().eq("id", habit.id);
    router.push("/habits");
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-lg overflow-x-hidden p-4">
      <header className="flex items-center justify-between py-4">
        <Link href="/habits" className="text-zinc-600">Cancel</Link>
        <h1 className="text-xl font-semibold">
          {mode === "create" ? "New habit" : "Edit habit"}
        </h1>
        <button
          type="submit"
          form="habit-form"
          disabled={saving || !title.trim()}
          className="text-indigo-600 font-medium disabled:opacity-50"
        >
          Save
        </button>
      </header>
      <form id="habit-form" onSubmit={save} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 min-h-[48px]"
            placeholder="e.g. Morning run"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">Color</label>
          <div className="flex flex-wrap items-center gap-2">
            {HABIT_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 bg-white"
                style={{ borderColor: color === c ? "#18181b" : "#e4e4e7" }}
                aria-label={`Color ${c}`}
              >
                <span
                  className="h-8 w-8 rounded-full shadow-sm"
                  style={{ backgroundColor: c }}
                  aria-hidden
                />
              </button>
            ))}
            <label
              className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 bg-white shadow-sm"
              style={{ borderColor: customColorSelected ? "#18181b" : "#e4e4e7" }}
              aria-label="Choose custom color"
            >
              <span
                className="h-8 w-8 rounded-full shadow-sm"
                style={{
                  background:
                    "conic-gradient(from 90deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)",
                }}
                aria-hidden
              />
              <span className="absolute inset-[13px] rounded-full border border-white/90 bg-white/85 shadow-inner" aria-hidden />
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Choose custom color"
              />
            </label>
          </div>
        </div>
        <div className="grid w-full min-w-0 max-w-full gap-4 overflow-x-hidden sm:grid-cols-2">
          <div className="min-w-0">
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Counts from
            </label>
            <input
              type="date"
              value={activeFrom}
              onChange={(e) => setActiveFrom(e.target.value)}
              className="habit-date-input"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Only days on or after this count toward your calendar.
            </p>
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Counts until (optional)
            </label>
            <input
              type="date"
              value={activeUntil}
              onChange={(e) => setActiveUntil(e.target.value)}
              className="habit-date-input"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Leave empty for no end date.
            </p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">Icon</label>
          <div className="flex flex-wrap gap-2">
            {HABIT_ICON_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setIcon(preset.id)}
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 bg-white transition-colors"
                style={{
                  borderColor: icon === preset.id ? "#18181b" : "#e4e4e7",
                  color,
                }}
                aria-label={`Icon ${preset.label}`}
              >
                <HabitIcon icon={preset.id} className="h-5 w-5" />
              </button>
            ))}
            <label
              className="flex h-11 min-w-[5.75rem] items-center gap-2 rounded-full border-2 bg-white px-3"
              style={{ borderColor: !isPresetHabitIcon(icon) ? "#18181b" : "#e4e4e7" }}
            >
              <span className="text-xs font-semibold text-zinc-700" aria-hidden>
                Custom
              </span>
              <input
                type="text"
                value={customIcon}
                onChange={(e) => {
                  const next = Array.from(e.target.value.trim()).slice(0, 2).join("");
                  setCustomIcon(next);
                  setIcon(next || "circle");
                }}
                className="w-8 bg-transparent text-center text-sm outline-none"
                placeholder="+"
                aria-label="Custom icon"
              />
            </label>
          </div>
        </div>
        {mode === "edit" && habit && (
          <>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 overflow-hidden">
              <div className="px-3 pt-3 pb-1">
                <h2 className="text-sm font-medium text-zinc-800">History</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Tap an active day (today or earlier) to check or uncheck.
                </p>
              </div>
              <HabitExpandedMonthPanel
                habitId={habit.id}
                accentColor={color}
                activeFrom={activeFrom}
                activeUntil={activeUntil || null}
                showEditLink={false}
                editable
              />
            </div>
            <div className="pt-4 border-t border-zinc-200">
              <button
                type="button"
                onClick={remove}
                className="text-red-600 font-medium"
              >
                Delete habit
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
