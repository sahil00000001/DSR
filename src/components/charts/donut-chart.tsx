"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { formatNumber, percentage } from "@/lib/utils/format";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/**
 * Part-to-whole snapshot. Six segments maximum — past that adjacent slices blur
 * and a bar chart or table is the honest form. Segments are separated by
 * `paddingAngle`, which is real surface gap rather than a stroke.
 *
 * The centre carries the headline number so the chart answers its own question
 * without the reader estimating angles.
 */
export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  unit,
}: {
  slices: DonutSlice[];
  centerLabel?: string;
  centerValue?: string;
  unit?: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            strokeWidth={0}
            startAngle={90}
            endAngle={-270}
            isAnimationActive
            animationDuration={600}
          >
            {slices.map((slice) => (
              <Cell key={slice.label} fill={slice.color} />
            ))}
          </Pie>
          <RechartsTooltip
            content={
              <ChartTooltip
                unit={unit}
                labelFormatter={() => (total > 0 ? `of ${formatNumber(total)}` : "")}
              />
            }
          />
        </PieChart>
      </ResponsiveContainer>

      {centerValue !== undefined ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            {/* Proportional figures: tabular-nums makes a big number look loose. */}
            <p className="text-2xl leading-none font-semibold text-fg">{centerValue}</p>
            {centerLabel ? (
              <p className="mt-1 text-[11.5px] text-fg-subtle">{centerLabel}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Composition bar — a horizontal 100% stacked bar built from plain elements.
 *
 * Deliberately not a recharts stacked bar: SVG stacking can only be separated
 * with a stroke around each segment, and a stroke adds ink that isn't data.
 * Flex children with a real 2px gap give the correct surface separation, and it
 * renders far cheaper than a chart for what is essentially a ratio.
 */
export function CompositionBar({
  segments,
  height = 8,
  className,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  height?: number;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visible = segments.filter((segment) => segment.value > 0);

  if (total === 0) {
    return (
      <div
        className={className}
        style={{ height }}
        role="img"
        aria-label="No data for this period"
      >
        <div className="h-full w-full rounded-full bg-surface-muted" />
      </div>
    );
  }

  return (
    <div
      className={className}
      role="img"
      aria-label={visible
        .map((s) => `${s.label}: ${s.value} (${percentage(s.value, total)}%)`)
        .join(", ")}
    >
      <div className="flex w-full gap-0.5" style={{ height }}>
        {visible.map((segment, index) => (
          <div
            key={segment.label}
            className={
              // Round only the outer ends so the bar reads as one object.
              index === 0 && visible.length === 1
                ? "rounded-full"
                : index === 0
                  ? "rounded-l-full"
                  : index === visible.length - 1
                    ? "rounded-r-full"
                    : undefined
            }
            style={{
              width: `${(segment.value / total) * 100}%`,
              backgroundColor: segment.color,
              minWidth: 3,
            }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
      </div>
    </div>
  );
}
