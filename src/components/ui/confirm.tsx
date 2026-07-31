"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils/cn";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  /** Collects a free-text note (leave rejection reason, flag comment). */
  prompt?: {
    label: string;
    placeholder?: string;
    required?: boolean;
    hint?: string;
  };
}

export interface ConfirmResult {
  confirmed: boolean;
  note?: string;
}

type Resolver = (result: ConfirmResult) => void;

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<ConfirmResult>) | null>(
  null,
);

/**
 * Promise-based confirmation dialog.
 *
 * Turns a destructive action into one readable line at the call site:
 *
 *   const { confirmed, note } = await confirm({
 *     title: "Reject this request?",
 *     tone: "danger",
 *     prompt: { label: "Reason", required: true },
 *   });
 *   if (!confirmed) return;
 *
 * A single dialog instance is shared by the whole app, so no screen has to
 * manage open/close state for its own confirmations.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    setNote("");
    setError(null);
    return new Promise<ConfirmResult>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: ConfirmResult) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
    setNote("");
    setError(null);
  }, []);

  const onConfirm = () => {
    if (options?.prompt?.required && !note.trim()) {
      setError(`${options.prompt.label} is required.`);
      return;
    }
    settle({ confirmed: true, note: note.trim() || undefined });
  };

  const tone = options?.tone ?? "default";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <Dialog
        open={Boolean(options)}
        onClose={() => settle({ confirmed: false })}
        size="sm"
        title={
          <span className="flex items-center gap-2.5">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full",
                tone === "danger" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent",
              )}
              aria-hidden="true"
            >
              {tone === "danger" ? (
                <Trash2 className="size-4" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
            </span>
            {options?.title}
          </span>
        }
        description={options?.description}
        footer={
          <>
            <Button variant="secondary" onClick={() => settle({ confirmed: false })} className="sm:w-auto">
              {options?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              onClick={onConfirm}
              data-autofocus={options?.prompt ? undefined : ""}
              className="sm:w-auto"
            >
              {options?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        {options?.prompt ? (
          <Field
            label={options.prompt.label}
            error={error}
            hint={options.prompt.hint}
            optional={!options.prompt.required}
          >
            <Textarea
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                if (error) setError(null);
              }}
              placeholder={options.prompt.placeholder}
              rows={3}
              data-autofocus=""
            />
          </Field>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>.");
  }
  return context;
}
