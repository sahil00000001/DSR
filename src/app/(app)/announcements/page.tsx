import type { Metadata } from "next";
import { Megaphone, Pin } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkdownView } from "@/components/markdown-view";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { listAnnouncements } from "@/lib/services/announcements";
import { getOrgOptions } from "@/lib/services/people";
import { formatDateTime, formatRelative } from "@/lib/utils/date";
import { AnnouncementComposer } from "@/components/announcements/announcement-composer";
import { AnnouncementActions } from "@/components/announcements/announcement-actions";

export const metadata: Metadata = {
  title: "Announcements",
  description: "Team-wide news and notices.",
};

export default async function AnnouncementsPage() {
  const user = await requireUser();
  const canPost = can.postAnnouncement(user);

  const [announcements, options] = await Promise.all([
    listAnnouncements(user, { limit: 50 }),
    canPost ? getOrgOptions() : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="Announcements"
        description="What the team needs to know, newest first. Pinned notices stay at the top."
        actions={
          canPost && options ? (
            <AnnouncementComposer
              departments={options.departments}
              // A manager may only address their own department.
              restrictToDepartmentId={user.role === "MANAGER" ? user.departmentId : null}
            />
          ) : undefined
        }
      />

      {announcements.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone className="size-5" />}
            title="No announcements yet"
            description={
              canPost
                ? "Post the first one — it lands in everyone's notification tray and inbox."
                : "When someone posts a notice, it appears here."
            }
          />
        </Card>
      ) : (
        <div className="max-w-3xl space-y-4">
          {announcements.map((announcement) => (
            <Card
              key={announcement.id}
              className={announcement.pinned ? "border-accent/25 bg-accent-soft/25" : undefined}
            >
              <CardContent className="pt-5">
                <header className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar
                      name={announcement.author.name}
                      seed={announcement.author.id}
                      src={announcement.author.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[15px] leading-6 font-semibold text-fg">
                          {announcement.title}
                        </h2>
                        {announcement.pinned ? (
                          <Badge tone="accent" size="sm">
                            <Pin className="size-2.5" aria-hidden="true" />
                            Pinned
                          </Badge>
                        ) : null}
                        {announcement.department ? (
                          <Badge tone="neutral" size="sm" variant="outline">
                            {announcement.department.name} only
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-fg-subtle">
                        {announcement.author.name}
                        {announcement.author.designation ? ` · ${announcement.author.designation}` : ""}
                        {" · "}
                        <time dateTime={announcement.publishedAt.toISOString()}>
                          {formatRelative(announcement.publishedAt)}
                        </time>
                      </p>
                    </div>
                  </div>

                  {announcement.author.id === user.id || user.role === "ADMIN" ? (
                    <AnnouncementActions
                      id={announcement.id}
                      pinned={announcement.pinned}
                      title={announcement.title}
                    />
                  ) : null}
                </header>

                <MarkdownView source={announcement.body} className="text-[13.5px]" />

                <p className="mt-4 border-t border-border pt-3 text-[11px] text-fg-subtle">
                  Posted {formatDateTime(announcement.publishedAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
