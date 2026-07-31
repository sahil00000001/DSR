import "server-only";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import type { NotificationType } from "@/lib/constants/enums";

/**
 * In-app notifications.
 *
 * Like the audit log, delivery is best-effort: failing to insert a notification
 * must never roll back the leave approval that produced it. Callers therefore
 * don't need to wrap these in try/catch.
 */

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  actorId?: string | null;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        actorId: input.actorId ?? null,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 500) ?? null,
        href: input.href ?? null,
      },
    });
  } catch (error) {
    logger.error("Failed to create notification", error, { userId: input.userId, type: input.type });
  }
}

/** Fan-out to many recipients in one insert. */
export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  if (inputs.length === 0) return;

  try {
    await prisma.notification.createMany({
      data: inputs.map((input) => ({
        userId: input.userId,
        actorId: input.actorId ?? null,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 500) ?? null,
        href: input.href ?? null,
      })),
    });
  } catch (error) {
    logger.error("Failed to create notifications", error, { count: inputs.length });
  }
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  read: boolean;
}

/** Tray payload: the most recent slice plus the unread count. */
export async function getNotificationFeed(
  userId: string,
  limit = 12,
): Promise<{ items: NotificationDto[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, type: true, title: true, body: true, href: true, createdAt: true, readAt: true },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type as NotificationType,
      title: row.title,
      body: row.body,
      href: row.href,
      // Serialised for the client component boundary.
      createdAt: row.createdAt.toISOString(),
      read: row.readAt !== null,
    })),
    unread,
  };
}

export async function listNotifications(userId: string, { page = 1, pageSize = 30 } = {}) {
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        createdAt: true,
        readAt: true,
        actor: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.notification.count({ where: { userId } }),
  ]);

  return { rows, total };
}

/**
 * Marks notifications read.
 *
 * The `userId` predicate is not decoration — without it, a caller could pass
 * another user's notification ids and mutate rows they don't own.
 */
export async function markNotificationsRead(
  userId: string,
  target: { ids?: string[]; all?: boolean },
): Promise<number> {
  const now = new Date();

  if (target.all) {
    const { count } = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: now },
    });
    return count;
  }

  const ids = (target.ids ?? []).filter(Boolean).slice(0, 200);
  if (ids.length === 0) return 0;

  const { count } = await prisma.notification.updateMany({
    where: { userId, id: { in: ids }, readAt: null },
    data: { readAt: now },
  });
  return count;
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** Retention: keep the tray useful rather than complete. */
export async function pruneOldNotifications(olderThanDays = 60): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.notification.deleteMany({
    where: { createdAt: { lt: cutoff }, readAt: { not: null } },
  });
  return count;
}
