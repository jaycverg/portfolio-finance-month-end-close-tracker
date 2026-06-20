/**
 * Close-cycle state + progress engine.
 *
 * This module is the signature feature of the tracker. It is intentionally
 * PURE (no Prisma, no I/O) so it is trivially unit-testable and reusable on the
 * server or client. It owns three concerns:
 *
 *   1. The task status state machine (validated transitions).
 *   2. Dependency resolution (when is a task "ready" to be worked?).
 *   3. Close progress + burndown math (against due dates and the deadline).
 */

import { z } from "zod";

// ─── Domain types ───────────────────────────────────────────────────────────

export const TASK_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "DONE",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const taskStatusSchema = z.enum(TASK_STATUSES);

export const CLOSE_AREAS = [
  "Bank Recs",
  "Accruals",
  "Intercompany",
  "Fixed Assets",
  "Revenue",
  "Reporting",
] as const;
export type CloseArea = (typeof CLOSE_AREAS)[number];
export const closeAreaSchema = z.enum(CLOSE_AREAS);

export const PERIOD_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];
export const periodStatusSchema = z.enum(PERIOD_STATUSES);

/** The minimal task shape the engine reasons about. */
export interface TaskLike {
  id: string;
  name: string;
  area: string;
  owner: string;
  status: TaskStatus;
  dueDate: Date;
  completedAt?: Date | null;
  /** IDs of tasks that must be DONE before this one is ready. */
  dependsOn: string[];
}

// ─── 1. State machine ─────────────────────────────────────────────────────────

/**
 * Allowed status transitions.
 *
 *   NOT_STARTED → IN_PROGRESS
 *   IN_PROGRESS → BLOCKED | IN_REVIEW
 *   BLOCKED     → IN_PROGRESS
 *   IN_REVIEW   → DONE        (approve)
 *   IN_REVIEW   → IN_PROGRESS (reject — sends work back)
 *   DONE        → IN_PROGRESS (reopen)
 */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NOT_STARTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["BLOCKED", "IN_REVIEW"],
  BLOCKED: ["IN_PROGRESS"],
  IN_REVIEW: ["DONE", "IN_PROGRESS"],
  DONE: ["IN_PROGRESS"],
};

/** Returns the list of statuses a task may legally move to from `from`. */
export function allowedTransitions(from: TaskStatus): TaskStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** True if `from → to` is a valid state-machine transition. */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return allowedTransitions(from).includes(to);
}

/**
 * Validates a transition and returns the new status, or throws if illegal.
 * Use this as the single guard around any status mutation.
 */
export function applyTransition(from: TaskStatus, to: TaskStatus): TaskStatus {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: TaskStatus,
    public readonly to: TaskStatus,
  ) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** Human-friendly verb for a transition button (e.g. "Start", "Approve"). */
export function transitionLabel(from: TaskStatus, to: TaskStatus): string {
  if (from === "NOT_STARTED" && to === "IN_PROGRESS") return "Start";
  if (to === "BLOCKED") return "Mark blocked";
  if (from === "BLOCKED" && to === "IN_PROGRESS") return "Unblock";
  if (to === "IN_REVIEW") return "Submit for review";
  if (from === "IN_REVIEW" && to === "DONE") return "Approve";
  if (from === "IN_REVIEW" && to === "IN_PROGRESS") return "Reject";
  if (from === "DONE" && to === "IN_PROGRESS") return "Reopen";
  return `→ ${to}`;
}

// ─── 2. Dependency resolution ─────────────────────────────────────────────────

export type Readiness =
  | "READY" // all deps DONE, can be worked
  | "BLOCKED_BY_DEPENDENCY" // one or more deps not yet DONE
  | "EXPLICITLY_BLOCKED" // human flagged it BLOCKED
  | "DONE"; // already finished

export interface TaskReadiness {
  taskId: string;
  readiness: Readiness;
  /** Dependency tasks that are not yet DONE (drives "blocked by X, Y"). */
  blockingDependencies: string[];
}

/**
 * Computes readiness for every task. A task is READY only when all of its
 * dependency tasks are DONE. We surface BLOCKED_BY_DEPENDENCY (waiting on
 * upstream work) separately from EXPLICITLY_BLOCKED (a human raised a blocker)
 * so the controller can tell "stuck on a person" from "stuck on a predecessor".
 */
export function resolveReadiness(tasks: TaskLike[]): Map<string, TaskReadiness> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const result = new Map<string, TaskReadiness>();

  for (const task of tasks) {
    const blockingDependencies = task.dependsOn.filter((depId) => {
      const dep = byId.get(depId);
      return !dep || dep.status !== "DONE";
    });

    let readiness: Readiness;
    if (task.status === "DONE") {
      readiness = "DONE";
    } else if (task.status === "BLOCKED") {
      readiness = "EXPLICITLY_BLOCKED";
    } else if (blockingDependencies.length > 0) {
      readiness = "BLOCKED_BY_DEPENDENCY";
    } else {
      readiness = "READY";
    }

    result.set(task.id, { taskId: task.id, readiness, blockingDependencies });
  }

  return result;
}

