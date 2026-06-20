import { TASK_STATUSES, type TaskStatus } from "@/lib/close";
import { statusLabel } from "@/lib/utils";

/** Horizontal stacked bar + legend of the task counts per status. */
export function StatusBreakdown({
  byStatus,
  total,
}: {
  byStatus: Record<TaskStatus, number>;
  total: number;
}) {
  const segColor: Record<TaskStatus, string> = {
    DONE: "bg-green-500",
    IN_REVIEW: "bg-brand-500",
    IN_PROGRESS: "bg-blue-400",
    BLOCKED: "bg-red-400",
    NOT_STARTED: "bg-gray-300",
  };

  return (
    <div className="px-5 py-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {TASK_STATUSES.map((s) => {
          const pct = total === 0 ? 0 : (byStatus[s] / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={s}
              className={segColor[s]}
              style={{ width: `${pct}%` }}
              title={`${statusLabel(s)}: ${byStatus[s]}`}
            />
          );
        })}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        {TASK_STATUSES.map((s) => (
          <li key={s} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-gray-600">
              <span className={`h-2.5 w-2.5 rounded-full ${segColor[s]}`} />
              {statusLabel(s)}
            </span>
            <span className="font-semibold tabular-nums text-gray-900">
              {byStatus[s]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
