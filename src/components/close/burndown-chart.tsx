import type { BurndownPoint } from "@/lib/close";
import { formatDate } from "@/lib/utils";

/**
 * Inline-SVG burndown chart: an ideal straight line (total → 0) plus the actual
 * remaining-tasks line, which stops at "today". No charting dependency.
 */
export function BurndownChart({ points }: { points: BurndownPoint[] }) {
  const W = 640;
  const H = 220;
  const padX = 36;
  const padY = 20;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const maxY = Math.max(1, ...points.map((p) => p.ideal));
  const n = Math.max(1, points.length - 1);

  const x = (i: number) => padX + (i / n) * innerW;
  const y = (v: number) => padY + innerH - (v / maxY) * innerH;

  const idealPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.ideal)}`)
    .join(" ");

  const actualPts = points
    .map((p, i) => (p.remaining == null ? null : { i, v: p.remaining }))
    .filter((p): p is { i: number; v: number } => p != null);

  const actualPath = actualPts
    .map((p, k) => `${k === 0 ? "M" : "L"} ${x(p.i)} ${y(p.v)}`)
    .join(" ");

  const lastActual = actualPts[actualPts.length - 1];

  // y-axis gridlines at 0, 25, 50, 75, 100% of max.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f));

  return (
    <div className="px-5 py-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Burndown chart of tasks remaining versus the ideal line"
      >
        {/* gridlines + y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padX}
              x2={W - padX}
              y1={y(t)}
              y2={y(t)}
              stroke="#f1f5f9"
              strokeWidth={1}
            />
            <text x={4} y={y(t) + 3} fontSize={9} fill="#94a3b8">
              {t}
            </text>
          </g>
        ))}

        {/* ideal line */}
        <path
          d={idealPath}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={2}
          strokeDasharray="4 4"
        />

        {/* actual line */}
        {actualPath && (
          <path
            d={actualPath}
            fill="none"
            stroke="#4f46e5"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* current point marker */}
        {lastActual && (
          <circle cx={x(lastActual.i)} cy={y(lastActual.v)} r={4} fill="#4f46e5" />
        )}

        {/* x labels: first, middle, last */}
        {[0, Math.floor(n / 2), n].map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 4}
            fontSize={9}
            fill="#94a3b8"
            textAnchor="middle"
          >
            {formatDate(points[i].date)}
          </text>
        ))}
      </svg>

      <div className="flex items-center gap-5 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-brand-600" />
          Actual remaining
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-gray-300" />
          Ideal
        </span>
      </div>
    </div>
  );
}
