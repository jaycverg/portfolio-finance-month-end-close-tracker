/**
 * Server-side data access. Maps Prisma rows into the pure-domain `TaskLike`
 * shape that the close engine (lib/close.ts) operates on, keeping the engine
 * free of any Prisma coupling.
 */

import { prisma } from "./db";
import {
  type TaskLike,
  type TaskStatus,
  type PeriodStatus,
  resolveReadiness,
  computeProgress,
  buildBurndown,
  type TaskReadiness,
} from "./close";

export interface PeriodSummary {
  id: string;
  label: string;
  status: PeriodStatus;
  startDate: Date;
  deadline: Date;
}

export interface CloseTaskRow extends TaskLike {
  order: number;
  /** Names of the tasks this one depends on, for display. */
  dependencyNames: string[];
  readiness: TaskReadiness;
}

/** All periods, newest first (by label). */
export async function getPeriods(): Promise<PeriodSummary[]> {
  const rows = await prisma.closePeriod.findMany({
    orderBy: { label: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    status: r.status as PeriodStatus,
    startDate: r.startDate,
    deadline: r.deadline,
  }));
}

/** The period to show by default — the most recent non-CLOSED one, else newest. */
export async function getDefaultPeriod(): Promise<PeriodSummary | null> {
  const periods = await getPeriods();
  return periods.find((p) => p.status !== "CLOSED") ?? periods[0] ?? null;
}

export async function getPeriod(label: string): Promise<PeriodSummary | null> {
  const r = await prisma.closePeriod.findUnique({ where: { label } });
  if (!r) return null;
  return {
    id: r.id,
    label: r.label,
    status: r.status as PeriodStatus,
    startDate: r.startDate,
    deadline: r.deadline,
  };
}

/** Loads all tasks for a period as enriched rows (with readiness + dep names). */
export async function getTasksForPeriod(
  periodId: string,
): Promise<CloseTaskRow[]> {
  const rows = await prisma.closeTask.findMany({
    where: { periodId },
    orderBy: [{ area: "asc" }, { order: "asc" }],
    include: {
      dependencies: { include: { dependsOnTask: true } },
    },
  });

  const tasks: TaskLike[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    area: r.area,
    owner: r.owner,
    status: r.status as TaskStatus,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    dependsOn: r.dependencies.map((d) => d.dependsOnTaskId),
  }));

  const readiness = resolveReadiness(tasks);

  return rows.map((r, i) => ({
    ...tasks[i],
    order: r.order,
    dependencyNames: r.dependencies.map((d) => d.dependsOnTask.name),
    readiness: readiness.get(r.id)!,
  }));
}

/** Everything the dashboard needs for one period, computed server-side. */
export async function getPeriodDashboard(label: string) {
  const period = await getPeriod(label);
  if (!period) return null;

  const tasks = await getTasksForPeriod(period.id);
  const progress = computeProgress(tasks, period.deadline);
  const burndown = buildBurndown(tasks, period.startDate, period.deadline);

  return { period, tasks, progress, burndown };
}

/** A single task plus its sibling set (needed to recompute readiness). */
export async function getTaskWithSiblings(taskId: string) {
  const row = await prisma.closeTask.findUnique({
    where: { id: taskId },
    include: { dependencies: { include: { dependsOnTask: true } }, period: true },
  });
  if (!row) return null;

  const siblings = await getTasksForPeriod(row.periodId);
  const task = siblings.find((t) => t.id === taskId)!;
  return { task, siblings, period: row.period };
}
