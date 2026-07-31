import type { Metadata } from "next";
import { Suspense } from "react";
import { ClipboardList, FileText, Plane } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { isManagerOrAdmin } from "@/lib/auth/rbac";
import {
  AnnouncementSection,
  ChartsFallback,
  ChartsSection,
  ExpenseSection,
  LeaveSection,
  PanelFallback,
  RailSection,
  RollCallSection,
  StatGridFallback,
  TeamStatsSection,
  TodayCardFallback,
  TodaySection,
  UpcomingSection,
} from "@/components/dashboard/sections";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Today's status across the team.",
};

/**
 * Dashboard.
 *
 * Streamed rather than blocking. The page itself awaits only `requireUser()` —
 * which the shell has already resolved and cached — so the header renders
 * immediately and every panel arrives independently.
 *
 * Ordering is deliberate: the personal "your day" card is one of the cheapest
 * sections and the reason most people open this screen, so it is not made to wait
 * behind team-wide analytics. See `components/dashboard/sections.tsx` for the
 * cost split.
 *
 * Role-aware, not role-duplicated: employees get the personal column and their own
 * trends; managers and admins additionally get org-wide tiles, the roll-call and
 * the activity rail.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const canSeeTeam = isManagerOrAdmin(user);

  return (
    <>
      <PageHeader
        title={canSeeTeam ? "Team dashboard" : "Your dashboard"}
        description={
          canSeeTeam
            ? "Where the team is today, and how the week is tracking."
            : "Your day at a glance, plus what's coming up."
        }
        actions={
          <>
            <ButtonLink href="/dsr/new" variant="primary" size="sm">
              <FileText className="size-4" />
              Write report
            </ButtonLink>
            {canSeeTeam ? (
              <ButtonLink href="/dsr/review" variant="secondary" size="sm">
                <ClipboardList className="size-4" />
                Review queue
              </ButtonLink>
            ) : (
              <ButtonLink href="/leave/new" variant="secondary" size="sm">
                <Plane className="size-4" />
                Request leave
              </ButtonLink>
            )}
          </>
        }
      />

      {/* No fallback: an absent announcement should occupy no space at all. */}
      <Suspense fallback={null}>
        <AnnouncementSection />
      </Suspense>

      {canSeeTeam ? (
        <Suspense fallback={<StatGridFallback />}>
          <TeamStatsSection />
        </Suspense>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Cheapest section, highest value — first to paint. */}
          <Suspense fallback={<TodayCardFallback />}>
            <TodaySection />
          </Suspense>

          {canSeeTeam ? (
            <Suspense fallback={<PanelFallback rows={2} />}>
              <RollCallSection />
            </Suspense>
          ) : null}

          <Suspense fallback={<ChartsFallback />}>
            <ChartsSection />
          </Suspense>
        </div>

        <aside className="min-w-0 space-y-5">
          <Suspense fallback={<PanelFallback rows={3} />}>
            <LeaveSection />
          </Suspense>

          {/* No fallback: the card hides itself when there is nothing to report,
              and a skeleton for a panel that may not appear is worse than nothing. */}
          <Suspense fallback={null}>
            <ExpenseSection />
          </Suspense>

          <Suspense fallback={<PanelFallback rows={4} />}>
            <UpcomingSection />
          </Suspense>

          <Suspense fallback={<PanelFallback rows={5} />}>
            <RailSection />
          </Suspense>
        </aside>
      </div>
    </>
  );
}
