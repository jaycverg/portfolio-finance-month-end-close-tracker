import { ListChecks } from "lucide-react";
import { getPeriods, getDefaultPeriod, getTasksForPeriod, getPeriod } from "@/lib/queries";
import { TASK_STATUSES, type TaskStatus } from "@/lib/close";
import { formatPeriodLabel, statusLabel } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodSwitcher } from "@/components/close/period-switcher";
import { TaskRow } from "@/components/close/task-row";

export const dynamic = "force-dynamic";

/** A kanban-style board: one column-card per status, tasks listed under each. */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const periods = await getPeriods();

  if (periods.length === 0) {
    return (
      <>
        <PageHeader title="Task Board" />
        <div className="p-6">
          <Card>
            <EmptyState
              title="No tasks yet"
              description="Run npm run db:seed to load sample close cycles."
              icon={<ListChecks className="h-8 w-8" />}
            />
          </Card>
        </div>
      </>
    );
  }

  const fallback = await getDefaultPeriod();
  const label =
    (periodParam && periods.some((p) => p.label === periodParam)
      ? periodParam
      : fallback?.label) ?? periods[0].label;

  const period = (await getPeriod(label))!;
  const tasks = await getTasksForPeriod(period.id);

  const columns: { status: TaskStatus; tasks: typeof tasks }[] = TASK_STATUSES.map(
    (status) => ({ status, tasks: tasks.filter((t) => t.status === status) }),
  );

  return (
    <>
      <PageHeader
        title="Task Board"
        subtitle={`${formatPeriodLabel(period.label)} — advance tasks through valid transitions`}
        action={
          <PeriodSwitcher periods={periods} current={period.label} basePath="/board" />
        }
      />

      <div className="space-y-5 p-4 sm:p-6">
        {columns.map(({ status, tasks: colTasks }) => (
          <Card key={status}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                {statusLabel(status)}
              </h3>
              <span className="text-xs font-medium text-gray-500 tabular-nums">
                {colTasks.length}
              </span>
            </div>
            {colTasks.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No tasks.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {colTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
