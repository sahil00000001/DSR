import { cn } from "@/lib/utils/cn";
import type { Tone } from "@/components/ui/badge";

const FILL: Record<Tone, string> = {
  neutral: "bg-fg-muted",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

interface ProgressProps {
  value: number;
  max?: number;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

export function Progress({
  value,
  max = 100,
  tone = "accent",
  size = "md",
  className,
  label,
}: ProgressProps) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-muted",
        size === "sm" && "h-1",
        size === "md" && "h-1.5",
        size === "lg" && "h-2.5",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Segmented meter — reads as discrete units, which suits leave balances
 * ("3 of 5 used") far better than a continuous bar.
 */
export function SegmentedMeter({
  used,
  pending = 0,
  total,
  tone = "accent",
  className,
}: {
  used: number;
  pending?: number;
  total: number;
  tone?: Tone;
  className?: string;
}) {
  // Halves are possible (half-day leave), so render at half-unit resolution.
  const segments = Math.max(0, Math.round(total));

  return (
    <div className={cn("flex items-center gap-1", className)} aria-hidden="true">
      {Array.from({ length: segments }).map((_, i) => {
        const filled = i < Math.floor(used);
        const half = !filled && i < used;
        const isPending = !filled && !half && i < used + pending;
        return (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 overflow-hidden rounded-full",
              filled ? FILL[tone] : "bg-surface-muted",
              isPending && "bg-warning/40",
            )}
          >
            {half ? <span className={cn("block h-full w-1/2 rounded-full", FILL[tone])} /> : null}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Compact circular progress used in stat tiles.
 * `strokeDasharray` on a circle avoids any layout cost.
 */
export function RingProgress({
  value,
  size = 40,
  thickness = 4,
  tone = "accent",
  children,
  className,
}: {
  value: number;
  size?: number;
  thickness?: number;
  tone?: Tone;
  children?: React.ReactNode;
  className?: string;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, value));
  const stroke = {
    neutral: "var(--fg-muted)",
    accent: "var(--accent)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    info: "var(--info)",
  }[tone];

  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-muted)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (pct / 100) * circumference}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      {children ? (
        <span className="absolute text-[10.5px] font-semibold tabular-nums">{children}</span>
      ) : null}
    </div>
  );
}
