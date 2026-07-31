import type { Metadata } from "next";
import Link from "next/link";
import { isGoogleAuthEnabled, env } from "@/lib/env";
import { BRAND } from "@/lib/constants/brand";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { GoogleButton } from "@/app/(auth)/login/google-button";
import { DemoCredentials } from "@/app/(auth)/login/demo-credentials";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${BRAND.name}.`,
};

/** Human-readable copy for the `?error=` codes the OAuth callback can set. */
const OAUTH_ERRORS: Record<string, string> = {
  oauth_denied: "Google sign-in was cancelled.",
  oauth_state: "That sign-in link expired. Please try again.",
  oauth_failed: "We couldn't complete Google sign-in. Try your password instead.",
  oauth_unverified: "That Google account's email address isn't verified.",
  oauth_domain: "That Google account isn't allowed to sign in to this workspace.",
  oauth_no_account:
    `There's no ${BRAND.name} account for that Google address. Ask your administrator to add you.`,
  oauth_disabled: "That account has been disabled. Please contact your administrator.",
  session_expired: "Your session expired. Please sign in again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const oauthError = params.error ? OAUTH_ERRORS[params.error] : undefined;

  // Only ever an internal path — an absolute URL here would be an open redirect.
  const next =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : undefined;

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.02em] text-fg">
          Welcome back
        </h1>
        <p className="mt-1.5 text-[13.5px] text-fg-muted">
          Sign in to pick up where your team left off.
        </p>
      </div>

      {isGoogleAuthEnabled ? (
        <>
          <GoogleButton next={next} />
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium tracking-wider text-fg-subtle uppercase">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <LoginForm next={next} initialError={oauthError} />

      <p className="mt-6 text-center text-[12.5px] text-fg-muted">
        Trouble signing in?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          Reset your password
        </Link>
      </p>

      {env.NEXT_PUBLIC_DEMO_MODE ? <DemoCredentials /> : null}
    </div>
  );
}
