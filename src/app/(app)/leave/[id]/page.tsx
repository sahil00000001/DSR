import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarRange, Clock3, MessageSquare, User } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonCell } from "@/components/ui/avatar";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getBalanceFor, getLeaveById } from "@/lib/services/leave";
import {
  LEAVE_STATUS_LABEL,
  LEAVE_STATUS_TONE,
  LEAVE_TYPE_LABEL,
} from "@/lib/constants/enums";
import { formatDayRange, formatDateTime, formatDayLong } from "@/lib/utils/date";
import { formatLeaveDays } from "@/lib/utils/format";
import { LeaveTable } from "@/components/leave/leave-table";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // Authorised: `generateMetadata` runs independently of the page component, so the
  // `notFound()` below does not prevent the title being computed and sent. Both
  // reads are `cache()`d per request.
  const [user, request] = await Promise.all([requireUser(), getLeaveById(id)]);
  if (!request) return { title: "Request not found" };
  if (!can.viewLeave(user, { id: request.user.id })) return { title: "Request not found" };
  return {
    title: `${request.user.name} — ${LEAVE_TYPE_LABEL[request.type]}`,
  };
}

export default async function LeaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const request = await getLeaveById(id);
  if (!request) notFound();

  // 404 rather than 403: an employee shouldn't be able to confirm that a
  // colleague's request id exists.
  if (!can.viewLeave(user, { id: request.user.id })) notFound();

  const isOwn = request.user.id === user.id;
  const balance = request.type === "UNPAID" ? null : await getBalanceFor(request.user.id, request.type);

  const rowDto = {
    id: request.id,
    type: request.type,
    status: request.status,
    startDate: request.startDate,
    endDate: request.endDate,
    days: request.days,
    halfDay: request.halfDay,
    reason: request.reason,
    decisionNote: request.decisionNote,
    createdAt: request.createdAt,
    user: {
      id: request.user.id,
      name: request.user.name,
      avatarUrl: request.user.avatarUrl,
      department: request.user.department?.name ?? null,
    },
    decidedBy: request.decidedBy,
    canDecide:
      request.status === "PENDING" &&
      can.decideLeave(user, {
        id: request.user.id,
        managerId: request.user.manager?.id ?? null,
      }),
    canCancel: can.cancelLeave(user, { id: request.user.id }, request.status),
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          isOwn ? { label: "Leave", href: "/leave" } : { label: "Approvals", href: "/leave/approvals" },
          { label: LEAVE_TYPE_LABEL[request.type] },
        ]}
        title={`${LEAVE_TYPE_LABEL[request.type]} — ${formatDayRange({
          start: request.startDate,
          end: request.endDate,
        })}`}
        meta={
          <>
            <Badge tone={LEAVE_STATUS_TONE[request.status]} dot>
              {LEAVE_STATUS_LABEL[request.status]}
            </Badge>
            <Badge tone="neutral" variant="outline">
              {formatLeaveDays(request.days)}
            </Badge>
            {request.halfDay ? (
              <Badge tone="neutral" variant="outline">
                Half day
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="grid max-w-4xl gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Reason</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[13.5px] leading-6 text-fg-muted">{request.reason}</p>
            </CardContent>
          </Card>

          {request.decisionNote ? (
            <Card
              className={
                request.status === "REJECTED" ? "border-danger/25 bg-danger-soft/30" : undefined
              }
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="size-3.5 text-fg-subtle" aria-hidden="true" />
                  Note from {request.decidedBy?.name ?? "the approver"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[13.5px] leading-6 text-fg-muted">{request.decisionNote}</p>
              </CardContent>
            </Card>
          ) : null}

          {/* Reuse the table so the actions and their confirmations are identical
              everywhere a request can be decided. */}
          {rowDto.canDecide || rowDto.canCancel ? (
            <LeaveTable
              rows={[rowDto]}
              showAuthor={!isOwn}
              emptyTitle=""
              emptyDescription=""
            />
          ) : null}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5 text-[12.5px]">
              <Detail icon={<User />} label="Requested by">
                <Link href={`/employees/${request.user.id}`} className="hover:underline">
                  <PersonCell
                    name={request.user.name}
                    seed={request.user.id}
                    src={request.user.avatarUrl}
                    size="sm"
                    meta={request.user.department?.name ?? undefined}
                  />
                </Link>
              </Detail>

              <Detail icon={<CalendarRange />} label="Dates">
                <span className="block text-fg">{formatDayLong(request.startDate)}</span>
                {request.startDate.getTime() !== request.endDate.getTime() ? (
                  <span className="block text-fg">to {formatDayLong(request.endDate)}</span>
                ) : null}
              </Detail>

              <Detail icon={<Clock3 />} label="Submitted">
                <span className="text-fg">{formatDateTime(request.createdAt)}</span>
              </Detail>

              {request.decidedAt ? (
                <Detail icon={<Clock3 />} label="Decided">
                  <span className="text-fg">{formatDateTime(request.decidedAt)}</span>
                  {request.decidedBy ? (
                    <span className="block text-fg-subtle">by {request.decidedBy.name}</span>
                  ) : null}
                </Detail>
              ) : null}
            </CardContent>
          </Card>

          {balance ? (
            <Card>
              <CardHeader>
                <CardTitle>{LEAVE_TYPE_LABEL[request.type]} balance</CardTitle>
              </CardHeader>
              <CardContent className="text-[12.5px]">
                <p className="flex items-baseline gap-1.5">
                  <span className="text-2xl leading-none font-semibold text-fg">
                    {balance.available}
                  </span>
                  <span className="text-fg-muted">of {balance.allocated} days left</span>
                </p>
                <p className="mt-2 text-fg-subtle">
                  {balance.used} taken
                  {balance.pending > 0 ? ` · ${balance.pending} reserved by pending requests` : ""}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
        <span className="[&>svg]:size-3" aria-hidden="true">
          {icon}
        </span>
        {label}
      </p>
      <div className="text-fg-muted">{children}</div>
    </div>
  );
}
