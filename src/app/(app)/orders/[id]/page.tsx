import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarClock, History, Package, TriangleAlert, User } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getOrder, getOrderFeed, getOrderPolicySubject } from "@/lib/services/orders";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_MEANING,
  ORDER_STATUS_TONE,
  TASK_PRIORITY_LABEL,
} from "@/lib/constants/enums";
import { formatDateTime, formatDayLong, formatRelative } from "@/lib/utils/date";
import { OrderRow } from "@/components/orders/order-row";

/**
 * Authorised in `generateMetadata` too — it runs independently of the page, so a
 * `notFound()` below does not stop a title being computed and sent. Both reads are
 * `cache()`d per request, so the check is free.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [user, order, subject] = await Promise.all([
    requireUser(),
    getOrder(id),
    getOrderPolicySubject(id),
  ]);
  if (!order || !subject) return { title: "Order not found" };
  if (!can.viewOrder(user, subject)) return { title: "Order not found" };
  return { title: `${order.orderNumber} — ${order.customerName}` };
}

/**
 * One order in full.
 *
 * The list page already shows everything an admin needs day to day, so this exists for
 * the two things a dense row cannot carry: the whole history, and the paper trail behind
 * a moved promised date. The order row itself is reused expanded, rather than a second
 * layout that could drift from it.
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [order, subject] = await Promise.all([getOrder(id), getOrderPolicySubject(id)]);
  if (!order || !subject) notFound();

  // 404 rather than 403: an employee should not be able to confirm an order id exists.
  if (!can.viewOrder(user, subject)) notFound();

  const feed = await getOrderFeed(order.id, 60);
  const { projection } = order;
  const behind = projection.derivedStatus === "AT_RISK" || projection.derivedStatus === "DELAYED";

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: order.orderNumber }]}
        title={order.title}
        meta={
          <>
            <Badge tone={ORDER_STATUS_TONE[projection.derivedStatus]} dot>
              {ORDER_STATUS_LABEL[projection.derivedStatus]}
            </Badge>
            <Badge tone="neutral" variant="outline">
              {order.customerName}
            </Badge>
            <Badge tone="neutral" variant="outline">
              Promised {formatDayLong(order.promisedOn)}
            </Badge>
            {order.priority === "CRITICAL" || order.priority === "HIGH" ? (
              <Badge tone={order.priority === "CRITICAL" ? "danger" : "warning"}>
                {TASK_PRIORITY_LABEL[order.priority]}
              </Badge>
            ) : null}
          </>
        }
        description={ORDER_STATUS_MEANING[projection.derivedStatus]}
        actions={<PrintButton label="Print" />}
      />

      {behind ? (
        <div
          className={cn(
            "mb-5 flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
            projection.derivedStatus === "DELAYED"
              ? "border-danger/30 bg-danger-soft/50"
              : "border-warning/30 bg-warning-soft/50",
          )}
        >
          <TriangleAlert
            className={cn(
              "mt-px size-4 shrink-0",
              projection.derivedStatus === "DELAYED" ? "text-danger" : "text-warning",
            )}
            aria-hidden="true"
          />
          <p
            className={cn(
              "text-[13px] leading-[19px]",
              projection.derivedStatus === "DELAYED" ? "text-danger-text" : "text-warning-text",
            )}
          >
            {projection.summary}
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-5">
          {/* The row, always expanded — one layout, no drift. */}
          <OrderRow order={order} defaultOpen />

          {order.description ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[13.5px] leading-6 whitespace-pre-wrap text-fg-muted">
                  {order.description}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-3.5 text-fg-subtle" aria-hidden="true" />
                History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {feed.length === 0 ? (
                <p className="text-[12.5px] text-fg-subtle">Nothing recorded yet.</p>
              ) : (
                <ol className="space-y-3">
                  {feed.map((entry) => (
                    <li key={entry.id} className="flex gap-2.5">
                      {entry.actor ? (
                        <Avatar
                          name={entry.actor.name}
                          seed={entry.actor.id}
                          src={entry.actor.avatarUrl}
                          size="xs"
                          className="mt-0.5 shrink-0"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-muted text-[9px] text-fg-subtle"
                        >
                          sys
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] leading-[18px]">
                          <span className="font-medium text-fg">
                            {entry.actor?.name ?? "Automatically"}
                          </span>{" "}
                          <span className="text-fg-muted">{entry.text}</span>{" "}
                          <time
                            dateTime={entry.createdAt.toISOString()}
                            title={formatDateTime(entry.createdAt)}
                            className="text-[11px] text-fg-subtle"
                          >
                            {formatRelative(entry.createdAt)}
                          </time>
                        </p>
                        {entry.comment ? (
                          <p className="mt-1 rounded-md border-l-2 border-border bg-surface-inset px-2.5 py-1.5 text-[12px] leading-[17px] whitespace-pre-wrap text-fg-muted">
                            {entry.comment}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>The promise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[12.5px]">
              <div>
                <p className="text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                  Promised
                </p>
                <p className="text-fg">{formatDayLong(order.promisedOn)}</p>
              </div>

              <div>
                <p className="text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                  Forecast
                </p>
                {projection.isStopped ? (
                  /* A stopped stage has no knowable end, so there is no date to give.
                     Showing the arithmetic here read "(6d early)" on a blocked order. */
                  <p className="font-medium text-warning-text">
                    Stopped
                    <span className="ml-1 font-normal text-fg-subtle">
                      (no finish date until it is unblocked)
                    </span>
                  </p>
                ) : projection.projectedOn ? (
                  <p
                    className={cn(
                      "font-medium",
                      projection.slipDays > 0
                        ? "text-danger-text"
                        : projection.slipDays < 0
                          ? "text-success-text"
                          : "text-fg",
                    )}
                  >
                    {formatDayLong(projection.projectedOn)}
                    <span className="ml-1 font-normal text-fg-subtle">
                      {projection.slipDays > 0
                        ? `(${projection.slipDays}d late)`
                        : projection.slipDays < 0
                          ? `(${Math.abs(projection.slipDays)}d early)`
                          : "(on the date)"}
                    </span>
                  </p>
                ) : (
                  <p className="text-fg-subtle">No stages to forecast from</p>
                )}
              </div>

              <div>
                <p className="text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                  Allotted
                </p>
                <p className="text-fg">{projection.totalAllotted} working days</p>
              </div>

              {order.completedOn ? (
                <div>
                  <p className="text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                    Delivered
                  </p>
                  <p className="text-success-text">{formatDayLong(order.completedOn)}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[12.5px]">
              <Detail icon={<Package />} label="Reference">
                <span className="font-mono text-fg">{order.orderNumber}</span>
              </Detail>

              <Detail icon={<User />} label="Customer">
                <span className="text-fg">{order.customerName}</span>
                {order.customerRef ? (
                  <span className="block text-fg-subtle">their ref {order.customerRef}</span>
                ) : null}
              </Detail>

              {order.product ? (
                <Detail icon={<Package />} label="Product">
                  <span className="text-fg">
                    {order.product}
                    {order.quantity ? ` × ${order.quantity}` : ""}
                  </span>
                </Detail>
              ) : null}

              <Detail icon={<CalendarClock />} label="Created">
                <span className="text-fg">{formatDateTime(order.createdAt)}</span>
                <span className="block text-fg-subtle">by {order.createdBy.name}</span>
              </Detail>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stages</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[12px]">
              {order.stages.map((stage) => (
                <Link
                  key={stage.id}
                  href={`/tasks/${stage.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-hover"
                >
                  <span className="min-w-0 truncate text-fg-muted">
                    {stage.position}. {stage.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      stage.overrun > 0 ? "text-danger-text" : "text-fg-subtle",
                    )}
                  >
                    {stage.used}/{stage.allottedDays}d
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
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
