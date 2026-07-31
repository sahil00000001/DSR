"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { useCopyToClipboard } from "@/hooks/use-dom";

/**
 * Seeded sign-in details, shown only while `NEXT_PUBLIC_DEMO_MODE` is on.
 *
 * Clicking an account fills the form rather than signing in directly — reviewers
 * still see the real authentication path, which is the point of showing it.
 */
const ACCOUNTS = [
  {
    role: "Admin",
    tone: "accent" as const,
    email: "anil.gupta@poojamachines.co.in",
    description: "Full access: people, approvals, analytics, audit log",
  },
  {
    role: "Manager",
    tone: "info" as const,
    email: "harpreet.singh@poojamachines.co.in",
    description: "Reviews reports and approves leave for their own team",
  },
  {
    role: "Employee",
    tone: "neutral" as const,
    email: "ramesh.sahu@poojamachines.co.in",
    description: "Submits reports, attendance and leave requests",
  },
];

const PASSWORD = "Pooja@Machines26";

export function DemoCredentials() {
  const [expanded, setExpanded] = useState(true);
  const { copied, copy } = useCopyToClipboard();
  const [filled, setFilled] = useState<string | null>(null);

  /**
   * Writes into the real form fields and dispatches an `input` event so React's
   * onChange handlers see the change — setting `.value` alone doesn't notify React.
   */
  const fill = (email: string) => {
    const form = document.querySelector<HTMLFormElement>("form");
    const emailInput = form?.querySelector<HTMLInputElement>('input[name="email"]');
    const passwordInput = form?.querySelector<HTMLInputElement>('input[name="password"]');
    if (!emailInput || !passwordInput) return;

    for (const [input, value] of [
      [emailInput, email],
      [passwordInput, PASSWORD],
    ] as const) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    setFilled(email);
    passwordInput.focus();
  };

  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-dashed border-border bg-surface-inset">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-hover"
      >
        <Sparkles className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
        <span className="flex-1 text-[12px] font-semibold tracking-wide text-fg-muted uppercase">
          Demo access
        </span>
        <span className="text-[11.5px] text-fg-subtle">{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded ? (
        <div className="border-t border-border px-3.5 py-3">
          <ul className="space-y-1.5">
            {ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => fill(account.email)}
                  className={cn(
                    "group flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all",
                    filled === account.email
                      ? "border-accent bg-accent-soft/60"
                      : "border-transparent hover:border-border hover:bg-surface",
                  )}
                >
                  <Badge tone={account.tone} size="sm" className="mt-px shrink-0">
                    {account.role}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px] text-fg">
                      {account.email}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-fg-subtle">
                      {account.description}
                    </span>
                  </span>
                  {filled === account.email ? (
                    <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
                  ) : (
                    <span className="mt-0.5 text-[10.5px] font-medium text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100">
                      Use
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
            <span className="text-[11.5px] text-fg-subtle">
              Password for all accounts:{" "}
              <code className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-fg">
                {PASSWORD}
              </code>
            </span>
            <button
              type="button"
              onClick={() => void copy(PASSWORD)}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
