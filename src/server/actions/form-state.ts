/**
 * Shared shape for every `useActionState` server action.
 *
 * `ok: null` is the untouched state, which lets a form distinguish "not
 * submitted yet" from "submitted and succeeded" — without it, forms flash a
 * success or error state on first render.
 */
export interface FormState {
  ok: boolean | null;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Arbitrary payload a form may need after success (e.g. a created id). */
  data?: Record<string, unknown>;
}

export const IDLE: FormState = { ok: null };

export function formError(message: string, fieldErrors?: Record<string, string>): FormState {
  return { ok: false, message, fieldErrors };
}

export function formSuccess(message?: string, data?: Record<string, unknown>): FormState {
  return { ok: true, message, data };
}
