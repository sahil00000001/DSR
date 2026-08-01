import Link from "next/link";
import { ArrowRight, Check, Package, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { truncate } from "@/lib/utils/format";
import type { OrderSnapshot } from "@/lib/services/orders";

/**
 * Orders, on the dashboard.
 *
 * Answers one question — **is anything going to be late** — and nothing else. The full
 * board is one click away, so listing every order here would just be a worse version of
 * `/orders`. What earns space is the handful in trouble, each with the reason on the line.
 *
 * A Server Component. The whole card is static markup from data the section already has.
 */
export function OrderCard({ snapshot }: { snapshot: OrderSnapshot }) {
  const needsAttention = snapshot.atRisk + snapshot.delayed;
  const clear = needsAttention === 0;

  return (
    <Card
      className={cn(
        needsAttention > 0 && "border-warning/30",
        snapshot.delayed > 0 && "border-danger/30",
      )}
    >
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Package className="size-3.5 text-fg-subtle" aria-hidden="true" />
          Orders
          {needsAttention > 0 ? (
            <Badge tone={snapshot.delayed > 0 ? "danger" : "warning"} size="sm">
              {needsAttention} need{needsAttention === 1 ? "s" : ""} attention
            </Badge>
          ) : null}
        </CardTitle>
        <Link
          href="/orders"
          className="inline-flex items-center gap-0.5 rounded-sm text-[11.5px] font-medium text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          All orders
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Tile label="Open" value={snapshot.open} />
          <Tile label="Due this week" value={snapshot.dueThisWeek} />
          <Tile
            label="Late"
            value={snapshot.delayed}
            tone={snapshot.delayed > 0 ? "danger" : undefined}
          />
        </div>

        {clear ? (
          <p className="flex items-center gap-2 rounded-lg border border-success/25 bg-success-soft/40 px-3 py-2 text-[12.5px] text-success-text">
            <Check className="size-3.5 shrink-0" aria-hidden="true" />
            Every open order is forecast to land on time.
          </p>
        ) : (
          <ul className="space-y-1.5 border-t border-border pt-3">
            {snapshot.attention.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="block rounded-md px-1.5 py-1 transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 text-[12.5px] leading-[17px]">
                      <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
                        {order.orderNumber}
                      </span>{" "}
                      <span className="font-medium text-fg">
                        {truncate(order.customerName, 26)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[11px] font-medium tabular-nums",
                        order.status === "DELAYED" ? "text-danger-text" : "text-warning-text",
                      )}
                    >
                      {order.slipDays > 0 ? `${order.slipDays}d late` : "stopped"}
                    </span>
                  </span>
                  {/* The reason, so this is actionable rather than just alarming. */}
                  <span className="mt-0.5 block truncate text-[11px] text-fg-subtle">
                    {order.summary}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {snapshot.delayed > 0 ? (
          <Link
            href="/orders?scope=attention"
            className="flex items-center justify-between gap-2 rounded-lg border border-danger/30 bg-danger-soft/50 px-3 py-2 text-[12.5px] font-medium text-danger-text transition-colors hover:bg-danger-soft"
          >
            <span className="inline-flex items-center gap-1.5">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
              {snapshot.delayed} order{snapshot.delayed === 1 ? "" : "s"} past the promised date
            </span>
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2 py-2",
        tone === "danger" ? "border-danger/30 bg-danger-soft/40" : "border-border bg-surface-inset",
      )}
    >
      <p
        className={cn(
          "text-lg leading-none font-semibold tabular-nums",
          tone === "danger" ? "text-danger-text" : "text-fg",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] tracking-wide text-fg-subtle uppercase">{label}</p>
    </div>
  );
}
