"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HabitExpandedMonthPanel } from "@/components/HabitExpandedMonthPanel";
import { toLocalYMD } from "@/lib/calendar";
import { createClient, type Habit } from "@/lib/supabase";

const COLORS = ["#6366f1", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899"];
const ICONS = ["circle", "star", "heart", "bolt", "drop", "leaf"];

export function HabitForm({
  mode,
  habit,
}: {
  mode: "create" | "edit";
  habit?: Habit;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(habit?.title ?? "");
  const [color, setColor] = useState(habit?.color ?? "#6366f1");
  const [icon, setIcon] = useState(habit?.icon ?? "circle");
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
        router.refresh();
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
        <h1 className="text-xl font-semibold">{mode === "create" ? "New habit" : "Edit habit"}</h1>
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
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-10 h-10 rounded-full border-2 min-w-[44px] min-h-[44px]"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? "#000" : "transparent",
                }}
                aria-label={`Color ${c}`}
              />
            ))}
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
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className="w-10 h-10 rounded-full flex items-center justify-center border-2 min-w-[44px] min-h-[44px]"
                style={{
                  borderColor: icon === i ? "#000" : "#e4e4e7",
                  color: habit?.color ?? color,
                }}
                aria-label={`Icon ${i}`}
              >
                {i === "circle" ? "○" : "•"}
              </button>
            ))}
          </div>
        </div>
        {mode === "edit" && habit && (
          <>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 overflow-hidden">
              <div className="px-3 pt-3 pb-1">
                <h2 className="text-sm font-medium text-zinc-800">History</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Tap a day (today or earlier) to check or uncheck.
                </p>
              </div>
              <HabitExpandedMonthPanel
                habitId={habit.id}
                accentColor={color}
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
