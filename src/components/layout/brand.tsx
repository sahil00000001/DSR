import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { BRAND } from "@/lib/constants/brand";

/**
 * The Pooja Machines mark: a three-blade impeller on a rounded tile.
 *
 * The company builds sewing machines and fans, and a fan blade is the one motif that
 * still reads at 16px in a browser tab — a sewing-machine silhouette turns to mush
 * below about 40px.
 *
 * Drawn as inline SVG so it inherits the accent token and stays crisp at every size
 * without shipping an image. The path is **generated** by
 * `scripts/generate-icons.mjs` from the same geometry that rasterises the PWA icons.
 * Run `node scripts/generate-icons.mjs --print-path` after changing the blade
 * constants there, rather than editing these coordinates by hand.
 */
const BLADES =
  "M15.73 14.42C14.15 11.18 16 7.29 18.38 4.24C21.68 4.91 24.65 7.03 26.35 9.93C21.72 8.89 18.5 11.29 16.27 14.42Z M17.5 16.55C21.1 16.81 23.54 20.35 24.99 23.95C22.77 26.46 19.45 27.98 16.09 28C19.29 24.51 18.83 20.52 17.23 17.02Z M14.77 17.02C12.75 20.01 8.46 20.35 4.62 19.82C3.55 16.63 3.91 13 5.56 10.07C6.98 14.6 10.67 16.19 14.5 16.55Z";

export function PoojaMark({ size = 26, className }: { size?: number; className?: string }) {
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
        width={size * 0.78}
        height={size * 0.78}
        viewBox="0 0 32 32"
        fill="currentColor"
        stroke="none"
      >
        <path d={BLADES} />
        <circle cx="16" cy="16" r="2.72" />
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
      <PoojaMark />
      {!collapsed ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-[14.5px] font-semibold tracking-[-0.015em] text-fg">
            {BRAND.name}
          </span>
          <span className="mt-0.5 text-[10px] font-medium tracking-wide text-fg-subtle">
            {BRAND.lockupSubtitle}
          </span>
        </span>
      ) : null}
      <span className="sr-only">{BRAND.name} home</span>
    </Link>
  );
}
