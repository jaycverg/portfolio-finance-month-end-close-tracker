import { Lock, CircleAlert, CircleCheck, CircleDot } from "lucide-react";
import type { Readiness } from "@/lib/close";
import { Badge } from "@/components/ui/badge";

const MAP: Record<
  Readiness,
  { label: string; className: string; icon: React.ReactNode }
> = {
  READY: {
    label: "Ready",
    className: "text-green-700 bg-green-50 border-green-200",
    icon: <CircleDot className="h-3 w-3" />,
  },
  BLOCKED_BY_DEPENDENCY: {
    label: "Waiting on deps",
    className: "text-amber-700 bg-amber-50 border-amber-200",
    icon: <Lock className="h-3 w-3" />,
  },
  EXPLICITLY_BLOCKED: {
    label: "Blocked",
    className: "text-red-700 bg-red-50 border-red-200",
    icon: <CircleAlert className="h-3 w-3" />,
  },
  DONE: {
    label: "Done",
    className: "text-gray-500 bg-gray-50 border-gray-200",
    icon: <CircleCheck className="h-3 w-3" />,
  },
};

export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  const cfg = MAP[readiness];
  return (
    <Badge className={cfg.className}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}
