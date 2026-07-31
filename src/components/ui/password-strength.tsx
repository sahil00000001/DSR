"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { assessPassword } from "@/lib/auth/password-strength";

const TONE = ["bg-danger", "bg-danger", "bg-warning", "bg-info", "bg-success"] as const;
const TEXT = [
  "text-danger-text",
  "text-danger-text",
  "text-warning-text",
  "text-info-text",
  "text-success-text",
] as const;

/**
 * Live strength meter.
 *
 * Deliberately shows a *segmented* bar rather than a percentage: four filled
 * blocks reads as "three of four" without implying a false precision about how
 * crackable the password is.
 */
export function PasswordStrength({ value, className }: { value: string; className?: string }) {
  const assessment = useMemo(() => assessPassword(value), [value]);

  if (!value) return null;

  return (
    <div className={cn("animate-fade-in space-y-1.5", className)}>
      <div className="flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              index < assessment.score ? TONE[assessment.score] : "bg-surface-muted",
            )}
          />
        ))}
      </div>

      <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11.5px]">
        {/* aria-live so the assessment is announced as it changes, not silently. */}
        <span className={cn("font-medium", TEXT[assessment.score])} aria-live="polite">
          {assessment.label}
        </span>
        {assessment.suggestion ? (
          <span className="text-fg-subtle">{assessment.suggestion}</span>
        ) : null}
      </p>
    </div>
  );
}
