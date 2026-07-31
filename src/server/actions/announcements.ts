"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { errors, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/auth/rbac";
import { requireUserAction } from "@/lib/auth/session";
import { announcementSchema, parseFormData } from "@/lib/validation/schemas";
import { markdownToText } from "@/lib/utils/markdown";
import { truncate } from "@/lib/utils/format";
import { getAnnouncementRecipients } from "@/lib/services/announcements";
import { recordAudit } from "@/lib/services/audit";
import { notifyMany } from "@/lib/services/notifications";
import { sendBulkEmail } from "@/lib/email/mailer";
import { announcementEmail } from "@/lib/email/templates";
import { formError, formSuccess, type FormState } from "@/server/actions/form-state";
import type { AnnouncementAudience } from "@/lib/constants/enums";

/**
 * Team announcements.
 *
 * Publishing fans out to both channels: an in-app notification for everyone in
 * the audience, and email for those who haven't opted out. The in-app write is
 * awaited (it's one query and the badge should be correct immediately); email is
 * paced in batches by `sendBulkEmail` so Gmail's relay doesn't throttle us.
 */

export async function createAnnouncementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(announcementSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.postAnnouncement(actor)) {
      throw errors.forbidden("Only managers and admins can post announcements.");
    }

    const input = parsed.data;
    const audience = input.audience as AnnouncementAudience;

    // A manager may only address their own department.
    if (
      actor.role === "MANAGER" &&
      audience === "DEPARTMENT" &&
      input.departmentId !== actor.departmentId
    ) {
      throw errors.forbidden("You can only post to your own department.");
    }

    const announcement = await prisma.announcement.create({
      data: {
        authorId: actor.id,
        title: input.title,
        body: input.body,
        audience,
        departmentId: audience === "DEPARTMENT" ? (input.departmentId ?? null) : null,
        pinned: input.pinned,
      },
      select: { id: true, title: true },
    });

    const recipients = await getAnnouncementRecipients(
      audience,
      input.departmentId ?? null,
      actor.id,
    );

    await notifyMany(
      recipients.map((recipient) => ({
        userId: recipient.id,
        actorId: actor.id,
        type: "ANNOUNCEMENT" as const,
        title: input.title,
        body: truncate(markdownToText(input.body), 140),
        href: "/announcements",
      })),
    );

    const emailResult = await sendBulkEmail(
      recipients.map((recipient) => ({
        to: recipient.email,
        content: announcementEmail({
          title: input.title,
          body: input.body,
          authorName: actor.name,
          url: `${env.NEXT_PUBLIC_APP_URL}/announcements`,
        }),
      })),
    );

    await recordAudit({
      actorId: actor.id,
      action: "announcement.create",
      entity: "announcement",
      entityId: announcement.id,
      meta: { title: input.title, audience, recipients: recipients.length },
    });

    revalidatePath("/announcements");
    revalidatePath("/dashboard");

    return formSuccess(
      recipients.length === 0
        ? "Announcement posted. There was nobody else in the audience to notify."
        : `Announcement posted to ${recipients.length} ${
            recipients.length === 1 ? "person" : "people"
          }${emailResult.skipped > 0 ? " (email is not configured, so notifications are in-app only)" : ""}.`,
      { id: announcement.id },
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "createAnnouncement" }));
  }
}

export async function deleteAnnouncementAction(id: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();

    const announcement = await prisma.announcement.findUnique({
      where: { id },
      select: { id: true, title: true, authorId: true },
    });
    if (!announcement) throw errors.notFound("That announcement");

    // Authors can remove their own; admins can remove anyone's.
    if (announcement.authorId !== actor.id && actor.role !== "ADMIN") {
      throw errors.forbidden("You can only delete announcements you posted.");
    }

    await prisma.announcement.delete({ where: { id } });

    await recordAudit({
      actorId: actor.id,
      action: "announcement.delete",
      entity: "announcement",
      entityId: id,
      meta: { title: announcement.title },
    });

    revalidatePath("/announcements");
    revalidatePath("/dashboard");

    return formSuccess("Announcement deleted.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "deleteAnnouncement" }));
  }
}

export async function togglePinAction(id: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.postAnnouncement(actor)) throw errors.forbidden();

    const announcement = await prisma.announcement.findUnique({
      where: { id },
      select: { id: true, pinned: true, title: true, authorId: true },
    });
    if (!announcement) throw errors.notFound("That announcement");

    if (announcement.authorId !== actor.id && actor.role !== "ADMIN") {
      throw errors.forbidden("You can only pin announcements you posted.");
    }

    await prisma.announcement.update({
      where: { id },
      data: { pinned: !announcement.pinned },
    });

    revalidatePath("/announcements");
    return formSuccess(announcement.pinned ? "Unpinned." : "Pinned to the top.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "togglePin" }));
  }
}
