"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { formatPeriodLabel } from "@/lib/utils";

/**
 * Switches the active close period. The selected label is carried as a `period`
 * query param so dashboard/board pages are bookmarkable per cycle.
 */
export function PeriodSwitcher({
  periods,
  current,
  basePath,
}: {
  periods: { label: string; status: string }[];
  current: string;
  basePath: string;
}) {
  const router = useRouter();

  return (
    <div className="relative">
      <select
        value={current}
        onChange={(e) =>
          router.push(`${basePath}?period=${encodeURIComponent(e.target.value)}`)
        }
        className="appearance-none rounded-lg border border-gray-300 bg-white pl-3 pr-9 py-2 text-sm font-medium text-gray-900 shadow-sm hover:border-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {periods.map((p) => (
          <option key={p.label} value={p.label}>
            {formatPeriodLabel(p.label)}
            {p.status === "CLOSED" ? " (closed)" : ""}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    </div>
  );
}
