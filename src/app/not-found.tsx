import { Compass, LayoutDashboard } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="relative mx-auto mb-5 w-fit">
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-3 rounded-full bg-accent-soft blur-xl"
          />
          <div className="relative grid size-12 place-items-center rounded-2xl border border-border bg-surface text-accent shadow-sm">
            <Compass className="size-5" />
          </div>
        </div>

        <p className="text-[11.5px] font-semibold tracking-[0.12em] text-fg-subtle uppercase">
          404
        </p>
        <h1 className="mt-1.5 text-lg font-semibold text-fg">We couldn&apos;t find that page</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-5 text-fg-muted">
          The link may be out of date, or the record it pointed at has since been removed.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <ButtonLink variant="primary" href="/dashboard">
            <LayoutDashboard className="size-4" />
            Go to dashboard
          </ButtonLink>
          <ButtonLink variant="secondary" href="/dsr">
            My reports
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
