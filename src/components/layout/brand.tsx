import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * The Cadence mark: a rounded tile with three ascending bars — the "rhythm" of a
 * team reporting day after day. Drawn as inline SVG so it inherits the accent
 * token and stays crisp at every size without shipping an image.
 */
export function CadenceMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-[7px] bg-accent text-accent-fg shadow-xs",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M3 10.5v2" />
        <path d="M8 6v6.5" />
        <path d="M13 3v9.5" />
      </svg>
    </span>
  );
}

export function BrandLockup({
  href = "/dashboard",
  collapsed = false,
  className,
}: {
  href?: string;
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]",
        className,
      )}
    >
      <CadenceMark />
      {!collapsed ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="text-[14.5px] font-semibold tracking-[-0.015em] text-fg">Cadence</span>
          <span className="mt-0.5 text-[10px] font-medium tracking-wide text-fg-subtle">
            TEAM OPERATIONS
          </span>
        </span>
      ) : null}
      <span className="sr-only">Cadence home</span>
    </Link>
  );
}
