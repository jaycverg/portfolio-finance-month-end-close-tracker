/**
 * Idempotent seed for the Month-End Close Tracker.
 *
 * Creates two close cycles:
 *   - "2026-05" — fully CLOSED (every task DONE, with realistic completedAt
 *     timestamps so its burndown reads like a finished, on-time close).
 *   - "2026-06" — IN_PROGRESS, mid-cycle: a mix of DONE / IN_REVIEW /
 *     IN_PROGRESS / BLOCKED / NOT_STARTED with a real dependency web, a couple
 *     of overdue items, so the dashboard, health, and burndown all look alive.
 *
 * Run with: npm run db:seed  (clears the three tables first, so it's repeatable).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Status =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "IN_REVIEW"
  | "DONE";

interface SeedTask {
  key: string; // local key used to wire dependencies
  name: string;
  area: string;
  owner: string;
  status: Status;
  /** Days offset from the period start for the due date. */
  dueOffset: number;
  /** Days offset from start for completedAt (only when DONE). */
  doneOffset?: number;
  dependsOn?: string[];
}

const OWNERS = {
  controller: "Dana Reyes (Controller)",
  seniorAcct: "Marcus Lee (Sr. Accountant)",
  staffAcct: "Priya Nair (Staff Accountant)",
  arLead: "Tom Becker (AR Lead)",
  apLead: "Elena Sokolova (AP Lead)",
  treasury: "Sam Ortiz (Treasury)",
  fpna: "Jordan Kim (FP&A)",
};

/**
 * The canonical close checklist. The same template seeds both periods; statuses
 * and completion are then tailored per period below.
 */
