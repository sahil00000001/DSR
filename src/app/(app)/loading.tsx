import { Skeleton, SkeletonCard, SkeletonChart } from "@/components/ui/skeleton";

/**
 * Route-level loading state for the whole authenticated section.
 *
 * Next streams this while a page's data resolves. It mirrors the real layout —
 * header, stat row, two charts, a rail — so the transition is a fill-in rather
 * than a reflow. A centred spinner would be less code and a worse experience: the
 * page would visibly jump once content arrived.
 *
 * `role="status"` with a single `sr-only` label means assistive tech announces
 * "loading" once, instead of reading out two dozen placeholder blocks.
 */
export default function AppLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Page header */}
      <div className="mb-6">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="mt-2 h-3.5 w-80" />
      </div>

      {/* Stat tiles */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <SkeletonCard key={index} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Primary panel */}
          <div className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border bg-surface-inset px-5 py-4">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
            <div className="space-y-4 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>

          {/* Charts */}
          <div className="grid gap-5 lg:grid-cols-2">
            {[0, 1].map((index) => (
              <div key={index} className="rounded-xl border border-border bg-surface p-5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-48" />
                <div className="mt-5 h-[150px]">
                  <SkeletonChart />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rail */}
        <div className="hidden space-y-5 xl:block">
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded-xl border border-border bg-surface p-5">
              <Skeleton className="h-4 w-28" />
              <div className="mt-4 space-y-3">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="flex items-center gap-2.5">
                    <Skeleton className="size-6 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
