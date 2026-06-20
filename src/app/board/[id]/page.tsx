import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  User,
  CalendarDays,
  AlertTriangle,
  GitBranch,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { getTaskWithSiblings } from "@/lib/queries";
import { isOverdue } from "@/lib/close";
import {
  formatLongDate,
  formatPeriodLabel,
  statusLabel,
  cn,
} from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { ReadinessBadge } from "@/components/close/readiness-badge";
import { TransitionControls } from "@/components/close/transition-controls";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTaskWithSiblings(id);
  if (!data) notFound();

  const { task, siblings, period } = data;
  const byId = new Map(siblings.map((t) => [t.id, t]));
  const dependencies = task.dependsOn
    .map((depId) => byId.get(depId))
    .filter((t): t is (typeof siblings)[number] => Boolean(t));
  const dependents = siblings.filter((t) => t.dependsOn.includes(task.id));
  const overdue = isOverdue(task, new Date());

  return (
    <>
      <PageHeader
        title={task.name}
        subtitle={`${task.area} · ${formatPeriodLabel(period.label)} close`}
        action={
          <Link
            href="/board"
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to board
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-3">
        {/* Main */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Status" subtitle="Advance via valid transitions only" />
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={task.status} />
                <ReadinessBadge readiness={task.readiness.readiness} />
              </div>

              {task.readiness.readiness === "BLOCKED_BY_DEPENDENCY" && (
                <p className="text-sm text-amber-700">
                  Waiting on{" "}
                  {task.readiness.blockingDependencies
                    .map((depId) => byId.get(depId)?.name ?? "an upstream task")
                    .join(", ")}{" "}
                  to be marked done.
                </p>
              )}

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Actions
                </p>
                <TransitionControls
                  taskId={task.id}
                  status={task.status}
                  size="md"
                />
              </div>
            </div>
          </Card>

          {/* Dependencies */}
          <Card>
            <CardHeader
              title="Dependencies"
              subtitle="These must be done before this task is ready"
            />
            {dependencies.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">
                No dependencies — this task can start anytime.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {dependencies.map((dep) => (
                  <li
                    key={dep.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <Link
                      href={`/board/${dep.id}`}
                      className="flex items-center gap-2 text-sm text-gray-900 hover:text-brand-700"
                    >
                      {dep.status === "DONE" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-500" />
                      )}
                      {dep.name}
                    </Link>
                    <StatusPill status={dep.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Dependents */}
          {dependents.length > 0 && (
            <Card>
              <CardHeader
                title="Blocks"
                subtitle="Tasks waiting on this one"
              />
              <ul className="divide-y divide-gray-100">
                {dependents.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <Link
                      href={`/board/${d.id}`}
                      className="flex items-center gap-2 text-sm text-gray-900 hover:text-brand-700"
                    >
                      <GitBranch className="h-4 w-4 text-gray-400" />
                      {d.name}
                    </Link>
                    <StatusPill status={d.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Sidebar meta */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-4 px-5 py-4 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Owner
                </dt>
                <dd className="mt-1 flex items-center gap-2 text-gray-900">
                  <User className="h-4 w-4 text-gray-400" />
                  {task.owner}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Due date
                </dt>
                <dd
                  className={cn(
                    "mt-1 flex items-center gap-2 text-gray-900",
                    overdue && "font-medium text-red-600",
                  )}
                >
                  <CalendarDays className="h-4 w-4 text-gray-400" />
                  {formatLongDate(task.dueDate)}
                  {overdue && <AlertTriangle className="h-4 w-4" />}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Close area
                </dt>
                <dd className="mt-1 text-gray-900">{task.area}</dd>
              </div>
              {task.completedAt && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Completed
                  </dt>
                  <dd className="mt-1 text-gray-900">
                    {formatLongDate(task.completedAt)}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Current status
                </dt>
                <dd className="mt-1 text-gray-900">{statusLabel(task.status)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
