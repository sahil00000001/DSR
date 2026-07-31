import { cn } from "@/lib/utils/cn";

interface SparklineProps {
  /** 8–14 points reads best; more and the shape turns to noise. */
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  /** De-emphasis hue for the trail; the final point gets the accent. */
  color?: string;
  /** Accessible summary — the tile's label usually supplies the context. */
  label?: string;
  /** Fills under the line with a 10% wash. */
  fill?: boolean;
}

/**
 * Hand-rolled SVG sparkline.
 *
 * A stat tile can appear a dozen times on the dashboard; mounting a dozen
 * recharts instances for a 12-point trail is not a trade worth making. This
 * renders as a server component with zero JavaScript.
 */
export function Sparkline({
  values,
  width = 72,
  height = 24,
  className,
  color = "var(--fg-subtle)",
  label,
  fill = false,
}: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // Flat series would divide by zero; render them as a centred line instead.
  const span = max - min || 1;
  const padding = 2;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * innerWidth;
    const y = padding + innerHeight - ((value - min) / span) * innerHeight;
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPath = `${path} L${(width - padding).toFixed(2)},${height - padding} L${padding},${height - padding} Z`;
  const last = points[points.length - 1]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {fill ? <path d={areaPath} fill={color} fillOpacity={0.1} /> : null}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current period in the accent, with a surface ring so it reads clearly. */}
      <circle cx={last[0]} cy={last[1]} r={2.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}
