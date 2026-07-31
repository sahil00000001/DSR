import { cn } from "@/lib/utils/cn";

interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Indeterminate loading indicator.
 * Rendered as SVG rather than a bordered div so it stays crisp at any size and
 * inherits `currentColor` from its parent.
 */
export function Spinner({ size = 16, className, label }: SpinnerProps) {
  return (
    <>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={cn("animate-spin-slow shrink-0", className)}
      >
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.6" />
        <path
          d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}

/** Centred spinner for route-level and panel-level loading states. */
export function LoadingBlock({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-3 py-16 text-fg-subtle", className)}
    >
      <Spinner size={22} />
      <p className="text-sm">{label}…</p>
    </div>
  );
}
