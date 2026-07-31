"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pagination } from "@/components/ui/pagination";

/**
 * URL-driven pagination for the task list.
 *
 * A thin client wrapper: `Pagination` takes callbacks, and the page that renders it is
 * a Server Component. Keeping the page number in the URL means a link to page three is
 * a link to page three.
 */
export function TaskPagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const go = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      startTransition(() => {
        router.replace(`/tasks?${next.toString()}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  return (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      itemLabel="task"
      onPageChange={(next) => go({ page: next === 1 ? null : String(next) })}
      onPageSizeChange={(size) => go({ size: String(size), page: null })}
    />
  );
}
