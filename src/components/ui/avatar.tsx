/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils/cn";
import { initials, stableHash } from "@/lib/utils/format";

/**
 * Deterministic gradient pairs drawn from the categorical scale. Hashing the
 * user id means a person's avatar colour is stable everywhere in the product
 * without storing anything.
 */
const GRADIENTS = [
  "from-[var(--cat-indigo)] to-[var(--cat-violet)]",
  "from-[var(--cat-emerald)] to-[var(--cat-teal)]",
  "from-[var(--cat-amber)] to-[var(--cat-orange)]",
  "from-[var(--cat-sky)] to-[var(--cat-indigo)]",
  "from-[var(--cat-violet)] to-[var(--cat-rose)]",
  "from-[var(--cat-rose)] to-[var(--cat-orange)]",
  "from-[var(--cat-teal)] to-[var(--cat-sky)]",
  "from-[var(--cat-orange)] to-[var(--cat-amber)]",
] as const;

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-[11px]",
  lg: "size-10 text-[13px]",
  xl: "size-14 text-lg",
  "2xl": "size-20 text-2xl",
} as const;

export type AvatarSize = keyof typeof SIZES;

interface AvatarProps {
  name: string;
  /** Stable identity used to pick the gradient — falls back to the name. */
  seed?: string;
  src?: string | null;
  size?: AvatarSize;
  /** Renders a coloured presence ring. */
  status?: "online" | "away" | "offline" | null;
  className?: string;
}

export function Avatar({ name, seed, src, size = "md", status, className }: AvatarProps) {
  const gradient = GRADIENTS[stableHash(seed ?? name, GRADIENTS.length)]!;

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {src ? (
        <img
          src={src}
          alt=""
          className={cn(
            "rounded-full object-cover ring-1 ring-border ring-inset",
            SIZES[size].split(" ")[0],
          )}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white",
            "ring-1 ring-inset ring-black/5 select-none",
            gradient,
            SIZES[size],
          )}
        >
          {initials(name)}
        </span>
      )}

      {status && (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-surface",
            size === "xs" || size === "sm" ? "size-2" : "size-2.5",
            status === "online" && "bg-success",
            status === "away" && "bg-warning",
            status === "offline" && "bg-fg-subtle",
          )}
        />
      )}
      {/* The visible avatar is decorative; the accessible name lives here. */}
      <span className="sr-only">{name}</span>
    </span>
  );
}

/** Overlapping avatar stack with a "+N" overflow chip. */
export function AvatarStack({
  people,
  max = 4,
  size = "sm",
  className,
}: {
  people: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  max?: number;
  size?: AvatarSize;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex -space-x-1.5">
        {shown.map((person) => (
          <Avatar
            key={person.id}
            name={person.name}
            seed={person.id}
            src={person.avatarUrl}
            size={size}
            className="ring-2 ring-surface rounded-full"
          />
        ))}
      </div>
      {overflow > 0 && (
        <span className="ml-2 text-xs font-medium text-fg-subtle tabular-nums">+{overflow}</span>
      )}
    </div>
  );
}

/** Avatar plus name/meta — the standard identity cell in tables and lists. */
export function PersonCell({
  name,
  meta,
  seed,
  src,
  size = "md",
  className,
}: {
  name: string;
  meta?: React.ReactNode;
  seed?: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Avatar name={name} seed={seed} src={src} size={size} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-fg">{name}</div>
        {meta ? <div className="truncate text-xs text-fg-subtle">{meta}</div> : null}
      </div>
    </div>
  );
}
