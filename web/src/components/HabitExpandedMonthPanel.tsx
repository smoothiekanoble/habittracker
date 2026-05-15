"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { toLocalYMD } from "@/lib/calendar";
import { HabitMonthCalendar } from "@/components/HabitMonthCalendar";

type Props = {
  habitId: string;
  accentColor: string;
  reloadNonce?: number;
  showEditLink?: boolean;
  /** Tap days on/before today to insert or delete habit_logs (edit screen). */
  editable?: boolean;
  /** When set, month is controlled by parent (no per-habit month arrows). */
  viewYear?: number;
  viewMonthIndex?: number;
};

export function HabitExpandedMonthPanel({
  habitId,
  accentColor,
  reloadNonce = 0,
  showEditLink = true,
  editable = false,
  viewYear: viewYearProp,
  viewMonthIndex: viewMonthIndexProp,
}: Props) {
  const now = new Date();
  const controlled =
    viewYearProp !== undefined && viewMonthIndexProp !== undefined;
  const [localYear, setLocalYear] = useState(now.getFullYear());
  const [localMonthIndex, setLocalMonthIndex] = useState(now.getMonth());
  const year = controlled ? viewYearProp! : localYear;
  const monthIndex = controlled ? viewMonthIndexProp! : localMonthIndex;
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const togglingDates = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const startStr = toLocalYMD(new Date(year, monthIndex, 1));
      const endStr = toLocalYMD(new Date(year, monthIndex + 1, 0));
      const { data, error } = await supabase
        .from("habit_logs")
        .select("date, completed")
        .eq("habit_id", habitId)
        .gte("date", startStr)
        .lte("date", endStr);
      if (cancelled) return;
      if (error) {
        setCompletedDates(new Set());
      } else {
        setCompletedDates(
          new Set(
            (data ?? [])
              .filter((row) => row.completed)
              .map((row) => row.date)
          )
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [habitId, year, monthIndex, reloadNonce, supabase]);

  async function toggleDate(dateStr: string) {
    if (!editable) return;
    if (togglingDates.current.has(dateStr)) return;
    togglingDates.current.add(dateStr);
    const wasDone = completedDates.has(dateStr);
    setCompletedDates((prev) => {
      const next = new Set(prev);
      if (wasDone) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
    try {
      if (wasDone) {
        const { error } = await supabase
          .from("habit_logs")
          .delete()
          .eq("habit_id", habitId)
          .eq("date", dateStr);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("habit_logs").insert({
          habit_id: habitId,
          date: dateStr,
          completed: true,
        });
        if (error) throw error;
      }
    } catch (e) {
      console.error(e);
      setCompletedDates((prev) => {
        const next = new Set(prev);
        if (wasDone) next.add(dateStr);
        else next.delete(dateStr);
        return next;
      });
    } finally {
      togglingDates.current.delete(dateStr);
    }
  }

  function prevMonth() {
    if (localMonthIndex === 0) {
      setLocalMonthIndex(11);
      setLocalYear((y) => y - 1);
    } else {
      setLocalMonthIndex((m) => m - 1);
    }
  }

  function nextMonth() {
    if (localMonthIndex === 11) {
      setLocalMonthIndex(0);
      setLocalYear((y) => y + 1);
    } else {
      setLocalMonthIndex((m) => m + 1);
    }
  }

  return (
    <div
      className={
        showEditLink
          ? "border-t border-zinc-100 bg-zinc-50/60 px-2 py-2"
          : "bg-white px-2 py-2"
      }
    >
      {loading ? (
        <p className="text-xs text-zinc-500 py-2 text-center">Loading…</p>
      ) : (
        <HabitMonthCalendar
          year={year}
          monthIndex={monthIndex}
          completedDates={completedDates}
          accentColor={accentColor}
          showMonthNavigation={!controlled}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          interactive={editable}
          onToggleDate={editable ? toggleDate : undefined}
        />
      )}
      {showEditLink && (
        <div className="mt-1.5 pt-1.5 border-t border-zinc-200/80 flex justify-end">
          <Link
            href={`/habits/${habitId}/edit`}
            className="text-xs text-indigo-600 font-medium hover:underline"
            prefetch={false}
            onClick={(e) => e.stopPropagation()}
          >
            Edit habit
          </Link>
        </div>
      )}
    </div>
  );
}
