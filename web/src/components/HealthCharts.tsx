"use client";

import { useEffect, useState } from "react";
import {
  displayValue,
  Point,
  rollingMean,
  shortDate,
  values,
} from "@/lib/health-insights";

const H = 240,
  L = 52,
  R = 16,
  T = 18,
  B = 32;
const innerH = H - T - B;

function usePlotWidth() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.min(720, Math.max(280, entries[0].contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width] as const;
}

export function TrendChart({
  points,
  unit,
  color = "#d97706",
  average = true,
  target,
  mode = "line",
  label,
}: {
  points: Point[];
  unit: string;
  color?: string;
  average?: boolean;
  target?: number;
  mode?: "line" | "bars";
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [plotRef, W] = usePlotWidth();
  const innerW = W - L - R;
  const data = values(points);
  if (!data.length)
    return (
      <ChartEmpty text="No measurements in this range. Try a longer range." />
    );
  const min = Math.min(...data, ...(target === undefined ? [] : [target]));
  const max = Math.max(...data, ...(target === undefined ? [] : [target]));
  const niceStep = (span: number) => {
    const rough = span / 6;
    const power = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-9)));
    const fraction = rough / power;
    return (
      (fraction <= 1
        ? 1
        : fraction <= 2
          ? 2
          : fraction <= 2.5
            ? 2.5
            : fraction <= 5
              ? 5
              : 10) * power
    );
  };
  let lo: number;
  let hi: number;
  let yTicks: number[];
  if (mode === "bars") {
    lo = 0;
    hi = Math.max(1, Math.ceil(max / niceStep(max || 1)) * niceStep(max || 1));
    yTicks = Array.from({ length: 7 }, (_, i) => (hi * i) / 6);
  } else if (unit === "score" && label.toLowerCase().includes("sleep score")) {
    lo = 0;
    hi = 100;
    yTicks = Array.from({ length: 11 }, (_, i) => i * 10);
  } else if (unit === "minutes") {
    const step = 60;
    lo = Math.max(0, Math.floor(min / step) * step);
    hi = Math.max(lo + step * 6, Math.ceil(max / step) * step);
    yTicks = Array.from(
      { length: Math.floor((hi - lo) / step) + 1 },
      (_, i) => lo + i * step,
    );
  } else {
    const step = niceStep(max - min || Math.abs(max) * 0.2 || 1);
    lo = Math.max(0, Math.floor(min / step) * step);
    hi = Math.max(lo + step * 6, Math.ceil(max / step) * step);
    yTicks = Array.from(
      { length: Math.floor((hi - lo) / step) + 1 },
      (_, i) => lo + i * step,
    );
  }
  const x = (i: number) => L + (i / Math.max(1, points.length - 1)) * innerW;
  const y = (value: number) => T + ((hi - value) / (hi - lo)) * innerH;
  const path = (series: Point[]) =>
    series
      .map((point, i) =>
        point.value === null
          ? ""
          : `${i === 0 || series[i - 1].value === null ? "M" : "L"}${x(i)},${y(point.value)}`,
      )
      .join(" ");
  const chosen = hover === null ? null : points[hover];
  const ticks = [
    ...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]),
  ];
  return (
    <div ref={plotRef} data-swipe-ignore>
      <div
        className="mb-2 flex min-h-6 flex-wrap justify-between gap-2 text-xs text-zinc-500"
        aria-live="polite"
      >
        <span>
          {chosen
            ? `${shortDate(chosen.date)} · ${displayValue(chosen.value, unit)}`
            : "Touch or hover to inspect"}
        </span>
        <span>
          <span style={{ color }}>●</span> Daily{" "}
          {average && (
            <span className="ml-3 text-zinc-900">
              ━ 7-day mean · ≥3 readings
            </span>
          )}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label={label}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const relative = ((event.clientX - bounds.left) / bounds.width) * W;
          setHover(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                Math.round(((relative - L) / innerW) * (points.length - 1)),
              ),
            ),
          );
        }}
        onPointerLeave={() => setHover(null)}
      >
        {yTicks.map((value, tick) => {
          const showLabel =
            tick === 0 || tick === yTicks.length - 1 || tick % 2 === 0;
          return (
            <g key={tick}>
              <line
                x1={L}
                x2={W - R}
                y1={y(value)}
                y2={y(value)}
                stroke="#e4e4e7"
                strokeDasharray="3 5"
              />
              <text
                x={L - 9}
                y={y(value) + 4}
                textAnchor="end"
                fill="#71717a"
                fontSize="11"
              >
                {showLabel
                  ? unit === "minutes"
                    ? `${value / 60}h`
                    : value.toLocaleString("en-US", {
                        maximumFractionDigits:
                          unit === "lb" || unit === "kg" ? 1 : 0,
                      })
                  : ""}
              </text>
            </g>
          );
        })}
        {target !== undefined && (
          <g>
            <line
              x1={L}
              x2={W - R}
              y1={y(target)}
              y2={y(target)}
              stroke="#a1a1aa"
              strokeDasharray="6 4"
            />
            <text
              x={W - R}
              y={y(target) - 5}
              textAnchor="end"
              fill="#71717a"
              fontSize="10"
            >
              Your target
            </text>
          </g>
        )}
        {mode === "line" && (
          <path
            d={path(points)}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}
        {points.map((point, i) =>
          point.value === null ? null : mode === "bars" ? (
            <rect
              key={point.date}
              x={x(i) - 2}
              y={y(point.value)}
              width={Math.max(2, Math.min(12, (innerW / points.length) * 0.7))}
              height={Math.max(1, T + innerH - y(point.value))}
              rx="1"
              fill={color}
            >
              <title>{`${point.date}: ${displayValue(point.value, unit)}`}</title>
            </rect>
          ) : (
            <circle
              key={point.date}
              cx={x(i)}
              cy={y(point.value)}
              r={points.length > 100 ? 1.5 : 2.5}
              fill={color}
            >
              <title>{`${point.date}: ${displayValue(point.value, unit)}`}</title>
            </circle>
          ),
        )}
        {average && (
          <path
            d={path(rollingMean(points))}
            fill="none"
            stroke="#18181b"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        )}
        {ticks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 7}
            textAnchor={
              i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
            }
            fontSize="11"
            fill="#71717a"
          >
            {shortDate(points[i].date)}
          </text>
        ))}
        {chosen && (
          <line
            x1={x(hover!)}
            x2={x(hover!)}
            y1={T}
            y2={T + innerH}
            stroke="#52525b"
            strokeDasharray="2 3"
          />
        )}
      </svg>
      <p className="mt-1 text-xs text-zinc-400">
        {data.length} readings · gaps mean missing data
      </p>
    </div>
  );
}

