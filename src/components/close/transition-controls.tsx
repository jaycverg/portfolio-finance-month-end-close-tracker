"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  type TaskStatus,
  allowedTransitions,
  transitionLabel,
} from "@/lib/close";
import { cn } from "@/lib/utils";

/**
 * Renders one button per *valid* transition from the current status. Buttons for
 * invalid transitions never appear; while a request is in flight everything is
 * disabled. A toast confirms (or surfaces a server rejection of) the change.
 */
export function TransitionControls({
  taskId,
  status,
  size = "sm",
}: {
  taskId: string;
  status: TaskStatus;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const targets = allowedTransitions(status);
  if (targets.length === 0) return null;

  async function move(to: TaskStatus) {
    setPending(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Could not update task.");
        return;
      }
      toast.success(`${transitionLabel(status, to)} — task updated.`);
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const isDanger = (to: TaskStatus) => to === "BLOCKED";
  const isPrimary = (to: TaskStatus) =>
    (status === "IN_REVIEW" && to === "DONE") ||
    (status === "NOT_STARTED" && to === "IN_PROGRESS");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {targets.map((to) => (
        <button
          key={to}
          disabled={pending}
          onClick={() => move(to)}
          className={cn(
            "rounded-md border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
            isPrimary(to)
              ? "border-brand-600 bg-brand-600 text-white hover:bg-brand-700"
              : isDanger(to)
                ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
          )}
        >
          {transitionLabel(status, to)}
        </button>
      ))}
    </div>
  );
}
