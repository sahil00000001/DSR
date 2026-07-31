import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getDsrForDate } from "@/lib/services/dsr";
import { DsrComposer } from "@/components/dsr/dsr-composer";
import {
  formatDayLong,
  isWeekend,
  subDays,
  toDayKey,
  today,
  tryParseDayKey,
} from "@/lib/utils/date";

export const metadata: Metadata = {
  title: "Write a report",
  description: "File your daily status report.",
};

/**
 * Composer route.
 *
 * `?date=` selects the day, defaulting to today. The same screen handles create
 * and edit — there is no separate edit route, because "today's report" is a
 * single addressable thing whether or not it exists yet.
 */
export default async function NewDsrPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const requested = params.date === "today" ? null : tryParseDayKey(params.date);
  // Silently clamp a future date rather than erroring — the server action
  // enforces the rule properly if someone posts one anyway.
  const now = today();
  const date = requested && requested <= now ? requested : now;

  const [existing, previous, holiday] = await Promise.all([
    getDsrForDate(user.id, date),
    // Yesterday's plan, offered as a starting point.
    getDsrForDate(user.id, subDays(date, 1)),
    prisma.holiday.findFirst({
      where: { date, type: { in: ["PUBLIC", "COMPANY"] } },
      select: { id: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "My reports", href: "/dsr" }, { label: "Write" }]}
        title={existing ? "Edit your report" : "Write your report"}
        description={formatDayLong(date)}
      />

      <div className="max-w-4xl">
        <DsrComposer
          date={toDayKey(date)}
          dateLabel={formatDayLong(date)}
          existing={
            existing
              ? {
                  id: existing.id,
                  status: existing.status,
                  tasksCompleted: existing.tasksCompleted,
                  blockers: existing.blockers,
                  nextSteps: existing.nextSteps,
                  notes: existing.notes,
                  hoursWorked: existing.hoursWorked,
                  reviewComment: existing.reviewComment,
                  reviewedByName: existing.reviewedBy?.name ?? null,
                }
              : null
          }
          previousNextSteps={previous?.nextSteps ?? null}
          isNonWorkingDay={isWeekend(date) || Boolean(holiday)}
        />
      </div>
    </>
  );
}
