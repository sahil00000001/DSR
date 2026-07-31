"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { resetPasswordAction } from "@/server/actions/auth";
import { IDLE } from "@/server/actions/form-state";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, IDLE);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);

  if (state.ok === true) {
    return (
      <div className="animate-fade-up rounded-xl border border-border bg-surface p-5 text-center shadow-sm">
        <div className="relative mx-auto mb-4 w-fit">
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-2.5 rounded-full bg-success-soft blur-lg"
          />
          <div className="relative grid size-11 place-items-center rounded-2xl border border-border bg-surface text-success shadow-xs">
            <CheckCircle2 className="size-5" />
          </div>
        </div>

        <h2 className="text-[15px] font-semibold text-fg">Password updated</h2>
        <p className="mx-auto mt-1.5 max-w-[19rem] text-[13px] leading-5 text-fg-muted">
          {state.message}
        </p>

        <Link
          href="/login"
          className="mt-5 inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-fg shadow-xs transition-colors hover:bg-accent-hover"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

      {state.ok === false && state.message ? (
        <div
          role="alert"
          className="animate-fade-up flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5"
        >
          <AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-[12.5px] leading-[18px] text-danger-text">{state.message}</p>
        </div>
      ) : null}

      <Field label="New password" error={state.fieldErrors?.password}>
        <div className="relative">
          <Input
            name="password"
            type={visible ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            icon={<Lock />}
            required
            autoFocus
            inputSize="lg"
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            tabIndex={-1}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <PasswordStrength value={password} className="pt-1" />
      </Field>

      <Field label="Confirm new password" error={state.fieldErrors?.confirmPassword}>
        <Input
          name="confirmPassword"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Type it once more"
          icon={<Lock />}
          required
          inputSize="lg"
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" block loading={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
