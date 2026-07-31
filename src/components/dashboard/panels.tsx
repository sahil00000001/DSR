import Link from "next/link";
import {
  Cake,
  CalendarDays,
  Award,
  Megaphone,
  PartyPopper,
  Plane,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, PersonCell } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SegmentedMeter } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkdownView } from "@/components/markdown-view";
import { formatDayFriendly, formatRelative, parseDayKey } from "@/lib/utils/date";
import { formatHours, pluralize } from "@/lib/utils/format";
import { LEAVE_TYPE_SHORT, type BalancedLeaveType } from "@/lib/constants/enums";
import { LEAVE_COLOR } from "@/lib/charts/palette";
import type { ActivityEntry, ContributorRow } from "@/lib/services/analytics";
import type { CalendarEvent } from "@/lib/services/calendar";
import type { AnnouncementRecord } from "@/lib/services/announcements";

/** Server components — no interactivity, so no JavaScript ships for these. */

export function LeaveBalanceCard({
  balances,
  pendingCount,
}: {
  balances: Array<{
    type: BalancedLeaveType;
    allocated: number;
    used: number;
    pending: number;
    available: number;
  }>;
  pendingCount: number;
}) {
  const totalAvailable = balances.reduce((sum, balance) => sum + balance.available, 0);

  return (
    <Card>
      <CardHeader
        actions={
          <Link
            href="/leave"
            className="text-[12px] font-medium text-accent underline-offset-2 hover:underline"
          >
            Manage
          </Link>
        }
      >
        <CardTitle>Leave balance</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3.5">
        <p className="text-[13px] text-fg-muted">
          <span className="text-xl font-semibold text-fg">{totalAvailable}</span> days available this
          year
          {pendingCount > 0 ? (
            <>
              {" · "}
              <span className="text-warning-text">{pendingCount} awaiting a decision</span>
            </>
          ) : null}
        </p>

        <ul className="space-y-3">
          {balances.map((balance) => (
            <li key={balance.type}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ backgroundColor: LEAVE_COLOR[balance.type] }}
                  />
                  {LEAVE_TYPE_SHORT[balance.type]}
                </span>
                <span className="text-[12px] text-fg-muted tabular-nums">
                  <span className="font-semibold text-fg">{balance.available}</span> of{" "}
                  {balance.allocated} left
                </span>
              </div>
              {/* Discrete segments read better than a bar for "3 of 5". */}
              <SegmentedMeter
                used={balance.used}
                pending={balance.pending}
                total={balance.allocated}
                tone={balance.available === 0 ? "danger" : "accent"}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function UpcomingCard({ events }: { events: CalendarEvent[] }) {
  const ICONS: Record<CalendarEvent["kind"], typeof Cake> = {
    HOLIDAY: PartyPopper,
    LEAVE: Plane,
    BIRTHDAY: Cake,
    ANNIVERSARY: Award,
  };

  const TONES: Record<CalendarEvent["kind"], string> = {
    HOLIDAY: "text-cat-amber",
    LEAVE: "text-accent",
    BIRTHDAY: "text-cat-rose",
    ANNIVERSARY: "text-cat-emerald",
  };

  return (
    <Card>
      <CardHeader
        actions={
          <Link
            href="/calendar"
            className="text-[12px] font-medium text-accent underline-offset-2 hover:underline"
          >
            Calendar
          </Link>
        }
      >
        <CardTitle>Coming up</CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        {events.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<CalendarDays className="size-4" />}
            title="Nothing scheduled"
            description="Holidays, leave and birthdays in the next three weeks will show here."
          />
        ) : (
          <ul className="-mx-1 space-y-0.5">
            {events.map((event) => {
              const Icon = ICONS[event.kind];
              return (
                <li key={`${event.id}-${event.dayKey}`}>
                  <div className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                    {event.person ? (
                      <Avatar
                        name={event.person.name}
                        seed={event.person.id}
                        src={event.person.avatarUrl}
                        size="sm"
                      />
                    ) : (
                      <span
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-md bg-surface-muted",
                          TONES[event.kind],
                        )}
                        aria-hidden="true"
                      >
                        <Icon className="size-3.5" />
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-fg">
                        {event.title}
                      </span>
                      <span className="block text-[11.5px] text-fg-subtle">
                        {formatDayFriendly(parseDayKey(event.dayKey))}
                      </span>
                    </span>

                    {event.kind === "LEAVE" && event.leaveType ? (
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: LEAVE_COLOR[event.leaveType] }}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ActivityFeedCard({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        {entries.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<TrendingUp className="size-4" />}
            title="Nothing yet"
            description="Submitted reports, leave decisions and announcements appear here."
          />
        ) : (
          <ol className="relative space-y-3.5">
            {/* Continuous rail behind the avatars ties the entries into a timeline. */}
            <span
              aria-hidden="true"
              className="absolute top-2 bottom-2 left-[11px] w-px bg-border"
            />
            {entries.map((entry) => (
              <li key={entry.id} className="relative flex gap-3">
                <Avatar
                  name={entry.actor.name}
                  seed={entry.actor.id}
                  src={entry.actor.avatarUrl}
                  size="sm"
                  className="z-10 ring-2 ring-surface rounded-full"
                />
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[12.5px] leading-[18px] text-fg-muted">
                    <Link
                      href={`/employees/${entry.actor.id}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {entry.actor.name}
                    </Link>{" "}
                    <Link href={entry.href} className="hover:text-fg hover:underline">
                      {entry.summary}
                    </Link>
                  </p>
                  <time
                    dateTime={entry.at.toISOString()}
                    className="mt-0.5 block text-[11px] text-fg-subtle"
                  >
                    {formatRelative(entry.at)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function ContributorsCard({ rows }: { rows: ContributorRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.reports));

  return (
    <Card>
      <CardHeader
        actions={
          <Link
            href="/analytics"
            className="text-[12px] font-medium text-accent underline-offset-2 hover:underline"
          >
            Analytics
          </Link>
        }
      >
        <CardTitle>Most active</CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<TrendingUp className="size-4" />}
            title="No reports yet"
            description="Once the team starts filing, the leaderboard fills in."
          />
        ) : (
          <ol className="space-y-2.5">
            {rows.map((row, index) => (
              <li key={row.id}>
                <Link
                  href={`/employees/${row.id}`}
                  className="group flex items-center gap-3 rounded-lg py-0.5"
                >
                  <span className="w-3.5 shrink-0 text-right text-[11px] font-semibold text-fg-subtle tabular-nums">
                    {index + 1}
                  </span>
                  <Avatar name={row.name} seed={row.id} src={row.avatarUrl} size="sm" />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-fg group-hover:underline">
                      {row.name}
                    </span>
                    {/* Bar length is the comparison; the number is the value. */}
                    <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${(row.reports / max) * 100}%` }}
                      />
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-[12px] font-semibold text-fg tabular-nums">
                      {row.reports}
                    </span>
                    <span className="block text-[10.5px] text-fg-subtle tabular-nums">
                      {formatHours(row.hours)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function AnnouncementBanner({ announcement }: { announcement: AnnouncementRecord }) {
  return (
    <Card className="border-accent/25 bg-accent-soft/40">
      <CardContent className="flex gap-3.5 pt-4">
        <span
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg shadow-xs"
          aria-hidden="true"
        >
          <Megaphone className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13.5px] font-semibold text-fg">{announcement.title}</h3>
            {announcement.pinned ? (
              <Badge tone="accent" size="sm">
                Pinned
              </Badge>
            ) : null}
          </div>

          <MarkdownView
            source={announcement.body}
            maxBlocks={2}
            className="mt-1.5 text-[12.5px] leading-5"
          />

          <p className="mt-2 text-[11.5px] text-fg-subtle">
            {announcement.author.name} · {formatRelative(announcement.publishedAt)}
          </p>
        </div>

        <Link
          href="/announcements"
          className="shrink-0 self-start text-[12px] font-medium text-accent underline-offset-2 hover:underline"
        >
          Read all
        </Link>
      </CardContent>
    </Card>
  );
}

/** Roll-call list of who hasn't marked attendance — the manager's nudge list. */
export function NotMarkedCard({
  people,
}: {
  people: Array<{ id: string; name: string; avatarUrl: string | null; department: string | null }>;
}) {
  if (people.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Not marked in</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-2.5">
          {people.slice(0, 6).map((person) => (
            <li key={person.id}>
              <Link href={`/employees/${person.id}`} className="block">
                <PersonCell
                  name={person.name}
                  seed={person.id}
                  src={person.avatarUrl}
                  size="sm"
                  meta={person.department ?? undefined}
                />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
      {people.length > 6 ? (
        <CardFooter>
          <span className="text-[12px] text-fg-muted">
            {pluralize(people.length - 6, "other")} not shown
          </span>
          <Link
            href="/attendance/board"
            className="text-[12px] font-medium text-accent underline-offset-2 hover:underline"
          >
            Open board
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}
