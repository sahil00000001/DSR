/**
 * Database seed.
 *
 * Produces a workspace for Pooja Machines Private Limited that looks like it has
 * been in use for three months: 20 people across 6 departments and 4 locations,
 * ~90 days of attendance and status reports, a leave history with pending requests,
 * expense claims in every state, announcements, notifications and an audit trail.
 *
 * ## Determinism
 *
 * All randomness comes from a seeded PRNG, so `npm run db:reset` always produces
 * the same workspace. That matters more than it sounds: a demo you can rehearse
 * is a demo that doesn't surprise you, and a screenshot taken today still matches
 * the data tomorrow.
 *
 * ## Realism rules
 *
 *  • Nobody has a perfect record — attendance and completion vary per person.
 *  • Reports are only generated for working days after each person joined.
 *  • Approved leave writes matching attendance rows, exactly as the app does.
 *  • Recent days are denser than older ones, which is how real usage looks.
 *
 * Run with: npm run db:seed   (or npm run db:reset to wipe first)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_TASK_TAGS } from "../src/lib/constants/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes, scryptSync } from "node:crypto";
import {
  ANNOUNCEMENTS,
  BLOCKERS,
  DEPARTMENTS,
  DEPARTMENT_HEADS,
  EXPENSES,
  HOLIDAYS,
  LEAVE_REASONS,
  LOCATIONS,
  NEXT_STEPS_BY_DEPARTMENT,
  NOTES,
  ORDERS,
  PEOPLE,
  TASK_CATEGORIES,
  TASKS,
  TASKS_BY_DEPARTMENT,
} from "./seed-data";

/**
 * Prisma 7 connects through a driver adapter, not a URL in the schema — so the
 * seed builds its own, exactly as the runtime client does.
 *
 * It uses **DIRECT_URL** (Supabase pooler, session mode on 5432) rather than the
 * transaction-mode pooler the app uses. The seed writes tens of thousands of rows
 * in one long-lived process; session mode is the right shape for that, and it is
 * the same endpoint `prisma db push` already targets.
 */
const seedConnectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!seedConnectionString) {
  throw new Error("Neither DIRECT_URL nor DATABASE_URL is set — cannot connect to seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: seedConnectionString, max: 4 }),
});

// ---------------------------------------------------------------------------
//  Deterministic randomness
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, good enough for content generation. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(20260731);

const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

function pickMany<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const chosen: T[] = [];
  for (let index = 0; index < count && pool.length > 0; index += 1) {
    chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!);
  }
  return chosen;
}

const chance = (probability: number) => random() < probability;

// ---------------------------------------------------------------------------
//  Dates (UTC-midnight calendar days, matching the app's convention)
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

const utcDay = (year: number, monthIndex: number, day: number) =>
  new Date(Date.UTC(year, monthIndex, day));

const addDays = (date: Date, amount: number) => new Date(date.getTime() + amount * MS_PER_DAY);

const dayKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;

const isWeekend = (date: Date) => date.getUTCDay() === 0 || date.getUTCDay() === 6;

const now = new Date();
const TODAY = utcDay(now.getFullYear(), now.getMonth(), now.getDate());
/** How much history to generate. */
const HISTORY_DAYS = 95;
const YEAR = TODAY.getUTCFullYear();

/** An instant at a given hour on a calendar day — for check-in/out times. */
function atHour(day: Date, hour: number, minute = 0) {
  const instant = new Date(day.getTime());
  instant.setUTCHours(hour, minute, 0, 0);
  return instant;
}

// ---------------------------------------------------------------------------
//  Password
// ---------------------------------------------------------------------------

const DEMO_PASSWORD = "Pooja@Machines26";

/**
 * Hashes the demo password once and reuses the result for all 20 accounts.
 *
 * Sharing a salt across accounts is *not* something the application does — see
 * `lib/auth/password.ts`, which generates a fresh salt per password. It's done
 * here only because 20 sequential scrypt calls at production parameters add
 * several seconds to every reseed, and these are throwaway demo credentials.
 */
function buildDemoHash(): string {
  const N = 2 ** 16;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const derived = scryptSync(DEMO_PASSWORD.normalize("NFKC"), salt, 64, {
    N,
    r,
    p,
    maxmem: 144 * 1024 * 1024,
  });
  return ["scrypt", N, r, p, salt.toString("base64"), derived.toString("base64")].join("$");
}

// ---------------------------------------------------------------------------
//  Seed
// ---------------------------------------------------------------------------

async function reset() {
  // Ordered so that child rows go before their parents; several relations use
  // `SetNull` rather than cascade, so relying on cascade alone isn't enough.
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  // Attachments before claims: the FK is `SetNull`, not cascade.
  await prisma.attachment.deleteMany();
  await prisma.expenseComment.deleteMany();
  await prisma.expenseClaim.deleteMany();
  // Task graph, children first — several FKs are SetNull rather than cascade.
  await prisma.taskDependency.deleteMany();
  await prisma.taskChecklistItem.deleteMany();
  await prisma.taskMention.deleteMany();
  await prisma.taskTagLink.deleteMany();
  await prisma.taskActivity.deleteMany();
  await prisma.taskUpdate.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.taskTag.deleteMany();
  await prisma.taskCategory.deleteMany();
  await prisma.messageLog.deleteMany();
  await prisma.orderActivity.deleteMany();
  // Stages are tasks with an orderId; deleting the task rows first keeps the FK happy.
  await prisma.order.deleteMany();
  await prisma.dailyStatusReport.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verificationToken.deleteMany();
  // Break the self-referencing manager link and the department-head link before
  // deleting, so no row blocks another.
  await prisma.user.updateMany({ data: { managerId: null, departmentId: null, teamId: null, locationId: null } });
  await prisma.department.updateMany({ data: { headId: null } });
  await prisma.team.deleteMany();
  await prisma.department.deleteMany();
  await prisma.user.deleteMany();
  await prisma.location.deleteMany();
}

