"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Monitor, Smartphone, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PasswordStrength } from "@/components/ui/password-strength";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import {
  changePasswordAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
} from "@/server/actions/auth";
import { IDLE } from "@/server/actions/form-state";
import { formatDateTime, formatRelative } from "@/lib/utils/date";

interface SessionRow {
  tokenId: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}

/**
 * Password change and active devices.
 *
 * Session revocation is what makes the "sign out everywhere" button real: each
 * session cookie points at a database row, so revoking takes effect on the next
 * request rather than whenever a token happens to expire.
 */
export function SecuritySection({
  hasPassword,
  googleEnabled,
  currentSessionId,
  sessions,
}: {
  hasPassword: boolean;
  googleEnabled: boolean;
  currentSessionId: string;
  sessions: SessionRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [state, action, pending] = useActionState(changePasswordAction, IDLE);
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (state.ok === true) {
      toast.success("Password updated", state.message);
      setPassword("");
      router.refresh();
    } else if (state.ok === false && state.message && !state.fieldErrors) {
      toast.error("Couldn't change your password", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const revokeAll = async () => {
    const result = await confirm({
      title: "Sign out of all other devices?",
      description: `This device stays signed in. ${
        sessions.length - 1
      } other session${sessions.length - 1 === 1 ? "" : "s"} will end immediately.`,
      confirmLabel: "Sign out everywhere else",
      tone: "danger",
    });
    if (!result.confirmed) return;

    startTransition(async () => {
      const response = await revokeOtherSessionsAction();
      if (response.ok) {
        toast.success(response.message ?? "Done");
        router.refresh();
      } else {
        toast.error("Couldn't sign those devices out", response.message);
      }
    });
  };

  const revokeOne = (tokenId: string) => {
    startTransition(async () => {
      const response = await revokeSessionAction(tokenId);
      if (response.ok) {
        toast.success(response.message ?? "Signed out");
        router.refresh();
      } else {
        toast.error("Couldn't sign that device out", response.message);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-3.5 text-fg-subtle" aria-hidden="true" />
          Security
        </CardTitle>
        <CardDescription>
          {hasPassword
            ? "Change your password, and review where you're signed in."
            : googleEnabled
              ? "You sign in with Google. Use “Forgot password” on the sign-in screen if you'd like to set a password too."
              : "No password is set on this account. Use “Forgot password” on the sign-in screen to create one."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {hasPassword ? (
          <form action={action} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Current password" required error={state.fieldErrors?.currentPassword}>
                  <Input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                    icon={<KeyRound />}
                  />
                </Field>
              </div>

              <Field label="New password" required error={state.fieldErrors?.password}>
                <Input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <PasswordStrength value={password} className="pt-1" />
              </Field>

              <Field label="Confirm new password" required error={state.fieldErrors?.confirmPassword}>
                <Input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3.5">
              <p className="text-[11.5px] text-fg-subtle">
                Changing your password signs out every other device.
              </p>
              <Button type="submit" variant="primary" size="sm" loading={pending}>
                <KeyRound className="size-4" />
                Change password
              </Button>
            </div>
          </form>
        ) : null}

        <div className={hasPassword ? "border-t border-border pt-5" : undefined}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-semibold text-fg">Active devices</h3>
              <p className="mt-0.5 text-[12px] text-fg-muted">
                {sessions.length} signed-in session{sessions.length === 1 ? "" : "s"}
              </p>
            </div>
            {sessions.length > 1 ? (
              <Button variant="secondary" size="sm" onClick={revokeAll} loading={isPending}>
                <LogOut className="size-4" />
                Sign out everywhere else
              </Button>
            ) : null}
          </div>

          <ul className="divide-y divide-border rounded-lg border border-border">
            {sessions.map((session) => {
              const isCurrent = session.tokenId === currentSessionId;
              const device = describeUserAgent(session.userAgent);

              return (
                <li
                  key={session.tokenId}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-3",
                    isCurrent && "bg-accent-soft/40",
                  )}
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-muted text-fg-subtle"
                    aria-hidden="true"
                  >
                    {device.isMobile ? (
                      <Smartphone className="size-4" />
                    ) : (
                      <Monitor className="size-4" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-medium text-fg">
                      {device.label}
                      {isCurrent ? (
                        <Badge tone="accent" size="sm">
                          This device
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-fg-subtle">
                      Last active {formatRelative(session.lastSeenAt)}
                      {session.ip ? ` · ${session.ip}` : ""}
                      {" · signed in "}
                      <time dateTime={session.createdAt.toISOString()}>
                        {formatDateTime(session.createdAt)}
                      </time>
                    </p>
                  </div>

                  {!isCurrent ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => revokeOne(session.tokenId)}
                      disabled={isPending}
                    >
                      Sign out
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Turns a user-agent string into something a person can recognise.
 *
 * Deliberately crude: exact UA parsing needs a large, constantly-stale database,
 * and the only question this answers is "is this the laptop or the phone I'm
 * holding?".
 */
function describeUserAgent(userAgent: string | null): { label: string; isMobile: boolean } {
  if (!userAgent) return { label: "Unknown device", isMobile: false };

  const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);

  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : "Browser";

  const platform =
    /Windows/i.test(userAgent) ? "Windows"
    : /Macintosh|Mac OS/i.test(userAgent) ? "macOS"
    : /iPhone|iPad/i.test(userAgent) ? "iOS"
    : /Android/i.test(userAgent) ? "Android"
    : /Linux/i.test(userAgent) ? "Linux"
    : "";

  return { label: platform ? `${browser} on ${platform}` : browser, isMobile };
}
