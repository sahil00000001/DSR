import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PenLine } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { DsrCard } from "@/components/dsr/dsr-card";
import { ReviewActions } from "@/components/dsr/review-actions";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getDsrById } from "@/lib/services/dsr";
import { formatDay, toDayKey } from "@/lib/utils/date";

/**
 * Authorised, because `generateMetadata` runs independently of the page component —
 * a `notFound()` in the body does not stop the title being computed and sent.
 * Both reads are `cache()`d per request, so the check is free.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [user, report] = await Promise.all([requireUser(), getDsrById(id)]);
  if (!report) return { title: "Report not found" };
  if (!can.viewDsr(user, { id: report.author.id })) return { title: "Report not found" };
  return { title: `${report.author.name} — ${formatDay(report.date)}` };
}

export default async function DsrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const report = await getDsrById(id);
  if (!report) notFound();

  // Authorisation, not just presentation: an employee following a guessed link to
  // a colleague's report gets a 404, same as one that doesn't exist.
  if (!can.viewDsr(user, { id: report.author.id })) notFound();

  const isOwn = report.author.id === user.id;
  const canReview = can.reviewDsr(user, {
    id: report.author.id,
    managerId: report.author.manager?.id ?? null,
  });
  const canEdit = can.editDsr(user, { id: report.author.id }, report.status) && isOwn;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          isOwn
            ? { label: "My reports", href: "/dsr" }
            : { label: "Team review", href: "/dsr/review" },
          { label: formatDay(report.date) },
        ]}
        title={isOwn ? formatDay(report.date) : `${report.author.name} — ${formatDay(report.date)}`}
        description={
          report.author.designation
            ? `${report.author.designation}${
                report.author.department ? ` · ${report.author.department.name}` : ""
              }`
            : (report.author.department?.name ?? undefined)
        }
        actions={
          <>
            <PrintButton label="Print" />
            {canEdit ? (
              <ButtonLink
                href={`/dsr/new?date=${toDayKey(report.date)}`}
                variant="secondary"
                size="sm"
              >
                <PenLine className="size-4" />
                Edit
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="max-w-3xl space-y-5">
        <DsrCard report={report} showAuthor={!isOwn} />

        {canReview ? (
          <ReviewActions
            reportId={report.id}
            currentStatus={report.status}
            authorName={report.author.name}
          />
        ) : null}
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
