"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PopoverPanel, usePopover } from "@/components/ui/popover";
import { SearchInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/badge";

export interface FilterOption {
  value: string;
  label: string;
  /** Secondary line — department for an employee, member count for a team. */
  meta?: string;
  /** Optional colour dot, e.g. a department's token. */
  color?: string;
}

interface FilterSelectProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Single-select collapses to one value and closes on pick. */
  multiple?: boolean;
  searchable?: boolean;
  className?: string;
  /** Shown when nothing is selected. */
  placeholder?: string;
  icon?: React.ReactNode;
  size?: "sm" | "md";
}

/**
 * Searchable multi-select used by every filter bar in the product.
 *
 * A custom listbox is justified here (unlike ordinary form selects, which stay
 * native): filtering 20+ employees by typing, showing a selected count, and
 * clearing in one click are all things a native `<select multiple>` can't do
 * legibly — especially on mobile.
 */
export function FilterSelect({
  label,
  options,
  selected,
  onChange,
  multiple = true,
  searchable,
  className,
  placeholder,
  icon,
  size = "sm",
}: FilterSelectProps) {
  const { open, close, triggerProps, panelProps } = usePopover({ role: "listbox" });
  const [query, setQuery] = useState("");

  // Search appears automatically once the list is long enough to need it.
  const showSearch = searchable ?? options.length > 8;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) || option.meta?.toLowerCase().includes(q),
    );
  }, [options, query]);

  const selectedSet = new Set(selected);
  const selectedLabels = options.filter((o) => selectedSet.has(o.value)).map((o) => o.label);

  const toggle = (value: string) => {
    if (!multiple) {
      onChange(selectedSet.has(value) ? [] : [value]);
      close();
      return;
    }
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  };

  const summary =
    selectedLabels.length === 0
      ? (placeholder ?? label)
      : selectedLabels.length === 1
        ? selectedLabels[0]!
        : `${selectedLabels.length} selected`;

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        className={cn(
          "inline-flex max-w-[14rem] items-center gap-1.5 rounded-lg border bg-surface font-medium",
          "transition-[border-color,background-color] duration-150 outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]",
          size === "sm" ? "h-8 px-2.5 text-[12.5px]" : "h-9 px-3 text-[13px]",
          selectedLabels.length > 0
            ? "border-accent/40 bg-accent-soft/60 text-fg"
            : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
          className,
        )}
      >
        {icon ? <span className="shrink-0 [&>svg]:size-3.5" aria-hidden="true">{icon}</span> : null}
        <span className="truncate">
          {selectedLabels.length > 0 ? (
            <>
              <span className="text-fg-muted">{label}:</span> {summary}
            </>
          ) : (
            summary
          )}
        </span>
        {selectedLabels.length > 1 ? (
          <CountBadge count={selectedLabels.length} tone="accent" />
        ) : null}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-fg-subtle transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      <PopoverPanel
        {...panelProps}
        role="listbox"
        aria-label={label}
        className="w-[min(18rem,calc(100vw-2rem))]"
        bare
      >
        {showSearch ? (
          <div className="border-b border-border p-2">
            <SearchInput
              value={query}
              onValueChange={setQuery}
              placeholder={`Search ${label.toLowerCase()}…`}
              inputSize="sm"
              data-autofocus=""
            />
          </div>
        ) : null}

        <div className="max-h-[16rem] overflow-y-auto overscroll-contain p-1.5">
          {filtered.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-[12.5px] text-fg-subtle">
              No matches for “{query}”
            </p>
          ) : (
            filtered.map((option) => {
              const isSelected = selectedSet.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggle(option.value)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    "outline-none hover:bg-surface-hover focus-visible:bg-surface-hover",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-[15px] shrink-0 place-items-center border transition-colors",
                      multiple ? "rounded-[4px]" : "rounded-full",
                      isSelected ? "border-accent bg-accent" : "border-border-strong",
                    )}
                  >
                    {isSelected ? <Check className="size-2.5 stroke-[3.5] text-accent-fg" /> : null}
                  </span>

                  {option.color ? (
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: `var(--cat-${option.color})` }}
                    />
                  ) : null}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fg">{option.label}</span>
                    {option.meta ? (
                      <span className="block truncate text-[11.5px] text-fg-subtle">
                        {option.meta}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {multiple && selected.length > 0 ? (
          <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
            <span className="pl-1 text-[11.5px] text-fg-subtle tabular-nums">
              {selected.length} selected
            </span>
            <Button variant="ghost" size="xs" onClick={() => onChange([])}>
              <X className="size-3" />
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverPanel>
    </>
  );
}

/**
 * Bar that hosts filter controls plus a "clear all" escape hatch.
 * Sticky on desktop so filters stay reachable while scrolling long report lists.
 */
export function FilterBar({
  children,
  activeCount = 0,
  onClear,
  className,
}: {
  children: React.ReactNode;
  activeCount?: number;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <div
      data-print="hide"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5",
        className,
      )}
    >
      {children}
      {activeCount > 0 && onClear ? (
        <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto text-fg-muted">
          <X className="size-3.5" />
          Clear {activeCount === 1 ? "filter" : `${activeCount} filters`}
        </Button>
      ) : null}
    </div>
  );
}
