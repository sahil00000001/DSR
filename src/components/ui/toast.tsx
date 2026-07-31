"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useMounted } from "@/hooks/use-dom";

export type ToastTone = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. `0` keeps it until dismissed. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends Required<Omit<ToastOptions, "action" | "description">> {
  id: string;
  description?: string;
  action?: ToastOptions["action"];
}

interface ToastContextValue {
  show: (options: ToastOptions) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CONFIG: Record<
  ToastTone,
  { icon: typeof CheckCircle2; iconClass: string; ring: string; defaultDuration: number }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-success",
    ring: "shadow-[0_0_0_1px_var(--border),0_-1px_0_0_var(--success)_inset]",
    defaultDuration: 4000,
  },
  error: {
    icon: XCircle,
    iconClass: "text-danger",
    // Errors stay longer — the user may need to read and act on them.
    ring: "shadow-[0_0_0_1px_var(--border),0_-1px_0_0_var(--danger)_inset]",
    defaultDuration: 7000,
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-warning",
    ring: "shadow-[0_0_0_1px_var(--border),0_-1px_0_0_var(--warning)_inset]",
    defaultDuration: 5500,
  },
  info: {
    icon: Info,
    iconClass: "text-info",
    ring: "shadow-[0_0_0_1px_var(--border),0_-1px_0_0_var(--info)_inset]",
    defaultDuration: 4500,
  },
};

/** Newest-first, capped so a burst of errors can't fill the screen. */
const MAX_VISIBLE = 4;

let counter = 0;
function nextId() {
  counter += 1;
  return `toast-${counter}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const schedule = useCallback(
    (id: string, duration: number) => {
      if (duration <= 0) return;
      const timer = window.setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const show = useCallback(
    ({ title, description, tone = "info", duration, action }: ToastOptions) => {
      const id = nextId();
      const resolved = duration ?? TONE_CONFIG[tone].defaultDuration;

      setToasts((current) => [
        { id, title, description, tone, duration: resolved, action },
        ...current.slice(0, MAX_VISIBLE - 1),
      ]);
      schedule(id, resolved);
      return id;
    },
    [schedule],
  );

  // Clear every pending timer if the provider unmounts (route change, HMR).
  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    },
    [],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      dismiss,
      success: (title, description) => show({ title, description, tone: "success" }),
      error: (title, description) => show({ title, description, tone: "error" }),
      warning: (title, description) => show({ title, description, tone: "warning" }),
      info: (title, description) => show({ title, description, tone: "info" }),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport
        toasts={toasts}
        onDismiss={dismiss}
        onPause={(id) => {
          const timer = timers.current.get(id);
          if (timer) {
            window.clearTimeout(timer);
            timers.current.delete(id);
          }
        }}
        onResume={(id, duration) => {
          if (!timers.current.has(id)) schedule(id, duration);
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>. Add it to the root layout.");
  }
  return context;
}

function ToastViewport({
  toasts,
  onDismiss,
  onPause,
  onResume,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string, duration: number) => void;
}) {
  const mounted = useMounted();
  if (!mounted) return null;

  return createPortal(
    <div
      data-toast-viewport=""
      // `polite` so a toast never interrupts what a screen reader is reading.
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className={cn(
        "pointer-events-none fixed z-[60] flex flex-col gap-2",
        // Mobile: top, full width. Desktop: bottom-right stack.
        "inset-x-3 top-3 sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-4 sm:w-[min(24rem,calc(100vw-2rem))]",
      )}
    >
      {toasts.map((toast) => {
        const { icon: Icon, iconClass } = TONE_CONFIG[toast.tone];
        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-lg",
              "animate-slide-in-right",
            )}
            onMouseEnter={() => onPause(toast.id)}
            onMouseLeave={() => onResume(toast.id, toast.duration)}
            onFocus={() => onPause(toast.id)}
            onBlur={() => onResume(toast.id, toast.duration)}
          >
            <Icon className={cn("mt-px size-4 shrink-0", iconClass)} aria-hidden="true" />

            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-5 font-medium text-fg">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-[12.5px] leading-[18px] text-fg-muted">
                  {toast.description}
                </p>
              ) : null}
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    onDismiss(toast.id);
                  }}
                  className="mt-2 text-[12.5px] font-medium text-accent underline-offset-2 hover:underline"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-m-1 grid size-6 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
