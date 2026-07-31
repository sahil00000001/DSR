import { cn } from "@/lib/utils/cn";

/**
 * Loading placeholder.
 *
 * Marked `aria-hidden` and wrapped by a `role="status"` region at the page level
 * so assistive tech announces "loading" once instead of reading out every bar.
 */
export function Skeleton({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div aria-hidden="true" className={cn("skeleton", className)} {...props} />;
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          // Ragged right edge on the last line reads as text, not as a block.
          style={{ width: i === lines - 1 ? "62%" : `${88 - i * 4}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-5", className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-16" />
      <Skeleton className="mt-4 h-2 w-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex gap-4 border-b border-border bg-surface-inset px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, c) => (
              <div key={c} className="flex-1">
                <Skeleton className="h-3.5" style={{ width: c === 0 ? "80%" : "55%" }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  // Static pseudo-random heights: a plausible chart silhouette that doesn't
  // change between server and client renders.
  const heights = [46, 68, 38, 82, 56, 74, 44, 90, 62, 52, 78, 40];
  return (
    <div className={cn("flex h-full items-end gap-2", className)}>
      {heights.map((h, i) => (
        <Skeleton key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}
