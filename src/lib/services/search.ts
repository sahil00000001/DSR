import "server-only";
import { containsInsensitive, prisma } from "@/lib/db/prisma";
import { isManagerOrAdmin, type Actor } from "@/lib/auth/rbac";
import { formatDay, formatDayRange } from "@/lib/utils/date";
import { LEAVE_TYPE_SHORT, LEAVE_STATUS_LABEL, asLeaveStatus, asLeaveType } from "@/lib/constants/enums";
import { markdownToText } from "@/lib/utils/markdown";
import { truncate } from "@/lib/utils/format";

/**
 * Global search, powering the ⌘K palette.
 *
 * Four `LIKE` queries in parallel, each capped small. At this data volume that
 * comfortably beats a search index, and — importantly — it inherits the same
 * role scoping as the rest of the app: an employee searching finds only their own
 * reports and leave, never a colleague's.
 *
 * If the corpus ever outgrows this, the swap is Postgres full-text (`tsvector`)
 * behind the same function signature.
 */

export interface GlobalSearchResults {
  people: Array<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    designation: string | null;
    department: string | null;
  }>;
  reports: Array<{ id: string; date: string; author: string; excerpt: string }>;
  departments: Array<{ id: string; slug: string; name: string; memberCount: number }>;
  leave: Array<{ id: string; author: string; range: string; status: string; type: string }>;
}

const EMPTY: GlobalSearchResults = { people: [], reports: [], departments: [], leave: [] };

export async function globalSearch(query: string, actor: Actor): Promise<GlobalSearchResults> {
  const term = query.trim();
  // Below two characters every query matches, which is noise rather than search.
  if (term.length < 2) return EMPTY;

  const canSeeEveryone = isManagerOrAdmin(actor);
  const ownScope = canSeeEveryone ? {} : { userId: actor.id };

  const [people, reports, departments, leave] = await Promise.all([
    prisma.user.findMany({
      where: {
        status: { not: "DISABLED" },
        OR: [
          { name: containsInsensitive(term) },
          { email: containsInsensitive(term) },
          { employeeCode: containsInsensitive(term) },
          { designation: containsInsensitive(term) },
        ],
      },
      orderBy: { name: "asc" },
      take: 6,
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        designation: true,
        department: { select: { name: true } },
      },
    }),

    prisma.dailyStatusReport.findMany({
      where: {
        ...ownScope,
        ...(actor.role === "MANAGER"
          ? { user: { OR: [{ managerId: actor.id }, { id: actor.id }] } }
          : {}),
        OR: [
          { tasksCompleted: containsInsensitive(term) },
          { blockers: containsInsensitive(term) },
          { nextSteps: containsInsensitive(term) },
          { notes: containsInsensitive(term) },
        ],
      },
      orderBy: { date: "desc" },
      take: 6,
      select: {
        id: true,
        date: true,
        tasksCompleted: true,
        user: { select: { name: true } },
      },
    }),

    prisma.department.findMany({
      where: {
        OR: [{ name: containsInsensitive(term) }, { description: containsInsensitive(term) }],
      },
      orderBy: { name: "asc" },
      take: 4,
      select: { id: true, slug: true, name: true, _count: { select: { members: true } } },
    }),

    prisma.leaveRequest.findMany({
      where: {
        ...ownScope,
        ...(actor.role === "MANAGER" ? { user: { managerId: actor.id } } : {}),
        OR: [{ reason: containsInsensitive(term) }, { user: { name: containsInsensitive(term) } }],
      },
      orderBy: { startDate: "desc" },
      take: 4,
      select: {
        id: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  return {
    people: people.map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
      avatarUrl: person.avatarUrl,
      designation: person.designation,
      department: person.department?.name ?? null,
    })),
    reports: reports.map((report) => ({
      id: report.id,
      date: formatDay(report.date),
      author: report.user.name,
      excerpt: truncate(markdownToText(report.tasksCompleted), 90),
    })),
    departments: departments.map((department) => ({
      id: department.id,
      slug: department.slug,
      name: department.name,
      memberCount: department._count.members,
    })),
    leave: leave.map((request) => ({
      id: request.id,
      author: request.user.name,
      range: formatDayRange({ start: request.startDate, end: request.endDate }),
      status: LEAVE_STATUS_LABEL[asLeaveStatus(request.status)],
      type: LEAVE_TYPE_SHORT[asLeaveType(request.type)],
    })),
  };
}
