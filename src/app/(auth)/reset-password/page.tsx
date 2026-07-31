import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound, LinkIcon } from "lucide-react";
import { peekToken } from "@/lib/auth/tokens";
import { ResetPasswordForm } from "@/app/(auth)/reset-password/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

const FAILURE_COPY = {
  invalid: {
    title: "This link isn't valid",
    body: "It may have been copied incorrectly. Request a fresh reset link to continue.",
  },
  expired: {
    title: "This link has expired",
    body: "Reset links are valid for one hour. Request a new one and it'll arrive in a moment.",
  },
  used: {
    title: "This link has already been used",
    body: "Each reset link works once. If you still need to change your password, request another.",
  },
} as const;

/**
 * The token is validated *without consuming it* before the form renders, so an
 * expired link shows a clear explanation rather than letting someone type a new
 * password and only then discover it failed.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await peekToken(token, "PASSWORD_RESET") : { ok: false as const, reason: "invalid" as const };

  if (!result.ok) {
    const copy = FAILURE_COPY[result.reason];

    return (
      <div className="text-center">
        <div className="relative mx-auto mb-4 w-fit">
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-2.5 rounded-full bg-warning-soft blur-lg"
          />
          <div className="relative grid size-11 place-items-center rounded-2xl border border-border bg-surface text-warning shadow-xs">
            <LinkIcon className="size-5" />
          </div>
        </div>

        <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-fg">{copy.title}</h1>
        <p className="mx-auto mt-2 max-w-[20rem] text-[13.5px] leading-5 text-fg-muted">
          {copy.body}
        </p>

        <div className="mt-6 flex flex-col items-center gap-2">
          <Link
            href="/forgot-password"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-fg shadow-xs transition-colors hover:bg-accent-hover"
          >
            Request a new link
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <ArrowLeft className="size-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-7">
        <div className="mb-4 grid size-10 place-items-center rounded-xl border border-border bg-surface text-accent shadow-xs">
          <KeyRound className="size-[18px]" />
        </div>
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.02em] text-fg">
          Choose a new password
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-5 text-fg-muted">
          Setting a new password for{" "}
          <span className="font-medium text-fg">{result.identifier}</span>. All other devices will
          be signed out.
        </p>
      </div>

      <ResetPasswordForm token={token!} />
    </div>
  );
}
