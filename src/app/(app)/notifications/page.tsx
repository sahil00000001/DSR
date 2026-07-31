import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { listNotifications } from "@/lib/services/notifications";
import { formatDateTime, formatRelative } from "@/lib/utils/date";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Everything that needed your attention.",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const { rows, total } = await listNotifications(user.id, { pageSize: 60 });
  const unread = rows.filter((row) => row.readAt === null).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          total === 0
            ? "Approvals, reviews and reminders land here."
            : `${total} notification${total === 1 ? "" : "s"}${unread > 0 ? ` · ${unread} unread` : ""}`
        }
        actions={unread > 0 ? <MarkAllReadButton /> : undefined}
      />

      <div className="max-w-3xl">
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Bell className="size-5" />}
              title="Nothing here yet"
              description="When a leave request needs your decision, a report is reviewed, or an announcement is posted, you'll see it here."
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {rows.map((row) => {
                const content = (
                  <div
                    className={cn(
                      "flex gap-3 px-4 py-3.5 transition-colors",
                      row.readAt === null ? "bg-accent-soft/30" : "",
                      row.href ? "hover:bg-surface-hover" : "",
                    )}
                  >
                    {row.actor ? (
                      <Avatar
                        name={row.actor.name}
                        seed={row.actor.id}
                        src={row.actor.avatarUrl}
                        size="md"
                      />
                    ) : (
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-fg-subtle"
                        aria-hidden="true"
                      >
                        <Bell className="size-4" />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p
                          className={cn(
                            "min-w-0 flex-1 text-[13px] leading-5",
                            row.readAt === null ? "font-semibold text-fg" : "font-medium text-fg-muted",
                          )}
                        >
                          {row.title}
                        </p>
                        {row.readAt === null ? (
                          <span
                            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                            aria-label="Unread"
                          />
                        ) : null}
                      </div>

                      {row.body ? (
                        <p className="mt-0.5 text-[12.5px] leading-[18px] text-fg-subtle">
                          {row.body}
                        </p>
                      ) : null}

                      <time
                        dateTime={row.createdAt.toISOString()}
                        title={formatDateTime(row.createdAt)}
                        className="mt-1.5 block text-[11px] text-fg-subtle"
                      >
                        {formatRelative(row.createdAt)}
                      </time>
                    </div>
                  </div>
                );

                return (
                  <li key={row.id}>
                    {row.href ? <Link href={row.href}>{content}</Link> : content}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
