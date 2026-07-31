import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Sparkline } from "@/components/charts/sparkline";
import { formatNumber } from "@/lib/utils/format";

export interface StatDelta {
  /** Signed change. */
  value: number;
  /** Names the comparison period: "vs last week". */
  period: string;
  /**
   * Whether an increase is good. Absence rising is bad; attendance rising is
   * good — so direction alone can't pick the colour.
   */
  higherIsBetter?: boolean;
  /** Render as a percentage rather than an absolute delta. */
  isPercent?: boolean;
}

interface StatCardProps {
  label: string;
  value: string | number;
  /** Small unit or qualifier printed after the value ("of 20", "h"). */
  unit?: string;
  delta?: StatDelta;
  icon?: React.ReactNode;
  /** 12-point trail; the last point is drawn in the accent. */
  trend?: number[];
  href?: string;
  className?: string;
  /** Extra line under the value — a breakdown or context sentence. */
  footnote?: React.ReactNode;
}

/**
 * Stat tile.
 *
 * Often the right answer when a chart would be overkill: a single number with a
 * delta and a trail answers "how are we doing" faster than any plot. Values use
 * proportional figures on purpose — `tabular-nums` makes a large standalone
 * number look loose, and is reserved for columns that must align.
 */
export function StatCard({
  label,
  value,
  unit,
  delta,
  icon,
  trend,
  href,
  className,
  footnote,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] leading-4 font-medium text-fg-muted">{label}</p>
        {icon ? (
          <span
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-muted text-fg-subtle [&>svg]:size-3.5"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-fg">
            {typeof value === "number" ? formatNumber(value) : value}
            {unit ? (
              <span className="text-[13px] font-medium text-fg-subtle">{unit}</span>
            ) : null}
          </p>

          {delta ? <DeltaChip {...delta} /> : null}
        </div>

        {trend && trend.length > 1 ? (
          <Sparkline values={trend} className="mb-1 shrink-0" width={68} height={26} fill />
        ) : null}
      </div>

      {footnote ? (
        <p className="mt-2.5 text-[11.5px] leading-4 text-fg-subtle">{footnote}</p>
      ) : null}
    </>
  );

  const shell = cn(
    "group relative block rounded-xl border border-border bg-surface p-4",
    href &&
      "transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-md",
    className,
  );

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link href={href} className={shell}>
      {body}
      <ArrowRight
        className="absolute top-4 right-4 size-3.5 -translate-x-1 text-fg-subtle opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
        aria-hidden="true"
      />
    </Link>
  );
}

function DeltaChip({ value, period, higherIsBetter = true, isPercent = false }: StatDelta) {
  const isFlat = value === 0;
  const isUp = value > 0;
  // Colour encodes *good vs bad*, not up vs down.
  const isGood = isFlat ? null : isUp === higherIsBetter;

  const Icon = isFlat ? ArrowRight : isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px]">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium tabular-nums",
          isGood === null && "text-fg-subtle",
          isGood === true && "text-success-text",
          isGood === false && "text-danger-text",
        )}
      >
        <Icon className="size-3" aria-hidden="true" />
        {isFlat ? "No change" : `${isUp ? "+" : "−"}${Math.abs(value)}${isPercent ? "%" : ""}`}
      </span>
      <span className="text-fg-subtle">{period}</span>
    </p>
  );
}

/** Responsive grid that keeps stat tiles on a consistent rhythm. */
export function StatGrid({
  children,
  columns = 4,
  className,
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
