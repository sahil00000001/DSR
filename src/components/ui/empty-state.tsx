import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Empty states carry real weight in a reporting product — most screens are
 * empty on day one. Each one names what's missing and offers the next action
 * rather than just saying "no data".
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "md",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        size === "md" ? "py-14" : "py-9",
        className,
      )}
    >
      {icon ? (
        <div className="relative mb-4">
          {/* Soft radial halo behind the glyph adds depth without a graphic. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-4 rounded-full bg-accent-soft/70 blur-xl"
          />
          <div
            className={cn(
              "relative grid place-items-center rounded-2xl border border-border bg-surface text-fg-subtle shadow-sm",
              size === "md" ? "size-12" : "size-10",
            )}
          >
            {icon}
          </div>
        </div>
      ) : null}

      <h3 className={cn("font-semibold text-fg", size === "md" ? "text-[15px]" : "text-sm")}>
        {title}
      </h3>

      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-fg-muted">{description}</p>
      ) : null}

      {action || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

/** Inline variant for empty table bodies, where vertical space is scarce. */
export function EmptyRow({
  colSpan,
  title,
  description,
  action,
}: {
  colSpan: number;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4">
        <EmptyState size="sm" title={title} description={description} action={action} />
      </td>
    </tr>
  );
}
