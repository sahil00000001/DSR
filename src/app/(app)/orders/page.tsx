import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Check,
  Package,
  Plus,
  Send,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { can, isAdmin } from "@/lib/auth/rbac";
import { getOrderFeeds, listOrders } from "@/lib/services/orders";
import { orderFilterSchema, parseSearchParams } from "@/lib/validation/schemas";
import { env, isMessagingEnabled } from "@/lib/env";
import { OrderRow } from "@/components/orders/order-row";
import { OrderSearch } from "@/components/orders/order-search";
import { SendSummaryButton } from "@/components/orders/send-summary-button";

export const metadata: Metadata = {
  title: "Orders",
  description: "Every live order, what it is waiting on, and whether it will land on time.",
};

/**
 * Orders — one page.
 *
 * The client asked for exactly this: minimal, everything visible, no hunting. So there is
 * no board, no calendar and no pagination. Four counts across the top, a search box, and
 * one expandable row per order ordered worst-first.
 *
 * Rows are expanded inline rather than linked, and the feed for each is loaded here so
 * expanding costs nothing — the whole page is one render. That is affordable because the
 * list is bounded at 200: a plant with more live orders than that needs a different
 * screen, and pretending otherwise would make this one slow for everybody.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can.viewOrders(user)) redirect("/forbidden");

  const raw = parseSearchParams(orderFilterSchema, await searchParams);
  const scope = raw.scope ?? "open";

  const { rows, summary } = await listOrders({ ...raw, scope }, user);

  /**
   * Feeds for every row in two queries, not two per row.
   *
   * Expanding a row must not cost a round trip, so the activity is loaded with the page.
   * Doing that per order meant 2 × 200 queries at the cap; `getOrderFeeds` batches it.
   */
  const feeds = await getOrderFeeds(
    rows.map((order) => order.id),
    4,
  );

  const feedByOrder = new Map(
    rows.map((order) => [
      order.id,
      (feeds.get(order.id) ?? []).map((entry) => ({
        id: entry.id,
        text: entry.text,
        comment: entry.comment,
        createdAt: entry.createdAt,
        actorName: entry.actor?.name ?? null,
      })),
    ]),
  );

  const needsAttention = summary.atRisk + summary.delayed;

  const scopes = [
    { value: "open", label: "Open", count: summary.open },
    { value: "attention", label: "Needs attention", count: needsAttention },
    { value: "delivered", label: "Delivered", count: summary.deliveredThisMonth },
    { value: "all", label: "All", count: null },
  ] as const;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Worst first. Each row shows the forecast and the stage holding it up."
        actions={
          <>
            {isAdmin(user) ? <SendSummaryButton configured={isMessagingEnabled} /> : null}
            {can.manageOrders(user) ? (
              <ButtonLink href="/orders/new" variant="primary" size="sm">
                <Plus className="size-4" />
                New order
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {/* Four numbers. Deliberately not StatCards — this page is meant to be dense. */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-stagger>
        <Tile label="Open" value={summary.open} />
        <Tile
          label="At risk"
          value={summary.atRisk}
          tone={summary.atRisk > 0 ? "warning" : undefined}
        />
        <Tile
          label="Late"
          value={summary.delayed}
          tone={summary.delayed > 0 ? "danger" : undefined}
        />
        <Tile
          label="Days of slip"
          value={summary.totalSlip}
          tone={summary.totalSlip > 0 ? "danger" : undefined}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Order scope" className="flex flex-wrap items-center gap-1">
          {scopes.map((entry) => (
            <Link
              key={entry.value}
              href={`/orders?scope=${entry.value}`}
              scroll={false}
              aria-current={scope === entry.value ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                scope === entry.value
                  ? "bg-accent-soft text-accent"
                  : "text-fg-muted hover:bg-surface-hover hover:text-fg",
              )}
            >
              {entry.value === "attention" && needsAttention > 0 ? (
                <TriangleAlert className="size-3.5" aria-hidden="true" />
              ) : null}
              {entry.label}
              {entry.count !== null && entry.count > 0 ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10.5px] tabular-nums",
                    entry.value === "attention"
                      ? "bg-danger text-danger-fg"
                      : scope === entry.value
                        ? "bg-accent text-accent-fg"
                        : "bg-surface-muted text-fg-muted",
                  )}
                >
                  {entry.count}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <OrderSearch />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Package className="size-5" />}
          title={
            scope === "attention"
              ? "Nothing needs attention"
              : raw.q
                ? "No orders match that"
                : "No orders yet"
          }
          description={
            scope === "attention"
              ? "Every open order is forecast to land on or before its promised date."
              : raw.q
                ? "Try a different reference, customer or product."
                : "Create an order, give each stage an owner and a number of days, and the forecast takes care of itself."
          }
          action={
            can.manageOrders(user) && !raw.q ? (
              <ButtonLink href="/orders/new" variant="primary" size="sm">
                <Plus className="size-4" />
                Create the first order
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2" data-stagger>
          {rows.map((order, index) => (
            <OrderRow
              key={order.id}
              order={order}
              feed={feedByOrder.get(order.id)}
              /* The worst one starts open: if you only look at one thing, look at that.
                 Keyed off the derived status rather than `slipDays`, because a blocked
                 order is at risk while its day count still looks comfortable. */
              defaultOpen={
                index === 0 &&
                (order.projection.derivedStatus === "DELAYED" ||
                  order.projection.derivedStatus === "AT_RISK")
              }
            />
          ))}
        </div>
      )}

      {/* Where the WhatsApp summary stands, so a silent channel is visible in the app. */}
      {isAdmin(user) ? (
        <p className="mt-5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-subtle">
          <Send className="size-3 shrink-0" aria-hidden="true" />
          {isMessagingEnabled ? (
            <>
              Daily summary goes to WhatsApp via{" "}
              <span className="font-medium text-fg-muted">{env.MESSAGING_PROVIDER}</span>. Reply{" "}
              <span className="font-medium text-fg-muted">STATUS</span> to that number any time for
              this list.
            </>
          ) : (
            <>
              WhatsApp is not configured, so no summary is being sent. See{" "}
              <span className="font-medium text-fg-muted">docs/WHATSAPP.md</span>.
            </>
          )}
        </p>
      ) : null}
    </>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        tone === "danger"
          ? "border-danger/30 bg-danger-soft/40"
          : tone === "warning"
            ? "border-warning/30 bg-warning-soft/40"
            : "border-border bg-surface",
      )}
    >
      <p className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-xl leading-none font-semibold tabular-nums",
            tone === "danger"
              ? "text-danger-text"
              : tone === "warning"
                ? "text-warning-text"
                : "text-fg",
          )}
        >
          {value}
        </span>
        {value === 0 && tone ? (
          <Check className="size-3.5 text-success" aria-hidden="true" />
        ) : null}
      </p>
      <p className="mt-1 text-[10.5px] tracking-wide text-fg-subtle uppercase">{label}</p>
    </div>
  );
}
