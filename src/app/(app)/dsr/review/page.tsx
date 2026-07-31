import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { NavTabs } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { listDsrBoard, resolveDateRange } from "@/lib/services/dsr";
import { getOrgOptions } from "@/lib/services/people";
import { dsrFilterSchema, parseSearchParams } from "@/lib/validation/schemas";
import { formatDayRange } from "@/lib/utils/date";
import { ReviewBoard } from "@/components/dsr/review-board";

export const metadata: Metadata = {
  title: "Report review",
  description: "Every status report from the team, filterable and exportable.",
};

/**
 * Bulk review board.
 *
 * Filters arrive as search params, are validated leniently (a hand-edited URL
 * falls back to defaults rather than erroring), and the query runs on the server.
 * `searchParams` makes this route dynamic automatically — no cache directive needed.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can.viewDsrBoard(user)) redirect("/forbidden");

  const raw = await searchParams;
  const filters = parseSearchParams(dsrFilterSchema, raw);
  // The board defaults to the trailing month — wide enough to be useful on first
  // load, narrow enough to stay fast.
  const effective = { ...filters, range: filters.range ?? ("last-30" as const) };

  const [board, options] = await Promise.all([
    listDsrBoard(effective, user),
    getOrgOptions(),
  ]);

  const range = resolveDateRange(effective);

  return (
    <>
      <PageHeader
        title="Report review"
        description="Every report from your team in one place — filter, group, review in bulk and export."
        tabs={
          <NavTabs
            items={[
              { href: "/dsr", label: "My reports", exact: true },
              { href: "/dsr/review", label: "Team review", count: board.summary.byStatus.SUBMITTED },
            ]}
          />
        }
      />

      <ReviewBoard
        reports={board.rows}
        total={board.total}
        page={effective.page ?? 1}
        pageSize={effective.size ?? 25}
        summary={board.summary}
        rangeLabel={formatDayRange(range)}
        options={options}
        canReview={can.viewDsrBoard(user)}
        currentUserId={user.id}
      />
    </>
  );
}
