"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useField } from "@/components/ui/field";

const CONTROL_BASE =
  "w-full rounded-lg border bg-surface text-sm text-fg placeholder:text-fg-subtle " +
  "transition-[border-color,box-shadow,background-color] duration-150 outline-none " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle " +
  "border-border hover:border-border-strong " +
  "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/20";

interface InputProps extends React.ComponentPropsWithRef<"input"> {
  /** Icon rendered inside the control on the leading edge. */
  icon?: React.ReactNode;
  /** Static text or element on the trailing edge (units, buttons). */
  suffix?: React.ReactNode;
  inputSize?: "sm" | "md" | "lg";
}

export function Input({
  className,
  icon,
  suffix,
  inputSize = "md",
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": describedBy,
  ...props
}: InputProps) {
  const field = useField();

  const sizing =
    inputSize === "sm" ? "h-8 text-[13px]" : inputSize === "lg" ? "h-11" : "h-9";

  const control = (
    <input
      id={id ?? field?.id}
      aria-invalid={ariaInvalid ?? field?.invalid ?? undefined}
      aria-describedby={describedBy ?? field?.describedBy}
      className={cn(
        CONTROL_BASE,
        sizing,
        icon ? "pl-9" : "px-3",
        suffix ? "pr-10" : icon ? "pr-3" : undefined,
        className,
      )}
      {...props}
    />
  );

  if (!icon && !suffix) return control;

  return (
    <div className="relative">
      {icon ? (
        <span
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle [&>svg]:size-4"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      {control}
      {suffix ? (
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-fg-subtle">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

interface TextareaProps extends React.ComponentPropsWithRef<"textarea"> {
  /** Grows with content instead of showing an inner scrollbar. */
  autosize?: boolean;
  maxRows?: number;
}

export function Textarea({
  className,
  autosize = false,
  maxRows = 18,
  rows = 4,
  id,
  onChange,
  "aria-invalid": ariaInvalid,
  "aria-describedby": describedBy,
  ...props
}: TextareaProps) {
  const field = useField();
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Resize on mount and whenever the value changes from outside (e.g. a draft
  // restored from localStorage), not just on keystrokes.
  useEffect(() => {
    if (!autosize) return;
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "20");
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * maxRows)}px`;
  }, [autosize, maxRows, props.value]);

  return (
    <textarea
      ref={ref}
      id={id ?? field?.id}
      rows={rows}
      aria-invalid={ariaInvalid ?? field?.invalid ?? undefined}
      aria-describedby={describedBy ?? field?.describedBy}
      onChange={(event) => {
        if (autosize) {
          const el = event.currentTarget;
          el.style.height = "auto";
          const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "20");
          el.style.height = `${Math.min(el.scrollHeight, lineHeight * maxRows)}px`;
        }
        onChange?.(event);
      }}
      className={cn(
        CONTROL_BASE,
        "resize-y px-3 py-2 leading-6",
        autosize && "resize-none overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Search field with a clear affordance.
 * Type `search` gives mobile keyboards a "Search" key; the native clear button
 * is suppressed in favour of a themed one.
 */
export function SearchInput({
  value,
  onValueChange,
  placeholder = "Search…",
  className,
  inputSize = "md",
  ...props
}: Omit<React.ComponentPropsWithRef<"input">, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  inputSize?: "sm" | "md" | "lg";
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          CONTROL_BASE,
          inputSize === "sm" ? "h-8 text-[13px]" : inputSize === "lg" ? "h-11" : "h-9",
          "pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden",
        )}
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onValueChange("")}
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
