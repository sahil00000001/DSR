import { cn } from "@/lib/utils/cn";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
export type BadgeVariant = "soft" | "solid" | "outline";

const SOFT: Record<Tone, string> = {
  neutral: "bg-surface-muted text-fg-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-danger-text",
  info: "bg-info-soft text-info-text",
};

const SOLID: Record<Tone, string> = {
  neutral: "bg-fg-muted text-fg-inverted",
  accent: "bg-accent text-accent-fg",
  success: "bg-success text-success-fg",
  warning: "bg-warning text-warning-fg",
  danger: "bg-danger text-danger-fg",
  info: "bg-info text-info-fg",
};

const OUTLINE: Record<Tone, string> = {
  neutral: "border border-border text-fg-muted",
  accent: "border border-accent/35 text-accent",
  success: "border border-success/35 text-success-text",
  warning: "border border-warning/40 text-warning-text",
  danger: "border border-danger/35 text-danger-text",
  info: "border border-info/35 text-info-text",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-fg-subtle",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

interface BadgeProps extends React.ComponentPropsWithRef<"span"> {
  tone?: Tone;
  variant?: BadgeVariant;
  /** Leading status dot — reinforces meaning for colour-blind users. */
  dot?: boolean;
  size?: "sm" | "md";
}

export function Badge({
  tone = "neutral",
  variant = "soft",
  dot = false,
  size = "md",
  className,
  children,
  ...props
}: BadgeProps) {
  const palette = variant === "solid" ? SOLID : variant === "outline" ? OUTLINE : SOFT;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs",
        palette[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}

/**
 * Small numeric indicator for nav items and tabs.
 * Caps at 99+ so a large count can't stretch the layout.
 */
export function CountBadge({
  count,
  tone = "neutral",
  className,
}: {
  count: number;
  tone?: Tone;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums",
        tone === "neutral" ? "bg-surface-muted text-fg-muted" : SOLID[tone],
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Keyboard shortcut hint, e.g. ⌘K. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-muted px-1.5",
        "font-sans text-[10.5px] font-medium text-fg-subtle",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
