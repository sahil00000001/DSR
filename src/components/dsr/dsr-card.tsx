import Link from "next/link";
import { AlertTriangle, Clock, MessageSquare, PenLine, Target } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { MarkdownView } from "@/components/markdown-view";
import { formatDayFriendly, formatDayShort, formatRelative } from "@/lib/utils/date";
import { formatHours } from "@/lib/utils/format";
import { DSR_STATUS_LABEL, DSR_STATUS_TONE } from "@/lib/constants/enums";
import type { DsrDto } from "@/types/dsr";

/**
 * A single report, rendered in full.
 *
 * Used by the detail page, the review board's expanded rows and the print view —
 * one component, so those three surfaces can never drift apart. Print-friendly by
 * construction: `data-print="card"` keeps it from splitting across pages.
 */
export function DsrCard({
  report,
  showAuthor = false,
  compact = false,
  className,
  headerActions,
}: {
  report: DsrDto;
  showAuthor?: boolean;
  compact?: boolean;
  className?: string;
  headerActions?: React.ReactNode;
}) {
  return (
    <article
      data-print="card"
      className={cn(
        "rounded-xl border border-border bg-surface",
        compact ? "p-4" : "p-5",
        className,
      )}
    >
      <header className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {showAuthor ? (
            <Avatar
              name={report.author.name}
              seed={report.author.id}
              src={report.author.avatarUrl}
              size="md"
            />
          ) : null}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {showAuthor ? (
                <Link
                  href={`/employees/${report.author.id}`}
                  className="text-[14px] font-semibold text-fg hover:underline"
                >
                  {report.author.name}
                </Link>
              ) : (
                <h3 className="text-[14px] font-semibold text-fg">
                  {formatDayFriendly(report.date)}
                </h3>
              )}
              <Badge tone={DSR_STATUS_TONE[report.status]} size="sm" dot>
                {DSR_STATUS_LABEL[report.status]}
              </Badge>
            </div>

            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-fg-subtle">
              {showAuthor ? (
                <>
                  <span>{formatDayShort(report.date)}</span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              {report.author.department ? (
                <>
                  <span className="flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: `var(--cat-${report.author.department.color})` }}
                    />
                    {report.author.department.name}
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span className="flex items-center gap-1 tabular-nums">
                <Clock className="size-3" aria-hidden="true" />
                {formatHours(report.hoursWorked)}
              </span>
              {report.submittedAt ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>submitted {formatRelative(report.submittedAt)}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {headerActions ? (
          <div data-print="hide" className="flex shrink-0 items-center gap-1.5">
            {headerActions}
          </div>
        ) : null}
      </header>

      <div className="space-y-4">
        <Section icon={<PenLine />} label="Completed">
          <MarkdownView source={report.tasksCompleted} />
        </Section>

        {report.blockers ? (
          <Section icon={<AlertTriangle />} label="Blockers" tone="warning">
            <MarkdownView source={report.blockers} />
          </Section>
        ) : null}

        {report.nextSteps ? (
          <Section icon={<Target />} label="Next">
            <MarkdownView source={report.nextSteps} />
          </Section>
        ) : null}

        {report.notes ? (
          <Section icon={<MessageSquare />} label="Notes">
            <MarkdownView source={report.notes} />
          </Section>
        ) : null}
      </div>

      {report.reviewComment ? (
        <div
          className={cn(
            "mt-4 rounded-lg border p-3",
            report.status === "FLAGGED"
              ? "border-warning/30 bg-warning-soft/40"
              : "border-border bg-surface-inset",
          )}
        >
          <p className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
            {report.status === "FLAGGED" ? "Needs attention" : "Reviewer note"}
            {report.reviewedBy ? ` · ${report.reviewedBy.name}` : ""}
          </p>
          <p className="mt-1 text-[12.5px] leading-5 text-fg-muted">{report.reviewComment}</p>
        </div>
      ) : null}
    </article>
  );
}

function Section({
  icon,
  label,
  children,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  tone?: "neutral" | "warning";
}) {
  return (
    <section>
      <h4
        className={cn(
          "mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.07em] uppercase",
          tone === "warning" ? "text-warning-text" : "text-fg-subtle",
        )}
      >
        <span className="[&>svg]:size-3" aria-hidden="true">
          {icon}
        </span>
        {label}
      </h4>
      {children}
    </section>
  );
}
