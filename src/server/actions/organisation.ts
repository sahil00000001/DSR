"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { errors, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/auth/rbac";
import { requireUserAction } from "@/lib/auth/session";
import {
  departmentSchema,
  departmentUpdateSchema,
  holidaySchema,
  locationSchema,
  parseFormData,
  teamSchema,
} from "@/lib/validation/schemas";
import { slugify } from "@/lib/utils/format";
import { formatDay, parseDayKey } from "@/lib/utils/date";
import { recordAudit } from "@/lib/services/audit";
import { formError, formSuccess, type FormState } from "@/server/actions/form-state";

/**
 * Organisation structure: departments, teams, locations and holidays.
 *
 * Deletes are all *guarded rather than cascading*. Removing a department would
 * otherwise silently orphan its people and quietly change every historical
 * report's attribution, so each delete checks its dependents first and explains
 * what to do instead.
 */

/** Slugs must stay unique — they're the department's public URL. */
async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || "department";
  let candidate = base;
  let suffix = 2;

  for (;;) {
    const clash = await prisma.department.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

// ---------------------------------------------------------------------------
//  Departments
// ---------------------------------------------------------------------------

export async function createDepartmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(departmentSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.manageDepartments(actor)) throw errors.forbidden("Only admins can manage departments.");

    const input = parsed.data;

    const existing = await prisma.department.findFirst({
      where: { name: input.name },
      select: { id: true },
    });
    if (existing) {
      return formError("A department with that name already exists.", { name: "Already in use." });
    }

    const department = await prisma.department.create({
      data: {
        name: input.name,
        slug: await uniqueSlug(input.name),
        description: input.description ?? null,
        color: input.color,
        headId: input.headId ?? null,
      },
      select: { id: true, name: true, slug: true },
    });

    await recordAudit({
      actorId: actor.id,
      action: "department.create",
      entity: "department",
      entityId: department.id,
      meta: { name: department.name },
    });

    revalidatePath("/departments");
    revalidatePath("/employees");

    return formSuccess(`${department.name} created.`, { id: department.id, slug: department.slug });
  } catch (error) {
    return formError(toUserMessage(error, { action: "createDepartment" }));
  }
}

export async function updateDepartmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(departmentUpdateSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.manageDepartments(actor)) throw errors.forbidden("Only admins can manage departments.");

    const input = parsed.data;

    const existing = await prisma.department.findUnique({
      where: { id: input.id },
      select: { id: true, name: true, slug: true },
    });
    if (!existing) throw errors.notFound("That department");

    const clash = await prisma.department.findFirst({
      where: { name: input.name, id: { not: input.id } },
      select: { id: true },
    });
    if (clash) {
      return formError("Another department already has that name.", { name: "Already in use." });
    }

    await prisma.department.update({
      where: { id: input.id },
      data: {
        name: input.name,
        // Only re-slug on a rename, so existing links keep working.
        slug: existing.name === input.name ? existing.slug : await uniqueSlug(input.name, input.id),
        description: input.description ?? null,
        color: input.color,
        headId: input.headId ?? null,
      },
    });

    await recordAudit({
      actorId: actor.id,
      action: "department.update",
      entity: "department",
      entityId: input.id,
      meta: { name: input.name, renamed: existing.name !== input.name },
    });

    revalidatePath("/departments");
    revalidatePath("/employees");
    revalidatePath("/analytics");

    return formSuccess(`${input.name} updated.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "updateDepartment" }));
  }
}

export async function deleteDepartmentAction(id: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.manageDepartments(actor)) throw errors.forbidden("Only admins can manage departments.");

    const department = await prisma.department.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { members: true, teams: true } },
      },
    });
    if (!department) throw errors.notFound("That department");

    if (department._count.members > 0) {
      return formError(
        `${department.name} still has ${department._count.members} ${
          department._count.members === 1 ? "person" : "people"
        }. Move them to another department first.`,
      );
    }

    // Teams cascade with the department, so warn but allow.
    await prisma.department.delete({ where: { id } });

    await recordAudit({
      actorId: actor.id,
      action: "department.delete",
      entity: "department",
      entityId: id,
      meta: { name: department.name, teamsRemoved: department._count.teams },
    });

    revalidatePath("/departments");
    return formSuccess(`${department.name} deleted.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "deleteDepartment" }));
  }
}

// ---------------------------------------------------------------------------
//  Teams
// ---------------------------------------------------------------------------

