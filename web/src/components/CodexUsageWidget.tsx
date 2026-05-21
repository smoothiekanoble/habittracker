"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";

type CodexUsageSnapshot = {
  id: string;
  captured_at: string;
  status: "ok" | "error";
  credit_balance: number | null;
  five_hour_used_percent: number | null;
  weekly_used_percent: number | null;
  error_message: string | null;
};

const STALE_AFTER_HOURS = 8;

function clampPercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function formatCapturedAt(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLoadError(message: string): string {
  if (/codex_usage_snapshots|schema cache|could not find the table/i.test(message)) {
    return "Codex usage table is not in Supabase yet. Run the codex_usage_snapshots migration, then refresh this page.";
  }
  return message;
}

function UsageBar({
  label,
  value,
  accentClassName,
}: {
  label: string;
  value: number | null;
  accentClassName: string;
}) {
  const percent = clampPercent(value);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-600">
        <span className="font-medium text-zinc-700">{label}</span>
        <span>{percent === null ? "Not found" : `${Math.round(percent)}% used`}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200">
        <div
          className={`h-full rounded-full transition-[width] ${accentClassName}`}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
    </div>
  );
}

export function CodexUsageWidget() {
  const [snapshots, setSnapshots] = useState<CodexUsageSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let alive = true;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        if (alive) {
          setSnapshots([]);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("codex_usage_snapshots")
        .select(
          "id,captured_at,status,credit_balance,five_hour_used_percent,weekly_used_percent,error_message"
        )
        .eq("user_id", session.user.id)
        .order("captured_at", { ascending: false })
        .limit(5);

      if (!alive) return;
      if (error) {
        setLoadError(formatLoadError(error.message));
        setSnapshots([]);
      } else {
        setLoadError(null);
        setSnapshots((data ?? []) as CodexUsageSnapshot[]);
      }
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const latest = snapshots[0] ?? null;
  const latestOk = useMemo(
    () => snapshots.find((snapshot) => snapshot.status === "ok") ?? null,
    [snapshots]
  );
  const stale = latestOk
    ? Date.now() - new Date(latestOk.captured_at).getTime() >
      STALE_AFTER_HOURS * 60 * 60 * 1000
    : false;
  const alert =
    loadError ??
    (latest?.status === "error" ? latest.error_message ?? "Latest import failed." : null) ??
    (stale ? `Last successful import is older than ${STALE_AFTER_HOURS} hours.` : null);

  return (
    <section className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-zinc-500">
            Development budget
          </p>
          <h2 className="mt-0.5 text-base font-semibold text-zinc-900">Codex usage</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {loading
              ? "Checking latest snapshot..."
              : latestOk
                ? `Updated ${formatCapturedAt(latestOk.captured_at)}`
                : "No usage snapshot yet"}
          </p>
        </div>
      </div>

      {alert && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {alert}
        </div>
      )}

      {latestOk ? (
        <div className="space-y-3.5">
          <UsageBar
            label="5-hour window"
            value={latestOk.five_hour_used_percent}
            accentClassName="bg-emerald-600"
          />
          <UsageBar
            label="Weekly limit"
            value={latestOk.weekly_used_percent}
            accentClassName="bg-indigo-600"
          />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Run the local importer to show your current Codex budget here.
        </p>
      )}
    </section>
  );
}
