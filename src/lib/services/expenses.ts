import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { containsInsensitive, prisma } from "@/lib/db/prisma";
import { isManagerOrAdmin, type Actor } from "@/lib/auth/rbac";
import {
  asExpenseCategory,
  asExpenseStatus,
  EXPENSE_OPEN_STATUSES,
  type ExpenseCategory,
  type ExpenseStatus,
} from "@/lib/constants/enums";
import { lastNDays, startOfYear, today, type DayRange } from "@/lib/utils/date";
import { signReceiptUrl } from "@/lib/storage/supabase-storage";

/**
 * Expense claim reads.
 *
 * Writes live in `src/server/actions/expenses.ts`. As with the other services,
 * every list function takes an `Actor` and applies its own scoping — an employee
 * sees only their own claims, and that is enforced here rather than trusted to the
 * caller.
 */

export interface ExpenseAttachmentDto {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Short-lived signed URL, minted only for viewers who passed the RBAC check. */
  url: string | null;
}

export interface ExpenseCommentDto {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string; avatarUrl: string | null; role: string };
}

export interface ExpenseClaimDto {
  id: string;
  claimNumber: string;
  title: string;
  description: string;
  category: ExpenseCategory;
  amountMinor: number;
  currency: string;
  expenseDate: Date;
  vendor: string | null;
  referenceNo: string | null;
  status: ExpenseStatus;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  reimbursedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string;
    employeeCode: string;
    email: string;
    avatarUrl: string | null;
    designation: string | null;
    department: { id: string; name: string; color: string } | null;
    managerId: string | null;
  };
  decidedBy: { id: string; name: string } | null;
  attachmentCount: number;
}

const CLAIM_SELECT = {
  id: true,
  claimNumber: true,
  title: true,
  description: true,
  category: true,
  amountMinor: true,
  currency: true,
  expenseDate: true,
  vendor: true,
  referenceNo: true,
  status: true,
  submittedAt: true,
  decidedAt: true,
  decisionNote: true,
  reimbursedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      employeeCode: true,
      email: true,
      avatarUrl: true,
      designation: true,
      managerId: true,
      department: { select: { id: true, name: true, color: true } },
    },
  },
  decidedBy: { select: { id: true, name: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.ExpenseClaimSelect;

type RawClaim = Prisma.ExpenseClaimGetPayload<{ select: typeof CLAIM_SELECT }>;

function toDto(row: RawClaim): ExpenseClaimDto {
  const { _count, ...rest } = row;
  return {
    ...rest,
    category: asExpenseCategory(row.category),
    status: asExpenseStatus(row.status),
    attachmentCount: _count.attachments,
  };
}

// ---------------------------------------------------------------------------
//  Visibility
// ---------------------------------------------------------------------------

/**
 * Scoping clause.
 *
 * Admins see everything (they decide). Managers see their own reporting line, for
 * context — they don't approve, but "did my fitter already claim this?" is a fair
 * question. Everyone else sees only their own.
 */
function scopeFor(actor: Actor): Prisma.ExpenseClaimWhereInput {
  if (actor.role === "ADMIN") return {};
  if (actor.role === "MANAGER") {
    return { OR: [{ userId: actor.id }, { user: { managerId: actor.id } }] };
  }
  return { userId: actor.id };
}

// ---------------------------------------------------------------------------
//  Single claim
// ---------------------------------------------------------------------------

/**
 * Request-cached: the detail page's `generateMetadata` and its body both need it.
 * Receipt URLs are NOT signed here — see `getClaimAttachments`, which is called
 * only after the page has authorised the viewer.
 */
export const getExpenseClaim = cache(async function getExpenseClaim(
  id: string,
): Promise<ExpenseClaimDto | null> {
  const row = await prisma.expenseClaim.findUnique({ where: { id }, select: CLAIM_SELECT });
  return row ? toDto(row) : null;
});

/**
 * Attachments with freshly signed URLs.
 *
 * Separate from `getExpenseClaim` on purpose: signing is a network call per file
 * and must happen *after* authorisation, never as a side effect of loading a claim.
 */
export async function getClaimAttachments(claimId: string): Promise<ExpenseAttachmentDto[]> {
  const rows = await prisma.attachment.findMany({
    where: { expenseClaimId: claimId },
    orderBy: { createdAt: "asc" },
    select: { id: true, filename: true, mimeType: true, size: true, storagePath: true },
  });

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      size: row.size,
      url: row.storagePath ? await signReceiptUrl(row.storagePath) : null,
    })),
  );
}

