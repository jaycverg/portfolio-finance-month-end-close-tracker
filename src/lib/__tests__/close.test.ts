import { describe, it, expect } from "vitest";
import {
  allowedTransitions,
  canTransition,
  applyTransition,
  InvalidTransitionError,
  transitionLabel,
  resolveReadiness,
  computeProgress,
  computeHealth,
  isOverdue,
  daysBetween,
  buildBurndown,
  groupByArea,
  type TaskLike,
  type TaskStatus,
} from "../close";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function task(overrides: Partial<TaskLike> & { id: string }): TaskLike {
  return {
    name: `Task ${overrides.id}`,
    area: "Bank Recs",
    owner: "A. Controller",
    status: "NOT_STARTED",
    dueDate: new Date("2026-06-05"),
    completedAt: null,
    dependsOn: [],
    ...overrides,
  };
}

// ─── 1. State machine ─────────────────────────────────────────────────────────

describe("state machine", () => {
  it("permits the documented happy-path transitions", () => {
    expect(canTransition("NOT_STARTED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "IN_REVIEW")).toBe(true);
    expect(canTransition("IN_PROGRESS", "BLOCKED")).toBe(true);
    expect(canTransition("BLOCKED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_REVIEW", "DONE")).toBe(true);
  });

  it("sends a rejected review back to IN_PROGRESS, not DONE", () => {
    expect(canTransition("IN_REVIEW", "IN_PROGRESS")).toBe(true);
    expect(transitionLabel("IN_REVIEW", "IN_PROGRESS")).toBe("Reject");
    expect(transitionLabel("IN_REVIEW", "DONE")).toBe("Approve");
  });

  it("rejects illegal transitions", () => {
    // Cannot skip straight from NOT_STARTED to DONE.
    expect(canTransition("NOT_STARTED", "DONE")).toBe(false);
    // Cannot go from NOT_STARTED to IN_REVIEW.
    expect(canTransition("NOT_STARTED", "IN_REVIEW")).toBe(false);
    // Cannot block something that hasn't started.
    expect(canTransition("NOT_STARTED", "BLOCKED")).toBe(false);
    // DONE cannot jump to IN_REVIEW (only reopen to IN_PROGRESS).
    expect(canTransition("DONE", "IN_REVIEW")).toBe(false);
    // A no-op is not a valid transition.
    expect(canTransition("IN_PROGRESS", "IN_PROGRESS")).toBe(false);
  });

  it("applyTransition throws InvalidTransitionError on an illegal move", () => {
    expect(() => applyTransition("NOT_STARTED", "DONE")).toThrow(
      InvalidTransitionError,
    );
    expect(applyTransition("NOT_STARTED", "IN_PROGRESS")).toBe("IN_PROGRESS");
  });

  it("exposes exactly the allowed targets per state", () => {
    const expected: Record<TaskStatus, TaskStatus[]> = {
      NOT_STARTED: ["IN_PROGRESS"],
      IN_PROGRESS: ["BLOCKED", "IN_REVIEW"],
      BLOCKED: ["IN_PROGRESS"],
      IN_REVIEW: ["DONE", "IN_PROGRESS"],
      DONE: ["IN_PROGRESS"],
    };
    for (const [from, targets] of Object.entries(expected)) {
      expect(allowedTransitions(from as TaskStatus)).toEqual(targets);
    }
  });
});

// ─── 2. Dependency resolution ─────────────────────────────────────────────────

describe("dependency resolution", () => {
  it("marks a task READY only when all dependencies are DONE", () => {
    const tasks = [
      task({ id: "a", status: "DONE" }),
      task({ id: "b", status: "DONE" }),
      task({ id: "c", dependsOn: ["a", "b"] }),
    ];
    const r = resolveReadiness(tasks);
    expect(r.get("c")!.readiness).toBe("READY");
    expect(r.get("c")!.blockingDependencies).toEqual([]);
  });

  it("flags a task BLOCKED_BY_DEPENDENCY and lists the unfinished deps", () => {
    const tasks = [
      task({ id: "a", status: "DONE" }),
      task({ id: "b", status: "IN_PROGRESS" }),
      task({ id: "c", dependsOn: ["a", "b"] }),
    ];
    const c = resolveReadiness(tasks).get("c")!;
    expect(c.readiness).toBe("BLOCKED_BY_DEPENDENCY");
    expect(c.blockingDependencies).toEqual(["b"]);
  });

  it("distinguishes an explicit human block from a dependency block", () => {
    const tasks = [
      task({ id: "a", status: "DONE" }),
      task({ id: "b", status: "BLOCKED", dependsOn: ["a"] }),
    ];
    // Deps are satisfied, but a human raised a blocker → EXPLICITLY_BLOCKED.
    expect(resolveReadiness(tasks).get("b")!.readiness).toBe(
      "EXPLICITLY_BLOCKED",
    );
  });

  it("treats a missing dependency as still blocking", () => {
    const tasks = [task({ id: "c", dependsOn: ["ghost"] })];
    const c = resolveReadiness(tasks).get("c")!;
    expect(c.readiness).toBe("BLOCKED_BY_DEPENDENCY");
    expect(c.blockingDependencies).toEqual(["ghost"]);
  });
});

// ─── 3. Progress + health math ────────────────────────────────────────────────

describe("progress + overdue math", () => {
  const deadline = new Date("2026-06-10");

  it("computes percent complete and status counts", () => {
    const tasks = [
      task({ id: "1", status: "DONE" }),
      task({ id: "2", status: "DONE" }),
      task({ id: "3", status: "IN_PROGRESS" }),
      task({ id: "4", status: "NOT_STARTED" }),
    ];
    const p = computeProgress(tasks, deadline, new Date("2026-06-01"));
    expect(p.total).toBe(4);
    expect(p.done).toBe(2);
    expect(p.percentComplete).toBe(50);
    expect(p.byStatus.DONE).toBe(2);
    expect(p.byStatus.IN_PROGRESS).toBe(1);
    expect(p.byStatus.NOT_STARTED).toBe(1);
  });

  it("counts overdue tasks (not DONE, past due) and ignores DONE ones", () => {
    const now = new Date("2026-06-06");
    const overdueOpen = task({
      id: "1",
      status: "IN_PROGRESS",
      dueDate: new Date("2026-06-01"),
    });
    const overdueButDone = task({
      id: "2",
      status: "DONE",
      dueDate: new Date("2026-06-01"),
    });
    const future = task({
      id: "3",
      status: "NOT_STARTED",
      dueDate: new Date("2026-06-09"),
    });
    expect(isOverdue(overdueOpen, now)).toBe(true);
    expect(isOverdue(overdueButDone, now)).toBe(false);
    expect(isOverdue(future, now)).toBe(false);
    expect(
      computeProgress([overdueOpen, overdueButDone, future], deadline, now)
        .overdueCount,
    ).toBe(1);
  });

  it("derives health: ON_TRACK, AT_RISK, and OVERDUE", () => {
    const now = new Date("2026-06-01");

    // All done → on track.
    expect(
      computeHealth([task({ id: "1", status: "DONE" })], deadline, now),
    ).toBe("ON_TRACK");

    // A task past due → overdue.
    const od = [
      task({ id: "1", status: "IN_PROGRESS", dueDate: new Date("2026-05-20") }),
    ];
    expect(computeHealth(od, deadline, now)).toBe("OVERDUE");

    // More remaining tasks than days left (9 days to deadline) → at risk.
    const many = Array.from({ length: 20 }, (_, i) =>
      task({ id: `t${i}`, status: "NOT_STARTED", dueDate: deadline }),
    );
    expect(computeHealth(many, deadline, now)).toBe("AT_RISK");

    // A blocked task with room to spare → at risk.
    const blocked = [
      task({ id: "1", status: "BLOCKED", dueDate: deadline }),
    ];
    expect(computeHealth(blocked, deadline, now)).toBe("AT_RISK");
  });

  it("flags OVERDUE when the deadline itself has passed with work left", () => {
    const tasks = [task({ id: "1", status: "IN_PROGRESS", dueDate: deadline })];
    const afterDeadline = new Date("2026-06-15");
    expect(computeHealth(tasks, deadline, afterDeadline)).toBe("OVERDUE");
  });
});

// ─── daysBetween + burndown ───────────────────────────────────────────────────

describe("daysBetween", () => {
  it("returns signed whole-day differences", () => {
    expect(daysBetween(new Date("2026-06-01"), new Date("2026-06-05"))).toBe(4);
    expect(daysBetween(new Date("2026-06-05"), new Date("2026-06-01"))).toBe(-4);
    expect(daysBetween(new Date("2026-06-01"), new Date("2026-06-01"))).toBe(0);
  });
});

describe("burndown", () => {
  const start = new Date("2026-06-01");
  const deadline = new Date("2026-06-05");

  it("produces a point per day with an ideal line from total to zero", () => {
    const tasks = Array.from({ length: 4 }, (_, i) =>
      task({ id: `t${i}` }),
    );
    const series = buildBurndown(tasks, start, deadline, start);
    expect(series).toHaveLength(5); // inclusive of both endpoints
    expect(series[0].ideal).toBe(4);
    expect(series[series.length - 1].ideal).toBe(0);
  });

  it("tracks actual remaining from completedAt and stops at 'now'", () => {
    const tasks = [
      task({ id: "1", status: "DONE", completedAt: new Date("2026-06-02") }),
      task({ id: "2", status: "DONE", completedAt: new Date("2026-06-03") }),
      task({ id: "3", status: "IN_PROGRESS" }),
    ];
    const now = new Date("2026-06-03");
    const series = buildBurndown(tasks, start, deadline, now);

    // Day 0 (Jun 1): nothing completed yet → 3 remaining.
    expect(series[0].remaining).toBe(3);
    // Day 2 (Jun 3): two completed → 1 remaining.
    expect(series[2].remaining).toBe(1);
    // Day 3 (Jun 4) is after `now` → actual line is null (unknown future).
    expect(series[3].remaining).toBeNull();
  });
});

// ─── Grouping ─────────────────────────────────────────────────────────────────

describe("groupByArea", () => {
  it("groups tasks by area in canonical order, dropping empty areas", () => {
    const tasks = [
      task({ id: "1", area: "Reporting", name: "Flux analysis" }),
      task({ id: "2", area: "Bank Recs", name: "Reconcile checking" }),
      task({ id: "3", area: "Bank Recs", name: "Reconcile savings" }),
    ];
    const groups = groupByArea(tasks);
    expect(groups.map((g) => g.area)).toEqual(["Bank Recs", "Reporting"]);
    expect(groups[0].tasks).toHaveLength(2);
  });
});
