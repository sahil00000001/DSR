"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, Mail, MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestPasswordResetAction } from "@/server/actions/auth";
import { IDLE } from "@/server/actions/form-state";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, IDLE);

  // Success replaces the form entirely. The confirmation is intentionally
  // ambiguous about whether the address exists — see requestPasswordResetAction.
  if (state.ok === true) {
    return (
      <div className="animate-fade-up rounded-xl border border-border bg-surface p-5 text-center shadow-sm">
        <div className="relative mx-auto mb-4 w-fit">
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-2.5 rounded-full bg-success-soft blur-lg"
          />
          <div className="relative grid size-11 place-items-center rounded-2xl border border-border bg-surface text-success shadow-xs">
            <MailCheck className="size-5" />
          </div>
        </div>

        <h2 className="text-[15px] font-semibold text-fg">Check your inbox</h2>
        <p className="mx-auto mt-1.5 max-w-[19rem] text-[13px] leading-5 text-fg-muted">
          {state.message}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-fg shadow-xs transition-colors hover:bg-accent-hover"
          >
            Back to sign in
          </Link>
          <p className="text-[11.5px] text-fg-subtle">
            The link is valid for one hour and can be used once.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.ok === false && state.message ? (
        <div
          role="alert"
          className="animate-fade-up flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5"
        >
          <AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-[12.5px] leading-[18px] text-danger-text">{state.message}</p>
        </div>
      ) : null}

      <Field label="Work email" error={state.fieldErrors?.email}>
        <Input
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="you@company.com"
          icon={<Mail />}
          required
          autoFocus
          inputSize="lg"
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" block loading={pending}>
        {pending ? "Sending…" : "Send reset link"}
        {!pending ? <Send className="size-4" /> : null}
      </Button>
    </form>
  );
}