export function ChartEmpty({
  text = "This metric hasn’t been imported yet.",
}: {
  text?: string;
}) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}

export function StageChart({
  series,
}: {
  series: { label: string; color: string; points: Point[] }[];
}) {
  const [plotRef, W] = usePlotWidth();
  const innerW = W - L - R;
  if (!series.some((item) => values(item.points).length)) return <ChartEmpty />;
  const totals = series[0].points.map((_, i) =>
    series.reduce((sum, item) => sum + (item.points[i].value ?? 0), 0),
  );
  const max = Math.max(...totals, 60);
  return (
    <div ref={plotRef} data-swipe-ignore>
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-zinc-500">
        {series.map((item) => (
          <span key={item.label}>
            <span style={{ color: item.color }}>●</span> {item.label}
          </span>
        ))}
      </div>
      <svg
        className="block w-full"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Sleep stages by night, in hours"
      >
        {[0, 1, 2, 3].map((t) => (
          <g key={t}>
            <line
              x1={L}
              x2={W - R}
              y1={T + innerH * (1 - t / 3)}
              y2={T + innerH * (1 - t / 3)}
              stroke="#e4e4e7"
            />
            <text
              x={L - 10}
              y={T + innerH * (1 - t / 3) + 4}
              fill="#71717a"
              fontSize="11"
              textAnchor="end"
            >
              {(((max / 60) * t) / 3).toFixed(1)}h
            </text>
          </g>
        ))}
        {totals.map((total, i) => {
          let offset = 0;
          const slot = innerW / totals.length;
          return (
            <g key={i}>
              {series.map((item) => {
                const value = item.points[i].value;
                if (value === null) return null;
                offset += value;
                return (
                  <rect
                    key={item.label}
                    x={L + i * slot + slot * 0.15}
                    y={T + innerH * (1 - offset / max)}
                    width={slot * 0.7}
                    height={(innerH * value) / max}
                    fill={item.color}
                  >
                    <title>{`${item.points[i].date} · ${item.label}: ${displayValue(value, "minutes")}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
        <text x={L} y={H - 7} fill="#71717a" fontSize="11">
          {shortDate(series[0].points[0].date)}
        </text>
        <text x={W - R} y={H - 7} textAnchor="end" fill="#71717a" fontSize="11">
          {shortDate(series[0].points.at(-1)!.date)}
        </text>
      </svg>
      <p className="mt-2 text-xs text-zinc-400">
        Wearable estimates · includes awake time; missing stages are omitted.
      </p>
    </div>
  );
}

export function ScatterChart({
  xPoints,
  yPoints,
}: {
  xPoints: Point[];
  yPoints: Point[];
}) {
  const [plotRef, W] = usePlotWidth();
  const innerW = W - L - R;
  const pairs = xPoints.flatMap((p, i) =>
    p.value === null || yPoints[i]?.value == null
      ? []
      : [{ date: p.date, x: p.value / 60, y: yPoints[i].value! }],
  );
  if (pairs.length < 3)
    return (
      <ChartEmpty text="Needs at least 3 nights with both duration and score." />
    );
  const maxX = Math.max(...pairs.map((p) => p.x)) + 0.5;
  return (
    <div ref={plotRef} data-swipe-ignore>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label="Sleep duration against Garmin sleep score"
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={L}
              x2={W - R}
              y1={T + innerH * (1 - v / 100)}
              y2={T + innerH * (1 - v / 100)}
              stroke="#e4e4e7"
            />
            <text
              x={L - 10}
              y={T + innerH * (1 - v / 100) + 4}
              fontSize="11"
              fill="#71717a"
              textAnchor="end"
            >
              {v}
            </text>
          </g>
        ))}
        {pairs.map((p) => (
          <circle
            key={p.date}
            cx={L + (p.x / maxX) * innerW}
            cy={T + (1 - p.y / 100) * innerH}
            r="4"
            fill="#0d9488"
            fillOpacity="0.5"
          >
            <title>{`${p.date}: ${p.x.toFixed(1)}h · score ${p.y}`}</title>
          </circle>
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <text
            key={i}
            x={L + (i / 4) * innerW}
            y={H - 7}
            textAnchor="middle"
            fontSize="11"
            fill="#71717a"
          >
            {((i / 4) * maxX).toFixed(1)}h
          </text>
        ))}
      </svg>
      <p className="mt-2 text-xs text-zinc-400">
        {pairs.length} paired nights · Garmin’s score already includes sleep
        duration; this is not independent evidence.
      </p>
    </div>
  );
}