const TEMPLATE: Omit<SeedTask, "status" | "doneOffset">[] = [
  // ── Bank Recs ──
  { key: "bank_pull", name: "Pull all bank statements", area: "Bank Recs", owner: OWNERS.treasury, dueOffset: 1 },
  { key: "bank_op", name: "Reconcile operating account", area: "Bank Recs", owner: OWNERS.staffAcct, dueOffset: 2, dependsOn: ["bank_pull"] },
  { key: "bank_payroll", name: "Reconcile payroll account", area: "Bank Recs", owner: OWNERS.staffAcct, dueOffset: 2, dependsOn: ["bank_pull"] },
  { key: "bank_savings", name: "Reconcile savings & sweep accounts", area: "Bank Recs", owner: OWNERS.treasury, dueOffset: 3, dependsOn: ["bank_pull"] },
  { key: "bank_cc", name: "Reconcile corporate card clearing", area: "Bank Recs", owner: OWNERS.apLead, dueOffset: 3, dependsOn: ["bank_pull"] },

  // ── Accruals ──
  { key: "accr_expenses", name: "Book expense accruals", area: "Accruals", owner: OWNERS.seniorAcct, dueOffset: 4 },
  { key: "accr_payroll", name: "Accrue payroll & bonus", area: "Accruals", owner: OWNERS.seniorAcct, dueOffset: 4 },
  { key: "accr_prepaid", name: "Amortize prepaid expenses", area: "Accruals", owner: OWNERS.staffAcct, dueOffset: 4 },
  { key: "accr_review", name: "Review accrual schedule", area: "Accruals", owner: OWNERS.controller, dueOffset: 5, dependsOn: ["accr_expenses", "accr_payroll", "accr_prepaid"] },

  // ── Intercompany ──
  { key: "ic_invoices", name: "Issue intercompany invoices", area: "Intercompany", owner: OWNERS.seniorAcct, dueOffset: 3 },
  { key: "ic_match", name: "Match IC balances across entities", area: "Intercompany", owner: OWNERS.seniorAcct, dueOffset: 5, dependsOn: ["ic_invoices"] },
  { key: "ic_elim", name: "Post intercompany eliminations", area: "Intercompany", owner: OWNERS.controller, dueOffset: 6, dependsOn: ["ic_match"] },

  // ── Fixed Assets ──
  { key: "fa_additions", name: "Capitalize new fixed-asset additions", area: "Fixed Assets", owner: OWNERS.staffAcct, dueOffset: 3 },
  { key: "fa_disposals", name: "Record disposals & retirements", area: "Fixed Assets", owner: OWNERS.staffAcct, dueOffset: 3 },
  { key: "fa_depr", name: "Run depreciation & post entry", area: "Fixed Assets", owner: OWNERS.seniorAcct, dueOffset: 4, dependsOn: ["fa_additions", "fa_disposals"] },
  { key: "fa_roll", name: "Tie out fixed-asset rollforward", area: "Fixed Assets", owner: OWNERS.seniorAcct, dueOffset: 5, dependsOn: ["fa_depr"] },

  // ── Revenue ──
  { key: "rev_billing", name: "Finalize billing & invoicing", area: "Revenue", owner: OWNERS.arLead, dueOffset: 2 },
  { key: "rev_defer", name: "Calculate deferred revenue", area: "Revenue", owner: OWNERS.arLead, dueOffset: 4, dependsOn: ["rev_billing"] },
  { key: "rev_recognize", name: "Post revenue recognition entries", area: "Revenue", owner: OWNERS.seniorAcct, dueOffset: 5, dependsOn: ["rev_defer"] },
  { key: "rev_ar", name: "Reconcile AR subledger to GL", area: "Revenue", owner: OWNERS.arLead, dueOffset: 5, dependsOn: ["rev_billing"] },

  // ── Reporting ──
  { key: "rep_tb", name: "Generate preliminary trial balance", area: "Reporting", owner: OWNERS.controller, dueOffset: 6, dependsOn: ["accr_review", "ic_elim", "fa_roll", "rev_recognize", "bank_op"] },
  { key: "rep_flux", name: "Prepare flux / variance analysis", area: "Reporting", owner: OWNERS.fpna, dueOffset: 7, dependsOn: ["rep_tb"] },
  { key: "rep_pkg", name: "Build management reporting package", area: "Reporting", owner: OWNERS.fpna, dueOffset: 7, dependsOn: ["rep_flux"] },
  { key: "rep_review", name: "Controller final review & sign-off", area: "Reporting", owner: OWNERS.controller, dueOffset: 8, dependsOn: ["rep_pkg"] },
  { key: "rep_lock", name: "Lock the period in the GL", area: "Reporting", owner: OWNERS.controller, dueOffset: 8, dependsOn: ["rep_review"] },
];

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** "2026-05" style label from a date. */
function monthLabel(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Maps a template into a fully completed (CLOSED period) task set. */
function completedTasks(): SeedTask[] {
  return TEMPLATE.map((t) => ({
    ...t,
    status: "DONE" as Status,
    // Completed roughly on/near the due date — a clean on-time close.
    doneOffset: Math.max(0, t.dueOffset - (t.dueOffset % 2 === 0 ? 1 : 0)),
  }));
}

/**
 * Maps the template into a mid-cycle (IN_PROGRESS period) task set.
 * Status is assigned by key so the dependency web stays coherent
 * (e.g. downstream tasks aren't DONE before their predecessors).
 */
function inProgressTasks(): SeedTask[] {
  const done = new Set([
    "bank_pull",
    "bank_op",
    "bank_payroll",
    "bank_cc",
    "accr_expenses",
    "accr_prepaid",
    "ic_invoices",
    "fa_additions",
    "fa_disposals",
    "rev_billing",
  ]);
  const inReview = new Set(["accr_payroll", "rev_defer"]);
  const inProgress = new Set(["bank_savings", "fa_depr", "rev_ar", "ic_match"]);
  const blocked = new Set(["accr_review"]); // waiting on an external confirmation

  return TEMPLATE.map((t) => {
    let status: Status = "NOT_STARTED";
    let doneOffset: number | undefined;
    if (done.has(t.key)) {
      status = "DONE";
      doneOffset = Math.max(0, t.dueOffset - 1);
    } else if (inReview.has(t.key)) {
      status = "IN_REVIEW";
    } else if (inProgress.has(t.key)) {
      status = "IN_PROGRESS";
    } else if (blocked.has(t.key)) {
      status = "BLOCKED";
    }
    return { ...t, status, doneOffset };
  });
}

async function seedPeriod(
  label: string,
  status: string,
  startDate: Date,
  deadline: Date,
  tasks: SeedTask[],
) {
  const period = await prisma.closePeriod.create({
    data: { label, status, startDate, deadline },
  });

  // Insert tasks, remembering the generated id per template key.
  const idByKey = new Map<string, string>();
  let order = 0;
  for (const t of tasks) {
    const created = await prisma.closeTask.create({
      data: {
        periodId: period.id,
        name: t.name,
        area: t.area,
        owner: t.owner,
        status: t.status,
        dueDate: addDays(startDate, t.dueOffset),
        order: order++,
        completedAt:
          t.status === "DONE" && t.doneOffset != null
            ? addDays(startDate, t.doneOffset)
            : null,
      },
    });
    idByKey.set(t.key, created.id);
  }

  // Wire the dependency edges.
  for (const t of tasks) {
    if (!t.dependsOn) continue;
    for (const depKey of t.dependsOn) {
      const taskId = idByKey.get(t.key)!;
      const dependsOnTaskId = idByKey.get(depKey)!;
      await prisma.taskDependency.create({
        data: { taskId, dependsOnTaskId },
      });
    }
  }

  return period;
}

async function main() {
  // Idempotent: clear children first (FK order), then periods.
  await prisma.taskDependency.deleteMany();
  await prisma.closeTask.deleteMany();
  await prisma.closePeriod.deleteMany();

  // The seed is dated relative to "today" so the in-progress period always
  // reads as mid-cycle (with live overdue/at-risk signals) whenever it's run.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Prior month — fully closed, on time (started ~5 weeks ago). ──
  const priorStart = addDays(today, -35);
  await seedPeriod(
    monthLabel(priorStart),
    "CLOSED",
    priorStart,
    addDays(priorStart, 8),
    completedTasks(),
  );

  // ── Current close — in progress. Start is a few days back so part of the
  // checklist is due before "today", producing realistic overdue + at-risk
  // signals; the deadline is a few days out. ──
  const currentStart = addDays(today, -5);
  await seedPeriod(
    monthLabel(currentStart),
    "IN_PROGRESS",
    currentStart,
    addDays(currentStart, 8),
    inProgressTasks(),
  );

  const periods = await prisma.closePeriod.findMany({
    include: { _count: { select: { tasks: true } } },
  });
  for (const p of periods) {
    console.log(`Seeded ${p.label} (${p.status}) — ${p._count.tasks} tasks`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
