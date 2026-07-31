"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

/**
 * Period selector for the analytics screen.
 *
 * A single control above everything it scopes — every chart and table on the page
 * re-renders against the same slice, rather than each card owning its own range.
 * The value lives in the URL so a view can be shared or bookmarked.
 */
export function RangePicker({
  value,
  options,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      {isPending ? <Spinner size={14} className="text-fg-subtle" /> : null}
      <label className="flex items-center gap-2">
        <CalendarRange className="size-4 text-fg-subtle" aria-hidden="true" />
        <span className="sr-only">Reporting period</span>
        <Select
          selectSize="sm"
          value={value}
          onChange={(event) =>
            startTransition(() => router.replace(`/analytics?range=${event.target.value}`))
          }
          options={options}
          className="w-[9.5rem]"
        />
      </label>
    </div>
  );
}
