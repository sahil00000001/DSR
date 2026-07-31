import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

/**
 * The review board's own loading state.
 *
 * Distinct from the shell's default because this screen is a filter bar plus a
 * long list, not tiles and charts — matching the real shape keeps the filters from
 * appearing to move once data lands.
 */
export default function ReviewLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading reports…</span>

      <div className="mb-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-3.5 w-96" />
        <div className="mt-5 flex gap-4 border-b border-border pb-2.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-border bg-surface p-2.5">
        <Skeleton className="h-8 w-56" />
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-8 w-24" />
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-7 w-48" />
      </div>

      {/* Summary strip */}
      <Skeleton className="mb-4 h-11 w-full rounded-xl" />

      <SkeletonTable rows={8} columns={4} />
    </div>
  );
}
