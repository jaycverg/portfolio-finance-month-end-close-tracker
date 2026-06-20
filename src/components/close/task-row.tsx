import Link from "next/link";
import { User, CalendarDays, AlertTriangle } from "lucide-react";
import type { CloseTaskRow } from "@/lib/queries";
import { isOverdue } from "@/lib/close";
import { formatDate, cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-pill";
import { ReadinessBadge } from "./readiness-badge";
import { TransitionControls } from "./transition-controls";

/**
 * A single task line: name, owner, due date, status + readiness, and inline
 * valid-transition controls. Links through to the task detail page.
 */
export function TaskRow({
  task,
  showControls = true,
}: {
  task: CloseTaskRow;
  showControls?: boolean;
}) {
  const overdue = isOverdue(task, new Date());

  return (
    <div className="flex flex-col gap-3 px-5 py-3.5 hover:bg-gray-50/60 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          href={`/board/${task.id}`}
          className="text-sm font-medium text-gray-900 hover:text-brand-700"
        >
          {task.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {task.owner}
          </span>
          <span
            className={cn(
              "flex items-center gap-1",
              overdue && "font-medium text-red-600",
            )}
          >
            <CalendarDays className="h-3 w-3" />
            Due {formatDate(task.dueDate)}
            {overdue && (
              <span className="inline-flex items-center gap-0.5">
                <AlertTriangle className="h-3 w-3" /> overdue
              </span>
            )}
          </span>
          {task.dependencyNames.length > 0 && (
            <span className="text-gray-400">
              depends on {task.dependencyNames.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        <ReadinessBadge readiness={task.readiness.readiness} />
        <StatusPill status={task.status} />
        {showControls && (
          <TransitionControls taskId={task.id} status={task.status} />
        )}
      </div>
    </div>
  );
}
