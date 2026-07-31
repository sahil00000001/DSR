"use client";

import { useMemo } from "react";
import { ChartFrame } from "@/components/charts/chart-frame";
import { BarChart } from "@/components/charts/bar-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { LEAVE_COLOR } from "@/lib/charts/palette";
import { formatMonth, parseDayKey } from "@/lib/utils/date";

/**
 * Leave taken per month, split by type.
 *
 * Uses the reserved *status* palette rather than categorical slots: sick versus
 * earned leave carries meaning, not just identity, and the two scales must stay
 * disjoint so a leave colour never reads as "series 3".
 */
export function LeaveTrendChart({
  data,
}: {
  data: Array<{ month: string; casual: number; sick: number; earned: number; unpaid: number }>;
}) {
  const shaped = useMemo(
    () =>
      data.map((point) => ({
        label: formatMonth(parseDayKey(`${point.month}-01`)),
        Casual: point.casual,
        Sick: point.sick,
        Earned: point.earned,
        Unpaid: point.unpaid,
      })),
    [data],
  );

  const total = data.reduce(
    (sum, point) => sum + point.casual + point.sick + point.earned + point.unpaid,
    0,
  );

  return (
    <ChartFrame
      title="Leave taken"
      description={`${Math.round(total * 10) / 10} approved days by month and type`}
      height={210}
      legend={[
        { label: "Casual", color: LEAVE_COLOR.CASUAL },
        { label: "Sick", color: LEAVE_COLOR.SICK },
        { label: "Earned", color: LEAVE_COLOR.EARNED },
        { label: "Unpaid", color: LEAVE_COLOR.UNPAID },
      ]}
      table={{
        columns: ["Month", "Casual", "Sick", "Earned", "Unpaid"],
        rows: data.map((point) => [
          formatMonth(parseDayKey(`${point.month}-01`)),
          point.casual,
          point.sick,
          point.earned,
          point.unpaid,
        ]),
      }}
    >
      {shaped.length === 0 ? (
        <EmptyState
          size="sm"
          title="No leave taken in this period"
          description="Approved leave appears here once someone takes time off."
        />
      ) : (
        <BarChart
          data={shaped}
          xKey="label"
          unit="d"
          series={[
            { key: "Casual", label: "Casual", color: LEAVE_COLOR.CASUAL },
            { key: "Sick", label: "Sick", color: LEAVE_COLOR.SICK },
            { key: "Earned", label: "Earned", color: LEAVE_COLOR.EARNED },
            { key: "Unpaid", label: "Unpaid", color: LEAVE_COLOR.UNPAID },
          ]}
        />
      )}
    </ChartFrame>
  );
}
