"use client";

import { createContext, useContext, useId } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Wires a label, hint and error message to a control with the right `id`,
 * `aria-describedby` and `aria-invalid` — so every form in the product is
 * accessible by construction rather than by remembering to add attributes.
 *
 * Usage:
 *   <Field label="Hours worked" error={errors.hours} hint="Between 0 and 24">
 *     <Input name="hours" />
 *   </Field>
 */
export function Field({
  label,
  hint,
  error,
  required,
  optional,
  className,
  children,
  htmlFor,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Override when wrapping a control that owns its own id. */
  htmlFor?: string;
}) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cn("space-y-1.5", className)}>
        {label ? (
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={id}>
              {label}
              {required ? (
                <span className="ml-0.5 text-danger" aria-hidden="true">
                  *
                </span>
              ) : null}
            </Label>
            {optional ? <span className="text-[11px] text-fg-subtle">Optional</span> : null}
          </div>
        ) : null}

        {children}

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="flex items-start gap-1.5 text-[12.5px] leading-4 text-danger-text animate-fade-in"
          >
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : hint ? (
          <p id={hintId} className="text-[12.5px] leading-4 text-fg-subtle">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

/** Consumed by controls to inherit the surrounding Field's a11y wiring. */
export function useField() {
  return useContext(FieldContext);
}

export function Label({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<"label">) {
  return (
    <label className={cn("block text-[13px] font-medium text-fg", className)} {...props}>
      {children}
    </label>
  );
}

/** Groups related controls with an accessible group label. */
export function Fieldset({
  legend,
  description,
  className,
  children,
}: {
  legend: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className={cn("space-y-3", className)}>
      <legend className="text-[13px] font-medium text-fg">{legend}</legend>
      {description ? <p className="text-[12.5px] text-fg-subtle">{description}</p> : null}
      {children}
    </fieldset>
  );
}
