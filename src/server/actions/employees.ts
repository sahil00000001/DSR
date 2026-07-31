"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { errors, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/auth/rbac";
import { requireUserAction, revokeAllSessions } from "@/lib/auth/session";
import { employeeSchema, employeeUpdateSchema, parseFormData } from "@/lib/validation/schemas";
import { parseDayKey } from "@/lib/utils/date";
import {
  BALANCED_LEAVE_TYPES,
  DEFAULT_LEAVE_ALLOCATION,
  ROLE_LABEL,
  type Role,
} from "@/lib/constants/enums";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/mailer";
import { welcomeEmail } from "@/lib/email/templates";
import { recordAudit } from "@/lib/services/audit";
import { notify } from "@/lib/services/notifications";
import { formError, formSuccess, type FormState } from "@/server/actions/form-state";

/**
 * Employee administration.
 *
 * ## Onboarding without a password
 *
 * A new employee is created with `passwordHash: null` and status `INVITED`, then
 * emailed an INVITE token. They choose their own password via the normal reset
 * flow. No temporary password is ever generated, stored or transmitted — which
 * removes the most common credential leak in tools of this kind.
 *
 * ## Deactivate, don't delete
 *
 * `setEmployeeStatus` is the ordinary path: it revokes sessions and blocks
 * sign-in while keeping the person's reports, attendance and leave history
 * intact. Hard deletion exists but is guarded, because it cascades.
 */

export async function createEmployeeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(employeeSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.manageEmployees(actor)) throw errors.forbidden("Only admins can add employees.");

    const input = parsed.data;

    const [emailTaken, codeTaken] = await Promise.all([
      prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      prisma.user.findUnique({ where: { employeeCode: input.employeeCode }, select: { id: true } }),
    ]);

    if (emailTaken) {
      return formError("That email address is already in use.", {
        email: "An employee with this email already exists.",
      });
    }
    if (codeTaken) {
      return formError("That employee ID is already in use.", {
        employeeCode: "Pick a different ID.",
      });
    }

    const joinedAt = parseDayKey(input.joinedAt);
    const year = joinedAt.getUTCFullYear();

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          employeeCode: input.employeeCode,
          role: input.role,
          // Invited until they've set a password, regardless of what was submitted.
          status: "INVITED",
          designation: input.designation ?? null,
          phone: input.phone ?? null,
          departmentId: input.departmentId ?? null,
          teamId: input.teamId ?? null,
          locationId: input.locationId ?? null,
          managerId: input.managerId ?? null,
          joinedAt,
          dateOfBirth: input.dateOfBirth ? parseDayKey(input.dateOfBirth) : null,
        },
        select: { id: true, name: true, email: true, employeeCode: true, role: true },
      });

      // Give them this year's entitlement up front so balances read correctly
      // from their very first sign-in.
      await tx.leaveBalance.createMany({
        data: BALANCED_LEAVE_TYPES.map((type) => ({
          userId: user.id,
          year,
          type,
          allocated: DEFAULT_LEAVE_ALLOCATION[type],
        })),
      });

      return user;
    });

    const { token } = await issueToken(created.email, "INVITE");

    await sendEmail({
      to: created.email,
      content: welcomeEmail({
        name: created.name,
        // The invite is redeemed through the same reset screen — one code path,
        // one set of token semantics.
        setPasswordUrl: `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`,
        employeeCode: created.employeeCode,
        role: ROLE_LABEL[created.role as Role],
      }),
    });

    if (input.managerId) {
      await notify({
        userId: input.managerId,
        actorId: actor.id,
        type: "SYSTEM",
        title: `${created.name} has joined your team`,
        body: input.designation ?? undefined,
        href: `/employees/${created.id}`,
      });
    }

    await recordAudit({
      actorId: actor.id,
      action: "employee.create",
      entity: "user",
      entityId: created.id,
      meta: { email: created.email, role: input.role, code: created.employeeCode },
    });

    revalidatePath("/employees");
    revalidatePath("/departments");

    return formSuccess(
      `${created.name} has been added and sent an invitation to set their password.`,
      { id: created.id },
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "createEmployee" }));
  }
}

