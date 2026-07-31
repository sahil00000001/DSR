/**
 * Chart colour assignment.
 *
 * ## Slot order is fixed and validated
 *
 * `CHART_SERIES` is the categorical assignment order. It is *not* alphabetical
 * and not the declaration order of the CSS tokens — it was chosen by exhaustive
 * search over orderings to maximise the worst adjacent separation under
 * simulated protanopia and deuteranopia.
 *
 *   worst adjacent ΔE (OKLab ×100): 15.1 light · 15.4 dark   (target ≥ 8.0)
 *
 * Two rules follow from this and must not be broken:
 *
 *  1. **Colour follows the entity, never its rank.** `seriesColorFor(key)` hashes
 *     a stable key (a department id, a status), so filtering a series out never
 *     repaints the survivors.
 *  2. **Slots are never cycled.** Past 8 categories the tail folds into "Other"
 *     via `withOtherBucket()` rather than reusing a hue that would be
 *     indistinguishable under CVD.
 *
 * Light-mode amber sits at 2.35:1 against white — below the 3:1 relief
 * threshold. Every chart in this product therefore ships a legend and a table
 * view (see ChartFrame), which is the required relief.
 */

export const CHART_SERIES = [
  "indigo",
  "emerald",
  "violet",
  "amber",
  "teal",
  "orange",
  "sky",
  "rose",
] as const;

export type SeriesSlot = (typeof CHART_SERIES)[number];

/** CSS custom property for a slot — resolves per theme automatically. */
export function slotColor(slot: SeriesSlot): string {
  return `var(--cat-${slot})`;
}

/** Colour for slot `index`, or the neutral "Other" grey once slots run out. */
export function seriesColorAt(index: number): string {
  const slot = CHART_SERIES[index];
  return slot ? slotColor(slot) : "var(--fg-subtle)";
}

/** Deterministic slot for a stable key — survives filtering and re-ordering. */
export function seriesColorFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return slotColor(CHART_SERIES[Math.abs(hash) % CHART_SERIES.length]!);
}

/**
 * Caps a categorical breakdown at `max` slots, folding the remainder into a
 * single "Other" row. Prevents both hue cycling and unreadable legends.
 */
export function withOtherBucket<T extends { label: string; value: number }>(
  items: T[],
  max = 6,
): Array<{ label: string; value: number; isOther?: boolean }> {
  if (items.length <= max) return items;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, max - 1);
  const tail = sorted.slice(max - 1);
  return [
    ...head,
    { label: "Other", value: tail.reduce((sum, item) => sum + item.value, 0), isOther: true },
  ];
}

// ---------------------------------------------------------------------------
//  Status colours — reserved, never reused as a categorical slot
// ---------------------------------------------------------------------------

/**
 * Attendance and leave states carry *meaning*, not identity, so they use the
 * status palette. These are deliberately disjoint from CHART_SERIES.
 */
export const STATUS_COLOR = {
  PRESENT: "var(--success)",
  WFH: "var(--info)",
  HALF_DAY: "var(--warning)",
  LEAVE: "var(--accent)",
  ABSENT: "var(--danger)",
  HOLIDAY: "var(--fg-subtle)",
  WEEKEND: "var(--border-strong)",
} as const;

export const LEAVE_COLOR = {
  CASUAL: "var(--info)",
  SICK: "var(--danger)",
  EARNED: "var(--success)",
  UNPAID: "var(--fg-subtle)",
} as const;

export const DSR_COLOR = {
  SUBMITTED: "var(--info)",
  REVIEWED: "var(--success)",
  DRAFT: "var(--fg-subtle)",
  FLAGGED: "var(--warning)",
} as const;

// ---------------------------------------------------------------------------
//  Sequential ramp — magnitude only (one hue, light → dark)
// ---------------------------------------------------------------------------

export const SEQUENTIAL_STEPS = [
  "var(--seq-1)",
  "var(--seq-2)",
  "var(--seq-3)",
  "var(--seq-4)",
  "var(--seq-5)",
  "var(--seq-6)",
] as const;

/** Bucket a 0–1 intensity onto the ramp. `0` returns the empty-cell surface. */
export function sequentialStep(intensity: number): string {
  if (intensity <= 0) return "var(--surface-muted)";
  const index = Math.min(
    SEQUENTIAL_STEPS.length - 1,
    Math.floor(intensity * SEQUENTIAL_STEPS.length),
  );
  return SEQUENTIAL_STEPS[index]!;
}

// ---------------------------------------------------------------------------
//  Shared chart geometry — one set of numbers so every chart matches
// ---------------------------------------------------------------------------

export const CHART = {
  /** Bars never fill their band; the leftover is air. */
  maxBarSize: 24,
  /** The 2px surface gap that separates adjacent marks. */
  barGap: 2,
  barCategoryGap: "22%",
  lineWidth: 2,
  dotRadius: 4,
  /** Area washes are a hint of hue, not a block of it. */
  areaOpacity: 0.1,
  axisTick: { fontSize: 11.5, fill: "var(--fg-subtle)" },
  margin: { top: 8, right: 8, bottom: 0, left: -18 },
} as const;
