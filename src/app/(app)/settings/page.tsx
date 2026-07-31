import type { Metadata } from "next";
import { CalendarDays, Mail, MapPin, ShieldCheck, User } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser, listSessions } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { isGoogleAuthEnabled, isSmtpEnabled } from "@/lib/env";
import { ROLE_LABEL } from "@/lib/constants/enums";
import { today } from "@/lib/utils/date";
import { ProfileSection } from "@/components/settings/profile-section";
import { SecuritySection } from "@/components/settings/security-section";
import { PreferencesSection } from "@/components/settings/preferences-section";
import { OrganisationSection } from "@/components/settings/organisation-section";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your profile, security and notification preferences.",
};

export default async function SettingsPage() {
  const user = await requireUser();
  const isAdmin = can.manageSettings(user);

  const [profile, sessions, holidays, locations] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        name: true,
        phone: true,
        designation: true,
        bio: true,
        dateOfBirth: true,
        theme: true,
        notifyByEmail: true,
        dsrReminderOptOut: true,
        passwordHash: true,
      },
    }),
    listSessions(user.id),
    isAdmin
      ? prisma.holiday.findMany({
          where: { date: { gte: new Date(Date.UTC(today().getUTCFullYear(), 0, 1)) } },
          orderBy: { date: "asc" },
          select: {
            id: true,
            name: true,
            date: true,
            type: true,
            location: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.location.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true, code: true, city: true, country: true, timezone: true, _count: { select: { members: true } } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your details, how you sign in, and what reaches your inbox."
        meta={
          <>
            <Badge tone={user.role === "ADMIN" ? "accent" : "neutral"} variant="outline">
              <ShieldCheck className="size-3" aria-hidden="true" />
              {ROLE_LABEL[user.role]}
            </Badge>
            <Badge tone="neutral" variant="outline">
              {user.employeeCode}
            </Badge>
            {user.emailVerified ? (
              <Badge tone="success" size="sm" dot>
                Email verified
              </Badge>
            ) : (
              <Badge tone="warning" size="sm" dot>
                Email not verified
              </Badge>
            )}
          </>
        }
      />

      <div className="max-w-3xl space-y-5">
        {/* Read-only organisational facts — changed by an admin, not here. */}
        <Card>
          <CardHeader>
            <CardTitle>Your placement</CardTitle>
            <CardDescription>
              Department, team and reporting line are managed by an admin. Ask them if something
              here is wrong.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact icon={<Mail />} label="Work email" value={user.email} />
              <Fact icon={<User />} label="Department" value={user.departmentName ?? "Unassigned"} />
              <Fact icon={<User />} label="Team" value={user.teamName ?? "Unassigned"} />
              <Fact icon={<MapPin />} label="Location" value={user.locationName ?? "Unassigned"} />
            </dl>
          </CardContent>
        </Card>

        <ProfileSection
          defaults={{
            name: profile.name,
            phone: profile.phone,
            designation: profile.designation,
            bio: profile.bio,
            dateOfBirth: profile.dateOfBirth,
          }}
        />

        <PreferencesSection
          defaults={{
            theme: profile.theme,
            notifyByEmail: profile.notifyByEmail,
            dsrReminderOptOut: profile.dsrReminderOptOut,
          }}
          emailEnabled={isSmtpEnabled}
        />

        <SecuritySection
          hasPassword={Boolean(profile.passwordHash)}
          googleEnabled={isGoogleAuthEnabled}
          currentSessionId={user.sessionId}
          sessions={sessions.map((session) => ({
            tokenId: session.tokenId,
            userAgent: session.userAgent,
            ip: session.ip,
            createdAt: session.createdAt,
            lastSeenAt: session.lastSeenAt,
          }))}
        />

        {isAdmin ? (
          <OrganisationSection
            holidays={holidays.map((holiday) => ({
              id: holiday.id,
              name: holiday.name,
              date: holiday.date,
              type: holiday.type,
              locationName: holiday.location?.name ?? null,
            }))}
            locations={locations.map((location) => ({
              id: location.id,
              name: location.name,
              code: location.code,
              city: location.city,
              country: location.country,
              timezone: location.timezone,
              memberCount: location._count.members,
            }))}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-3.5 text-fg-subtle" aria-hidden="true" />
              About this workspace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[12.5px] text-fg-muted">
            <p>
              Email delivery is{" "}
              <span className={isSmtpEnabled ? "font-medium text-success-text" : "font-medium text-warning-text"}>
                {isSmtpEnabled ? "configured" : "not configured"}
              </span>
              {isSmtpEnabled
                ? " — notifications are sent by email as well as in-app."
                : " — notifications are in-app only, and outgoing messages are written to the server log."}
            </p>
            <p>
              Google sign-in is{" "}
              <span className={isGoogleAuthEnabled ? "font-medium text-success-text" : "font-medium text-fg-muted"}>
                {isGoogleAuthEnabled ? "enabled" : "disabled"}
              </span>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="mb-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
        <span className="[&>svg]:size-3" aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="text-[13px] text-fg">{value}</dd>
    </div>
  );
}
