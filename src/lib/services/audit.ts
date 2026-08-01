import "server-only";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { requestContext } from "@/lib/auth/session";

/**
 * Audit trail.
 *
 * Records *who did what to which record*, with a JSON payload of the meaningful
 * change. Two rules make it trustworthy:
 *
 *  1. **Writing an audit entry must never fail the operation it describes.** A
 *     logging outage that blocked leave approvals would be a worse bug than the
 *     missing log line, so failures are swallowed and reported to the logger.
 *  2. **Never record secrets.** `sanitiseMeta` strips password, token and hash
 *     fields, because an audit log is one of the most widely-read tables in any
 *     internal tool.
 */

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_reset_requested"
  | "auth.password_reset"
  | "auth.password_changed"
  | "auth.sessions_revoked"
  | "auth.google_login"
  | "dsr.create"
  | "dsr.update"
  | "dsr.submit"
  | "dsr.review"
  | "dsr.bulk_review"
  | "dsr.delete"
  | "attendance.mark"
  | "attendance.override"
  | "leave.request"
  | "leave.approve"
  | "leave.reject"
  | "leave.cancel"
  | "expense.create"
  | "expense.submit"
  | "expense.approve"
  | "expense.reject"
  | "expense.reimburse"
  | "expense.cancel"
  | "task.create"
  | "task.update"
  | "task.assign"
  | "task.status"
  | "task.delete"
  | "task.comment"
  | "task.attach"
  | "task.complete"
  | "task.reopen"
  | "task.spawn"
  | "task.category"
  | "task.tag"
  | "order.create"
  | "order.update"
  | "order.stage"
  | "order.promise"
  | "order.deliver"
  | "order.cancel"
  | "message.send"
  | "employee.create"
  | "employee.update"
  | "employee.disable"
  | "employee.enable"
  | "employee.delete"
  | "department.create"
  | "department.update"
  | "department.delete"
  | "team.create"
  | "announcement.create"
  | "announcement.delete"
  | "holiday.create"
  | "holiday.delete"
  | "export.download"
  | "settings.update"
  | "cron.reminders";

/** Field names whose values are never written to the audit log. */
const REDACT = /password|token|secret|hash|authorization|cookie/i;

function sanitiseMeta(meta: Record<string, unknown>): string | null {
  try {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (REDACT.test(key)) {
        safe[key] = "[redacted]";
      } else if (typeof value === "string" && value.length > 500) {
        // Keep entries small — the log is read as a table, not as documents.
        safe[key] = `${value.slice(0, 500)}…`;
      } else {
        safe[key] = value;
      }
    }
    return JSON.stringify(safe);
  } catch {
    return null;
  }
}

export interface AuditInput {
  actorId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}

export async function recordAudit({ actorId, action, entity, entityId, meta }: AuditInput) {
  try {
    const { ip, userAgent } = await requestContext();

    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        meta: meta ? sanitiseMeta(meta) : null,
        ip,
        userAgent,
      },
    });
  } catch (error) {
    logger.error("Failed to write audit log", error, { action, entity, entityId });
  }
}

/**
 * Variant for contexts without a request (cron jobs, seeds), where
 * `headers()` isn't available and would throw.
 */
export async function recordSystemAudit({ action, entity, entityId, meta }: Omit<AuditInput, "actorId">) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action,
        entity,
        entityId: entityId ?? null,
        meta: meta ? sanitiseMeta(meta) : null,
        ip: null,
        userAgent: "system",
      },
    });
  } catch (error) {
    logger.error("Failed to write system audit log", error, { action, entity });
  }
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: Date;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
}

/** Paginated read for the admin audit screen. */
export async function listAuditLog({
  page = 1,
  pageSize = 50,
  action,
  entity,
  actorId,
}: {
  page?: number;
  pageSize?: number;
  action?: string;
  entity?: string;
  actorId?: string;
} = {}): Promise<{ entries: AuditEntry[]; total: number }> {
  const where = {
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(actorId ? { actorId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        meta: true,
        ip: true,
        createdAt: true,
        actor: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    entries: rows.map((row) => ({
      ...row,
      meta: parseMeta(row.meta),
    })),
    total,
  };
}

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Human-readable sentence for an audit row. */
export function describeAudit(entry: AuditEntry): string {
  const actor = entry.actor?.name ?? "System";
  const map: Record<string, string> = {
    "auth.login": "signed in",
    "auth.login_failed": "failed to sign in",
    "auth.logout": "signed out",
    "auth.password_reset_requested": "requested a password reset",
    "auth.password_reset": "reset their password",
    "auth.password_changed": "changed their password",
    "auth.sessions_revoked": "signed out of all devices",
    "auth.google_login": "signed in with Google",
    "dsr.create": "created a status report",
    "dsr.update": "updated a status report",
    "dsr.submit": "submitted a status report",
    "dsr.review": "reviewed a status report",
    "dsr.bulk_review": "reviewed several status reports",
    "dsr.delete": "deleted a status report",
    "attendance.mark": "marked attendance",
    "attendance.override": "overrode an attendance record",
    "leave.request": "requested leave",
    "leave.approve": "approved a leave request",
    "leave.reject": "declined a leave request",
    "leave.cancel": "cancelled a leave request",
    "expense.create": "filed an expense claim",
    "expense.submit": "submitted an expense claim",
    "expense.approve": "approved an expense claim",
    "expense.reject": "declined an expense claim",
    "expense.reimburse": "marked an expense claim reimbursed",
    "expense.cancel": "withdrew an expense claim",
    "task.create": "created a task",
    "task.update": "edited a task",
    "task.assign": "changed who a task is assigned to",
    "task.status": "changed a task status",
    "task.delete": "deleted a task",
    "task.comment": "posted a task update",
    "task.attach": "attached a file to a task",
    "task.complete": "completed a task",
    "task.reopen": "reopened a task",
    "task.spawn": "created a repeating task occurrence",
    "task.category": "changed the task categories",
    "task.tag": "changed the task tags",
    "order.create": "created an order",
    "order.update": "edited an order",
    "order.stage": "changed an order stage",
    "order.promise": "moved a promised delivery date",
    "order.deliver": "marked an order delivered",
    "order.cancel": "cancelled an order",
    "message.send": "sent an outbound message",
    "employee.create": "added an employee",
    "employee.update": "updated an employee",
    "employee.disable": "disabled an employee",
    "employee.enable": "re-enabled an employee",
    "employee.delete": "removed an employee",
    "department.create": "created a department",
    "department.update": "updated a department",
    "department.delete": "deleted a department",
    "team.create": "created a team",
    "announcement.create": "posted an announcement",
    "announcement.delete": "deleted an announcement",
    "holiday.create": "added a holiday",
    "holiday.delete": "removed a holiday",
    "export.download": "exported data",
    "settings.update": "updated settings",
    "cron.reminders": "sent scheduled reminders",
  };

  return `${actor} ${map[entry.action] ?? entry.action}`;
}
