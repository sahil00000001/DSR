import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "@/components/ui/spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "subtle"
  | "danger"
  | "danger-ghost"
  | "link";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const BASE =
  "relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg " +
  "font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 " +
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-1 " +
  "focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 " +
  // A 1px press translation reads as a physical button without janking layout.
  "active:translate-y-px";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg shadow-xs hover:bg-accent-hover active:bg-accent-active",
  secondary:
    "border border-border bg-surface text-fg shadow-xs hover:bg-surface-hover hover:border-border-strong",
  ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg",
  subtle: "bg-surface-muted text-fg hover:bg-surface-hover",
  danger: "bg-danger text-danger-fg shadow-xs hover:brightness-110 active:brightness-95",
  "danger-ghost": "text-danger-text hover:bg-danger-soft",
  link: "text-accent underline-offset-4 hover:underline active:translate-y-0",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 px-2 text-xs rounded-md",
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-9 px-3.5 text-sm",
  lg: "h-10 px-4 text-sm",
  icon: "size-9 p-0",
  "icon-sm": "size-8 p-0 rounded-md",
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction. Preserves width to avoid layout shift. */
  loading?: boolean;
  /** Stretches to the container width — used in mobile sheets and auth forms. */
  block?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export type ButtonProps = CommonProps &
  Omit<React.ComponentPropsWithRef<"button">, keyof CommonProps>;

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className)}
      {...props}
    >
      {loading && (
        <Spinner
          className={cn("absolute", size === "icon" || size === "icon-sm" ? "" : "left-1/2 -ml-2")}
          size={size === "xs" || size === "sm" ? 13 : 15}
        />
      )}
      {/* Keeping children mounted but invisible preserves the button's width. */}
      <span className={cn("inline-flex items-center gap-1.5", loading && "invisible")}>
        {children}
      </span>
    </button>
  );
}

type ButtonLinkProps = CommonProps & Omit<React.ComponentPropsWithRef<typeof Link>, keyof CommonProps>;

/** A `next/link` styled as a button — keeps navigation semantics intact. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  block = false,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className)}
      {...props}
    >
      {children}
    </Link>
  );
}

/** Groups buttons into a single segmented control with shared borders. */
export function ButtonGroup({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<"div">) {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex items-center [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none",
        "[&>*:not(:first-child)]:-ml-px [&>*:hover]:z-10 [&>*:focus-visible]:z-10",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