export async function getClaimComments(claimId: string): Promise<ExpenseCommentDto[]> {
  const rows = await prisma.expenseComment.findMany({
    where: { claimId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true, avatarUrl: true, role: true } },
    },
  });
  return rows;
}

// ---------------------------------------------------------------------------
//  Lists
// ---------------------------------------------------------------------------

export interface ExpenseFilters {
  q?: string;
  status?: string[];
  category?: string[];
  department?: string[];
  employee?: string[];
  from?: Date;
  to?: Date;
}

export interface ExpenseListResult {
  rows: ExpenseClaimDto[];
  total: number;
  /** Aggregates over the whole filtered set, not just this page. */
  summary: {
    totalMinor: number;
    byStatus: Record<ExpenseStatus, { count: number; totalMinor: number }>;
    awaitingCount: number;
    claimants: number;
  };
}

function buildWhere(filters: ExpenseFilters, actor: Actor): Prisma.ExpenseClaimWhereInput {
  const search = filters.q?.trim();

  return {
    ...scopeFor(actor),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.category?.length ? { category: { in: filters.category } } : {}),
    ...(filters.employee?.length ? { userId: { in: filters.employee } } : {}),
    ...(filters.from || filters.to
      ? {
          expenseDate: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.department?.length
      ? { user: { departmentId: { in: filters.department } } }
      : {}),
    ...(search
      ? {
          OR: [
            { title: containsInsensitive(search) },
            { description: containsInsensitive(search) },
            { vendor: containsInsensitive(search) },
            { referenceNo: containsInsensitive(search) },
            { claimNumber: containsInsensitive(search) },
            { user: { name: containsInsensitive(search) } },
          ],
        }
      : {}),
  };
}

export async function listExpenseClaims(
  filters: ExpenseFilters,
  actor: Actor,
  { page = 1, pageSize = 30 } = {},
): Promise<ExpenseListResult> {
  const where = buildWhere(filters, actor);

  const [rows, total, grouped, claimants] = await Promise.all([
    prisma.expenseClaim.findMany({
      where,
      // Awaiting-approval first: this screen exists to clear a queue.
      orderBy: [{ status: "asc" }, { expenseDate: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: CLAIM_SELECT,
    }),
    prisma.expenseClaim.count({ where }),
    prisma.expenseClaim.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      _sum: { amountMinor: true },
    }),
    prisma.expenseClaim.findMany({ where, distinct: ["userId"], select: { userId: true } }),
  ]);

  const byStatus = {
    DRAFT: { count: 0, totalMinor: 0 },
    SUBMITTED: { count: 0, totalMinor: 0 },
    APPROVED: { count: 0, totalMinor: 0 },
    REJECTED: { count: 0, totalMinor: 0 },
    REIMBURSED: { count: 0, totalMinor: 0 },
    CANCELLED: { count: 0, totalMinor: 0 },
  } satisfies Record<ExpenseStatus, { count: number; totalMinor: number }>;

  for (const group of grouped) {
    byStatus[asExpenseStatus(group.status)] = {
      count: group._count._all,
      totalMinor: group._sum.amountMinor ?? 0,
    };
  }

  return {
    rows: rows.map(toDto),
    total,
    summary: {
      // Excludes declined and withdrawn — they are not money owed.
      totalMinor: (
        ["SUBMITTED", "APPROVED", "REIMBURSED", "DRAFT"] as ExpenseStatus[]
      ).reduce((sum, status) => sum + byStatus[status].totalMinor, 0),
      byStatus,
      awaitingCount: byStatus.SUBMITTED.count,
      claimants: claimants.length,
    },
  };
}

/** Everything in the current filter, for export. Capped to protect the runtime. */
export async function listExpensesForExport(
  filters: ExpenseFilters,
  actor: Actor,
  limit = 5000,
): Promise<ExpenseClaimDto[]> {
  const rows = await prisma.expenseClaim.findMany({
    where: buildWhere(filters, actor),
    orderBy: [{ expenseDate: "desc" }],
    take: limit,
    select: CLAIM_SELECT,
  });
  return rows.map(toDto);
}

// ---------------------------------------------------------------------------
//  Summaries
// ---------------------------------------------------------------------------

