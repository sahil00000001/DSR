"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/ui/input";
import { useDebouncedCallback } from "@/hooks/use-debounced-value";

/**
 * Search across orders.
 *
 * A thin client wrapper because the page is a Server Component. The query lives in the
 * URL like every other filter in the app, so a search is shareable and the back button
 * behaves.
 */
export function OrderSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(searchParams.get("q") ?? "");

  const push = useDebouncedCallback((value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set("q", value);
    else next.delete("q");

    startTransition(() => {
      router.replace(`/orders?${next.toString()}`, { scroll: false });
    });
  }, 300);

  return (
    <SearchInput
      value={draft}
      onValueChange={(value) => {
        setDraft(value);
        push(value);
      }}
      placeholder="Order, customer, product, person…"
      inputSize="sm"
      className={isPending ? "w-full opacity-70 sm:w-64" : "w-full sm:w-64"}
      aria-label="Search orders"
    />
  );
}
