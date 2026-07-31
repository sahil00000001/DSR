"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/lib/charts/palette";
import { ChartTooltip } from "@/components/charts/chart-tooltip";

export interface TrendSeries {
  /** Key into each datum. */
  key: string;
  label: string;
  color: string;
  /** Area wash under the line. Off for the secondary series to avoid mud. */
  fill?: boolean;
}

interface TrendChartProps {
  data: Array<Record<string, string | number>>;
  /** Datum key for the x axis. */
  xKey: string;
  series: TrendSeries[];
  unit?: string;
  /** Fixes the y domain — use for percentages so the scale doesn't lie. */
  yDomain?: [number, number];
  yTickFormatter?: (value: number) => string;
  /** Show every nth tick; keeps a 90-day axis readable. */
  xTickInterval?: number;
  showTotal?: boolean;
}

/**
 * Line/area chart for change-over-time.
 *
 * Single y axis, always — two measures of different scale get two charts, never
 * a second axis. Gridlines are solid hairlines one step off the surface, and the
 * area wash is ~10% opacity so the line stays the loudest thing on the plot.
 */
export function TrendChart({
  data,
  xKey,
  series,
  unit,
  yDomain,
  yTickFormatter,
  xTickInterval,
  showTotal = false,
}: TrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={CHART.margin}>
        <defs>
          {series
            .filter((s) => s.fill !== false)
            .map((s) => (
              <linearGradient key={s.key} id={`wash-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={CHART.areaOpacity * 2.2} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
        </defs>

        {/* Horizontal rules only — vertical ones fight the line. */}
        <CartesianGrid vertical={false} strokeDasharray="" />

        <XAxis
          dataKey={xKey}
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          interval={xTickInterval ?? "preserveStartEnd"}
          minTickGap={16}
          dy={4}
        />
        <YAxis
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          width={44}
          domain={yDomain}
          tickFormatter={yTickFormatter}
          allowDecimals={false}
        />

        <RechartsTooltip
          content={<ChartTooltip unit={unit} showTotal={showTotal} />}
          cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
        />

        {series.map((s) =>
          s.fill === false ? (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={CHART.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              // 2px surface ring keeps the marker legible where lines cross.
              activeDot={{ r: CHART.dotRadius, strokeWidth: 2, stroke: "var(--surface)" }}
            />
          ) : (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={CHART.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={`url(#wash-${s.key})`}
              dot={false}
              activeDot={{ r: CHART.dotRadius, strokeWidth: 2, stroke: "var(--surface)" }}
            />
          ),
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