export async function updateEmployeeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(employeeUpdateSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.manageEmployees(actor)) throw errors.forbidden("Only admins can edit employees.");

    const input = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { id: input.id },
      select: { id: true, name: true, email: true, role: true, status: true, employeeCode: true },
    });
    if (!existing) throw errors.notFound("That employee");

    // Self-inflicted lockout is a real failure mode with a single admin.
    if (existing.id === actor.id && input.role !== "ADMIN") {
      return formError(
        "You can't remove your own admin access. Ask another admin to change your role.",
        { role: "You would lose access to this screen." },
      );
    }

    if (input.managerId === input.id) {
      return formError("Someone can't report to themselves.", {
        managerId: "Choose a different manager.",
      });
    }

    // Two-level cycle check — enough for a 20-person org, and cheap.
    if (input.managerId) {
      const proposedManager = await prisma.user.findUnique({
        where: { id: input.managerId },
        select: { managerId: true },
      });
      if (proposedManager?.managerId === input.id) {
        return formError("That would create a reporting loop.", {
          managerId: "This person already reports to the employee you're editing.",
        });
      }
    }

    const [emailClash, codeClash] = await Promise.all([
      prisma.user.findFirst({
        where: { email: input.email, id: { not: input.id } },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { employeeCode: input.employeeCode, id: { not: input.id } },
        select: { id: true },
      }),
    ]);

    if (emailClash) {
      return formError("That email address belongs to another employee.", {
        email: "Already in use.",
      });
    }
    if (codeClash) {
      return formError("That employee ID belongs to another employee.", {
        employeeCode: "Already in use.",
      });
    }

    await prisma.user.update({
      where: { id: input.id },
      data: {
        name: input.name,
        email: input.email,
        employeeCode: input.employeeCode,
        role: input.role,
        status: input.status,
        designation: input.designation ?? null,
        phone: input.phone ?? null,
        departmentId: input.departmentId ?? null,
        teamId: input.teamId ?? null,
        locationId: input.locationId ?? null,
        managerId: input.managerId ?? null,
        joinedAt: parseDayKey(input.joinedAt),
        dateOfBirth: input.dateOfBirth ? parseDayKey(input.dateOfBirth) : null,
      },
    });

    // A role or email change alters what the session token asserts, so reissue.
    if (existing.role !== input.role || existing.email !== input.email) {
      await revokeAllSessions(input.id);
    }
    if (input.status === "DISABLED") {
      await revokeAllSessions(input.id);
    }

    await recordAudit({
      actorId: actor.id,
      action: "employee.update",
      entity: "user",
      entityId: input.id,
      meta: {
        changedRole: existing.role !== input.role ? `${existing.role}→${input.role}` : undefined,
        changedStatus: existing.status !== input.status ? `${existing.status}→${input.status}` : undefined,
        changedEmail: existing.email !== input.email,
      },
    });

    revalidatePath("/employees");
    revalidatePath(`/employees/${input.id}`);
    revalidatePath("/departments");

    return formSuccess(`${input.name}'s profile has been updated.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "updateEmployee" }));
  }
}

export async function setEmployeeStatusAction(
  id: string,
  status: "ACTIVE" | "DISABLED",
): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.manageEmployees(actor)) throw errors.forbidden("Only admins can change account status.");

    if (id === actor.id) {
      return formError("You can't disable your own account.");
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true, status: true },
    });
    if (!target) throw errors.notFound("That employee");

    // Never leave the organisation without a way in.
    if (status === "DISABLED" && target.role === "ADMIN") {
      const remainingAdmins = await prisma.user.count({
        where: { role: "ADMIN", status: "ACTIVE", id: { not: id } },
      });
      if (remainingAdmins === 0) {
        return formError(
          "This is the only active admin. Promote someone else before disabling this account.",
        );
      }
    }

    await prisma.user.update({ where: { id }, data: { status } });

    if (status === "DISABLED") {
      // Takes effect on their next request — see lib/auth/session.ts.
      await revokeAllSessions(id);
    }

    await recordAudit({
      actorId: actor.id,
      action: status === "DISABLED" ? "employee.disable" : "employee.enable",
      entity: "user",
      entityId: id,
      meta: { name: target.name },
    });

    revalidatePath("/employees");
    revalidatePath(`/employees/${id}`);

    return formSuccess(
      status === "DISABLED"
        ? `${target.name} has been disabled and signed out everywhere. Their history is kept.`
        : `${target.name} can sign in again.`,
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "setEmployeeStatus" }));
  }
}

/**
 * Permanent deletion.
 *
 * Cascades to reports, attendance, leave and notifications, so it's guarded
 * behind an explicit confirmation in the UI and refuses outright for anyone with
 * history worth keeping — deactivation is nearly always the right action.
 */
export async function deleteEmployeeAction(id: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.manageEmployees(actor)) throw errors.forbidden("Only admins can remove employees.");

    if (id === actor.id) return formError("You can't delete your own account.");

    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        role: true,
        _count: { select: { reports_dsr: true, leaveRequests: true, attendance: true } },
      },
    });
    if (!target) throw errors.notFound("That employee");

    const history =
      target._count.reports_dsr + target._count.leaveRequests + target._count.attendance;

    if (history > 0) {
      return formError(
        `${target.name} has ${history} historical record${
          history === 1 ? "" : "s"
        }. Disable the account instead — that blocks access while keeping the history for reporting.`,
      );
    }

    await prisma.user.delete({ where: { id } });

    await recordAudit({
      actorId: actor.id,
      action: "employee.delete",
      entity: "user",
      entityId: id,
      meta: { name: target.name },
    });

    revalidatePath("/employees");
    revalidatePath("/departments");

    return formSuccess(`${target.name} has been removed.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "deleteEmployee" }));
  }
}

/** Re-sends the invitation for someone who never set a password. */
export async function resendInviteAction(id: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.manageEmployees(actor)) throw errors.forbidden();

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, employeeCode: true, role: true, passwordHash: true },
    });
    if (!target) throw errors.notFound("That employee");

    if (target.passwordHash) {
      return formError(
        `${target.name} has already set a password. Point them at “Forgot password” if they're locked out.`,
      );
    }

    const { token } = await issueToken(target.email, "INVITE");

    const result = await sendEmail({
      to: target.email,
      content: welcomeEmail({
        name: target.name,
        setPasswordUrl: `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`,
        employeeCode: target.employeeCode,
        role: ROLE_LABEL[target.role as Role],
      }),
    });

    await recordAudit({
      actorId: actor.id,
      action: "employee.update",
      entity: "user",
      entityId: id,
      meta: { resentInvite: true },
    });

    return formSuccess(
      result.skipped
        ? "Invitation regenerated. SMTP isn't configured, so the link was written to the server log."
        : `A fresh invitation is on its way to ${target.email}.`,
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "resendInvite" }));
  }
}
