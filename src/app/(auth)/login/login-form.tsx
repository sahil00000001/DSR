"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signInAction } from "@/server/actions/auth";
import { IDLE } from "@/server/actions/form-state";

/**
 * Sign-in form.
 *
 * Uses `useActionState`, so it works before hydration: the browser posts the form
 * natively, the server action runs, and errors come back rendered. JavaScript only
 * upgrades it with a pending state and the password reveal toggle.
 */
export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const [state, action, pending] = useActionState(signInAction, IDLE);
  const [showPassword, setShowPassword] = useState(false);
  const [dismissedInitial, setDismissedInitial] = useState(false);

  // The OAuth error is stale once the user submits their own attempt.
  useEffect(() => {
    if (pending) setDismissedInitial(true);
  }, [pending]);

  const error = state.ok === false ? state.message : dismissedInitial ? undefined : initialError;

  return (
    <form action={action} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {error ? (
        <div
          role="alert"
          className="animate-fade-up flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5"
        >
          <AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-[12.5px] leading-[18px] text-danger-text">{error}</p>
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

      <Field label="Password" error={state.fieldErrors?.password}>
        <div className="relative">
          <Input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••"
            icon={<Lock />}
            required
            inputSize="lg"
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            // Not in the tab order: the label already conveys everything, and a
            // stop between password and submit slows every sign-in down.
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <Button type="submit" variant="primary" size="lg" block loading={pending} className="mt-1">
        {pending ? "Signing in…" : "Sign in"}
        {!pending ? <ArrowRight className="size-4" /> : null}
      </Button>
    </form>
  );
}
