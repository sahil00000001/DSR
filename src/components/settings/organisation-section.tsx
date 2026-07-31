"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building, CalendarPlus, MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, optionsFrom } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import {
  createHolidayAction,
  createLocationAction,
  deleteHolidayAction,
} from "@/server/actions/organisation";
import { IDLE } from "@/server/actions/form-state";
import { HOLIDAY_TYPES, HOLIDAY_TYPE_LABEL, type HolidayType } from "@/lib/constants/enums";
import { formatDay, formatDayFriendly, today, todayKey } from "@/lib/utils/date";
import { pluralize } from "@/lib/utils/format";

interface HolidayRow {
  id: string;
  name: string;
  date: Date;
  type: string;
  locationName: string | null;
}

interface LocationRow {
  id: string;
  name: string;
  code: string;
  city: string;
  country: string;
  timezone: string;
  memberCount: number;
}

/**
 * Admin-only organisation settings: the holiday calendar and office locations.
 *
 * The holiday list is not cosmetic — it determines which days count as working
 * days, and therefore leave duration, expected report counts and attendance
 * inference. That's stated in the UI so nobody edits it casually.
 */
export function OrganisationSection({
  holidays,
  locations,
}: {
  holidays: HolidayRow[];
  locations: LocationRow[];
}) {
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [addingLocation, setAddingLocation] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const now = today();
  const upcoming = holidays.filter((holiday) => holiday.date >= now);
  const past = holidays.filter((holiday) => holiday.date < now);

  const removeHoliday = async (holiday: HolidayRow) => {
    const result = await confirm({
      title: `Remove ${holiday.name}?`,
      description:
        "Working-day counts, leave durations and expected report totals will be recalculated without it.",
      confirmLabel: "Remove holiday",
      tone: "danger",
    });
    if (!result.confirmed) return;

    startTransition(async () => {
      const response = await deleteHolidayAction(holiday.id);
      if (response.ok) {
        toast.success(response.message ?? "Removed");
        router.refresh();
      } else {
        toast.error("Couldn't remove it", response.message);
      }
    });
  };

  return (
    <>
      <Card>
        <CardHeader
          actions={
            <Button variant="secondary" size="sm" onClick={() => setAddingHoliday(true)}>
              <Plus className="size-4" />
              Add holiday
            </Button>
          }
        >
          <CardTitle className="flex items-center gap-2">
            <CalendarPlus className="size-3.5 text-fg-subtle" aria-hidden="true" />
            Holiday calendar
          </CardTitle>
          <CardDescription>
            These dates decide what counts as a working day — they affect leave duration, expected
            report counts and attendance.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {holidays.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<CalendarPlus className="size-4" />}
              title="No holidays added"
              description="Without a holiday list, every weekday counts as a working day."
            />
          ) : (
            <div className="space-y-4">
              {upcoming.length > 0 ? (
                <div>
                  <h4 className="mb-2 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                    Upcoming
                  </h4>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {upcoming.map((holiday) => (
                      <HolidayItem
                        key={holiday.id}
                        holiday={holiday}
                        onRemove={removeHoliday}
                        disabled={isPending}
                        upcoming
                      />
                    ))}
                  </ul>
                </div>
              ) : null}

              {past.length > 0 ? (
                <details className="group">
                  <summary className="cursor-pointer text-[12px] font-medium text-fg-muted transition-colors hover:text-fg">
                    {pluralize(past.length, "earlier holiday")} this year
                  </summary>
                  <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                    {past.map((holiday) => (
                      <HolidayItem
                        key={holiday.id}
                        holiday={holiday}
                        onRemove={removeHoliday}
                        disabled={isPending}
                      />
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          actions={
            <Button variant="secondary" size="sm" onClick={() => setAddingLocation(true)}>
              <Plus className="size-4" />
              Add location
            </Button>
          }
        >
          <CardTitle className="flex items-center gap-2">
            <Building className="size-3.5 text-fg-subtle" aria-hidden="true" />
            Office locations
          </CardTitle>
          <CardDescription>
            Used for filtering and for location-specific holidays.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {locations.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<MapPin className="size-4" />}
              title="No locations yet"
              description="Add one so people can be filtered by office."
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {locations.map((location) => (
                <li
                  key={location.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-inset px-3 py-2.5"
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface font-mono text-[10px] font-semibold text-fg-muted"
                    aria-hidden="true"
                  >
                    {location.code}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-fg">{location.name}</p>
                    <p className="truncate text-[11px] text-fg-subtle">
                      {location.city}, {location.country} · {location.timezone}
                    </p>
                  </div>
                  <Badge tone="neutral" size="sm" variant="outline">
                    {location.memberCount}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <HolidayDialog open={addingHoliday} onClose={() => setAddingHoliday(false)} locations={locations} />
      <LocationDialog open={addingLocation} onClose={() => setAddingLocation(false)} />
    </>
  );
}

function HolidayItem({
  holiday,
  onRemove,
  disabled,
  upcoming = false,
}: {
  holiday: HolidayRow;
  onRemove: (holiday: HolidayRow) => void;
  disabled: boolean;
  upcoming?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium text-fg">{holiday.name}</p>
        <p className="text-[11px] text-fg-subtle">
          {upcoming ? formatDayFriendly(holiday.date) : formatDay(holiday.date)}
          {holiday.locationName ? ` · ${holiday.locationName} only` : ""}
        </p>
      </div>
      <Badge
        tone={holiday.type === "OPTIONAL" ? "neutral" : "warning"}
        size="sm"
        variant="outline"
      >
        {HOLIDAY_TYPE_LABEL[holiday.type as HolidayType]}
      </Badge>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(holiday)}
        disabled={disabled}
        aria-label={`Remove ${holiday.name}`}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}

function HolidayDialog({
  open,
  onClose,
  locations,
}: {
  open: boolean;
  onClose: () => void;
  locations: LocationRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(createHolidayAction, IDLE);

  useEffect(() => {
    if (state.ok === true) {
      toast.success(state.message ?? "Holiday added");
      onClose();
      router.refresh();
    } else if (state.ok === false && state.message && !state.fieldErrors) {
      toast.error("Couldn't add the holiday", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Add a holiday"
      description="Public and company days are excluded from working-day counts. Optional days are not."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="holiday-form" variant="primary" loading={pending}>
            <Plus className="size-4" />
            Add holiday
          </Button>
        </>
      }
    >
      <form id="holiday-form" action={action} className="space-y-4" noValidate>
        <Field label="Name" required error={state.fieldErrors?.name}>
          <Input name="name" required autoFocus placeholder="Independence Day" />
        </Field>

        <Field label="Date" required error={state.fieldErrors?.date}>
          <Input name="date" type="date" required defaultValue={todayKey()} />
        </Field>

        <Field label="Type" error={state.fieldErrors?.type}>
          <Select
            name="type"
            defaultValue="PUBLIC"
            options={optionsFrom(HOLIDAY_TYPES, HOLIDAY_TYPE_LABEL)}
          />
        </Field>

        {locations.length > 0 ? (
          <Field
            label="Location"
            optional
            hint="Leave empty if it applies everywhere."
            error={state.fieldErrors?.locationId}
          >
            <Select
              name="locationId"
              defaultValue=""
              placeholder="All locations"
              options={locations.map((location) => ({
                value: location.id,
                label: `${location.name} · ${location.city}`,
              }))}
            />
          </Field>
        ) : null}
      </form>
    </Dialog>
  );
}

function LocationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(createLocationAction, IDLE);

  useEffect(() => {
    if (state.ok === true) {
      toast.success(state.message ?? "Location added");
      onClose();
      router.refresh();
    } else if (state.ok === false && state.message && !state.fieldErrors) {
      toast.error("Couldn't add the location", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Add an office location"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="location-form" variant="primary" loading={pending}>
            <Plus className="size-4" />
            Add location
          </Button>
        </>
      }
    >
      <form id="location-form" action={action} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <Field label="Name" required error={state.fieldErrors?.name}>
            <Input name="name" required autoFocus placeholder="Bengaluru HQ" />
          </Field>
          <Field label="Code" required error={state.fieldErrors?.code}>
            <Input name="code" required placeholder="BLR" className="font-mono uppercase" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" required error={state.fieldErrors?.city}>
            <Input name="city" required placeholder="Bengaluru" />
          </Field>
          <Field label="Country" required error={state.fieldErrors?.country}>
            <Input name="country" required placeholder="India" />
          </Field>
        </div>

        <Field label="Timezone" error={state.fieldErrors?.timezone} hint="IANA name, e.g. Asia/Kolkata.">
          <Input name="timezone" defaultValue="Asia/Kolkata" />
        </Field>
      </form>
    </Dialog>
  );
}
