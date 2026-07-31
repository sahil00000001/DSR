"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building,
  CalendarCheck,
  Check,
  CircleSlash,
  Clock,
  FileText,
  Flame,
  House,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { quickMarkTodayAction } from "@/server/actions/attendance";
import {
  ATTENDANCE_STATUS_LABEL,
  DSR_STATUS_LABEL,
  DSR_STATUS_TONE,
  type AttendanceStatus,
  type DsrStatus,
} from "@/lib/constants/enums";
import { formatHours } from "@/lib/utils/format";

/**
 * "Your day" card — the first thing an employee sees.
 *
 * Collapses the two daily obligations into one place with a single tap each.
 *
 * Attendance is optimistic for immediate feedback, then reconciled: the server
 * action runs and `router.refresh()` re-renders the card, the nav badges and the
 * dashboard tiles from authoritative data. The optimistic value only ever covers
 * the gap — it is never the source of truth, so it cannot drift.
 */

const ATTENDANCE_OPTIONS: Array<{
  status: Extract<AttendanceStatus, "PRESENT" | "WFH" | "HALF_DAY">;
  label: string;
  icon: typeof Building;
}> = [
  { status: "PRESENT", label: "In office", icon: Building },
  { status: "WFH", label: "Remote", icon: House },
  { status: "HALF_DAY", label: "Half day", icon: Clock },
];

interface TodayCardProps {
  firstName: string;
  today: string;
  dsr: { id: string; status: DsrStatus; hoursWorked: number } | null;
  attendance: { status: AttendanceStatus; inferred: boolean } | null;
  streak: number;
  isNonWorkingDay: boolean;
  missingReports: number;
}

export function TodayCard({
  firstName,
  today,
  dsr,
  attendance,
  streak,
  isNonWorkingDay,
  missingReports,
}: TodayCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  /**
   * Optimistic attendance.
   *
   * Marking used to wait for the server action *and* a `router.refresh()` before
   * the button state changed — roughly a second of nothing happening after a
   * click, on a control people press once a day and expect to be instant.
   *
   * `useOptimistic` paints the new state immediately. React discards the optimistic
   * value automatically when the transition settles, at which point the refreshed
   * server props are authoritative — so a rejected write (an admin override on that
   * day, for instance) visibly snaps back rather than lying.
   */
  const [optimistic, setOptimistic] = useOptimistic(
    attendance,
    (_current, next: AttendanceStatus) => ({ status: next, inferred: false }),
  );

  const isMarked = optimistic !== null && !optimistic.inferred;
  const reportDone = dsr !== null && dsr.status !== "DRAFT";

  const mark = (status: AttendanceStatus) => {
    startTransition(async () => {
      // Must be inside the transition, or React warns and drops the update.
      setOptimistic(status);

      const result = await quickMarkTodayAction(status);
      if (result.ok) {
        toast.success(result.message ?? "Attendance recorded");
        router.refresh();
      } else {
        toast.error("Couldn't record attendance", result.message);
      }
    });
  };

  return (
    <Card className="overflow-hidden">
      {/* Header band: greeting + streak */}
      <div className="relative border-b border-border bg-surface-inset px-5 py-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.55] [background-image:radial-gradient(circle_at_top_right,var(--accent-soft),transparent_60%)]"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.015em] text-fg">
              {greeting()}, {firstName}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-fg-muted">{today}</p>
          </div>

          {streak >= 2 ? (
            <Badge tone="warning" className="gap-1">
              <Flame className="size-3" aria-hidden="true" />
              {streak}-day streak
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="divide-y divide-border">
        {/* Report row */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                reportDone ? "bg-success-soft text-success" : "bg-accent-soft text-accent",
              )}
              aria-hidden="true"
            >
              {reportDone ? <Check className="size-4" /> : <FileText className="size-4" />}
            </span>

            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-fg">
                {reportDone ? "Today's report is in" : "Today's status report"}
              </p>
              <p className="mt-0.5 text-[12.5px] text-fg-muted">
                {reportDone ? (
                  <>
                    <Badge tone={DSR_STATUS_TONE[dsr.status]} size="sm" dot>
                      {DSR_STATUS_LABEL[dsr.status]}
                    </Badge>
                    <span className="ml-1.5">{formatHours(dsr.hoursWorked)} logged</span>
                  </>
                ) : dsr ? (
                  "You have a draft saved — finish it when you're ready."
                ) : isNonWorkingDay ? (
                  "Not expected today, but you can still file one."
                ) : (
                  "Two minutes now saves your manager ten tomorrow."
                )}
              </p>
            </div>
          </div>

          <ButtonLink
            href={dsr ? `/dsr/new?date=today` : "/dsr/new"}
            variant={reportDone ? "secondary" : "primary"}
            size="sm"
          >
            {reportDone ? (
              <>
                <PenLine className="size-3.5" />
                Edit
              </>
            ) : dsr ? (
              <>
                Finish draft
                <ArrowRight className="size-3.5" />
              </>
            ) : (
              <>
                Write report
                <ArrowRight className="size-3.5" />
              </>
            )}
          </ButtonLink>
        </div>

        {/* Attendance row */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                isMarked ? "bg-success-soft text-success" : "bg-surface-muted text-fg-subtle",
              )}
              aria-hidden="true"
            >
              {isMarked ? <Check className="size-4" /> : <CalendarCheck className="size-4" />}
            </span>

            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-fg">
                {isMarked
                  ? `Marked ${ATTENDANCE_STATUS_LABEL[optimistic.status].toLowerCase()}`
                  : "Attendance"}
              </p>
              <p className="mt-0.5 text-[12.5px] text-fg-muted">
                {isMarked
                  ? "Change it below if that's not right."
                  : isNonWorkingDay
                    ? "It's a non-working day — nothing to mark."
                    : "How are you working today?"}
              </p>
            </div>
          </div>

          {!isNonWorkingDay ? (
            <div className="flex flex-wrap gap-1.5">
              {ATTENDANCE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = isMarked && optimistic.status === option.status;
                return (
                  <Button
                    key={option.status}
                    variant={active ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => mark(option.status)}
                    loading={isPending && active}
                    disabled={isPending}
                    aria-pressed={active}
                  >
                    <Icon className="size-3.5" />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Catch-up nudge — only when there's something to catch up on. */}
        {missingReports > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-warning-soft/40 px-5 py-3">
            <div className="flex items-center gap-2.5">
              <CircleSlash className="size-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-[12.5px] text-fg-muted">
                <span className="font-medium text-fg">
                  {missingReports} working {missingReports === 1 ? "day" : "days"}
                </span>{" "}
                in the last week {missingReports === 1 ? "is" : "are"} missing a report.
              </p>
            </div>
            <ButtonLink href="/dsr" variant="ghost" size="xs">
              Review
              <ArrowRight className="size-3" />
            </ButtonLink>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Time-of-day greeting.
 *
 * Computed in the browser from the *viewer's* clock. Doing it on the server would
 * greet someone with "Good evening" because the server happens to be in another
 * timezone — and would then mismatch on hydration.
 */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
