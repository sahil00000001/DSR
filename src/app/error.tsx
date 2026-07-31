"use client";

import { useEffect } from "react";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * Next renders this in place of the segment that threw, keeping the shell alive.
 * The raw error is deliberately not shown: `digest` is the server-side
 * correlation id, which is what makes a report actionable without leaking a
 * stack trace or query fragment to the user.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production this is where an error reporter (Sentry et al.) would hook in.
    console.error("Route error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="relative mx-auto mb-5 w-fit">
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-3 rounded-full bg-danger-soft blur-xl"
          />
          <div className="relative grid size-12 place-items-center rounded-2xl border border-border bg-surface text-danger shadow-sm">
            <AlertTriangle className="size-5" />
          </div>
        </div>

        <h1 className="text-lg font-semibold text-fg">This screen didn&apos;t load</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-5 text-fg-muted">
          Something went wrong while preparing this page. Your data is safe — nothing was saved or
          changed.
        </p>

        {error.digest ? (
          <p className="mt-4 font-mono text-[11.5px] text-fg-subtle">
            Reference:{" "}
            <span className="rounded border border-border bg-surface-muted px-1.5 py-0.5">
              {error.digest}
            </span>
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" onClick={reset}>
            <RotateCcw className="size-4" />
            Try again
          </Button>
          <ButtonLink variant="secondary" href="/dashboard">
            <ArrowLeft className="size-4" />
            Back to dashboard
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
