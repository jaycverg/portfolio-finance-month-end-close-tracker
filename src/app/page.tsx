import {
  CheckCircle2,
  ListChecks,
  AlertTriangle,
  CalendarClock,
} from "lucide-react";
import {
  getPeriods,
  getDefaultPeriod,
  getPeriodDashboard,
} from "@/lib/queries";
import { groupByArea } from "@/lib/close";
import { formatPeriodLabel, formatLongDate, healthColor, healthLabel } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodSwitcher } from "@/components/close/period-switcher";
import { BurndownChart } from "@/components/close/burndown-chart";
import { StatusBreakdown } from "@/components/close/status-breakdown";
import { TaskRow } from "@/components/close/task-row";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const periods = await getPeriods();

  if (periods.length === 0) {
    return (
      <>
        <PageHeader title="Close Dashboard" />
        <div className="p-6">
          <Card>
            <EmptyState
              title="No close periods yet"
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

  const data = await getPeriodDashboard(label);
  if (!data) return null;
  const { period, tasks, progress, burndown } = data;

  const grouped = groupByArea(tasks);

  return (
    <>
      <PageHeader
        title="Close Dashboard"
        subtitle={`${formatPeriodLabel(period.label)} month-end close`}
        action={
          <>
            <Badge className={healthColor(progress.health)}>
              {healthLabel(progress.health)}
            </Badge>
            <PeriodSwitcher
              periods={periods}
              current={period.label}
              basePath="/"
            />
          </>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Progress"
            value={`${progress.percentComplete}%`}
            sub={`${progress.done} of ${progress.total} tasks done`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            accent={progress.percentComplete === 100 ? "good" : "default"}
          />
          <StatCard
            label="Tasks done"
            value={`${progress.done}/${progress.total}`}
            sub={`${progress.byStatus.IN_PROGRESS} in progress · ${progress.byStatus.IN_REVIEW} in review`}
            icon={<ListChecks className="h-4 w-4" />}
          />
          <StatCard
            label="Overdue"
            value={progress.overdueCount}
            sub={progress.overdueCount > 0 ? "past due, not done" : "nothing past due"}
            icon={<AlertTriangle className="h-4 w-4" />}
            accent={progress.overdueCount > 0 ? "bad" : "good"}
          />
          <StatCard
            label="Days to deadline"
            value={progress.daysToDeadline}
            sub={`hard close ${formatLongDate(period.deadline)}`}
            icon={<CalendarClock className="h-4 w-4" />}
            accent={
              progress.daysToDeadline < 0
                ? "bad"
                : progress.daysToDeadline <= 2
                  ? "warn"
                  : "default"
            }
          />
        </div>

        {/* Burndown + status breakdown */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Burndown"
              subtitle="Tasks remaining vs. the ideal line to deadline"
            />
            <BurndownChart points={burndown} />
          </Card>
          <Card>
            <CardHeader title="Status breakdown" subtitle="Tasks by status" />
            <StatusBreakdown byStatus={progress.byStatus} total={progress.total} />
          </Card>
        </div>

        {/* Task list grouped by area */}
        <div className="space-y-6">
          {grouped.map(({ area, tasks: areaTasks }) => {
            const doneInArea = areaTasks.filter((t) => t.status === "DONE").length;
            return (
              <Card key={area}>
                <CardHeader
                  title={area}
                  action={
                    <span className="text-xs font-medium text-gray-500 tabular-nums">
                      {doneInArea}/{areaTasks.length} done
                    </span>
                  }
                />
                <div className="divide-y divide-gray-100">
                  {areaTasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