export interface ExpenseSnapshot {
  /** Submitted but not yet decided — what the claimant is waiting on. */
  awaitingMinor: number;
  awaitingCount: number;
  /** Approved but not yet paid — what the company owes. */
  approvedMinor: number;
  approvedCount: number;
  /** Paid out this financial year. */
  reimbursedMinor: number;
  draftCount: number;
}

/** Personal snapshot for the expenses page and the dashboard tile. */
export async function getExpenseSnapshot(userId: string): Promise<ExpenseSnapshot> {
  const grouped = await prisma.expenseClaim.groupBy({
    by: ["status"],
    where: { userId, expenseDate: { gte: startOfYear(today()) } },
    _count: { _all: true },
    _sum: { amountMinor: true },
  });

  const get = (status: ExpenseStatus) =>
    grouped.find((row) => row.status === status) ?? { _count: { _all: 0 }, _sum: { amountMinor: 0 } };

  return {
    awaitingMinor: get("SUBMITTED")._sum.amountMinor ?? 0,
    awaitingCount: get("SUBMITTED")._count._all,
    approvedMinor: get("APPROVED")._sum.amountMinor ?? 0,
    approvedCount: get("APPROVED")._count._all,
    reimbursedMinor: get("REIMBURSED")._sum.amountMinor ?? 0,
    draftCount: get("DRAFT")._count._all,
  };
}

/** Count for the nav badge: claims an admin still has to decide. */
export async function countClaimsAwaitingDecision(actor: Actor): Promise<number> {
  if (actor.role !== "ADMIN") return 0;
  return prisma.expenseClaim.count({
    where: { status: "SUBMITTED", userId: { not: actor.id } },
  });
}

export interface CategoryBreakdown {
  category: ExpenseCategory;
  totalMinor: number;
  count: number;
}

/** Spend by category, for the analytics chart. Excludes declined/withdrawn. */
export async function getExpensesByCategory(
  range: DayRange = lastNDays(90),
  actor: Actor,
): Promise<CategoryBreakdown[]> {
  const grouped = await prisma.expenseClaim.groupBy({
    by: ["category"],
    where: {
      ...scopeFor(actor),
      expenseDate: { gte: range.start, lte: range.end },
      status: { in: [...EXPENSE_OPEN_STATUSES, "REIMBURSED"] },
    },
    _sum: { amountMinor: true },
    _count: { _all: true },
  });

  return grouped
    .map((row) => ({
      category: asExpenseCategory(row.category),
      totalMinor: row._sum.amountMinor ?? 0,
      count: row._count._all,
    }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

/** Who is owed what — the payout list for finance. */
export async function getOutstandingByEmployee(actor: Actor) {
  if (!isManagerOrAdmin(actor)) return [];

  const rows = await prisma.expenseClaim.groupBy({
    by: ["userId"],
    where: { ...scopeFor(actor), status: "APPROVED" },
    _sum: { amountMinor: true },
    _count: { _all: true },
  });

  if (rows.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((row) => row.userId) } },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      employeeCode: true,
      department: { select: { name: true } },
    },
  });

  return rows
    .map((row) => {
      const user = users.find((candidate) => candidate.id === row.userId);
      return {
        user: user
          ? {
              id: user.id,
              name: user.name,
              avatarUrl: user.avatarUrl,
              employeeCode: user.employeeCode,
              department: user.department?.name ?? null,
            }
          : null,
        totalMinor: row._sum.amountMinor ?? 0,
        count: row._count._all,
      };
    })
    .filter((row) => row.user !== null)
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

/** Next claim reference, e.g. EXP-0043. */
export async function nextClaimNumber(): Promise<string> {
  const latest = await prisma.expenseClaim.findFirst({
    orderBy: { createdAt: "desc" },
    select: { claimNumber: true },
  });

  const current = Number.parseInt(latest?.claimNumber.split("-")[1] ?? "0", 10);
  const next = Number.isFinite(current) ? current + 1 : 1;
  return `EXP-${String(next).padStart(4, "0")}`;
}

/** Admins to notify when a claim is submitted. */
export async function getClaimApprovers(excludeUserId: string) {
  return prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE", id: { not: excludeUserId } },
    // `emailDigestOnly` is not optional to the policy gate — omitting it here used to
    // compile fine and silently send every claim immediately. See lib/email/policy.ts.
    select: { id: true, name: true, email: true, notifyByEmail: true, emailDigestOnly: true },
  });
}
