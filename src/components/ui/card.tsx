import { cn } from "@/lib/utils/cn";

interface CardProps extends React.ComponentPropsWithRef<"div"> {
  /** `flat` removes the shadow for cards nested inside another surface. */
  variant?: "raised" | "flat" | "inset";
  /** Adds hover elevation — only for cards that are themselves clickable. */
  interactive?: boolean;
}

export function Card({
  variant = "raised",
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      data-print="card"
      className={cn(
        "rounded-xl border border-border",
        variant === "raised" && "bg-surface shadow-sm",
        variant === "flat" && "bg-surface",
        variant === "inset" && "bg-surface-inset",
        interactive &&
          "transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-md",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  actions,
  ...props
}: React.ComponentPropsWithRef<"div"> & { actions?: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-5 pt-4",
        // Only pad the bottom when content follows.
        "pb-3",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 space-y-0.5">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

export function CardTitle({
  as: Tag = "h3",
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<"h3"> & { as?: "h2" | "h3" | "h4" }) {
  return (
    <Tag className={cn("text-[15px] leading-6 font-semibold text-fg", className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<"p">) {
  return (
    <p className={cn("text-[13px] leading-5 text-fg-muted", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: React.ComponentPropsWithRef<"div">) {
  return (
    <div className={cn("px-5 pb-5", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: React.ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-b-xl border-t border-border bg-surface-inset px-5 py-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Full-bleed divider that ignores the card's horizontal padding. */
export function CardSeparator({ className }: { className?: string }) {
  return <div className={cn("h-px bg-border", className)} role="presentation" />;
}
