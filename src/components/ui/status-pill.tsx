import type { TaskStatus } from "@/lib/close";
import { statusColor, statusLabel } from "@/lib/utils";
import { Badge } from "./badge";

export function StatusPill({ status }: { status: TaskStatus }) {
  return <Badge className={statusColor(status)}>{statusLabel(status)}</Badge>;
}
