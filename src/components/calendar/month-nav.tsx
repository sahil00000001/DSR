"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMonthLong, parseDayKey, startOfMonth, today } from "@/lib/utils/date";

/**
 * Month stepper.
 *
 * Uses `replace` rather than `push` so paging through twelve months doesn't leave
 * twelve entries in the back button on the way out.
 */
export function MonthNav({ monthKey, basePath }: { monthKey: string; basePath: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const month = parseDayKey(`${monthKey}-01`);

  const go = (amount: number) => {
    const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + amount, 1));
    const key = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    startTransition(() => router.replace(`${basePath}?month=${key}`, { scroll: false }));
  };

  const isCurrentMonth = monthKey === `${today().getUTCFullYear()}-${String(today().getUTCMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
        <Button variant="ghost" size="icon-sm" onClick={() => go(-1)} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </Button>
        <span
          className="min-w-[8.5rem] px-1 text-center text-[12.5px] font-medium text-fg"
          aria-live="polite"
        >
          {formatMonthLong(month)}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={() => go(1)} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {!isCurrentMonth ? (
        <Button
          variant="secondary"
          size="sm"
          loading={isPending}
          onClick={() => {
            const now = startOfMonth(today());
            const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
            startTransition(() => router.replace(`${basePath}?month=${key}`, { scroll: false }));
          }}
        >
          Today
        </Button>
      ) : null}
    </div>
  );
}
