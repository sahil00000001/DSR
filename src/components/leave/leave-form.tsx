"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarRange, Send } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Checkbox, RadioCard } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { requestLeaveAction } from "@/server/actions/leave";
import { IDLE } from "@/server/actions/form-state";
import { LEAVE_COLOR } from "@/lib/charts/palette";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  type BalancedLeaveType,
  type LeaveType,
} from "@/lib/constants/enums";
import {
  countWorkingDays,
  formatDayRange,
  todayKey,
  tryParseDayKey,
} from "@/lib/utils/date";
import { formatLeaveDays } from "@/lib/utils/format";

interface LeaveFormProps {
  balances: Array<{
    type: BalancedLeaveType;
    allocated: number;
    used: number;
    pending: number;
    available: number;
  }>;
  /** Public/company holiday day-keys, so the day count matches the server's. */
  holidayKeys: string[];
  approverName: string | null;
}

const TYPE_DESCRIPTIONS: Record<LeaveType, string> = {
  CASUAL: "Planned time off — errands, short trips, personal days.",
  SICK: "Illness or medical appointments.",
  EARNED: "Accrued leave, usually for longer breaks.",
  UNPAID: "No balance required, and none is deducted.",
};

/**
 * Leave request form.
 *
 * The day count is computed live *using the same rules as the server* — working
 * days only, weekends and public holidays excluded — so the number on screen is
 * the number that gets deducted. Showing a naive date difference here and a
 * different figure after submitting is the single most common way leave forms
 * lose people's trust.
 */
export function LeaveForm({ balances, holidayKeys, approverName }: LeaveFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(requestLeaveAction, IDLE);

  const [type, setType] = useState<LeaveType>("CASUAL");
  const [start, setStart] = useState(todayKey());
  const [end, setEnd] = useState(todayKey());
  const [halfDay, setHalfDay] = useState(false);

  useEffect(() => {
    if (state.ok === true) {
      toast.success("Request submitted", state.message);
      router.push("/leave");
    } else if (state.ok === false && state.message) {
      toast.error("Couldn't submit your request", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /**
   * The end date the request actually uses.
   *
   * Derived during render rather than corrected by an effect. The previous version
   * wrote `end` back into state from two effects, which cost an extra render pass
   * and left a frame where the form displayed a range it would never submit.
   * A half day is always a single date; an end before the start is always clamped.
   */
  const effectiveEnd = halfDay || end < start ? start : end;

  const holidaySet = useMemo(() => new Set(holidayKeys), [holidayKeys]);

  const days = useMemo(() => {
    const from = tryParseDayKey(start);
    const to = tryParseDayKey(effectiveEnd);
    if (!from || !to || to < from) return 0;

    const workingDays = countWorkingDays({ start: from, end: to }, holidaySet);
    if (halfDay) return workingDays > 0 ? 0.5 : 0;
    return workingDays;
  }, [start, effectiveEnd, halfDay, holidaySet]);

  const balance = balances.find((entry) => entry.type === type);
  const exceeds = balance ? days > balance.available : false;
  const range = useMemo(() => {
    const from = tryParseDayKey(start);
    const to = tryParseDayKey(effectiveEnd);
    return from && to && to >= from ? formatDayRange({ start: from, end: to }) : null;
  }, [start, effectiveEnd]);

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="type" value={type} />
      {halfDay ? <input type="hidden" name="halfDay" value="true" /> : null}

      <Card>
        <CardHeader>
          <CardTitle>What kind of leave?</CardTitle>
          <CardDescription>
            Your balance updates the moment a request is approved.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Leave type</legend>
            {LEAVE_TYPES.map((option) => {
              const entry = balances.find((candidate) => candidate.type === option);
              return (
                <RadioCard
                  key={option}
                  name="type-display"
                  value={option}
                  checked={type === option}
                  onChange={() => setType(option)}
                  icon={
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: LEAVE_COLOR[option] }}
                    />
                  }
                  label={
                    <span className="flex w-full items-baseline justify-between gap-2">
                      {LEAVE_TYPE_LABEL[option]}
                      <span className="text-[11px] font-normal text-fg-subtle tabular-nums">
                        {entry ? `${entry.available} left` : "Unlimited"}
                      </span>
                    </span>
                  }
                  description={TYPE_DESCRIPTIONS[option]}
                />
              );
            })}
          </fieldset>
          {state.fieldErrors?.type ? (
            <p role="alert" className="mt-2 text-[12.5px] text-danger-text">
              {state.fieldErrors.type}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>When?</CardTitle>
          <CardDescription>
            Weekends and public holidays aren&apos;t counted or deducted.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" required error={state.fieldErrors?.startDate}>
              <Input
                name="startDate"
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </Field>
            <Field label="To" required error={state.fieldErrors?.endDate}>
              <Input
                name="endDate"
                type="date"
                value={effectiveEnd}
                min={start}
                onChange={(event) => setEnd(event.target.value)}
                disabled={halfDay}
                required
              />
            </Field>
          </div>

          <Checkbox
            checked={halfDay}
            onChange={(event) => setHalfDay(event.target.checked)}
            label="Half day"
            description="A single date, counted as 0.5 days."
          />

          {/* Live cost summary — the number that will actually be deducted. */}
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-3",
              exceeds
                ? "border-danger/30 bg-danger-soft/50"
                : days > 0
                  ? "border-accent/25 bg-accent-soft/50"
                  : "border-border bg-surface-inset",
            )}
          >
            <div className="flex items-center gap-2.5">
              <CalendarRange
                className={cn("size-4 shrink-0", exceeds ? "text-danger" : "text-accent")}
                aria-hidden="true"
              />
              <div>
                <p className="text-[13px] font-medium text-fg">
                  {days > 0 ? formatLeaveDays(days) : "No working days selected"}
                </p>
                {range ? <p className="text-[11.5px] text-fg-subtle">{range}</p> : null}
              </div>
            </div>

            {balance ? (
              <Badge tone={exceeds ? "danger" : "neutral"} variant={exceeds ? "soft" : "outline"}>
                {exceeds
                  ? `Only ${formatLeaveDays(balance.available)} available`
                  : `${formatLeaveDays(Math.max(0, balance.available - days))} would remain`}
              </Badge>
            ) : (
              <Badge tone="neutral" variant="outline">
                Unpaid — no balance used
              </Badge>
            )}
          </div>

          {exceeds ? (
            <p
              role="alert"
              className="flex items-start gap-2 text-[12.5px] leading-[18px] text-danger-text"
            >
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              This request is longer than your remaining {LEAVE_TYPE_LABEL[type].toLowerCase()}.
              Shorten it, or choose unpaid leave.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reason</CardTitle>
          <CardDescription>
            {approverName
              ? `${approverName} sees this when deciding.`
              : "Your approver sees this when deciding."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field error={state.fieldErrors?.reason} required>
            <Textarea
              name="reason"
              rows={3}
              autosize
              required
              placeholder="Family wedding — will hand over the deploy checklist to Priya beforehand."
            />
          </Field>
        </CardContent>
      </Card>

      {state.ok === false && state.message && !state.fieldErrors ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5"
        >
          <AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-[12.5px] leading-[18px] text-danger-text">{state.message}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()} type="button">
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending} disabled={days <= 0 || exceeds}>
          <Send className="size-4" />
          Submit request
        </Button>
      </div>
    </form>
  );
}
