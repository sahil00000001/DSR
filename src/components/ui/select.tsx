"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useField } from "@/components/ui/field";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends React.ComponentPropsWithRef<"select"> {
  options: ReadonlyArray<SelectOption>;
  /** Rendered as a disabled first option — the "nothing chosen yet" state. */
  placeholder?: string;
  selectSize?: "sm" | "md" | "lg";
}

/**
 * Styled native `<select>`.
 *
 * Deliberately native: it inherits full keyboard support, screen-reader
 * semantics and — importantly for a mobile-first product — the platform's own
 * wheel picker on iOS and Android. Custom listboxes are reserved for the cases
 * that genuinely need search or multi-select (see FilterSelect).
 */
export function Select({
  options,
  placeholder,
  className,
  selectSize = "md",
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": describedBy,
  ...props
}: SelectProps) {
  const field = useField();

  return (
    <div className="relative">
      <select
        id={id ?? field?.id}
        aria-invalid={ariaInvalid ?? field?.invalid ?? undefined}
        aria-describedby={describedBy ?? field?.describedBy}
        className={cn(
          "w-full cursor-pointer appearance-none rounded-lg border border-border bg-surface pr-9 pl-3 text-sm text-fg",
          "transition-[border-color,box-shadow] duration-150 outline-none hover:border-border-strong",
          "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]",
          "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle",
          "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/20",
          selectSize === "sm" ? "h-8 text-[13px]" : selectSize === "lg" ? "h-11" : "h-9",
          className,
        )}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle"
        aria-hidden="true"
      />
    </div>
  );
}

/** Builds `<Select>` options from a readonly enum tuple + label map. */
export function optionsFrom<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): SelectOption[] {
  return values.map((value) => ({ value, label: labels[value] }));
}
