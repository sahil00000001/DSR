import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ScrollText, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { describeAudit, listAuditLog } from "@/lib/services/audit";
import { formatDateTime, formatRelative } from "@/lib/utils/date";
import { formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Audit log",
  description: "Who changed what, and when.",
};

/** Tone by action family, so security events stand out from routine ones. */
function toneFor(action: string): "neutral" | "success" | "warning" | "danger" | "accent" {
  if (action.startsWith("auth.login_failed") || action.includes("delete")) return "danger";
  if (action.startsWith("auth.")) return "accent";
  if (action.includes("disable") || action.includes("override") || action.includes("reject")) {
    return "warning";
  }
  if (action.includes("approve") || action.includes("create")) return "success";
  return "neutral";
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; entity?: string }>;
}) {
  const user = await requireUser();
  if (!can.viewAuditLog(user)) redirect("/forbidden");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const { entries, total } = await listAuditLog({
    page,
    pageSize: 60,
    action: params.action,
    entity: params.entity,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every state change, attributed and timestamped. Secrets are redacted before anything is written."
        meta={
          <>
            <Badge tone="neutral" variant="outline">
              {formatNumber(total)} entries
            </Badge>
            <Badge tone="accent" dot>
              <ShieldCheck className="size-3" aria-hidden="true" />
              Admin only
            </Badge>
          </>
        }
      />

      <div className="max-w-4xl">
        {entries.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ScrollText className="size-5" />}
              title="No activity recorded yet"
              description="Sign-ins, approvals, edits and exports all leave an entry here."
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {entries.map((entry) => (
                <li key={entry.id} className="flex gap-3 px-4 py-3">
                  {entry.actor ? (
                    <Avatar
                      name={entry.actor.name}
                      seed={entry.actor.id}
                      src={entry.actor.avatarUrl}
                      size="sm"
                    />
                  ) : (
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-fg-subtle"
                      aria-hidden="true"
                      title="System"
                    >
                      <ScrollText className="size-3" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="text-[12.5px] text-fg">{describeAudit(entry)}</p>
                      <Badge tone={toneFor(entry.action)} size="sm" variant="outline">
                        {entry.action}
                      </Badge>
                    </div>

                    {entry.meta && Object.keys(entry.meta).length > 0 ? (
                      <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {Object.entries(entry.meta)
                          .filter(([, value]) => value !== undefined && value !== null && value !== "")
                          .slice(0, 6)
                          .map(([key, value]) => (
                            <div key={key} className="flex items-baseline gap-1">
                              <dt className="text-[10.5px] text-fg-subtle">{key}</dt>
                              <dd className="max-w-[18rem] truncate font-mono text-[10.5px] text-fg-muted">
                                {String(value)}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    ) : null}

                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-subtle">
                      <time dateTime={entry.createdAt.toISOString()} title={formatDateTime(entry.createdAt)}>
                        {formatRelative(entry.createdAt)}
                      </time>
                      {entry.entityId ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">
                            {entry.entity}:{entry.entityId.slice(0, 8)}
                          </span>
                        </>
                      ) : null}
                      {entry.ip ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{entry.ip}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {total > 60 ? (
          <nav className="mt-4 flex items-center justify-between" aria-label="Audit log pages">
            <a
              href={`/audit-log?page=${Math.max(1, page - 1)}`}
              aria-disabled={page <= 1}
              className={
                page <= 1
                  ? "pointer-events-none text-[12.5px] text-fg-subtle"
                  : "text-[12.5px] font-medium text-accent hover:underline"
              }
            >
              ← Newer
            </a>
            <span className="text-[12.5px] text-fg-muted tabular-nums">
              Page {page} of {Math.ceil(total / 60)}
            </span>
            <a
              href={`/audit-log?page=${page + 1}`}
              aria-disabled={page >= Math.ceil(total / 60)}
              className={
                page >= Math.ceil(total / 60)
                  ? "pointer-events-none text-[12.5px] text-fg-subtle"
                  : "text-[12.5px] font-medium text-accent hover:underline"
              }
            >
              Older →
            </a>
          </nav>
        ) : null}
      </div>
    </>
  );
}
