"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building, Clock, House, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { RadioCard } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { markAttendanceAction } from "@/server/actions/attendance";
import { IDLE } from "@/server/actions/form-state";
import { AttendanceCalendar, type CalendarDay } from "@/components/attendance/attendance-calendar";
import type { AttendanceStatus } from "@/lib/constants/enums";

/**
 * Personal attendance screen.
 *
 * The month lives in the URL (`?month=2026-07`) so the server renders the data —
 * paging a month client-side would mean shipping a year of records to the browser
 * just in case. Navigation is a `replace`, so paging through months doesn't fill
 * the back button with intermediate states.
 */
export function MyAttendance({
  days,
  monthKey,
  todayKey,
  todayStatus,
  todayNote,
  canMarkToday,
}: {
  days: CalendarDay[];
  monthKey: string;
  todayKey: string;
  todayStatus: AttendanceStatus | null;
  todayNote: string | null;
  canMarkToday: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [state, action, pending] = useActionState(markAttendanceAction, IDLE);

  const [status, setStatus] = useState<AttendanceStatus>(
    todayStatus && ["PRESENT", "WFH", "HALF_DAY"].includes(todayStatus) ? todayStatus : "PRESENT",
  );

  useEffect(() => {
    if (state.ok === true) {
      toast.success(state.message ?? "Attendance recorded");
      router.refresh();
    } else if (state.ok === false && state.message) {
      toast.error("Couldn't record attendance", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const changeMonth = (next: string) => {
    startTransition(() => {
      router.replace(`/attendance?month=${next}`, { scroll: false });
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <AttendanceCalendar days={days} monthKey={monthKey} onMonthChange={changeMonth} />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{todayStatus ? "Update today" : "Mark today"}</CardTitle>
            <CardDescription>
              {canMarkToday
                ? "How are you working today? You can change this for up to three days."
                : "Today is a non-working day — nothing to record."}
            </CardDescription>
          </CardHeader>

          {canMarkToday ? (
            <CardContent>
              <form action={action} className="space-y-4">
                <input type="hidden" name="date" value={todayKey} />

                <fieldset className="space-y-2">
                  <legend className="sr-only">Working arrangement</legend>
                  {(
                    [
                      { value: "PRESENT", label: "In the office", icon: <Building /> },
                      { value: "WFH", label: "Working from home", icon: <House /> },
                      { value: "HALF_DAY", label: "Half day", icon: <Clock /> },
                    ] as const
                  ).map((option) => (
                    <RadioCard
                      key={option.value}
                      name="status"
                      value={option.value}
                      icon={<span className="[&>svg]:size-3.5">{option.icon}</span>}
                      label={option.label}
                      checked={status === option.value}
                      onChange={() => setStatus(option.value)}
                    />
                  ))}
                </fieldset>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Check in" optional error={state.fieldErrors?.checkIn}>
                    <Input name="checkIn" type="time" inputSize="sm" />
                  </Field>
                  <Field label="Check out" optional error={state.fieldErrors?.checkOut}>
                    <Input name="checkOut" type="time" inputSize="sm" />
                  </Field>
                </div>

                <Field label="Note" optional error={state.fieldErrors?.note}>
                  <Textarea
                    name="note"
                    rows={2}
                    autosize
                    defaultValue={todayNote ?? ""}
                    placeholder="At the client site this morning"
                  />
                </Field>

                <Button type="submit" variant="primary" block loading={pending}>
                  <Save className="size-4" />
                  {todayStatus ? "Update attendance" : "Save attendance"}
                </Button>
              </form>
            </CardContent>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