export async function createTeamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(teamSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.manageDepartments(actor)) throw errors.forbidden("Only admins can manage teams.");

    const input = parsed.data;

    const department = await prisma.department.findUnique({
      where: { id: input.departmentId },
      select: { id: true, name: true },
    });
    if (!department) throw errors.notFound("That department");

    const existing = await prisma.team.findFirst({
      where: { name: input.name, departmentId: input.departmentId },
      select: { id: true },
    });
    if (existing) {
      return formError(`${department.name} already has a team called ${input.name}.`, {
        name: "Already in use in this department.",
      });
    }

    // Slug is globally unique, so scope it by department to avoid collisions
    // between e.g. Engineering/Platform and Design/Platform.
    const team = await prisma.team.create({
      data: {
        name: input.name,
        slug: `${slugify(department.name)}-${slugify(input.name)}`,
        departmentId: input.departmentId,
      },
      select: { id: true, name: true },
    });

    await recordAudit({
      actorId: actor.id,
      action: "team.create",
      entity: "team",
      entityId: team.id,
      meta: { name: team.name, department: department.name },
    });

    revalidatePath("/departments");
    return formSuccess(`${team.name} added to ${department.name}.`, { id: team.id });
  } catch (error) {
    return formError(toUserMessage(error, { action: "createTeam" }));
  }
}

// ---------------------------------------------------------------------------
//  Locations
// ---------------------------------------------------------------------------

export async function createLocationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(locationSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.manageSettings(actor)) throw errors.forbidden("Only admins can manage locations.");

    const input = parsed.data;

    const existing = await prisma.location.findUnique({
      where: { code: input.code },
      select: { id: true },
    });
    if (existing) {
      return formError("That location code is already in use.", { code: "Already in use." });
    }

    const location = await prisma.location.create({
      data: {
        name: input.name,
        code: input.code,
        city: input.city,
        country: input.country,
        timezone: input.timezone,
      },
      select: { id: true, name: true },
    });

    await recordAudit({
      actorId: actor.id,
      action: "settings.update",
      entity: "location",
      entityId: location.id,
      meta: { created: location.name },
    });

    revalidatePath("/settings");
    revalidatePath("/employees");

    return formSuccess(`${location.name} added.`, { id: location.id });
  } catch (error) {
    return formError(toUserMessage(error, { action: "createLocation" }));
  }
}

// ---------------------------------------------------------------------------
//  Holidays
// ---------------------------------------------------------------------------

export async function createHolidayAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(holidaySchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.manageHolidays(actor)) throw errors.forbidden("Only admins can manage the holiday list.");

    const input = parsed.data;
    const date = parseDayKey(input.date);

    const existing = await prisma.holiday.findFirst({
      where: { date, name: input.name },
      select: { id: true },
    });
    if (existing) {
      return formError(`${input.name} is already listed on ${formatDay(date)}.`);
    }

    const holiday = await prisma.holiday.create({
      data: {
        name: input.name,
        date,
        type: input.type,
        locationId: input.locationId ?? null,
      },
      select: { id: true, name: true },
    });

    await recordAudit({
      actorId: actor.id,
      action: "holiday.create",
      entity: "holiday",
      entityId: holiday.id,
      meta: { name: holiday.name, date: input.date, type: input.type },
    });

    // Holidays change what counts as a working day, so every derived view moves.
    revalidatePath("/calendar");
    revalidatePath("/attendance");
    revalidatePath("/attendance/board");
    revalidatePath("/analytics");
    revalidatePath("/settings");

    return formSuccess(`${holiday.name} added to the calendar.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "createHoliday" }));
  }
}

export async function deleteHolidayAction(id: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.manageHolidays(actor)) throw errors.forbidden("Only admins can manage the holiday list.");

    const holiday = await prisma.holiday.findUnique({
      where: { id },
      select: { id: true, name: true, date: true },
    });
    if (!holiday) throw errors.notFound("That holiday");

    await prisma.holiday.delete({ where: { id } });

    await recordAudit({
      actorId: actor.id,
      action: "holiday.delete",
      entity: "holiday",
      entityId: id,
      meta: { name: holiday.name },
    });

    revalidatePath("/calendar");
    revalidatePath("/attendance");
    revalidatePath("/settings");

    return formSuccess(`${holiday.name} removed from the calendar.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "deleteHoliday" }));
  }
}
