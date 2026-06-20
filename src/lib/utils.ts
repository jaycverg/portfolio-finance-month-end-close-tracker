import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { TaskStatus } from "./close";

// ─── Tailwind class merging ────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  try {
    return twMerge(clsx(inputs));
  } catch {
    return inputs.filter(Boolean).join(" ");
  }
}

// ─── Formatting ────────────────────────────────────────────────────────────────

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatLongDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** "2026-05" → "May 2026" */
export function formatPeriodLabel(label: string): string {
  const [year, month] = label.split("-").map(Number);
  if (!year || !month) return label;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
  }).format(new Date(year, month - 1, 1));
}

// ─── Status presentation ─────────────────────────────────────────────────────

const STATUS_LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  IN_REVIEW: "In review",
  DONE: "Done",
};

export function statusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Tailwind classes for a status pill — semantic colors per the design language. */
export function statusColor(status: TaskStatus): string {
  switch (status) {
    case "DONE":
      return "text-green-700 bg-green-50 border-green-200";
    case "IN_REVIEW":
      return "text-indigo-700 bg-indigo-50 border-indigo-200";
    case "IN_PROGRESS":
      return "text-blue-700 bg-blue-50 border-blue-200";
    case "BLOCKED":
      return "text-red-700 bg-red-50 border-red-200";
    case "NOT_STARTED":
    default:
      return "text-gray-600 bg-gray-50 border-gray-200";
  }
}

export function healthColor(
  health: "ON_TRACK" | "AT_RISK" | "OVERDUE",
): string {
  switch (health) {
    case "ON_TRACK":
      return "text-green-700 bg-green-50 border-green-200";
    case "AT_RISK":
      return "text-amber-700 bg-amber-50 border-amber-200";
    case "OVERDUE":
      return "text-red-700 bg-red-50 border-red-200";
  }
}

export function healthLabel(
  health: "ON_TRACK" | "AT_RISK" | "OVERDUE",
): string {
  return { ON_TRACK: "On track", AT_RISK: "At risk", OVERDUE: "Overdue" }[
    health
  ];
}
