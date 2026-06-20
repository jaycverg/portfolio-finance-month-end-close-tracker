# Finance Month-End Close Workflow Tracker

> A controller's command center for the month-end close — every task with its owner, dependencies, due date, and status, tracked against the hard-close deadline with a live burndown.

The month-end close is a recurring, deadline-driven workflow: dozens of interdependent accounting tasks across bank recs, accruals, intercompany, fixed assets, revenue, and reporting, all of which must land before the books are locked. This app turns that into a visible, governed pipeline — tasks move through a strict status state machine, downstream work is gated on upstream completion, and a burndown shows whether the close is on track, at risk, or overdue.

The signature feature is a **pure, fully unit-tested close engine** (`src/lib/close.ts`): a task status state machine, dependency-readiness resolution, and close-progress/burndown math — zero I/O, zero framework coupling, 17 unit tests.

## Features

- **Close Dashboard** — StatCards (% complete, tasks done, overdue count, days to deadline), an inline-SVG **burndown chart** (actual remaining vs. the ideal line, stopping at "today"), a status breakdown bar, and the full checklist grouped by close area.
- **Task Board** — a status-column view of the cycle; advance any task through its valid transitions inline. Illegal moves never render as buttons and are rejected server-side.
- **Task Detail** — owner, due date, completion, plus the dependency web: what this task waits on and what it blocks, with readiness ("ready", "blocked by dependency", "explicitly blocked").
- **Period switcher** — flip between close cycles (a finished prior month and a live in-progress month); the selection is bookmarkable via a `?period=` query param.
- **Health signals** — on-track / at-risk / overdue, derived from the deadline, run-rate, blockers, and past-due tasks.
- **Realistic seed** — two full close cycles, 25 tasks each, with a genuine dependency graph, mixed statuses, and a couple of overdue items so every chart and list reads like a real close in flight.

## Run it

No Docker, no external services, no API keys.

```bash
cd finance-month-end-close-tracker
npm install
npm run db:push     # create the SQLite schema (dev.db)
npm run db:seed     # load 2 close cycles, 25 tasks each
npm run dev         # http://localhost:3000
```

Other scripts: `npm run test` (Vitest), `npm run build`, `npm run test:e2e` (Playwright smoke), `npm run db:studio` (Prisma Studio).

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript 5.7** (strict)
- **Prisma 6** ORM over **SQLite** (`file:./dev.db`)
- **Tailwind CSS 3** (indigo accent) + **lucide-react** icons + **sonner** toasts
- **zod** for validation, **clsx** + **tailwind-merge** for class composition
- **Vitest** for unit tests, **@playwright/test** for the smoke e2e

## Data model

Three tables (SQLite has no native enums, so "enum" fields are `String`, validated by a TS union + zod in the engine):

- **`ClosePeriod`** — one close cycle (`label` e.g. `2026-06`, `status` OPEN/IN_PROGRESS/CLOSED, `startDate`, `deadline`). The start/deadline drive the burndown x-axis and health math.
- **`CloseTask`** — a checklist item: `name`, `area`, `owner`, `status` (the state machine), `dueDate`, `order`, `completedAt` (stamped on DONE; powers the burndown), FK to its period.
- **`TaskDependency`** — a directed edge (`taskId` depends on `dependsOnTaskId`), modeling the close as a dependency graph. Two relations off `CloseTask` give each task both its `dependencies` and its `dependents`.

The seed dates everything relative to "today" so the in-progress cycle always reads as mid-close, with live overdue/at-risk signals whenever it's run.

## Architecture — the close engine

`src/lib/close.ts` is deliberately **pure**: no Prisma, no React, no `Date.now()` baked in (callers pass `now`). That makes it trivially testable and reusable on both server and client. It owns three concerns:

### 1. Task status state machine

```
NOT_STARTED → IN_PROGRESS
IN_PROGRESS → BLOCKED | IN_REVIEW
BLOCKED     ⇄ IN_PROGRESS
IN_REVIEW   → DONE          (approve)
IN_REVIEW   → IN_PROGRESS   (reject — sends work back, not to DONE)
DONE        → IN_PROGRESS   (reopen)
```

A single transition table drives everything: `allowedTransitions`, `canTransition`, and `applyTransition` (which throws `InvalidTransitionError` on an illegal move). The same table generates the UI — the board renders exactly one button per legal target with a human verb (`transitionLabel`: "Start", "Submit for review", "Approve", "Reject", "Unblock", "Reopen"). The engine is the **single source of truth**: the board never renders an invalid move, and the `PATCH /api/tasks/:id` handler re-validates with `applyTransition` and returns **422** if a client tries one anyway. Reaching `DONE` stamps `completedAt`; reopening clears it, keeping the burndown honest.

### 2. Dependency readiness

`resolveReadiness` computes, for every task, whether it's `READY` (all dependency tasks are DONE), `BLOCKED_BY_DEPENDENCY` (upstream work outstanding — and which tasks), `EXPLICITLY_BLOCKED` (a human flagged it), or `DONE`. The distinction between "waiting on a predecessor" and "a person raised a blocker" is surfaced so the controller can tell a process bottleneck from a people bottleneck. A missing dependency id is treated as still-blocking (fail-safe).

### 3. Progress + burndown math

- `computeProgress` → totals, % complete, per-status counts, overdue count, days-to-deadline, and overall **health**.
- `computeHealth` → `OVERDUE` (deadline passed with work left, or any task past due), `AT_RISK` (remaining tasks can't fit before the deadline at a ~one-task/day run-rate, or something's blocked), else `ON_TRACK`.
- `buildBurndown` → a per-day series from start to deadline: a straight **ideal** line (total → 0) plus the **actual** remaining count derived from each task's `completedAt`, with future days set to `null` so the actual line stops at "today".

Prisma is kept entirely out of the engine. `src/lib/queries.ts` is the seam: it loads rows and maps them into the engine's plain `TaskLike` shape, so the domain logic never imports the ORM.

## What I'd add next

- **Cycle detection** on the dependency graph so a bad import can't create an unresolvable deadlock.
- **Topological "critical path"** highlighting — surface the longest dependency chain to the deadline, since that's what actually gates the close.
- **Audit trail** for transitions (who moved what, when) and an activity feed on the task detail.
- **Templated close checklists** so a new period is generated from a reusable template instead of seeded.
- **Assignee-scoped views** and email/Slack nudges for owners of overdue or newly-unblocked tasks.
- **Server actions** in place of the REST `PATCH` route, with optimistic UI updates.
