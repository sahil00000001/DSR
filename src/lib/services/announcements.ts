import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/session";
import { markdownToText } from "@/lib/utils/markdown";
import { truncate } from "@/lib/utils/format";
import type { AnnouncementAudience } from "@/lib/constants/enums";

/**
 * Team announcements.
 *
 * Audience filtering happens in the query, not the template: a department-scoped
 * post is invisible to everyone outside that department — including in counts —
 * so nothing leaks through a badge or a search result.
 */

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  audience: AnnouncementAudience;
  publishedAt: Date;
  author: { id: string; name: string; avatarUrl: string | null; designation: string | null };
  department: { id: string; name: string; color: string } | null;
  excerpt: string;
}

const SELECT = {
  id: true,
  title: true,
  body: true,
  pinned: true,
  audience: true,
  publishedAt: true,
  author: { select: { id: true, name: true, avatarUrl: true, designation: true } },
  department: { select: { id: true, name: true, color: true } },
};

/** `WHERE` fragment for posts this user is entitled to see. */
function audienceScope(user: SessionUser) {
  if (user.role === "ADMIN") return {}; // Admins see every post, including drafts by department.

  return {
    OR: [
      { audience: "ALL" },
      ...(user.departmentId ? [{ audience: "DEPARTMENT", departmentId: user.departmentId }] : []),
      // Always see your own posts, whoever they were aimed at.
      { authorId: user.id },
    ],
  };
}

export async function listAnnouncements(
  user: SessionUser,
  { limit = 30 }: { limit?: number } = {},
): Promise<AnnouncementRecord[]> {
  const rows = await prisma.announcement.findMany({
    where: audienceScope(user),
    // Pinned first, then newest — the usual notice-board ordering.
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: limit,
    select: SELECT,
  });

  return rows.map((row) => ({
    ...row,
    audience: row.audience as AnnouncementAudience,
    excerpt: truncate(markdownToText(row.body), 180),
  }));
}

export async function getAnnouncementById(
  id: string,
  user: SessionUser,
): Promise<AnnouncementRecord | null> {
  const row = await prisma.announcement.findFirst({
    where: { id, ...audienceScope(user) },
    select: SELECT,
  });

  if (!row) return null;

  return {
    ...row,
    audience: row.audience as AnnouncementAudience,
    excerpt: truncate(markdownToText(row.body), 180),
  };
}

/** The single most recent post, for the dashboard banner. */
export async function getLatestAnnouncement(user: SessionUser): Promise<AnnouncementRecord | null> {
  const [latest] = await listAnnouncements(user, { limit: 1 });
  return latest ?? null;
}

/** Recipients for the email fan-out when a post is published. */
export async function getAnnouncementRecipients(
  audience: AnnouncementAudience,
  departmentId: string | null,
  excludeUserId: string,
) {
  return prisma.user.findMany({
    where: {
      status: "ACTIVE",
      notifyByEmail: true,
      id: { not: excludeUserId },
      ...(audience === "DEPARTMENT" && departmentId ? { departmentId } : {}),
    },
    select: { id: true, name: true, email: true },
  });
}