async function main() {
  console.log("→ Resetting existing data…");
  await reset();

  // --- Locations ----------------------------------------------------------
  console.log("→ Locations…");
  const locationByName = new Map<string, string>();
  for (const location of LOCATIONS) {
    const created = await prisma.location.create({ data: { ...location } });
    locationByName.set(location.name, created.id);
  }

  // --- Departments & teams ------------------------------------------------
  console.log("→ Departments and teams…");
  const departmentByName = new Map<string, string>();
  const teamByKey = new Map<string, string>();

  for (const department of DEPARTMENTS) {
    const slug = department.name
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const created = await prisma.department.create({
      data: {
        name: department.name,
        slug,
        description: department.description,
        color: department.color,
      },
    });
    departmentByName.set(department.name, created.id);

    for (const teamName of department.teams) {
      const team = await prisma.team.create({
        data: {
          name: teamName,
          slug: `${slug}-${teamName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          departmentId: created.id,
        },
      });
      teamByKey.set(`${department.name}::${teamName}`, team.id);
    }
  }

  // --- People -------------------------------------------------------------
  console.log("→ People…");
  const passwordHash = buildDemoHash();
  const userByEmail = new Map<
    string,
    { id: string; name: string; joinedAt: Date; department: string }
  >();

  for (const [index, person] of PEOPLE.entries()) {
    const joinedAt = addDays(TODAY, -Math.round(person.joinedMonthsAgo * 30.44));
    const [birthMonth, birthDay] = person.birthday.split("-").map(Number);

    const created = await prisma.user.create({
      data: {
        employeeCode: `CAD-${String(index + 1).padStart(3, "0")}`,
        name: person.name,
        email: person.email,
        passwordHash,
        phone: person.phone,
        designation: person.designation,
        bio: person.bio ?? null,
        role: person.role,
        status: "ACTIVE",
        departmentId: departmentByName.get(person.department) ?? null,
        teamId: teamByKey.get(`${person.department}::${person.team}`) ?? null,
        locationId: locationByName.get(person.location) ?? null,
        joinedAt,
        // Ages 25–40, spread deterministically.
        dateOfBirth: utcDay(YEAR - 25 - (index % 15), birthMonth! - 1, birthDay!),
        emailVerifiedAt: addDays(joinedAt, 1),
        lastLoginAt: addDays(TODAY, -Math.floor(random() * 3)),
        theme: index % 4 === 0 ? "dark" : "system",
        notifyByEmail: true,
        dsrReminderOptOut: index === 16, // one person has opted out
      },
    });

    userByEmail.set(person.email, {
      id: created.id,
      name: person.name,
      joinedAt,
      department: person.department,
    });
  }

  // Reporting lines, once every user exists.
  for (const person of PEOPLE) {
    if (!person.managerEmail) continue;
    await prisma.user.update({
      where: { id: userByEmail.get(person.email)!.id },
      data: { managerId: userByEmail.get(person.managerEmail)!.id },
    });
  }

  for (const [departmentName, headEmail] of Object.entries(DEPARTMENT_HEADS)) {
    const departmentId = departmentByName.get(departmentName);
    const head = userByEmail.get(headEmail);
    if (departmentId && head) {
      await prisma.department.update({ where: { id: departmentId }, data: { headId: head.id } });
    }
  }

  // --- Holidays -----------------------------------------------------------
  console.log("→ Holidays…");
  const holidayKeys = new Set<string>();
  for (const holiday of HOLIDAYS) {
    const [month, day] = holiday.monthDay.split("-").map(Number);
    // Seed both this year and last, so a 95-day window that crosses New Year
    // still has holidays in it.
    for (const year of [YEAR - 1, YEAR]) {
      const date = utcDay(year, month! - 1, day!);
      await prisma.holiday.create({
        data: { name: holiday.name, date, type: holiday.type },
      });
      // Only PUBLIC/COMPANY days suppress work; OPTIONAL ones don't.
      if (holiday.type !== "OPTIONAL") holidayKeys.add(dayKey(date));
    }
  }

  // --- Leave balances -----------------------------------------------------
  console.log("→ Leave balances…");
  for (const person of userByEmail.values()) {
    for (const type of ["CASUAL", "SICK", "EARNED"] as const) {
      await prisma.leaveBalance.create({
        data: { userId: person.id, year: YEAR, type, allocated: 5, used: 0, pending: 0 },
      });
    }
  }

  // --- Leave requests -----------------------------------------------------
  console.log("→ Leave requests…");
  /** Approved leave days per user, so attendance and reports can skip them. */
  const leaveDaysByUser = new Map<string, Set<string>>();

  const balanceDelta = new Map<string, { used: number; pending: number }>();
  const bumpBalance = (userId: string, type: string, field: "used" | "pending", amount: number) => {
    const key = `${userId}::${type}`;
    const current = balanceDelta.get(key) ?? { used: 0, pending: 0 };
    current[field] += amount;
    balanceDelta.set(key, current);
  };

  const people = [...userByEmail.entries()];

  for (const [email, person] of people) {
    const requestCount = 1 + Math.floor(random() * 3);

    for (let index = 0; index < requestCount; index += 1) {
      const type = pick(["CASUAL", "SICK", "EARNED"] as const);
      // Spread across history; a couple land in the future so the queue has
      // something pending.
      const offset = Math.floor(random() * (HISTORY_DAYS + 20)) - HISTORY_DAYS;
      const start = addDays(TODAY, offset);
      if (start < person.joinedAt) continue;

      const span = type === "SICK" ? Math.floor(random() * 2) : Math.floor(random() * 3);
      const end = addDays(start, span);
      const halfDay = span === 0 && chance(0.15);

      // Count working days the way the app does.
      let days = 0;
      for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
        if (!isWeekend(cursor) && !holidayKeys.has(dayKey(cursor))) days += 1;
      }
      if (days === 0) continue;
      if (halfDay) days = 0.5;

      // Future requests stay pending; past ones are mostly approved.
      const isFuture = start > TODAY;
      const status = isFuture
        ? chance(0.6)
          ? "PENDING"
          : "APPROVED"
        : chance(0.82)
          ? "APPROVED"
          : chance(0.5)
            ? "REJECTED"
            : "CANCELLED";

      const requester = PEOPLE.find((candidate) => candidate.email === email)!;
      const deciderEmail = requester.managerEmail ?? "anil.gupta@poojamachines.co.in";
      const decider = userByEmail.get(deciderEmail);

      await prisma.leaveRequest.create({
        data: {
          userId: person.id,
          type,
          startDate: start,
          endDate: end,
          days,
          halfDay,
          reason: pick(LEAVE_REASONS),
          status,
          decidedById: status === "PENDING" ? null : (decider?.id ?? null),
          decidedAt: status === "PENDING" ? null : addDays(start, -2),
          decisionNote:
            status === "REJECTED"
              ? "We already have two people out that week — could you shift it by a few days?"
              : status === "APPROVED" && chance(0.3)
                ? "Approved — enjoy the break."
                : null,
        },
      });

      if (status === "APPROVED") {
        bumpBalance(person.id, type, "used", days);
        const set = leaveDaysByUser.get(person.id) ?? new Set<string>();
        for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
          if (!isWeekend(cursor) && !holidayKeys.has(dayKey(cursor))) set.add(dayKey(cursor));
        }
        leaveDaysByUser.set(person.id, set);
      } else if (status === "PENDING") {
        bumpBalance(person.id, type, "pending", days);
      }
    }
  }

  for (const [key, delta] of balanceDelta) {
    const [userId, type] = key.split("::");
    await prisma.leaveBalance.updateMany({
      where: { userId, year: YEAR, type },
      data: { used: delta.used, pending: delta.pending },
    });
  }

  // --- Attendance & status reports ---------------------------------------
  console.log("→ Attendance and status reports (this is the slow part)…");

  interface AttendanceRow {
    userId: string;
    date: Date;
    status: string;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    workedMinutes: number;
    note: string | null;
    source: string;
  }

  interface ReportRow {
    userId: string;
    date: Date;
    tasksCompleted: string;
    blockers: string | null;
    nextSteps: string | null;
    notes: string | null;
    hoursWorked: number;
    status: string;
    submittedAt: Date | null;
    reviewedById: string | null;
    reviewedAt: Date | null;
    reviewComment: string | null;
  }

  const attendanceRows: AttendanceRow[] = [];
  const reportRows: ReportRow[] = [];

  for (const [email, person] of people) {
    const profile = PEOPLE.find((candidate) => candidate.email === email)!;
    const tasks = TASKS_BY_DEPARTMENT[profile.department] ?? TASKS_BY_DEPARTMENT.Engineering!;
    const nextSteps = NEXT_STEPS_BY_DEPARTMENT[profile.department] ?? [];
    const leaveDays = leaveDaysByUser.get(person.id) ?? new Set<string>();
    const managerId = profile.managerEmail ? userByEmail.get(profile.managerEmail)!.id : null;

    // Per-person reliability, so the completion table has genuine spread.
    const diligence = 0.68 + random() * 0.3;
    const remoteBias = profile.location === "Remote — India" ? 0.85 : 0.18;

    for (let offset = HISTORY_DAYS; offset >= 0; offset -= 1) {
      const date = addDays(TODAY, -offset);
      const key = dayKey(date);

      if (date < person.joinedAt) continue;
      if (isWeekend(date)) continue;
      if (holidayKeys.has(key)) continue;

      if (leaveDays.has(key)) {
        attendanceRows.push({
          userId: person.id,
          date,
          status: "LEAVE",
          checkInAt: null,
          checkOutAt: null,
          workedMinutes: 0,
          note: "Approved leave",
          source: "SYSTEM",
        });
        continue;
      }

      // Recent days are more complete than older ones — real adoption curve.
      const recencyBoost = offset < 21 ? 0.12 : offset < 45 ? 0.04 : 0;
      const filed = chance(Math.min(0.98, diligence + recencyBoost));

      // A small share of days are genuinely unrecorded.
      if (!filed) {
        if (chance(0.55)) {
          const isHalf = chance(0.25);
          attendanceRows.push({
            userId: person.id,
            date,
            status: isHalf ? "HALF_DAY" : chance(remoteBias) ? "WFH" : "PRESENT",
            checkInAt: atHour(date, 9 + Math.floor(random() * 2), Math.floor(random() * 60)),
            checkOutAt: atHour(date, isHalf ? 13 : 18 + Math.floor(random() * 2), Math.floor(random() * 60)),
            workedMinutes: isHalf ? 240 : 465 + Math.floor(random() * 90),
            note: null,
            source: "SELF",
          });
        }
        continue;
      }

      const isHalfDay = chance(0.05);
      const isRemote = chance(remoteBias);
      const hours = isHalfDay ? 4 : Math.round((7 + random() * 2.5) * 4) / 4;

      attendanceRows.push({
        userId: person.id,
        date,
        status: isHalfDay ? "HALF_DAY" : isRemote ? "WFH" : "PRESENT",
        checkInAt: atHour(date, 9 + Math.floor(random() * 2), Math.floor(random() * 60)),
        checkOutAt: atHour(date, isHalfDay ? 13 : 18 + Math.floor(random() * 2), Math.floor(random() * 60)),
        workedMinutes: Math.round(hours * 60),
        note: chance(0.08) ? pick(NOTES) : null,
        source: chance(0.75) ? "SELF" : "SYSTEM",
      });

      const taskList = pickMany(tasks, 2 + Math.floor(random() * 3))
        .map((task) => `- ${task}`)
        .join("\n");

      // Today's report is often still a draft — the dashboard should have
      // something to nudge about.
      const isToday = offset === 0;
      const status = isToday
        ? chance(0.45)
          ? "DRAFT"
          : "SUBMITTED"
        : offset < 4
          ? chance(0.15)
            ? "SUBMITTED"
            : chance(0.12)
              ? "FLAGGED"
              : "REVIEWED"
          : chance(0.08)
            ? "SUBMITTED"
            : chance(0.06)
              ? "FLAGGED"
              : "REVIEWED";

      const submittedAt = status === "DRAFT" ? null : atHour(date, 18, Math.floor(random() * 55));
      const reviewed = status === "REVIEWED" || status === "FLAGGED";

      reportRows.push({
        userId: person.id,
        date,
        tasksCompleted: taskList,
        blockers: chance(0.22) ? pick(BLOCKERS) : null,
        nextSteps: nextSteps.length > 0 && chance(0.7) ? pick(nextSteps) : null,
        notes: chance(0.15) ? pick(NOTES) : null,
        hoursWorked: hours,
        status,
        submittedAt,
        reviewedById: reviewed ? managerId : null,
        reviewedAt: reviewed && submittedAt ? addDays(submittedAt, 1) : null,
        reviewComment:
          status === "FLAGGED"
            ? "Could you add ticket references so this is traceable next sprint?"
            : reviewed && chance(0.12)
              ? "Clear and useful — thanks."
              : null,
      });
    }
  }

  // Batched to keep memory flat and avoid a single oversized statement.
  const BATCH = 500;
  for (let index = 0; index < attendanceRows.length; index += BATCH) {
    await prisma.attendance.createMany({ data: attendanceRows.slice(index, index + BATCH) });
  }
  for (let index = 0; index < reportRows.length; index += BATCH) {
    await prisma.dailyStatusReport.createMany({ data: reportRows.slice(index, index + BATCH) });
  }

  // --- Announcements ------------------------------------------------------
  console.log("→ Announcements…");
  for (const announcement of ANNOUNCEMENTS) {
    const author = userByEmail.get(announcement.authorEmail)!;
    await prisma.announcement.create({
      data: {
        authorId: author.id,
        title: announcement.title,
        body: announcement.body,
        pinned: announcement.pinned,
        audience: announcement.audience,
        departmentId:
          announcement.audience === "DEPARTMENT" && "department" in announcement
            ? (departmentByName.get(announcement.department as string) ?? null)
            : null,
        publishedAt: addDays(TODAY, -announcement.daysAgo),
      },
    });
  }

  // --- Notifications ------------------------------------------------------
  console.log("→ Notifications…");
  const admin = userByEmail.get("anil.gupta@poojamachines.co.in")!;
  const manager = userByEmail.get("harpreet.singh@poojamachines.co.in")!;

  const pendingForManager = await prisma.leaveRequest.findMany({
    where: { status: "PENDING" },
    take: 6,
    select: { id: true, user: { select: { id: true, name: true, managerId: true } }, days: true, type: true },
  });

  for (const request of pendingForManager) {
    const recipient = request.user.managerId ?? admin.id;
    await prisma.notification.create({
      data: {
        userId: recipient,
        actorId: request.user.id,
        type: "LEAVE_SUBMITTED",
        title: `${request.user.name} requested ${request.days} day(s) of ${request.type.toLowerCase()} leave`,
        body: "Waiting for your decision.",
        href: "/leave/approvals",
        createdAt: addDays(TODAY, -Math.floor(random() * 4)),
      },
    });
  }

  // A couple of reviewed-report notifications so employees see something too.
  const reviewedSample = await prisma.dailyStatusReport.findMany({
    where: { status: "REVIEWED", reviewedById: { not: null } },
    take: 8,
    orderBy: { date: "desc" },
    select: { id: true, userId: true, reviewedById: true, date: true },
  });

  for (const report of reviewedSample) {
    await prisma.notification.create({
      data: {
        userId: report.userId,
        actorId: report.reviewedById,
        type: "DSR_REVIEWED",
        title: "Your status report was reviewed",
        body: null,
        href: `/dsr/${report.id}`,
        readAt: chance(0.5) ? addDays(TODAY, -1) : null,
        createdAt: addDays(report.date, 1),
      },
    });
  }

  // --- Audit trail --------------------------------------------------------
  console.log("→ Audit log…");
  const auditSeed = [
    { actorId: admin.id, action: "auth.login", entity: "user", entityId: admin.id, daysAgo: 0 },
    { actorId: admin.id, action: "employee.create", entity: "user", entityId: userByEmail.get("gopal.nair@poojamachines.co.in")!.id, daysAgo: 90 },
    { actorId: admin.id, action: "holiday.create", entity: "holiday", entityId: null, daysAgo: 6 },
    { actorId: admin.id, action: "announcement.create", entity: "announcement", entityId: null, daysAgo: 12 },
    { actorId: manager.id, action: "dsr.bulk_review", entity: "dsr", entityId: null, daysAgo: 1 },
    { actorId: manager.id, action: "leave.approve", entity: "leave", entityId: null, daysAgo: 3 },
    { actorId: admin.id, action: "export.download", entity: "dsr", entityId: null, daysAgo: 2 },
    { actorId: admin.id, action: "settings.update", entity: "user", entityId: admin.id, daysAgo: 8 },
    { actorId: admin.id, action: "expense.approve", entity: "expense", entityId: null, daysAgo: 14 },
    { actorId: admin.id, action: "expense.reimburse", entity: "expense", entityId: null, daysAgo: 38 },
    { actorId: admin.id, action: "expense.reject", entity: "expense", entityId: null, daysAgo: 41 },
  ];

  for (const entry of auditSeed) {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        meta: JSON.stringify({ seeded: true }),
        ip: "203.0.113.42",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0",
        createdAt: addDays(TODAY, -entry.daysAgo),
      },
    });
  }

  // --- Expense claims -----------------------------------------------------
  console.log("→ Expense claims…");

  // Oldest first, so the EXP-nnnn sequence runs in the same order a real ledger
  // would have grown. `nextClaimNumber()` reads the newest row, so inserting out
  // of order would produce numbers that don't match the dates.
  const expenseOrder = [...EXPENSES].sort((a, b) => b.daysAgo - a.daysAgo);

  let claimSequence = 0;
  const claimIdsByStatus = new Map<string, string[]>();

  for (const claim of expenseOrder) {
    const claimant = userByEmail.get(claim.claimantEmail);
    if (!claimant) continue;

    claimSequence += 1;
    const filedAt = addDays(TODAY, -claim.daysAgo);
    const decided = ["APPROVED", "REJECTED", "REIMBURSED"].includes(claim.status);

    // A claim is submitted the same day or the next; decided a day or two later;
    // paid out roughly a fortnight after that. Enough spread that the timeline on
    // the detail page has something to show.
    const submittedAt = claim.status === "DRAFT" ? null : atHour(filedAt, 18, 20);
    const decidedAt = decided ? atHour(addDays(filedAt, 1 + Math.floor(random() * 2)), 11) : null;
    const reimbursedAt =
      claim.status === "REIMBURSED" ? atHour(addDays(decidedAt!, 12), 16) : null;

    const created = await prisma.expenseClaim.create({
      data: {
        claimNumber: `EXP-${String(claimSequence).padStart(4, "0")}`,
        userId: claimant.id,
        title: claim.title,
        description: claim.description,
        category: claim.category,
        // Rupees in the fixture, paise in the column.
        amountMinor: claim.amount * 100,
        currency: "INR",
        expenseDate: filedAt,
        vendor: claim.vendor ?? null,
        referenceNo: claim.referenceNo ?? null,
        status: claim.status,
        submittedAt,
        decidedById: decided || claim.status === "CANCELLED" ? admin.id : null,
        decidedAt: claim.status === "CANCELLED" ? atHour(addDays(filedAt, 1), 10) : decidedAt,
        decisionNote: claim.decisionNote ?? null,
        reimbursedAt,
        createdAt: atHour(filedAt, 18),
      },
      select: { id: true, claimNumber: true },
    });

    claimIdsByStatus.set(claim.status, [
      ...(claimIdsByStatus.get(claim.status) ?? []),
      created.id,
    ]);

    for (const comment of claim.comments ?? []) {
      await prisma.expenseComment.create({
        data: {
          claimId: created.id,
          authorId: comment.fromAdmin ? admin.id : claimant.id,
          body: comment.body,
          createdAt: atHour(addDays(filedAt, comment.daysAfter), comment.fromAdmin ? 11 : 15),
        },
      });
    }

    // Notify the side that didn't act, exactly as the actions do. Only for claims
    // recent enough that a notification would still be in the tray.
    if (claim.daysAgo <= 21) {
      if (claim.status === "SUBMITTED") {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            actorId: claimant.id,
            type: "EXPENSE_SUBMITTED",
            title: `${claimant.name} claimed ₹${claim.amount.toLocaleString("en-IN")} — ${created.claimNumber}`,
            body: claim.title,
            href: `/expenses/${created.id}`,
            createdAt: submittedAt ?? atHour(filedAt, 18),
          },
        });
      } else if (decided) {
        await prisma.notification.create({
          data: {
            userId: claimant.id,
            actorId: admin.id,
            type: claim.status === "REJECTED" ? "EXPENSE_REJECTED" : "EXPENSE_APPROVED",
            title: `${created.claimNumber} was ${claim.status === "REJECTED" ? "declined" : "approved"}`,
            body: claim.decisionNote ?? claim.title,
            readAt: chance(0.4) ? addDays(TODAY, -1) : null,
            href: `/expenses/${created.id}`,
            createdAt: decidedAt ?? atHour(filedAt, 18),
          },
        });
      }
    }
  }

  // --- Tasks ---------------------------------------------------------------
  console.log("→ Tasks…");

  const slugOf = (value: string) =>
    value
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const categoryByName = new Map<string, string>();
  for (const category of TASK_CATEGORIES) {
    const created = await prisma.taskCategory.create({
      data: {
        name: category.name,
        slug: slugOf(category.name),
        description: category.description,
        color: category.color,
      },
    });
    categoryByName.set(category.name, created.id);
  }

  const tagByName = new Map<string, string>();
  for (const tag of DEFAULT_TASK_TAGS) {
    const created = await prisma.taskTag.create({
      data: { name: tag.name, slug: slugOf(tag.name), color: tag.color },
    });
    tagByName.set(tag.name, created.id);
  }

  /**
   * Oldest due-date first, so the TSK-nnnn sequence grows the way a real ledger
   * would. `nextTaskNumber()` reads the newest row, so inserting out of order
   * would produce numbers that do not match the dates.
   */
  const taskOrder = [...TASKS].sort(
    (a, b) => (a.dueInDays ?? 9999) - (b.dueInDays ?? 9999),
  );

  const taskIdByTitle = new Map<string, string>();
  let taskSequence = 0;

  for (const task of taskOrder) {
    const assignees = task.assigneeEmails
      .map((email) => userByEmail.get(email))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    if (assignees.length === 0) continue;

    taskSequence += 1;
    const dueOn = task.dueInDays === null ? null : addDays(TODAY, task.dueInDays);
    const createdAt = addDays(TODAY, Math.min(-2, (task.dueInDays ?? 0) - 6));

    // Progress follows the checklist where there is one, exactly as the app does.
    const checklist = task.checklist ?? [];
    const derived =
      checklist.length > 0
        ? Math.round((checklist.filter((item) => item.done).length / checklist.length) * 100)
        : (task.progressPercent ?? (task.status === "COMPLETED" ? 100 : 0));

    const created = await prisma.task.create({
      data: {
        taskNumber: `TSK-${String(taskSequence).padStart(4, "0")}`,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        categoryId: categoryByName.get(task.category) ?? null,
        dueOn,
        deadlineAt:
          dueOn && task.deadlineHour !== undefined
            ? atHour(dueOn, task.deadlineHour - 5, 30)
            : null,
        estimateMinutes: task.estimateHours ? Math.round(task.estimateHours * 60) : null,
        progressPercent: task.status === "COMPLETED" ? 100 : derived,
        blockedReason: task.blockedReason ?? null,
        startedAt:
          task.status === "TODO" ? null : atHour(addDays(createdAt, 1), 9, 30),
        completedAt:
          task.status === "COMPLETED" ? atHour(addDays(dueOn ?? TODAY, -1), 16) : null,
        recurrence: task.recurrence ?? "NONE",
        recurrenceEvery: task.recurrenceEvery ?? 1,
        lastSpawnedFor: task.recurrence && task.recurrence !== "NONE" ? dueOn : null,
        createdById: admin.id,
        createdAt,
        assignees: {
          create: assignees.map((person, index) => ({
            userId: person.id,
            assignedById: admin.id,
            assignedAt: createdAt,
            // Most people have opened their work; one or two have not, so the
            // "unseen" indicator has something to show.
            seenAt: index === 0 && chance(0.8) ? addDays(createdAt, 1) : null,
          })),
        },
        tagLinks: task.tags?.length
          ? {
              create: task.tags
                .map((name) => tagByName.get(name))
                .filter((id): id is string => Boolean(id))
                .map((tagId) => ({ tagId })),
            }
          : undefined,
      },
      select: { id: true, taskNumber: true },
    });

    taskIdByTitle.set(task.title, created.id);

    // Timeline: created, then assigned, matching what the actions record.
    await prisma.taskActivity.createMany({
      data: [
        {
          taskId: created.id,
          actorId: admin.id,
          kind: "created",
          meta: JSON.stringify({
            priority: task.priority,
            status: "TODO",
            assignees: assignees.map((person) => person.name),
            dueOn: dueOn ? dayKey(dueOn) : null,
          }),
          createdAt,
        },
        {
          taskId: created.id,
          actorId: admin.id,
          kind: "assigned",
          meta: JSON.stringify({ to: assignees.map((person) => person.name) }),
          createdAt: addDays(createdAt, 0),
        },
      ],
    });

    if (checklist.length > 0) {
      for (const [index, item] of checklist.entries()) {
        await prisma.taskChecklistItem.create({
          data: {
            taskId: created.id,
            label: item.label,
            done: item.done,
            position: index,
            doneAt: item.done ? addDays(createdAt, 2) : null,
            doneById: item.done ? assignees[0]!.id : null,
            createdAt,
          },
        });
      }
      await prisma.taskActivity.create({
        data: {
          taskId: created.id,
          actorId: admin.id,
          kind: "checklist_added",
          meta: JSON.stringify({ count: checklist.length }),
          createdAt: addDays(createdAt, 0),
        },
      });
    }

    for (const update of task.updates ?? []) {
      const author = userByEmail.get(update.authorEmail);
      if (!author) continue;

      const postedAt = atHour(addDays(TODAY, -update.daysAgo), 15, 20);
      const mentionIds = (update.mentionEmails ?? [])
        .map((email) => userByEmail.get(email)?.id)
        .filter((id): id is string => Boolean(id));

      const posted = await prisma.taskUpdate.create({
        data: {
          taskId: created.id,
          authorId: author.id,
          body: update.body,
          progressPercent: update.progressPercent ?? null,
          createdAt: postedAt,
          mentions: mentionIds.length
            ? { create: mentionIds.map((userId) => ({ userId, createdAt: postedAt })) }
            : undefined,
        },
        select: { id: true },
      });

      await prisma.taskActivity.create({
        data: {
          taskId: created.id,
          actorId: author.id,
          kind: "commented",
          meta: JSON.stringify({ updateId: posted.id, mentions: mentionIds.length }),
          comment: update.body.slice(0, 280),
          createdAt: postedAt,
        },
      });

      if (update.progressPercent !== undefined) {
        await prisma.taskActivity.create({
          data: {
            taskId: created.id,
            actorId: author.id,
            kind: "progress_changed",
            meta: JSON.stringify({ to: update.progressPercent }),
            createdAt: postedAt,
          },
        });
      }

      for (const reply of update.replies ?? []) {
        const replyAuthor = userByEmail.get(reply.authorEmail);
        if (!replyAuthor) continue;
        await prisma.taskUpdate.create({
          data: {
            taskId: created.id,
            authorId: replyAuthor.id,
            body: reply.body,
            parentId: posted.id,
            createdAt: atHour(addDays(TODAY, -reply.daysAgo), 16, 40),
          },
        });
      }

      // Recent mentions land in the tray, so notifications have real content.
      if (update.daysAgo <= 7) {
        for (const userId of mentionIds) {
          await prisma.notification.create({
            data: {
              userId,
              actorId: author.id,
              type: "TASK_MENTION",
              title: `${author.name} mentioned you on ${created.taskNumber}`,
              body: update.body.slice(0, 200),
              href: `/tasks/${created.id}`,
              readAt: chance(0.4) ? addDays(TODAY, -1) : null,
              createdAt: postedAt,
            },
          });
        }
      }
    }

    // Closing entries for finished work.
    if (task.status === "COMPLETED") {
      await prisma.taskActivity.create({
        data: {
          taskId: created.id,
          actorId: assignees[0]!.id,
          kind: "completed",
          meta: JSON.stringify({ from: "IN_PROGRESS", to: "COMPLETED" }),
          createdAt: atHour(addDays(dueOn ?? TODAY, -1), 16),
        },
      });
    }
    if (task.status === "BLOCKED") {
      await prisma.taskActivity.create({
        data: {
          taskId: created.id,
          actorId: assignees[0]!.id,
          kind: "blocked",
          meta: JSON.stringify({ from: "IN_PROGRESS", to: "BLOCKED" }),
          comment: task.blockedReason ?? null,
          createdAt: addDays(TODAY, -2),
        },
      });
    }

    // Assignment notifications for anything recent enough to still be in the tray.
    if ((task.dueInDays ?? 0) >= -7) {
      for (const person of assignees) {
        await prisma.notification.create({
          data: {
            userId: person.id,
            actorId: admin.id,
            type: "TASK_ASSIGNED",
            title: `${admin.name} assigned you ${created.taskNumber}`,
            body: task.title,
            href: `/tasks/${created.id}`,
            readAt: chance(0.6) ? addDays(TODAY, -1) : null,
            createdAt,
          },
        });
      }
    }
  }

  // Dependencies, once every task has an id.
  for (const task of TASKS) {
    if (!task.waitsOn) continue;
    const dependentId = taskIdByTitle.get(task.title);
    const blockerId = taskIdByTitle.get(task.waitsOn);
    if (!dependentId || !blockerId) continue;

    await prisma.taskDependency.create({ data: { dependentId, blockerId } });
    await prisma.taskActivity.create({
      data: {
        taskId: dependentId,
        actorId: admin.id,
        kind: "dependency_added",
        meta: JSON.stringify({ blocker: task.waitsOn }),
        createdAt: addDays(TODAY, -3),
      },
    });
  }

  // --- Customer orders -----------------------------------------------------
  console.log("→ Orders…");

  /** Working days back from today, so seeded durations mean what they say. */
  const workingDaysAgo = (days: number) => {
    let cursor = TODAY;
    let stepped = 0;
    let guard = 0;
    while (stepped < days && guard < 400) {
      cursor = addDays(cursor, -1);
      guard += 1;
      if (!isWeekend(cursor)) stepped += 1;
    }
    return cursor;
  };

  let orderSequence = 0;

  for (const order of ORDERS) {
    orderSequence += 1;
    const promisedOn = addDays(TODAY, order.promisedInDays);

    const created = await prisma.order.create({
      data: {
        orderNumber: `ORD-${String(orderSequence).padStart(4, "0")}`,
        title: order.title,
        customerName: order.customerName,
        customerRef: order.customerRef ?? null,
        description: order.description ?? null,
        product: order.product ?? null,
        quantity: order.quantity ?? null,
        priority: order.priority,
        status: "PENDING",
        promisedOn,
        createdById: admin.id,
        createdAt: workingDaysAgo(
          Math.max(...order.stages.map((s) => s.startedDaysAgo ?? 0), 2) + 2,
        ),
      },
      select: { id: true, orderNumber: true },
    });

    for (const [index, stage] of order.stages.entries()) {
      const person = userByEmail.get(stage.assigneeEmail);
      if (!person) continue;

      taskSequence += 1;
      const startedAt =
        stage.startedDaysAgo === null ? null : atHour(workingDaysAgo(stage.startedDaysAgo), 9, 30);
      const completedAt =
        stage.completedDaysAgo === null
          ? null
          : atHour(workingDaysAgo(stage.completedDaysAgo), 16, 45);

      await prisma.task.create({
        data: {
          taskNumber: `TSK-${String(taskSequence).padStart(4, "0")}`,
          title: stage.name,
          description: `Stage ${index + 1} of ${created.orderNumber} — ${order.title}. ${
            stage.allottedDays
          } working day${stage.allottedDays === 1 ? "" : "s"} allotted.`,
          priority: order.priority,
          status: stage.status,
          orderId: created.id,
          orderPosition: index + 1,
          allottedDays: stage.allottedDays,
          startedAt,
          completedAt,
          progressPercent:
            stage.status === "COMPLETED" ? 100 : (stage.progressPercent ?? 0),
          blockedReason: stage.blockedReason ?? null,
          createdById: admin.id,
          createdAt: startedAt ?? workingDaysAgo(2),
          assignees: {
            create: { userId: person.id, assignedById: admin.id, seenAt: startedAt },
          },
        },
      });
    }

    await prisma.orderActivity.create({
      data: {
        orderId: created.id,
        actorId: admin.id,
        kind: "created",
        meta: JSON.stringify({
          stages: order.stages.length,
          totalAllotted: order.stages.reduce((sum, s) => sum + s.allottedDays, 0),
          promisedOn: dayKey(promisedOn),
          customer: order.customerName,
        }),
        createdAt: workingDaysAgo(
          Math.max(...order.stages.map((s) => s.startedDaysAgo ?? 0), 2) + 2,
        ),
      },
    });

    for (const stage of order.stages) {
      if (stage.startedDaysAgo !== null) {
        await prisma.orderActivity.create({
          data: {
            orderId: created.id,
            actorId: userByEmail.get(stage.assigneeEmail)?.id ?? null,
            kind: "stage_started",
            meta: JSON.stringify({ stage: stage.name }),
            createdAt: atHour(workingDaysAgo(stage.startedDaysAgo), 9, 30),
          },
        });
      }
      if (stage.completedDaysAgo !== null) {
        await prisma.orderActivity.create({
          data: {
            orderId: created.id,
            actorId: userByEmail.get(stage.assigneeEmail)?.id ?? null,
            kind: "stage_completed",
            meta: JSON.stringify({ stage: stage.name }),
            createdAt: atHour(workingDaysAgo(stage.completedDaysAgo), 16, 45),
          },
        });
      }
    }

    for (const note of order.notes ?? []) {
      await prisma.orderActivity.create({
        data: {
          orderId: created.id,
          actorId: userByEmail.get(note.authorEmail)?.id ?? null,
          kind: "note",
          comment: note.body,
          createdAt: atHour(addDays(TODAY, -note.daysAgo), 14, 10),
        },
      });
    }
  }

  /**
   * Forecast every seeded order with the real engine.
   *
   * Deliberately not hand-written statuses: the seed sets the *facts* (when each stage
   * started and finished) and the engine derives AT_RISK, DELAYED and COMPLETED from
   * them. If the seed asserted the statuses itself, a bug in the engine would be hidden
   * by demo data that agreed with it.
   */
  {
    const { projectOrder } = await import("../src/lib/orders/projection");

    const holidayRows = await prisma.holiday.findMany({
      where: { type: { in: ["PUBLIC", "COMPANY"] } },
      select: { date: true },
    });
    const holidaySet = new Set(holidayRows.map((row) => dayKey(row.date)));

    const orders = await prisma.order.findMany({
      select: {
        id: true,
        promisedOn: true,
        startedOn: true,
        stages: {
          select: {
            id: true,
            title: true,
            orderPosition: true,
            allottedDays: true,
            status: true,
            startedAt: true,
            completedAt: true,
            progressPercent: true,
            assignees: { select: { user: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    for (const order of orders) {
      const projection = projectOrder(
        { promisedOn: order.promisedOn, startedOn: order.startedOn },
        order.stages.map((stage) => ({
          id: stage.id,
          name: stage.title,
          position: stage.orderPosition ?? 0,
          allottedDays: stage.allottedDays,
          // Cast at the boundary: the column is a String, the engine wants the union.
          status: stage.status as never,
          startedAt: stage.startedAt,
          completedAt: stage.completedAt,
          progressPercent: stage.progressPercent,
          assignees: stage.assignees.map((entry) => entry.user),
        })),
        { asOf: TODAY, holidays: holidaySet },
      );

      const earliestStart = order.stages
        .map((stage) => stage.startedAt)
        .filter((value) => value !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0];

      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: projection.derivedStatus,
          slipDays: projection.slipDays,
          projectedOn: projection.projectedOn,
          projectedAt: new Date(),
          startedOn: earliestStart ?? null,
          completedOn:
            projection.derivedStatus === "COMPLETED" ? projection.projectedOn : null,
        },
      });
    }
  }

  // --- Summary ------------------------------------------------------------
  const [
    users,
    reports,
    attendance,
    leave,
    notifications,
    claims,
    claimTotal,
    taskCount,
    taskUpdateCount,
    orderCount,
    lateOrders,
  ] = await Promise.all([
      prisma.user.count(),
      prisma.dailyStatusReport.count(),
      prisma.attendance.count(),
      prisma.leaveRequest.count(),
      prisma.notification.count(),
      prisma.expenseClaim.count(),
      prisma.expenseClaim.aggregate({ _sum: { amountMinor: true } }),
      prisma.task.count(),
      prisma.taskUpdate.count(),
      prisma.order.count(),
      prisma.order.count({ where: { status: { in: ["AT_RISK", "DELAYED"] } } }),
    ]);

  console.log(`
✓ Seed complete

  People              ${users}
  Departments         ${DEPARTMENTS.length}   Teams ${[...teamByKey.keys()].length}   Locations ${LOCATIONS.length}
  Status reports      ${reports}
  Attendance records  ${attendance}
  Leave requests      ${leave}
  Orders              ${orderCount}   needing attention ${lateOrders}
  Tasks               ${taskCount}   updates ${taskUpdateCount}
  Expense claims      ${claims}   worth ₹${((claimTotal._sum.amountMinor ?? 0) / 100).toLocaleString("en-IN")}
  Notifications       ${notifications}
  History             ${HISTORY_DAYS} days ending ${dayKey(TODAY)}

  Sign in with any of:
    anil.gupta@poojamachines.co.in      (Admin — General Manager)
    harpreet.singh@poojamachines.co.in  (Manager — Production)
    ramesh.sahu@poojamachines.co.in     (Employee — Senior Fitter)

  Password for every demo account: ${DEMO_PASSWORD}
`);
}

main()
  .catch((error) => {
    console.error("\n✗ Seed failed:\n", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
