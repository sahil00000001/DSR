"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { toUserMessage } from "@/lib/errors";
import { requireUserAction } from "@/lib/auth/session";
import { parseFormData, preferencesSchema, profileSchema } from "@/lib/validation/schemas";
import { parseDayKey } from "@/lib/utils/date";
import { recordAudit } from "@/lib/services/audit";
import { formError, formSuccess, type FormState } from "@/server/actions/form-state";

/**
 * Self-service settings.
 *
 * Everything here acts on `actor.id` only — there is no id parameter to tamper
 * with. Fields that carry organisational meaning (role, department, manager,
 * employee code) are deliberately absent: those are administrative changes and
 * live in `employees.ts`, where they're audited and permission-checked.
 */

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(profileSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const input = parsed.data;

    await prisma.user.update({
      where: { id: actor.id },
      data: {
        name: input.name,
        phone: input.phone ?? null,
        designation: input.designation ?? null,
        bio: input.bio ?? null,
        dateOfBirth: input.dateOfBirth ? parseDayKey(input.dateOfBirth) : null,
      },
    });

    await recordAudit({
      actorId: actor.id,
      action: "settings.update",
      entity: "user",
      entityId: actor.id,
      meta: { section: "profile" },
    });

    revalidatePath("/settings");
    revalidatePath(`/employees/${actor.id}`);
    // The name is rendered in the shell, so the layout has to re-render too.
    revalidatePath("/", "layout");

    return formSuccess("Profile updated.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "updateProfile" }));
  }
}

export async function updatePreferencesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(preferencesSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const input = parsed.data;

    await prisma.user.update({
      where: { id: actor.id },
      data: {
        // Mirrors the theme cookie, so a new device inherits the choice.
        theme: input.theme,
        notifyByEmail: input.notifyByEmail,
        emailDigestOnly: input.emailDigestOnly,
        dsrReminderOptOut: input.dsrReminderOptOut,
      },
    });

    await recordAudit({
      actorId: actor.id,
      action: "settings.update",
      entity: "user",
      entityId: actor.id,
      meta: {
        section: "preferences",
        theme: input.theme,
        email: input.notifyByEmail,
        digestOnly: input.emailDigestOnly,
      },
    });

    revalidatePath("/settings");
    return formSuccess("Preferences saved.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "updatePreferences" }));
  }
}
