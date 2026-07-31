import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { denialReason } from "@/lib/auth/rbac";
import { ROLE_LABEL } from "@/lib/constants/enums";

export const metadata: Metadata = { title: "Access restricted" };

/**
 * 403 page.
 *
 * Distinct from 404 on purpose: telling a signed-in user "you don't have access"
 * is more useful than pretending the page doesn't exist, and it names the role
 * that would be required so they know who to ask.
 */
export default async function ForbiddenPage() {
  const user = await getCurrentUser();

  return (
    <div className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="relative mx-auto mb-5 w-fit">
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-3 rounded-full bg-warning-soft blur-xl"
          />
          <div className="relative grid size-12 place-items-center rounded-2xl border border-border bg-surface text-warning shadow-sm">
            <ShieldAlert className="size-5" />
          </div>
        </div>

        <h1 className="text-lg font-semibold text-fg">Access restricted</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-5 text-fg-muted">
          {user ? denialReason(user) : "Please sign in to continue."}
        </p>

        {user ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="text-[12.5px] text-fg-subtle">Signed in as</span>
            <Badge tone="neutral" variant="outline">
              {user.name} · {ROLE_LABEL[user.role]}
            </Badge>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <ButtonLink variant="primary" href="/dashboard">
            Back to dashboard
          </ButtonLink>
          {user ? (
            <ButtonLink variant="secondary" href="/dsr">
              My reports
            </ButtonLink>
          ) : (
            <ButtonLink variant="secondary" href="/login">
              Sign in
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}
