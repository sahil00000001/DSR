"use client";

import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/lib/charts/palette";
import { ChartTooltip } from "@/components/charts/chart-tooltip";

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

interface BarChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: BarSeries[];
  unit?: string;
  /** Horizontal bars — right when category labels are long (people, teams). */
  layout?: "vertical" | "horizontal";
  /** Direct-labels the bar ends. Use sparingly and only when values are few. */
  showValues?: boolean;
  /** Per-datum override so one bar can be emphasised and the rest recede. */
  colorFor?: (datum: Record<string, string | number>, index: number) => string;
  yTickFormatter?: (value: number) => string;
  categoryWidth?: number;
}

/**
 * Grouped bar chart for magnitude comparison.
 *
 * Bars are capped at 24px and separated by a real 2px surface gap (`barGap`) —
 * never by a stroke drawn around the mark. Values are direct-labelled only when
 * `showValues` is set, because a number on every bar reads as noise.
 */
export function BarChart({
  data,
  xKey,
  series,
  unit,
  layout = "vertical",
  showValues = false,
  colorFor,
  yTickFormatter,
  categoryWidth = 96,
}: BarChartProps) {
  // recharts' `layout` names the axis of the *value*, which is the opposite of
  // how designers say it — map our vocabulary onto theirs once, here.
  const isHorizontal = layout === "horizontal";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsBarChart
        data={data}
        layout={isHorizontal ? "vertical" : "horizontal"}
        margin={isHorizontal ? { top: 4, right: 28, bottom: 0, left: 0 } : CHART.margin}
        barGap={CHART.barGap}
        barCategoryGap={CHART.barCategoryGap}
      >
        <CartesianGrid
          horizontal={!isHorizontal}
          vertical={isHorizontal}
          strokeDasharray=""
        />

        {isHorizontal ? (
          <>
            <XAxis
              type="number"
              tick={CHART.axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={yTickFormatter}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={CHART.axisTick}
              tickLine={false}
              axisLine={false}
              width={categoryWidth}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              tick={CHART.axisTick}
              tickLine={false}
              axisLine={false}
              dy={4}
              minTickGap={4}
            />
            <YAxis
              tick={CHART.axisTick}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={yTickFormatter}
              allowDecimals={false}
            />
          </>
        )}

        <RechartsTooltip
          content={<ChartTooltip unit={unit} showTotal={series.length > 1} />}
          cursor={{ fill: "color-mix(in oklab, var(--fg) 4%, transparent)" }}
        />

        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            maxBarSize={CHART.maxBarSize}
            // 4px rounded data-end, square at the baseline.
            radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          >
            {colorFor
              ? data.map((datum, index) => (
                  <Cell key={index} fill={colorFor(datum, index)} />
                ))
              : null}
            {showValues ? (
              <LabelList
                dataKey={s.key}
                position={isHorizontal ? "right" : "top"}
                offset={6}
                className="text-[11px]"
                // Labels wear text tokens, never the series colour.
                fill="var(--fg-muted)"
                formatter={(value: unknown) => (typeof value === "number" && value > 0 ? value : "")}
              />
            ) : null}
          </Bar>
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