/** Convenience: readiness for a single task within its peer set. */
export function taskReadiness(
  task: TaskLike,
  allTasks: TaskLike[],
): TaskReadiness {
  return resolveReadiness(allTasks).get(task.id)!;
}

// ─── 3. Progress + health math ────────────────────────────────────────────────

export type CloseHealth = "ON_TRACK" | "AT_RISK" | "OVERDUE";

export interface CloseProgress {
  total: number;
  done: number;
  /** 0–100, rounded. */
  percentComplete: number;
  /** Count of tasks per status. */
  byStatus: Record<TaskStatus, number>;
  /** Tasks past their due date and not DONE. */
  overdueCount: number;
  /** Whole days from `now` to the close deadline (negative if past). */
  daysToDeadline: number;
  health: CloseHealth;
}

/** Whole days between two dates (b - a), truncated toward zero at day granularity. */
export function daysBetween(a: Date, b: Date): number {
  const dayA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const dayB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((dayB - dayA) / 86_400_000);
}

/** A task is overdue if it is not DONE and its due date is before `now`. */
export function isOverdue(task: TaskLike, now: Date): boolean {
  return task.status !== "DONE" && daysBetween(now, task.dueDate) < 0;
}

function emptyByStatus(): Record<TaskStatus, number> {
  return {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    BLOCKED: 0,
    IN_REVIEW: 0,
    DONE: 0,
  };
}

/**
 * Determines overall close health:
 *   - OVERDUE  : the deadline has passed with work remaining, OR any task is overdue.
 *   - AT_RISK  : on the current run-rate, remaining work won't fit before the
 *                deadline (more tasks left than days remaining), or a task is blocked.
 *   - ON_TRACK : otherwise.
 */
export function computeHealth(
  tasks: TaskLike[],
  deadline: Date,
  now: Date,
): CloseHealth {
  const remaining = tasks.filter((t) => t.status !== "DONE");
  if (remaining.length === 0) return "ON_TRACK";

  const daysLeft = daysBetween(now, deadline);
  const anyOverdue = tasks.some((t) => isOverdue(t, now));

  if (daysLeft < 0 || anyOverdue) return "OVERDUE";

  const anyBlocked = remaining.some((t) => t.status === "BLOCKED");
  // Simple run-rate check: can the remaining tasks physically fit before the
  // deadline at a sustainable ~one-task-per-day cadence?
  if (anyBlocked || remaining.length > daysLeft) return "AT_RISK";

  return "ON_TRACK";
}

/** Aggregate progress snapshot for a close period. */
export function computeProgress(
  tasks: TaskLike[],
  deadline: Date,
  now: Date = new Date(),
): CloseProgress {
  const byStatus = emptyByStatus();
  for (const t of tasks) byStatus[t.status]++;

  const total = tasks.length;
  const done = byStatus.DONE;
  const percentComplete = total === 0 ? 0 : Math.round((done / total) * 100);
  const overdueCount = tasks.filter((t) => isOverdue(t, now)).length;
  const daysToDeadline = daysBetween(now, deadline);
  const health = computeHealth(tasks, deadline, now);

  return {
    total,
    done,
    percentComplete,
    byStatus,
    overdueCount,
    daysToDeadline,
    health,
  };
}

// ─── Burndown ─────────────────────────────────────────────────────────────────

export interface BurndownPoint {
  date: Date;
  /** Tasks still open at end of this day (actual). Null for future days. */
  remaining: number | null;
  /** The ideal straight-line remaining count for this day. */
  ideal: number;
}

/**
 * Builds a burndown series from `startDate` to `deadline` (inclusive).
 *
 *   - `ideal`     : a straight line from total → 0 across the window.
 *   - `remaining` : actual open tasks at the end of each day, derived from each
 *                   task's completedAt. Days strictly after `now` are null so the
 *                   actual line stops at "today" rather than implying the future.
 */
export function buildBurndown(
  tasks: TaskLike[],
  startDate: Date,
  deadline: Date,
  now: Date = new Date(),
): BurndownPoint[] {
  const total = tasks.length;
  const span = Math.max(1, daysBetween(startDate, deadline));
  const points: BurndownPoint[] = [];

  for (let i = 0; i <= span; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    const ideal = Math.max(0, total - (total * i) / span);

    let remaining: number | null = null;
    if (daysBetween(date, now) >= 0) {
      // Count tasks NOT completed on or before this day.
      const completedByNow = tasks.filter(
        (t) => t.completedAt != null && daysBetween(t.completedAt, date) >= 0,
      ).length;
      remaining = total - completedByNow;
    }

    points.push({ date, remaining, ideal: Math.round(ideal * 10) / 10 });
  }

  return points;
}

// ─── Grouping helper ──────────────────────────────────────────────────────────

/**
 * Groups tasks by close area, preserving the canonical area order and the
 * caller's concrete task type (e.g. enriched rows), dropping empty areas.
 */
export function groupByArea<T extends Pick<TaskLike, "area" | "name">>(
  tasks: T[],
): Array<{ area: CloseArea; tasks: T[] }> {
  return CLOSE_AREAS.map((area) => ({
    area,
    tasks: tasks
      .filter((t) => t.area === area)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.tasks.length > 0);
}
