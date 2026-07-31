"use client";

import { useEffect, useRef } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Form toggles built on real inputs.
 *
 * Each control keeps a native `<input>` — visually transparent but full-size and
 * hit-testable — so form submission, keyboard interaction and screen-reader
 * semantics are inherited rather than reimplemented. The visible box is a
 * *direct sibling* of the input, which matters: Tailwind's `peer-checked:`
 * compiles to `.peer:checked ~ &` and only matches siblings. Styling something
 * deeper (the tick, the switch knob) therefore has to be reached from the
 * sibling with `peer-checked:[&>svg]:…` rather than applied to it directly.
 */

interface CheckboxProps extends Omit<React.ComponentPropsWithRef<"input">, "type"> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  /** Tri-state for "some rows selected" in table headers. */
  indeterminate?: boolean;
}

export function Checkbox({
  label,
  description,
  indeterminate = false,
  className,
  ...props
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // `indeterminate` is a DOM property, not an attribute — React can't set it.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const box = (
    <span className="relative inline-grid shrink-0 place-items-center">
      <input
        ref={inputRef}
        type="checkbox"
        aria-checked={indeterminate ? "mixed" : undefined}
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-[17px] place-items-center rounded-[5px] border border-border-strong bg-surface",
          "transition-[background-color,border-color] duration-150",
          "peer-hover:border-accent/60",
          "peer-checked:border-accent peer-checked:bg-accent",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-ring)] peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-canvas",
          "peer-disabled:opacity-50",
          // Reach the tick from the sibling — see the note at the top of the file.
          "peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100",
          indeterminate && "border-accent bg-accent",
        )}
      >
        {indeterminate ? (
          <Minus className="size-3 stroke-[3] text-accent-fg" />
        ) : (
          <Check className="size-3 scale-50 stroke-[3.5] text-accent-fg opacity-0 transition-[opacity,transform] duration-150" />
        )}
      </span>
    </span>
  );

  if (!label && !description) return <span className={cn("inline-flex", className)}>{box}</span>;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 select-none",
        props.disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {box}
      <span className="min-w-0">
        {label ? <span className="block text-[13px] leading-[17px] text-fg">{label}</span> : null}
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-4 text-fg-subtle">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

interface SwitchProps extends Omit<React.ComponentPropsWithRef<"input">, "type"> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export function Switch({ label, description, className, ...props }: SwitchProps) {
  const control = (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        role="switch"
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          "flex h-[20px] w-[34px] items-center rounded-full bg-border-strong p-[2.5px]",
          "transition-colors duration-200",
          "peer-checked:bg-accent",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-ring)] peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-canvas",
          "peer-disabled:opacity-50",
          // Knob is a child of this sibling, so it's addressed from here.
          "peer-checked:[&>span]:translate-x-[14px]",
        )}
      >
        <span className="size-[15px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-[var(--ease-spring)]" />
      </span>
    </span>
  );

  if (!label && !description) return <span className={className}>{control}</span>;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-4 select-none",
        props.disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className="min-w-0">
        {label ? <span className="block text-[13px] font-medium text-fg">{label}</span> : null}
        {description ? (
          <span className="mt-0.5 block text-[12.5px] leading-4 text-fg-muted">{description}</span>
        ) : null}
      </span>
      {control}
    </label>
  );
}

interface RadioProps extends Omit<React.ComponentPropsWithRef<"input">, "type"> {
  label: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
}

/**
 * Card-style radio for leave type / attendance status pickers.
 * Uses `:has()` on the wrapper so the whole card reacts to selection.
 */
export function RadioCard({ label, description, icon, className, ...props }: RadioProps) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface p-3",
        "transition-[border-color,background-color,box-shadow] duration-150 hover:border-border-strong",
        "has-checked:border-accent has-checked:bg-accent-soft/60 has-checked:shadow-xs",
        "has-focus-visible:ring-2 has-focus-visible:ring-[var(--accent-ring)]",
        props.disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input type="radio" className="peer sr-only" {...props} />
      <span
        aria-hidden="true"
        className={cn(
          "mt-px grid size-4 shrink-0 place-items-center rounded-full border border-border-strong bg-surface",
          "transition-[border-color,border-width] peer-checked:border-[5px] peer-checked:border-accent",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
          {icon}
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-4 text-fg-subtle">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
