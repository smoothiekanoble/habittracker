import type { CSSProperties } from "react";

export const HABIT_ICON_PRESETS = [
  { id: "circle", label: "Circle" },
  { id: "star", label: "Star" },
  { id: "heart", label: "Heart" },
  { id: "bolt", label: "Bolt" },
  { id: "leaf", label: "Leaf" },
] as const;

export const HABIT_COLOR_PRESETS = [
  "#4f46e5",
  "#0f9f6e",
  "#dc2626",
  "#d97706",
  "#c026d3",
] as const;

export function isPresetHabitIcon(icon: string | null | undefined): boolean {
  return HABIT_ICON_PRESETS.some((preset) => preset.id === icon);
}

export function HabitIcon({
  icon,
  className = "h-5 w-5",
  style,
}: {
  icon: string | null | undefined;
  className?: string;
  style?: CSSProperties;
}) {
  const normalized = icon?.trim() || "circle";
  const common = {
    className,
    style,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (normalized) {
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.25" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="m12 3.8 2.35 4.75 5.25.76-3.8 3.7.9 5.23L12 15.77l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L12 3.8Z" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common}>
          <path d="M20.2 8.8c0 5.2-8.2 9.6-8.2 9.6S3.8 14 3.8 8.8A4.2 4.2 0 0 1 12 7.35 4.2 4.2 0 0 1 20.2 8.8Z" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 2.9 5.8 13h5.3L10 21.1 18.2 10h-5.4L13 2.9Z" />
        </svg>
      );
    case "leaf":
      return (
        <svg {...common}>
          <path d="M5.4 18.5c8.4.5 13.3-4.4 13.2-13.2C9.8 5.1 4.9 10 5.4 18.5Z" />
          <path d="M8.2 15.8 16.5 7.5" />
        </svg>
      );
    case "drop":
      return (
        <svg {...common}>
          <path d="M12 3.5s6 6.45 6 10.65A6 6 0 0 1 6 14.15C6 9.95 12 3.5 12 3.5Z" />
        </svg>
      );
    default:
      return (
        <span
          className={`${className} inline-flex items-center justify-center text-center leading-none align-middle`}
          style={style}
          aria-hidden
        >
          {Array.from(normalized).slice(0, 2).join("")}
        </span>
      );
  }
}
