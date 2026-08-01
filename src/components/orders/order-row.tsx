"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  MessageSquare,
  Package,
  TriangleAlert,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  TASK_PRIORITY_LABEL,
} from "@/lib/constants/enums";
import { formatDayShort, formatRelative } from "@/lib/utils/date";
import { truncate } from "@/lib/utils/format";
import type { OrderDto } from "@/lib/services/orders";

/**
 * One order, expandable in place.
 *
 * ## Why expanding rather than navigating
 *
 * The client was explicit: one page, everything on it, minimal. So the row collapsed
 * answers "is this order in trouble and who is holding it up", and expanded it shows
 * every stage with allotted-versus-used, plus the latest activity. Nobody has to open a
 * second page to find out what is going on — and with a dozen orders you can expand three
 * and compare them side by side, which a detail page cannot do.
 *
 * ## What the collapsed row has to earn its space
 *
 * Order and customer, promised date, the forecast, and the stage it is stuck on. That
 * last one is the difference between a dashboard and something useful: "ORD-0007 is 2
 * days late" makes you ask a question, "…stuck on Machine shop (Satish)" answers it.
 */
export function OrderRow({
  order,
  feed,
  defaultOpen = false,
}: {
  order: OrderDto;
  /** Latest activity, already merged server-side. */
  feed?: Array<{
    id: string;
    text: string;
    comment: string | null;
    createdAt: Date;
    actorName: string | null;
  }>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { projection } = order;

  const behind = projection.derivedStatus === "AT_RISK" || projection.derivedStatus === "DELAYED";
  const late = projection.derivedStatus === "DELAYED";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-surface transition-colors",
        late
          ? "border-danger/35"
          : projection.derivedStatus === "AT_RISK"
            ? "border-warning/35"
            : "border-border",
      )}
    >
      {/* Collapsed summary — the whole point of the page. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <ChevronRight
          className={cn(
            "mt-0.5 size-4 shrink-0 text-fg-subtle transition-transform",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-[12px] font-semibold tabular-nums text-fg">
              {order.orderNumber}
            </span>
            <span className="text-[13.5px] font-medium text-fg">
              {truncate(order.customerName, 34)}
            </span>
            <Badge tone={ORDER_STATUS_TONE[projection.derivedStatus]} size="sm" dot>
              {ORDER_STATUS_LABEL[projection.derivedStatus]}
            </Badge>
            {order.priority === "CRITICAL" || order.priority === "HIGH" ? (
              <Badge tone={order.priority === "CRITICAL" ? "danger" : "warning"} size="sm">
                {TASK_PRIORITY_LABEL[order.priority]}
              </Badge>
            ) : null}
          </div>

          <p className="mt-0.5 text-[12.5px] text-fg-muted">{truncate(order.title, 72)}</p>

          {/* The forecast line — the reason the page exists. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
            <span className="inline-flex items-center gap-1 text-fg-muted">
              <Clock3 className="size-3 shrink-0" aria-hidden="true" />
              Promised {formatDayShort(order.promisedOn)}
            </span>

            {projection.projectedOn ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-medium",
                  late
                    ? "text-danger-text"
                    : projection.slipDays > 0
                      ? "text-warning-text"
                      : "text-success-text",
                )}
              >
                {behind ? (
                  <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
                ) : (
                  <Check className="size-3 shrink-0" aria-hidden="true" />
                )}
                {projection.slipDays > 0
                  ? `Forecast ${formatDayShort(projection.projectedOn)} · ${projection.slipDays}d late`
                  : projection.slipDays < 0
                    ? `Forecast ${formatDayShort(projection.projectedOn)} · ${Math.abs(projection.slipDays)}d spare`
                    : `Forecast ${formatDayShort(projection.projectedOn)} · on the date`}
              </span>
            ) : (
              <span className="text-fg-subtle">No stages yet</span>
            )}

            {projection.currentStageName ? (
              <span className="inline-flex items-center gap-1 text-fg-subtle">
                <CircleDot className="size-3 shrink-0" aria-hidden="true" />
                {projection.bottleneckNames[0]
                  ? `Stuck on ${projection.bottleneckNames[0]}`
                  : `On ${projection.currentStageName}`}
              </span>
            ) : null}
          </div>
        </div>

        {/* Stage pips — a whole order's shape in 60px. */}
        <div className="hidden shrink-0 items-center gap-1 pt-1 sm:flex">
          {order.stages.map((stage) => (
            <span
              key={stage.id}
              title={`${stage.name} — ${stage.status.toLowerCase()}, ${stage.used}/${
                stage.allottedDays
              } days`}
              className={cn(
                "h-1.5 w-4 rounded-full",
                stage.status === "COMPLETED"
                  ? stage.overrun > 0
                    ? "bg-warning"
                    : "bg-success"
                  : stage.isCurrent
                    ? stage.overrun > 0
                      ? "bg-danger"
                      : "bg-info"
                    : "bg-surface-muted",
              )}
            />
          ))}
        </div>

        <div className="shrink-0 pt-0.5 text-right">
          <p className="text-[11px] tabular-nums text-fg-subtle">
            {projection.stageCompletion}%
          </p>
          <p className="text-[10px] text-fg-subtle">
            {order.stages.filter((stage) => stage.status === "COMPLETED").length}/
            {order.stages.length}
          </p>
        </div>
      </button>

      {open ? (
        <div className="border-t border-border bg-surface-inset/40 px-3.5 py-3">
          <p
            className={cn(
              "mb-3 rounded-lg px-2.5 py-1.5 text-[12px] leading-[17px]",
              late
                ? "bg-danger-soft/50 text-danger-text"
                : projection.slipDays > 0
                  ? "bg-warning-soft/50 text-warning-text"
                  : "bg-surface text-fg-muted",
            )}
          >
            {projection.summary}
          </p>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            {/* Stages: allotted versus used, per person. */}
            <div>
              <p className="mb-2 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                Stages
              </p>

              {order.stages.length === 0 ? (
                <p className="text-[12px] text-fg-subtle">
                  No stages yet — nothing to forecast from.
                </p>
              ) : (
                <ol className="space-y-1.5">
                  {order.stages.map((stage) => (
                    <li key={stage.id}>
                      <div
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5",
                          stage.isCurrent
                            ? stage.overrun > 0
                              ? "border-danger/35 bg-danger-soft/30"
                              : "border-info/35 bg-info-soft/30"
                            : "border-border bg-surface",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
                            stage.status === "COMPLETED"
                              ? "bg-success text-success-fg"
                              : stage.isCurrent
                                ? "bg-info text-info-fg"
                                : "bg-surface-muted text-fg-subtle",
                          )}
                        >
                          {stage.status === "COMPLETED" ? (
                            <Check className="size-3" />
                          ) : (
                            stage.position
                          )}
                        </span>

                        <Link
                          href={`/tasks/${stage.id}`}
                          className="min-w-0 flex-1 text-[12.5px] font-medium text-fg underline-offset-2 hover:underline"
                        >
                          {stage.name}
                        </Link>

                        {stage.assignees[0] ? (
                          <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                            <Avatar
                              name={stage.assignees[0].name}
                              seed={stage.assignees[0].id}
                              src={stage.assignees[0].avatarUrl}
                              size="xs"
                            />
                            <span className="text-[11px] text-fg-muted">
                              {stage.assignees[0].name.split(" ")[0]}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-fg-subtle">Unassigned</span>
                        )}

                        {/* Used against allotted — the number that names a bottleneck. */}
                        <span
                          className={cn(
                            "shrink-0 text-[11px] font-medium tabular-nums",
                            stage.overrun > 0
                              ? "text-danger-text"
                              : stage.status === "COMPLETED"
                                ? "text-success-text"
                                : "text-fg-subtle",
                          )}
                          title={`${stage.used} working days used of ${stage.allottedDays} allotted`}
                        >
                          {stage.used}/{stage.allottedDays}d
                          {stage.overrun > 0 ? ` +${stage.overrun}` : ""}
                        </span>
                      </div>

                      {stage.blockedReason ? (
                        <p className="mt-1 ml-7 rounded border-l-2 border-danger/40 bg-danger-soft/30 px-2 py-1 text-[11px] text-danger-text">
                          {stage.blockedReason}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                  Order
                </p>
                <dl className="space-y-1 text-[11.5px]">
                  {order.product ? (
                    <Pair icon={<Package />} label="Product">
                      {order.product}
                      {order.quantity ? ` × ${order.quantity}` : ""}
                    </Pair>
                  ) : null}
                  {order.customerRef ? (
                    <Pair icon={<User />} label="Their ref">
                      {order.customerRef}
                    </Pair>
                  ) : null}
                  <Pair icon={<Clock3 />} label="Allotted">
                    {projection.totalAllotted} working days
                  </Pair>
                  <Pair icon={<AlarmClock />} label="To promise">
                    {projection.daysToPromise >= 0
                      ? `${projection.daysToPromise} working days`
                      : `${Math.abs(projection.daysToPromise)} days past`}
                  </Pair>
                </dl>
              </div>

              {feed && feed.length > 0 ? (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                    <MessageSquare className="size-3" aria-hidden="true" />
                    Latest
                  </p>
                  <ul className="space-y-1.5">
                    {feed.slice(0, 4).map((entry) => (
                      <li key={entry.id} className="text-[11.5px] leading-[16px]">
                        <span className="text-fg-muted">
                          <span className="font-medium text-fg">
                            {entry.actorName?.split(" ")[0] ?? "System"}
                          </span>{" "}
                          {entry.text}
                        </span>
                        <span className="ml-1 text-fg-subtle">
                          {formatRelative(entry.createdAt)}
                        </span>
                        {entry.comment ? (
                          <span className="mt-0.5 block truncate text-fg-subtle">
                            {truncate(entry.comment, 80)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <Link
                href={`/orders/${order.id}`}
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent underline-offset-2 hover:underline"
              >
                Full order
                <ChevronRight className="size-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Pair({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="shrink-0 text-fg-subtle [&>svg]:size-3" aria-hidden="true">
        {icon}
      </span>
      <dt className="shrink-0 text-fg-subtle">{label}</dt>
      <dd className="min-w-0 truncate text-fg">{children}</dd>
    </div>
  );
}
