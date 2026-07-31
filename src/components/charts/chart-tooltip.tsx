"use client";

import { cn } from "@/lib/utils/cn";

/**
 * Only the fields this component actually reads.
 *
 * Recharts 3 widened `TooltipProps` — `labelFormatter` now takes
 * `(label: ReactNode, payload: Payload[])` and several props moved into context —
 * so extending it no longer typechecks against a narrow implementation. Declaring
 * the contract we depend on is both simpler and more honest: Recharts injects
 * `active`, `payload` and `label` structurally at runtime, and nothing else here
 * is used.
 */
interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  stroke?: string;
  dataKey?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: string | number;
  /** Appends a unit to each value, e.g. "h" or "%". */
  unit?: string;
  /** Renders a total row under the series list — for stacked/grouped charts. */
  showTotal?: boolean;
  /** Overrides the heading; defaults to the category label. */
  labelFormatter?: (label: string) => string;
}

/**
 * Themed tooltip.
 *
 * Recharts' default is white-on-white in dark mode and uses its own type scale,
 * so every chart passes `content={<ChartTooltip />}`. Values here *enhance* —
 * they are never the only way to read the data, since ChartFrame also ships a
 * table view.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  unit,
  showTotal = false,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  // Recharts includes hidden/zeroed entries; drop them so the card stays tight.
  const entries = payload.filter(
    (entry) => entry.value !== undefined && entry.value !== null && entry.name,
  );
  if (entries.length === 0) return null;

  const total = entries.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);

  return (
    <div
      className={cn(
        "pointer-events-none min-w-[9rem] rounded-lg border border-border bg-surface px-2.5 py-2 shadow-lg",
        "animate-fade-in",
      )}
    >
      {label !== undefined ? (
        <p className="mb-1.5 text-[11.5px] font-medium text-fg-subtle">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </p>
      ) : null}

      <ul className="space-y-1">
        {entries.map((entry, index) => (
          <li
            key={`${entry.name}-${index}`}
            className="flex items-center justify-between gap-3 text-[12.5px]"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: entry.color ?? entry.stroke ?? "var(--fg-subtle)" }}
              />
              {/* Text never wears the series colour — the swatch carries identity. */}
              <span className="truncate text-fg-muted">{entry.name}</span>
            </span>
            <span className="shrink-0 font-medium text-fg tabular-nums">
              {formatValue(entry.value)}
              {unit}
            </span>
          </li>
        ))}
      </ul>

      {showTotal && entries.length > 1 ? (
        <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border pt-1.5 text-[12.5px]">
          <span className="text-fg-muted">Total</span>
          <span className="font-semibold text-fg tabular-nums">
            {formatValue(total)}
            {unit}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value !== "number") return String(value ?? "—");
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(1);
}
